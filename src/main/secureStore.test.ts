import {
  EncryptionUnavailableError,
  SecureStore,
  type Encryptor,
  type StoreFileSystem,
} from '@main/secureStore';

// Reversible fake: prefixes so plain text never equals stored value.
const fakeEncryptor = (available = true): Encryptor => ({
  isEncryptionAvailable: () => available,
  encryptString: (text) => Buffer.from(`enc:${text}`),
  decryptString: (buffer) => buffer.toString().replace(/^enc:/, ''),
});

function memoryFs(initial?: string): StoreFileSystem & { data?: string } {
  const fs: StoreFileSystem & { data?: string } = {
    readFile: () => {
      if (fs.data === undefined) {
        return Promise.reject(
          Object.assign(new Error('missing'), { code: 'ENOENT' }),
        );
      }
      return Promise.resolve(fs.data);
    },
    writeFile: (_path, data) => {
      fs.data = data;
      return Promise.resolve();
    },
  };
  if (initial !== undefined) {
    fs.data = initial;
  }
  return fs;
}

describe('SecureStore', () => {
  it('returns null for a missing file', async () => {
    const store = new SecureStore('/x', fakeEncryptor(), memoryFs());

    await expect(store.getItem('session')).resolves.toBeNull();
  });

  it('round-trips values and never writes plain text', async () => {
    const fs = memoryFs();
    const store = new SecureStore('/x', fakeEncryptor(), fs);

    await store.setItem('sb-auth-token', 'secret-session');

    expect(fs.data).not.toContain('secret-session');
    await expect(store.getItem('sb-auth-token')).resolves.toBe(
      'secret-session',
    );
  });

  it('reads values persisted by a previous instance', async () => {
    const fs = memoryFs();
    await new SecureStore('/x', fakeEncryptor(), fs).setItem('k', 'v');

    const fresh = new SecureStore('/x', fakeEncryptor(), fs);

    await expect(fresh.getItem('k')).resolves.toBe('v');
  });

  it('removes values and ignores unknown keys', async () => {
    const fs = memoryFs();
    const store = new SecureStore('/x', fakeEncryptor(), fs);
    await store.setItem('a', '1');
    await store.setItem('b', '2');

    await store.removeItem('a');
    await store.removeItem('missing');

    await expect(store.getItem('a')).resolves.toBeNull();
    await expect(store.getItem('b')).resolves.toBe('2');
  });

  it('refuses to write when OS encryption is unavailable', async () => {
    const store = new SecureStore('/x', fakeEncryptor(false), memoryFs());

    await expect(store.setItem('k', 'v')).rejects.toBeInstanceOf(
      EncryptionUnavailableError,
    );
  });

  it('rejects keys that could escape the expected format', async () => {
    const store = new SecureStore('/x', fakeEncryptor(), memoryFs());

    await expect(store.getItem('../etc/passwd')).rejects.toThrow();
    await expect(store.setItem('', 'v')).rejects.toThrow();
  });

  it('rejects oversized values', async () => {
    const store = new SecureStore('/x', fakeEncryptor(), memoryFs());

    await expect(store.setItem('k', 'x'.repeat(70_000))).rejects.toThrow();
  });

  it('propagates unexpected read errors', async () => {
    const fs = memoryFs();
    fs.readFile = () => Promise.reject(new Error('disk failure'));
    const store = new SecureStore('/x', fakeEncryptor(), fs);

    await expect(store.getItem('k')).rejects.toThrow('disk failure');
  });

  it('rejects a corrupted store file', async () => {
    const store = new SecureStore('/x', fakeEncryptor(), memoryFs('{"k": 42}'));

    await expect(store.getItem('k')).rejects.toThrow();
  });
});
