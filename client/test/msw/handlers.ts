import type { RequestHandler } from 'msw';

/**
 * Default API mocks shared by all tests. Each handler must follow
 * specs/SPEC.md "API contract" exactly. Tests override per case with
 * `server.use(...)`.
 */
export const handlers: RequestHandler[] = [];
