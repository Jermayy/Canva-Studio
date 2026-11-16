import type { AssetRepository } from '@/modules/designs/data/assetRepository';
import type { DesignRecord } from '@/modules/designs/data/localDb';
import type { LocalDesignRepository } from '@/modules/designs/data/localDesignRepository';
import {
  NewerSchemaVersionError,
  safeParseDesignDocument,
  upgradeDesignDocument,
} from '@/modules/editor/domain/designModel';
import { referencedAssetIds } from '@/modules/editor/domain/documentOps';
import type {
  PullCursor,
  RemoteDesign,
  RemoteDesignStore,
  RemoteDesignWrite,
} from '@/modules/sync/remoteDesignStore';
import type { Logger } from '@/shared/logger';

export type SyncStatus =
  | { state: 'offline' }
  | { state: 'syncing' }
  | { state: 'idle'; lastSyncedAt: number; live: boolean }
  | { state: 'error'; message: string }
  /** The cloud has designs from a newer app version; reload to update. */
  | { state: 'update-required' };

export interface SyncEngineDeps {
  local: LocalDesignRepository;
  assets: AssetRepository;
  remote: RemoteDesignStore;
  isOnline: () => boolean;
  logger: Logger;
  now?: () => number;
  /** Fallback polling when realtime is unavailable. */
  pollIntervalMs?: number;
  /** Delay that batches bursts of local edits into one push. */
  debounceMs?: number;
  pageSize?: number;
  /**
   * Runs one sync pass exclusively across browser tabs that share this
   * local database (see `crossTabExclusive`). Defaults to running directly.
   */
  runExclusive?: <T>(task: () => Promise<T>) => Promise<T>;
}

const CURSOR_KEY = 'pull-cursor';
const CONFLICT_SUFFIX = ' (conflicted copy)';
const CURSOR_OVERLAP_MS = 5_000;

/**
 * Keeps the local database and the cloud in step.
 *
 * - Local edits are pushed with optimistic concurrency (expected version).
 * - Remote changes are pulled by a keyset cursor on server time.
 * - On a conflict, the server copy wins and the local edit is kept as a
 *   separate "conflicted copy" design, so no work is ever lost.
 * - Realtime notifications trigger a pull; polling covers missed events
 *   and periods when the socket is down.
 */
export class SyncEngine {
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly debounceMs: number;
  private readonly pageSize: number;
  private readonly statusListeners = new Set<(status: SyncStatus) => void>();
  private readonly remoteListeners = new Set<(ids: string[]) => void>();
  private status: SyncStatus = { state: 'offline' };
  private running: Promise<void> | null = null;
  private rerunRequested = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeRealtime: (() => void) | null = null;
  private realtimeLive = false;

  constructor(private readonly deps: SyncEngineDeps) {
    this.now = deps.now ?? Date.now;
    this.pollIntervalMs = deps.pollIntervalMs ?? 30_000;
    this.debounceMs = deps.debounceMs ?? 1_500;
    this.pageSize = deps.pageSize ?? 100;
  }

  start(): void {
    if (this.pollTimer) {
      return;
    }
    this.unsubscribeRealtime = this.deps.remote.subscribe(
      () => {
        this.requestSync(0);
      },
      (status) => {
        this.realtimeLive = status === 'connected';
        if (this.status.state === 'idle') {
          this.setStatus({ ...this.status, live: this.realtimeLive });
        }
        if (this.realtimeLive) {
          // Catch up on anything missed while disconnected.
          this.requestSync(0);
        }
      },
    );
    this.pollTimer = setInterval(() => {
      this.requestSync(0);
    }, this.pollIntervalMs);
    this.requestSync(0);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = null;
  }

