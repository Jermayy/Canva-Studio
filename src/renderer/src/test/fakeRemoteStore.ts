import type {
  PullCursor,
  RealtimeStatus,
  RemoteDesign,
  RemoteDesignStore,
  RemoteDesignWrite,
} from '@renderer/modules/sync/remoteDesignStore';

/**
 * In-memory stand-in for the Supabase backend with the same semantics:
 * server-assigned timestamps, version checks and idempotent asset upload.
 */
export class FakeRemoteStore implements RemoteDesignStore {
  readonly rows = new Map<string, RemoteDesign>();
  readonly assets = new Map<string, { bytes: ArrayBuffer; mime: string }>();
  failNext: Error | null = null;
  private serverClock = Date.parse('2026-01-01T00:00:00.000Z');
  private changeListener: (() => void) | null = null;
  private statusListener: ((status: RealtimeStatus) => void) | null = null;
  unsubscribed = false;

  private tick(): string {
    this.serverClock += 1000;
    return new Date(this.serverClock).toISOString();
  }

  private maybeFail(): void {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }

  /** Simulates another device writing directly to the server. */
  serverWrite(write: RemoteDesignWrite, version?: number): RemoteDesign {
    const existing = this.rows.get(write.id);
    const now = this.tick();
    const row: RemoteDesign = {
      ...write,
      version: version ?? (existing?.version ?? 0) + 1,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  fetchChangedSince(
    cursor: PullCursor | null,
    limit: number,
  ): Promise<RemoteDesign[]> {
    this.maybeFail();
    const rows = [...this.rows.values()]
      .filter(
        (row) =>
          !cursor ||
          row.updatedAt > cursor.updatedAt ||
          (row.updatedAt === cursor.updatedAt && row.id > cursor.id),
      )
      .sort((a, b) =>
        a.updatedAt === b.updatedAt
          ? a.id.localeCompare(b.id)
          : a.updatedAt.localeCompare(b.updatedAt),
      )
      .slice(0, limit);
    return Promise.resolve(structuredClone(rows));
  }

  fetchById(id: string): Promise<RemoteDesign | null> {
    this.maybeFail();
    const row = this.rows.get(id);
    return Promise.resolve(row ? structuredClone(row) : null);
  }

  insert(design: RemoteDesignWrite): Promise<RemoteDesign | null> {
    this.maybeFail();
    if (this.rows.has(design.id)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(structuredClone(this.serverWrite(design, 1)));
  }

  update(
    design: RemoteDesignWrite,
    expectedVersion: number,
  ): Promise<RemoteDesign | null> {
    this.maybeFail();
    const existing = this.rows.get(design.id);
    if (existing?.version !== expectedVersion) {
      return Promise.resolve(null);
    }
    return Promise.resolve(structuredClone(this.serverWrite(design)));
  }

  uploadAsset(id: string, bytes: ArrayBuffer, mime: string): Promise<void> {
    this.maybeFail();
    if (!this.assets.has(id)) {
      this.assets.set(id, { bytes, mime });
    }
    return Promise.resolve();
  }

  downloadAsset(
    id: string,
  ): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
    this.maybeFail();
    return Promise.resolve(this.assets.get(id) ?? null);
  }

  subscribe(
    onChange: () => void,
    onStatus: (status: RealtimeStatus) => void,
  ): () => void {
    this.changeListener = onChange;
    this.statusListener = onStatus;
    return () => {
      this.unsubscribed = true;
    };
  }

  emitChange(): void {
    this.changeListener?.();
  }

  emitStatus(status: RealtimeStatus): void {
    this.statusListener?.(status);
  }
}
