export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;
const VIEWPORT_PADDING = 64;

/** Zoom that fits the whole page inside the viewport with some margin. */
export function fitZoom(
  viewport: { width: number; height: number },
  page: { width: number; height: number },
): number {
  const availableWidth = Math.max(1, viewport.width - VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(1, viewport.height - VIEWPORT_PADDING * 2);
  const zoom = Math.min(
    availableWidth / page.width,
    availableHeight / page.height,
  );
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
