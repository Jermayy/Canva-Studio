import {
  createSupabase,
  fetchWithTimeout,
} from '@renderer/modules/auth/supabaseClient';

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
  it('persists sessions through the secure store, not localStorage', async () => {
    const secureStore = {
      getItem: vi.fn(() => Promise.resolve(null)),
      setItem: vi.fn(() => Promise.resolve()),
      removeItem: vi.fn(() => Promise.resolve()),
    };
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const client = createSupabase(
      { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x' },
      secureStore,
      () => Promise.resolve(new Response('{}')),
    );
    await client.auth.getSession();

    expect(secureStore.getItem).toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('auth-token'),
      expect.anything(),
    );
  });
});
