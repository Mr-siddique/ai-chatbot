import { http, HttpResponse, type RequestHandler } from 'msw';
import type { ConversationSummary, ErrorBody, ErrorCode, Message, User } from '../../src/api/types.ts';

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

/** Sample chat data shaped exactly like the API's responses. */
export const fixtures = {
  conversations: [
    { id: 'c2', title: 'Delivery address change', createdAt: '2026-01-02T10:00:00.000Z', updatedAt: '2026-01-02T10:05:00.000Z' },
    { id: 'c1', title: 'Refund for order', createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:02:00.000Z' },
  ] satisfies ConversationSummary[],
  messages: {
    c1: [
      { id: 'm1', conversationId: 'c1', role: 'user', content: 'How do I get a refund?', createdAt: '2026-01-01T09:00:00.000Z' },
      { id: 'm2', conversationId: 'c1', role: 'assistant', content: 'Here is how:\n1. Open the help page\n2. Choose "Refund"', createdAt: '2026-01-01T09:00:00.000Z' },
    ],
    c2: [
      { id: 'm3', conversationId: 'c2', role: 'user', content: 'Can I change my address?', createdAt: '2026-01-02T10:00:00.000Z' },
      { id: 'm4', conversationId: 'c2', role: 'assistant', content: 'Yes, before it ships.', createdAt: '2026-01-02T10:00:00.000Z' },
    ],
  } satisfies Record<string, Message[]>,
};

/** Chat API backed by `fixtures` (use with server.use). */
export const chatApi = {
  history: (conversations: ConversationSummary[] = fixtures.conversations) =>
    http.get(apiUrl('/chat/history'), () => HttpResponse.json({ conversations })),
  conversation: () =>
    http.get(apiUrl('/chat/history/:id'), ({ params }) => {
      const id = String(params.id);
      const conversation = fixtures.conversations.find((c) => c.id === id);
      const messages = fixtures.messages[id as keyof typeof fixtures.messages];
      if (!conversation || !messages) return errorResponse(404, 'NOT_FOUND', 'Conversation not found');
      return HttpResponse.json({ conversation, messages });
    }),
};

/**
 * Default API mocks shared by all tests. Each handler must follow
 * specs/SPEC.md "API contract" exactly. Tests override per case with
 * `server.use(...)`. Default: nobody is logged in.
 */
export const handlers: RequestHandler[] = [
  session.loggedOut(),
  chatApi.history([]),
  http.post(apiUrl('/auth/logout'), () => new HttpResponse(null, { status: 204 })),
];
