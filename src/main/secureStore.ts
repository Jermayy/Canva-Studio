import { MAX_SECURE_VALUE_BYTES } from '@shared/ipc';
import { z } from 'zod';

/** Subset of Electron's `safeStorage` the store needs. */
export interface Encryptor {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
}

/** Subset of `node:fs/promises` the store needs. */
export interface StoreFileSystem {
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
  writeFile: (
    path: string,
    data: string,
    options: { mode: number },
  ) => Promise<void>;
}

export const secureKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,128}$/, 'invalid secure-store key');

export const secureValueSchema = z
  .string()
  .max(MAX_SECURE_VALUE_BYTES, 'secure-store value too large');

const fileSchema = z.record(z.string(), z.string());

export class EncryptionUnavailableError extends Error {
  constructor() {
    super('OS-level encryption is unavailable; refusing to store secrets');
    this.name = 'EncryptionUnavailableError';
  }
}

/**
 * Persists small secrets (auth sessions) encrypted with the OS keychain.
 *
 * Values never touch disk in plain text. If OS encryption is unavailable
 * the store refuses writes rather than silently falling back to plain text.
 */
export class SecureStore {
  private cache: Record<string, string> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly encryptor: Encryptor,
    private readonly fs: StoreFileSystem,
  ) {}

  async getItem(key: string): Promise<string | null> {
    const entries = await this.load();
    const encrypted = entries[secureKeySchema.parse(key)];
    if (encrypted === undefined) {
      return null;
    }
    return this.encryptor.decryptString(Buffer.from(encrypted, 'base64'));
  }

  async setItem(key: string, value: string): Promise<void> {
    const validKey = secureKeySchema.parse(key);
    const validValue = secureValueSchema.parse(value);
    if (!this.encryptor.isEncryptionAvailable()) {
      throw new EncryptionUnavailableError();
    }
    const entries = await this.load();
    entries[validKey] = this.encryptor
      .encryptString(validValue)
      .toString('base64');
    await this.persist(entries);
  }

  async removeItem(key: string): Promise<void> {
    const validKey = secureKeySchema.parse(key);
    const entries = await this.load();
    if (!(validKey in entries)) {
      return;
    }
    // Rebuild without the key instead of `delete` on a dynamic property.
    const next = Object.fromEntries(
      Object.entries(entries).filter(([entryKey]) => entryKey !== validKey),
    );
    await this.persist(next);
  }

  private async load(): Promise<Record<string, string>> {
    if (this.cache) {
      return this.cache;
    }
    try {
      const raw = await this.fs.readFile(this.filePath, 'utf8');
      this.cache = fileSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isNotFound(error)) {
        this.cache = {};
      } else {
        throw error;
      }
    }
    return this.cache;
  }

  private async persist(entries: Record<string, string>): Promise<void> {
    // 0o600: readable only by the current OS user.
    await this.fs.writeFile(this.filePath, JSON.stringify(entries), {
      mode: 0o600,
    });
    this.cache = entries;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
