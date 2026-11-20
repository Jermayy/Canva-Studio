import type { AppConfig } from '@/app/config';
import type { AppServices, Workspace } from '@/app/services';
import { createAuthService } from '@/modules/auth/application/authService';
import { AccountsDatabase } from '@/modules/auth/infrastructure/accountsDatabase';
import {
  createIndexedDbSessionVault,
  createKeyring,
} from '@/modules/auth/infrastructure/keyring';
import { createLocalIdentityProvider } from '@/modules/auth/infrastructure/localIdentityProvider';
import { createSupabaseIdentityProvider } from '@/modules/auth/infrastructure/supabaseIdentityProvider';
import {
  blobToDataUrl,
  canvasRasterizer,
  jsPdfWriter,
  readImageSize,
} from '@/modules/export/infrastructure/browserEncoders';
import {
  browserDeliveryEnvironment,
  createFileDelivery,
} from '@/modules/export/infrastructure/fileDelivery';
import { createPreferencesStore } from '@/modules/preferences/preferences';
import {
  browserConnectivity,
  createSimulatedCloud,
  createSyncEngine,
} from '@/modules/sync/syncEngine';
import {
  createEncryptedAssetStore,
  createEncryptedDocumentStore,
  WorkspaceDatabase,
  workspaceDatabaseName,
} from '@/modules/workspace/data/encryptedStores';
import {
  createMemoryAssetStore,
  createMemoryDocumentStore,
} from '@/modules/workspace/data/stores';
import { createWorkspaceStore } from '@/modules/workspace/state/workspaceStore';
import { createAesGcmCipher } from '@/shared/crypto/aesGcm';
import { createId } from '@/shared/lib/ids';
import { createBrowserKeyValueStore } from '@/shared/lib/keyValueStore';
import type { Logger } from '@/shared/logger';
import { createToastStore } from '@/shared/ui/toastStore';

/** Wires the real browser adapters into the app's service container. */
export async function composeBrowserServices(options: {
  config: AppConfig;
  logger: Logger;
  version: string;
}): Promise<AppServices> {
  const { config, logger, version } = options;
  const now = () => Date.now();
  const accounts = new AccountsDatabase();
  const localStore = createBrowserKeyValueStore(
    () => window.localStorage,
    logger,
  );
  const connectivity = browserConnectivity();

  // supabase-js is only downloaded when a backend is configured.
  const identity = config.supabase
    ? createSupabaseIdentityProvider(
        (
          await import('@/modules/auth/infrastructure/supabaseClient')
        ).createSupabaseAuthClient(config.supabase, window.localStorage),
        `${window.location.origin}/sign-in`,
      )
    : createLocalIdentityProvider({ db: accounts, createId, now });

  const auth = createAuthService({
    identity,
    keyring: createKeyring({ db: accounts }),
    vault: createIndexedDbSessionVault(accounts),
    throttleStore: localStore,
    now,
    logger: logger.child({ module: 'auth' }),
  });

  const openWorkspace: AppServices['openWorkspace'] = ({
    session,
    dataKey,
  }) => {
    const workspaceLogger = logger.child({
      module: 'workspace',
      userId: session.userId,
    });
    const db = new WorkspaceDatabase(workspaceDatabaseName(session.userId));
    const cipher = createAesGcmCipher(dataKey);
    const sync = createSyncEngine({
      transport: createSimulatedCloud({ connectivity }),
      connectivity,
      now,
      logger: logger.child({ module: 'sync' }),
    });
    const store = createWorkspaceStore({
      documents: createEncryptedDocumentStore(db, cipher, workspaceLogger),
      assets: createEncryptedAssetStore(db, cipher, workspaceLogger),
      logger: workspaceLogger,
      persistent: true,
      now,
      createId,
      readImageSize,
      onPersisted: sync.enqueue,
    });
    const workspace: Workspace = {
      kind: 'account',
      store,
      sync,
      close: async () => {
        await store.getState().flush();
        store.getState().dispose();
        sync.dispose();
        db.close();
      },
    };
    return workspace;
  };

  const openSandbox: AppServices['openSandbox'] = () => {
    const store = createWorkspaceStore({
      documents: createMemoryDocumentStore(),
      assets: createMemoryAssetStore(),
      logger: logger.child({ module: 'sandbox' }),
      persistent: false,
      now,
      createId,
      readImageSize,
    });
    return {
      kind: 'sandbox',
      store,
      sync: null,
      close: () => {
        store.getState().dispose();
        return Promise.resolve();
      },
    };
  };

  return {
    version,
    logger,
    auth,
    preferences: createPreferencesStore(localStore),
    toasts: createToastStore(),
    files: createFileDelivery(browserDeliveryEnvironment()),
    exporter: {
      toDataUrl: blobToDataUrl,
      // react-dom/server only loads when someone exports.
      renderer: {
        render: async (...args) => {
          const { svgRenderer } = await import('@/modules/render/svgMarkup');
          return svgRenderer.render(...args);
        },
      },
      rasterizer: canvasRasterizer,
      pdf: jsPdfWriter,
    },
    now,
    createId,
    openWorkspace,
    openSandbox,
  };
}
