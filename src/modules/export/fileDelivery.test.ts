import {
  MAX_EXPORT_BYTES,
  createBrowserFileDelivery,
  parseExportFile,
  sanitizeFileName,
  type BrowserFileEnv,
  type ExportFile,
} from '@/modules/export/fileDelivery';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);

function pngFile(overrides: Partial<ExportFile> = {}): ExportFile {
  return { suggestedName: 'Party', format: 'png', data: PNG, ...overrides };
}

function fakeEnv(navigator: BrowserFileEnv['navigator'] = {} as never) {
  const clicks: { href: string; download: string }[] = [];
  const env: BrowserFileEnv = {
    document,
    navigator,
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  };
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.href, download: this.download });
  });
  return { env, clicks };
}

describe('parseExportFile', () => {
  it('accepts PNG and PDF data with the right signature', () => {
    expect(parseExportFile(pngFile()).format).toBe('png');
    expect(parseExportFile(pngFile({ format: 'pdf', data: PDF })).format).toBe(
      'pdf',
    );
  });

  it('rejects data that does not match the format', () => {
    expect(() => parseExportFile(pngFile({ format: 'pdf' }))).toThrow(
      'not a valid pdf',
    );
  });

  it('rejects empty, oversized and unknown-format exports', () => {
    expect(() => parseExportFile(pngFile({ data: new Uint8Array() }))).toThrow(
      'empty',
    );
    expect(() =>
      parseExportFile(pngFile({ data: new Uint8Array(MAX_EXPORT_BYTES + 1) })),
    ).toThrow('size limit');
    expect(() => parseExportFile({ ...pngFile(), format: 'svg' })).toThrow();
  });
});

describe('sanitizeFileName', () => {
  it('removes path separators, control characters and leading dots', () => {
    expect(sanitizeFileName('../a/b\\c:d\u0007')).toBe('-a-b-c-d');
    expect(sanitizeFileName('.hidden')).toBe('hidden');
  });

  it('falls back to a default and caps the length', () => {
    expect(sanitizeFileName('   ')).toBe('design');
    expect(sanitizeFileName('x'.repeat(300))).toHaveLength(100);
  });
});

describe('createBrowserFileDelivery', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('downloads through a temporary link and revokes the URL later', async () => {
    const { env, clicks } = fakeEnv();
    const delivery = createBrowserFileDelivery(env);

    const result = await delivery.save(pngFile({ suggestedName: 'a/b' }));

    expect(result).toEqual({ status: 'downloaded', fileName: 'a-b.png' });
    expect(clicks).toEqual([{ href: 'blob:fake', download: 'a-b.png' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(env.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(env.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('refuses to download invalid data', async () => {
    const { env, clicks } = fakeEnv();

    await expect(
      createBrowserFileDelivery(env).save(pngFile({ format: 'pdf' })),
    ).rejects.toThrow('not a valid pdf');
    expect(clicks).toHaveLength(0);
  });

  it('shares the file through the Web Share API when supported', async () => {
    const share = vi.fn(() => Promise.resolve());
    const { env, clicks } = fakeEnv({ share, canShare: () => true });

    const result = await createBrowserFileDelivery(env).share(
      pngFile({ format: 'pdf', data: PDF }),
    );

    expect(result).toEqual({ status: 'shared' });
    const [data] = share.mock.calls[0] as unknown as [ShareData];
    expect(data.files?.[0]?.name).toBe('Party.pdf');
    expect(data.files?.[0]?.type).toBe('application/pdf');
    expect(clicks).toHaveLength(0);
  });

  it('treats closing the share sheet as a cancel, not an error', async () => {
    const share = vi.fn(() =>
      Promise.reject(new DOMException('closed', 'AbortError')),
    );
    const { env } = fakeEnv({ share, canShare: () => true });

    await expect(
      createBrowserFileDelivery(env).share(pngFile()),
    ).resolves.toEqual({ status: 'cancelled' });
  });

  it('propagates real share failures', async () => {
    const share = vi.fn(() =>
      Promise.reject(new DOMException('nope', 'NotAllowedError')),
    );
    const { env } = fakeEnv({ share, canShare: () => true });

    await expect(
      createBrowserFileDelivery(env).share(pngFile()),
    ).rejects.toThrow('nope');
  });

  it('downloads instead when the browser cannot share files', async () => {
    const withoutCanShare = fakeEnv({ share: vi.fn() } as never);
    const refusing = fakeEnv({ share: vi.fn(), canShare: () => false });

    await expect(
      createBrowserFileDelivery(withoutCanShare.env).share(pngFile()),
    ).resolves.toEqual({ status: 'downloaded', fileName: 'Party.png' });
    await expect(
      createBrowserFileDelivery(refusing.env).share(pngFile()),
    ).resolves.toEqual({ status: 'downloaded', fileName: 'Party.png' });
  });
});
