import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

function fullUrl(req: IncomingMessage): string {
  return (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '';
}

/** Accept a caller's X-Request-Id only if it looks like an id (no log injection). */
const REQUEST_ID = /^[\w-]{8,64}$/;

/**
 * BON-03: one log line per request: method, path, status, duration and a
 * request id (also returned as X-Request-Id, so a user's report can be
 * matched to the server log). Bodies, cookies and auth headers are never
 * logged. /health is skipped: platforms call it every few seconds.
 */
export function createRequestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/health' },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Express shortens req.url inside mounted routers ("/signup"); originalUrl
    // keeps the full path ("/auth/signup").
    customSuccessMessage: (req, res, responseTime) =>
      `${req.method} ${fullUrl(req)} ${res.statusCode} ${Math.round(responseTime)}ms`,
    customErrorMessage: (req, res) => `${req.method} ${fullUrl(req)} ${res.statusCode}`,
    // Keep request/response records small: no headers, no bodies.
    serializers: {
      req: (req: { id: unknown; method: string; url: string; raw?: { originalUrl?: string } }) => ({
        id: req.id,
        method: req.method,
        url: req.raw?.originalUrl ?? req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
