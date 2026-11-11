import type { CookieOptions, Response } from 'express';
import type { Config } from '../config.js';

export const AUTH_COOKIE = 'token';

/**
 * Cookie attributes from specs/SPEC.md: httpOnly so JS can't read it,
 * SameSite=Lax against CSRF, Secure in production. Set and clear must use
 * the same path/attributes or the browser won't remove the cookie.
 */
function baseOptions(config: Pick<Config, 'cookieSecure'>): CookieOptions {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' };
}

export function setAuthCookie(res: Response, token: string, config: Pick<Config, 'cookieSecure' | 'jwt'>): void {
  res.cookie(AUTH_COOKIE, token, {
    ...baseOptions(config),
    maxAge: config.jwt.expiresInSeconds * 1000,
  });
}

export function clearAuthCookie(res: Response, config: Pick<Config, 'cookieSecure'>): void {
  res.clearCookie(AUTH_COOKIE, baseOptions(config));
}
