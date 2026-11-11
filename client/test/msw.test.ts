import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './msw/server.ts';

describe('test HTTP mocking', () => {
  it('serves mocked responses for /api requests', async () => {
    server.use(http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })));

    const res = await fetch('http://localhost/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('blocks requests that have no mock', async () => {
    const error = await fetch('http://localhost/api/not-mocked').catch((err: Error) => err);

    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).cause)).toMatch(/\[MSW\]/);
  });
});
