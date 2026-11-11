import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

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
    customSuccessMessage: (req, res, responseTime) =>
      `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,
    customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    // TEMPORARY diagnostic (remove after TRUST_PROXY is set): counts and
    // booleans only — never IP addresses.
    customProps: (req) => {
      const xff = req.headers['x-forwarded-for'];
      const entries = typeof xff === 'string' ? xff.split(',').length : 0;
      const first = typeof xff === 'string' ? xff.split(',')[0]?.trim() : undefined;
      const trueClient = req.headers['true-client-ip'];
      const cfClient = req.headers['cf-connecting-ip'];
      return {
        proxyDiag: {
          xffEntries: entries,
          hasTrueClientIp: typeof trueClient === 'string',
          hasCfConnectingIp: typeof cfClient === 'string',
          trueClientIpEqualsFirstXff: typeof trueClient === 'string' && trueClient === first,
          cfEqualsTrueClient: typeof trueClient === 'string' && trueClient === cfClient,
        },
      };
    },
    // Keep request/response records small: no headers, no bodies.
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
