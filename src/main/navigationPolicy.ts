/**
 * Decides what to do when the renderer tries to open or navigate to a URL.
 *
 * The app never navigates its own window away from the renderer, and only
 * hands plain https links to the default browser. Everything else is denied.
 */
export type NavigationDecision = 'allow' | 'open-external' | 'deny';

export function decideNavigation(
  url: string,
  isTrustedUrl: (url: string) => boolean,
): NavigationDecision {
  if (isTrustedUrl(url)) {
    return 'allow';
  }
  try {
    return new URL(url).protocol === 'https:' ? 'open-external' : 'deny';
  } catch {
    return 'deny';
  }
}
