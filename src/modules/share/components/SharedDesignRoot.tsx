import type { FileDelivery } from '@/modules/export/fileDelivery';
import { SharedDesignPage } from '@/modules/share/components/SharedDesignPage';
import { parseShareId } from '@/modules/share/domain/shareLink';
import { downloadSharedImage } from '@/modules/share/downloadSharedImage';
import { fetchSharedDesign } from '@/modules/share/supabaseShareStore';
import type { Logger } from '@/shared/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SharedDesignRootProps {
  pathname: string;
  supabase: SupabaseClient | null;
  logger: Logger;
  files: FileDelivery;
}

/** The public share page with its adapters; its own small chunk. */
export function SharedDesignRoot({
  pathname,
  supabase,
  logger,
  files,
}: SharedDesignRootProps) {
  return (
    <SharedDesignPage
      shareId={parseShareId(pathname)}
      loadShare={supabase ? (id) => fetchSharedDesign(supabase, id) : null}
      download={(view) => downloadSharedImage(view, { fetch, files })}
      logger={logger}
    />
  );
}
