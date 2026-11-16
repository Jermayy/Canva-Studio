import { useWorkspace } from '@renderer/app/services';
import type { ImageSource } from '@renderer/modules/editor/domain/designModel';
import {
  findSticker,
  stickerDataUrl,
} from '@renderer/modules/library/domain/stickers';
import { useEffect, useState } from 'react';

/**
 * Resolves an image element's source to a URL: stickers are bundled data
 * URLs; uploads become object URLs over the locally stored bytes.
 */
export function useImageSourceUrl(source: ImageSource): string | null {
  const { assets } = useWorkspace();
  const stickerId = source.kind === 'sticker' ? source.stickerId : null;
  const assetId = source.kind === 'upload' ? source.assetId : null;
  // Keyed by asset so a stale (revoked) URL is never returned for a new id.
  const [upload, setUpload] = useState<{ assetId: string; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!assetId) {
      return undefined;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void assets.get(assetId).then((asset) => {
      if (cancelled || !asset) {
        return;
      }
      objectUrl = URL.createObjectURL(
        new Blob([asset.bytes], { type: asset.mime }),
      );
      setUpload({ assetId, url: objectUrl });
    });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [assetId, assets]);

  if (stickerId) {
    const sticker = findSticker(stickerId);
    return sticker ? stickerDataUrl(sticker) : null;
  }
  return upload && upload.assetId === assetId ? upload.url : null;
}
