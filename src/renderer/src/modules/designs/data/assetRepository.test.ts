import {
  AssetRepository,
  InvalidUploadError,
  MAX_UPLOAD_BYTES,
  sha256Hex,
  validateUpload,
} from '@renderer/modules/designs/data/assetRepository';
import {
  openWorkspaceDb,
  type CanvasStudioDb,
} from '@renderer/modules/designs/data/localDb';

const png = (extra = 0) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, extra])
    .buffer;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38]).buffer;
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]).buffer;

let db: CanvasStudioDb;
let repo: AssetRepository;

beforeEach(() => {
  db = openWorkspaceDb(`test-${crypto.randomUUID()}`);
  repo = new AssetRepository(db, () => 5);
});

afterEach(async () => {
  await db.delete();
});

describe('validateUpload', () => {
  it('accepts supported images with matching signatures', () => {
    expect(validateUpload('image/png', png())).toBe('image/png');
    expect(validateUpload('image/jpeg', jpeg)).toBe('image/jpeg');
    expect(validateUpload('image/gif', gif)).toBe('image/gif');
    expect(validateUpload('image/webp', webp)).toBe('image/webp');
  });

  it('rejects SVG, empty, oversized and disguised files', () => {
    expect(() => validateUpload('image/svg+xml', png())).toThrow(
      InvalidUploadError,
    );
    expect(() => validateUpload('image/png', new ArrayBuffer(0))).toThrow(
      InvalidUploadError,
    );
    expect(() =>
      validateUpload('image/png', new ArrayBuffer(MAX_UPLOAD_BYTES + 1)),
    ).toThrow(InvalidUploadError);
    expect(() => validateUpload('image/png', jpeg)).toThrow('does not match');
  });
});

describe('AssetRepository', () => {
  it('stores uploads content-addressed and de-duplicates them', async () => {
    const first = await repo.addUpload('image/png', png());
    const second = await repo.addUpload('image/png', png());

    expect(first.id).toBe(await sha256Hex(png()));
    expect(second.id).toBe(first.id);
    expect(await repo.list()).toHaveLength(1);
    expect(first.uploaded).toBe(0);
  });

  it('tracks pending uploads until marked uploaded', async () => {
    const asset = await repo.addUpload('image/png', png());

    expect((await repo.listPendingUpload()).map((a) => a.id)).toEqual([
      asset.id,
    ]);
    await repo.markUploaded(asset.id);

    expect(await repo.listPendingUpload()).toEqual([]);
    expect(await repo.has(asset.id)).toBe(true);
    expect(await repo.get(asset.id)).toMatchObject({ uploaded: 1 });
  });

  it('verifies downloaded assets against their id', async () => {
    const id = await sha256Hex(png(1));

    await repo.putDownloaded(id, 'image/png', png(1));

    expect(await repo.has(id)).toBe(true);
    await expect(repo.putDownloaded(id, 'image/png', png(2))).rejects.toThrow(
      'integrity',
    );
  });

  it('lists uploads newest first', async () => {
    let clock = 1;
    const timed = new AssetRepository(db, () => clock);
    const older = await timed.addUpload('image/png', png(1));
    clock = 2;
    const newer = await timed.addUpload('image/png', png(2));

    expect((await timed.list()).map((asset) => asset.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });
});
