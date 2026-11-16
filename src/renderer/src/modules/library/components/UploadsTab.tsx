import { useLiveQuery, useLoadedImage } from '@renderer/app/hooks';
import { useServices, useWorkspace } from '@renderer/app/services';
import {
  ALLOWED_IMAGE_TYPES,
  InvalidUploadError,
} from '@renderer/modules/designs/data/assetRepository';
import type { AssetRecord } from '@renderer/modules/designs/data/localDb';
import { LibraryTile } from '@renderer/modules/library/components/LibraryTile';
import { useImageSourceUrl } from '@renderer/modules/designs/hooks/useImageSourceUrl';
import type { LibraryItem } from '@renderer/modules/library/domain/elementFactory';
import { useId, useState, type ChangeEvent } from 'react';

export interface UploadsTabProps {
  onAdd: (item: LibraryItem) => void;
}

export function UploadsTab({ onAdd }: UploadsTabProps) {
  const { assets } = useWorkspace();
  const { logger } = useServices();
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uploads = useLiveQuery(
    () => assets.list(),
    'assets',
    [] as AssetRecord[],
  );

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    setError(null);
    setBusy(true);
    try {
      for (const file of files) {
        await assets.addUpload(file.type, await file.arrayBuffer());
      }
    } catch (uploadError) {
      if (uploadError instanceof InvalidUploadError) {
        setError(uploadError.message);
      } else {
        logger.error('upload.failed', { error: String(uploadError) });
        setError('Could not add that image. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uploads-tab">
      <label htmlFor={inputId} className="button primary upload-button">
        {busy ? 'Adding…' : 'Upload images'}
      </label>
      <input
        id={inputId}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        multiple
        className="visually-hidden"
        disabled={busy}
        onChange={(event) => {
          void handleFiles(event);
        }}
      />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {uploads.length === 0 ? (
        <p className="muted">
          Your uploaded images appear here. They sync with your account.
        </p>
      ) : (
        <div className="tile-grid">
          {uploads.map((asset) => (
            <UploadTile key={asset.id} asset={asset} onAdd={onAdd} />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadTile({
  asset,
  onAdd,
}: {
  asset: AssetRecord;
  onAdd: (item: LibraryItem) => void;
}) {
  const url = useImageSourceUrl({ kind: 'upload', assetId: asset.id });
  const image = useLoadedImage(url);
  if (!url) {
    return null;
  }
  // Natural size is needed to keep the aspect ratio when placed.
  const item: LibraryItem = {
    kind: 'upload',
    assetId: asset.id,
    width: image?.naturalWidth || 400,
    height: image?.naturalHeight || 400,
  };
  return (
    <LibraryTile item={item} label="uploaded image" onAdd={onAdd}>
      <img src={url} alt="" />
    </LibraryTile>
  );
}
