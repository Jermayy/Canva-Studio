import type { LocalDesignRepository } from '@/modules/designs/data/localDesignRepository';
import {
  editorStore,
  selectHasUnsavedChanges,
} from '@/modules/editor/state/editorStore';
import type { SyncEngine } from '@/modules/sync/syncEngine';
import { useEffect } from 'react';

/**
 * Live-updates the open design when another device changes it. If the
 * design was deleted elsewhere, `onDeleted` lets the screen close it.
 * Pending local edits are never overwritten here; the sync engine's
 * conflict handling preserves them.
 */
export function useRemoteUpdates(
  sync: SyncEngine | null,
  designs: LocalDesignRepository,
  onDeleted: () => void,
): void {
  useEffect(() => {
    if (!sync) {
      return undefined;
    }
    return sync.onRemoteChanges((ids) => {
      const state = editorStore.getState();
      const openId = state.designId;
      if (!openId || !ids.includes(openId) || selectHasUnsavedChanges(state)) {
        return;
      }
      void designs.get(openId).then((record) => {
        if (!record) {
          onDeleted();
          return;
        }
        editorStore.getState().applyRemote(record);
      });
    });
  }, [sync, designs, onDeleted]);
}
