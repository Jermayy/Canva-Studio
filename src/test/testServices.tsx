import {
  ServicesContext,
  SessionContext,
  WorkspaceContext,
  type AppServices,
  type Workspace,
} from '@/app/services';
import { createAuthService } from '@/modules/auth/application/authService';
import { AccountsDatabase } from '@/modules/auth/infrastructure/accountsDatabase';
import {
  createKeyring,
  createMemorySessionVault,
} from '@/modules/auth/infrastructure/keyring';
import { createLocalIdentityProvider } from '@/modules/auth/infrastructure/localIdentityProvider';
import type { FileDelivery } from '@/modules/export/infrastructure/fileDelivery';
import { createPreferencesStore } from '@/modules/preferences/preferences';
import { createSyncEngine, type Connectivity } from '@/modules/sync/syncEngine';
import {
  createMemoryAssetStore,
  createMemoryDocumentStore,
  type AssetStore,
  type DocumentStore,
} from '@/modules/workspace/data/stores';
import { createWorkspaceStore } from '@/modules/workspace/state/workspaceStore';
import { createMemoryKeyValueStore } from '@/shared/lib/keyValueStore';
import { createLogger } from '@/shared/logger';
import { createToastStore } from '@/shared/ui/toastStore';
import { NOW } from '@/test/factories';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * A complete service container built from in-memory and fake adapters, so
 * screens run end to end in jsdom: real stores, real auth (with a cheap
 * PBKDF2 count), fake browser-only bits (canvas, downloads, share sheet).
 */

const online: Connectivity = {
  isOnline: () => true,
  subscribe: () => () => undefined,
};

export function fakeFiles(): FileDelivery & {
  downloads: { blob: Blob; fileName: string }[];
} {
  const downloads: { blob: Blob; fileName: string }[] = [];
  return {
    downloads,
    download: vi.fn((blob: Blob, fileName: string) => {
      downloads.push({ blob, fileName });
    }),
    canShareFiles: vi.fn(() => true),
    share: vi.fn(() => Promise.resolve('shared' as const)),
    canCopyImage: vi.fn(() => true),
    copyImage: vi.fn(() => Promise.resolve()),
    openEmailDraft: vi.fn(),
  };
}

let databaseCounter = 0;

export function createTestServices(overrides: Partial<AppServices> = {}) {
  databaseCounter += 1;
  const logger = createLogger({ service: 'test', sink: () => undefined });
  let idCounter = 0;
  const createId = () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  };
  const accounts = new AccountsDatabase(`test-accounts-${databaseCounter}`);
  const files = fakeFiles();
  // Like the real per-user databases, an account's data outlives sign-out.
  const accountStores = new Map<
    string,
    { documents: DocumentStore; assets: AssetStore }
  >();
  const storesFor = (userId: string | null) => {
    if (userId === null) {
      return {
        documents: createMemoryDocumentStore(),
        assets: createMemoryAssetStore(),
      };
    }
    const existing = accountStores.get(userId);
    if (existing) {
      return existing;
    }
    const created = {
      documents: createMemoryDocumentStore(),
      assets: createMemoryAssetStore(),
    };
    accountStores.set(userId, created);
    return created;
  };
  const openWith = (
    kind: Workspace['kind'],
    userId: string | null = null,
  ): Workspace => {
    const sync =
      kind === 'account'
        ? createSyncEngine({
            transport: { push: () => Promise.resolve() },
            connectivity: online,
            now: () => NOW,
            logger,
          })
        : null;
    const store = createWorkspaceStore({
      ...storesFor(userId),
      logger,
      persistent: kind === 'account',
      now: () => NOW,
      createId,
      readImageSize: () => Promise.resolve({ width: 640, height: 480 }),
      onPersisted: sync?.enqueue,
      saveDelayMs: 10,
    });
    return {
      kind,
      store,
      sync,
      close: async () => {
        await store.getState().flush();
        store.getState().dispose();
        sync?.dispose();
      },
    };
  };
  const services: AppServices = {
    version: '2.0.0-test',
    logger,
    auth: createAuthService({
      identity: createLocalIdentityProvider({
        db: accounts,
        createId,
        now: () => NOW,
        iterations: 1000,
      }),
      keyring: createKeyring({ db: accounts, iterations: 1000 }),
      vault: createMemorySessionVault(),
      throttleStore: createMemoryKeyValueStore(),
      now: () => NOW,
      logger,
    }),
    preferences: createPreferencesStore(createMemoryKeyValueStore()),
    toasts: createToastStore(),
    files,
    exporter: {
      toDataUrl: () => Promise.resolve('data:image/png;base64,AAAA'),
      renderer: { render: () => Promise.resolve('<svg/>') },
      rasterizer: {
        rasterize: ({ mimeType }) =>
          Promise.resolve(new Blob(['raster'], { type: mimeType })),
      },
      pdf: {
        write: () =>
          Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })),
      },
    },
    now: () => NOW,
    createId,
    openWorkspace: ({ session }) => openWith('account', session.userId),
    openSandbox: () => openWith('sandbox'),
    ...overrides,
  };
  return { services, files };
}

export function renderWithWorkspace(
  ui: ReactNode,
  options: { services?: AppServices; workspace?: Workspace } = {},
): RenderResult & { services: AppServices; workspace: Workspace } {
  const services = options.services ?? createTestServices().services;
  const workspace = options.workspace ?? services.openSandbox();
  const result = render(
    <ServicesContext value={services}>
      <SessionContext
        value={{
          session: {
            userId: 'u1',
            email: 'ann@example.test',
            displayName: 'Ann Lee',
            provider: 'local',
            expiresAt: NOW + 1000,
          },
          signOut: () => Promise.resolve(),
        }}
      >
        <WorkspaceContext value={workspace}>{ui}</WorkspaceContext>
      </SessionContext>
    </ServicesContext>,
  );
  return { ...result, services, workspace };
}
