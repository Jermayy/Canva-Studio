import type {
  FetchSharedDesign,
  SharedDesignView,
} from '@/modules/share/shareStore';
import type { Logger } from '@/shared/logger';
import { useEffect, useState } from 'react';

export interface SharedDesignPageProps {
  /** null when the URL doesn't hold a valid share id. */
  shareId: string | null;
  /** null when this deployment has no cloud backend. */
  loadShare: FetchSharedDesign | null;
  download: (view: SharedDesignView) => Promise<void>;
  logger: Logger;
}

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'ready'; view: SharedDesignView };

const APP_NAME = 'Canvas Studio';

/** The public, read-only view of a shared design. */
export function SharedDesignPage({
  shareId,
  loadShare,
  download,
  logger,
}: SharedDesignPageProps) {
  const [loaded, setLoaded] = useState<State>({ kind: 'loading' });
  const [downloadError, setDownloadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const canLoad = shareId !== null && loadShare !== null;
  const state: State = canLoad ? loaded : { kind: 'missing' };

  useEffect(() => {
    if (!shareId || !loadShare) {
      return undefined;
    }
    let cancelled = false;
    loadShare(shareId).then(
      (view) => {
        if (!cancelled) {
          setLoaded(view ? { kind: 'ready', view } : { kind: 'missing' });
        }
      },
      (error: unknown) => {
        logger.error('share.view_failed', { error: String(error) });
        if (!cancelled) {
          setLoaded({ kind: 'error' });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [shareId, loadShare, logger]);

  const pageTitle =
    state.kind === 'ready' ? `${state.view.title} · ${APP_NAME}` : APP_NAME;
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  const handleDownload = async (view: SharedDesignView) => {
    setDownloading(true);
    setDownloadError(false);
    try {
      await download(view);
    } catch (error) {
      logger.error('share.download_failed', { error: String(error) });
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="shared-page">
      {state.kind === 'loading' && <p role="status">Loading design…</p>}
      {state.kind === 'missing' && (
        <>
          <h1>This link isn't available</h1>
          <p className="muted">
            It may have been turned off by its owner, or the design was deleted.
          </p>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <h1>Couldn't load this design</h1>
          <p className="muted">Check your connection and reload the page.</p>
        </>
      )}
      {state.kind === 'ready' && (
        <>
          <h1>{state.view.title}</h1>
          <img
            className="shared-image"
            src={state.view.imageUrl}
            alt={`Design: ${state.view.title}`}
            width={state.view.width}
            height={state.view.height}
          />
          <div className="shared-actions">
            <button
              type="button"
              className="primary"
              disabled={downloading}
              onClick={() => {
                void handleDownload(state.view);
              }}
            >
              {downloading ? 'Downloading…' : 'Download PNG'}
            </button>
          </div>
          {downloadError && (
            <p className="error-text" role="alert">
              Download failed. Please try again.
            </p>
          )}
        </>
      )}
      <p className="muted small">
        Made with <a href="/">{APP_NAME}</a>.
      </p>
    </main>
  );
}
