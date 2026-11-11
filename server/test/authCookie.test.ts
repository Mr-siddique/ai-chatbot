import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AUTH_COOKIE, clearAuthCookie, setAuthCookie } from '../src/lib/authCookie.js';
import { testConfig } from './helpers/config.js';
import type { Config } from '../src/config.js';

function appWith(config: Config) {
  const app = express();
  app.post('/set', (_req, res) => {
    setAuthCookie(res, 'the-token', config);
    res.sendStatus(204);
  });
  app.post('/clear', (_req, res) => {
    clearAuthCookie(res, config);
    res.sendStatus(204);
  });
  return app;
}

async function setCookieHeader(config: Config, path: '/set' | '/clear'): Promise<string> {
  const res = await request(appWith(config)).post(path);
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  expect(header).toHaveLength(1);
  return header![0]!;
}

describe('auth cookie', () => {
  it('is named "token", httpOnly, SameSite=Lax, path / with Max-Age = JWT lifetime', async () => {
    const config = testConfig({ JWT_EXPIRES_IN: '7d' });
    const cookie = await setCookieHeader(config, '/set');

    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE}=the-token;`));
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=604800/);
  });

  it('is not Secure outside production (works on http://localhost)', async () => {
    const cookie = await setCookieHeader(testConfig({ NODE_ENV: 'development' }), '/set');
    expect(cookie).not.toMatch(/; Secure/);
  });

  it('is Secure in production', async () => {
    const cookie = await setCookieHeader(testConfig({ NODE_ENV: 'production' }), '/set');
    expect(cookie).toMatch(/; Secure/);
  });

  it('AUTH-03: clearing expires the cookie with the same path and flags', async () => {
    const cookie = await setCookieHeader(testConfig({ NODE_ENV: 'production' }), '/clear');

    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE}=;`));
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
  });
});
