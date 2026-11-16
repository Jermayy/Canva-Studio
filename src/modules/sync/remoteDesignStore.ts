/**
 * Port for the cloud copy of a user's designs. The Supabase adapter
 * implements it; tests use an in-memory fake.
 */

export interface RemoteDesign {
  id: string;
  title: string;
  /** Unvalidated JSON from the server; parse before use. */
  document: unknown;
  version: number;
  /** ISO timestamp of the edit on the client that made it. */
  clientUpdatedAt: string;
  /** ISO server timestamp; drives the pull cursor. */
  updatedAt: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface RemoteDesignWrite {
  id: string;
  title: string;
  document: unknown;
  clientUpdatedAt: string;
  deletedAt: string | null;
}

export interface PullCursor {
  updatedAt: string;
  id: string;
}

export type RealtimeStatus = 'connected' | 'disconnected';

export interface RemoteDesignStore {
  /** Rows changed strictly after the cursor, ordered by (updatedAt, id). */
  fetchChangedSince(
    cursor: PullCursor | null,
    limit: number,
  ): Promise<RemoteDesign[]>;
  fetchById(id: string): Promise<RemoteDesign | null>;
  /** Creates version 1; returns null if the id already exists. */
  insert(design: RemoteDesignWrite): Promise<RemoteDesign | null>;
  /** Writes version `expectedVersion + 1`; returns null on a version conflict. */
  update(
    design: RemoteDesignWrite,
    expectedVersion: number,
  ): Promise<RemoteDesign | null>;
  /** Idempotent: uploading an existing asset succeeds. */
  uploadAsset(id: string, bytes: ArrayBuffer, mime: string): Promise<void>;
  downloadAsset(
    id: string,
  ): Promise<{ bytes: ArrayBuffer; mime: string } | null>;
  /**
   * Deletes every file the user has in cloud storage (uploads, share
   * images). Step one of account deletion; returns how many were deleted.
   */
  deleteAllFiles(): Promise<number>;
  /** Calls `onChange` when any of the user's designs change remotely. */
  subscribe(
    onChange: () => void,
    onStatus: (status: RealtimeStatus) => void,
  ): () => void;
}
