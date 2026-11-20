import type {
  IdentityProvider,
  Keyring,
  SessionVault,
  StoredSession,
} from '@/modules/auth/application/ports';
import {
  AuthError,
  checkThrottle,
  recordFailure,
  REMEMBERED_SESSION_TTL_MS,
  SESSION_TTL_MS,
  type Identity,
  type ThrottleRecord,
} from '@/modules/auth/domain/authModel';
import {
  signInSchema,
  signUpSchema,
  type SignUpInput,
} from '@/modules/auth/domain/credentials';
import type { KeyValueStore } from '@/shared/lib/keyValueStore';
import type { Logger } from '@/shared/logger';

/**
 * Sign-in use cases: validate input, throttle repeated failures, verify
 * with the identity provider, unlock the workspace key and keep the
 * session. Everything a screen needs is one call.
 */

export type SignUpResult =
  | { kind: 'signed-in'; session: StoredSession }
  | { kind: 'confirm-email'; email: string };

export interface AuthService {
  readonly providerKind: IdentityProvider['kind'];
  restore: () => Promise<StoredSession | null>;
  signIn: (input: {
    email: string;
    password: string;
    remember: boolean;
  }) => Promise<StoredSession>;
  signUp: (input: SignUpInput & { remember: boolean }) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const THROTTLE_PREFIX = 'canvas-studio-v2:throttle:';

function isThrottleRecord(value: unknown): value is ThrottleRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ThrottleRecord).failures === 'number' &&
    typeof (value as ThrottleRecord).lockedUntil === 'number'
  );
}

export function createAuthService(deps: {
  identity: IdentityProvider;
  keyring: Keyring;
  vault: SessionVault;
  throttleStore: KeyValueStore;
  now: () => number;
  logger: Logger;
}): AuthService {
  const { identity, keyring, vault, logger } = deps;

  const readThrottle = (email: string): ThrottleRecord | null => {
    const raw = deps.throttleStore.get(THROTTLE_PREFIX + email);
    if (!raw) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isThrottleRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const startSession = async (
    who: Identity,
    password: string,
    remember: boolean,
  ): Promise<StoredSession> => {
    const dataKey = await keyring.unlock(who.userId, password);
    const stored: StoredSession = {
      session: {
        ...who,
        provider: identity.kind,
        expiresAt:
          deps.now() + (remember ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS),
      },
      dataKey,
    };
    await vault.save(stored);
    return stored;
  };

  return {
    providerKind: identity.kind,

    restore: async () => {
      try {
        const stored = await vault.load();
        if (!stored) {
          return null;
        }
        const expired = stored.session.expiresAt <= deps.now();
        const providerMismatch =
          stored.session.provider !== identity.kind ||
          (identity.kind === 'supabase' &&
            (await identity.currentUserId()) !== stored.session.userId);
        if (expired || providerMismatch) {
          await vault.clear();
          logger.info('auth.session_ended', {
            reason: expired ? 'expired' : 'provider',
          });
          return null;
        }
        return stored;
      } catch (error) {
        logger.error('auth.restore_failed', { error });
        return null;
      }
    },

    signIn: async ({ email, password, remember }) => {
      const parsed = signInSchema.safeParse({ email, password });
      if (!parsed.success) {
        throw new AuthError('invalid-credentials');
      }
      const normalised = parsed.data.email;
      const decision = checkThrottle(readThrottle(normalised), deps.now());
      if (!decision.allowed) {
        logger.warn('auth.sign_in_throttled', { provider: identity.kind });
        throw new AuthError('locked', decision.retryAfterMs);
      }
      try {
        const who = await identity.signIn(normalised, parsed.data.password);
        const stored = await startSession(who, parsed.data.password, remember);
        deps.throttleStore.remove(THROTTLE_PREFIX + normalised);
        logger.info('auth.signed_in', {
          provider: identity.kind,
          userId: who.userId,
        });
        return stored;
      } catch (error) {
        if (
          error instanceof AuthError &&
          error.code === 'invalid-credentials'
        ) {
          const record = recordFailure(readThrottle(normalised), deps.now());
          deps.throttleStore.set(
            THROTTLE_PREFIX + normalised,
            JSON.stringify(record),
          );
          logger.warn('auth.sign_in_failed', {
            provider: identity.kind,
            failures: record.failures,
          });
        } else {
          logger.error('auth.sign_in_error', {
            provider: identity.kind,
            error,
          });
        }
        throw error instanceof AuthError ? error : new AuthError('unknown');
      }
    },

    signUp: async (input) => {
      const parsed = signUpSchema.safeParse(input);
      if (!parsed.success) {
        throw new AuthError('weak-password');
      }
      try {
        const outcome = await identity.signUp(parsed.data);
        if (outcome.kind === 'confirm-email') {
          logger.info('auth.sign_up_confirmation_sent', {
            provider: identity.kind,
          });
          return outcome;
        }
        const session = await startSession(
          outcome.identity,
          parsed.data.password,
          input.remember,
        );
        logger.info('auth.signed_up', {
          provider: identity.kind,
          userId: outcome.identity.userId,
        });
        return { kind: 'signed-in', session };
      } catch (error) {
        logger.warn('auth.sign_up_failed', { provider: identity.kind, error });
        throw error instanceof AuthError ? error : new AuthError('unknown');
      }
    },

    signOut: async () => {
      await vault.clear();
      try {
        await identity.signOut();
      } catch (error) {
        // The local session is already gone; the server one expires on its own.
        logger.warn('auth.remote_sign_out_failed', { error });
      }
      logger.info('auth.signed_out', { provider: identity.kind });
    },
  };
}
