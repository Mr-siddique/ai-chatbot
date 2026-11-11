import { afterEach, describe, expect, it, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { ApiError, api, setUnauthenticatedHandler } from '../src/api/client.ts';
import * as authApi from '../src/api/auth.ts';
import * as chatApi from '../src/api/chat.ts';
import { apiUrl, errorResponse, testUser } from './msw/handlers.ts';
import { server } from './msw/server.ts';

afterEach(() => setUnauthenticatedHandler(null));

describe('api client', () => {
  it('UI-05: sends every request to /api with credentials (cookies) included', () => {
    expect(api.defaults.baseURL).toBe('/api');
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('UI-05: typed calls hit the contract paths and unwrap the response', async () => {
    const seen: string[] = [];
    server.use(
      http.post(apiUrl('/auth/login'), async ({ request }) => {
        seen.push(`POST /auth/login ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({ user: testUser });
      }),
      http.get(apiUrl('/chat/history'), () => {
        seen.push('GET /chat/history');
        return HttpResponse.json({ conversations: [] });
      }),
    );

    await expect(authApi.login({ email: 'jane@example.com', password: 'pw-12345' })).resolves.toEqual(testUser);
    await expect(chatApi.listConversations()).resolves.toEqual([]);
    expect(seen).toEqual([
      'POST /auth/login {"email":"jane@example.com","password":"pw-12345"}',
      'GET /chat/history',
    ]);
  });

  it('turns contract error bodies into ApiError with status, code, message and field errors', async () => {
    server.use(
      http.post(apiUrl('/auth/signup'), () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Invalid request', [
          { path: 'email', message: 'Enter a valid email address' },
          { path: 'password', message: 'Password must be at least 8 characters' },
        ]),
      ),
    );

    const err = await authApi.signup({ name: 'J', email: 'x', password: 'y' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Invalid request' });
    expect((err as ApiError).fieldErrors()).toEqual({
      email: 'Enter a valid email address',
      password: 'Password must be at least 8 characters',
    });
  });

  it('reports an unreachable server as NETWORK_ERROR', async () => {
    server.use(http.get(apiUrl('/auth/me'), () => HttpResponse.error()));

    await expect(authApi.me()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('reports a client-side timeout with its own message', async () => {
    server.use(
      http.get(apiUrl('/auth/me'), async () => {
        await delay(200);
        return HttpResponse.json({ user: testUser });
      }),
    );

    await expect(api.get('/auth/me', { timeout: 20 })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'The server is taking too long to respond. Please try again.',
    });
  });

  it('reports a non-contract error body as UNKNOWN with a friendly message', async () => {
    server.use(http.get(apiUrl('/chat/history'), () => new HttpResponse('<html>502</html>', { status: 502 })));

    await expect(chatApi.listConversations()).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('UI-05: a 401 UNAUTHENTICATED from any call triggers the logout handler', async () => {
    const onUnauthenticated = vi.fn();
    setUnauthenticatedHandler(onUnauthenticated);
    server.use(
      http.get(apiUrl('/chat/history'), () => errorResponse(401, 'UNAUTHENTICATED', 'Invalid or expired session')),
    );

    await expect(chatApi.listConversations()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('UI-05: a wrong password (401 INVALID_CREDENTIALS) does not trigger it', async () => {
    const onUnauthenticated = vi.fn();
    setUnauthenticatedHandler(onUnauthenticated);
    server.use(
      http.post(apiUrl('/auth/login'), () => errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password')),
    );

    await expect(authApi.login({ email: 'a@b.co', password: 'wrong-pw' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('encodes the conversation id in the URL', async () => {
    let path = '';
    server.use(
      http.get(apiUrl('/chat/history/:id'), ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ conversation: {}, messages: [] });
      }),
    );

    await chatApi.getConversation('a/b');
    expect(path).toBe('/api/chat/history/a%2Fb');
  });
});
