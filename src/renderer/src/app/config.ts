import { z } from 'zod';

/**
 * Typed renderer configuration, validated once at startup.
 *
 * Supabase settings are optional as a pair: with neither set the app runs
 * local-only and says so in the UI. A half-configured or unsafe setup is
 * a hard error so it can't ship by accident.
 */

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export interface AppConfig {
  supabase: SupabaseConfig | null;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Invalid configuration: ${message}`);
    this.name = 'ConfigError';
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

const urlSchema = z.url().refine((value) => {
  // Zod 4 still runs refinements after z.url() fails, so parse defensively.
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === 'https:' || LOCAL_HOSTS.has(url.hostname);
}, 'must use https (http is only allowed for a local Supabase)');

/** Detects secret keys that must never ship inside a desktop app. */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) {
    return true;
  }
  const payload = key.split('.')[1];
  if (!payload) {
    return false;
  }
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: unknown }).role === 'service_role';
  } catch {
    return false;
  }
}

export function parseConfig(env: Record<string, unknown>): AppConfig {
  const url = env.RENDERER_VITE_SUPABASE_URL;
  const key = env.RENDERER_VITE_SUPABASE_PUBLISHABLE_KEY;
  const hasUrl = typeof url === 'string' && url.length > 0;
  const hasKey = typeof key === 'string' && key.length > 0;

  if (!hasUrl && !hasKey) {
    return { supabase: null };
  }
  if (!hasUrl || !hasKey) {
    throw new ConfigError(
      'set both RENDERER_VITE_SUPABASE_URL and RENDERER_VITE_SUPABASE_PUBLISHABLE_KEY, or neither',
    );
  }
  const parsedUrl = urlSchema.safeParse(url);
  if (!parsedUrl.success) {
    throw new ConfigError(
      `RENDERER_VITE_SUPABASE_URL ${parsedUrl.error.issues[0]?.message ?? 'is invalid'}`,
    );
  }
  if (looksLikeSecretKey(key)) {
    throw new ConfigError(
      'RENDERER_VITE_SUPABASE_PUBLISHABLE_KEY is a secret/service key; use the publishable (anon) key',
    );
  }
  return { supabase: { url: parsedUrl.data, publishableKey: key } };
}
