import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import type { ConversationSummary, Message, SendBody } from '../src/api/types.ts';
import { apiUrl, errorResponse, fixtures, session } from './msw/handlers.ts';
import { server } from './msw/server.ts';
import { renderApp } from './renderApp.tsx';

type Failure = { status: number; code: 'AI_UNAVAILABLE' | 'INTERNAL'; message: string } | 'network';

/**
 * An in-memory chat backend speaking the API contract. Records what was
 * sent; can be told to fail or to answer slowly.
 */
function mockChatServer() {
  const conversations: ConversationSummary[] = structuredClone(fixtures.conversations);
  const messages: Record<string, Message[]> = structuredClone(fixtures.messages);
  const state = {
    sent: [] as SendBody[],
    historyCalls: 0,
    failNext: [] as Failure[],
    replyDelayMs: 0,
  };
  let nextId = 100;

  server.use(
    session.loggedIn(),
    http.get(apiUrl('/chat/history'), () => {
      state.historyCalls += 1;
      return HttpResponse.json({ conversations });
    }),
    http.get(apiUrl('/chat/history/:id'), ({ params }) => {
      const conversation = conversations.find((c) => c.id === params.id);
      if (!conversation) return errorResponse(404, 'NOT_FOUND', 'Conversation not found');
      return HttpResponse.json({ conversation, messages: messages[conversation.id] ?? [] });
    }),
    http.post(apiUrl('/chat/send'), async ({ request }) => {
      const body = (await request.json()) as SendBody;
      state.sent.push(body);
      if (state.replyDelayMs) await delay(state.replyDelayMs);

      const failure = state.failNext.shift();
      if (failure === 'network') return HttpResponse.error();
      if (failure) return errorResponse(failure.status, failure.code, failure.message);

      const now = new Date().toISOString();
      let id = body.conversationId;
      if (!id) {
        id = `new${nextId++}`;
        conversations.unshift({ id, title: body.message.slice(0, 60), createdAt: now, updatedAt: now });
        messages[id] = [];
      } else {
        const index = conversations.findIndex((c) => c.id === id);
        const [moved] = conversations.splice(index, 1);
        conversations.unshift({ ...moved!, updatedAt: now });
      }
      const userMessage: Message = { id: `m${nextId++}`, conversationId: id, role: 'user', content: body.message, createdAt: now };
      const assistantMessage: Message = {
        id: `m${nextId++}`,
        conversationId: id,
        role: 'assistant',
        content: `Reply to: ${body.message}`,
        createdAt: now,
      };
      messages[id]!.push(userMessage, assistantMessage);
      return HttpResponse.json({ conversationId: id, userMessage, assistantMessage });
    }),
  );
  return state;
}

async function renderChat(path = '/') {
  const view = renderApp(path);
  await screen.findByRole('button', { name: 'Log out' });
  return view;
}

const messageBox = () => screen.getByRole('textbox', { name: 'Message' });
const thread = () => screen.getByRole('log', { name: 'Messages' });
const threadTexts = () => within(thread()).getAllByRole('listitem').map((item) => item.textContent);
const sidebarTitles = () =>
  within(screen.getByRole('navigation', { name: 'Conversations' }))
    .queryAllByRole('link')
    .map((link) => link.querySelector('span')?.textContent)
    .filter(Boolean);
const location = () => screen.getByTestId('location').textContent;

