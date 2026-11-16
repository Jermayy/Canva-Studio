import '@/styles.css';
import { App } from '@/app/App';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { parseConfig } from '@/app/config';
import { AuthService } from '@/modules/auth/authService';
import { createSupabase } from '@/modules/auth/supabaseClient';
import { ExportService } from '@/modules/export/exportService';
import {
  browserFileEnv,
  createBrowserFileDelivery,
} from '@/modules/export/fileDelivery';
import { SharedDesignPage } from '@/modules/share/components/SharedDesignPage';
import { isSharePath, parseShareId } from '@/modules/share/domain/shareLink';
import { downloadSharedImage } from '@/modules/share/downloadSharedImage';
import {
  SupabaseShareStore,
  fetchSharedDesign,
} from '@/modules/share/supabaseShareStore';
import { SupabaseRemoteStore } from '@/modules/sync/supabaseRemoteStore';
import { createLogger } from '@/shared/logger';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const logger = createLogger({
  service: 'canvas-studio-web',
  minLevel: import.meta.env.DEV ? 'debug' : 'info',
  baseContext: {
    env: import.meta.env.MODE,
    version: import.meta.env.VITE_APP_VERSION,
  },
});

window.addEventListener('error', (event) => {
  logger.error('window.error', { message: event.message });
});
window.addEventListener('unhandledrejection', (event) => {
  logger.error('window.unhandled_rejection', { reason: String(event.reason) });
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}
const root = createRoot(rootElement);

try {
  // Fails fast on a half-configured or unsafe build.
  const config = parseConfig(import.meta.env);
  const supabase = config.supabase
    ? createSupabase(config.supabase, window.localStorage)
    : null;
  const auth = supabase ? new AuthService(supabase, logger) : null;
  const files = createBrowserFileDelivery(browserFileEnv());
  const { pathname } = window.location;

  root.render(
    <StrictMode>
      <ErrorBoundary logger={logger}>
        {isSharePath(pathname) ? (
          <SharedDesignPage
            shareId={parseShareId(pathname)}
            loadShare={
              supabase ? (id) => fetchSharedDesign(supabase, id) : null
            }
            download={(view) => downloadSharedImage(view, { fetch, files })}
            logger={logger}
          />
        ) : (
          <App
            services={{ logger, exporter: new ExportService(files) }}
            auth={auth}
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
        )}
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (error) {
  logger.error('app.startup_failed', { error: String(error) });
  root.render(
    <div className="fatal-screen" role="alert">
      <h1>Canvas Studio can't start</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
    </div>,
  );
}
