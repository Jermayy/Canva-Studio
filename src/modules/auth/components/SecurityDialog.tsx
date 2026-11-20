import { useNotify, useServices, useSession } from '@/app/services';
import { PasswordStrength } from '@/modules/auth/components/PasswordStrength';
import { RecoveryCodePanel } from '@/modules/auth/components/RecoveryCode';
import { AuthError } from '@/modules/auth/domain/authModel';
import { assessPassword } from '@/modules/auth/domain/credentials';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Banner } from '@/shared/ui/feedback';
import { TextField } from '@/shared/ui/fields';
import { useState } from 'react';

const message = (error: unknown) =>
  error instanceof AuthError
    ? error.message
    : 'Something went wrong. Try again.';

function ChangePassword({ onChanged }: { onChanged: () => void }) {
  const { auth } = useServices();
  const { session } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = session?.email ?? '';
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async () => {
    if (!session || busy) {
      return;
    }
    if (!assessPassword(next, email).acceptable) {
      setError(
        assessPassword(next, email).hints[0] ?? 'Choose a stronger password.',
      );
      return;
    }
    if (next !== confirm) {
      setError('The new passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.changePassword({
        session,
        currentPassword: current,
        newPassword: next,
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      onChanged();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="settings-section"
      noValidate
      aria-labelledby="change-password-title"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 id="change-password-title" className="settings-section__title">
        Change password
      </h3>
      {error && <Banner tone="error">{error}</Banner>}
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(event) => {
          setCurrent(event.target.value);
        }}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        maxLength={128}
        value={next}
        onChange={(event) => {
          setNext(event.target.value);
        }}
      />
      <PasswordStrength password={next} email={email} />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        maxLength={128}
        value={confirm}
        error={mismatch ? 'The new passwords don’t match.' : null}
        onChange={(event) => {
          setConfirm(event.target.value);
        }}
      />
      <Button
        type="submit"
        variant="primary"
        busy={busy}
        busyLabel="Re-encrypting…"
      >
        Change password
      </Button>
    </form>
  );
}

function NewRecoveryCode() {
  const { auth } = useServices();
  const { session } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const submit = async () => {
    if (!session || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setCode(await auth.issueRecoveryCode({ session, password }));
      setPassword('');
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  };

  if (code) {
    return (
      <section className="settings-section" aria-label="New recovery code">
        <RecoveryCodePanel
          code={code}
          onDone={() => {
            setCode(null);
          }}
        />
      </section>
    );
  }
  return (
    <form
      className="settings-section"
      noValidate
      aria-labelledby="recovery-title"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 id="recovery-title" className="settings-section__title">
        Recovery code
      </h3>
      <p className="inspector-hint">
        Lost your recovery code? Create a new one. The old code stops working
        straight away.
      </p>
      {error && <Banner tone="error">{error}</Banner>}
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
      <Button type="submit" busy={busy} busyLabel="Creating…">
        Create new recovery code
      </Button>
    </form>
  );
}

export function SecurityDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const notify = useNotify();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Password & recovery"
      description="Your designs stay encrypted; changing the password re-wraps the key, nothing is lost."
    >
      <ChangePassword
        onChanged={() => {
          notify('Password changed.', { tone: 'success' });
          onClose();
        }}
      />
      <NewRecoveryCode />
    </Dialog>
  );
}
