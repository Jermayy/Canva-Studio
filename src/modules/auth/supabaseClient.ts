import type { SupabaseConfig } from '@/app/config';
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

/** Namespaced so the session never collides with other apps on the origin. */
export const AUTH_STORAGE_KEY = 'canvas-studio-auth';

/** The subset of Web Storage that Supabase auth needs. */
export type SessionStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

/**
 * Creates the Supabase client.
 *
 * The session lives in browser storage (localStorage by default). That is
 * a deliberate, documented deviation from the playbook: see
 * docs/adr/0006-browser-session-storage.md for the threat model and the
 * CSP that mitigates it.
 */
export function createSupabase(
  config: SupabaseConfig,
  storage: SessionStorage,
  fetchImpl: FetchFn = fetch,
): SupabaseClient {
  // No generated Database types: rows are validated with zod in the
  // remote store instead, so the client's default `any` schema is fine.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return createClient(config.url, config.publishableKey, {
    auth: {
      storage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { fetch: fetchWithTimeout(fetchImpl, REQUEST_TIMEOUT_MS) },
  });
}
