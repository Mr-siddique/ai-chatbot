import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { verifyToken } from '../src/lib/jwt.js';
import { User } from '../src/models/User.js';
import * as authService from '../src/services/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDb } from './helpers/db.js';

useTestDb();

const config = testConfig();
const jane = { name: 'Jane Doe', email: 'jane@example.com', password: 'correct-horse' };
let app: Express;
let janeId: string;

beforeAll(async () => {
  app = createApp({ config });
  await User.init();
});

beforeEach(async () => {
  janeId = (await authService.signup(jane, config)).id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function login(body: unknown) {
  return request(app).post('/auth/login').send(body as object);
}

function tokenCookie(res: request.Response): string | undefined {
  const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return cookies.find((c) => c.startsWith('token='));
}

describe('POST /auth/login', () => {
  it('AUTH-02: returns 200 { user } for correct credentials', async () => {
    const res = await login({ email: jane.email, password: jane.password });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: janeId, name: jane.name, email: jane.email, createdAt: expect.any(String) },
    });
  });

  it('AUTH-02: sets an httpOnly token cookie for that user', async () => {
    const res = await login({ email: jane.email, password: jane.password });
    const cookie = tokenCookie(res);

    expect(cookie).toMatch(/HttpOnly/);
    const token = cookie!.split(';')[0]!.slice('token='.length);
    expect(verifyToken(token, config)).toEqual({ userId: janeId });
  });

  it('AUTH-02: matches the email case-insensitively', async () => {
    const res = await login({ email: '  JANE@Example.com ', password: jane.password });
    expect(res.status).toBe(200);
  });

  it('AUTH-02: wrong password and unknown email get the identical 401', async () => {
    const wrongPassword = await login({ email: jane.email, password: 'wrong-password' });
    const unknownEmail = await login({ email: 'nobody@example.com', password: jane.password });

    const expected = { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } };
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual(expected);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(expected);
    expect(tokenCookie(wrongPassword)).toBeUndefined();
    expect(tokenCookie(unknownEmail)).toBeUndefined();
  });

  it('AUTH-02: still runs a bcrypt comparison for an unknown email (no timing leak)', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');

    await login({ email: 'nobody@example.com', password: 'whatever-password' });

    expect(compare).toHaveBeenCalledOnce();
  });

  it('AUTH-02: the password is case-sensitive', async () => {
    const res = await login({ email: jane.email, password: jane.password.toUpperCase() });
    expect(res.status).toBe(401);
  });

  it.each([
    ['missing password', { email: jane.email }, 'password'],
    ['empty password', { email: jane.email, password: '' }, 'password'],
    ['missing email', { password: jane.password }, 'email'],
    ['invalid email', { email: 'jane', password: jane.password }, 'email'],
    ['oversized password', { email: jane.email, password: 'x'.repeat(1025) }, 'password'],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, body, field) => {
    const res = await login(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: field })]),
    );
  });

  it('AUTH-04: the response never contains the password or its hash', async () => {
    const res = await login({ email: jane.email, password: jane.password });

    expect(res.text).not.toContain(jane.password);
    expect(res.text).not.toMatch(/passwordHash|\$2[aby]\$/);
  });
});
