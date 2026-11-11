import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Conversation, TITLE_MAX_LENGTH, toPublicConversation } from '../src/models/Conversation.js';
import { CHRONOLOGICAL, Message, toPublicMessage } from '../src/models/Message.js';
import { useTestDb } from './helpers/db.js';

useTestDb();

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('Conversation model', () => {
  it('stores owner and title with timestamps', async () => {
    const userId = new Types.ObjectId();
    const conversation = await Conversation.create({ userId, title: '  Refund question  ' });

    expect(conversation.userId.toString()).toBe(userId.toString());
    expect(conversation.title).toBe('Refund question');
    expect(conversation.createdAt).toBeInstanceOf(Date);
    expect(conversation.updatedAt).toBeInstanceOf(Date);
  });

  it('requires userId and title', async () => {
    await expect(Conversation.create({})).rejects.toMatchObject({
      errors: { userId: expect.anything(), title: expect.anything() },
    });
  });

  it(`rejects titles longer than ${TITLE_MAX_LENGTH} characters`, async () => {
    await expect(
      Conversation.create({ userId: new Types.ObjectId(), title: 'x'.repeat(TITLE_MAX_LENGTH + 1) }),
    ).rejects.toThrow(/title/);
  });

  it('CHAT-03: serializes to { id, title, createdAt, updatedAt } without userId', async () => {
    const conversation = await Conversation.create({ userId: new Types.ObjectId(), title: 'Hello' });
    const expected = {
      id: conversation._id.toString(),
      title: 'Hello',
      createdAt: expect.stringMatching(ISO),
      updatedAt: expect.stringMatching(ISO),
    };

    expect(toPublicConversation(conversation)).toEqual(expected);
    expect(JSON.parse(JSON.stringify(conversation))).toEqual(expected);
  });

  it('CHAT-03: has the { userId, updatedAt } index for listing', async () => {
    await Conversation.init();
    const indexes = await Conversation.collection.indexes();

    expect(indexes.map((index) => index.key)).toContainEqual({ userId: 1, updatedAt: -1 });
  });
});

describe('Message model', () => {
  const conversationId = new Types.ObjectId();
  const userId = new Types.ObjectId();

  it('stores a message with createdAt and no updatedAt', async () => {
    const message = await Message.create({ conversationId, userId, role: 'user', content: 'Hi' });

    expect(message.createdAt).toBeInstanceOf(Date);
    expect(message.toObject()).not.toHaveProperty('updatedAt');
  });

  it('requires conversationId, userId, role and content', async () => {
    await expect(Message.create({})).rejects.toMatchObject({
      errors: {
        conversationId: expect.anything(),
        userId: expect.anything(),
        role: expect.anything(),
        content: expect.anything(),
      },
    });
  });

  it('only accepts the roles user and assistant', async () => {
    // Types already forbid this; the cast checks the runtime guard too.
    const invalid = { conversationId, userId, role: 'system' as unknown as 'user', content: 'x' };
    await expect(Message.create(invalid)).rejects.toThrow(/role/);
  });

  it('CHAT-04: serializes to the contract shape without userId', async () => {
    const message = await Message.create({ conversationId, userId, role: 'assistant', content: 'Hello!' });
    const expected = {
      id: message._id.toString(),
      conversationId: conversationId.toString(),
      role: 'assistant',
      content: 'Hello!',
      createdAt: expect.stringMatching(ISO),
    };

    expect(toPublicMessage(message)).toEqual(expected);
    expect(JSON.parse(JSON.stringify(message))).toEqual(expected);
  });

  it('CHAT-04: keeps question-before-answer order when both share a timestamp', async () => {
    const sameInstant = new Date('2026-01-01T00:00:00.000Z');
    // Insert several pairs with identical timestamps, in order.
    const docs = Array.from({ length: 5 }, (_, i) => [
      { conversationId, userId, role: 'user', content: `q${i}`, createdAt: sameInstant },
      { conversationId, userId, role: 'assistant', content: `a${i}`, createdAt: sameInstant },
    ]).flat();
    await Message.insertMany(docs);

    const ordered = await Message.find({ conversationId }).sort(CHRONOLOGICAL).lean();

    expect(ordered.map((m) => m.content)).toEqual(['q0', 'a0', 'q1', 'a1', 'q2', 'a2', 'q3', 'a3', 'q4', 'a4']);
  });

  it('CHAT-04: has the { conversationId, createdAt, _id } index for reading a conversation', async () => {
    await Message.init();
    const indexes = await Message.collection.indexes();

    expect(indexes.map((index) => index.key)).toContainEqual({ conversationId: 1, createdAt: 1, _id: 1 });
  });
});
