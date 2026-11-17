import { z } from 'zod';

/** Public share pages live at /s/<share id>. */
export const SHARE_PATH_PREFIX = '/s/';

/**
 * Share images are capped so a poster-sized design doesn't produce a
 * huge public PNG; plenty for viewing on any screen.
 */
export const MAX_SHARE_IMAGE_SIDE = 2400;

const shareIdSchema = z.uuid();

export function buildShareUrl(origin: string, shareId: string): string {
  return `${origin}${SHARE_PATH_PREFIX}${shareId}`;
}

/**
 * Returns the share id when `pathname` is a share page, else null.
 * Validated here so malformed ids never reach the server.
 */
export function parseShareId(pathname: string): string | null {
  if (!pathname.startsWith(SHARE_PATH_PREFIX)) {
    return null;
  }
  const candidate = pathname.slice(SHARE_PATH_PREFIX.length).replace(/\/$/, '');
  const parsed = shareIdSchema.safeParse(candidate);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

/** True for any /s/... path, valid id or not (it's a share page either way). */
export function isSharePath(pathname: string): boolean {
  return pathname.startsWith(SHARE_PATH_PREFIX);
}

/** Render scale that keeps the longest side within the share cap. */
export function shareImageScale(width: number, height: number): number {
  return Math.min(1, MAX_SHARE_IMAGE_SIDE / Math.max(width, height));
}
