import jwt from 'jsonwebtoken';
import type { Config } from '../config.js';
import { AppError } from './AppError.js';

const ALGORITHM = 'HS256';

/** Signs a session token whose `sub` is the user id. */
export function signToken(userId: string, config: Pick<Config, 'jwt'>): string {
  return jwt.sign({}, config.jwt.secret, {
    subject: userId,
    expiresIn: config.jwt.expiresInSeconds,
    algorithm: ALGORITHM,
  });
}

/**
 * Verifies a session token and returns the user id. Any problem (bad
 * signature, expired, wrong algorithm, missing sub) becomes a 401.
 */
export function verifyToken(token: string, config: Pick<Config, 'jwt'>): { userId: string } {
  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: [ALGORITHM] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || payload.sub === '') {
      throw new Error('Token has no subject');
    }
    return { userId: payload.sub };
  } catch {
    throw AppError.unauthenticated('Invalid or expired session');
  }
}
