import type { DesignDocument } from '@/modules/editor/domain/designModel';
import type {
  ExportFormat,
  FileDelivery,
  SaveResult,
  ShareResult,
} from '@/modules/export/fileDelivery';
import { jsPDF } from 'jspdf';
import type Konva from 'konva';

/** Konva node name for selection UI that must not appear in exports. */
export const EDITOR_ONLY_NAME = 'editor-only';

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const match = /^data:[^;]+;base64,(.*)$/.exec(dataUrl);
  if (!match?.[1]) {
    throw new Error('Expected a base64 data URL');
  }
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Wraps a PNG in a single-page PDF sized exactly to the design. */
export function buildPdf(
  pngDataUrl: string,
  width: number,
  height: number,
): Uint8Array {
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
    hotfixes: ['px_scaling'],
    compress: true,
  });
  pdf.addImage(pngDataUrl, 'PNG', 0, 0, width, height, undefined, 'FAST');
  return new Uint8Array(pdf.output('arraybuffer'));
}

/**
 * Renders the design area of the stage at full design resolution.
 *
 * The stage is displayed scaled by `zoom`, so the pixel ratio undoes the
 * zoom; selection handles are hidden for the capture.
 */
export function renderStageToPng(
  stage: Konva.Stage,
  document: Pick<DesignDocument, 'width' | 'height'>,
  zoom: number,
  scale = 1,
): string {
  const hidden = stage
    .find(`.${EDITOR_ONLY_NAME}`)
    .filter((node) => node.visible());
  for (const node of hidden) {
    node.hide();
  }
  try {
    return stage.toDataURL({
      x: 0,
      y: 0,
      width: document.width * zoom,
      height: document.height * zoom,
      pixelRatio: scale / zoom,
      mimeType: 'image/png',
    });
  } finally {
    for (const node of hidden) {
      node.show();
    }
  }
}

export function encodeExport(
  format: ExportFormat,
  pngDataUrl: string,
  document: Pick<DesignDocument, 'width' | 'height'>,
): Uint8Array {
  return format === 'pdf'
    ? buildPdf(pngDataUrl, document.width, document.height)
    : dataUrlToBytes(pngDataUrl);
}

export class ExportService {
  constructor(private readonly files: FileDelivery) {}

  save(
    format: ExportFormat,
    title: string,
    data: Uint8Array,
  ): Promise<SaveResult> {
    return this.files.save({ suggestedName: title, format, data });
  }

  share(
    format: ExportFormat,
    title: string,
    data: Uint8Array,
  ): Promise<ShareResult> {
    return this.files.share({ suggestedName: title, format, data });
  }
}
