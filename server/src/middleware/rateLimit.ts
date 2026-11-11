import { rateLimit, ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Config } from '../config.js';
import { AppError } from '../lib/AppError.js';

export const AUTH_WINDOW_MS = 15 * 60 * 1000;

type LimiterOptions = { windowMs: number; limit: number; enabled: boolean; message: string; key: 'user' | 'ip' };

/**
 * BON-02: one in-memory limiter. Over the limit → 429 RATE_LIMITED in the
 * contract error shape, with standard RateLimit and Retry-After headers.
 * A single server instance (Render free tier) needs no shared store.
 */
function createLimiter({ windowMs, limit, enabled, message, key }: LimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !enabled,
    // Per user when logged in (chat); per IP otherwise. ipKeyGenerator groups
    // IPv6 addresses by subnet so one client can't dodge the limit.
    keyGenerator: (req) =>
      key === 'user' && req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', message)),
  });
}

/** BON-02: POST /chat/send, per user. Mount after requireAuth. */
export function createChatLimiter(config: Pick<Config, 'rateLimit'>): RateLimitRequestHandler {
  return createLimiter({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    enabled: config.rateLimit.enabled,
    key: 'user',
    message: 'You’re sending messages too fast. Please wait a moment and try again.',
  });
}

/** BON-02: POST /auth/login and /auth/signup, per IP, shared 15-minute window. */
export function createAuthLimiter(config: Pick<Config, 'rateLimit'>): RateLimitRequestHandler {
  return createLimiter({
    windowMs: AUTH_WINDOW_MS,
    limit: config.rateLimit.authMax,
    enabled: config.rateLimit.enabled,
    key: 'ip',
    message: 'Too many attempts. Please wait a few minutes and try again.',
  });
}
