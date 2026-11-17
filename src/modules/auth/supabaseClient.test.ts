import {
  AUTH_STORAGE_KEY,
  createSupabase,
  fetchWithTimeout,
} from '@/modules/auth/supabaseClient';

describe('fetchWithTimeout', () => {
  it('adds an abort signal to every request', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('ok')),
    );

    await fetchWithTimeout(fetchImpl, 1000)('https://x.test');

    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('combines with a caller-provided signal', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('ok')),
    );
    const controller = new AbortController();

    await fetchWithTimeout(fetchImpl, 1000)('https://x.test', {
      signal: controller.signal,
    });
    controller.abort();

    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

describe('createSupabase', () => {
  it('persists sessions in the injected storage under a namespaced key', async () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    const client = createSupabase(
      { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x' },
      storage,
      () => Promise.resolve(new Response('{}')),
    );
    await client.auth.getSession();

    expect(storage.getItem).toHaveBeenCalledWith(AUTH_STORAGE_KEY);
  });
});
