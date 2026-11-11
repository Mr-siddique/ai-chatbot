import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MESSAGE_MAX_LENGTH, MessageInput } from '../src/components/MessageInput.tsx';
import { session, testUser } from './msw/handlers.ts';
import { server } from './msw/server.ts';
import { renderApp } from './renderApp.tsx';

async function renderChat(path = '/') {
  server.use(session.loggedIn());
  const view = renderApp(path);
  await screen.findByRole('button', { name: 'Log out' });
  return view;
}

describe('Chat layout (UI-08)', () => {
  it('has header, conversation navigation and main landmarks', async () => {
    await renderChat();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('UI-07: header shows who is signed in and a logout button that works', async () => {
    const { user } = await renderChat();
    const header = screen.getByRole('banner');

    expect(within(header).getByText(testUser.name)).toBeInTheDocument();
    expect(header).toHaveTextContent(`Signed in as ${testUser.name}`); // screen-reader text

    await user.click(within(header).getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('sidebar has a "New chat" link to /', async () => {
    await renderChat();
    const nav = screen.getByRole('navigation', { name: 'Conversations' });

    expect(within(nav).getByRole('link', { name: '+ New chat' })).toHaveAttribute('href', '/');
  });

  it('shows a welcome message and a labelled message box in an empty chat', async () => {
    await renderChat();

    expect(screen.getByRole('heading', { name: 'How can we help you today?' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  // The menu button is CSS-hidden at desktop width (jsdom's default; jsdom can't
  // apply media queries), and role queries give hidden elements no name, so we
  // find it by its aria-label instead.
  const menuButton = () => screen.getByLabelText('Conversations', { selector: 'button' });

  it('UI-08: the menu button opens and closes the sidebar drawer (mobile)', async () => {
    const { user } = await renderChat();
    const menu = menuButton();
    const nav = screen.getByRole('navigation', { name: 'Conversations' });

    expect(menu).toHaveAttribute('aria-controls', nav.id);
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(nav).toHaveAttribute('data-open', 'true');

    await user.keyboard('{Escape}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('UI-08: navigating from the drawer closes it', async () => {
    const { user } = await renderChat('/c/6650f0c2a1b2c3d4e5f60719');
    const menu = menuButton();

    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('link', { name: '+ New chat', hidden: true }));

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('MessageInput (UI-02)', () => {
  function Harness({ onSubmit, disabled }: { onSubmit: (message: string) => void; disabled?: boolean }) {
    const [value, setValue] = useState('');
    return <MessageInput value={value} onChange={setValue} onSubmit={onSubmit} disabled={disabled} />;
  }

  function setup(disabled = false) {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSubmit={onSubmit} disabled={disabled} />);
    return { onSubmit, user, box: screen.getByRole('textbox', { name: 'Message' }) };
  }

  it('UI-02: Enter sends the trimmed message', async () => {
    const { onSubmit, user, box } = setup();

    await user.type(box, '  Where is my order?  {Enter}');

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Where is my order?');
  });

  it('UI-02: Shift+Enter adds a new line instead of sending', async () => {
    const { onSubmit, user, box } = setup();

    await user.type(box, 'Line one{Shift>}{Enter}{/Shift}Line two');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('Line one\nLine two');
  });

  it('UI-02: the Send button sends too', async () => {
    const { onSubmit, user, box } = setup();

    await user.type(box, 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Hello');
  });

  it('UI-02: nothing is sent for an empty or whitespace-only message', async () => {
    const { onSubmit, user, box } = setup();

    await user.type(box, '   {Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('UI-02: while sending, the button is disabled but typing still works', async () => {
    const { onSubmit, user, box } = setup(true);

    await user.type(box, 'Next question{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('Next question');
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('caps the message at the server limit and shows a counter near it', async () => {
    const { user, box } = setup();
    expect(box).toHaveAttribute('maxLength', String(MESSAGE_MAX_LENGTH));

    await user.click(box);
    await user.paste('x'.repeat(MESSAGE_MAX_LENGTH - 100));

    expect(screen.getByText(`${MESSAGE_MAX_LENGTH - 100} / ${MESSAGE_MAX_LENGTH}`)).toBeInTheDocument();
  });
});
