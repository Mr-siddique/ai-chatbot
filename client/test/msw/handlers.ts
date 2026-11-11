import { http, HttpResponse, type RequestHandler } from 'msw';
import type { ErrorBody, ErrorCode, User } from '../../src/api/types.ts';

/** Matches the API under any origin, e.g. http://localhost:3000/api/auth/me. */
export const apiUrl = (path: string) => `*/api${path}`;

export const testUser: User = {
  id: '6650f0c2a1b2c3d4e5f60718',
  name: 'Jane Doe',
  email: 'jane@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export function errorResponse(status: number, code: ErrorCode, message: string, details?: unknown) {
  const body: ErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return HttpResponse.json(body, { status });
}

/** Ready-made session states for tests (use with server.use). */
export const session = {
  loggedIn: (user: User = testUser) => http.get(apiUrl('/auth/me'), () => HttpResponse.json({ user })),
  loggedOut: () =>
    http.get(apiUrl('/auth/me'), () => errorResponse(401, 'UNAUTHENTICATED', 'Authentication required')),
};

/**
 * Default API mocks shared by all tests. Each handler must follow
 * specs/SPEC.md "API contract" exactly. Tests override per case with
 * `server.use(...)`. Default: nobody is logged in.
 */
export const handlers: RequestHandler[] = [
  session.loggedOut(),
  http.post(apiUrl('/auth/logout'), () => new HttpResponse(null, { status: 204 })),
];
