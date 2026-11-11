import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import { User } from '../src/models/User.js';
import { signedUpAgent } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDb } from './helpers/db.js';
import { createFakeAi } from './helpers/fakeAi.js';

useTestDb();

beforeAll(async () => {
  await User.init();
});

/** Test config with rate limiting switched on and small limits. */
function limitedConfig(limits: Partial<Config['rateLimit']> = {}): Config {
  const config = testConfig();
  return { ...config, rateLimit: { ...config.rateLimit, enabled: true, max: 3, authMax: 100, ...limits } };
}

function appWith(config: Config) {
  const fake = createFakeAi();
  return { app: createApp({ config, ai: fake.ai }), fake };
}

async function sendMany(agent: ReturnType<typeof request.agent>, count: number) {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) {
    statuses.push((await agent.post('/chat/send').send({ message: `Message ${i}` })).status);
  }
  return statuses;
}

describe('POST /chat/send rate limit (BON-02)', () => {
  it('BON-02: allows RATE_LIMIT_MAX messages, then answers 429 RATE_LIMITED', async () => {
    const { app } = appWith(limitedConfig({ max: 3 }));
    const { agent } = await signedUpAgent(app);

    expect(await sendMany(agent, 3)).toEqual([200, 200, 200]);
    const res = await agent.post('/chat/send').send({ message: 'One too many' });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'You’re sending messages too fast. Please wait a moment and try again.' },
    });
  });

  it('BON-02: sends standard RateLimit and Retry-After headers', async () => {
    const { app } = appWith(limitedConfig({ max: 1 }));
    const { agent } = await signedUpAgent(app);

    const ok = await agent.post('/chat/send').send({ message: 'Hi' });
    expect(ok.headers['ratelimit-policy']).toBe('1;w=60');
    expect(ok.headers.ratelimit).toMatch(/limit=1, remaining=0, reset=\d+/);

    const limited = await agent.post('/chat/send').send({ message: 'Again' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('BON-02: a limited request never reaches the AI or the database', async () => {
    const { app, fake } = appWith(limitedConfig({ max: 1 }));
    const { agent } = await signedUpAgent(app);
    await agent.post('/chat/send').send({ message: 'First' }).expect(200);

    await agent.post('/chat/send').send({ message: 'Second' }).expect(429);

    expect(fake.calls.map((call) => call.message)).toEqual(['First']);
  });

  it('BON-02: counts per user, so one user’s limit doesn’t block another', async () => {
    const { app } = appWith(limitedConfig({ max: 2 }));
    const alice = await signedUpAgent(app, 'Alice');
    const bob = await signedUpAgent(app, 'Bob');

    expect(await sendMany(alice.agent, 3)).toEqual([200, 200, 429]);
    expect(await sendMany(bob.agent, 2)).toEqual([200, 200]);
  });

  it('BON-02: does not limit reading history', async () => {
    const { app } = appWith(limitedConfig({ max: 1 }));
    const { agent } = await signedUpAgent(app);
    await sendMany(agent, 2);

    for (let i = 0; i < 5; i += 1) {
      await agent.get('/chat/history').expect(200);
    }
  });

  it('checks the session before the limit (unauthenticated → 401, not 429)', async () => {
    const { app } = appWith(limitedConfig({ max: 1 }));
    for (let i = 0; i < 3; i += 1) {
      await request(app).post('/chat/send').send({ message: 'x' }).expect(401);
    }
  });
});

describe('Auth rate limit (BON-02)', () => {
  it('BON-02: limits login attempts per IP, even with the right password', async () => {
    const { app } = appWith(limitedConfig({ authMax: 3 }));
    const { user } = await signedUpAgent(app); // signup uses 1 of the 3
    const login = () => request(app).post('/auth/login').send({ email: user.email, password: 'wrong-password' });

    expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(401);
    const blocked = await request(app).post('/auth/login').send({ email: user.email, password: 'test-password' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    });
  });

  it('BON-02: signup and login share the same budget', async () => {
    const { app } = appWith(limitedConfig({ authMax: 2 }));
    await request(app).post('/auth/signup').send({ name: 'A', email: 'a@example.com', password: 'password-1' }).expect(201);
    await request(app).post('/auth/login').send({ email: 'a@example.com', password: 'password-1' }).expect(200);

    await request(app).post('/auth/signup').send({ name: 'B', email: 'b@example.com', password: 'password-1' }).expect(429);
  });

  it('does not limit /auth/me or /auth/logout', async () => {
    const { app } = appWith(limitedConfig({ authMax: 1 }));
    const { agent } = await signedUpAgent(app);

    for (let i = 0; i < 3; i += 1) {
      await agent.get('/auth/me').expect(200);
    }
    await agent.post('/auth/logout').expect(204);
  });
});

describe('Rate limit configuration (BON-02)', () => {
  it('is off under NODE_ENV=test and on elsewhere', () => {
    expect(testConfig().rateLimit.enabled).toBe(false);
    expect(testConfig({ NODE_ENV: 'development' }).rateLimit.enabled).toBe(true);
    expect(testConfig({ NODE_ENV: 'production' }).rateLimit.enabled).toBe(true);
  });

  it('when off, many requests go through', async () => {
    const { app } = appWith(testConfig());
    const { agent } = await signedUpAgent(app);

    expect(new Set(await sendMany(agent, 25))).toEqual(new Set([200]));
  });
});
