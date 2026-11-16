import { ConfigError, looksLikeSecretKey, parseConfig } from '@/app/config';

const jwtWithRole = (role: string) =>
  `header.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.signature`;

describe('parseConfig', () => {
  it('runs local-only when Supabase is not configured', () => {
    expect(parseConfig({})).toEqual({ supabase: null });
    expect(
      parseConfig({
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_PUBLISHABLE_KEY: '',
      }),
    ).toEqual({ supabase: null });
  });

  it('accepts an https URL with a publishable key', () => {
    expect(
      parseConfig({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
      }),
    ).toEqual({
      supabase: {
        url: 'https://abc.supabase.co',
        publishableKey: 'sb_publishable_123',
      },
    });
  });

  it('allows plain http only for a local Supabase', () => {
    expect(
      parseConfig({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: jwtWithRole('anon'),
      }).supabase,
    ).not.toBeNull();
    expect(() =>
      parseConfig({
        VITE_SUPABASE_URL: 'http://abc.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'k',
      }),
    ).toThrow('https');
  });

  it('fails fast on half configuration or malformed URLs', () => {
    expect(() => parseConfig({ VITE_SUPABASE_URL: 'https://a.co' })).toThrow(
      ConfigError,
    );
    expect(() =>
      parseConfig({
        VITE_SUPABASE_URL: 'not a url',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'k',
      }),
    ).toThrow(ConfigError);
  });

  it('refuses secret keys', () => {
    for (const key of ['sb_secret_abc', jwtWithRole('service_role')]) {
      expect(() =>
        parseConfig({
          VITE_SUPABASE_URL: 'https://abc.supabase.co',
          VITE_SUPABASE_PUBLISHABLE_KEY: key,
        }),
      ).toThrow('secret');
    }
  });
});

describe('looksLikeSecretKey', () => {
  it('ignores opaque or undecodable keys', () => {
    expect(looksLikeSecretKey('sb_publishable_x')).toBe(false);
    expect(looksLikeSecretKey('a.%%%.c')).toBe(false);
  });
});
