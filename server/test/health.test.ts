import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { testConfig } from './helpers/config.js';

describe('GET /health', () => {
  it('returns 200 { status: "ok" }', async () => {
    const res = await request(createApp({ config: testConfig() })).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(createApp({ config: testConfig() })).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows credentialed CORS only from the configured origin', async () => {
    const app = createApp({ config: testConfig({ CLIENT_ORIGIN: 'http://localhost:5173' }) });

    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const blocked = await request(app).get('/health').set('Origin', 'http://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
