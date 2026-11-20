import type { SupabaseConfig } from '@/app/config';
import type { SupabaseAuthClient } from '@/modules/auth/infrastructure/supabaseIdentityProvider';
import { createClient } from '@supabase/supabase-js';

export const REQUEST_TIMEOUT_MS = 15_000;
/** Namespaced so the session never collides with other apps on the origin (ADR 0006). */
export const AUTH_STORAGE_KEY = 'canvas-studio-auth';

/** Every Supabase request gets a hard timeout (playbook 10). */
export function fetchWithTimeout(
  fetchImpl: typeof fetch,
  timeoutMs: number,
): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    return fetchImpl(input, { ...init, signal });
  };
}

export function createSupabaseAuthClient(
  config: SupabaseConfig,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): SupabaseAuthClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      storage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { fetch: fetchWithTimeout(fetch, REQUEST_TIMEOUT_MS) },
  });
}
