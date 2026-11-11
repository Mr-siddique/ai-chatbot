import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import type { Express } from 'express';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { signedUpAgent } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDb } from './helpers/db.js';
import { createFakeAi } from './helpers/fakeAi.js';

useTestDb();

const fake = createFakeAi();
let app: Express;

beforeAll(async () => {
  app = createApp({ config: testConfig(), ai: fake.ai });
  await User.init();
});

beforeEach(() => fake.reset());

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

/** Sends a message (optionally into an existing conversation) and returns the conversation id. */
async function send(agent: TestAgent, message: string, conversationId?: string): Promise<string> {
  const res = await agent.post('/chat/send').send({ message, conversationId }).expect(200);
  return res.body.conversationId;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('GET /chat/history', () => {
  it('AUTH-05: requires a session', async () => {
    const res = await request(app).get('/chat/history');
    expect(res.status).toBe(401);
  });

  it('CHAT-03: returns an empty list for a new user', async () => {
    const { agent } = await signedUpAgent(app);
    const res = await agent.get('/chat/history');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ conversations: [] });
  });

  it('CHAT-03: returns ConversationSummary objects only', async () => {
    const { agent } = await signedUpAgent(app);
    const id = await send(agent, 'Where is my parcel?');

    const res = await agent.get('/chat/history');

    expect(res.body.conversations).toEqual([
      { id, title: 'Where is my parcel?', lastMessagePreview: 'Echo: Where is my parcel?', createdAt: ISO, updatedAt: ISO },
    ]);
  });

  it('CHAT-03: lists the most recently active conversation first', async () => {
    const { agent } = await signedUpAgent(app);
    const first = await send(agent, 'First topic');
    await tick();
    const second = await send(agent, 'Second topic');
    await tick();
    // Replying in the first conversation moves it back to the top.
    await send(agent, 'Follow-up', first);

    const res = await agent.get('/chat/history');

    expect(res.body.conversations.map((c: { id: string }) => c.id)).toEqual([first, second]);
  });

  it('CHAT-05: never includes another user’s conversations', async () => {
    const alice = await signedUpAgent(app, 'Alice');
    const bob = await signedUpAgent(app, 'Bob');
    const aliceConversation = await send(alice.agent, 'Alice private');
    const bobConversation = await send(bob.agent, 'Bob private');

    const res = await bob.agent.get('/chat/history');

    const ids = res.body.conversations.map((c: { id: string }) => c.id);
    expect(ids).toEqual([bobConversation]);
    expect(ids).not.toContain(aliceConversation);
  });
});

describe('GET /chat/history/:conversationId', () => {
  it('AUTH-05: requires a session', async () => {
    const res = await request(app).get(`/chat/history/${new Types.ObjectId().toString()}`);
    expect(res.status).toBe(401);
  });

  it('CHAT-04: returns the conversation and its messages oldest-first', async () => {
    const { agent } = await signedUpAgent(app);
    const id = await send(agent, 'Hello');
    await send(agent, 'Second question', id);

    const res = await agent.get(`/chat/history/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.conversation).toEqual({
      id,
      title: 'Hello',
      lastMessagePreview: 'Echo: Second question',
      createdAt: ISO,
      updatedAt: ISO,
    });
    expect(res.body.messages.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
      ['user', 'Hello'],
      ['assistant', 'Echo: Hello'],
      ['user', 'Second question'],
      ['assistant', 'Echo: Second question'],
    ]);
  });

  it('CHAT-04: messages use the contract shape and never expose userId', async () => {
    const { agent } = await signedUpAgent(app);
    const id = await send(agent, 'Hi');

    const res = await agent.get(`/chat/history/${id}`);

    expect(res.body.messages[0]).toEqual({
      id: expect.any(String),
      conversationId: id,
      role: 'user',
      content: 'Hi',
      createdAt: ISO,
    });
    expect(res.text).not.toMatch(/userId/);
  });

  it('CHAT-04: returns 400 for a malformed id', async () => {
    const { agent } = await signedUpAgent(app);
    const res = await agent.get('/chat/history/not-an-id');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'conversationId' })]);
  });

  it('CHAT-05: another user’s conversation is a 404, identical to a missing one', async () => {
    const alice = await signedUpAgent(app, 'Alice');
    const bob = await signedUpAgent(app, 'Bob');
    const aliceConversation = await send(alice.agent, 'Alice private');

    const foreign = await bob.agent.get(`/chat/history/${aliceConversation}`);
    const missing = await bob.agent.get(`/chat/history/${new Types.ObjectId().toString()}`);

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.text).not.toContain('Alice private');
  });
});
