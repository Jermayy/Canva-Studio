import { App } from '@/app/App';
import { navigate } from '@/app/router';
import { createTestServices } from '@/test/testServices';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const PASSWORD = 'Plenty-long-pass-42';

function start(path = '/') {
  window.history.replaceState(null, '', path);
  const { services, files } = createTestServices();
  render(<App services={services} />);
  return { services, files, user: userEvent.setup() };
}

async function signUp(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'Ann Lee');
  await user.type(screen.getByLabelText('Email'), 'ann@example.test');
  await user.type(screen.getByLabelText('Password'), PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByRole('heading', { name: 'Projects' });
  return saveRecoveryCode(user);
}

/** The one-time recovery code dialog must be acknowledged before continuing. */
async function saveRecoveryCode(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog', {
    name: 'Save your recovery code',
  });
  const code = within(dialog).getByLabelText('Recovery code').textContent;
  const proceed = within(dialog).getByRole('button', { name: 'Continue' });
  expect(proceed).toBeDisabled();
  await user.click(
    within(dialog).getByRole('checkbox', { name: /stored my recovery code/ }),
  );
  await user.click(proceed);
  await waitFor(() => {
    expect(
      screen.queryByRole('dialog', { name: 'Save your recovery code' }),
    ).toBeNull();
  });
  return code;
}

