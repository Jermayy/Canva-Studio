import { App } from '@/app/App';
import { AuthService } from '@/modules/auth/authService';
import { ExportService } from '@/modules/export/exportService';
import type { FileDelivery } from '@/modules/export/fileDelivery';
import { SupabaseShareStore } from '@/modules/share/supabaseShareStore';
import { SupabaseRemoteStore } from '@/modules/sync/supabaseRemoteStore';
import type { Logger } from '@/shared/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EditorRootProps {
  supabase: SupabaseClient | null;
  logger: Logger;
  files: FileDelivery;
}

/**
 * The editor app with its cloud adapters. Loaded as its own chunk so the
 * public share page never downloads the editor (Konva, jsPDF, sync).
 */
export function EditorRoot({ supabase, logger, files }: EditorRootProps) {
  return (
    <App
      services={{ logger, exporter: new ExportService(files) }}
      auth={supabase ? new AuthService(supabase, logger) : null}
      createRemote={(user) => {
        if (!supabase) {
          throw new Error('Cloud sync is not configured');
        }
        return new SupabaseRemoteStore(supabase, user.id);
      }}
      {...(supabase
        ? { createShares: () => new SupabaseShareStore(supabase) }
        : {})}
    />
  );
}
