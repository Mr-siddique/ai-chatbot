import { loadConfig, type Config } from '../../src/config.js';

/** A valid config for tests. Never uses real secrets. */
export function testConfig(overrides: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused-in-tests',
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    OPENROUTER_API_KEY: 'test-key',
    ...overrides,
  });
}
