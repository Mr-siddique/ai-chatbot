import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { pino } from 'pino';
import { z } from 'zod';
import { AppError } from '../src/lib/AppError.js';
import { createErrorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import { createApp } from '../src/app.js';
import { testConfig } from './helpers/config.js';

/** A tiny app with routes that throw each kind of error. */
function buildApp({ exposeDetails = false } = {}) {
  const logger = pino({ level: 'silent' });
  const logError = vi.spyOn(logger, 'error');
  const app = express();
  app.use(express.json({ limit: '1kb' }));

  app.get('/app-error', () => {
    throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
  });
  app.get('/app-error-details', () => {
    throw AppError.validation('Bad input', [{ path: 'email', message: 'Invalid email' }]);
  });
  app.post('/zod', (req) => {
    z.object({ email: z.email(), password: z.string().min(8) }).parse(req.body);
  });
  app.get('/async-app-error', async () => {
    await Promise.resolve();
    throw AppError.notFound('Conversation not found');
  });
  app.get('/crash', () => {
    throw new Error('db password=hunter2 leaked in message');
  });
  app.get('/async-crash', async () => {
    await Promise.resolve();
    throw new Error('async boom');
  });
  app.post('/echo', (req, res) => {
    res.json(req.body);
  });

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger, exposeDetails }));
  return { app, logError };
}

describe('errorHandler', () => {
  it('formats AppError with its status, code and message', async () => {
    const res = await request(buildApp().app).get('/app-error');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });
  });

  it('includes AppError details when provided', async () => {
    const res = await request(buildApp().app).get('/app-error-details');

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: 'email', message: 'Invalid email' }]);
  });

  it('handles errors thrown in async handlers (Express 5)', async () => {
    const res = await request(buildApp().app).get('/async-app-error');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
  });

  it('maps ZodError to 400 VALIDATION_ERROR with per-field details', async () => {
    const res = await request(buildApp().app).post('/zod').send({ email: 'nope', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'email' }),
        expect.objectContaining({ path: 'password' }),
      ]),
    );
  });

  it('maps malformed JSON to 400 VALIDATION_ERROR', async () => {
    const res = await request(buildApp().app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' } });
  });

  it('maps an oversized body to 400 VALIDATION_ERROR', async () => {
    const res = await request(buildApp().app).post('/echo').send({ text: 'x'.repeat(2000) });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Request body too large' });
  });

  it('returns a generic 500 for unexpected errors and logs the real one', async () => {
    const { app, logError } = buildApp();
    const res = await request(app).get('/crash');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(res.text).not.toMatch(/at .*\.ts/); // no stack trace
    expect(logError).toHaveBeenCalledOnce();
  });

  it('handles unexpected async errors the same way', async () => {
    const res = await request(buildApp().app).get('/async-crash');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
  });

  it('exposes the error message as details only when enabled (dev)', async () => {
    const res = await request(buildApp({ exposeDetails: true }).app).get('/async-crash');

    expect(res.body.error.details).toBe('async boom');
  });

  it('returns 404 NOT_FOUND for unknown routes', async () => {
    const res = await request(buildApp().app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route GET /does-not-exist not found' } });
  });
});

describe('createApp error wiring', () => {
  it('returns the contract shape for unknown routes', async () => {
    const res = await request(createApp({ config: testConfig() })).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns the contract shape for malformed JSON', async () => {
    const res = await request(createApp({ config: testConfig() }))
      .post('/nope')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
