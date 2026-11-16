import type {
  CanvasStudioDb,
  DesignRecord,
} from '@/modules/designs/data/localDb';
import type { DesignDocument } from '@/modules/editor/domain/designModel';

export const MAX_TITLE_LENGTH = 120;

export interface DesignEdit {
  title?: string;
  document?: DesignDocument;
}

export function normaliseTitle(title: string): string {
  const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed.length > 0 ? trimmed : 'Untitled design';
}

/**
 * Reads and writes designs in the workspace's local database.
 *
 * Local edits mark the record dirty; the sync engine clears the flag once
 * the server has accepted exactly that edit.
 */
export class LocalDesignRepository {
  constructor(
    private readonly db: CanvasStudioDb,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  /** Visible designs, most recently edited first. */
  async list(): Promise<DesignRecord[]> {
    const records = await this.db.designs
      .orderBy('updatedAt')
      .reverse()
      .toArray();
    return records.filter((record) => record.deleted === 0);
  }

  get(id: string): Promise<DesignRecord | undefined> {
    return this.db.designs.get(id);
  }

  async create(title: string, document: DesignDocument): Promise<DesignRecord> {
    const timestamp = this.now();
    const record: DesignRecord = {
      id: this.newId(),
      title: normaliseTitle(title),
      document,
      version: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      dirty: 1,
      deleted: 0,
    };
    await this.db.designs.add(record);
    return record;
  }

  /** Applies a local edit; returns the updated record or undefined if gone. */
  async saveEdit(
    id: string,
    edit: DesignEdit,
  ): Promise<DesignRecord | undefined> {
    return this.db.transaction('rw', this.db.designs, async () => {
      const existing = await this.db.designs.get(id);
      if (!existing || existing.deleted === 1) {
        return undefined;
      }
      const updated: DesignRecord = {
        ...existing,
        title:
          edit.title === undefined
            ? existing.title
            : normaliseTitle(edit.title),
        document: edit.document ?? existing.document,
        // Strictly increasing so the sync engine can detect edits made
        // while a push was in flight, even within the same millisecond.
        updatedAt: Math.max(this.now(), existing.updatedAt + 1),
        dirty: 1,
      };
      await this.db.designs.put(updated);
      return updated;
    });
  }

  async duplicate(
    id: string,
    title?: string,
  ): Promise<DesignRecord | undefined> {
    const source = await this.get(id);
    if (!source) {
      return undefined;
    }
    return this.create(title ?? `${source.title} (copy)`, source.document);
  }

  /**
   * Deletes a design. Never-synced designs are removed immediately;
   * synced ones become tombstones until the deletion is pushed.
   */
  async remove(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.designs, async () => {
      const existing = await this.db.designs.get(id);
      if (!existing) {
        return;
      }
      if (existing.version === 0) {
        await this.db.designs.delete(id);
        return;
      }
      await this.db.designs.put({
        ...existing,
        deleted: 1,
        dirty: 1,
        updatedAt: Math.max(this.now(), existing.updatedAt + 1),
      });
    });
  }

  listDirty(): Promise<DesignRecord[]> {
    return this.db.designs.where('dirty').equals(1).toArray();
  }

  /**
   * Records a successful push. The dirty flag is only cleared if no newer
   * local edit happened while the push was in flight.
   */
  async markSynced(
    id: string,
    version: number,
    pushedUpdatedAt: number,
  ): Promise<void> {
    await this.db.transaction('rw', this.db.designs, async () => {
      const existing = await this.db.designs.get(id);
      if (!existing) {
        return;
      }
      const unchanged = existing.updatedAt === pushedUpdatedAt;
      await this.db.designs.put({
        ...existing,
        version,
        dirty: unchanged ? 0 : 1,
      });
    });
  }

  /** Stores a server copy as the clean local state. */
  async putFromRemote(
    record: Omit<DesignRecord, 'dirty' | 'deleted'>,
  ): Promise<void> {
    await this.db.designs.put({ ...record, dirty: 0, deleted: 0 });
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.designs.delete(id);
  }

  async getMeta(key: string): Promise<string | undefined> {
    return (await this.db.meta.get(key))?.value;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.db.meta.put({ key, value });
  }
}
