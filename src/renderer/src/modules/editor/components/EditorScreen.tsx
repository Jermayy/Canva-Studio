import { useSyncStatus } from '@renderer/app/hooks';
import { Notice } from '@renderer/app/components/Notice';
import { useServices, useWorkspace } from '@renderer/app/services';
import { CanvasStage } from '@renderer/modules/editor/components/CanvasStage';
import { PropertiesPanel } from '@renderer/modules/editor/components/PropertiesPanel';
import {
  Toolbar,
  type ExportAction,
} from '@renderer/modules/editor/components/Toolbar';
import { fitZoom } from '@renderer/modules/editor/domain/viewport';
import {
  saveCurrentDesign,
  useAutosave,
} from '@renderer/modules/editor/hooks/useAutosave';
import { useEditorShortcuts } from '@renderer/modules/editor/hooks/useEditorShortcuts';
import { useRemoteUpdates } from '@renderer/modules/editor/hooks/useRemoteUpdates';
import {
  editorStore,
  selectDocument,
  useEditor,
} from '@renderer/modules/editor/state/editorStore';
import { getActiveStage } from '@renderer/modules/editor/state/stageRegistry';
import {
  encodeExport,
  renderStageToPng,
} from '@renderer/modules/export/exportService';
import { SidePanel } from '@renderer/modules/library/components/SidePanel';
import type { ExportFormat } from '@shared/ipc';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface EditorScreenProps {
  onClose: () => void;
}

/** Full editor for the design currently open in the editor store. */
export function EditorScreen({ onClose }: EditorScreenProps) {
  const workspace = useWorkspace();
  const { exporter, logger } = useServices();
  const document = useEditor(selectDocument);
  const notice = useEditor((state) => state.notice);
  const syncStatus = useSyncStatus(workspace.sync);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: 'info' | 'error';
  } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useAutosave({ designs: workspace.designs, sync: workspace.sync, logger });
  useEditorShortcuts();

  const handleRemoteDelete = useCallback(() => {
    editorStore.setState({
      notice: 'This design was deleted on another device.',
    });
    onClose();
  }, [onClose]);
  useRemoteUpdates(workspace.sync, workspace.designs, handleRemoteDelete);

  const fit = useCallback(() => {
    const viewport = mainRef.current;
    const current = selectDocument(editorStore.getState());
    if (viewport && current) {
      editorStore
        .getState()
        .setZoom(
          fitZoom(
            { width: viewport.clientWidth, height: viewport.clientHeight },
            current,
          ),
        );
    }
  }, []);

  useEffect(fit, [fit]);

  const handleBack = async () => {
    await saveCurrentDesign({
      designs: workspace.designs,
      sync: workspace.sync,
      logger,
    });
    onClose();
  };

  const handleExport = async (format: ExportFormat, action: ExportAction) => {
    const stage = getActiveStage();
    const state = editorStore.getState();
    const current = selectDocument(state);
    if (!stage || !current || exporting) {
      return;
    }
    setExporting(true);
    setMessage(null);
    try {
      const png = renderStageToPng(stage, current, state.zoom);
      const data = encodeExport(format, png, current);
      if (action === 'save') {
        const result = await exporter.save(format, state.title, data);
        if (result.status === 'saved') {
          setMessage({ text: `Saved to ${result.filePath}`, tone: 'info' });
        }
      } else {
        const result = await exporter.share(format, state.title, data);
        if (result.status === 'revealed') {
          setMessage({
            text: 'Your file is ready to attach. We opened its folder for you.',
            tone: 'info',
          });
        }
      }
      logger.info('export.completed', { format, action });
    } catch (error) {
      logger.error('export.failed', { format, action, error: String(error) });
      setMessage({ text: 'Export failed. Please try again.', tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  if (!document) {
    return null;
  }

  return (
    <div className="editor-screen">
      <Toolbar
        syncStatus={syncStatus}
        busy={exporting}
        onBack={() => {
          void handleBack();
        }}
        onFit={fit}
        onExport={(format, action) => {
          void handleExport(format, action);
        }}
      />
      <Notice
        message={message?.text ?? notice}
        tone={message?.tone ?? 'error'}
        onDismiss={() => {
          setMessage(null);
          editorStore.getState().dismissNotice();
        }}
      />
      <div className="editor-body">
        <SidePanel document={document} />
        <main ref={mainRef} className="editor-main" aria-label="Canvas">
          <CanvasStage document={document} />
        </main>
        <PropertiesPanel document={document} />
      </div>
    </div>
  );
}
