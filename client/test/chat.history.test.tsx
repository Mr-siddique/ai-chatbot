import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { formatRelativeTime } from '../src/lib/relativeTime.ts';
import { apiUrl, chatApi, errorResponse, fixtures, session } from './msw/handlers.ts';
import { server } from './msw/server.ts';
import { renderApp } from './renderApp.tsx';

afterEach(() => vi.restoreAllMocks());

async function renderChat(path = '/') {
  server.use(session.loggedIn(), chatApi.history(), chatApi.conversation());
  const view = renderApp(path);
  await screen.findByRole('button', { name: 'Log out' });
  return view;
}

const sidebar = () => screen.getByRole('navigation', { name: 'Conversations' });
const location = () => screen.getByTestId('location').textContent;

describe('Conversation list (UI-04)', () => {
  it('UI-04: lists past conversations in the order the server returns (newest first)', async () => {
    await renderChat();

    const links = await within(sidebar()).findAllByRole('link', { name: /order|address/i });
    expect(links.map((link) => link.querySelector('span')?.textContent)).toEqual([
      'Delivery address change',
      'Refund for order',
    ]);
    expect(links[0]).toHaveAttribute('href', '/c/c2');
  });

  it('shows when each conversation was last active', async () => {
    await renderChat();

    const time = (await within(sidebar()).findByText('Refund for order')).parentElement!.querySelector('time');
    expect(time).toHaveAttribute('dateTime', '2026-01-01T09:02:00.000Z');
    expect(time?.textContent).not.toBe('');
  });

  it('shows a loading state, then the list', async () => {
    server.use(
      session.loggedIn(),
      http.get(apiUrl('/chat/history'), async () => {
        await delay(50);
        return HttpResponse.json({ conversations: fixtures.conversations });
      }),
    );
    renderApp('/');

    expect(await screen.findByText('Loading conversations…')).toBeInTheDocument();
    expect(await within(sidebar()).findByText('Refund for order')).toBeInTheDocument();
    expect(screen.queryByText('Loading conversations…')).not.toBeInTheDocument();
  });

  it('shows "No conversations yet." for a new user', async () => {
    server.use(session.loggedIn(), chatApi.history([]));
    renderApp('/');

    expect(await within(await screen.findByRole('navigation', { name: 'Conversations' })).findByText('No conversations yet.')).toBeInTheDocument();
  });

  it('offers Retry when the list fails to load, and recovers', async () => {
    let fail = true;
    server.use(
      session.loggedIn(),
      http.get(apiUrl('/chat/history'), () =>
        fail ? errorResponse(500, 'INTERNAL', 'Something went wrong') : HttpResponse.json({ conversations: fixtures.conversations }),
      ),
    );
    const { user } = renderApp('/');

    expect(await screen.findByText('Couldn’t load your conversations.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await within(sidebar()).findByText('Refund for order')).toBeInTheDocument();
  });
});

describe('Opening a conversation (UI-04, UI-03)', () => {
  it('UI-04: clicking a conversation opens it at /c/:id and highlights it', async () => {
    const { user } = await renderChat();

    await user.click(await within(sidebar()).findByRole('link', { name: /Refund for order/ }));

    expect(location()).toBe('/c/c1');
    expect(await screen.findByText('How do I get a refund?')).toBeInTheDocument();
    expect(within(sidebar()).getByRole('link', { name: /Refund for order/ })).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar()).getByRole('link', { name: /Delivery address/ })).not.toHaveAttribute('aria-current');
  });

  it('UI-04: loads the conversation directly from the URL', async () => {
    await renderChat('/c/c2');

    const log = await screen.findByRole('log', { name: 'Messages' });
    expect(within(log).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'You said:Can I change my address?',
      'Assistant said:Yes, before it ships.',
    ]);
    expect(screen.getByRole('heading', { name: 'Delivery address change' })).toBeInTheDocument();
  });

  it('UI-03: keeps line breaks in messages', async () => {
    await renderChat('/c/c1');

    const reply = await within(await screen.findByRole('log', { name: 'Messages' })).findByText(/Here is how:/);
    expect(reply.textContent).toBe('Here is how:\n1. Open the help page\n2. Choose "Refund"');
  });

  it('UI-03: scrolls to the newest message', async () => {
    // jsdom has no scrollIntoView; install a spy and remove it afterwards.
    const original = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      await renderChat('/c/c1');
      await screen.findByText('How do I get a refund?');

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end' });
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('shows "Conversation not found" for a missing or foreign conversation', async () => {
    const { user } = await renderChat('/c/does-not-exist');

    expect(await screen.findByRole('heading', { name: 'Conversation not found' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Start a new chat' }));
    expect(location()).toBe('/');
  });

  it('offers Retry when a conversation fails to load for another reason', async () => {
    server.use(session.loggedIn(), chatApi.history(), http.get(apiUrl('/chat/history/:id'), () => HttpResponse.error()));
    renderApp('/c/c1');

    expect(await screen.findByRole('heading', { name: 'Couldn’t load this conversation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('"New chat" goes back to the empty state', async () => {
    const { user } = await renderChat('/c/c1');
    await screen.findByText('How do I get a refund?');

    await user.click(within(sidebar()).getByRole('link', { name: '+ New chat' }));

    expect(location()).toBe('/');
    expect(screen.getByRole('heading', { name: 'How can we help you today?' })).toBeInTheDocument();
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');

  it.each([
    ['2026-03-10T11:59:30.000Z', 'just now'],
    ['2026-03-10T11:55:00.000Z', '5 minutes ago'],
    ['2026-03-10T09:00:00.000Z', '3 hours ago'],
    ['2026-03-09T10:00:00.000Z', 'yesterday'],
    ['2026-03-01T10:00:00.000Z', 'Mar 1'],
    ['2025-12-25T10:00:00.000Z', 'Dec 25, 2025'],
    ['not a date', ''],
  ])('%s → %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });
});
