import { defineConfig } from 'vitest/config';

/**
 * Live tests call real external services (OpenRouter) with the keys in
 * server/.env. They use the free-tier quota, so they never run with
 * `npm test` — only with `npm run test:live`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/live/**/*.test.ts'],
    testTimeout: 90_000,
    // One request at a time: free models are rate-limited.
    fileParallelism: false,
    // Show the printed reply so a human can judge its tone.
    silent: false,
  },
});
