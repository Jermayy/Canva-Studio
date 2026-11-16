import type { DeleteAccountResult } from '@/modules/account/deleteAccount';
import { useId, useState, type SyntheticEvent } from 'react';

export interface DeleteAccountDialogProps {
  email: string;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<DeleteAccountResult>;
}

/**
 * Confirms account deletion with the user's password. Explains exactly
 * what is deleted, because it can't be undone.
 */
export function DeleteAccountDialog({
  email,
  onCancel,
  onConfirm,
}: DeleteAccountDialogProps) {
  const titleId = useId();
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || password.length === 0) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onConfirm(password);
    // On success the parent closes the dialog and leaves the workspace.
    if (!result.ok) {
      setSubmitting(false);
      setError(result.message);
    }
  };

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !submitting) {
            onCancel();
          }
        }}
      >
        <h2 id={titleId}>Delete your account?</h2>
        <p>
          This permanently deletes <strong>{email}</strong> and everything in
          it, and can't be undone:
        </p>
        <ul>
          <li>all your designs, in the cloud and in this browser</li>
          <li>your uploaded images and share links</li>
          <li>your sign-in</li>
        </ul>
        <p className="muted">
          Want to keep a design? Download it as PDF or PNG first.
        </p>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className="field">
            <label htmlFor={passwordId}>Enter your password to confirm</label>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              // The dialog exists only to take this input.
              autoFocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              disabled={submitting}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="danger"
              disabled={submitting || password.length === 0}
            >
              {submitting ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
