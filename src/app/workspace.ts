import type { AuthUser } from '@/modules/auth/authService';
import { AssetRepository } from '@/modules/designs/data/assetRepository';
import {
  GUEST_WORKSPACE_ID,
  openWorkspaceDb,
  type CanvasStudioDb,
} from '@/modules/designs/data/localDb';
import { LocalDesignRepository } from '@/modules/designs/data/localDesignRepository';
import type { ShareStore } from '@/modules/share/shareStore';
import type { RemoteDesignStore } from '@/modules/sync/remoteDesignStore';
import {
  browserLocks,
  crossTabExclusive,
  syncLockName,
  type LockManagerLike,
} from '@/modules/sync/crossTabLock';
import { SyncEngine } from '@/modules/sync/syncEngine';
import type { Logger } from '@/shared/logger';

/**
 * Everything scoped to one signed-in user (or the offline guest): their
 * private local database, repositories and, for cloud users, sync.
 */
export interface Workspace {
  id: string;
  kind: 'cloud' | 'guest';
  email: string | null;
  designs: LocalDesignRepository;
  assets: AssetRepository;
  sync: SyncEngine | null;
  /** The cloud store for signed-in users; null for the guest. */
  remote: RemoteDesignStore | null;
  /** Share links; null for the guest (sharing needs an account). */
  shares: ShareStore | null;
  dispose: () => void;
}

export type WorkspaceSession =
  | {
      kind: 'cloud';
      user: AuthUser;
      remote: RemoteDesignStore;
      shares?: ShareStore;
    }
  | { kind: 'guest' };

export interface WorkspaceEnv {
  logger: Logger;
  isOnline: () => boolean;
  /** Registers a callback for regained connectivity; returns cleanup. */
  onOnline: (callback: () => void) => () => void;
  openDb?: (workspaceId: string) => CanvasStudioDb;
  /** Cross-tab lock manager; defaults to `navigator.locks`. */
  locks?: LockManagerLike;
}

export function createWorkspace(
  session: WorkspaceSession,
  env: WorkspaceEnv,
): Workspace {
  const id = session.kind === 'cloud' ? session.user.id : GUEST_WORKSPACE_ID;
  const db = (env.openDb ?? openWorkspaceDb)(id);
  const designs = new LocalDesignRepository(db);
  const assets = new AssetRepository(db);
  const logger = env.logger.child({ workspace: session.kind });

  if (session.kind === 'guest') {
    return {
      id,
      kind: 'guest',
      email: null,
      designs,
      assets,
      sync: null,
      remote: null,
      shares: null,
      dispose: () => {
        db.close();
      },
    };
  }

  const sync = new SyncEngine({
    local: designs,
    assets,
    remote: session.remote,
    isOnline: env.isOnline,
    logger: logger.child({ userId: session.user.id }),
    runExclusive: crossTabExclusive(
      syncLockName(id),
      'locks' in env ? env.locks : browserLocks(),
    ),
  });
  const stopOnline = env.onOnline(() => {
    sync.requestSync(0);
  });
  sync.start();

  return {
    id,
    kind: 'cloud',
    email: session.user.email,
    designs,
    assets,
    sync,
    remote: session.remote,
    shares: session.shares ?? null,
    dispose: () => {
      stopOnline();
      sync.stop();
      db.close();
    },
  };
}

/** Browser connectivity hooks for the workspace. */
export const browserConnectivity = {
  isOnline: (): boolean => navigator.onLine,
  onOnline: (callback: () => void): (() => void) => {
    window.addEventListener('online', callback);
    return () => {
      window.removeEventListener('online', callback);
    };
  },
};
