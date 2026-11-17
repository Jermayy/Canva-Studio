import type { AuthService } from '@/modules/auth/authService';
import type { RemoteDesignStore } from '@/modules/sync/remoteDesignStore';
import type { Logger } from '@/shared/logger';

export interface DeleteAccountDeps {
  auth: Pick<AuthService, 'verifyPassword' | 'deleteAccount'>;
  remote: Pick<RemoteDesignStore, 'deleteAllFiles'>;
  /** Deletes this browser's copy of the user's designs and images. */
  deleteLocalData: () => Promise<void>;
  isOnline: () => boolean;
  logger: Logger;
}

export type DeleteAccountResult =
  { ok: true; localDataRemains: boolean } | { ok: false; message: string };

export const OFFLINE_MESSAGE = 'You need to be online to delete your account.';
export const INCOMPLETE_MESSAGE =
  "Your account wasn't fully deleted. Please try again; nothing else will change.";

/**
 * Deletes the signed-in user's account and all their data.
 *
 * Order matters: files first (the server refuses to delete an account
 * that still has files, so none can be orphaned), then the account, which
 * cascades to designs. Each step is safe to retry, so a failure part-way
 * is fixed by running it again.
 */
export async function deleteAccount(
  deps: DeleteAccountDeps,
  password: string,
): Promise<DeleteAccountResult> {
  if (!deps.isOnline()) {
    return { ok: false, message: OFFLINE_MESSAGE };
  }
  const verified = await deps.auth.verifyPassword(password);
  if (!verified.ok) {
    return { ok: false, message: verified.message };
  }

  try {
    const files = await deps.remote.deleteAllFiles();
    deps.logger.info('account.files_deleted', { files });
    await deps.auth.deleteAccount();
  } catch (error) {
    deps.logger.error('account.delete_failed', { error: String(error) });
    return { ok: false, message: INCOMPLETE_MESSAGE };
  }

  try {
    await deps.deleteLocalData();
  } catch (error) {
    // The account is gone; leftover local data is only on this device.
    deps.logger.error('account.local_delete_failed', { error: String(error) });
    return { ok: true, localDataRemains: true };
  }
  return { ok: true, localDataRemains: false };
}
