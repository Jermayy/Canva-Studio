import type {
  AssetRecord,
  CanvasStudioDb,
} from '@renderer/modules/designs/data/localDb';

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class InvalidUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUploadError';
  }
}

const SIGNATURES: Record<AllowedImageType, (bytes: Uint8Array) => boolean> = {
  'image/png': (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  'image/webp': (b) =>
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50,
};

function isAllowedType(mime: string): mime is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);
}

/**
 * Validates an uploaded image by size, declared type and file signature.
 * SVG is deliberately excluded: it can carry scripts.
 */
export function validateUpload(
  mime: string,
  bytes: ArrayBuffer,
): AllowedImageType {
  if (!isAllowedType(mime)) {
    throw new InvalidUploadError(
      'Only PNG, JPEG, WebP and GIF images are supported',
    );
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new InvalidUploadError('Images must be between 1 byte and 10 MB');
  }
  if (
    !SIGNATURES[mime](new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength)))
  ) {
    throw new InvalidUploadError(
      'The file content does not match its image type',
    );
  }
  return mime;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * Content-addressed image store. Identical images share one record and
 * one cloud object.
 */
export class AssetRepository {
  constructor(
    private readonly db: CanvasStudioDb,
    private readonly now: () => number = Date.now,
  ) {}

  async addUpload(mime: string, bytes: ArrayBuffer): Promise<AssetRecord> {
    const type = validateUpload(mime, bytes);
    const id = await sha256Hex(bytes);
    const existing = await this.db.assets.get(id);
    if (existing) {
      return existing;
    }
    const record: AssetRecord = {
      id,
      mime: type,
      bytes,
      uploaded: 0,
      createdAt: this.now(),
    };
    await this.db.assets.put(record);
    return record;
  }

  /** Stores an asset downloaded from the cloud (already uploaded). */
  async putDownloaded(
    id: string,
    mime: string,
    bytes: ArrayBuffer,
  ): Promise<void> {
    validateUpload(mime, bytes);
    if ((await sha256Hex(bytes)) !== id) {
      throw new InvalidUploadError(
        'Downloaded asset failed its integrity check',
      );
    }
    await this.db.assets.put({
      id,
      mime,
      bytes,
      uploaded: 1,
      createdAt: this.now(),
    });
  }

  get(id: string): Promise<AssetRecord | undefined> {
    return this.db.assets.get(id);
  }

  async has(id: string): Promise<boolean> {
    return (await this.db.assets.where('id').equals(id).count()) > 0;
  }

  async listPendingUpload(): Promise<AssetRecord[]> {
    return this.db.assets.where('uploaded').equals(0).toArray();
  }

  async markUploaded(id: string): Promise<void> {
    await this.db.assets.update(id, { uploaded: 1 });
  }

  /** Uploaded images, newest first, for the Uploads panel. */
  async list(): Promise<AssetRecord[]> {
    const records = await this.db.assets.toArray();
    return records.sort((a, b) => b.createdAt - a.createdAt);
  }
}
