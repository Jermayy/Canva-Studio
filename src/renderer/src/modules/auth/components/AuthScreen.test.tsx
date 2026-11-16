import type {
  AuthResult,
  AuthService,
} from '@renderer/modules/auth/authService';
import { AuthScreen } from '@renderer/modules/auth/components/AuthScreen';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function setup(
  result: AuthResult = { ok: true, user: { id: 'u', email: 'a@b.co' } },
) {
  const auth = {
    signIn: vi.fn(() => Promise.resolve(result)),
    signUp: vi.fn(() => Promise.resolve(result)),
  };
  const props = { onSignedIn: vi.fn(), onContinueOffline: vi.fn() };
  render(<AuthScreen auth={auth as unknown as AuthService} {...props} />);
  return { auth, ...props };
}

async function fillAndSubmit(button: string) {
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
  await userEvent.type(screen.getByLabelText('Password'), 'long-password');
  await userEvent.click(screen.getByRole('button', { name: button }));
}

describe('AuthScreen', () => {
  it('signs in and hands the user up', async () => {
    const { auth, onSignedIn } = setup();

    await fillAndSubmit('Sign in');

    expect(auth.signIn).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'long-password',
    });
    expect(onSignedIn).toHaveBeenCalledWith({ id: 'u', email: 'a@b.co' });
  });

  it('shows errors from the auth service', async () => {
    setup({ ok: false, message: 'Email or password is incorrect.' });

    await fillAndSubmit('Sign in');

    expect(await screen.findByRole('alert')).toHaveTextContent('incorrect');
  });

  it('prevents double submission while waiting', async () => {
    let resolve: (value: AuthResult) => void = () => {};
    const auth = {
      signIn: vi.fn(
        () =>
          new Promise<AuthResult>((done) => {
            resolve = done;
          }),
      ),
    };
    render(
      <AuthScreen
        auth={auth as unknown as AuthService}
        onSignedIn={vi.fn()}
        onContinueOffline={vi.fn()}
      />,
    );

    await fillAndSubmit('Sign in');
    const waiting = screen.getByRole('button', { name: 'Please wait…' });
    expect(waiting).toBeDisabled();
    await userEvent.click(waiting);
    resolve({ ok: false, message: 'x' });

    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledOnce();
    });
  });

  it('creates accounts and asks for email confirmation when required', async () => {
    const { auth } = setup({ ok: true, user: null, needsConfirmation: true });

    await userEvent.click(
      screen.getByRole('button', { name: /Create an account/ }),
    );
    expect(screen.getByText('At least 8 characters.')).toBeInTheDocument();
    await fillAndSubmit('Create account');

    expect(auth.signUp).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Check your email',
    );
    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('switches back from sign up to sign in', async () => {
    setup();

    await userEvent.click(
      screen.getByRole('button', { name: /Create an account/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Already have an account/ }),
    );

    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('continues offline', async () => {
    const { onContinueOffline } = setup();

    await userEvent.click(
      screen.getByRole('button', { name: /Continue offline/ }),
    );

    expect(onContinueOffline).toHaveBeenCalled();
  });

  it('explains when cloud sync is not configured', () => {
    render(
      <AuthScreen
        auth={null}
        onSignedIn={vi.fn()}
        onContinueOffline={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent("isn't configured");
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });
});