describe('App', () => {
  it('shows the landing page with sign-up and sandbox entry points', async () => {
    start('/');
    expect(
      screen.getByRole('heading', { name: /Event graphics/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Try without an account/ }),
    ).toHaveAttribute('href', '/sandbox');
    expect(screen.getByText(/nothing is sent to a server/)).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('redirects signed-out visitors from projects to sign-in, keeping where they were going', async () => {
    start('/projects?type=party');
    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(window.location.pathname).toBe('/sign-in');
    expect(new URLSearchParams(window.location.search).get('next')).toBe(
      '/projects?type=party',
    );
  });

  it('signs up, creates a design, manages it on the dashboard and signs out', async () => {
    const { user } = start('/sign-up');
    await screen.findByRole('heading', { name: 'Create your studio' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    await signUp(user);
    expect(screen.getByText('0 designs')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Festive Dinner/ }));
    await screen.findByRole('application');
    expect(screen.getByLabelText('Design name')).toHaveValue('Festive Dinner');
    await user.click(screen.getByRole('link', { name: 'Back to projects' }));

    await screen.findByText('1 design');
    expect(
      screen.getByRole('link', { name: 'Festive Dinner' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Actions for Festive Dinner' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    await screen.findByText('2 designs');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Festive Dinner copy' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const rename = screen.getByLabelText('Design name');
    await user.clear(rename);
    await user.type(rename, 'Team lunch{Enter}');
    expect(
      await screen.findByRole('link', { name: 'Team lunch' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Corporate/ }));
    expect(await screen.findByText('No designs match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await user.type(screen.getByLabelText('Search designs'), 'lunch');
    await screen.findByText('1 of 2 designs match your filters');
    await user.clear(screen.getByLabelText('Search designs'));

    await user.click(screen.getByRole('radio', { name: 'List view' }));
    expect(document.querySelector('.project-grid--list')).not.toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Actions for Team lunch' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await screen.findByText('1 design');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByText('2 designs');

    await user.click(screen.getByRole('button', { name: /Account: Ann Lee/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: /Event graphics/ });
    expect(screen.getByText(/You’re signed out/)).toBeInTheDocument();
  });

  it('signs back in, and rejects a wrong password without revealing which part was wrong', async () => {
    const { user } = start('/sign-up');
    await signUp(user);
    await user.click(screen.getByRole('button', { name: /Account: Ann Lee/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: /Event graphics/ });
    act(() => {
      navigate('/sign-in');
    });
    await user.type(await screen.findByLabelText('Email'), 'ann@example.test');
    await user.type(screen.getByLabelText('Password'), 'Wrong-password-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByText('Email or password is incorrect.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Projects' });
  });

  it('runs the sandbox without an account and warns that nothing is saved', async () => {
    const { user } = start('/sandbox');
    await screen.findByRole('heading', { name: 'Pick a starting point' });
    await user.click(screen.getByRole('button', { name: /Square post/ }));
    await screen.findByRole('application');
    expect(screen.getByText('Not saved')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Nothing is saved: closing this tab discards the design/,
      ),
    ).toBeInTheDocument();
    await user.keyboard('{Meta>}s{/Meta}');
    expect(
      await screen.findByText(/Sandbox designs aren’t saved/),
    ).toBeInTheDocument();
  });

  it('shows a helpful page for unknown links and missing designs', async () => {
    const { user } = start('/nowhere');
    expect(
      await screen.findByText('We couldn’t find that page'),
    ).toBeInTheDocument();
    act(() => {
      navigate('/sign-up');
    });
    await signUp(user);
    act(() => {
      navigate('/studio/00000000-0000-4000-8000-999999999999');
    });
    expect(
      await screen.findByText('This design isn’t here'),
    ).toBeInTheDocument();
    const toasts = within(screen.getByRole('list', { name: 'Notifications' }));
    expect(toasts.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('dismisses a toast', async () => {
    const { services, user } = start('/');
    act(() => {
      services.toasts.getState().notify('Hello there');
    });
    await user.click(
      await screen.findByRole('button', { name: 'Dismiss notification' }),
    );
    await waitFor(() => {
      expect(screen.queryByText('Hello there')).toBeNull();
    });
  });

  it('resets a forgotten password with the recovery code and keeps the designs', async () => {
    const { user, files } = start('/sign-up');
    const code = await signUp(user);
    expect(code).toMatch(/^([0-9A-Z]{4}-){4}[0-9A-Z]{4}$/);
    await user.click(screen.getByRole('button', { name: /Festive Dinner/ }));
    await screen.findByRole('application');
    await user.click(screen.getByRole('link', { name: 'Back to projects' }));
    await screen.findByText('1 design');
    await user.click(screen.getByRole('button', { name: /Account: Ann Lee/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: /Event graphics/ });

    act(() => {
      navigate('/sign-in');
    });
    await user.type(await screen.findByLabelText('Email'), 'ann@example.test');
    await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
    await screen.findByRole('heading', { name: 'Reset your password' });
    expect(screen.getByLabelText('Email')).toHaveValue('ann@example.test');

    await user.type(
      screen.getByLabelText('Recovery code'),
      'AAAA-AAAA-AAAA-AAAA-AAAA',
    );
    await user.type(screen.getByLabelText('New password'), 'Brand-new-pass-77');
    await user.click(
      screen.getByRole('button', { name: 'Reset password and sign in' }),
    );
    expect(
      await screen.findByText('Email or recovery code is incorrect.'),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Recovery code'));
    await user.type(screen.getByLabelText('Recovery code'), code.toLowerCase());
    await user.click(
      screen.getByRole('button', { name: 'Reset password and sign in' }),
    );
    await screen.findByRole('heading', { name: 'Projects' });
    expect(
      await screen.findByRole('link', { name: 'Festive Dinner' }),
    ).toBeInTheDocument();
    expect(files.downloads).toHaveLength(0);
  });

  it('changes the password and issues a new recovery code from the account menu', async () => {
    const { user, services } = start('/sign-up');
    await signUp(user);
    await user.click(screen.getByRole('button', { name: /Account: Ann Lee/ }));
    await user.click(
      screen.getByRole('menuitem', { name: 'Password & recovery' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Password & recovery' });
    await user.type(
      within(dialog).getByLabelText('Current password'),
      PASSWORD,
    );
    await user.type(
      within(dialog).getByLabelText('New password'),
      'Brand-new-pass-77',
    );
    await user.type(
      within(dialog).getByLabelText('Confirm new password'),
      'Brand-new-pass-7',
    );
    expect(
      within(dialog).getByText('The new passwords don’t match.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Confirm new password'), '7');
    await user.click(
      within(dialog).getByRole('button', { name: 'Change password' }),
    );
    await waitFor(() => {
      expect(
        services.toasts.getState().toasts.map((toast) => toast.message),
      ).toContain('Password changed.');
    });

    await user.click(screen.getByRole('button', { name: /Account: Ann Lee/ }));
    await user.click(
      screen.getByRole('menuitem', { name: 'Password & recovery' }),
    );
    const again = screen.getByRole('dialog', { name: 'Password & recovery' });
    await user.type(
      within(again).getByLabelText('Password'),
      'Wrong-password-1',
    );
    await user.click(
      within(again).getByRole('button', { name: 'Create new recovery code' }),
    );
    expect(
      await within(again).findByText('Email or password is incorrect.'),
    ).toBeInTheDocument();
    await user.clear(within(again).getByLabelText('Password'));
    await user.type(
      within(again).getByLabelText('Password'),
      'Brand-new-pass-77',
    );
    await user.click(
      within(again).getByRole('button', { name: 'Create new recovery code' }),
    );
    expect(
      await within(again).findByText(/^([0-9A-Z]{4}-){4}[0-9A-Z]{4}$/),
    ).toHaveAccessibleName('Recovery code');
    await user.click(
      within(again).getByRole('button', { name: 'Download as text' }),
    );
  });
});