describe('Sending in a new chat (UI-02, UI-03, UI-04)', () => {
  it('UI-03: shows my message at once, then the reply; the chat moves to /c/:id', async () => {
    const api = mockChatServer();
    api.replyDelayMs = 50;
    const { user } = await renderChat('/');

    await user.type(messageBox(), 'Where is my parcel?{Enter}');

    // Optimistic: visible before the server answers, input cleared, status shown.
    expect(threadTexts()).toEqual(['You said:Where is my parcel?']);
    expect(messageBox()).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('Assistant is typing…');

    expect(await screen.findByText('Reply to: Where is my parcel?')).toBeInTheDocument();
    expect(threadTexts()).toEqual(['You said:Where is my parcel?', 'Assistant said:Reply to: Where is my parcel?']);
    expect(location()).toBe('/c/new100');
    expect(api.sent).toEqual([{ message: 'Where is my parcel?' }]);
  });

  it('UI-04: the new conversation appears at the top of the sidebar', async () => {
    mockChatServer();
    const { user } = await renderChat('/');
    await waitFor(() => expect(sidebarTitles()).toEqual(['Delivery address change', 'Refund for order']));

    await user.type(messageBox(), 'Brand new question{Enter}');

    await waitFor(() =>
      expect(sidebarTitles()).toEqual(['Brand new question', 'Delivery address change', 'Refund for order']),
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Conversations' })).getByRole('link', { name: /Brand new question/ }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

describe('Sending in an existing conversation', () => {
  it('UI-03: appends my message and the reply after the earlier ones', async () => {
    const api = mockChatServer();
    const { user } = await renderChat('/c/c1');
    await screen.findByText('How do I get a refund?');

    await user.type(messageBox(), 'Thanks!{Enter}');

    expect(await screen.findByText('Reply to: Thanks!')).toBeInTheDocument();
    expect(threadTexts()).toEqual([
      'You said:How do I get a refund?',
      'Assistant said:Here is how:\n1. Open the help page\n2. Choose "Refund"',
      'You said:Thanks!',
      'Assistant said:Reply to: Thanks!',
    ]);
    expect(api.sent).toEqual([{ message: 'Thanks!', conversationId: 'c1' }]);
    expect(location()).toBe('/c/c1');
  });

  it('UI-04: the conversation moves to the top of the sidebar', async () => {
    mockChatServer();
    const { user } = await renderChat('/c/c1');
    await screen.findByText('How do I get a refund?');
    expect(sidebarTitles()).toEqual(['Delivery address change', 'Refund for order']);

    await user.type(messageBox(), 'One more thing{Enter}');

    await waitFor(() => expect(sidebarTitles()).toEqual(['Refund for order', 'Delivery address change']));
  });
});

describe('While a reply is pending (UI-02)', () => {
  it('UI-02: cannot send a second message until the reply arrives', async () => {
    const api = mockChatServer();
    api.replyDelayMs = 100;
    const { user } = await renderChat('/c/c1');
    await screen.findByText('How do I get a refund?');

    await user.type(messageBox(), 'First{Enter}');
    await user.type(messageBox(), 'Second{Enter}');

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(messageBox()).toHaveValue('Second'); // typing is kept for later
    await screen.findByText('Reply to: First');
    expect(api.sent).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});

describe('When sending fails (UI-03)', () => {
  it('UI-03: keeps my message with the server’s reason and a Retry that works', async () => {
    const api = mockChatServer();
    api.failNext.push({ status: 502, code: 'AI_UNAVAILABLE', message: 'The assistant is unavailable right now. Please try again.' });
    const { user } = await renderChat('/c/c1');
    await screen.findByText('How do I get a refund?');

    await user.type(messageBox(), 'Are you there?{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not sent. The assistant is unavailable right now. Please try again.');
    expect(threadTexts().at(-1)).toBe('You said:Are you there?');

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Reply to: Are you there?')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Exactly one copy of the message in the thread, and two attempts on the server.
    expect(threadTexts().filter((text) => text === 'You said:Are you there?')).toHaveLength(1);
    expect(api.sent).toEqual([
      { message: 'Are you there?', conversationId: 'c1' },
      { message: 'Are you there?', conversationId: 'c1' },
    ]);
  });

  it('never retries a failed send on its own (no duplicate messages)', async () => {
    const api = mockChatServer();
    api.failNext.push('network');
    const { user } = await renderChat('/c/c1');
    await screen.findByText('How do I get a refund?');

    await user.type(messageBox(), 'Hello?{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the server');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.sent).toHaveLength(1);
  });

  it('Dismiss removes the unsent message', async () => {
    const api = mockChatServer();
    api.failNext.push({ status: 500, code: 'INTERNAL', message: 'Something went wrong' });
    const { user } = await renderChat('/c/c1');
    await screen.findByText('How do I get a refund?');

    await user.type(messageBox(), 'Oops{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Oops')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a failure in a new chat stays on / and can be retried into a new conversation', async () => {
    const api = mockChatServer();
    api.failNext.push({ status: 502, code: 'AI_UNAVAILABLE', message: 'The assistant is unavailable right now. Please try again.' });
    const { user } = await renderChat('/');

    await user.type(messageBox(), 'First try{Enter}');
    await screen.findByRole('alert');
    expect(location()).toBe('/');

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Reply to: First try')).toBeInTheDocument();
    expect(location()).toMatch(/^\/c\/new/);
  });
});

describe('Switching conversations mid-send', () => {
  it('the reply still lands in the right conversation, and the screen stays where the user went', async () => {
    const api = mockChatServer();
    api.replyDelayMs = 100;
    const { user } = await renderChat('/c/c1');
    await screen.findByText('How do I get a refund?');

    await user.type(messageBox(), 'Slow question{Enter}');
    await user.click(screen.getByRole('link', { name: /Delivery address change/ }));
    await screen.findByText('Can I change my address?');

    // The pending message is not shown in the other conversation.
    expect(screen.queryByText('Slow question')).not.toBeInTheDocument();
    await waitFor(() => expect(api.sent).toHaveLength(1));
    await delay(150);
    expect(location()).toBe('/c/c2');

    // Going back shows the completed exchange.
    await user.click(screen.getByRole('link', { name: /Refund for order/ }));
    expect(await screen.findByText('Reply to: Slow question')).toBeInTheDocument();
  });
});
