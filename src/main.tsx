import '@/styles.css';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { parseConfig } from '@/app/config';
import { createSupabase } from '@/modules/auth/supabaseClient';
import {
  browserFileEnv,
  createBrowserFileDelivery,
} from '@/modules/export/fileDelivery';
import { isSharePath } from '@/modules/share/domain/shareLink';
import { createLogger } from '@/shared/logger';
import { StrictMode, type ReactNode } from 'react';
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

function renderApp(content: ReactNode): void {
  root.render(
    <StrictMode>
      <ErrorBoundary logger={logger}>{content}</ErrorBoundary>
    </StrictMode>,
  );
}

function renderFatal(error: unknown): void {
  logger.error('app.startup_failed', { error: String(error) });
  root.render(
    <div className="fatal-screen" role="alert">
      <h1>Canvas Studio can't start</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
    </div>,
  );
}

/**
 * Validates config, then loads only the code for this URL: the public
 * share page or the editor app, each its own chunk.
 */
async function start(): Promise<void> {
  // Fails fast on a half-configured or unsafe build.
  const config = parseConfig(import.meta.env);
  const supabase = config.supabase
    ? createSupabase(config.supabase, window.localStorage)
    : null;
  const files = createBrowserFileDelivery(browserFileEnv());
  const { pathname } = window.location;

  if (isSharePath(pathname)) {
    const { SharedDesignRoot } =
      await import('@/modules/share/components/SharedDesignRoot');
    renderApp(
      <SharedDesignRoot
        pathname={pathname}
        supabase={supabase}
        logger={logger}
        files={files}
      />,
    );
    return;
  }
  const { EditorRoot } = await import('@/app/EditorRoot');
  renderApp(<EditorRoot supabase={supabase} logger={logger} files={files} />);
}

start().catch(renderFatal);
