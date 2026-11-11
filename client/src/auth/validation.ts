/**
 * Instant client-side checks that mirror the server's rules (SPEC AUTH-01).
 * The server stays the authority; these only save a round trip.
 */

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt limit
const NAME_MAX = 80;

function emailError(email: string): string | undefined {
  if (!email.trim()) return 'Email is required';
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address';
  return undefined;
}

export function validateLogin(values: { email: string; password: string }): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {};
  const email = emailError(values.email);
  if (email) errors.email = email;
  if (!values.password) errors.password = 'Password is required';
  return errors;
}

export function validateSignup(values: {
  name: string;
  email: string;
  password: string;
}): FieldErrors<'name' | 'email' | 'password'> {
  const errors: FieldErrors<'name' | 'email' | 'password'> = {};
  const name = values.name.trim();
  if (!name) errors.name = 'Name is required';
  else if (name.length > NAME_MAX) errors.name = `Name must be at most ${NAME_MAX} characters`;

  const email = emailError(values.email);
  if (email) errors.email = email;

  if (values.password.length < PASSWORD_MIN) {
    errors.password = `Password must be at least ${PASSWORD_MIN} characters`;
  } else if (new TextEncoder().encode(values.password).length > PASSWORD_MAX_BYTES) {
    errors.password = 'Password is too long';
  }
  return errors;
}

/**
 * Only same-app paths are allowed as a post-login destination, so a crafted
 * link can't send the user to another site.
 */
export function safeRedirectPath(value: unknown): string {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) {
    return value;
  }
  return '/';
}
