import { App } from '@/app/App';
import { createWorkspace } from '@/app/workspace';
import type { AuthService, AuthUser } from '@/modules/auth/authService';
import { openWorkspaceDb } from '@/modules/designs/data/localDb';
import { editorStore } from '@/modules/editor/state/editorStore';
import { FakeRemoteStore } from '@/test/fakeRemoteStore';
import { testServices } from '@/test/renderWithProviders';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const USER: AuthUser = { id: 'user-1', email: 'sam@example.com' };

function fakeAuth(currentUser: AuthUser | null = null) {
  let signedOut: () => void = () => {};
  const auth = {
    currentUser: vi.fn(() => Promise.resolve(currentUser)),
    signIn: vi.fn(() => Promise.resolve({ ok: true as const, user: USER })),
    signUp: vi.fn(),
    signOut: vi.fn(() => Promise.resolve()),
    onSignedOut: vi.fn((listener: () => void) => {
      signedOut = listener;
      return () => undefined;
    }),
  };
  return {
    auth: auth as unknown as AuthService & typeof auth,
    revoke: () => {
      signedOut();
    },
  };
}

/** Real workspaces, isolated databases. */
const isolatedWorkspaces: typeof createWorkspace = (session, env) =>
  createWorkspace(session, {
    ...env,
    openDb: (id) => openWorkspaceDb(`${id}-${crypto.randomUUID()}`),
  });

function renderApp(auth: AuthService | null) {
  return render(
    <App
      services={testServices()}
      auth={auth}
      createRemote={() => new FakeRemoteStore()}
      workspaceFactory={isolatedWorkspaces}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  editorStore.getState().close();
});

describe('App', () => {
  it('shows sign-in when there is no saved session', async () => {
    renderApp(fakeAuth().auth);

    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('restores a saved session straight to the home screen', async () => {
    renderApp(fakeAuth(USER).auth);

    expect(await screen.findByText('sam@example.com')).toBeInTheDocument();
  });

  it('signs in, then signs out back to the sign-in screen', async () => {
    const { auth } = fakeAuth();
    renderApp(auth);

    await userEvent.type(await screen.findByLabelText('Email'), USER.email);
    await userEvent.type(screen.getByLabelText('Password'), 'long-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    );

    expect(auth.signOut).toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('remembers offline mode across launches', async () => {
    const first = renderApp(fakeAuth().auth);
    await userEvent.click(
      await screen.findByRole('button', { name: /Continue offline/ }),
    );
    expect(await screen.findByText('Offline guest')).toBeInTheDocument();
    first.unmount();

    renderApp(fakeAuth().auth);

    expect(await screen.findByText('Offline guest')).toBeInTheDocument();
  });

  it('runs local-only when cloud sync is not configured', async () => {
    renderApp(null);

    await userEvent.click(
      await screen.findByRole('button', { name: /Continue offline/ }),
    );

    expect(await screen.findByText('Offline guest')).toBeInTheDocument();
  });

  it('opens the editor from a template and returns home', async () => {
    renderApp(null);
    await userEvent.click(
      await screen.findByRole('button', { name: /Continue offline/ }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: /Balloon birthday/ }),
    );
    expect(await screen.findByLabelText('Design title')).toHaveValue(
      'Balloon birthday',
    );

    await userEvent.click(screen.getByRole('button', { name: '← Designs' }));
    expect(
      await screen.findByRole('heading', { name: 'Your designs' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Balloon birthday', {
        selector: '.design-title',
      }),
    ).toBeInTheDocument();
  });

  it('carries editor notices back to the home screen', async () => {
    renderApp(null);
    await userEvent.click(
      await screen.findByRole('button', { name: /Continue offline/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Party night/ }),
    );
    await screen.findByLabelText('Design title');

    editorStore.setState({ notice: 'Something to report' });
    await userEvent.click(screen.getByRole('button', { name: '← Designs' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something to report',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('returns to sign-in when the session is revoked elsewhere', async () => {
    const { auth, revoke } = fakeAuth(USER);
    renderApp(auth);
    await screen.findByText('sam@example.com');

    revoke();

    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('ignores sign-out events for guests', async () => {
    const { auth, revoke } = fakeAuth();
    renderApp(auth);
    await userEvent.click(
      await screen.findByRole('button', { name: /Continue offline/ }),
    );
    await screen.findByText('Offline guest');

    revoke();

    await waitFor(() => {
      expect(screen.getByText('Offline guest')).toBeInTheDocument();
    });
  });
});
