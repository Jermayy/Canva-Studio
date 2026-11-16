import { join } from 'node:path';
import {
  MAX_EXPORT_BYTES,
  type ExportFormat,
  type SaveFileRequest,
  type SaveFileResult,
  type ShareFileResult,
} from '@shared/ipc';
import { z } from 'zod';

const FORMAT_META: Record<
  ExportFormat,
  { extension: string; filterName: string; magic: number[] }
> = {
  png: {
    extension: 'png',
    filterName: 'PNG Image',
    magic: [0x89, 0x50, 0x4e, 0x47],
  },
  pdf: {
    extension: 'pdf',
    filterName: 'PDF Document',
    magic: [0x25, 0x50, 0x44, 0x46],
  },
};

export const saveFileRequestSchema = z.object({
  suggestedName: z.string().max(200),
  format: z.enum(['png', 'pdf']),
  data: z
    .instanceof(Uint8Array)
    .refine((data) => data.byteLength > 0, 'export is empty')
    .refine(
      (data) => data.byteLength <= MAX_EXPORT_BYTES,
      'export exceeds size limit',
    ),
});

/**
 * Validates an export request from the renderer.
 *
 * Checks the file signature so the renderer cannot write arbitrary content
 * disguised as an image or PDF.
 */
export function parseSaveFileRequest(input: unknown): SaveFileRequest {
  const request = saveFileRequestSchema.parse(input);
  const { magic } = FORMAT_META[request.format];
  const matches = magic.every((byte, index) => request.data[index] === byte);
  if (!matches) {
    throw new Error(`data is not a valid ${request.format} file`);
  }
  return request;
}

/** Strips path separators and control characters from a file name. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 100);
  return cleaned.length > 0 ? cleaned : 'design';
}

export interface ExportDeps {
  showSaveDialog: (options: {
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }) => Promise<{ canceled: boolean; filePath?: string }>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  mkdtemp: (prefix: string) => Promise<string>;
  tempDir: string;
  documentsDir: string;
  /** Opens the native share sheet; undefined where unsupported. */
  shareFiles?: (filePaths: string[]) => void;
  revealFile: (filePath: string) => void;
}

export async function saveFile(
  request: SaveFileRequest,
  deps: ExportDeps,
): Promise<SaveFileResult> {
  const meta = FORMAT_META[request.format];
  const fileName = `${sanitizeFileName(request.suggestedName)}.${meta.extension}`;
  const result = await deps.showSaveDialog({
    defaultPath: join(deps.documentsDir, fileName),
    filters: [{ name: meta.filterName, extensions: [meta.extension] }],
  });
  if (result.canceled || !result.filePath) {
    return { status: 'cancelled' };
  }
  await deps.writeFile(result.filePath, request.data);
  return { status: 'saved', filePath: result.filePath };
}

/**
 * Writes the export to a private temp folder and opens the OS share sheet
 * (Mail, Messages, AirDrop...). Falls back to revealing the file in the
 * file manager where no share sheet exists, so the user can attach it.
 */
export async function shareFile(
  request: SaveFileRequest,
  deps: ExportDeps,
): Promise<ShareFileResult> {
  const meta = FORMAT_META[request.format];
  const folder = await deps.mkdtemp(join(deps.tempDir, 'canvas-studio-'));
  const filePath = join(
    folder,
    `${sanitizeFileName(request.suggestedName)}.${meta.extension}`,
  );
  await deps.writeFile(filePath, request.data);
  if (deps.shareFiles) {
    deps.shareFiles([filePath]);
    return { status: 'shared' };
  }
  deps.revealFile(filePath);
  return { status: 'revealed', filePath };
}
