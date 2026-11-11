import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client.ts';

/** Cache keys for all server data. Use these, never inline arrays. */
export const queryKeys = {
  me: ['me'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', id] as const,
};

/** Client errors (4xx) won't change on retry; network/5xx get one more try. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000 },
      // Never retry writes automatically: a retried /chat/send would send the message twice.
      mutations: { retry: false },
    },
  });
}
