import { createAuthService } from '@/modules/auth/application/authService';
import type {
  IdentityProvider,
  Keyring,
} from '@/modules/auth/application/ports';
import {
  AuthError,
  checkThrottle,
  formatRetryAfter,
  FREE_ATTEMPTS,
  recordFailure,
  REMEMBERED_SESSION_TTL_MS,
  SESSION_TTL_MS,
} from '@/modules/auth/domain/authModel';
import {
  assessPassword,
  emailSchema,
  fieldErrors,
  signUpSchema,
} from '@/modules/auth/domain/credentials';
import { AccountsDatabase } from '@/modules/auth/infrastructure/accountsDatabase';
import {
  createIndexedDbSessionVault,
  createKeyring,
  createMemorySessionVault,
} from '@/modules/auth/infrastructure/keyring';
import { createLocalIdentityProvider } from '@/modules/auth/infrastructure/localIdentityProvider';
import { constantTimeEqual } from '@/modules/auth/infrastructure/passwordKdf';
import {
  createSupabaseIdentityProvider,
  type SupabaseAuthClient,
} from '@/modules/auth/infrastructure/supabaseIdentityProvider';
import { createAesGcmCipher, sealJson, openJson } from '@/shared/crypto/aesGcm';
import { createMemoryKeyValueStore } from '@/shared/lib/keyValueStore';
import { createLogger } from '@/shared/logger';
import { NOW } from '@/test/factories';

const ITERATIONS = 1000;
const PASSWORD = 'Correct-horse-9';
const logger = createLogger({ service: 'test', sink: () => undefined });
let dbCounter = 0;
const freshAccounts = () => {
  dbCounter += 1;
  return new AccountsDatabase(`accounts-test-${dbCounter}`);
};

describe('credential rules', () => {
  it('normalises emails and rejects invalid ones', () => {
    expect(emailSchema.parse('  Me@Example.COM ')).toBe('me@example.com');
    expect(emailSchema.safeParse('nope').success).toBe(false);
  });

  it('grades passwords and refuses weak or personal ones', () => {
    expect(assessPassword('short')).toMatchObject({
      score: 0,
      acceptable: false,
      label: 'Too short',
    });
    expect(assessPassword('password123')).toMatchObject({
      label: 'Too common',
      acceptable: false,
    });
    expect(assessPassword('aaaaaaaaaaaa').acceptable).toBe(false);
    expect(assessPassword('jemmasmith99', 'jemmasmith@x.com').label).toBe(
      'Too common',
    );
    expect(assessPassword('lowercaseonly')).toMatchObject({
      score: 1,
      label: 'Weak',
    });
    expect(assessPassword('Lowercase1only')).toMatchObject({ label: 'Good' });
    expect(assessPassword('Lowercase1').label).toBe('Fair');
    expect(assessPassword('A much Longer passphrase 2027!')).toMatchObject({
      score: 4,
      hints: [],
    });
  });

  it('reports one message per field', () => {
    const result = signUpSchema.safeParse({
      displayName: '',
      email: 'bad',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        displayName: 'Enter your name.',
        email: 'Enter a valid email address.',
        password: 'Use at least 10 characters.',
      });
    }
  });
});

describe('sign-in throttling', () => {
  it('allows a few attempts, then locks with growing delays', () => {
    let record = null;
    for (let attempt = 1; attempt < FREE_ATTEMPTS; attempt += 1) {
      record = recordFailure(record, NOW);
      expect(checkThrottle(record, NOW)).toEqual({ allowed: true });
    }
    record = recordFailure(record, NOW);
    expect(checkThrottle(record, NOW)).toEqual({
      allowed: false,
      retryAfterMs: 30_000,
    });
    expect(checkThrottle(record, NOW + 30_000)).toEqual({ allowed: true });
    record = recordFailure(record, NOW);
    expect(checkThrottle(record, NOW)).toEqual({
      allowed: false,
      retryAfterMs: 60_000,
    });
    expect(formatRetryAfter(30_000)).toBe('30 s');
    expect(formatRetryAfter(90_000)).toBe('2 min');
  });
});

