import { describe, expect, it } from 'vitest';
import { User, toPublicUser } from '../src/models/User.js';
import { useTestDb } from './helpers/db.js';

useTestDb();

const FAKE_HASH = '$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234';

async function createUser(overrides: Partial<{ email: string; name: string }> = {}) {
  return User.create({ email: 'Jane@Example.com ', name: ' Jane ', passwordHash: FAKE_HASH, ...overrides });
}

describe('User model', () => {
  it('normalizes email to trimmed lowercase and trims name', async () => {
    const user = await createUser();

    expect(user.email).toBe('jane@example.com');
    expect(user.name).toBe('Jane');
  });

  it('AUTH-04: does not load passwordHash unless explicitly selected', async () => {
    await createUser();

    const plain = await User.findOne({ email: 'jane@example.com' });
    expect(plain?.passwordHash).toBeUndefined();

    const withHash = await User.findOne({ email: 'jane@example.com' }).select('+passwordHash');
    expect(withHash?.passwordHash).toBe(FAKE_HASH);
  });

  it('AUTH-04: JSON output never contains passwordHash, _id or __v', async () => {
    const user = await User.findById((await createUser())._id).select('+passwordHash');
    const json = JSON.parse(JSON.stringify(user));

    expect(json).toEqual({
      id: expect.any(String),
      name: 'Jane',
      email: 'jane@example.com',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('toPublicUser returns only the public fields', async () => {
    const user = await createUser();

    expect(Object.keys(toPublicUser(user)).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    expect(toPublicUser(user).id).toBe(user._id.toString());
  });

  it('AUTH-01: rejects a duplicate email regardless of case', async () => {
    await User.init(); // make sure the unique index exists
    await createUser();

    await expect(createUser({ email: 'JANE@example.COM' })).rejects.toMatchObject({ code: 11000 });
  });

  it('requires email, name and passwordHash', async () => {
    await expect(User.create({})).rejects.toMatchObject({
      errors: {
        email: expect.anything(),
        name: expect.anything(),
        passwordHash: expect.anything(),
      },
    });
  });

  it('rejects names longer than 80 characters', async () => {
    await expect(createUser({ name: 'x'.repeat(81) })).rejects.toThrow(/name/);
  });
});
