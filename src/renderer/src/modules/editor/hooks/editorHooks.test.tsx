import { LocalDesignRepository } from '@renderer/modules/designs/data/localDesignRepository';
import {
  openWorkspaceDb,
  type CanvasStudioDb,
} from '@renderer/modules/designs/data/localDb';
import {
  AUTOSAVE_DELAY_MS,
  saveCurrentDesign,
  useAutosave,
} from '@renderer/modules/editor/hooks/useAutosave';
import {
  handleEditorKey,
  useEditorShortcuts,
} from '@renderer/modules/editor/hooks/useEditorShortcuts';
import { useRemoteUpdates } from '@renderer/modules/editor/hooks/useRemoteUpdates';
import {
  editorStore,
  selectDocument,
} from '@renderer/modules/editor/state/editorStore';
import type { SyncEngine } from '@renderer/modules/sync/syncEngine';
import { buildDocument, buildRect } from '@renderer/test/factories';
import { createLogger } from '@shared/logger';
import { act, renderHook, waitFor } from '@testing-library/react';

let db: CanvasStudioDb;
let designs: LocalDesignRepository;
const logLines: string[] = [];
const logger = createLogger({
  service: 't',
  sink: (_l, line) => logLines.push(line),
});

beforeEach(() => {
  db = openWorkspaceDb(`hooks-${crypto.randomUUID()}`);
  designs = new LocalDesignRepository(db);
  logLines.length = 0;
});

afterEach(async () => {
  editorStore.getState().close();
  vi.useRealTimers();
  await db.delete();
});

async function openDesign(
  elements = [buildRect({ id: 'a' }), buildRect({ id: 'b' })],
) {
  const record = await designs.create('Poster', buildDocument(elements));
  editorStore.getState().open(record);
  return record;
}

describe('saveCurrentDesign', () => {
  it('persists unsaved changes and requests a sync', async () => {
    const record = await openDesign();
    const sync = { requestSync: vi.fn() } as unknown as SyncEngine;
    editorStore.getState().setTitle('Saved title');

    await saveCurrentDesign({ designs, sync, logger });

    expect((await designs.get(record.id))?.title).toBe('Saved title');
    expect(editorStore.getState().savedRevision).toBe(1);
    expect(sync.requestSync).toHaveBeenCalled();
  });

  it('does nothing without changes or an open design', async () => {
    const spy = vi.spyOn(designs, 'saveEdit');

    await saveCurrentDesign({ designs, sync: null, logger });
    await openDesign();
    await saveCurrentDesign({ designs, sync: null, logger });

    expect(spy).not.toHaveBeenCalled();
  });

  it('warns when the design no longer exists', async () => {
    const record = await openDesign();
    await designs.hardDelete(record.id);
    editorStore.getState().setTitle('x');

    await saveCurrentDesign({ designs, sync: null, logger });

    expect(editorStore.getState().notice).toContain('removed');
    expect(logLines.join()).toContain('autosave.design_missing');
  });

  it('reports storage failures', async () => {
    await openDesign();
    vi.spyOn(designs, 'saveEdit').mockRejectedValueOnce(new Error('quota'));
    editorStore.getState().setTitle('x');

    await saveCurrentDesign({ designs, sync: null, logger });

    expect(editorStore.getState().notice).toContain('Could not save');
    expect(logLines.join()).toContain('autosave.failed');
  });
});

describe('useAutosave', () => {
  it('debounces saves after edits and flushes on unmount', async () => {
    const record = await openDesign();
    const { unmount } = renderHook(() => {
      useAutosave({ designs, sync: null, logger });
    });

    act(() => {
      editorStore.getState().setTitle('One');
      editorStore.getState().setTitle('Two');
    });
    await waitFor(
      async () => {
        expect((await designs.get(record.id))?.title).toBe('Two');
      },
      { timeout: AUTOSAVE_DELAY_MS * 5 },
    );

    act(() => {
      editorStore.getState().setTitle('Three');
    });
    unmount();
    await waitFor(async () => {
      expect((await designs.get(record.id))?.title).toBe('Three');
    });
  });

  it('flushes when the window is closing', async () => {
    const record = await openDesign();
    renderHook(() => {
      useAutosave({ designs, sync: null, logger });
    });

    act(() => {
      editorStore.getState().setTitle('Closing');
    });
    window.dispatchEvent(new Event('beforeunload'));

    await waitFor(async () => {
      expect((await designs.get(record.id))?.title).toBe('Closing');
    });
  });
});

