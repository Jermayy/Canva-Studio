import type { Logger } from '@shared/logger';
import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  logger: Logger;
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Last-resort UI for render errors. Designs are autosaved locally, so
 * reloading is safe and loses at most the last fraction of a second.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.logger.error('ui.render_failed', {
      error,
      componentStack: info.componentStack ?? '',
    });
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <div className="fatal-screen" role="alert">
        <h1>Something went wrong</h1>
        <p>Your designs are saved on this computer. Reload to continue.</p>
        <button
          type="button"
          className="primary"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
