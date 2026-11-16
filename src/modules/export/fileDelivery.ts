import { z } from 'zod';

/**
 * Hands exported files to the user: a browser download, or the OS share
 * sheet through the Web Share API where the browser supports sharing files.
 *
 * Browser APIs are injected so this is testable without a real browser.
 */

export type ExportFormat = 'png' | 'pdf';

export interface ExportFile {
  /** Suggested file name without extension. */
  suggestedName: string;
  format: ExportFormat;
  data: Uint8Array;
}

export type SaveResult = { status: 'downloaded'; fileName: string };

export type ShareResult =
  | { status: 'shared' }
  | { status: 'cancelled' }
  /** Browsers that can't share files get a download instead. */
  | { status: 'downloaded'; fileName: string };

export interface FileDelivery {
  save: (file: ExportFile) => Promise<SaveResult>;
  share: (file: ExportFile) => Promise<ShareResult>;
}

/** Largest export we hand to the browser (50 MB). */
export const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

const FORMAT_META: Record<
  ExportFormat,
  { extension: string; mimeType: string; magic: number[] }
> = {
  png: {
    extension: 'png',
    mimeType: 'image/png',
    magic: [0x89, 0x50, 0x4e, 0x47],
  },
  pdf: {
    extension: 'pdf',
    mimeType: 'application/pdf',
    magic: [0x25, 0x50, 0x44, 0x46],
  },
};

const exportFileSchema = z.object({
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
 * Validates an export before it leaves the app. The file signature check
 * catches encoder bugs that would otherwise hand users a corrupt file.
 */
export function parseExportFile(input: unknown): ExportFile {
  const file = exportFileSchema.parse(input);
  const { magic } = FORMAT_META[file.format];
  if (!magic.every((byte, index) => file.data[index] === byte)) {
    throw new Error(`data is not a valid ${file.format} file`);
  }
  return file;
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

export interface BrowserFileEnv {
  document: Document;
  navigator: Pick<Navigator, 'share' | 'canShare'>;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

/** Revoking straight after click() can cancel the download in some browsers. */
const REVOKE_DELAY_MS = 30_000;

export function createBrowserFileDelivery(env: BrowserFileEnv): FileDelivery {
  const toBlobAndName = (input: ExportFile) => {
    const file = parseExportFile(input);
    const meta = FORMAT_META[file.format];
    const fileName = `${sanitizeFileName(file.suggestedName)}.${meta.extension}`;
    // Copy into a fresh ArrayBuffer-backed view for the Blob constructor.
    const blob = new Blob([new Uint8Array(file.data)], {
      type: meta.mimeType,
    });
    return { blob, fileName, mimeType: meta.mimeType };
  };

  const download = (blob: Blob, fileName: string): SaveResult => {
    const url = env.createObjectURL(blob);
    const link = env.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    env.document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => {
      env.revokeObjectURL(url);
    }, REVOKE_DELAY_MS);
    return { status: 'downloaded', fileName };
  };

  return {
    // Deferred so validation errors reject the promise rather than throw.
    save: (input) =>
      Promise.resolve().then(() => {
        const { blob, fileName } = toBlobAndName(input);
        return download(blob, fileName);
      }),
    share: async (input) => {
      const { blob, fileName, mimeType } = toBlobAndName(input);
      const file = new File([blob], fileName, { type: mimeType });
      const data: ShareData = { files: [file], title: fileName };
      // canShare is missing in some browsers and false for unsupported types.
      if (typeof env.navigator.canShare !== 'function') {
        return download(blob, fileName);
      }
      if (!env.navigator.canShare(data)) {
        return download(blob, fileName);
      }
      try {
        await env.navigator.share(data);
        return { status: 'shared' };
      } catch (error) {
        // The user closed the share sheet: not an error.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { status: 'cancelled' };
        }
        throw error;
      }
    },
  };
}

/** The real browser environment. */
export function browserFileEnv(): BrowserFileEnv {
  return {
    document,
    navigator,
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => {
      URL.revokeObjectURL(url);
    },
  };
}
