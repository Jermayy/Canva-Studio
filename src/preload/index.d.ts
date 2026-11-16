import type { CanvasStudioApi } from '@shared/ipc';

declare global {
  interface Window {
    canvasStudio: CanvasStudioApi;
  }
}

export {};
