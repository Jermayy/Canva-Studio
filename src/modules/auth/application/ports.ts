import type {
  AuthProviderKind,
  Identity,
  Session,
} from '@/modules/auth/domain/authModel';

/** Ports the auth service depends on; adapters live in `infrastructure/`. */

export type SignUpOutcome =
  | { kind: 'signed-in'; identity: Identity }
  | { kind: 'confirm-email'; email: string };

/** Verifies credentials: on this device, or against Supabase Auth. */
export interface IdentityProvider {
  readonly kind: AuthProviderKind;
  signIn: (email: string, password: string) => Promise<Identity>;
  signUp: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<SignUpOutcome>;
  signOut: () => Promise<void>;
  /** The provider's own session, if it keeps one (Supabase does). */
  currentUserId: () => Promise<string | null>;
  /** Device-local lookup for recovery-code resets; null when unknown or unsupported. */
  findAccount: (email: string) => Promise<Identity | null>;
  /** Replaces the password (Supabase: for the user of the current session). */
  updatePassword: (userId: string, newPassword: string) => Promise<void>;
  /** Supabase only: emails a reset link that returns to `/reset-password`. */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Supabase only: turns the code from a reset link into a session. */
  exchangeResetCode: (code: string) => Promise<Identity>;
}

export interface UnlockResult {
  dataKey: CryptoKey;
  /** Set only when a recovery code was just created; show it once. */
  recoveryCode: string | null;
}

/**
 * Holds each account's workspace encryption key, wrapped twice: by the
 * password and by a recovery code. `beforeCommit` runs after the old
 * secret is proven and before anything is stored, so a failed password
 * update elsewhere leaves the keyring untouched.
 */
export interface Keyring {
  unlock: (userId: string, password: string) => Promise<UnlockResult>;
  recover: (
    userId: string,
    recoveryCode: string,
    newPassword: string,
    beforeCommit?: () => Promise<void>,
  ) => Promise<CryptoKey>;
  changePassword: (
    userId: string,
    currentPassword: string,
    newPassword: string,
    beforeCommit?: () => Promise<void>,
  ) => Promise<void>;
  issueRecoveryCode: (userId: string, password: string) => Promise<string>;
}

export interface StoredSession {
  session: Session;
  dataKey: CryptoKey;
}

/** Keeps the signed-in session (and its non-extractable key) across reloads. */
export interface SessionVault {
  load: () => Promise<StoredSession | null>;
  save: (stored: StoredSession) => Promise<void>;
  clear: () => Promise<void>;
}
