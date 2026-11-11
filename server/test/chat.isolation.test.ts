/**
 * CHAT-05: a user can never read or write another user's conversations.
 * Bob attacks every chat endpoint with Alice's ids; Alice's data must be
 * unchanged afterwards. A query guard also checks that every database query
 * on chat data is filtered by userId.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { Conversation } from '../src/models/Conversation.js';
import { CHRONOLOGICAL, Message } from '../src/models/Message.js';
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

type Agent = Awaited<ReturnType<typeof signedUpAgent>>;
let alice: Agent;
let bob: Agent;
let aliceConversationId: string;

beforeEach(async () => {
  fake.reset();
  alice = await signedUpAgent(app, 'Alice');
  bob = await signedUpAgent(app, 'Bob');
  const res = await alice.agent.post('/chat/send').send({ message: 'Alice: my secret question' }).expect(200);
  aliceConversationId = res.body.conversationId;
});

/** Everything stored for Alice, to compare before and after Bob's attempts. */
async function aliceSnapshot() {
  const conversations = await Conversation.find({ userId: alice.user.id }).lean();
  const messages = await Message.find({ userId: alice.user.id }).sort(CHRONOLOGICAL).lean();
  return JSON.stringify({ conversations, messages });
}

describe('CHAT-05: Bob cannot touch Alice’s conversation', () => {
  it('cannot read it', async () => {
    const res = await bob.agent.get(`/chat/history/${aliceConversationId}`);

    expect(res.status).toBe(404);
    expect(res.text).not.toContain('secret');
  });

  it('cannot see it in his history, even when asking for Alice’s userId', async () => {
    for (const path of ['/chat/history', `/chat/history?userId=${alice.user.id}`]) {
      const res = await bob.agent.get(path).expect(200);
      expect(res.body.conversations).toEqual([]);
    }
  });

  it('cannot write to it, and the AI never sees Alice’s messages', async () => {
    const before = await aliceSnapshot();
    fake.reset();

    const res = await bob.agent.post('/chat/send').send({ conversationId: aliceConversationId, message: 'Hijack' });

    expect(res.status).toBe(404);
    expect(fake.calls).toHaveLength(0);
    expect(await aliceSnapshot()).toBe(before);
  });

  it('cannot create data as Alice by sending her userId in the body', async () => {
    const before = await aliceSnapshot();

    const res = await bob.agent.post('/chat/send').send({ message: 'Posing as Alice', userId: alice.user.id }).expect(200);

    const created = await Conversation.findById(res.body.conversationId).lean();
    expect(created?.userId.toString()).toBe(bob.user.id);
    expect(await aliceSnapshot()).toBe(before);
  });

  it('Alice still sees exactly her own data afterwards', async () => {
    await bob.agent.post('/chat/send').send({ conversationId: aliceConversationId, message: 'Hijack' });
    await bob.agent.post('/chat/send').send({ message: 'Bob own chat' }).expect(200);

    const list = await alice.agent.get('/chat/history').expect(200);
    expect(list.body.conversations.map((c: { id: string }) => c.id)).toEqual([aliceConversationId]);

    const thread = await alice.agent.get(`/chat/history/${aliceConversationId}`).expect(200);
    expect(thread.body.messages.map((m: { content: string }) => m.content)).toEqual([
      'Alice: my secret question',
      'Echo: Alice: my secret question',
    ]);
  });
});

describe('CHAT-05: every chat query is scoped by userId', () => {
  type Query = { collection: string; method: string; filter: unknown };
  const queries: Query[] = [];

  beforeEach(() => {
    queries.length = 0;
    mongoose.set('debug', (collection: string, method: string, filter: unknown) => {
      queries.push({ collection, method, filter });
    });
  });

  afterEach(() => {
    mongoose.set('debug', false);
  });

  it('no conversation or message query runs without a userId filter', async () => {
    // Exercise the whole chat API, including failure paths.
    const { conversationId } = (await bob.agent.post('/chat/send').send({ message: 'Hi' }).expect(200)).body;
    await bob.agent.post('/chat/send').send({ conversationId, message: 'Again' }).expect(200);
    await bob.agent.post('/chat/send').send({ conversationId: aliceConversationId, message: 'x' }).expect(404);
    fake.failWith();
    await bob.agent.post('/chat/send').send({ conversationId, message: 'AI down' }).expect(502);
    await bob.agent.get('/chat/history').expect(200);
    await bob.agent.get(`/chat/history/${conversationId}`).expect(200);
    await bob.agent.get(`/chat/history/${aliceConversationId}`).expect(404);

    const READS_AND_WRITES =
      /^(find|findOne|findOneAndUpdate|findOneAndDelete|updateOne|updateMany|deleteOne|deleteMany|countDocuments|aggregate)$/;
    const chatQueries = queries.filter(
      (q) => ['conversations', 'messages'].includes(q.collection) && READS_AND_WRITES.test(q.method),
    );

    expect(chatQueries.length).toBeGreaterThan(5); // the guard actually observed something
    const unscoped = chatQueries.filter((q) => !(q.filter && typeof q.filter === 'object' && 'userId' in q.filter));
    expect(unscoped).toEqual([]);
  });
});