describe('handleEditorKey', () => {
  const key = (init: KeyboardEventInit, target?: EventTarget) => {
    const event = new KeyboardEvent('keydown', init);
    if (target) {
      Object.defineProperty(event, 'target', { value: target });
    }
    return handleEditorKey(event);
  };
  const ids = () =>
    selectDocument(editorStore.getState())?.elements.map((e) => e.id);

  it('handles delete, duplicate, undo and redo', async () => {
    await openDesign();
    editorStore.getState().select(['a']);

    expect(key({ key: 'd', metaKey: true })).toBe(true);
    expect(ids()).toHaveLength(3);
    expect(key({ key: 'z', metaKey: true })).toBe(true);
    expect(ids()).toHaveLength(2);
    expect(key({ key: 'z', metaKey: true, shiftKey: true })).toBe(true);
    expect(ids()).toHaveLength(3);
    key({ key: 'z', ctrlKey: true });
    expect(key({ key: 'y', ctrlKey: true })).toBe(true);
    expect(ids()).toHaveLength(3);
    // Undo pruned the selection, so pick an element again before deleting.
    editorStore.getState().select(['a']);
    expect(key({ key: 'Backspace' })).toBe(true);
    expect(key({ key: 'Delete' })).toBe(true);
    expect(ids()).toHaveLength(2);
  });

  it('nudges with arrows (10px with shift) and clears on Escape', async () => {
    await openDesign();
    editorStore.getState().select(['a']);

    key({ key: 'ArrowRight' });
    key({ key: 'ArrowDown', shiftKey: true });
    key({ key: 'ArrowLeft' });
    key({ key: 'ArrowUp' });

    expect(selectDocument(editorStore.getState())?.elements[0]).toMatchObject({
      x: 10,
      y: 29,
    });
    expect(key({ key: 'Escape' })).toBe(true);
    expect(editorStore.getState().selectedIds).toEqual([]);
  });

  it('zooms with Cmd +/-', async () => {
    await openDesign();
    editorStore.getState().setZoom(1);

    key({ key: '=', metaKey: true });
    expect(editorStore.getState().zoom).toBeCloseTo(1.2);
    key({ key: '-', metaKey: true });
    expect(editorStore.getState().zoom).toBeCloseTo(1);
  });

  it('ignores typing in inputs and unknown keys', async () => {
    await openDesign();
    editorStore.getState().select(['a']);
    const input = document.createElement('input');

    expect(key({ key: 'Backspace' }, input)).toBe(false);
    expect(key({ key: 'q' })).toBe(false);
    expect(key({ key: 'q', metaKey: true })).toBe(false);
    expect(ids()).toHaveLength(2);
  });

  it('is wired to window keydown by the hook', async () => {
    await openDesign();
    editorStore.getState().select(['a']);
    const { unmount } = renderHook(() => {
      useEditorShortcuts();
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    unmount();
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true }),
    );

    expect(ids()).toEqual(['b']);
  });
});

describe('useRemoteUpdates', () => {
  function fakeSync() {
    let listener: (ids: string[]) => void = () => {};
    return {
      sync: {
        onRemoteChanges: (callback: (ids: string[]) => void) => {
          listener = callback;
          return () => undefined;
        },
      } as unknown as SyncEngine,
      emit: (ids: string[]) => {
        listener(ids);
      },
    };
  }

  it('applies remote edits to the open design when there are no local edits', async () => {
    const record = await openDesign();
    const { sync, emit } = fakeSync();
    renderHook(() => {
      useRemoteUpdates(sync, designs, vi.fn());
    });
    await designs.putFromRemote({
      ...record,
      title: 'From laptop',
      version: 3,
    });

    emit([record.id]);

    await waitFor(() => {
      expect(editorStore.getState().title).toBe('From laptop');
    });
  });

  it('leaves the design alone when it has unsaved local edits or is not affected', async () => {
    const record = await openDesign();
    const { sync, emit } = fakeSync();
    const spy = vi.spyOn(designs, 'get');
    renderHook(() => {
      useRemoteUpdates(sync, designs, vi.fn());
    });

    emit(['other']);
    editorStore.getState().setTitle('Local edit');
    emit([record.id]);

    expect(spy).not.toHaveBeenCalled();
  });

  it('closes the editor when the design was deleted elsewhere', async () => {
    const record = await openDesign();
    const { sync, emit } = fakeSync();
    const onDeleted = vi.fn();
    renderHook(() => {
      useRemoteUpdates(sync, designs, onDeleted);
    });
    await designs.hardDelete(record.id);

    emit([record.id]);

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  it('does nothing for local-only workspaces', () => {
    expect(() =>
      renderHook(() => {
        useRemoteUpdates(null, designs, vi.fn());
      }),
    ).not.toThrow();
  });
});
