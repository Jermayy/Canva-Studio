import {
  parseSaveFileRequest,
  saveFile,
  shareFile,
  type ExportDeps,
} from '@main/fileExport';
import type { SecureStore } from '@main/secureStore';
import { IpcChannel, type AppInfo } from '@shared/ipc';
import type { Logger } from '@shared/logger';
import { z } from 'zod';

/** Minimal slice of Electron's IpcMainInvokeEvent we rely on. */
export interface InvokeEvent {
  senderFrame: { url: string } | null;
}

export type InvokeHandler = (
  event: InvokeEvent,
  ...args: unknown[]
) => Promise<unknown>;

export interface IpcRegistrar {
  handle: (channel: string, handler: InvokeHandler) => void;
}

export interface IpcDeps {
  secureStore: SecureStore;
  exportDeps: ExportDeps;
  appInfo: AppInfo;
  logger: Logger;
  /** True when the URL belongs to our own renderer. */
  isTrustedUrl: (url: string) => boolean;
}

/**
 * Builds an origin check for IPC senders.
 *
 * Production loads `file://.../renderer/index.html`; dev loads the Vite
 * server. Anything else (e.g. a navigated-away frame) is rejected.
 */
export function createTrustedUrlCheck(
  rendererFileUrl: string,
  devServerUrl: string | undefined,
): (url: string) => boolean {
  return (url) => {
    if (devServerUrl && url.startsWith(devServerUrl)) {
      return true;
    }
    return url.split(/[?#]/)[0] === rendererFileUrl;
  };
}

const keySchema = z.string();

export function registerIpcHandlers(ipc: IpcRegistrar, deps: IpcDeps): void {
  const guarded =
    (channel: string, handler: (...args: unknown[]) => Promise<unknown>) =>
    async (event: InvokeEvent, ...args: unknown[]): Promise<unknown> => {
      const url = event.senderFrame?.url ?? '';
      if (!deps.isTrustedUrl(url)) {
        deps.logger.warn('ipc.rejected_untrusted_sender', { channel, url });
        throw new Error('Untrusted IPC sender');
      }
      try {
        return await handler(...args);
      } catch (error) {
        deps.logger.error('ipc.handler_failed', { channel, error });
        throw error;
      }
    };

  ipc.handle(
    IpcChannel.secureStoreGet,
    guarded(IpcChannel.secureStoreGet, (key) =>
      deps.secureStore.getItem(keySchema.parse(key)),
    ),
  );
  ipc.handle(
    IpcChannel.secureStoreSet,
    guarded(IpcChannel.secureStoreSet, (key, value) =>
      deps.secureStore.setItem(keySchema.parse(key), z.string().parse(value)),
    ),
  );
  ipc.handle(
    IpcChannel.secureStoreRemove,
    guarded(IpcChannel.secureStoreRemove, (key) =>
      deps.secureStore.removeItem(keySchema.parse(key)),
    ),
  );
  ipc.handle(
    IpcChannel.fileSave,
    guarded(IpcChannel.fileSave, async (request) => {
      const result = await saveFile(
        parseSaveFileRequest(request),
        deps.exportDeps,
      );
      deps.logger.info('export.saved', { status: result.status });
      return result;
    }),
  );
  ipc.handle(
    IpcChannel.fileShare,
    guarded(IpcChannel.fileShare, async (request) => {
      const result = await shareFile(
        parseSaveFileRequest(request),
        deps.exportDeps,
      );
      deps.logger.info('export.shared', { status: result.status });
      return result;
    }),
  );
  ipc.handle(
    IpcChannel.appInfo,
    guarded(IpcChannel.appInfo, () => Promise.resolve(deps.appInfo)),
  );
}
