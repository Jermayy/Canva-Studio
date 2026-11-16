import {
  AuthService,
  INVALID_CREDENTIALS_MESSAGE,
  NETWORK_MESSAGE,
} from '@/modules/auth/authService';
import { createLogger } from '@/shared/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

const USER = { id: 'u1', email: 'a@b.co' };
const VALID = { email: 'a@b.co', password: 'correct-horse' };

function setup(auth: Record<string, unknown>) {
  const lines: string[] = [];
  const service = new AuthService(
    { auth } as unknown as SupabaseClient,
    createLogger({ service: 't', sink: (_l, line) => lines.push(line) }),
  );
  return { service, lines };
}

const authError = (message: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), extra);

describe('AuthService.currentUser', () => {
  it('restores a persisted session', async () => {
    const { service } = setup({
      getSession: () =>
        Promise.resolve({ data: { session: { user: USER } }, error: null }),
    });

    await expect(service.currentUser()).resolves.toEqual(USER);
  });

  it('returns null without a session or on error', async () => {
    const none = setup({
      getSession: () =>
        Promise.resolve({ data: { session: null }, error: null }),
    });
    const broken = setup({
      getSession: () =>
        Promise.resolve({ data: { session: null }, error: authError('bad') }),
    });

    await expect(none.service.currentUser()).resolves.toBeNull();
    await expect(broken.service.currentUser()).resolves.toBeNull();
    expect(broken.lines.join()).toContain('auth.session_restore_failed');
  });
});

describe('AuthService.signIn', () => {
  it('validates input before calling the server', async () => {
    const signInWithPassword = vi.fn();
    const { service } = setup({ signInWithPassword });

    const result = await service.signIn({ email: 'nope', password: 'short' });

    expect(result).toEqual({
      ok: false,
      message: 'Enter a valid email address',
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns the user on success', async () => {
    const { service } = setup({
      signInWithPassword: () =>
        Promise.resolve({ data: { user: USER }, error: null }),
    });

    await expect(service.signIn(VALID)).resolves.toEqual({
      ok: true,
      user: USER,
    });
  });

  it('uses one generic message for any credential failure', async () => {
    const { service } = setup({
      signInWithPassword: () =>
        Promise.resolve({
          data: { user: null },
          error: authError('Invalid login credentials', { status: 400 }),
        }),
    });

    await expect(service.signIn(VALID)).resolves.toEqual({
      ok: false,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
  });

  it('explains network failures and rate limits', async () => {
    const offline = setup({
      signInWithPassword: () =>
        Promise.reject(new TypeError('Failed to fetch')),
    });
    const limited = setup({
      signInWithPassword: () =>
        Promise.resolve({
          data: { user: null },
          error: authError('rate limit', { status: 429 }),
        }),
    });

    await expect(offline.service.signIn(VALID)).resolves.toEqual({
      ok: false,
      message: NETWORK_MESSAGE,
    });
    await expect(limited.service.signIn(VALID)).resolves.toMatchObject({
      message: expect.stringContaining('Too many attempts'),
    });
  });

  it('handles non-Error rejections', async () => {
    const { service } = setup({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- non-Error rejection is the case under test
      signInWithPassword: () => Promise.reject('weird'),
    });

    await expect(service.signIn(VALID)).resolves.toEqual({
      ok: false,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
  });
});

describe('AuthService.signUp', () => {
  it('signs in immediately when no email confirmation is required', async () => {
    const { service } = setup({
      signUp: () =>
        Promise.resolve({ data: { user: USER, session: {} }, error: null }),
    });

    await expect(service.signUp(VALID)).resolves.toEqual({
      ok: true,
      user: USER,
    });
  });

  it('reports when the email must be confirmed first', async () => {
    const { service } = setup({
      signUp: () =>
        Promise.resolve({ data: { user: USER, session: null }, error: null }),
    });

    await expect(service.signUp(VALID)).resolves.toEqual({
      ok: true,
      user: null,
      needsConfirmation: true,
    });
  });

  it('rejects short passwords and reports weak ones', async () => {
    const weak = setup({
      signUp: () =>
        Promise.resolve({
          data: {},
          error: authError('Password should contain a symbol', { status: 422 }),
        }),
    });

    await expect(
      weak.service.signUp({ ...VALID, password: 'short' }),
    ).resolves.toEqual({
      ok: false,
      message: 'Password must be at least 8 characters',
    });
    await expect(weak.service.signUp(VALID)).resolves.toEqual({
      ok: false,
      message: 'Choose a stronger password.',
    });
  });

  it('maps thrown errors', async () => {
    const { service } = setup({
      signUp: () => Promise.reject(new Error('Failed to fetch')),
    });

    await expect(service.signUp(VALID)).resolves.toEqual({
      ok: false,
      message: NETWORK_MESSAGE,
    });
  });
});

describe('AuthService.signOut and events', () => {
  it('revokes globally and falls back to a local sign-out when offline', async () => {
    const signOut = vi
      .fn()
      .mockResolvedValueOnce({ error: authError('offline') })
      .mockResolvedValueOnce({ error: null });
    const { service, lines } = setup({ signOut });

    await service.signOut();

    expect(signOut).toHaveBeenNthCalledWith(1);
    expect(signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(lines.join()).toContain('auth.global_sign_out_failed');
  });

  it('notifies only on sign-out and unsubscribes', () => {
    const unsubscribe = vi.fn();
    let callback: (event: string) => void = () => {};
    const { service } = setup({
      onAuthStateChange: (cb: (event: string) => void) => {
        callback = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    });
    const listener = vi.fn();

    const stop = service.onSignedOut(listener);
    callback('TOKEN_REFRESHED');
    callback('SIGNED_OUT');
    stop();

    expect(listener).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
