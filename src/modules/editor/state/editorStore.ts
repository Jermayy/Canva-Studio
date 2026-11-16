import type {
  DesignDocument,
  DesignElement,
  ElementPatch,
} from '@/modules/editor/domain/designModel';
import {
  ElementLimitError,
  InvalidElementError,
  addElements,
  duplicateElements,
  moveLayers,
  removeElements,
  setBackground,
  updateElements,
  type LayerMove,
} from '@/modules/editor/domain/documentOps';
import {
  createHistory,
  pushHistory,
  redo,
  undo,
  type History,
} from '@/modules/editor/domain/history';
import { MAX_ZOOM, MIN_ZOOM } from '@/modules/editor/domain/viewport';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface OpenDesign {
  id: string;
  title: string;
  document: DesignDocument;
}

export interface EditorState {
  designId: string | null;
  title: string;
  history: History<DesignDocument> | null;
  selectedIds: string[];
  zoom: number;
  editingTextId: string | null;
  /** Increments on every user edit; autosave persists up to this. */
  revision: number;
  /** Highest revision written to local storage. */
  savedRevision: number;
  /** Last user-facing problem (e.g. element limit reached). */
  notice: string | null;

  open: (design: OpenDesign) => void;
  close: () => void;
  setTitle: (title: string) => void;
  addElement: (element: DesignElement) => void;
  updateElements: (ids: readonly string[], patch: ElementPatch) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  moveSelected: (move: LayerMove) => void;
  nudgeSelected: (dx: number, dy: number) => void;
  setBackground: (color: string) => void;
  /** Swaps in a whole document (e.g. a template) as one undoable step. */
  replaceDocument: (document: DesignDocument) => void;
  select: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  undo: () => void;
  redo: () => void;
  setZoom: (zoom: number) => void;
  startTextEdit: (id: string) => void;
  stopTextEdit: () => void;
  markSaved: (revision: number) => void;
  /** Replaces the document with a newer cloud copy (no undo entry). */
  applyRemote: (design: OpenDesign) => void;
  dismissNotice: () => void;
}

const INITIAL = {
  designId: null,
  title: '',
  history: null,
  selectedIds: [],
  zoom: 0.5,
  editingTextId: null,
  revision: 0,
  savedRevision: 0,
  notice: null,
} satisfies Partial<EditorState>;

export interface EditorStoreOptions {
  newId?: () => string;
}

export function createEditorStore(
  options: EditorStoreOptions = {},
): StoreApi<EditorState> {
  const newId = options.newId ?? (() => crypto.randomUUID());

  return createStore<EditorState>()((set, get) => {
    /** Applies a document change as one undoable, autosaved edit. */
    const commit = (
      change: (document: DesignDocument) => DesignDocument,
      extra: Partial<EditorState> = {},
    ): void => {
      const { history } = get();
      if (!history) {
        return;
      }
      let next: DesignDocument;
      try {
        next = change(history.present);
      } catch (error) {
        if (
          error instanceof ElementLimitError ||
          error instanceof InvalidElementError
        ) {
          set({ notice: error.message });
          return;
        }
        throw error;
      }
      if (next === history.present) {
        return;
      }
      set((state) => ({
        history: pushHistory(history, next),
        revision: state.revision + 1,
        ...extra,
      }));
    };

    const pruneSelection = (document: DesignDocument, ids: string[]) => {
      const present = new Set(document.elements.map((element) => element.id));
      return ids.filter((id) => present.has(id));
    };

    return {
      ...INITIAL,

      open: (design) => {
        set({
          ...INITIAL,
          zoom: get().zoom,
          designId: design.id,
          title: design.title,
          history: createHistory(design.document),
        });
      },

      close: () => {
        set({ ...INITIAL, zoom: get().zoom });
      },

      setTitle: (title) => {
        set((state) => ({ title, revision: state.revision + 1 }));
      },

      addElement: (element) => {
        commit((document) => addElements(document, [element]), {
          selectedIds: [element.id],
        });
      },

      updateElements: (ids, patch) => {
        commit((document) => updateElements(document, ids, patch).document);
      },

      removeSelected: () => {
        const { selectedIds } = get();
        if (selectedIds.length === 0) {
          return;
        }
        commit((document) => removeElements(document, selectedIds), {
          selectedIds: [],
          editingTextId: null,
        });
      },

      duplicateSelected: () => {
        const { selectedIds } = get();
        if (selectedIds.length === 0) {
          return;
        }
        let copies: string[] = [];
        commit((document) => {
          const result = duplicateElements(document, selectedIds, newId);
          copies = result.newIds;
          return result.document;
        });
        if (copies.length > 0) {
          set({ selectedIds: copies });
        }
      },

      moveSelected: (move) => {
        commit((document) => moveLayers(document, get().selectedIds, move));
      },

      nudgeSelected: (dx, dy) => {
        const { history, selectedIds } = get();
        if (!history || selectedIds.length === 0) {
          return;
        }
        commit((document) => {
          let next = document;
          for (const element of document.elements) {
            if (selectedIds.includes(element.id)) {
              next = updateElements(next, [element.id], {
                x: element.x + dx,
                y: element.y + dy,
              }).document;
            }
          }
          return next;
        });
      },

      setBackground: (color) => {
        commit((document) => setBackground(document, color));
      },

      replaceDocument: (document) => {
        commit(() => document, { selectedIds: [], editingTextId: null });
      },

      select: (ids) => {
        set({ selectedIds: ids });
      },

      toggleSelection: (id) => {
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((selected) => selected !== id)
            : [...state.selectedIds, id],
        }));
      },

      undo: () => {
        const { history, selectedIds } = get();
        if (!history || history.past.length === 0) {
          return;
        }
        const next = undo(history);
        set((state) => ({
          history: next,
          selectedIds: pruneSelection(next.present, selectedIds),
          revision: state.revision + 1,
        }));
      },

      redo: () => {
        const { history, selectedIds } = get();
        if (!history || history.future.length === 0) {
          return;
        }
        const next = redo(history);
        set((state) => ({
          history: next,
          selectedIds: pruneSelection(next.present, selectedIds),
          revision: state.revision + 1,
        }));
      },

      setZoom: (zoom) => {
        set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) });
      },

      startTextEdit: (id) => {
        set({ editingTextId: id, selectedIds: [id] });
      },

      stopTextEdit: () => {
        set({ editingTextId: null });
      },

      markSaved: (revision) => {
        set((state) => ({
          savedRevision: Math.max(state.savedRevision, revision),
        }));
      },

      applyRemote: (design) => {
        const { designId, history, selectedIds } = get();
        if (design.id !== designId || !history) {
          return;
        }
        set({
          title: design.title,
          history: createHistory(design.document),
          selectedIds: pruneSelection(design.document, selectedIds),
          editingTextId: null,
        });
      },

      dismissNotice: () => {
        set({ notice: null });
      },
    };
  });
}

/** The app-wide editor store. */
export const editorStore = createEditorStore();

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}

export function selectDocument(state: EditorState): DesignDocument | null {
  return state.history?.present ?? null;
}

export function selectHasUnsavedChanges(state: EditorState): boolean {
  return state.revision > state.savedRevision;
}