  /** Schedules a sync, coalescing calls made within the debounce window. */
  requestSync(delayMs = this.debounceMs): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.syncNow();
    }, delayMs);
  }

  /** Runs one sync; concurrent calls share the run and trigger one rerun. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    this.running = this.runLoop().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  onStatus(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  /** Notified with design ids that were changed by a pull. */
  onRemoteChanges(listener: (ids: string[]) => void): () => void {
    this.remoteListeners.add(listener);
    return () => this.remoteListeners.delete(listener);
  }

  private async runLoop(): Promise<void> {
    const runExclusive = this.deps.runExclusive ?? ((task) => task());
    do {
      this.rerunRequested = false;
      await runExclusive(() => this.runOnce());
    } while (this.takeRerunRequest());
  }

  /** Read via a method: TS can't see the field change across the await. */
  private takeRerunRequest(): boolean {
    return this.rerunRequested;
  }

  private async runOnce(): Promise<void> {
    if (!this.deps.isOnline()) {
      this.setStatus({ state: 'offline' });
      return;
    }
    this.setStatus({ state: 'syncing' });
    const started = this.now();
    try {
      await this.pushAssets();
      const pushed = await this.pushDesigns();
      const pulled = await this.pull();
      this.setStatus({
        state: 'idle',
        lastSyncedAt: this.now(),
        live: this.realtimeLive,
      });
      this.deps.logger.info('sync.completed', {
        pushed,
        pulled,
        durationMs: this.now() - started,
      });
    } catch (error) {
      if (error instanceof NewerSchemaVersionError) {
        // Not a fault: another device runs a newer deploy. The cursor is
        // not advanced, so the design is pulled again after a reload.
        this.deps.logger.warn('sync.newer_schema_version', {
          found: error.found,
        });
        this.setStatus({ state: 'update-required' });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.error('sync.failed', { error: message });
      this.setStatus(
        this.deps.isOnline()
          ? { state: 'error', message }
          : { state: 'offline' },
      );
    }
  }

  private async pushAssets(): Promise<void> {
    for (const asset of await this.deps.assets.listPendingUpload()) {
      await this.deps.remote.uploadAsset(asset.id, asset.bytes, asset.mime);
      await this.deps.assets.markUploaded(asset.id);
    }
  }

  private async pushDesigns(): Promise<number> {
    const dirty = await this.deps.local.listDirty();
    for (const record of dirty) {
      await this.pushDesign(record);
    }
    return dirty.length;
  }

  private async pushDesign(record: DesignRecord): Promise<void> {
    const write: RemoteDesignWrite = {
      id: record.id,
      title: record.title,
      document: record.document,
      clientUpdatedAt: new Date(record.updatedAt).toISOString(),
      deletedAt:
        record.deleted === 1 ? new Date(record.updatedAt).toISOString() : null,
    };

    if (record.version === 0 && record.deleted === 1) {
      await this.deps.local.hardDelete(record.id);
      return;
    }

    const saved =
      record.version === 0
        ? await this.deps.remote.insert(write)
        : await this.deps.remote.update(write, record.version);

    if (!saved) {
      await this.resolveConflict(record);
      return;
    }
    if (record.deleted === 1) {
      await this.deps.local.hardDelete(record.id);
      return;
    }
    await this.deps.local.markSynced(
      record.id,
      saved.version,
      record.updatedAt,
    );
  }

  /** Server wins; the local edit survives as a separate design. */
  private async resolveConflict(local: DesignRecord): Promise<void> {
    const remote = await this.deps.remote.fetchById(local.id);
    this.deps.logger.warn('sync.conflict', {
      designId: local.id,
      localVersion: local.version,
      remoteVersion: remote?.version ?? null,
    });
    if (remote && remote.deletedAt === null) {
      // Throws before any copy is made if a newer app wrote the server
      // copy; otherwise every retry would add another conflicted copy.
      upgradeDesignDocument(remote.document);
    }

    const sameContent =
      remote !== null &&
      remote.deletedAt === null &&
      remote.title === local.title &&
      JSON.stringify(remote.document) === JSON.stringify(local.document);

    if (!sameContent && local.deleted === 0) {
      await this.deps.local.create(
        `${local.title}${CONFLICT_SUFFIX}`,
        local.document,
      );
    }
    if (remote === null) {
      // Local id is unusable remotely; the copy above carries the work.
      await this.deps.local.hardDelete(local.id);
      return;
    }
    await this.applyRemote(remote);
  }

  private async pull(): Promise<number> {
    let cursor = await this.readCursor();
    let total = 0;
    const changedIds: string[] = [];
    for (;;) {
      const page = await this.deps.remote.fetchChangedSince(
        cursor,
        this.pageSize,
      );
      for (const remote of page) {
        if (await this.applyPulled(remote)) {
          changedIds.push(remote.id);
        }
        cursor = { updatedAt: remote.updatedAt, id: remote.id };
      }
      total += page.length;
      if (cursor) {
        await this.deps.local.setMeta(CURSOR_KEY, JSON.stringify(cursor));
      }
      if (page.length < this.pageSize) {
        break;
      }
    }
    if (changedIds.length > 0) {
      for (const listener of this.remoteListeners) {
        listener(changedIds);
      }
    }
    return total;
  }

  /** Returns true when the local copy changed. */
  private async applyPulled(remote: RemoteDesign): Promise<boolean> {
    const local = await this.deps.local.get(remote.id);
    if (local && remote.version <= local.version) {
      // Already have it (typically our own push echoing back).
      return false;
    }
    if (local?.dirty === 1) {
      await this.resolveConflict(local);
      return true;
    }
    return this.applyRemote(remote);
  }

  private async applyRemote(remote: RemoteDesign): Promise<boolean> {
    if (remote.deletedAt !== null) {
      await this.deps.local.hardDelete(remote.id);
      return true;
    }
    const document = safeParseDesignDocument(remote.document);
    if (!document) {
      this.deps.logger.error('sync.invalid_remote_document', {
        designId: remote.id,
        version: remote.version,
      });
      return false;
    }
    await this.downloadMissingAssets(referencedAssetIds(document));
    await this.deps.local.putFromRemote({
      id: remote.id,
      title: remote.title,
      document,
      version: remote.version,
      createdAt: Date.parse(remote.createdAt),
      updatedAt: Date.parse(remote.clientUpdatedAt),
    });
    return true;
  }

  private async downloadMissingAssets(ids: string[]): Promise<void> {
    for (const id of ids) {
      if (await this.deps.assets.has(id)) {
        continue;
      }
      const asset = await this.deps.remote.downloadAsset(id);
      if (!asset) {
        this.deps.logger.warn('sync.asset_missing', { assetId: id });
        continue;
      }
      await this.deps.assets.putDownloaded(id, asset.mime, asset.bytes);
    }
  }

  private async readCursor(): Promise<PullCursor | null> {
    const raw = await this.deps.local.getMeta(CURSOR_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<PullCursor>;
      const time = Date.parse(parsed.updatedAt ?? '');
      if (!Number.isNaN(time) && typeof parsed.id === 'string') {
        // Rewind slightly: a transaction that started earlier can commit
        // after a later one, so its row would sit behind the cursor.
        // Re-reading is safe because already-applied versions are skipped.
        return {
          updatedAt: new Date(time - CURSOR_OVERLAP_MS).toISOString(),
          id: '',
        };
      }
    } catch {
      // Fall through: a corrupt cursor just means a full re-pull.
    }
    this.deps.logger.warn('sync.cursor_reset');
    return null;
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
