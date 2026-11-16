import {
  parseSaveFileRequest,
  sanitizeFileName,
  saveFile,
  shareFile,
  type ExportDeps,
} from '@main/fileExport';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);

function makeDeps(overrides: Partial<ExportDeps> = {}): ExportDeps {
  return {
    showSaveDialog: vi.fn(() =>
      Promise.resolve({ canceled: false, filePath: '/docs/out.png' }),
    ),
    writeFile: vi.fn(() => Promise.resolve()),
    mkdtemp: vi.fn((prefix: string) => Promise.resolve(`${prefix}abc`)),
    tempDir: '/tmp',
    documentsDir: '/docs',
    shareFiles: vi.fn(),
    revealFile: vi.fn(),
    ...overrides,
  };
}

describe('parseSaveFileRequest', () => {
  it('accepts a valid PNG and PDF', () => {
    expect(
      parseSaveFileRequest({ suggestedName: 'a', format: 'png', data: PNG })
        .format,
    ).toBe('png');
    expect(
      parseSaveFileRequest({ suggestedName: 'a', format: 'pdf', data: PDF })
        .format,
    ).toBe('pdf');
  });

  it('rejects data whose signature does not match the format', () => {
    expect(() =>
      parseSaveFileRequest({ suggestedName: 'a', format: 'pdf', data: PNG }),
    ).toThrow('not a valid pdf');
  });

  it('rejects empty data, unknown formats and non-binary payloads', () => {
    expect(() =>
      parseSaveFileRequest({
        suggestedName: 'a',
        format: 'png',
        data: new Uint8Array(),
      }),
    ).toThrow();
    expect(() =>
      parseSaveFileRequest({ suggestedName: 'a', format: 'exe', data: PNG }),
    ).toThrow();
    expect(() =>
      parseSaveFileRequest({ suggestedName: 'a', format: 'png', data: 'x' }),
    ).toThrow();
  });
});

describe('sanitizeFileName', () => {
  it('removes path traversal and reserved characters', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('-..-etc-passwd');
    expect(sanitizeFileName('My: Party?')).toBe('My- Party-');
  });

  it('falls back to a default for empty names', () => {
    expect(sanitizeFileName('   ')).toBe('design');
    expect(sanitizeFileName('...')).toBe('design');
  });
});

describe('saveFile', () => {
  it('writes to the path the user picked', async () => {
    const deps = makeDeps();

    const result = await saveFile(
      { suggestedName: 'Party', format: 'png', data: PNG },
      deps,
    );

    expect(deps.showSaveDialog).toHaveBeenCalledWith({
      defaultPath: '/docs/Party.png',
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });
    expect(deps.writeFile).toHaveBeenCalledWith('/docs/out.png', PNG);
    expect(result).toEqual({ status: 'saved', filePath: '/docs/out.png' });
  });

  it('does nothing when the dialog is cancelled', async () => {
    const deps = makeDeps({
      showSaveDialog: () => Promise.resolve({ canceled: true }),
    });

    const result = await saveFile(
      { suggestedName: 'Party', format: 'pdf', data: PDF },
      deps,
    );

    expect(result).toEqual({ status: 'cancelled' });
    expect(deps.writeFile).not.toHaveBeenCalled();
  });
});

describe('shareFile', () => {
  it('opens the native share sheet with a temp copy', async () => {
    const deps = makeDeps();

    const result = await shareFile(
      { suggestedName: 'Xmas', format: 'pdf', data: PDF },
      deps,
    );

    expect(deps.writeFile).toHaveBeenCalledWith(
      '/tmp/canvas-studio-abc/Xmas.pdf',
      PDF,
    );
    expect(deps.shareFiles).toHaveBeenCalledWith([
      '/tmp/canvas-studio-abc/Xmas.pdf',
    ]);
    expect(result).toEqual({ status: 'shared' });
  });

  it('reveals the file where no share sheet exists', async () => {
    const deps = makeDeps({ shareFiles: undefined });

    const result = await shareFile(
      { suggestedName: 'Xmas', format: 'png', data: PNG },
      deps,
    );

    expect(deps.revealFile).toHaveBeenCalledWith(
      '/tmp/canvas-studio-abc/Xmas.png',
    );
    expect(result).toEqual({
      status: 'revealed',
      filePath: '/tmp/canvas-studio-abc/Xmas.png',
    });
  });
});
