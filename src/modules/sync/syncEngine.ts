import type { DesignDocument } from '@/modules/document/domain/schema';
import type { Logger } from '@/shared/logger';
import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * Background cloud sync behind a transport port. v2 ships with a
 * simulated transport (realistic latency, offline detection, occasional
 * failures) so the sync UX is real while the backend is out of scope; a
 * Supabase transport can replace it without touching the UI.
 *
 * Only the latest version of each document is queued, and failures retry
 * with exponential backoff.
 */

export interface CloudTransport {
  push: (document: DesignDocument) => Promise<void>;
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  pending: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export interface SyncEngine {
  store: StoreApi<SyncState>;
  enqueue: (document: DesignDocument) => void;
  retryNow: () => void;
  dispose: () => void;
}

export class CloudUnavailableError extends Error {
  constructor(message = 'Cloud sync is unavailable') {
    super(message);
    this.name = 'CloudUnavailableError';
  }
}

export interface Connectivity {
  isOnline: () => boolean;
  subscribe: (onChange: () => void) => () => void;
}

export function browserConnectivity(target: Window = window): Connectivity {
  return {
    isOnline: () => target.navigator.onLine,
    subscribe: (onChange) => {
      target.addEventListener('online', onChange);
      target.addEventListener('offline', onChange);
      return () => {
        target.removeEventListener('online', onChange);
        target.removeEventListener('offline', onChange);
      };
    },
  };
}

export function createSimulatedCloud(options: {
  connectivity: Connectivity;
  random?: () => number;
  minLatencyMs?: number;
  maxLatencyMs?: number;
  failureRate?: number;
}): CloudTransport {
  const random = options.random ?? Math.random;
  const min = options.minLatencyMs ?? 350;
  const max = options.maxLatencyMs ?? 1100;
  const failureRate = options.failureRate ?? 0.05;
  return {
    push: () =>
      new Promise((resolve, reject) => {
        if (!options.connectivity.isOnline()) {
          reject(new CloudUnavailableError('You’re offline'));
          return;
        }
        const latency = min + random() * (max - min);
        setTimeout(() => {
          if (random() < failureRate) {
            reject(
              new CloudUnavailableError('The sync service didn’t respond'),
            );
          } else {
            resolve();
          }
        }, latency);
      }),
  };
}

export function createSyncEngine(deps: {
  transport: CloudTransport;
  connectivity: Connectivity;
  now: () => number;
  logger: Logger;
  retryBaseMs?: number;
  maxRetryMs?: number;
}): SyncEngine {
  const retryBase = deps.retryBaseMs ?? 2000;
  const maxRetry = deps.maxRetryMs ?? 30_000;
  const queue = new Map<string, DesignDocument>();
  let running = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const store = createStore<SyncState>()(() => ({
    status: deps.connectivity.isOnline() ? 'synced' : 'offline',
    pending: 0,
    lastSyncedAt: null,
    lastError: null,
  }));

  const updatePending = () => {
    store.setState({ pending: queue.size });
  };

  const scheduleRetry = () => {
    clearTimeout(retryTimer);
    const wait = Math.min(maxRetry, retryBase * 2 ** attempt);
    attempt += 1;
    retryTimer = setTimeout(() => {
      void run();
    }, wait);
  };

  async function run(): Promise<void> {
    if (running || disposed) {
      return;
    }
    if (!deps.connectivity.isOnline()) {
      store.setState({ status: 'offline' });
      return;
    }
    running = true;
    try {
      for (const [id, document] of queue) {
        store.setState({ status: 'syncing', lastError: null });
        await deps.transport.push(document);
        // Keep it queued if a newer version arrived during the push.
        if (queue.get(id) === document) {
          queue.delete(id);
        }
        updatePending();
      }
      attempt = 0;
      store.setState({
        status: 'synced',
        lastSyncedAt: deps.now(),
        lastError: null,
      });
    } catch (error) {
      const offline = !deps.connectivity.isOnline();
      deps.logger.warn('sync.push_failed', {
        pending: queue.size,
        offline,
        error,
      });
      store.setState({
        status: offline ? 'offline' : 'error',
        lastError: error instanceof Error ? error.message : 'Sync failed',
      });
      if (!offline) {
        scheduleRetry();
      }
    } finally {
      running = false;
    }
    if (queue.size > 0 && store.getState().status === 'synced') {
      void run();
    }
  }

  const unsubscribe = deps.connectivity.subscribe(() => {
    if (deps.connectivity.isOnline()) {
      attempt = 0;
      void run();
    } else {
      store.setState({ status: 'offline' });
    }
  });

  return {
    store,
    enqueue: (document) => {
      queue.set(document.id, document);
      updatePending();
      if (store.getState().status !== 'error') {
        void run();
      }
    },
    retryNow: () => {
      attempt = 0;
      clearTimeout(retryTimer);
      void run();
    },
    dispose: () => {
      disposed = true;
      clearTimeout(retryTimer);
      unsubscribe();
    },
  };
}
