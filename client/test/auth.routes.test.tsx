import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { apiUrl, errorResponse, session, testUser } from './msw/handlers.ts';
import { server } from './msw/server.ts';
import { renderApp } from './renderApp.tsx';
import { queryKeys } from '../src/api/queryClient.ts';
import { listConversations } from '../src/api/chat.ts';

const location = () => screen.getByTestId('location').textContent;

afterEach(() => vi.restoreAllMocks());

describe('routing and session (AUTH-05, AUTH-06)', () => {
  it('AUTH-06: restores a logged-in session on load and shows the chat page', async () => {
    server.use(session.loggedIn());
    renderApp('/');

    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(location()).toBe('/');
  });

  it('AUTH-05: shows a loading state, not the login page, while the session check runs', async () => {
    server.use(
      http.get(apiUrl('/auth/me'), async () => {
        await delay(50);
        return HttpResponse.json({ user: testUser });
      }),
    );
    renderApp('/');

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('heading', { name: 'Log in' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it.each(['/', '/c/6650f0c2a1b2c3d4e5f60719'])('AUTH-05: logged out, %s redirects to /login', async (path) => {
    server.use(session.loggedOut());
    renderApp(path);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(location()).toBe('/login');
  });

  it.each(['/login', '/signup'])('AUTH-05: logged in, %s redirects to /', async (path) => {
    server.use(session.loggedIn());
    renderApp(path);

    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(location()).toBe('/');
  });

  it('UI-01: logged out users can open /login and /signup', async () => {
    renderApp('/signup');
    expect(await screen.findByRole('heading', { name: 'Sign up' })).toBeInTheDocument();
  });

  it('UI-01: unknown routes redirect to /', async () => {
    server.use(session.loggedIn());
    renderApp('/no/such/page');

    await waitFor(() => expect(location()).toBe('/'));
  });

  it('treats an unreachable server on load as logged out', async () => {
    server.use(http.get(apiUrl('/auth/me'), () => HttpResponse.error()));
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});

describe('logout and session expiry (UI-07, UI-05)', () => {
  it('UI-07: logging out calls the server and returns to /login', async () => {
    const logoutCalled = vi.fn();
    server.use(
      session.loggedIn(),
      http.post(apiUrl('/auth/logout'), () => {
        logoutCalled();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(logoutCalled).toHaveBeenCalledOnce();
  });

  it('UI-07: still logs out locally if the logout request fails', async () => {
    server.use(session.loggedIn(), http.post(apiUrl('/auth/logout'), () => HttpResponse.error()));
    const { user } = renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('UI-05: an expired session on a later request sends the user to /login', async () => {
    server.use(session.loggedIn());
    const { user } = renderApp('/');
    await screen.findByRole('button', { name: 'Log out' });

    // The session expires; the next API call gets 401 UNAUTHENTICATED.
    server.use(
      http.post(apiUrl('/auth/logout'), () => errorResponse(401, 'UNAUTHENTICATED', 'Invalid or expired session')),
    );
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});

describe('token storage (UI-06)', () => {
  it('UI-06: never writes to localStorage or sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    server.use(session.loggedIn());
    const { user } = renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    await screen.findByRole('heading', { name: 'Log in' });

    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('server data cache (TanStack Query)', () => {
  it('logging out drops cached server data so the next user never sees it', async () => {
    server.use(session.loggedIn());
    const { user, queryClient } = renderApp('/');
    await screen.findByRole('button', { name: 'Log out' });
    queryClient.setQueryData(queryKeys.conversations, [{ id: 'c1', title: 'Private chat' }]);

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('heading', { name: 'Log in' });

    expect(queryClient.getQueryData(queryKeys.conversations)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.me)).toBeNull();
  });

  it('an expired session also drops cached server data', async () => {
    server.use(session.loggedIn());
    const { queryClient } = renderApp('/');
    await screen.findByRole('button', { name: 'Log out' });
    queryClient.setQueryData(queryKeys.conversations, [{ id: 'c1', title: 'Private chat' }]);

    server.use(http.get(apiUrl('/chat/history'), () => errorResponse(401, 'UNAUTHENTICATED', 'Expired')));
    await listConversations().catch(() => undefined);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(queryClient.getQueryData(queryKeys.conversations)).toBeUndefined();
  });
});
