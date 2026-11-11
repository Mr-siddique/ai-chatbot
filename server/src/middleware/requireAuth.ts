import type { Request, RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import type { Config } from '../config.js';
import { AppError } from '../lib/AppError.js';
import { AUTH_COOKIE } from '../lib/authCookie.js';
import { verifyToken } from '../lib/jwt.js';
import { User, toPublicUser, type PublicUser } from '../models/User.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. Chat code must scope every query by user.id. */
      user?: PublicUser;
    }
  }
}

/**
 * AUTH-05: only the httpOnly `token` cookie is accepted (no Authorization
 * header). Missing, invalid, expired tokens, and tokens for users that no
 * longer exist, all become 401 UNAUTHENTICATED.
 */
export function requireAuth(config: Pick<Config, 'jwt'>): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[AUTH_COOKIE];
    if (typeof token !== 'string' || token === '') {
      throw AppError.unauthenticated();
    }

    const { userId } = verifyToken(token, config);
    if (!isValidObjectId(userId)) {
      throw AppError.unauthenticated('Invalid or expired session');
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      throw AppError.unauthenticated('Invalid or expired session');
    }

    req.user = toPublicUser(user);
    next();
  };
}

/** The authenticated user. Only call in handlers mounted after requireAuth. */
export function authUser(req: Request): PublicUser {
  if (!req.user) throw AppError.unauthenticated();
  return req.user;
}
