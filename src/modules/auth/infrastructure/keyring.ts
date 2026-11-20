import type {
  Keyring,
  SessionVault,
  StoredSession,
} from '@/modules/auth/application/ports';
import { AuthError } from '@/modules/auth/domain/authModel';
import {
  generateRecoveryCode,
  normaliseRecoveryCode,
} from '@/modules/auth/domain/recoveryCode';
import type {
  AccountsDatabase,
  WrappedKey,
  WrappedKeyRow,
} from '@/modules/auth/infrastructure/accountsDatabase';
import {
  DEFAULT_ITERATIONS,
  deriveWrappingKey,
  randomSalt,
} from '@/modules/auth/infrastructure/passwordKdf';
import { fromBase64, toBase64 } from '@/shared/crypto/aesGcm';

/**
 * Envelope encryption for workspaces. Each account has a random AES-256
 * data key, stored only wrapped: once by a key derived from the password
 * and once by a key derived from a recovery code. Either secret unlocks
 * the same key, so resetting a forgotten password keeps every design.
 * Keys handed to the app are non-extractable.
 */
export function createKeyring(options: {
  db: AccountsDatabase;
  iterations?: number;
}): Keyring {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const dataKeyAlgorithm = { name: 'AES-GCM', length: 256 } as const;
  const usages: KeyUsage[] = ['encrypt', 'decrypt'];

  const wrapWith = async (
    secret: string,
    dataKey: CryptoKey,
  ): Promise<WrappedKey> => {
    const salt = randomSalt();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrappingKey = await deriveWrappingKey(secret, salt, iterations);
    const wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, {
      name: 'AES-GCM',
      iv,
    });
    return {
      salt: toBase64(salt),
      iterations,
      iv: toBase64(iv),
      wrapped: toBase64(new Uint8Array(wrapped)),
    };
  };

  /** Extractable only so it can be re-wrapped; never leaves this module. */
  const unwrapWith = async (
    wrapped: WrappedKey,
    secret: string,
    failure: AuthError['code'],
  ): Promise<CryptoKey> => {
    const wrappingKey = await deriveWrappingKey(
      secret,
      fromBase64(wrapped.salt),
      wrapped.iterations,
    );
    try {
      return await crypto.subtle.unwrapKey(
        'raw',
        fromBase64(wrapped.wrapped),
        wrappingKey,
        { name: 'AES-GCM', iv: fromBase64(wrapped.iv) },
        dataKeyAlgorithm,
        true,
        usages,
      );
    } catch {
      // The GCM tag fails when the secret differs from the one used to wrap.
      throw new AuthError(failure);
    }
  };

  const nonExtractable = async (key: CryptoKey): Promise<CryptoKey> => {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    try {
      return await crypto.subtle.importKey(
        'raw',
        raw,
        dataKeyAlgorithm,
        false,
        usages,
      );
    } finally {
      raw.fill(0);
    }
  };

  const existing = (userId: string) => options.db.keys.get(userId);

  return {
    unlock: async (userId, password) => {
      const record = await existing(userId);
      if (!record) {
        const dataKey = await crypto.subtle.generateKey(
          dataKeyAlgorithm,
          true,
          usages,
        );
        const recoveryCode = generateRecoveryCode();
        const row: WrappedKeyRow = {
          userId,
          ...(await wrapWith(password, dataKey)),
          recovery: await wrapWith(
            normaliseRecoveryCode(recoveryCode) ?? '',
            dataKey,
          ),
        };
        await options.db.keys.put(row);
        return { dataKey: await nonExtractable(dataKey), recoveryCode };
      }
      const dataKey = await unwrapWith(record, password, 'invalid-credentials');
      if (record.recovery) {
        return { dataKey: await nonExtractable(dataKey), recoveryCode: null };
      }
      // Accounts created before recovery codes existed get one now.
      const recoveryCode = generateRecoveryCode();
      await options.db.keys.put({
        ...record,
        recovery: await wrapWith(
          normaliseRecoveryCode(recoveryCode) ?? '',
          dataKey,
        ),
      });
      return { dataKey: await nonExtractable(dataKey), recoveryCode };
    },

    recover: async (userId, recoveryCode, newPassword, beforeCommit) => {
      const record = await existing(userId);
      const code = normaliseRecoveryCode(recoveryCode);
      if (!record?.recovery || !code) {
        throw new AuthError('invalid-recovery');
      }
      const dataKey = await unwrapWith(
        record.recovery,
        code,
        'invalid-recovery',
      );
      const rewrapped = await wrapWith(newPassword, dataKey);
      await beforeCommit?.();
      await options.db.keys.put({ ...record, ...rewrapped });
      return nonExtractable(dataKey);
    },

    changePassword: async (
      userId,
      currentPassword,
      newPassword,
      beforeCommit,
    ) => {
      const record = await existing(userId);
      if (!record) {
        throw new AuthError('invalid-credentials');
      }
      const dataKey = await unwrapWith(
        record,
        currentPassword,
        'invalid-credentials',
      );
      const rewrapped = await wrapWith(newPassword, dataKey);
      await beforeCommit?.();
      await options.db.keys.put({ ...record, ...rewrapped });
    },

    issueRecoveryCode: async (userId, password) => {
      const record = await existing(userId);
      if (!record) {
        throw new AuthError('invalid-credentials');
      }
      const dataKey = await unwrapWith(record, password, 'invalid-credentials');
      const recoveryCode = generateRecoveryCode();
      // Replacing the wrap makes any earlier code useless.
      await options.db.keys.put({
        ...record,
        recovery: await wrapWith(
          normaliseRecoveryCode(recoveryCode) ?? '',
          dataKey,
        ),
      });
      return recoveryCode;
    },
  };
}

export function createIndexedDbSessionVault(
  db: AccountsDatabase,
): SessionVault {
  return {
    load: async () => {
      const row = await db.sessions.get('current');
      return row ? { session: row.session, dataKey: row.dataKey } : null;
    },
    save: async ({ session, dataKey }) => {
      await db.sessions.put({ id: 'current', session, dataKey });
    },
    clear: async () => {
      await db.sessions.delete('current');
    },
  };
}

export function createMemorySessionVault(): SessionVault {
  let stored: StoredSession | null = null;
  return {
    load: () => Promise.resolve(stored),
    save: (next) => {
      stored = next;
      return Promise.resolve();
    },
    clear: () => {
      stored = null;
      return Promise.resolve();
    },
  };
}
