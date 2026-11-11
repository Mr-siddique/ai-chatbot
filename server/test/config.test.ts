import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const required = {
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'x'.repeat(32),
  OPENROUTER_API_KEY: 'key',
};

describe('loadConfig', () => {
  it('applies defaults when only required vars are set', () => {
    const config = loadConfig(required);

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(4000);
    expect(config.jwt.expiresIn).toBe('7d');
    expect(config.ai.model).toBe('nvidia/nemotron-3.5-lightning:free');
    expect(config.ai.timeoutMs).toBe(30_000);
    expect(config.clientOrigins).toEqual(['http://localhost:5173']);
  });

  it('coerces numbers and splits comma-separated origins', () => {
    const config = loadConfig({
      ...required,
      PORT: '8080',
      CLIENT_ORIGIN: 'https://a.example, https://b.example',
    });

    expect(config.port).toBe(8080);
    expect(config.clientOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('picks bcrypt rounds per environment', () => {
    expect(loadConfig({ ...required, NODE_ENV: 'test' }).bcryptRounds).toBe(4);
    expect(loadConfig({ ...required, NODE_ENV: 'development' }).bcryptRounds).toBe(10);
    expect(loadConfig({ ...required, NODE_ENV: 'production' }).bcryptRounds).toBe(12);
  });

  it('BON-03: lists every missing or invalid variable at once', () => {
    let error: unknown;
    try {
      loadConfig({ JWT_SECRET: 'short', PORT: 'abc' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ConfigError);
    const problems = (error as ConfigError).problems.join('\n');
    expect(problems).toMatch(/MONGODB_URI/);
    expect(problems).toMatch(/JWT_SECRET/);
    expect(problems).toMatch(/OPENROUTER_API_KEY/);
    expect(problems).toMatch(/PORT/);
  });

  it('BON-03: rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ ...required, NODE_ENV: 'staging' })).toThrow(ConfigError);
  });

  it('never includes secret values in the error message', () => {
    try {
      loadConfig({ ...required, JWT_SECRET: 'tooshort-secret' });
    } catch (err) {
      expect((err as Error).message).not.toContain('tooshort-secret');
    }
  });
});
