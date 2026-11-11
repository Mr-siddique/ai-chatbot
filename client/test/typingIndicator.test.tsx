import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { TypingIndicator } from '../src/components/TypingIndicator.tsx';
import type { SendBody } from '../src/api/types.ts';
import { apiUrl, chatApi, errorResponse, session } from './msw/handlers.ts';
import { server } from './msw/server.ts';
import { renderApp } from './renderApp.tsx';

describe('TypingIndicator (BON-01)', () => {
  it('BON-01: is a polite live status that says the assistant is typing', () => {
    render(<TypingIndicator />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Assistant is typing…');
  });

  it('BON-01: the animated dots are hidden from screen readers', () => {
    const { container } = render(<TypingIndicator />);

    const dots = container.querySelector('[aria-hidden="true"]');
    expect(dots?.children).toHaveLength(3);
  });
});

describe('Typing indicator in the chat (BON-01)', () => {
  function replyAfter(ms: number, fail = false) {
    server.use(
      session.loggedIn(),
      chatApi.history([]),
      http.post(apiUrl('/chat/send'), async ({ request }) => {
        const { message } = (await request.json()) as SendBody;
        await delay(ms);
        if (fail) return errorResponse(502, 'AI_UNAVAILABLE', 'The assistant is unavailable right now. Please try again.');
        const now = new Date().toISOString();
        return HttpResponse.json({
          conversationId: 'n1',
          userMessage: { id: 'u', conversationId: 'n1', role: 'user', content: message, createdAt: now },
          assistantMessage: { id: 'a', conversationId: 'n1', role: 'assistant', content: 'Done', createdAt: now },
        });
      }),
      http.get(apiUrl('/chat/history/n1'), () => HttpResponse.json({ conversation: { id: 'n1', title: 'Hi', createdAt: '', updatedAt: '' }, messages: [] })),
    );
  }

  it('BON-01: shows while the reply is pending and disappears when it arrives', async () => {
    replyAfter(80);
    const { user } = renderApp('/');
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Hi{Enter}');

    expect(screen.getByText('Assistant is typing…')).toBeInTheDocument();

    expect(await screen.findByText('Done')).toBeInTheDocument();
    expect(screen.queryByText('Assistant is typing…')).not.toBeInTheDocument();
  });

  it('BON-01: disappears when the reply fails, replaced by the error', async () => {
    replyAfter(30, true);
    const { user } = renderApp('/');
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Hi{Enter}');

    expect(screen.getByText('Assistant is typing…')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Assistant is typing…')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Not sent.');
  });
});
