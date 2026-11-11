import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from '@openrouter/sdk/lib/http.js';
import {
  AiError,
  APP_TITLE,
  SYSTEM_PROMPT,
  buildMessages,
  createOpenRouterAi,
  parseResetHeader,
  type ChatTurn,
} from '../src/services/ai.js';
import { testConfig } from './helpers/config.js';

const API_KEY = 'sk-or-v1-test-key-should-never-leak';
const aiConfig = {
  ...testConfig({ OPENROUTER_API_KEY: API_KEY, OPENROUTER_MODEL: 'test/model:free' }).ai,
  timeoutMs: 50,
  contextMessages: 10,
};

/** A chat completion shaped like OpenRouter's real responses. */
function completion(content: unknown, model = 'test/model:free') {
  return {
    id: 'gen-1',
    object: 'chat.completion',
    created: 1,
    model,
    system_fingerprint: null,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Sent = { url: string; method: string; headers: Headers; body: Record<string, unknown> };

/** A fake network: records the request and returns `response`. */
function fakeFetcher(response: () => Response) {
  const sent: Sent[] = [];
  const fetcher = vi.fn<Fetcher>(async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    sent.push({ url: req.url, method: req.method, headers: req.headers, body: JSON.parse(await req.text()) });
    return response();
  });
  return { fetcher, sent };
}

async function expectAiError(promise: Promise<unknown>, pattern: RegExp): Promise<AiError> {
  const err = await promise.then(
    () => expect.fail('expected an AiError'),
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AiError);
  expect((err as Error).message).toMatch(pattern);
  expect((err as Error).message).not.toContain(API_KEY);
  return err as AiError;
}

describe('buildMessages', () => {
  const history: ChatTurn[] = [
    { role: 'user', content: 'q1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'q2' },
    { role: 'assistant', content: 'a2' },
  ];

  it('AI-02: starts with the customer-support system prompt', () => {
    const [first] = buildMessages([], 'hi', 10);
    expect(first).toEqual({ role: 'system', content: SYSTEM_PROMPT });
  });

  it('AI-02: the prompt forbids inventing orders/accounts/policies and asks for plain text', () => {
    expect(SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(SYSTEM_PROMPT).toMatch(/order/i);
    expect(SYSTEM_PROMPT).toMatch(/account/i);
    expect(SYSTEM_PROMPT).toMatch(/polic/i);
    expect(SYSTEM_PROMPT).toMatch(/plain text/i);
  });

  it('AI-03: sends prior turns oldest-first, then the new message', () => {
    expect(buildMessages(history, 'q3', 10).slice(1)).toEqual([...history, { role: 'user', content: 'q3' }]);
  });

  it('AI-03: keeps only the most recent N turns', () => {
    expect(buildMessages(history, 'q3', 2).slice(1)).toEqual([
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' },
    ]);
  });

  it('AI-03: a limit of 0 sends no history', () => {
    expect(buildMessages(history, 'q3', 0)).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'q3' },
    ]);
  });

  it('strips unexpected fields from history turns', () => {
    const withExtras = [{ role: 'user', content: 'q', _id: 'x', userId: 'secret' }] as unknown as ChatTurn[];
    expect(buildMessages(withExtras, 'next', 10)[1]).toEqual({ role: 'user', content: 'q' });
  });
});

