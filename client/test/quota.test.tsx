import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { formatQuotaReset } from '../src/lib/relativeTime.ts';
import { apiUrl, chatApi, errorResponse, session } from './msw/handlers.ts';
import { server } from './msw/server.ts';
import { renderApp } from './renderApp.tsx';

const QUOTA_MESSAGE = 'Today’s free AI quota has been used up. Please try again tomorrow.';

/** POST /chat/send answers 503 AI_QUOTA_EXCEEDED (AI-05). */
function quotaUsedUp(resetAt?: string) {
  let calls = 0;
  server.use(
    session.loggedIn(),
    chatApi.history([]),
    http.post(apiUrl('/chat/send'), () => {
      calls += 1;
      return errorResponse(503, 'AI_QUOTA_EXCEEDED', QUOTA_MESSAGE, resetAt ? { resetAt } : undefined);
    }),
  );
  return { calls: () => calls };
}

async function sendFirstMessage(text = 'Hello') {
  const view = renderApp('/');
  await view.user.type(await screen.findByRole('textbox', { name: 'Message' }), `${text}{Enter}`);
  return view;
}

describe('AI daily quota used up (AI-05)', () => {
  it('AI-05: shows the quota notice in the chat box', async () => {
    quotaUsedUp();
    await sendFirstMessage();

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Today’s free AI quota has been used up. You can chat again tomorrow.');
  });

  it('AI-05: names the time when the server says when the quota resets', async () => {
    const resetAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    quotaUsedUp(resetAt);
    await sendFirstMessage();

    expect(await screen.findByRole('alert')).toHaveTextContent(`You can chat again ${formatQuotaReset(resetAt)}.`);
  });

  it('AI-05: keeps the message as "Not sent." with Dismiss only — no Retry', async () => {
    quotaUsedUp();
    const { user } = await sendFirstMessage('Will this work?');
    await screen.findByRole('alert');

    const log = screen.getByRole('log', { name: 'Messages' });
    expect(within(log).getByText('Will this work?')).toBeInTheDocument();
    expect(screen.getByText('Not sent.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Will this work?')).not.toBeInTheDocument();
    // The quota notice stays until the quota resets.
    expect(screen.getByRole('alert')).toHaveTextContent('free AI quota');
  });

  it('AI-05: disables Send (typing still works) so no more requests are made', async () => {
    const api = quotaUsedUp();
    const { user } = await sendFirstMessage();
    await screen.findByRole('alert');

    const box = screen.getByRole('textbox', { name: 'Message' });
    await user.type(box, 'Another try{Enter}');

    expect(box).toHaveValue('Another try');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(api.calls()).toBe(1);
  });

  it('AI-05: re-enables Send when the reset time passes', async () => {
    quotaUsedUp(new Date(Date.now() + 300).toISOString());
    const { user } = await sendFirstMessage();
    await screen.findByRole('alert');
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Later');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    await waitFor(() => expect(screen.queryByText(/free AI quota/)).not.toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('other AI failures still offer Retry (not treated as quota)', async () => {
    server.use(
      session.loggedIn(),
      chatApi.history([]),
      http.post(apiUrl('/chat/send'), () =>
        errorResponse(502, 'AI_UNAVAILABLE', 'The assistant is unavailable right now. Please try again.'),
      ),
    );
    await sendFirstMessage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Not sent. The assistant is unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText(/free AI quota/)).not.toBeInTheDocument();
  });
});

describe('formatQuotaReset', () => {
  const now = new Date(2026, 2, 10, 14, 0); // 10 Mar 2026, 2:00 PM local

  it('says "after <time>" for later today', () => {
    expect(formatQuotaReset(new Date(2026, 2, 10, 17, 30).toISOString(), now)).toBe('after 5:30 PM');
  });

  it('says "tomorrow after <time>" for tomorrow', () => {
    expect(formatQuotaReset(new Date(2026, 2, 11, 5, 30).toISOString(), now)).toBe('tomorrow after 5:30 AM');
  });

  it.each([undefined, 'garbage', new Date(2026, 2, 10, 9, 0).toISOString()])(
    'falls back to "tomorrow" for %s',
    (value) => {
      expect(formatQuotaReset(value, now)).toBe('tomorrow');
    },
  );
});
