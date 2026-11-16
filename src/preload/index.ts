import {
  IpcChannel,
  type AppInfo,
  type CanvasStudioApi,
  type SaveFileResult,
  type ShareFileResult,
} from '@shared/ipc';
import { contextBridge, ipcRenderer } from 'electron';

// Each method maps to exactly one channel; the renderer never gets raw
// ipcRenderer access.
const api: CanvasStudioApi = {
  secureStore: {
    getItem: (key) =>
      ipcRenderer.invoke(IpcChannel.secureStoreGet, key) as Promise<
        string | null
      >,
    setItem: (key, value) =>
      ipcRenderer.invoke(
        IpcChannel.secureStoreSet,
        key,
        value,
      ) as Promise<void>,
    removeItem: (key) =>
      ipcRenderer.invoke(IpcChannel.secureStoreRemove, key) as Promise<void>,
  },
  files: {
    save: (request) =>
      ipcRenderer.invoke(
        IpcChannel.fileSave,
        request,
      ) as Promise<SaveFileResult>,
    share: (request) =>
      ipcRenderer.invoke(
        IpcChannel.fileShare,
        request,
      ) as Promise<ShareFileResult>,
  },
  app: {
    info: () => ipcRenderer.invoke(IpcChannel.appInfo) as Promise<AppInfo>,
  },
};

contextBridge.exposeInMainWorld('canvasStudio', api);
