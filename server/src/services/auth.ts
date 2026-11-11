import bcrypt from 'bcrypt';
import type { Config } from '../config.js';
import { AppError } from '../lib/AppError.js';
import { User, type UserDocument } from '../models/User.js';

export type SignupInput = { name: string; email: string; password: string };

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

/**
 * AUTH-01 / AUTH-04: create a user with a bcrypt-hashed password.
 * The unique index on email (not a pre-check) decides duplicates, so two
 * simultaneous signups with the same email can't both succeed.
 */
export async function signup(input: SignupInput, config: Pick<Config, 'bcryptRounds'>): Promise<UserDocument> {
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  try {
    return await User.create({ name: input.name, email: input.email, passwordHash });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}
