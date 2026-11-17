import type { FileDelivery } from '@/modules/export/fileDelivery';
import type { SharedDesignView } from '@/modules/share/shareStore';

const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Downloads a shared design's image. Fetched as bytes (not a plain link)
 * because browsers ignore `download` on cross-origin links, and so the
 * file goes through FileDelivery's PNG validation.
 */
export async function downloadSharedImage(
  view: Pick<SharedDesignView, 'title' | 'imageUrl'>,
  deps: { fetch: typeof fetch; files: FileDelivery },
): Promise<void> {
  const response = await deps.fetch(view.imageUrl, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`image download failed: HTTP ${response.status}`);
  }
  const data = new Uint8Array(await response.arrayBuffer());
  await deps.files.save({ suggestedName: view.title, format: 'png', data });
}
