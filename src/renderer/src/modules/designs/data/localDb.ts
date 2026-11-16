import type { DesignDocument } from '@renderer/modules/editor/domain/designModel';
import Dexie, { type Table } from 'dexie';

/**
 * Local-first storage. Each user (and the offline guest) gets a separate
 * IndexedDB database, so one account can never read another's designs on
 * a shared machine.
 *
 * Booleans are stored as 0/1 because IndexedDB cannot index booleans.
 */

export type Flag = 0 | 1;

export interface DesignRecord {
  id: string;
  title: string;
  document: DesignDocument;
  /** Last server version this record is based on; 0 = never uploaded. */
  version: number;
  createdAt: number;
  /** Client clock (ms) of the last local edit. */
  updatedAt: number;
  /** 1 when there are local changes not yet pushed. */
  dirty: Flag;
  /** 1 when deleted locally and the deletion is not yet pushed. */
  deleted: Flag;
}

export interface AssetRecord {
  /** SHA-256 hex of `bytes`. */
  id: string;
  mime: string;
  bytes: ArrayBuffer;
  uploaded: Flag;
  createdAt: number;
}

export interface MetaRecord {
  key: string;
  value: string;
}

export class CanvasStudioDb extends Dexie {
  designs!: Table<DesignRecord, string>;
  assets!: Table<AssetRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      designs: 'id, updatedAt, dirty, deleted',
      assets: 'id, uploaded',
      meta: 'key',
    });
  }
}

export const GUEST_WORKSPACE_ID = 'local-guest';

/** Database name for a workspace; user ids are UUIDs so this is safe. */
export function databaseNameFor(workspaceId: string): string {
  return `canvas-studio-${workspaceId}`;
}

export function openWorkspaceDb(workspaceId: string): CanvasStudioDb {
  return new CanvasStudioDb(databaseNameFor(workspaceId));
}
