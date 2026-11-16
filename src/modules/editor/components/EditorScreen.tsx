import { useSyncStatus } from '@/app/hooks';
import { Notice } from '@/app/components/Notice';
import { useServices, useWorkspace } from '@/app/services';
import { CanvasStage } from '@/modules/editor/components/CanvasStage';
import { PropertiesPanel } from '@/modules/editor/components/PropertiesPanel';
import {
  Toolbar,
  type ExportAction,
} from '@/modules/editor/components/Toolbar';
import { fitZoom } from '@/modules/editor/domain/viewport';
import {
  saveCurrentDesign,
  useAutosave,
} from '@/modules/editor/hooks/useAutosave';
import { useEditorShortcuts } from '@/modules/editor/hooks/useEditorShortcuts';
import { useRemoteUpdates } from '@/modules/editor/hooks/useRemoteUpdates';
import {
  editorStore,
  selectDocument,
  useEditor,
} from '@/modules/editor/state/editorStore';
import { getActiveStage } from '@/modules/editor/state/stageRegistry';
import {
  dataUrlToBytes,
  encodeExport,
  renderStageToPng,
} from '@/modules/export/exportService';
import { SidePanel } from '@/modules/library/components/SidePanel';
import type { ExportFormat } from '@/modules/export/fileDelivery';
import { copyText } from '@/modules/share/clipboard';
import { ShareLinkBar } from '@/modules/share/components/ShareLinkBar';
import {
  buildShareUrl,
  shareImageScale,
} from '@/modules/share/domain/shareLink';
import { useDesignShare } from '@/modules/share/hooks/useDesignShare';
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
  const designId = useEditor((state) => state.designId);
  const [share, setShare] = useDesignShare(workspace.shares, designId, logger);
  const shareUrl = share
    ? buildShareUrl(window.location.origin, share.id)
    : null;
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
        setMessage({ text: `Downloaded ${result.fileName}`, tone: 'info' });
      } else {
        const result = await exporter.share(format, state.title, data);
        if (result.status === 'downloaded') {
          setMessage({
            text: `This browser can't share files, so we downloaded ${result.fileName} for you to attach.`,
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

  const copyShareUrl = async (url: string) => {
    const copied = await copyText(url);
    setMessage({
      text: copied
        ? 'Link copied. Anyone with it can view this design.'
        : 'Your link is ready. Copy it from the box below.',
      tone: 'info',
    });
  };

  /**
   * Uploads a fresh image of the design and copies its view-only link. The
   * design must be in the cloud first (the link points at it), so local
   * edits are saved and synced before publishing.
   */
  const handleShareLink = async () => {
    const shares = workspace.shares;
    const stage = getActiveStage();
    const state = editorStore.getState();
    const current = selectDocument(state);
    if (!shares || !stage || !current || !state.designId || exporting) {
      return;
    }
    const id = state.designId;
    if (!navigator.onLine) {
      setMessage({
        text: 'Connect to the internet to create a share link.',
        tone: 'error',
      });
      return;
    }
    setExporting(true);
    setMessage(null);
    try {
      await saveCurrentDesign({
        designs: workspace.designs,
        sync: workspace.sync,
        logger,
      });
      await workspace.sync?.syncNow();
      const record = await workspace.designs.get(id);
      if (!record || record.version === 0) {
        setMessage({
          text: "This design hasn't reached the cloud yet. Try again in a moment.",
          tone: 'error',
        });
        return;
      }
      const png = renderStageToPng(
        stage,
        current,
        state.zoom,
        shareImageScale(current.width, current.height),
      );
      const published = await shares.publish({
        designId: id,
        title: state.title,
        width: current.width,
        height: current.height,
        png: dataUrlToBytes(png),
      });
      setShare(published);
      logger.info('share.published', { designId: id });
      await copyShareUrl(buildShareUrl(window.location.origin, published.id));
    } catch (error) {
      logger.error('share.publish_failed', {
        designId: id,
        error: String(error),
      });
      setMessage({
        text: "Couldn't create the share link. Please try again.",
        tone: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleStopSharing = async () => {
    const shares = workspace.shares;
    const id = editorStore.getState().designId;
    if (!shares || !id || exporting) {
      return;
    }
    setExporting(true);
    try {
      await shares.unpublish(id);
      setShare(null);
      logger.info('share.unpublished', { designId: id });
      setMessage({
        text: 'Sharing stopped. The link no longer works.',
        tone: 'info',
      });
    } catch (error) {
      logger.error('share.unpublish_failed', {
        designId: id,
        error: String(error),
      });
      setMessage({
        text: "Couldn't stop sharing. Please try again.",
        tone: 'error',
      });
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
        {...(workspace.shares
          ? {
              onShareLink: () => {
                void handleShareLink();
              },
            }
          : {})}
      />
      {shareUrl && (
        <ShareLinkBar
          url={shareUrl}
          busy={exporting}
          onCopy={() => {
            void copyShareUrl(shareUrl);
          }}
          onStop={() => {
            void handleStopSharing();
          }}
        />
      )}
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
