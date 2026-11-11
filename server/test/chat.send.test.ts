import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { Conversation } from '../src/models/Conversation.js';
import { CHRONOLOGICAL, Message } from '../src/models/Message.js';
import { User } from '../src/models/User.js';
import { titleFromMessage } from '../src/services/chat.js';
import { signedUpAgent } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDb } from './helpers/db.js';
import { createFakeAi } from './helpers/fakeAi.js';

useTestDb();

const fake = createFakeAi();
let app: Express;

beforeAll(async () => {
  app = createApp({ config: testConfig({ AI_CONTEXT_MESSAGES: '4' }), ai: fake.ai });
  await User.init();
});

beforeEach(() => fake.reset());

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

describe('POST /chat/send — new conversation', () => {
  it('AUTH-05: requires a session and never calls the AI without one', async () => {
    const res = await request(app).post('/chat/send').send({ message: 'Hi' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(fake.calls).toHaveLength(0);
  });

  it('CHAT-01: returns 200 with the conversation id and both messages', async () => {
    const { agent } = await signedUpAgent(app);
    fake.replyWith('Happy to help!');

    const res = await agent.post('/chat/send').send({ message: '  How do I reset my password?  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      conversationId: expect.any(String),
      userMessage: {
        id: expect.any(String),
        conversationId: res.body.conversationId,
        role: 'user',
        content: 'How do I reset my password?',
        createdAt: ISO,
      },
      assistantMessage: {
        id: expect.any(String),
        conversationId: res.body.conversationId,
        role: 'assistant',
        content: 'Happy to help!',
        createdAt: ISO,
      },
    });
  });

  it('CHAT-01: a new conversation sends no history to the AI, only the trimmed message', async () => {
    const { agent } = await signedUpAgent(app);
    await agent.post('/chat/send').send({ message: '  Hello  ' }).expect(200);

    expect(fake.calls).toEqual([{ history: [], message: 'Hello' }]);
  });

  it('CHAT-06: creates a conversation owned by the user, titled from the first message', async () => {
    const { agent, user } = await signedUpAgent(app);
    const message = 'My   order\nhas not arrived yet and it has been two weeks since I placed it, please help';

    const res = await agent.post('/chat/send').send({ message }).expect(200);

    const conversation = await Conversation.findById(res.body.conversationId).lean();
    expect(conversation?.userId.toString()).toBe(user.id);
    expect(conversation?.title).toBe('My order has not arrived yet and it has been two weeks since');
    expect(conversation?.title.length).toBeLessThanOrEqual(60);
  });

  it('CHAT-02: stores both messages with the user id and correct roles', async () => {
    const { agent, user } = await signedUpAgent(app);
    fake.replyWith('Sure.');

    const res = await agent.post('/chat/send').send({ message: 'Question?' }).expect(200);

    const stored = await Message.find({ conversationId: res.body.conversationId }).sort(CHRONOLOGICAL).lean();
    expect(stored.map(({ role, content, userId }) => ({ role, content, userId: userId.toString() }))).toEqual([
      { role: 'user', content: 'Question?', userId: user.id },
      { role: 'assistant', content: 'Sure.', userId: user.id },
    ]);
  });
});

describe('POST /chat/send — existing conversation', () => {
  it('CHAT-01: appends to the conversation and gives the AI its earlier messages', async () => {
    const { agent } = await signedUpAgent(app);
    const first = await agent.post('/chat/send').send({ message: 'My name is Sam.' }).expect(200);
    const { conversationId } = first.body;

    const second = await agent.post('/chat/send').send({ conversationId, message: 'What is my name?' }).expect(200);

    expect(second.body.conversationId).toBe(conversationId);
    expect(await Message.countDocuments({ conversationId })).toBe(4);
    expect(await Conversation.countDocuments()).toBe(1);
    expect(fake.calls[1]).toEqual({
      history: [
        { role: 'user', content: 'My name is Sam.' },
        { role: 'assistant', content: 'Echo: My name is Sam.' },
      ],
      message: 'What is my name?',
    });
  });

  it('AI-03: sends at most AI_CONTEXT_MESSAGES earlier messages, the most recent ones', async () => {
    const { agent } = await signedUpAgent(app);
    const { conversationId } = (await agent.post('/chat/send').send({ message: 'm1' }).expect(200)).body;
    for (const message of ['m2', 'm3']) {
      await agent.post('/chat/send').send({ conversationId, message }).expect(200);
    }

    await agent.post('/chat/send').send({ conversationId, message: 'm4' }).expect(200);

    // AI_CONTEXT_MESSAGES=4 in this file: the last two exchanges, oldest first.
    expect(fake.calls.at(-1)?.history).toEqual([
      { role: 'user', content: 'm2' },
      { role: 'assistant', content: 'Echo: m2' },
      { role: 'user', content: 'm3' },
      { role: 'assistant', content: 'Echo: m3' },
    ]);
  });

  it('CHAT-02: moves the conversation’s updatedAt forward but keeps its title', async () => {
    const { agent } = await signedUpAgent(app);
    const { conversationId } = (await agent.post('/chat/send').send({ message: 'First' }).expect(200)).body;
    const before = await Conversation.findById(conversationId).lean();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await agent.post('/chat/send').send({ conversationId, message: 'Second' }).expect(200);

    const after = await Conversation.findById(conversationId).lean();
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
    expect(after!.title).toBe('First');
  });

  it('CHAT-05: 404 for another user’s conversation, and nothing is written to it', async () => {
    const owner = await signedUpAgent(app, 'Owner');
    const intruder = await signedUpAgent(app, 'Intruder');
    const { conversationId } = (await owner.agent.post('/chat/send').send({ message: 'Private' }).expect(200)).body;
    fake.reset();

    const res = await intruder.agent.post('/chat/send').send({ conversationId, message: 'Let me in' });

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Conversation not found' });
    expect(await Message.countDocuments({ conversationId })).toBe(2);
    expect(fake.calls).toHaveLength(0);
  });

  it('CHAT-05: 404 for a conversation id that does not exist', async () => {
    const { agent } = await signedUpAgent(app);
    const res = await agent.post('/chat/send').send({ conversationId: new Types.ObjectId().toString(), message: 'Hi' });

    expect(res.status).toBe(404);
  });
});

describe('POST /chat/send — validation', () => {
  it.each([
    ['an empty message', { message: '' }, 'message'],
    ['a whitespace-only message', { message: ' \n\t ' }, 'message'],
    ['a message over 4000 characters', { message: 'x'.repeat(4001) }, 'message'],
    ['a missing message', {}, 'message'],
    ['a non-string message', { message: 42 }, 'message'],
    ['a malformed conversationId', { message: 'Hi', conversationId: 'abc' }, 'conversationId'],
  ])('CHAT-01: rejects %s with 400, saves nothing and skips the AI', async (_label, body, field) => {
    const { agent } = await signedUpAgent(app);
    const res = await agent.post('/chat/send').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: field })]));
    expect(await Conversation.countDocuments()).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });

  it('CHAT-01: accepts a message of exactly 4000 characters', async () => {
    const { agent } = await signedUpAgent(app);
    await agent.post('/chat/send').send({ message: 'x'.repeat(4000) }).expect(200);
  });
});

