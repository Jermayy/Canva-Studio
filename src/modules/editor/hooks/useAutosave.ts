import type { LocalDesignRepository } from '@/modules/designs/data/localDesignRepository';
import {
  editorStore,
  selectHasUnsavedChanges,
} from '@/modules/editor/state/editorStore';
import type { SyncEngine } from '@/modules/sync/syncEngine';
import type { Logger } from '@/shared/logger';
import { useEffect } from 'react';

export const AUTOSAVE_DELAY_MS = 400;

export interface AutosaveDeps {
  designs: LocalDesignRepository;
  sync: SyncEngine | null;
  logger: Logger;
}

/** Writes the open design to local storage, then asks sync to push it. */
export async function saveCurrentDesign(deps: AutosaveDeps): Promise<void> {
  const state = editorStore.getState();
  const { designId, history, title, revision } = state;
  if (!designId || !history || !selectHasUnsavedChanges(state)) {
    return;
  }
  try {
    const saved = await deps.designs.saveEdit(designId, {
      title,
      document: history.present,
    });
    if (!saved) {
      deps.logger.warn('autosave.design_missing', { designId });
      editorStore.setState({
        notice:
          'This design was removed, so recent changes could not be saved.',
      });
      return;
    }
    editorStore.getState().markSaved(revision);
    deps.sync?.requestSync();
  } catch (error) {
    deps.logger.error('autosave.failed', { designId, error: String(error) });
    editorStore.setState({ notice: 'Could not save your changes locally.' });
  }
}

/**
 * Saves shortly after each edit, when the tab is hidden or closed, and
 * once more when the editor unmounts, so the last change isn't lost.
 *
 * Browsers often unload a page before an async IndexedDB write started in
 * `beforeunload` finishes, so: flush earlier on `visibilitychange`/`pagehide`
 * (the reliable events, especially on mobile), and if edits are still
 * unsaved at `beforeunload`, ask the browser to confirm leaving, which
 * gives the write time to complete.
 */
export function useAutosave(deps: AutosaveDeps): void {
  const { designs, sync, logger } = deps;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const current = { designs, sync, logger };
    const unsubscribe = editorStore.subscribe((state, previous) => {
      if (state.revision === previous.revision) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void saveCurrentDesign(current);
      }, AUTOSAVE_DELAY_MS);
    });
    const flush = () => {
      void saveCurrentDesign(current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!selectHasUnsavedChanges(editorStore.getState())) {
        return;
      }
      flush();
      event.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (timer) {
        clearTimeout(timer);
      }
      flush();
    };
  }, [designs, sync, logger]);
}
