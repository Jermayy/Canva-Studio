import {
  EDITOR_ONLY_NAME,
  ExportService,
  buildPdf,
  dataUrlToBytes,
  encodeExport,
  renderStageToPng,
} from '@/modules/export/exportService';
import type Konva from 'konva';

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const startsWith = (bytes: Uint8Array, text: string) =>
  String.fromCharCode(...bytes.slice(0, text.length)) === text;

describe('dataUrlToBytes', () => {
  it('decodes base64 data URLs', () => {
    const bytes = dataUrlToBytes(PNG_1X1);

    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('rejects non-base64 input', () => {
    expect(() => dataUrlToBytes('data:image/svg+xml,<svg/>')).toThrow('base64');
  });
});

describe('buildPdf and encodeExport', () => {
  it('produces a PDF document', () => {
    expect(startsWith(buildPdf(PNG_1X1, 400, 300), '%PDF')).toBe(true);
    expect(startsWith(buildPdf(PNG_1X1, 300, 400), '%PDF')).toBe(true);
  });

  it('encodes PNG and PDF formats', () => {
    const size = { width: 200, height: 200 };

    expect(encodeExport('png', PNG_1X1, size)[0]).toBe(0x89);
    expect(startsWith(encodeExport('pdf', PNG_1X1, size), '%PDF')).toBe(true);
  });
});

describe('renderStageToPng', () => {
  it('captures the design area at full resolution with editor UI hidden', () => {
    const handle = { visible: () => true, hide: vi.fn(), show: vi.fn() };
    const stage = {
      find: vi.fn(() => [handle]),
      toDataURL: vi.fn(() => PNG_1X1),
    };

    const url = renderStageToPng(
      stage as unknown as Konva.Stage,
      { width: 1000, height: 500 },
      0.5,
      2,
    );

    expect(url).toBe(PNG_1X1);
    expect(stage.find).toHaveBeenCalledWith(`.${EDITOR_ONLY_NAME}`);
    expect(stage.toDataURL).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 500,
      height: 250,
      pixelRatio: 4,
      mimeType: 'image/png',
    });
    expect(handle.hide).toHaveBeenCalled();
    expect(handle.show).toHaveBeenCalled();
  });

  it('restores editor UI even if rendering fails', () => {
    const handle = { visible: () => true, hide: vi.fn(), show: vi.fn() };
    const stage = {
      find: () => [handle],
      toDataURL: () => {
        throw new Error('tainted canvas');
      },
    };

    expect(() =>
      renderStageToPng(
        stage as unknown as Konva.Stage,
        { width: 10, height: 10 },
        1,
      ),
    ).toThrow('tainted');
    expect(handle.show).toHaveBeenCalled();
  });
});

describe('ExportService', () => {
  it('forwards save and share requests to file delivery', async () => {
    const files = {
      save: vi.fn(() =>
        Promise.resolve({
          status: 'downloaded' as const,
          fileName: 'Poster.png',
        }),
      ),
      share: vi.fn(() => Promise.resolve({ status: 'shared' as const })),
    };
    const service = new ExportService(files);
    const data = new Uint8Array([1]);

    await service.save('png', 'Poster', data);
    await service.share('pdf', 'Poster', data);

    expect(files.save).toHaveBeenCalledWith({
      suggestedName: 'Poster',
      format: 'png',
      data,
    });
    expect(files.share).toHaveBeenCalledWith({
      suggestedName: 'Poster',
      format: 'pdf',
      data,
    });
  });
});
