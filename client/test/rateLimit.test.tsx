import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http } from 'msw';
import { apiUrl, chatApi, errorResponse, session } from './msw/handlers.ts';
import { server } from './msw/server.ts';
import { renderApp } from './renderApp.tsx';

describe('Rate limit messages (BON-02)', () => {
  it('BON-02: sending too fast shows a friendly message and keeps the text for Retry', async () => {
    let sendCalls = 0;
    server.use(
      session.loggedIn(),
      chatApi.history([]),
      http.post(apiUrl('/chat/send'), () => {
        sendCalls += 1;
        return errorResponse(429, 'RATE_LIMITED', 'You’re sending messages too fast. Please wait a moment and try again.');
      }),
    );
    const { user } = renderApp('/');

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Hello{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not sent. You’re sending messages too fast. Please wait a moment and try again.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(sendCalls).toBe(1); // a 429 is never retried automatically
  });

  it('BON-02: too many login attempts shows the server’s message', async () => {
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        errorResponse(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'),
      ),
    );
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'some-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Please wait a few minutes and try again.');
  });

  it('BON-02: too many signup attempts shows the server’s message', async () => {
    server.use(
      http.post(apiUrl('/auth/signup'), () =>
        errorResponse(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'),
      ),
    );
    const { user } = renderApp('/signup');

    await user.type(await screen.findByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'some-password');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });
});
