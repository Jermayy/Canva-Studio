import { DeleteAccountDialog } from '@/modules/account/components/DeleteAccountDialog';
import type { DeleteAccountResult } from '@/modules/account/deleteAccount';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type Confirm = (password: string) => Promise<DeleteAccountResult>;

function setup(
  onConfirm = vi.fn<Confirm>(() =>
    Promise.resolve({ ok: true, localDataRemains: false }),
  ),
) {
  const onCancel = vi.fn();
  render(
    <DeleteAccountDialog
      email="sam@example.com"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  return { onCancel, onConfirm };
}

describe('DeleteAccountDialog', () => {
  it('explains what will be deleted and focuses the password', () => {
    setup();

    expect(
      screen.getByRole('dialog', { name: 'Delete your account?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Enter your password to confirm'),
    ).toHaveFocus();
  });

  it('needs a password before it can submit', async () => {
    const { onConfirm } = setup();
    const submit = screen.getByRole('button', { name: 'Delete my account' });

    expect(submit).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('Enter your password to confirm'),
      'secret-pw{Enter}',
    );

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith('secret-pw');
  });

  it('shows the error and lets the user retry', async () => {
    const onConfirm = vi.fn<Confirm>(() =>
      Promise.resolve({ ok: false, message: 'Wrong password' }),
    );
    setup(onConfirm);

    await userEvent.type(
      screen.getByLabelText('Enter your password to confirm'),
      'nope',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete my account' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wrong password',
    );
    expect(
      screen.getByRole('button', { name: 'Delete my account' }),
    ).toBeEnabled();
  });

  it('prevents double submission while deleting', async () => {
    let finish: () => void = () => {};
    const onConfirm = vi.fn<Confirm>(
      () =>
        new Promise<DeleteAccountResult>((resolve) => {
          finish = () => {
            resolve({ ok: true, localDataRemains: false });
          };
        }),
    );
    setup(onConfirm);
    await userEvent.type(
      screen.getByLabelText('Enter your password to confirm'),
      'pw{Enter}',
    );

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('Enter your password to confirm'),
      '{Enter}',
    );
    expect(onConfirm).toHaveBeenCalledOnce();
    finish();
  });

  it('cancels with the button or Escape', async () => {
    const { onCancel } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