describe('createOpenRouterAi', () => {
  it('AI-01: posts to OpenRouter with auth, attribution headers, model and messages', async () => {
    const { fetcher, sent } = fakeFetcher(() => json(200, completion('Hello!')));
    const history: ChatTurn[] = [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }];

    await createOpenRouterAi(aiConfig, fetcher).reply(history, 'How do I reset my password?');

    expect(sent).toHaveLength(1);
    const [req] = sent;
    expect(req!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(req!.method).toBe('POST');
    expect(req!.headers.get('authorization')).toBe(`Bearer ${API_KEY}`);
    expect(req!.headers.get('http-referer')).toBe(aiConfig.referer);
    expect(req!.headers.get('x-openrouter-title')).toBe(APP_TITLE);
    expect(req!.body).toEqual({
      model: 'test/model:free',
      messages: buildMessages(history, 'How do I reset my password?', 10),
      stream: false,
    });
  });

  it('AI-01: returns the trimmed reply and the model that answered', async () => {
    const { fetcher } = fakeFetcher(() => json(200, completion('\n  Click "Forgot password".  \n', 'actual/model')));

    await expect(createOpenRouterAi(aiConfig, fetcher).reply([], 'hi')).resolves.toEqual({
      content: 'Click "Forgot password".',
      model: 'actual/model',
    });
  });

  it('AI-01: joins text parts when the reply is a list of content parts', async () => {
    const parts = [
      { type: 'text', text: 'Part one. ' },
      { type: 'text', text: 'Part two.' },
    ];
    const { fetcher } = fakeFetcher(() => json(200, completion(parts)));

    await expect(createOpenRouterAi(aiConfig, fetcher).reply([], 'hi')).resolves.toMatchObject({
      content: 'Part one. Part two.',
    });
  });

  it('AI-04: makes exactly one attempt on a 5xx (no SDK retries)', async () => {
    const { fetcher } = fakeFetcher(() => json(503, { error: { message: 'Overloaded', code: 503 } }));

    await expectAiError(createOpenRouterAi(aiConfig, fetcher).reply([], 'hi'), /503/);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    [500, { error: { message: 'Internal error', code: 500 } }],
    [404, { error: { message: 'This model is unavailable for free', code: 404 } }],
    [429, { error: { message: 'Rate limit exceeded', code: 429 } }],
    [401, { error: { message: `Invalid key ${API_KEY}`, code: 401 } }],
  ])('AI-04: HTTP %i becomes an AiError with the status and model, never the key', async (status, body) => {
    const { fetcher } = fakeFetcher(() => json(status, body));

    const err = await expectAiError(
      createOpenRouterAi(aiConfig, fetcher).reply([], 'hi'),
      new RegExp(`OpenRouter error ${status} \\(model test/model:free\\)`),
    );
    expect(err.status).toBe(status);
  });

  it('AI-05: the daily free-model limit becomes a daily_quota AiError with the reset time', async () => {
    const resetMs = Date.now() + 3 * 60 * 60 * 1000;
    const { fetcher } = fakeFetcher(
      () =>
        new Response(
          JSON.stringify({
            error: { message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', code: 429 },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'X-RateLimit-Reset': String(resetMs) } },
        ),
    );

    const err = await expectAiError(createOpenRouterAi(aiConfig, fetcher).reply([], 'hi'), /daily free quota/);

    expect(err.kind).toBe('daily_quota');
    expect(err.resetAt).toBe(new Date(resetMs).toISOString());
  });

  it('AI-05: an upstream provider being briefly busy (429) stays retryable', async () => {
    const { fetcher } = fakeFetcher(() =>
      json(429, {
        error: {
          message: 'Provider returned error',
          code: 429,
          metadata: { raw: 'google/gemma is temporarily rate-limited upstream. Please retry shortly' },
        },
      }),
    );

    const err = await expectAiError(createOpenRouterAi(aiConfig, fetcher).reply([], 'hi'), /429/);
    expect(err.kind).toBe('unavailable');
  });

  it.each([
    [null, undefined],
    ['nonsense', undefined],
    [String(Date.now() - 1000), undefined], // in the past
    [String(Date.now() + 10 * 24 * 3600 * 1000), undefined], // absurdly far
  ])('parseResetHeader(%s) → %s', (value, expected) => {
    expect(parseResetHeader(value)).toBe(expected);
  });

  it('parseResetHeader accepts epoch seconds as well as milliseconds', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    expect(parseResetHeader(String(now / 1000 + 3600), now)).toBe('2026-01-01T01:00:00.000Z');
    expect(parseResetHeader(String(now + 3600_000), now)).toBe('2026-01-01T01:00:00.000Z');
  });

  it('AI-04: an error body with HTTP 200 becomes an AiError', async () => {
    const { fetcher } = fakeFetcher(() => json(200, { error: { message: 'Provider returned error', code: 502 } }));
    await expectAiError(createOpenRouterAi(aiConfig, fetcher).reply([], 'hi'), /unexpected response/);
  });

  it.each([
    ['null content', completion(null)],
    ['whitespace content', completion('   \n ')],
    ['no text parts', completion([{ type: 'image_url', image_url: { url: 'x' } }])],
  ])('AI-04: %s becomes an AiError', async (_label, body) => {
    const { fetcher } = fakeFetcher(() => json(200, body));
    await expectAiError(createOpenRouterAi(aiConfig, fetcher).reply([], 'hi'), /empty reply/);
  });

  it('AI-04: a non-JSON response becomes an AiError', async () => {
    const { fetcher } = fakeFetcher(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    const err = await expectAiError(createOpenRouterAi(aiConfig, fetcher).reply([], 'hi'), /OpenRouter error 502/);
    expect(err.status).toBe(502);
  });

  it('AI-04: a network failure becomes an AiError', async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new TypeError('fetch failed');
    });
    await expectAiError(createOpenRouterAi(aiConfig, fetcher).reply([], 'hi'), /request failed/);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('AI-04: gives up after AI_TIMEOUT_MS', async () => {
    // A network that never answers on its own, only reacts to the abort signal.
    const hanging = vi.fn<Fetcher>((input, init) => {
      const signal = input instanceof Request ? input.signal : init?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason));
      });
    });

    const started = Date.now();
    await expectAiError(createOpenRouterAi(aiConfig, hanging).reply([], 'hi'), /timed out after 50ms/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('AI-04: also reports a timeout that hits while the body is still downloading', async () => {
    // Headers arrive at once, but the body stream never finishes before the abort.
    const slowBody = vi.fn<Fetcher>(async (input, init) => {
      const signal = input instanceof Request ? input.signal : init?.signal;
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"id":"gen-1",'));
          signal?.addEventListener('abort', () => controller.error(signal.reason));
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    await expectAiError(createOpenRouterAi(aiConfig, slowBody).reply([], 'hi'), /timed out after 50ms/);
  });
});
