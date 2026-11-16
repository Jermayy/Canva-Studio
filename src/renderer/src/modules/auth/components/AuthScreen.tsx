import type { AuthService, AuthUser } from '@renderer/modules/auth/authService';
import { useId, useState, type SyntheticEvent } from 'react';

export interface AuthScreenProps {
  /** null when cloud sync isn't configured for this build. */
  auth: AuthService | null;
  onSignedIn: (user: AuthUser) => void;
  onContinueOffline: () => void;
}

type Mode = 'sign-in' | 'sign-up';

export function AuthScreen({
  auth,
  onSignedIn,
  onContinueOffline,
}: AuthScreenProps) {
  const emailId = useId();
  const passwordId = useId();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setInfo(null);
    const result =
      mode === 'sign-in'
        ? await auth.signIn({ email, password })
        : await auth.signUp({ email, password });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.user) {
      setPassword('');
      onSignedIn(result.user);
      return;
    }
    setInfo('Check your email to confirm your account, then sign in.');
    setMode('sign-in');
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Canvas Studio</h1>
        <p className="muted">
          Design posters and invitations — online or offline.
        </p>

        {auth ? (
          <form onSubmit={(event) => void submit(event)} noValidate>
            <h2>{mode === 'sign-in' ? 'Sign in' : 'Create your account'}</h2>
            <div className="field">
              <label htmlFor={emailId}>Email</label>
              <input
                id={emailId}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </div>
            <div className="field">
              <label htmlFor={passwordId}>Password</label>
              <input
                id={passwordId}
                type="password"
                autoComplete={
                  mode === 'sign-in' ? 'current-password' : 'new-password'
                }
                required
                minLength={8}
                maxLength={72}
                aria-describedby={
                  mode === 'sign-up' ? `${passwordId}-hint` : undefined
                }
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
              {mode === 'sign-up' && (
                <span id={`${passwordId}-hint`} className="muted small">
                  At least 8 characters.
                </span>
              )}
            </div>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            {info && (
              <p role="status" className="info-text">
                {info}
              </p>
            )}
            <button
              type="submit"
              className="primary wide"
              disabled={submitting}
            >
              {submitting
                ? 'Please wait…'
                : mode === 'sign-in'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
                setError(null);
              }}
            >
              {mode === 'sign-in'
                ? 'New here? Create an account'
                : 'Already have an account? Sign in'}
            </button>
          </form>
        ) : (
          <p className="info-text" role="status">
            Cloud sync isn't configured for this build, so designs are stored on
            this computer only.
          </p>
        )}

        <div className="auth-divider" aria-hidden="true">
          <span>or</span>
        </div>
        <button
          type="button"
          className="secondary wide"
          onClick={onContinueOffline}
        >
          Continue offline without an account
        </button>
        <p className="muted small">
          Offline designs stay on this computer and aren't synced to any
          account.
        </p>
      </div>
    </div>
  );
}
