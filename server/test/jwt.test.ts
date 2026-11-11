import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken } from '../src/lib/jwt.js';
import { AppError } from '../src/lib/AppError.js';
import { testConfig } from './helpers/config.js';

const config = testConfig();
const userId = '64b7f0c2a1b2c3d4e5f60718';

function expectUnauthenticated(token: string) {
  try {
    verifyToken(token, config);
    expect.fail('verifyToken should have thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  }
}

describe('jwt', () => {
  it('AUTH-02: signs a token whose sub is the user id and that expires', () => {
    const token = signToken(userId, config);
    const payload = jwt.decode(token) as jwt.JwtPayload;

    expect(payload.sub).toBe(userId);
    expect(payload.exp! - payload.iat!).toBe(config.jwt.expiresInSeconds);
  });

  it('round-trips: verifyToken returns the user id', () => {
    expect(verifyToken(signToken(userId, config), config)).toEqual({ userId });
  });

  it('AUTH-05: rejects a token signed with another secret', () => {
    const other = testConfig({ JWT_SECRET: 'a-completely-different-secret-of-32-chars!' });
    expectUnauthenticated(signToken(userId, other));
  });

  it('AUTH-05: rejects an expired token', () => {
    const expired = jwt.sign({ sub: userId, exp: Math.floor(Date.now() / 1000) - 10 }, config.jwt.secret);
    expectUnauthenticated(expired);
  });

  it('AUTH-05: rejects a tampered token', () => {
    const [header, , signature] = signToken(userId, config).split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'someone-else' })).toString('base64url');
    expectUnauthenticated(`${header}.${forgedPayload}.${signature}`);
  });

  it('AUTH-05: rejects an unsigned (alg: none) token', () => {
    const unsigned = jwt.sign({ sub: userId }, '', { algorithm: 'none' });
    expectUnauthenticated(unsigned);
  });

  it('AUTH-05: rejects a token without a subject', () => {
    expectUnauthenticated(jwt.sign({ foo: 'bar' }, config.jwt.secret));
  });

  it('AUTH-05: rejects garbage', () => {
    expectUnauthenticated('not-a-jwt');
  });
});
