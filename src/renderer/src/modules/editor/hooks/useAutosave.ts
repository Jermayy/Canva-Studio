import type { LocalDesignRepository } from '@renderer/modules/designs/data/localDesignRepository';
import {
  editorStore,
  selectHasUnsavedChanges,
} from '@renderer/modules/editor/state/editorStore';
import type { SyncEngine } from '@renderer/modules/sync/syncEngine';
import type { Logger } from '@shared/logger';
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
 * Saves shortly after each edit and once more when the editor unmounts,
 * so closing the design or the app never loses the last change.
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
    window.addEventListener('beforeunload', flush);
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', flush);
      if (timer) {
        clearTimeout(timer);
      }
      flush();
    };
  }, [designs, sync, logger]);
}
