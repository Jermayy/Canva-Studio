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
}

/** Holds each account's workspace encryption key, wrapped by its password. */
export interface Keyring {
  unlock: (userId: string, password: string) => Promise<CryptoKey>;
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
