import type {
  PullCursor,
  RealtimeStatus,
  RemoteDesign,
  RemoteDesignStore,
  RemoteDesignWrite,
} from '@/modules/sync/remoteDesignStore';
import {
  REALTIME_SUBSCRIBE_STATES,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { z } from 'zod';

export const DESIGNS_TABLE = 'designs';
export const ASSETS_BUCKET = 'design-assets';

const DESIGN_COLUMNS =
  'id, title, document, version, client_updated_at, updated_at, created_at, deleted_at';

/** Server rows are untrusted input; validate before mapping. */
const designRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  document: z.unknown(),
  version: z.number().int().nonnegative(),
  client_updated_at: z.string(),
  updated_at: z.string(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
});

type DesignRow = z.infer<typeof designRowSchema>;

export function rowToRemote(row: DesignRow): RemoteDesign {
  return {
    id: row.id,
    title: row.title,
    document: row.document,
    version: row.version,
    clientUpdatedAt: row.client_updated_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function parseRow(data: unknown): RemoteDesign {
  return rowToRemote(designRowSchema.parse(data));
}

/** Quotes a value for a PostgREST `or()` filter. */
function quote(value: string): string {
  return `"${value.replace(/["\\]/g, '')}"`;
}

const UNIQUE_VIOLATION = '23505';

function isDuplicateStorageError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { status, statusCode } = error as {
    status?: unknown;
    statusCode?: unknown;
  };
  return status === 409 || statusCode === '409' || statusCode === 'Duplicate';
}

function toError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${error.message}`);
}

/**
 * Supabase implementation of the remote store. Row-level security on the
 * server guarantees every query only sees the signed-in user's rows; the
 * user id is used here only for storage paths and realtime filters.
 */
export class SupabaseRemoteStore implements RemoteDesignStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async fetchChangedSince(
    cursor: PullCursor | null,
    limit: number,
  ): Promise<RemoteDesign[]> {
    let query = this.client.from(DESIGNS_TABLE).select(DESIGN_COLUMNS);
    if (cursor && cursor.id === '') {
      query = query.gte('updated_at', cursor.updatedAt);
    } else if (cursor) {
      const at = quote(cursor.updatedAt);
      query = query.or(
        `updated_at.gt.${at},and(updated_at.eq.${at},id.gt.${quote(cursor.id)})`,
      );
    }
    const { data, error } = await query
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit);
    if (error) {
      throw toError('fetch designs failed', error);
    }
    return z.array(z.unknown()).parse(data).map(parseRow);
  }

  async fetchById(id: string): Promise<RemoteDesign | null> {
    const { data, error } = await this.client
      .from(DESIGNS_TABLE)
      .select(DESIGN_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw toError('fetch design failed', error);
    }
    return data === null ? null : parseRow(data);
  }

  async insert(design: RemoteDesignWrite): Promise<RemoteDesign | null> {
    const { data, error } = await this.client
      .from(DESIGNS_TABLE)
      .insert({
        id: design.id,
        title: design.title,
        document: design.document,
        version: 1,
        client_updated_at: design.clientUpdatedAt,
        deleted_at: design.deletedAt,
      })
      .select(DESIGN_COLUMNS)
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return null;
      }
      throw toError('insert design failed', error);
    }
    return parseRow(data);
  }

  async update(
    design: RemoteDesignWrite,
    expectedVersion: number,
  ): Promise<RemoteDesign | null> {
    const { data, error } = await this.client
      .from(DESIGNS_TABLE)
      .update({
        title: design.title,
        document: design.document,
        version: expectedVersion + 1,
        client_updated_at: design.clientUpdatedAt,
        deleted_at: design.deletedAt,
      })
      .eq('id', design.id)
      .eq('version', expectedVersion)
      .select(DESIGN_COLUMNS)
      .maybeSingle();
    if (error) {
      throw toError('update design failed', error);
    }
    return data === null ? null : parseRow(data);
  }

  async uploadAsset(
    id: string,
    bytes: ArrayBuffer,
    mime: string,
  ): Promise<void> {
    const { error } = await this.client.storage
      .from(ASSETS_BUCKET)
      .upload(this.assetPath(id), bytes, { contentType: mime, upsert: false });
    if (error && !isDuplicateStorageError(error)) {
      throw toError('upload asset failed', error);
    }
  }

  async downloadAsset(
    id: string,
  ): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
    const { data, error } = await this.client.storage
      .from(ASSETS_BUCKET)
      .download(this.assetPath(id));
    if (error) {
      if ((error as { status?: unknown }).status === 404) {
        return null;
      }
      throw toError('download asset failed', error);
    }
    return { bytes: await data.arrayBuffer(), mime: data.type };
  }

  subscribe(
    onChange: () => void,
    onStatus: (status: RealtimeStatus) => void,
  ): () => void {
    const channel = this.client
      .channel(`designs:${this.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: DESIGNS_TABLE,
          filter: `user_id=eq.${this.userId}`,
        },
        () => {
          onChange();
        },
      )
      .subscribe((status) => {
        onStatus(
          status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED
            ? 'connected'
            : 'disconnected',
        );
      });
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  private assetPath(id: string): string {
    return `${this.userId}/${id}`;
  }
}
