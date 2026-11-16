import {
  ServicesContext,
  WorkspaceContext,
  type AppServices,
} from '@/app/services';
import { createWorkspace, type Workspace } from '@/app/workspace';
import { openWorkspaceDb } from '@/modules/designs/data/localDb';
import { ExportService } from '@/modules/export/exportService';
import type { FileDelivery } from '@/modules/export/fileDelivery';
import { createLogger } from '@/shared/logger';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

export function fakeFiles(): FileDelivery {
  return {
    save: vi.fn(() =>
      Promise.resolve({
        status: 'downloaded' as const,
        fileName: 'Poster.pdf',
      }),
    ),
    share: vi.fn(() => Promise.resolve({ status: 'shared' as const })),
  };
}

export function testServices(
  overrides: Partial<AppServices> = {},
): AppServices & {
  files: FileDelivery;
  logLines: string[];
} {
  const logLines: string[] = [];
  const files = fakeFiles();
  return {
    logger: createLogger({
      service: 'test',
      sink: (_l, line) => logLines.push(line),
    }),
    exporter: new ExportService(files),
    files,
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