describe('local identity provider + keyring', () => {
  function setup() {
    const db = freshAccounts();
    let id = 0;
    const identity = createLocalIdentityProvider({
      db,
      createId: () => `user-${(id += 1)}`,
      now: () => NOW,
      iterations: ITERATIONS,
    });
    return {
      db,
      identity,
      keyring: createKeyring({ db, iterations: ITERATIONS }),
    };
  }

  it('signs up and signs in with a stored verifier, never the password', async () => {
    const { db, identity } = setup();
    const outcome = await identity.signUp({
      email: 'a@x.test',
      password: PASSWORD,
      displayName: 'Ann',
    });
    expect(outcome).toEqual({
      kind: 'signed-in',
      identity: { userId: 'user-1', email: 'a@x.test', displayName: 'Ann' },
    });
    const row = await db.accounts.get('user-1');
    expect(JSON.stringify(row)).not.toContain(PASSWORD);
    expect(await identity.signIn('a@x.test', PASSWORD)).toMatchObject({
      userId: 'user-1',
    });
    expect(await identity.currentUserId()).toBeNull();
    await identity.signOut();
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { identity } = setup();
    await identity.signUp({
      email: 'a@x.test',
      password: PASSWORD,
      displayName: 'Ann',
    });
    await expect(
      identity.signIn('a@x.test', 'Wrong-password-1'),
    ).rejects.toMatchObject({ code: 'invalid-credentials' });
    await expect(
      identity.signIn('ghost@x.test', PASSWORD),
    ).rejects.toMatchObject({ code: 'invalid-credentials' });
    await expect(
      identity.signUp({
        email: 'a@x.test',
        password: PASSWORD,
        displayName: 'Again',
      }),
    ).rejects.toMatchObject({ code: 'email-taken' });
  });

  it('unlocks the same data key with the right password only', async () => {
    const { keyring } = setup();
    const first = await keyring.unlock('user-1', PASSWORD);
    expect(first.extractable).toBe(false);
    const sealed = await sealJson(createAesGcmCipher(first), {
      hello: 'world',
    });
    const again = await keyring.unlock('user-1', PASSWORD);
    expect(await openJson(createAesGcmCipher(again), sealed)).toEqual({
      hello: 'world',
    });
    await expect(
      keyring.unlock('user-1', 'Not-the-password-1'),
    ).rejects.toMatchObject({ code: 'invalid-credentials' });
  });

  it('keeps sessions in a vault', async () => {
    const vault = createIndexedDbSessionVault(freshAccounts());
    expect(await vault.load()).toBeNull();
    const memory = createMemorySessionVault();
    const stored = {
      session: {
        userId: 'u',
        email: 'e',
        displayName: 'd',
        provider: 'local' as const,
        expiresAt: 1,
      },
      dataKey: await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
      ),
    };
    await memory.save(stored);
    expect(await memory.load()).toBe(stored);
    await memory.clear();
    expect(await memory.load()).toBeNull();
    await vault.clear();
  });

  it('compares bytes in constant time', () => {
    expect(
      constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])),
    ).toBe(true);
    expect(
      constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])),
    ).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(
      false,
    );
  });
});

