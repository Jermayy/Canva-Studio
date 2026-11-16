/**
 * Contract between the renderer (untrusted) and the main process.
 *
 * Kept free of runtime dependencies so the sandboxed preload can import it.
 * Every payload crossing this boundary is re-validated in the main process.
 */

export const IpcChannel = {
  secureStoreGet: 'secure-store:get',
  secureStoreSet: 'secure-store:set',
  secureStoreRemove: 'secure-store:remove',
  fileSave: 'file:save',
  fileShare: 'file:share',
  appInfo: 'app:info',
} as const;

export type ExportFormat = 'png' | 'pdf';

export interface SaveFileRequest {
  /** Suggested file name without extension. */
  suggestedName: string;
  format: ExportFormat;
  data: Uint8Array;
}

export type SaveFileResult =
  { status: 'saved'; filePath: string } | { status: 'cancelled' };

export type ShareFileRequest = SaveFileRequest;

export type ShareFileResult =
  | { status: 'shared' }
  /** Platforms without a native share sheet reveal the file instead. */
  | { status: 'revealed'; filePath: string };

export interface AppInfo {
  version: string;
  platform: string;
  canShareNatively: boolean;
}

/** API exposed on `window.canvasStudio` by the preload script. */
export interface CanvasStudioApi {
  secureStore: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  };
  files: {
    save: (request: SaveFileRequest) => Promise<SaveFileResult>;
    share: (request: ShareFileRequest) => Promise<ShareFileResult>;
  };
  app: {
    info: () => Promise<AppInfo>;
  };
}

/** Maximum export payload accepted over IPC (50 MB). */
export const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

/** Maximum secure-store value size (session JSON is a few KB). */
export const MAX_SECURE_VALUE_BYTES = 64 * 1024;
