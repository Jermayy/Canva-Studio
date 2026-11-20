import type {
  Keyring,
  SessionVault,
  StoredSession,
} from '@/modules/auth/application/ports';
import { AuthError } from '@/modules/auth/domain/authModel';
import type { AccountsDatabase } from '@/modules/auth/infrastructure/accountsDatabase';
import {
  DEFAULT_ITERATIONS,
  deriveWrappingKey,
  randomSalt,
} from '@/modules/auth/infrastructure/passwordKdf';
import { fromBase64, toBase64 } from '@/shared/crypto/aesGcm';

/**
 * Envelope encryption for workspaces. Each account has a random AES-256
 * data key; only a copy wrapped with a password-derived key is stored. The
 * unwrapped key is non-extractable, so page script can use it but can't
 * read it out.
 */
export function createKeyring(options: {
  db: AccountsDatabase;
  iterations?: number;
}): Keyring {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const dataKeyAlgorithm = { name: 'AES-GCM', length: 256 } as const;

  const unwrap = async (
    wrapped: { salt: string; iterations: number; iv: string; wrapped: string },
    password: string,
  ): Promise<CryptoKey> => {
    const wrappingKey = await deriveWrappingKey(
      password,
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
        false,
        ['encrypt', 'decrypt'],
      );
    } catch {
      // The GCM tag fails when the password differs from the one used to wrap.
      throw new AuthError('invalid-credentials');
    }
  };

  return {
    unlock: async (userId, password) => {
      const existing = await options.db.keys.get(userId);
      if (existing) {
        return unwrap(existing, password);
      }
      const dataKey = await crypto.subtle.generateKey(dataKeyAlgorithm, true, [
        'encrypt',
        'decrypt',
      ]);
      const salt = randomSalt();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const wrappingKey = await deriveWrappingKey(password, salt, iterations);
      const wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, {
        name: 'AES-GCM',
        iv,
      });
      const record = {
        userId,
        salt: toBase64(salt),
        iterations,
        iv: toBase64(iv),
        wrapped: toBase64(new Uint8Array(wrapped)),
      };
      await options.db.keys.put(record);
      // Hand back a non-extractable copy; the extractable one is dropped.
      return unwrap(record, password);
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
