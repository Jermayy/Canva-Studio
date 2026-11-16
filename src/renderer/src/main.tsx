import '@renderer/styles.css';
import { App } from '@renderer/app/App';
import { ErrorBoundary } from '@renderer/app/components/ErrorBoundary';
import { parseConfig } from '@renderer/app/config';
import { AuthService } from '@renderer/modules/auth/authService';
import { createSupabase } from '@renderer/modules/auth/supabaseClient';
import { ExportService } from '@renderer/modules/export/exportService';
import { SupabaseRemoteStore } from '@renderer/modules/sync/supabaseRemoteStore';
import { createLogger } from '@shared/logger';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const logger = createLogger({
  service: 'canvas-studio-renderer',
  minLevel: import.meta.env.DEV ? 'debug' : 'info',
  baseContext: { env: import.meta.env.MODE },
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
  const platform = window.canvasStudio;
  const supabase = config.supabase
    ? createSupabase(config.supabase, platform.secureStore)
    : null;
  const auth = supabase ? new AuthService(supabase, logger) : null;

  root.render(
    <StrictMode>
      <ErrorBoundary logger={logger}>
        <App
          services={{
            platform,
            logger,
            exporter: new ExportService(platform.files),
          }}
          auth={auth}
          createRemote={(user) => {
            if (!supabase) {
              throw new Error('Cloud sync is not configured');
            }
            return new SupabaseRemoteStore(supabase, user.id);
          }}
        />
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
