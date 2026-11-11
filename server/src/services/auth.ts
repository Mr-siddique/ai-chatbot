import bcrypt from 'bcrypt';
import type { Config } from '../config.js';
import { AppError } from '../lib/AppError.js';
import { User, type UserDocument } from '../models/User.js';

export type SignupInput = { name: string; email: string; password: string };
export type LoginInput = { email: string; password: string };

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

/** One generic error for every failed login (AUTH-02). */
const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

/** A real bcrypt hash per cost factor, compared against when the email is unknown. */
const dummyHashes = new Map<number, Promise<string>>();
function dummyHash(rounds: number): Promise<string> {
  let hash = dummyHashes.get(rounds);
  if (!hash) {
    hash = bcrypt.hash('not-a-real-password', rounds);
    dummyHashes.set(rounds, hash);
  }
  return hash;
}

/**
 * AUTH-02: check credentials. Unknown email and wrong password fail the same
 * way and both run a bcrypt comparison, so neither the response nor its
 * timing reveals whether an email is registered.
 */
export async function login(input: LoginInput, config: Pick<Config, 'bcryptRounds'>): Promise<UserDocument> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const hash = user?.passwordHash ?? (await dummyHash(config.bcryptRounds));
  const matches = await bcrypt.compare(input.password, hash);

  if (!user || !matches) throw invalidCredentials();
  return user;
}
