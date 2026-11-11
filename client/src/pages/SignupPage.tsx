import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { toApiError } from '../api/client.ts';
import type { SignupBody } from '../api/types.ts';
import { useAuth } from '../auth/context.ts';
import { validateSignup, type FieldErrors } from '../auth/validation.ts';
import { TextField } from '../components/TextField.tsx';
import styles from './AuthPage.module.css';

type Field = 'name' | 'email' | 'password';

/** UI-01: create an account. On success the user is logged in (AUTH-01). */
export default function SignupPage() {
  const auth = useAuth();
  const location = useLocation();
  const [values, setValues] = useState<SignupBody>({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const signup = useMutation({ mutationFn: (body: SignupBody) => auth.signup(body) });

  function focusFirst(fieldErrors: FieldErrors<Field>) {
    if (fieldErrors.name) nameRef.current?.focus();
    else if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.password) passwordRef.current?.focus();
  }

  function update(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === 'email') setEmailTaken(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setEmailTaken(false);
    const clientErrors = validateSignup(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      focusFirst(clientErrors);
      return;
    }

    signup.mutate(
      { name: values.name.trim(), email: values.email.trim(), password: values.password },
      {
        onError: (err) => {
          const apiError = toApiError(err);
          if (apiError.code === 'EMAIL_TAKEN') {
            setErrors({ email: apiError.message });
            setEmailTaken(true);
            emailRef.current?.focus();
            return;
          }
          const serverErrors = apiError.fieldErrors() as FieldErrors<Field>;
          if (Object.keys(serverErrors).length > 0) {
            setErrors(serverErrors);
            focusFirst(serverErrors);
            return;
          }
          setFormError(apiError.message);
        },
      },
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="signup-title">
        <p className={styles.brand}>AI Support</p>
        <h1 id="signup-title" className={styles.title}>
          Sign up
        </h1>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {formError && (
            <p className={styles.alert} role="alert">
              {formError}
            </p>
          )}
          {emailTaken && (
            <p className={styles.alert} role="alert">
              That email already has an account.{' '}
              <Link to="/login" state={location.state}>
                Log in instead
              </Link>
            </p>
          )}

          <TextField
            id="signup-name"
            label="Name"
            autoComplete="name"
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            error={errors.name}
            inputRef={nameRef}
            autoFocus
          />
          <TextField
            id="signup-email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            error={errors.email}
            inputRef={emailRef}
          />
          <TextField
            id="signup-password"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => update('password', e.target.value)}
            error={errors.password}
            hint="At least 8 characters."
            inputRef={passwordRef}
          />

          <button type="submit" className={styles.submit} disabled={signup.isPending}>
            {signup.isPending ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p className={styles.switch}>
          Already have an account? <Link to="/login" state={location.state}>Log in</Link>
        </p>
      </section>
    </main>
  );
}
