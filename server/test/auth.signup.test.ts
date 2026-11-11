import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { verifyToken } from '../src/lib/jwt.js';
import { User } from '../src/models/User.js';
import { testConfig } from './helpers/config.js';
import { useTestDb } from './helpers/db.js';

useTestDb();

const config = testConfig();
let app: Express;

beforeAll(async () => {
  app = createApp({ config });
  await User.init(); // unique email index
});

const valid = { name: 'Jane Doe', email: 'jane@example.com', password: 'correct-horse' };

function signup(body: unknown) {
  return request(app).post('/auth/signup').send(body as object);
}

function tokenCookie(res: request.Response): string | undefined {
  const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return cookies.find((c) => c.startsWith('token='));
}

describe('POST /auth/signup', () => {
  it('AUTH-01: creates the user and returns 201 { user }', async () => {
    const res = await signup({ ...valid, email: '  Jane@Example.COM ' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: {
        id: expect.any(String),
        name: 'Jane Doe',
        email: 'jane@example.com',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    });
    expect(await User.countDocuments()).toBe(1);
  });

  it('AUTH-01: sets an httpOnly token cookie for the new user', async () => {
    const res = await signup(valid);
    const cookie = tokenCookie(res);

    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/);
    const token = cookie!.split(';')[0]!.slice('token='.length);
    expect(verifyToken(token, config)).toEqual({ userId: res.body.user.id });
  });

  it('AUTH-01: rejects a duplicate email regardless of case with 409 EMAIL_TAKEN', async () => {
    await signup(valid);
    const res = await signup({ ...valid, name: 'Other', email: 'JANE@example.com' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
    });
    expect(tokenCookie(res)).toBeUndefined();
    expect(await User.countDocuments()).toBe(1);
  });

  it.each([
    ['invalid email', { ...valid, email: 'not-an-email' }, 'email'],
    ['missing email', { name: valid.name, password: valid.password }, 'email'],
    ['empty name', { ...valid, name: '' }, 'name'],
    ['whitespace-only name', { ...valid, name: '   ' }, 'name'],
    ['name over 80 chars', { ...valid, name: 'x'.repeat(81) }, 'name'],
    ['password under 8 chars', { ...valid, password: 'short' }, 'password'],
    ['password over 72 bytes', { ...valid, password: 'é'.repeat(37) }, 'password'],
    ['non-string password', { ...valid, password: 12345678 }, 'password'],
  ])('AUTH-01: rejects %s with 400 and saves nothing', async (_label, body, field) => {
    const res = await signup(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: field })]),
    );
    expect(tokenCookie(res)).toBeUndefined();
    expect(await User.countDocuments()).toBe(0);
  });

  it('AUTH-01: accepts a 72-byte password (the bcrypt limit)', async () => {
    const res = await signup({ ...valid, password: 'a'.repeat(72) });
    expect(res.status).toBe(201);
  });

  it('AUTH-01: ignores unknown fields such as a client-supplied passwordHash', async () => {
    const res = await signup({ ...valid, passwordHash: 'attacker-chosen', isAdmin: true });

    expect(res.status).toBe(201);
    const stored = await User.findOne({ email: valid.email }).select('+passwordHash').lean();
    expect(stored?.passwordHash).not.toBe('attacker-chosen');
    expect(stored).not.toHaveProperty('isAdmin');
  });

  it('AUTH-04: stores a bcrypt hash, never the password', async () => {
    await signup(valid);
    const stored = await User.findOne({ email: valid.email }).select('+passwordHash').lean();

    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored?.passwordHash).not.toContain(valid.password);
    expect(await bcrypt.compare(valid.password, stored!.passwordHash)).toBe(true);
  });

  it('AUTH-04: the response never contains the password or its hash', async () => {
    const res = await signup(valid);

    expect(res.text).not.toContain(valid.password);
    expect(res.text).not.toMatch(/passwordHash|\$2[aby]\$/);
  });
});