describe('auth service', () => {
  const identityFor = (
    overrides: Partial<IdentityProvider> = {},
  ): IdentityProvider => ({
    kind: 'local',
    signIn: vi.fn(() =>
      Promise.resolve({ userId: 'u1', email: 'a@x.test', displayName: 'Ann' }),
    ),
    signUp: vi.fn(() =>
      Promise.resolve({
        kind: 'signed-in' as const,
        identity: { userId: 'u1', email: 'a@x.test', displayName: 'Ann' },
      }),
    ),
    signOut: vi.fn(() => Promise.resolve()),
    currentUserId: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  });

  async function setup(identity = identityFor(), now = { value: NOW }) {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const keyring: Keyring = { unlock: vi.fn(() => Promise.resolve(key)) };
    const vault = createMemorySessionVault();
    const service = createAuthService({
      identity,
      keyring,
      vault,
      throttleStore: createMemoryKeyValueStore(),
      now: () => now.value,
      logger,
    });
    return { service, vault, keyring, identity, now };
  }

  it('signs in, unlocks the key and remembers the session for the chosen time', async () => {
    const { service, vault } = await setup();
    const stored = await service.signIn({
      email: ' A@X.test ',
      password: PASSWORD,
      remember: false,
    });
    expect(stored.session).toMatchObject({
      userId: 'u1',
      provider: 'local',
      expiresAt: NOW + SESSION_TTL_MS,
    });
    expect(await vault.load()).toBe(stored);
    const remembered = await service.signIn({
      email: 'a@x.test',
      password: PASSWORD,
      remember: true,
    });
    expect(remembered.session.expiresAt).toBe(NOW + REMEMBERED_SESSION_TTL_MS);
  });

  it('rejects blank input without calling the provider', async () => {
    const { service, identity } = await setup();
    await expect(
      service.signIn({ email: 'x', password: '', remember: false }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(identity.signIn).not.toHaveBeenCalled();
  });

  it('locks an email after repeated failures', async () => {
    const identity = identityFor({
      signIn: vi.fn(() => Promise.reject(new AuthError('invalid-credentials'))),
    });
    const { service } = await setup(identity);
    for (let attempt = 0; attempt < FREE_ATTEMPTS; attempt += 1) {
      await expect(
        service.signIn({
          email: 'a@x.test',
          password: 'Wrong-pass-1',
          remember: false,
        }),
      ).rejects.toMatchObject({
        code: 'invalid-credentials',
      });
    }
    await expect(
      service.signIn({
        email: 'a@x.test',
        password: PASSWORD,
        remember: false,
      }),
    ).rejects.toMatchObject({
      code: 'locked',
      retryAfterMs: 30_000,
    });
    expect(identity.signIn).toHaveBeenCalledTimes(FREE_ATTEMPTS);
  });

  it('wraps unexpected failures', async () => {
    const identity = identityFor({
      signIn: vi.fn(() => Promise.reject(new Error('kaboom'))),
    });
    const { service } = await setup(identity);
    await expect(
      service.signIn({
        email: 'a@x.test',
        password: PASSWORD,
        remember: false,
      }),
    ).rejects.toMatchObject({
      code: 'unknown',
    });
  });

  it('restores a valid session and ends expired ones', async () => {
    const { service, now } = await setup();
    await service.signIn({
      email: 'a@x.test',
      password: PASSWORD,
      remember: false,
    });
    expect(await service.restore()).not.toBeNull();
    now.value += SESSION_TTL_MS;
    expect(await service.restore()).toBeNull();
    expect(await service.restore()).toBeNull();
  });

  it('ends a Supabase session that no longer matches the server', async () => {
    const identity = identityFor({
      kind: 'supabase',
      currentUserId: vi.fn(() => Promise.resolve('someone-else')),
    });
    const { service } = await setup(identity);
    await service.signIn({
      email: 'a@x.test',
      password: PASSWORD,
      remember: false,
    });
    expect(await service.restore()).toBeNull();
  });

  it('signs up, or reports that confirmation is needed', async () => {
    const { service } = await setup();
    const result = await service.signUp({
      displayName: 'Ann',
      email: 'a@x.test',
      password: PASSWORD,
      remember: true,
    });
    expect(result.kind).toBe('signed-in');

    const confirming = await setup(
      identityFor({
        signUp: vi.fn(() =>
          Promise.resolve({
            kind: 'confirm-email' as const,
            email: 'a@x.test',
          }),
        ),
      }),
    );
    expect(
      await confirming.service.signUp({
        displayName: 'Ann',
        email: 'a@x.test',
        password: PASSWORD,
        remember: true,
      }),
    ).toEqual({ kind: 'confirm-email', email: 'a@x.test' });
    await expect(
      confirming.service.signUp({
        displayName: 'Ann',
        email: 'a@x.test',
        password: 'weak',
        remember: true,
      }),
    ).rejects.toMatchObject({ code: 'weak-password' });
  });

  it('signs out locally even if the provider fails', async () => {
    const identity = identityFor({
      signOut: vi.fn(() => Promise.reject(new Error('offline'))),
    });
    const { service, vault } = await setup(identity);
    await service.signIn({
      email: 'a@x.test',
      password: PASSWORD,
      remember: false,
    });
    await service.signOut();
    expect(await vault.load()).toBeNull();
  });

  it('treats a broken vault as signed out', async () => {
    const { service, vault } = await setup();
    vault.load = () => Promise.reject(new Error('corrupt'));
    expect(await service.restore()).toBeNull();
  });
});

describe('Supabase identity provider', () => {
  const user = {
    id: 'sb-1',
    email: 'a@x.test',
    user_metadata: { display_name: 'Ann' },
  };

  function client(
    overrides: Partial<SupabaseAuthClient['auth']> = {},
  ): SupabaseAuthClient {
    return {
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({ data: { user, session: {} }, error: null }),
        ),
        signUp: vi.fn(() =>
          Promise.resolve({ data: { user, session: {} }, error: null }),
        ),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        getSession: vi.fn(() =>
          Promise.resolve({ data: { session: { user } }, error: null }),
        ),
        ...overrides,
      },
    };
  }

  it('maps a successful sign-in and the current session', async () => {
    const provider = createSupabaseIdentityProvider(
      client(),
      'https://app/sign-in',
    );
    expect(await provider.signIn('a@x.test', PASSWORD)).toEqual({
      userId: 'sb-1',
      email: 'a@x.test',
      displayName: 'Ann',
    });
    expect(await provider.currentUserId()).toBe('sb-1');
    await provider.signOut();
  });

  it('maps Supabase errors to auth errors', async () => {
    const failing = (status: number | undefined, code?: string) =>
      createSupabaseIdentityProvider(
        client({
          signInWithPassword: () =>
            Promise.resolve({
              data: { user: null, session: null },
              error: { status, code, message: 'x' },
            }),
        }),
        '',
      );
    await expect(failing(400).signIn('a', 'b')).rejects.toMatchObject({
      code: 'invalid-credentials',
    });
    await expect(failing(429).signIn('a', 'b')).rejects.toMatchObject({
      code: 'rate-limited',
    });
    await expect(
      failing(422, 'weak_password').signIn('a', 'b'),
    ).rejects.toMatchObject({ code: 'weak-password' });
    await expect(failing(undefined).signIn('a', 'b')).rejects.toMatchObject({
      code: 'network',
    });
    await expect(failing(500).signIn('a', 'b')).rejects.toMatchObject({
      code: 'unknown',
    });
    const noUser = createSupabaseIdentityProvider(
      client({
        signInWithPassword: () =>
          Promise.resolve({ data: { user: null, session: null }, error: null }),
      }),
      '',
    );
    await expect(noUser.signIn('a', 'b')).rejects.toMatchObject({
      code: 'unknown',
    });
  });

  it('asks for email confirmation when sign-up returns no session', async () => {
    const signUp = vi.fn(() =>
      Promise.resolve({ data: { user, session: null }, error: null }),
    );
    const provider = createSupabaseIdentityProvider(
      client({ signUp }),
      'https://app/sign-in',
    );
    expect(
      await provider.signUp({
        email: 'a@x.test',
        password: PASSWORD,
        displayName: 'Ann',
      }),
    ).toEqual({
      kind: 'confirm-email',
      email: 'a@x.test',
    });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          data: { display_name: 'Ann' },
          emailRedirectTo: 'https://app/sign-in',
        },
      }),
    );
    const direct = createSupabaseIdentityProvider(
      client({
        signUp: () =>
          Promise.resolve({
            data: { user: { ...user, user_metadata: {} }, session: {} },
            error: null,
          }),
      }),
      '',
    );
    expect(
      await direct.signUp({
        email: 'a@x.test',
        password: PASSWORD,
        displayName: 'Ann',
      }),
    ).toMatchObject({
      kind: 'signed-in',
      identity: { displayName: 'a' },
    });
  });

  it('surfaces sign-out errors', async () => {
    const provider = createSupabaseIdentityProvider(
      client({
        signOut: () =>
          Promise.resolve({ error: { status: 500, message: 'x' } }),
      }),
      '',
    );
    await expect(provider.signOut()).rejects.toBeInstanceOf(AuthError);
  });
});
