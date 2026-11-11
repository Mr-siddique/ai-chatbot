import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { safeRedirectPath, validateSignup } from '../src/auth/validation.ts';
import { apiUrl, errorResponse, testUser } from './msw/handlers.ts';
import { server } from './msw/server.ts';
import { renderApp } from './renderApp.tsx';

const location = () => screen.getByTestId('location').textContent;
const signedIn = () => screen.findByRole('button', { name: 'Log out' });

/** Records request bodies sent to an endpoint and replies with `respond`. */
function capture(method: 'post', path: string, respond: () => Response | Promise<Response>) {
  const bodies: unknown[] = [];
  server.use(
    http[method](apiUrl(path), async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
  return bodies;
}

describe('Login page', () => {
  it('UI-08: has labelled fields, a submit button and a link to sign up', async () => {
    renderApp('/login');

    expect(await screen.findByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup');
  });

  it('AUTH-02: logs in with trimmed email and lands on the chat page', async () => {
    const bodies = capture('post', '/auth/login', () => HttpResponse.json({ user: testUser }));
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), '  jane@example.com ');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await signedIn()).toBeInTheDocument();
    expect(location()).toBe('/');
    expect(bodies).toEqual([{ email: 'jane@example.com', password: 'correct-horse' }]);
  });

  it('AUTH-05: returns the user to the page they originally asked for', async () => {
    server.use(http.post(apiUrl('/auth/login'), () => HttpResponse.json({ user: testUser })));
    const { user } = renderApp('/c/6650f0c2a1b2c3d4e5f60719');

    // Sent to login first, with a hint why.
    expect(await screen.findByText('Please log in to continue.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), testUser.email);
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await signedIn();
    expect(location()).toBe('/c/6650f0c2a1b2c3d4e5f60719');
  });

  it('AUTH-02: shows the server message for wrong credentials, keeps the email, clears the password', async () => {
    server.use(
      http.post(apiUrl('/auth/login'), () => errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password')),
    );
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), testUser.email);
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByLabelText('Email')).toHaveValue(testUser.email);
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(location()).toBe('/login');
  });

  it('validates in the browser first: no request, errors shown, focus on the first problem', async () => {
    const bodies = capture('post', '/auth/login', () => HttpResponse.json({ user: testUser }));
    const { user } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email is required');
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(bodies).toHaveLength(0);
  });

  it('clears a field’s error as soon as the user edits it', async () => {
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Log in' }));

    await user.type(screen.getByLabelText('Email'), 'j');

    expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });

  it('disables the button and shows progress while logging in', async () => {
    server.use(
      http.post(apiUrl('/auth/login'), async () => {
        await delay(100);
        return HttpResponse.json({ user: testUser });
      }),
    );
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), testUser.email);
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
    await signedIn();
  });

  it('shows a friendly message when the server is unreachable', async () => {
    server.use(http.post(apiUrl('/auth/login'), () => HttpResponse.error()));
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), testUser.email);
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the server');
  });
});

describe('Signup page', () => {
  async function fillSignup(user: ReturnType<typeof renderApp>['user'], values = { name: 'Jane Doe', email: testUser.email, password: 'correct-horse' }) {
    const nameInput = await screen.findByLabelText('Name'); // page is lazy-loaded
    if (values.name) await user.type(nameInput, values.name);
    if (values.email) await user.type(screen.getByLabelText('Email'), values.email);
    if (values.password) await user.type(screen.getByLabelText('Password'), values.password);
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
  }

  it('UI-08: has labelled fields, a password hint and a link to log in', async () => {
    renderApp('/signup');

    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters.');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('AUTH-01: creates the account, sends trimmed values and lands on the chat page', async () => {
    const bodies = capture('post', '/auth/signup', () => HttpResponse.json({ user: testUser }, { status: 201 }));
    const { user } = renderApp('/signup');

    await fillSignup(user, { name: '  Jane Doe ', email: ' jane@example.com ', password: 'correct-horse' });

    expect(await signedIn()).toBeInTheDocument();
    expect(location()).toBe('/');
    expect(bodies).toEqual([{ name: 'Jane Doe', email: 'jane@example.com', password: 'correct-horse' }]);
  });

  it('AUTH-01: validates name, email and password before sending anything', async () => {
    const bodies = capture('post', '/auth/signup', () => HttpResponse.json({ user: testUser }, { status: 201 }));
    const { user } = renderApp('/signup');

    await fillSignup(user, { name: '', email: 'not-an-email', password: 'short' });

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(bodies).toHaveLength(0);
  });

  it('AUTH-01: shows the server’s per-field errors under the right fields', async () => {
    server.use(
      http.post(apiUrl('/auth/signup'), () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Invalid request', [
          { path: 'email', message: 'Enter a valid email address' },
        ]),
      ),
    );
    const { user } = renderApp('/signup');

    await fillSignup(user);

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('AUTH-01: explains a taken email and offers to log in instead', async () => {
    server.use(
      http.post(apiUrl('/auth/signup'), () =>
        errorResponse(409, 'EMAIL_TAKEN', 'An account with this email already exists'),
      ),
    );
    const { user } = renderApp('/signup');

    await fillSignup(user);

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('That email already has an account.');

    await user.click(screen.getByRole('link', { name: 'Log in instead' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('disables the button while the account is being created', async () => {
    server.use(
      http.post(apiUrl('/auth/signup'), async () => {
        await delay(100);
        return HttpResponse.json({ user: testUser }, { status: 201 });
      }),
    );
    const { user } = renderApp('/signup');

    await fillSignup(user);

    expect(screen.getByRole('button', { name: 'Creating account…' })).toBeDisabled();
    await signedIn();
  });
});

describe('auth helpers', () => {
  it('rejects passwords over 72 bytes, like the server', () => {
    expect(validateSignup({ name: 'J', email: 'j@e.co', password: 'é'.repeat(37) }).password).toBe(
      'Password is too long',
    );
    expect(validateSignup({ name: 'J', email: 'j@e.co', password: 'a'.repeat(72) }).password).toBeUndefined();
  });

  it.each([
    ['/c/123', '/c/123'],
    ['/', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
    [undefined, '/'],
    [42, '/'],
  ])('safeRedirectPath(%s) → %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it('a crafted redirect state cannot leave the app after login', async () => {
    server.use(http.post(apiUrl('/auth/login'), () => HttpResponse.json({ user: testUser })));
    const { user } = renderApp({ pathname: '/login', state: { from: '//evil.example/phish' } });

    await user.type(await screen.findByLabelText('Email'), testUser.email);
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(location()).toBe('/'));
  });
});
