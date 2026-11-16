import { editorStore, useEditor } from '@/modules/editor/state/editorStore';
import { SyncBadge } from '@/modules/sync/components/SyncBadge';
import type { SyncStatus } from '@/modules/sync/syncEngine';
import type { ExportFormat } from '@/modules/export/fileDelivery';
import { useState } from 'react';

export type ExportAction = 'save' | 'share';

export interface ToolbarProps {
  syncStatus: SyncStatus | null;
  busy: boolean;
  onBack: () => void;
  onFit: () => void;
  onExport: (format: ExportFormat, action: ExportAction) => void;
}

const ZOOM_STEP = 1.2;

export function Toolbar({
  syncStatus,
  busy,
  onBack,
  onFit,
  onExport,
}: ToolbarProps) {
  const title = useEditor((state) => state.title);
  const zoom = useEditor((state) => state.zoom);
  const canUndo = useEditor((state) => (state.history?.past.length ?? 0) > 0);
  const canRedo = useEditor((state) => (state.history?.future.length ?? 0) > 0);
  // null while not editing so remote title changes show immediately.
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const actions = editorStore.getState();

  const commitTitle = () => {
    const trimmed = draftTitle?.trim();
    setDraftTitle(null);
    if (trimmed && trimmed !== title) {
      actions.setTitle(trimmed);
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button type="button" className="ghost" onClick={onBack}>
          ← Designs
        </button>
        <input
          className="title-input"
          aria-label="Design title"
          value={draftTitle ?? title}
          maxLength={120}
          onChange={(event) => {
            setDraftTitle(event.target.value);
          }}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
        <SyncBadge status={syncStatus} />
      </div>
      <div className="toolbar-group">
        <button
          type="button"
          className="ghost icon-button"
          aria-label="Undo"
          title="Undo (⌘Z)"
          disabled={!canUndo}
          onClick={actions.undo}
        >
          <HistoryIcon direction="undo" />
        </button>
        <button
          type="button"
          className="ghost icon-button"
          aria-label="Redo"
          title="Redo (⇧⌘Z)"
          disabled={!canRedo}
          onClick={actions.redo}
        >
          <HistoryIcon direction="redo" />
        </button>
        <span className="divider" />
        <button
          type="button"
          className="ghost icon-button"
          aria-label="Zoom out"
          onClick={() => {
            actions.setZoom(zoom / ZOOM_STEP);
          }}
        >
          −
        </button>
        <span className="zoom-label" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="ghost icon-button"
          aria-label="Zoom in"
          onClick={() => {
            actions.setZoom(zoom * ZOOM_STEP);
          }}
        >
          +
        </button>
        <button type="button" className="ghost" onClick={onFit}>
          Fit
        </button>
      </div>
      <div className="toolbar-group">
        <label className="visually-hidden" htmlFor="export-format">
          Export format
        </label>
        <select
          id="export-format"
          value={format}
          onChange={(event) => {
            setFormat(event.target.value === 'png' ? 'png' : 'pdf');
          }}
        >
          <option value="pdf">PDF</option>
          <option value="png">PNG</option>
        </select>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            onExport(format, 'share');
          }}
        >
          Share / Email
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            onExport(format, 'save');
          }}
        >
          {busy ? 'Exporting…' : 'Download'}
        </button>
      </div>
    </header>
  );
}

function HistoryIcon({ direction }: { direction: 'undo' | 'redo' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={direction === 'redo' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}
