import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { pino } from 'pino';
import { createApp } from '../src/app.js';
import { signToken } from '../src/lib/jwt.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';
import { authUser, requireAuth } from '../src/middleware/requireAuth.js';
import { User } from '../src/models/User.js';
import { testConfig } from './helpers/config.js';
import { useTestDb } from './helpers/db.js';

useTestDb();

const config = testConfig();
const jane = { name: 'Jane Doe', email: 'jane@example.com', password: 'correct-horse' };
let app: Express;

beforeAll(async () => {
  app = createApp({ config });
  await User.init();
});

/** An agent (keeps cookies like a browser) that has signed up as Jane. */
async function loggedInAgent() {
  const agent = request.agent(app);
  const res = await agent.post('/auth/signup').send(jane).expect(201);
  return { agent, user: res.body.user as { id: string } };
}

const UNAUTHENTICATED = { code: 'UNAUTHENTICATED', message: expect.any(String) };

describe('GET /auth/me', () => {
  it('AUTH-06: returns the logged-in user', async () => {
    const { agent, user } = await loggedInAgent();
    const res = await agent.get('/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: user.id, name: jane.name, email: jane.email, createdAt: expect.any(String) },
    });
    expect(res.text).not.toMatch(/passwordHash/);
  });

  it('AUTH-05: 401 without a cookie', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual(UNAUTHENTICATED);
  });

  it('AUTH-05: ignores an Authorization header (cookie only)', async () => {
    const { user } = await loggedInAgent();
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${signToken(user.id, config)}`);

    expect(res.status).toBe(401);
  });

  it.each([
    ['a tampered token', (id: string) => signToken(id, config).slice(0, -2) + 'xx'],
    ['a token signed with another secret', (id: string) =>
      signToken(id, testConfig({ JWT_SECRET: 'another-secret-that-is-also-32-chars!!' }))],
    ['an expired token', (id: string) =>
      jwt.sign({ sub: id, exp: Math.floor(Date.now() / 1000) - 1 }, config.jwt.secret)],
    ['a token whose sub is not an ObjectId', () => signToken('not-an-object-id', config)],
    ['garbage', () => 'garbage'],
  ])('AUTH-05: 401 for %s', async (_label, makeToken) => {
    const { user } = await loggedInAgent();
    const res = await request(app).get('/auth/me').set('Cookie', `token=${makeToken(user.id)}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual(UNAUTHENTICATED);
  });

  it('AUTH-05: 401 when the user behind a valid token was deleted', async () => {
    const { agent, user } = await loggedInAgent();
    await User.deleteOne({ _id: user.id });

    const res = await agent.get('/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('AUTH-03: returns 204 and clears the cookie', async () => {
    const { agent } = await loggedInAgent();
    const res = await agent.post('/auth/logout');

    expect(res.status).toBe(204);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.find((c) => c.startsWith('token='))).toMatch(/^token=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('AUTH-03: after logout, /auth/me is 401', async () => {
    const { agent } = await loggedInAgent();
    await agent.get('/auth/me').expect(200);

    await agent.post('/auth/logout').expect(204);

    await agent.get('/auth/me').expect(401);
  });

  it('AUTH-03: works without a cookie (idempotent)', async () => {
    await request(app).post('/auth/logout').expect(204);
  });

  it('AUTH-03: user can log back in after logging out', async () => {
    const { agent } = await loggedInAgent();
    await agent.post('/auth/logout').expect(204);

    await agent.post('/auth/login').send({ email: jane.email, password: jane.password }).expect(200);
    await agent.get('/auth/me').expect(200);
  });
});

describe('requireAuth on any route', () => {
  function protectedApp() {
    const app = express();
    app.use(cookieParser());
    app.get('/private', requireAuth(config), (req, res) => {
      res.json({ userId: authUser(req).id });
    });
    app.use(createErrorHandler({ logger: pino({ level: 'silent' }), exposeDetails: false }));
    return app;
  }

  it('AUTH-05: exposes the user id to the handler', async () => {
    const user = await User.create({ ...jane, passwordHash: 'x' });
    const res = await request(protectedApp())
      .get('/private')
      .set('Cookie', `token=${signToken(user.id, config)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: user.id });
  });

  it('AUTH-05: blocks the handler without a session', async () => {
    const res = await request(protectedApp()).get('/private');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
