import type { Logger } from '@/shared/logger';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { z } from 'zod';

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: true; user: null; needsConfirmation: true }
  | { ok: false; message: string };

export const credentialsSchema = z.object({
  email: z.email('Enter a valid email address').max(254),
  // bcrypt (used by Supabase Auth) ignores bytes beyond 72.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** Same message for unknown email and wrong password (no account probing). */
export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.';
export const NETWORK_MESSAGE =
  "Can't reach the server. Check your connection, or continue offline.";

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email ?? '' };
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === 'AuthRetryableFetchError' ||
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    /fetch|network/i.test(error.message)
  );
}

/**
 * Thin wrapper over Supabase Auth that validates input, normalises errors
 * and never reveals whether an account exists.
 */
export class AuthService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly logger: Logger,
  ) {}

  /** Restores the persisted session; works offline. */
  async currentUser(): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      this.logger.warn('auth.session_restore_failed', { error: error.message });
      return null;
    }
    return data.session ? toAuthUser(data.session.user) : null;
  }

  async signIn(input: Credentials): Promise<AuthResult> {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      };
    }
    try {
      const { data, error } = await this.client.auth.signInWithPassword(
        parsed.data,
      );
      if (error) {
        return this.failure('auth.sign_in_failed', error);
      }
      this.logger.info('auth.signed_in', { userId: data.user.id });
      return { ok: true, user: toAuthUser(data.user) };
    } catch (error) {
      return this.failure('auth.sign_in_failed', error);
    }
  }

  async signUp(input: Credentials): Promise<AuthResult> {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      };
    }
    try {
      const { data, error } = await this.client.auth.signUp(parsed.data);
      if (error) {
        return this.failure('auth.sign_up_failed', error);
      }
      if (!data.session || !data.user) {
        return { ok: true, user: null, needsConfirmation: true };
      }
      this.logger.info('auth.signed_up', { userId: data.user.id });
      return { ok: true, user: toAuthUser(data.user) };
    } catch (error) {
      return this.failure('auth.sign_up_failed', error);
    }
  }

  /**
   * Revokes the session on the server. If the server is unreachable, the
   * local session is still cleared so the device is signed out.
   */
  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      this.logger.warn('auth.global_sign_out_failed', { error: error.message });
      await this.client.auth.signOut({ scope: 'local' });
    }
  }

  /**
   * Re-checks the signed-in user's password before a destructive action,
   * so an unattended signed-in browser can't be used to delete the
   * account. (It doesn't stop script with the session: see ADR 0006.)
   */
  async verifyPassword(password: string): Promise<AuthResult> {
    const user = await this.currentUser();
    if (!user) {
      return { ok: false, message: 'Your session has ended. Sign in again.' };
    }
    return this.signIn({ email: user.email, password });
  }

  /**
   * Deletes the signed-in user server-side (designs cascade) and clears the
   * local session. The user's storage files must already be deleted; the
   * server refuses otherwise.
   */
  async deleteAccount(): Promise<void> {
    const { error } = await this.client.rpc('delete_my_account');
    if (error) {
      this.logger.error('auth.delete_account_failed', { error: error.message });
      throw new Error(`delete account failed: ${error.message}`);
    }
    this.logger.info('auth.account_deleted');
    // The server-side user is gone, so only the local session remains.
    await this.client.auth.signOut({ scope: 'local' });
  }

  onSignedOut(listener: () => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        listener();
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }

  private failure(event: string, error: unknown): AuthResult {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(event, { error: message });
    if (isNetworkError(error)) {
      return { ok: false, message: NETWORK_MESSAGE };
    }
    const status = (error as { status?: unknown }).status;
    if (status === 429) {
      return {
        ok: false,
        message: 'Too many attempts. Please wait a minute and try again.',
      };
    }
    if (/weak|password should/i.test(message)) {
      return { ok: false, message: 'Choose a stronger password.' };
    }
    return { ok: false, message: INVALID_CREDENTIALS_MESSAGE };
  }
}
