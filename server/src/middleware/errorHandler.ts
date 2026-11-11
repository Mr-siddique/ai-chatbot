import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { AppError, type ErrorCode } from '../lib/AppError.js';

type ErrorBody = { error: { code: ErrorCode; message: string; details?: unknown } };

/** Client errors thrown by express.json(): a string `type` plus a 4xx `status`. */
function isBodyParserError(err: unknown): err is { type: string; status: number } {
  if (typeof err !== 'object' || err === null) return false;
  const { type, status } = err as { type?: unknown; status?: unknown };
  return typeof type === 'string' && typeof status === 'number' && status >= 400 && status < 500;
}

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return AppError.validation(
      'Invalid request',
      err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') return AppError.validation('Malformed JSON body');
    if (err.type === 'entity.too.large') return AppError.validation('Request body too large');
    return AppError.validation('Invalid request body');
  }

  return null;
}

/** Last middleware: formats every error per the API contract. */
export function createErrorHandler(options: { logger: Logger; exposeDetails: boolean }): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const known = toAppError(err);
    if (known) {
      const body: ErrorBody = { error: { code: known.code, message: known.message } };
      if (known.details !== undefined) body.error.details = known.details;
      res.status(known.status).json(body);
      return;
    }

    // Unexpected: log the full error server-side, return a generic message.
    options.logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
    const body: ErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong' } };
    if (options.exposeDetails && err instanceof Error) body.error.details = err.message;
    res.status(500).json(body);
  };
}

/** Catch-all for unmatched routes. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
};
