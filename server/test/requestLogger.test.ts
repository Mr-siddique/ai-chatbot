import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import { testConfig } from './helpers/config.js';
import { createFakeAi } from './helpers/fakeAi.js';

/** An app whose logs (at info level) are captured as parsed JSON lines. */
function appWithCapturedLogs() {
  const lines: Record<string, unknown>[] = [];
  const sink = new Writable({
    write(chunk, _encoding, done) {
      for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line));
      done();
    },
  });
  const config = testConfig({ LOG_LEVEL: 'info' });
  const logger = createLogger(config, sink);
  const app = createApp({ config, logger, ai: createFakeAi().ai });
  const requestLines = () => lines.filter((line) => 'responseTime' in line);
  return { app, lines, requestLines };
}

describe('request logging (BON-03)', () => {
  it('logs one line per request with method, path, status and duration', async () => {
    const { app, requestLines } = appWithCapturedLogs();

    await request(app).get('/auth/me');

    expect(requestLines()).toHaveLength(1);
    const [line] = requestLines();
    expect(line).toMatchObject({
      msg: expect.stringMatching(/^GET \/auth\/me 401 \d+ms$/),
      req: { method: 'GET', url: '/auth/me', id: expect.any(String) },
      res: { statusCode: 401 },
      responseTime: expect.any(Number),
    });
  });

  it('uses warn for 4xx and info for success', async () => {
    const { app, requestLines } = appWithCapturedLogs();

    await request(app).get('/nope'); // 404
    await request(app).post('/auth/logout'); // 204

    const PINO_WARN = 40;
    const PINO_INFO = 30;
    expect(requestLines().map((line) => line.level)).toEqual([PINO_WARN, PINO_INFO]);
  });

  it('returns a request id in X-Request-Id that matches the log line', async () => {
    const { app, requestLines } = appWithCapturedLogs();

    const res = await request(app).get('/auth/me');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestLines()[0]?.req).toMatchObject({ id: res.headers['x-request-id'] });
  });

  it('reuses a well-formed incoming X-Request-Id but rejects a malicious one', async () => {
    const { app } = appWithCapturedLogs();

    const reused = await request(app).get('/auth/me').set('X-Request-Id', 'abc-123-from-proxy');
    expect(reused.headers['x-request-id']).toBe('abc-123-from-proxy');

    // (Raw newlines can't even be sent; Node rejects them.) Anything not id-shaped is replaced.
    for (const bad of ['spaces and <script>', 'a;b=c', 'x'.repeat(200)]) {
      const res = await request(app).get('/auth/me').set('X-Request-Id', bad);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('never logs cookies, auth headers, passwords or bodies', async () => {
    const { app, lines } = appWithCapturedLogs();

    await request(app)
      .post('/auth/login')
      .set('Cookie', 'token=secret-jwt-value')
      .set('Authorization', 'Bearer secret-bearer')
      .send({ email: 'jane@example.com', password: 'super-secret-password' });

    const output = JSON.stringify(lines);
    expect(output).not.toContain('secret-jwt-value');
    expect(output).not.toContain('secret-bearer');
    expect(output).not.toContain('super-secret-password');
    expect(output).not.toContain('jane@example.com');
  });

  it('redacts secret fields if code ever logs them directly', () => {
    const lines: string[] = [];
    const logger = createLogger(
      { nodeEnv: 'production', logLevel: 'info' },
      new Writable({
        write(chunk, _encoding, done) {
          lines.push(chunk.toString());
          done();
        },
      }),
    );

    logger.info({ user: { email: 'a@b.co', passwordHash: '$2b$12$hash' }, password: 'pw', apiKey: 'sk-or-v1-x' }, 'oops');

    expect(lines.join('')).not.toMatch(/\$2b\$12\$hash|"pw"|sk-or-v1-x/);
    expect(lines.join('')).toContain('[redacted]');
  });

  it('does not log /health checks', async () => {
    const { app, requestLines } = appWithCapturedLogs();

    await request(app).get('/health').expect(200);

    expect(requestLines()).toHaveLength(0);
  });
});
