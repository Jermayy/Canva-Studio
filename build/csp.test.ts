import { buildCsp, injectCsp } from '@build/csp';

describe('buildCsp', () => {
  it('locks production scripts to self and network to the Supabase project', () => {
    const csp = buildCsp('https://abc.supabase.co', false);

    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain(
      "connect-src 'self' https://abc.supabase.co wss://abc.supabase.co",
    );
    expect(csp).toContain("img-src 'self' data: blob: https://abc.supabase.co");
    expect(csp).not.toContain('localhost');
  });

  it('allows only self when Supabase is not configured', () => {
    const csp = buildCsp(undefined, false);

    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain("img-src 'self' data: blob:;");
  });

  it('allows the dev server and React Refresh preamble in dev only', () => {
    const csp = buildCsp(undefined, true);

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain('ws://localhost:*');
  });
});

describe('injectCsp', () => {
  it('replaces the placeholder with a meta tag', () => {
    expect(injectCsp('<head><!-- CSP --></head>', "default-src 'self'")).toBe(
      `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'" /></head>`,
    );
  });

  it('fails the build when the placeholder is missing', () => {
    expect(() => injectCsp('<head></head>', 'x')).toThrow('placeholder');
  });
});
