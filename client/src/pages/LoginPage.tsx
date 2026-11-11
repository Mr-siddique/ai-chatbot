import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { toApiError } from '../api/client.ts';
import type { LoginBody } from '../api/types.ts';
import { useAuth } from '../auth/context.ts';
import { validateLogin, type FieldErrors } from '../auth/validation.ts';
import { TextField } from '../components/TextField.tsx';
import styles from './AuthPage.module.css';

type Field = 'email' | 'password';

/** UI-01: log in. On success the route guard sends the user on (see PublicOnly). */
export default function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [values, setValues] = useState<LoginBody>({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const login = useMutation({ mutationFn: (body: LoginBody) => auth.login(body) });

  function focusFirst(fieldErrors: FieldErrors<Field>) {
    if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.password) passwordRef.current?.focus();
  }

  function update(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const clientErrors = validateLogin(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      focusFirst(clientErrors);
      return;
    }

    login.mutate(
      { email: values.email.trim(), password: values.password },
      {
        onError: (err) => {
          const apiError = toApiError(err);
          const serverErrors = apiError.fieldErrors() as FieldErrors<Field>;
          if (Object.keys(serverErrors).length > 0) {
            setErrors(serverErrors);
            focusFirst(serverErrors);
            return;
          }
          // INVALID_CREDENTIALS, network problems, etc. Keep the email, clear the password.
          setFormError(apiError.message);
          setValues((current) => ({ ...current, password: '' }));
          passwordRef.current?.focus();
        },
      },
    );
  }

  const cameFromProtectedPage = Boolean((location.state as { from?: string } | null)?.from);

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <p className={styles.brand}>AI Support</p>
        <h1 id="login-title" className={styles.title}>
          Log in
        </h1>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {formError && (
            <p className={styles.alert} role="alert">
              {formError}
            </p>
          )}
          {!formError && cameFromProtectedPage && (
            <p className={styles.switch} role="status">
              Please log in to continue.
            </p>
          )}

          <TextField
            id="login-email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            error={errors.email}
            inputRef={emailRef}
            autoFocus
          />
          <TextField
            id="login-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={values.password}
            onChange={(e) => update('password', e.target.value)}
            error={errors.password}
            inputRef={passwordRef}
          />

          <button type="submit" className={styles.submit} disabled={login.isPending}>
            {login.isPending ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className={styles.switch}>
          New here? <Link to="/signup" state={location.state}>Create an account</Link>
        </p>
      </section>
    </main>
  );
}
