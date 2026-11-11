import axios, { AxiosError } from 'axios';
import type { ErrorBody, ErrorCode } from './types.ts';

/**
 * UI-05: the one HTTP client. Calls go to /api on our own origin (a proxy
 * forwards them to the server), and the browser attaches the httpOnly auth
 * cookie automatically. UI-06: the client never sees or stores the token.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 90_000, // above the server's AI timeout, so the server's error wins
});

/** Client-only codes for failures that never reached the server's error format. */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';

/** Every failed request becomes an ApiError with the contract's code and message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ClientErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Per-field messages from a VALIDATION_ERROR, keyed by field name. */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const fields: Record<string, string> = {};
    for (const item of this.details as { path?: unknown; message?: unknown }[]) {
      if (typeof item?.path === 'string' && typeof item.message === 'string' && !(item.path in fields)) {
        fields[item.path] = item.message;
      }
    }
    return fields;
  }
}

function isErrorBody(data: unknown): data is ErrorBody {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as ErrorBody).error?.code === 'string' &&
    typeof (data as ErrorBody).error?.message === 'string'
  );
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof AxiosError) {
    if (!err.response) {
      if (err.code === AxiosError.ECONNABORTED || err.code === AxiosError.ETIMEDOUT) {
        return new ApiError(0, 'NETWORK_ERROR', 'The server is taking too long to respond. Please try again.');
      }
      return new ApiError(0, 'NETWORK_ERROR', 'Can’t reach the server. Check your connection and try again.');
    }
    const { status, data } = err.response;
    if (isErrorBody(data)) {
      return new ApiError(status, data.error.code, data.error.message, data.error.details);
    }
    return new ApiError(status, 'UNKNOWN', 'Something went wrong. Please try again.');
  }
  return new ApiError(0, 'UNKNOWN', 'Something went wrong. Please try again.');
}

/**
 * UI-05: called when any request comes back 401 UNAUTHENTICATED (session
 * missing or expired), so the app can return to the login page. A wrong
 * password is INVALID_CREDENTIALS and does not trigger it.
 */
let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

api.interceptors.response.use(
  (response) => response,
  (err: unknown) => {
    const apiError = toApiError(err);
    if (apiError.status === 401 && apiError.code === 'UNAUTHENTICATED') onUnauthenticated?.();
    return Promise.reject(apiError);
  },
);
