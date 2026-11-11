/**
 * BON-03: everything NODE_ENV switches, in one place. If a default changes,
 * this table must be updated on purpose.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import { User } from '../src/models/User.js';
import { testConfig } from './helpers/config.js';
import { useTestDb } from './helpers/db.js';
import { createFakeAi } from './helpers/fakeAi.js';

useTestDb();

const expected = {
  development: { secureCookie: false, bcryptRounds: 10, logLevel: 'debug', trustProxy: false, rateLimit: true },
  test: { secureCookie: false, bcryptRounds: 4, logLevel: 'silent', trustProxy: false, rateLimit: false },
  production: { secureCookie: true, bcryptRounds: 12, logLevel: 'info', trustProxy: true, rateLimit: true },
} as const;

describe.each(Object.entries(expected))('NODE_ENV=%s (BON-03)', (nodeEnv, want) => {
  const config = testConfig({ NODE_ENV: nodeEnv });

  it(`bcrypt cost ${want.bcryptRounds}, log level ${want.logLevel}, rate limiting ${want.rateLimit ? 'on' : 'off'}`, () => {
    expect(config.isProd).toBe(nodeEnv === 'production');
    expect(config.bcryptRounds).toBe(want.bcryptRounds);
    expect(config.logLevel).toBe(want.logLevel);
    expect(config.rateLimit.enabled).toBe(want.rateLimit);
  });

  it(`trust proxy ${want.trustProxy ? 'on' : 'off'}, Secure cookie ${want.secureCookie ? 'on' : 'off'}`, async () => {
    await User.init();
    // Quiet logger and no rate limit so the check itself is unaffected.
    const quiet = { ...config, logLevel: 'silent' as const, rateLimit: { ...config.rateLimit, enabled: false } };
    const app = createApp({ config: quiet, logger: createLogger(quiet), ai: createFakeAi().ai });

    expect(Boolean(app.get('trust proxy'))).toBe(want.trustProxy);

    const res = await request(app)
      .post('/auth/signup')
      .send({ name: 'Env', email: `env-${nodeEnv}@example.com`, password: 'env-password' })
      .expect(201);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(/; Secure/.test(cookie)).toBe(want.secureCookie);
  });
});

describe('COOKIE_SECURE override', () => {
  it('defaults to on in production only', () => {
    expect(testConfig({ NODE_ENV: 'production' }).cookieSecure).toBe(true);
    expect(testConfig({ NODE_ENV: 'development' }).cookieSecure).toBe(false);
  });

  it('can be turned off for plain-http docker compose, or on anywhere', () => {
    expect(testConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
    expect(testConfig({ NODE_ENV: 'development', COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
  });

  it('rejects anything but true/false', () => {
    expect(() => testConfig({ COOKIE_SECURE: 'yes' })).toThrow(/COOKIE_SECURE/);
  });
});

describe('LOG_LEVEL override (BON-03)', () => {
  it('overrides the per-environment default', () => {
    expect(testConfig({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }).logLevel).toBe('warn');
  });

  it('rejects an unknown level at startup', () => {
    expect(() => testConfig({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });
});
