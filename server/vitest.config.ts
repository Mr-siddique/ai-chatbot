import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Live tests hit real services and use quota: run them with `npm run test:live`.
    exclude: ['test/live/**', 'node_modules/**'],
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
