import type {
  DesignShare,
  PublishShareInput,
  SharedDesignView,
  ShareStore,
} from '@/modules/share/shareStore';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const SHARES_TABLE = 'design_shares';
export const SHARES_BUCKET = 'design-shares';
/** Short so a refreshed share image shows up quickly through the CDN. */
const IMAGE_CACHE_SECONDS = '60';

const shareRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  updated_at: z.string(),
});

function toShare(row: unknown): DesignShare {
  const parsed = shareRowSchema.parse(row);
  return {
    id: parsed.id,
    title: parsed.title,
    width: parsed.width,
    height: parsed.height,
    updatedAt: parsed.updated_at,
  };
}

export function shareImagePath(shareId: string): string {
  return `${shareId}.png`;
}

/** Public, cache-busted URL of a share's image. */
export function shareImageUrl(
  client: SupabaseClient,
  share: Pick<DesignShare, 'id' | 'updatedAt'>,
): string {
  const { data } = client.storage
    .from(SHARES_BUCKET)
    .getPublicUrl(shareImagePath(share.id));
  return `${data.publicUrl}?v=${encodeURIComponent(share.updatedAt)}`;
}

function failure(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${error.message}`);
}

/**
 * Supabase implementation. RLS limits every table and storage call to the
 * signed-in user's shares (supabase/migrations/*_share_links.sql).
 */
export class SupabaseShareStore implements ShareStore {
  constructor(private readonly client: SupabaseClient) {}

  async getForDesign(designId: string): Promise<DesignShare | null> {
    const { data, error } = await this.client
      .from(SHARES_TABLE)
      .select('id, title, width, height, updated_at')
      .eq('design_id', designId)
      .maybeSingle();
    if (error) {
      throw failure('load share failed', error);
    }
    return data === null ? null : toShare(data);
  }

  async publish(input: PublishShareInput): Promise<DesignShare> {
    const existing = await this.getForDesign(input.designId);
    const { data, error } = await this.client
      .from(SHARES_TABLE)
      .upsert(
        {
          design_id: input.designId,
          title: input.title,
          width: input.width,
          height: input.height,
        },
        { onConflict: 'design_id' },
      )
      .select('id, title, width, height, updated_at')
      .single();
    if (error) {
      throw failure('create share failed', error);
    }
    const share = toShare(data);

    // The row must exist first: storage policies check share ownership.
    const { error: uploadError } = await this.client.storage
      .from(SHARES_BUCKET)
      .upload(shareImagePath(share.id), new Blob([new Uint8Array(input.png)]), {
        contentType: 'image/png',
        upsert: true,
        cacheControl: IMAGE_CACHE_SECONDS,
      });
    if (uploadError) {
      if (!existing) {
        // Don't leave a brand-new link pointing at no image.
        await this.client.from(SHARES_TABLE).delete().eq('id', share.id);
      }
      throw failure('upload share image failed', uploadError);
    }
    return share;
  }

  async unpublish(designId: string): Promise<void> {
    const share = await this.getForDesign(designId);
    if (!share) {
      return;
    }
    // Image first: if this fails the link still exists and can be retried.
    const { error: removeError } = await this.client.storage
      .from(SHARES_BUCKET)
      .remove([shareImagePath(share.id)]);
    if (removeError) {
      throw failure('delete share image failed', removeError);
    }
    const { error } = await this.client
      .from(SHARES_TABLE)
      .delete()
      .eq('id', share.id);
    if (error) {
      throw failure('delete share failed', error);
    }
  }
}

const sharedRowsSchema = z.array(shareRowSchema).max(1);

/** Public read through get_shared_design(); works signed in or not. */
export async function fetchSharedDesign(
  client: SupabaseClient,
  shareId: string,
): Promise<SharedDesignView | null> {
  const response: { data: unknown; error: { message: string } | null } =
    await client.rpc('get_shared_design', { share_id: shareId });
  if (response.error) {
    throw failure('load shared design failed', response.error);
  }
  const [row] = sharedRowsSchema.parse(response.data);
  if (!row) {
    return null;
  }
  const share = toShare(row);
  return { ...share, imageUrl: shareImageUrl(client, share) };
}