describe('POST /chat/send — AI failures', () => {
  it('AI-04: returns 502 AI_UNAVAILABLE and creates no conversation or messages', async () => {
    const { agent } = await signedUpAgent(app);
    fake.failWith();

    const res = await agent.post('/chat/send').send({ message: 'Hello?' });

    expect(res.status).toBe(502);
    expect(res.body.error).toEqual({
      code: 'AI_UNAVAILABLE',
      message: 'The assistant is unavailable right now. Please try again.',
    });
    expect(await Conversation.countDocuments()).toBe(0);
    expect(await Message.countDocuments()).toBe(0);
  });

  it('AI-04: leaves an existing conversation untouched', async () => {
    const { agent } = await signedUpAgent(app);
    const { conversationId } = (await agent.post('/chat/send').send({ message: 'First' }).expect(200)).body;
    const before = await Conversation.findById(conversationId).lean();
    fake.failWith();

    await agent.post('/chat/send').send({ conversationId, message: 'Second' }).expect(502);

    expect(await Message.countDocuments({ conversationId })).toBe(2);
    const after = await Conversation.findById(conversationId).lean();
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
  });

  it('AI-04: the user can simply retry after a failure', async () => {
    const { agent } = await signedUpAgent(app);
    fake.failWith();
    await agent.post('/chat/send').send({ message: 'Hello?' }).expect(502);

    fake.reset();
    const res = await agent.post('/chat/send').send({ message: 'Hello?' }).expect(200);

    expect(res.body.assistantMessage.content).toBe('Echo: Hello?');
    expect(await Conversation.countDocuments()).toBe(1);
  });

  it('a non-AI bug is a 500, not a 502', async () => {
    const { agent } = await signedUpAgent(app);
    fake.failWith(new TypeError('bug in our code'));

    const res = await agent.post('/chat/send').send({ message: 'Hello?' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
  });
});

describe('titleFromMessage', () => {
  it('collapses whitespace and keeps at most 60 characters', () => {
    expect(titleFromMessage('  a\n\nb\tc  ')).toBe('a b c');
    expect(titleFromMessage('x'.repeat(100))).toHaveLength(60);
  });

  it('never cuts an emoji in half', () => {
    const title = titleFromMessage(`${'x'.repeat(59)}😀 more`);
    expect(title).toBe(`${'x'.repeat(59)}😀`);
  });
});
