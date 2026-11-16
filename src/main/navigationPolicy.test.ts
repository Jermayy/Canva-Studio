import { decideNavigation } from '@main/navigationPolicy';

const isTrusted = (url: string) => url.startsWith('file:///app/');

describe('decideNavigation', () => {
  it('allows the app renderer', () => {
    expect(decideNavigation('file:///app/index.html', isTrusted)).toBe('allow');
  });

  it('opens https links in the external browser', () => {
    expect(decideNavigation('https://supabase.com/docs', isTrusted)).toBe(
      'open-external',
    );
  });

  it('denies other schemes and malformed URLs', () => {
    expect(decideNavigation('file:///etc/passwd', isTrusted)).toBe('deny');
    expect(decideNavigation('javascript:alert(1)', isTrusted)).toBe('deny');
    expect(decideNavigation('http://insecure.test', isTrusted)).toBe('deny');
    expect(decideNavigation('not a url', isTrusted)).toBe('deny');
  });
});
