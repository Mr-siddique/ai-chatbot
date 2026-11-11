import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import { clearAuthCookie, setAuthCookie } from '../lib/authCookie.js';
import { signToken } from '../lib/jwt.js';
import { authUser, requireAuth } from '../middleware/requireAuth.js';
import { toPublicUser } from '../models/User.js';
import * as authService from '../services/auth.js';

/** bcrypt only uses the first 72 bytes of a password. */
const BCRYPT_MAX_BYTES = 72;

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name must be at most 80 characters'),
  email,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES,
      `Password must be at most ${BCRYPT_MAX_BYTES} bytes`,
    ),
});

const loginSchema = z.object({
  email,
  // No strength rules on login: just non-empty and bounded.
  password: z.string().min(1, 'Password is required').max(1024, 'Password is too long'),
});

export function createAuthRouter({ config }: { config: Config }): Router {
  const router = Router();

  // AUTH-01: sign up and start a session.
  router.post('/signup', async (req, res) => {
    const input = signupSchema.parse(req.body); // unknown fields are stripped
    const user = await authService.signup(input, config);

    setAuthCookie(res, signToken(user.id, config), config);
    res.status(201).json({ user: toPublicUser(user) });
  });

  // AUTH-02: log in and start a session.
  router.post('/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await authService.login(input, config);

    setAuthCookie(res, signToken(user.id, config), config);
    res.status(200).json({ user: toPublicUser(user) });
  });

  // AUTH-03: end the session. Idempotent: works with or without a cookie.
  router.post('/logout', (_req, res) => {
    clearAuthCookie(res, config);
    res.sendStatus(204);
  });

  // AUTH-06: who is logged in (lets the client restore a session on reload).
  router.get('/me', requireAuth(config), (req, res) => {
    res.json({ user: authUser(req) });
  });

  return router;
}
