import {
  INCOMPLETE_MESSAGE,
  OFFLINE_MESSAGE,
  deleteAccount,
  type DeleteAccountDeps,
} from '@/modules/account/deleteAccount';
import { createLogger } from '@/shared/logger';

function setup(overrides: Partial<DeleteAccountDeps> = {}) {
  const calls: string[] = [];
  const lines: string[] = [];
  const deps: DeleteAccountDeps = {
    auth: {
      verifyPassword: vi.fn(() => {
        calls.push('verify');
        return Promise.resolve({
          ok: true as const,
          user: { id: 'u1', email: 'a@b.co' },
        });
      }),
      deleteAccount: vi.fn(() => {
        calls.push('account');
        return Promise.resolve();
      }),
    },
    remote: {
      deleteAllFiles: vi.fn(() => {
        calls.push('files');
        return Promise.resolve(3);
      }),
    },
    deleteLocalData: vi.fn(() => {
      calls.push('local');
      return Promise.resolve();
    }),
    isOnline: () => true,
    logger: createLogger({
      service: 't',
      sink: (_l, line) => lines.push(line),
    }),
    ...overrides,
  };
  return { deps, calls, lines };
}

describe('deleteAccount', () => {
  it('verifies, deletes files, then the account, then local data', async () => {
    const { deps, calls } = setup();

    await expect(deleteAccount(deps, 'pw')).resolves.toEqual({
      ok: true,
      localDataRemains: false,
    });
    expect(deps.auth.verifyPassword).toHaveBeenCalledWith('pw');
    expect(calls).toEqual(['verify', 'files', 'account', 'local']);
  });

  it('refuses offline without touching anything', async () => {
    const { deps, calls } = setup({ isOnline: () => false });

    await expect(deleteAccount(deps, 'pw')).resolves.toEqual({
      ok: false,
      message: OFFLINE_MESSAGE,
    });
    expect(calls).toEqual([]);
  });

  it('stops on a wrong password', async () => {
    const { deps, calls } = setup();
    vi.mocked(deps.auth.verifyPassword).mockResolvedValueOnce({
      ok: false,
      message: 'Email or password is incorrect.',
    });

    await expect(deleteAccount(deps, 'bad')).resolves.toEqual({
      ok: false,
      message: 'Email or password is incorrect.',
    });
    expect(calls).toEqual([]);
  });

  it('keeps the account when file deletion fails', async () => {
    const { deps, lines } = setup();
    vi.mocked(deps.remote.deleteAllFiles).mockRejectedValueOnce(
      new Error('storage down'),
    );

    await expect(deleteAccount(deps, 'pw')).resolves.toEqual({
      ok: false,
      message: INCOMPLETE_MESSAGE,
    });
    expect(deps.auth.deleteAccount).not.toHaveBeenCalled();
    expect(deps.deleteLocalData).not.toHaveBeenCalled();
    expect(lines.join()).toContain('account.delete_failed');
  });

  it('keeps local data when the server refuses the deletion', async () => {
    const { deps } = setup();
    vi.mocked(deps.auth.deleteAccount).mockRejectedValueOnce(
      new Error('storage_not_empty'),
    );

    await expect(deleteAccount(deps, 'pw')).resolves.toMatchObject({
      ok: false,
    });
    expect(deps.deleteLocalData).not.toHaveBeenCalled();
  });

  it('reports leftover local data after the account is gone', async () => {
    const { deps, lines } = setup({
      deleteLocalData: () => Promise.reject(new Error('blocked')),
    });

    await expect(deleteAccount(deps, 'pw')).resolves.toEqual({
      ok: true,
      localDataRemains: true,
    });
    expect(lines.join()).toContain('account.local_delete_failed');
  });
});
