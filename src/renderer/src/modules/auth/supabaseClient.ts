import type { SupabaseConfig } from '@renderer/app/config';
import type { CanvasStudioApi } from '@shared/ipc';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const REQUEST_TIMEOUT_MS = 15_000;

type FetchFn = typeof fetch;

/** Wraps fetch so every Supabase request has a hard timeout. */
export function fetchWithTimeout(
  fetchImpl: FetchFn,
  timeoutMs: number,
): FetchFn {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    return fetchImpl(input, { ...init, signal });
  };
}

/**
 * Creates the Supabase client. Sessions are persisted through the main
 * process, encrypted with the OS keychain, never in localStorage.
 */
export function createSupabase(
  config: SupabaseConfig,
  secureStore: CanvasStudioApi['secureStore'],
  fetchImpl: FetchFn = fetch,
): SupabaseClient {
  // No generated Database types: rows are validated with zod in the
  // remote store instead, so the client's default `any` schema is fine.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return createClient(config.url, config.publishableKey, {
    auth: {
      storage: secureStore,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { fetch: fetchWithTimeout(fetchImpl, REQUEST_TIMEOUT_MS) },
  });
}
