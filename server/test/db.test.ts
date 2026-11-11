import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { isDbConnected } from '../src/db.js';
import { useTestDb } from './helpers/db.js';

useTestDb();

describe('test database helper', () => {
  it('connects to an in-memory MongoDB', () => {
    expect(isDbConnected()).toBe(true);
  });

  it('can write a document', async () => {
    await mongoose.connection.collection('probe').insertOne({ ok: true });
    expect(await mongoose.connection.collection('probe').countDocuments()).toBe(1);
  });

  it('starts each test with empty collections', async () => {
    expect(await mongoose.connection.collection('probe').countDocuments()).toBe(0);
  });
});
