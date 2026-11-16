import {
  ServicesContext,
  WorkspaceContext,
  type AppServices,
} from '@renderer/app/services';
import { createWorkspace, type Workspace } from '@renderer/app/workspace';
import { openWorkspaceDb } from '@renderer/modules/designs/data/localDb';
import { ExportService } from '@renderer/modules/export/exportService';
import type { CanvasStudioApi } from '@shared/ipc';
import { createLogger } from '@shared/logger';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

export function fakePlatform(): CanvasStudioApi {
  return {
    secureStore: {
      getItem: vi.fn(() => Promise.resolve(null)),
      setItem: vi.fn(() => Promise.resolve()),
      removeItem: vi.fn(() => Promise.resolve()),
    },
    files: {
      save: vi.fn(() =>
        Promise.resolve({ status: 'saved' as const, filePath: '/tmp/out.pdf' }),
      ),
      share: vi.fn(() => Promise.resolve({ status: 'shared' as const })),
    },
    app: {
      info: vi.fn(() =>
        Promise.resolve({
          version: '0.1.0',
          platform: 'darwin',
          canShareNatively: true,
        }),
      ),
    },
  };
}

export function testServices(
  overrides: Partial<AppServices> = {},
): AppServices & {
  logLines: string[];
} {
  const logLines: string[] = [];
  const platform = fakePlatform();
  return {
    platform,
    logger: createLogger({
      service: 'test',
      sink: (_l, line) => logLines.push(line),
    }),
    exporter: new ExportService(platform.files),
    logLines,
    ...overrides,
  };
}

/** A guest workspace on its own throwaway IndexedDB database. */
export function testWorkspace(): Workspace {
  return createWorkspace(
    { kind: 'guest' },
    {
      logger: createLogger({ service: 'test', sink: () => {} }),
      isOnline: () => true,
      onOnline: () => () => {},
      openDb: () => openWorkspaceDb(`test-${crypto.randomUUID()}`),
    },
  );
}

export interface ProviderOptions {
  services?: AppServices;
  workspace?: Workspace;
}

export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions = {},
): RenderResult & { services: AppServices; workspace: Workspace } {
  const services = options.services ?? testServices();
  const workspace = options.workspace ?? testWorkspace();
  const result = render(
    <ServicesContext.Provider value={services}>
      <WorkspaceContext.Provider value={workspace}>
        {ui}
      </WorkspaceContext.Provider>
    </ServicesContext.Provider>,
  );
  return { ...result, services, workspace };
}

/**
 * Makes `new Image()` load synchronously-ish with a known natural size,
 * since jsdom never fetches images.
 */
export function mockImageLoading(width = 800, height = 400): () => void {
  const original = globalThis.Image;
  class LoadingImage {
    onload: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    private source = '';
    get src(): string {
      return this.source;
    }
    set src(value: string) {
      this.source = value;
      queueMicrotask(() => this.onload?.());
    }
  }
  globalThis.Image = LoadingImage as unknown as typeof Image;
  return () => {
    globalThis.Image = original;
  };
}
