import { MAX_ELEMENTS } from '@renderer/modules/editor/domain/designModel';
import { MAX_ZOOM, MIN_ZOOM } from '@renderer/modules/editor/domain/viewport';
import {
  createEditorStore,
  selectDocument,
  selectHasUnsavedChanges,
} from '@renderer/modules/editor/state/editorStore';
import {
  buildDocument,
  buildRect,
  sequentialIds,
} from '@renderer/test/factories';

function openStore(
  elements = [buildRect({ id: 'a' }), buildRect({ id: 'b' })],
) {
  const store = createEditorStore({ newId: sequentialIds('new') });
  store
    .getState()
    .open({ id: 'd1', title: 'Poster', document: buildDocument(elements) });
  return store;
}

const elementIds = (store: ReturnType<typeof openStore>) =>
  selectDocument(store.getState())?.elements.map((element) => element.id);

describe('editorStore lifecycle', () => {
  it('opens a design with clean history and keeps zoom across designs', () => {
    const store = openStore();
    store.getState().setZoom(0.8);

    store
      .getState()
      .open({ id: 'd2', title: 'Other', document: buildDocument() });

    expect(store.getState()).toMatchObject({
      designId: 'd2',
      title: 'Other',
      zoom: 0.8,
      revision: 0,
      selectedIds: [],
    });
    expect(selectHasUnsavedChanges(store.getState())).toBe(false);
  });

  it('closes the design', () => {
    const store = openStore();

    store.getState().close();

    expect(selectDocument(store.getState())).toBeNull();
    expect(store.getState().designId).toBeNull();
  });

  it('ignores edits when no design is open', () => {
    const store = createEditorStore();

    store.getState().addElement(buildRect());
    store.getState().nudgeSelected(1, 1);
    store.getState().undo();
    store.getState().redo();

    expect(store.getState().revision).toBe(0);
  });
});

describe('editorStore editing', () => {
  it('adds an element and selects it', () => {
    const store = openStore([]);

    store.getState().addElement(buildRect({ id: 'x' }));

    expect(elementIds(store)).toEqual(['x']);
    expect(store.getState().selectedIds).toEqual(['x']);
    expect(store.getState().revision).toBe(1);
    expect(selectHasUnsavedChanges(store.getState())).toBe(true);
  });

  it('shows a notice instead of exceeding the element limit', () => {
    const store = openStore(
      Array.from({ length: MAX_ELEMENTS }, (_, index) =>
        buildRect({ id: `r${index}` }),
      ),
    );

    store.getState().addElement(buildRect({ id: 'overflow' }));

    expect(store.getState().notice).toContain('at most');
    store.getState().dismissNotice();
    expect(store.getState().notice).toBeNull();
  });

  it('shows a notice instead of adding an invalid element', () => {
    const store = openStore([]);

    store.getState().addElement(buildRect({ id: 'bad', y: Number.NaN }));

    expect(elementIds(store)).toEqual([]);
    expect(store.getState().notice).toContain("couldn't be added");
  });

  it('updates elements and skips no-op updates', () => {
    const store = openStore();

    store.getState().updateElements(['a'], { x: 50 });
    store.getState().updateElements(['missing'], { x: 50 });

    expect(selectDocument(store.getState())?.elements[0]).toMatchObject({
      x: 50,
    });
    expect(store.getState().revision).toBe(1);
  });

  it('removes and duplicates the selection', () => {
    const store = openStore();
    store.getState().select(['a']);

    store.getState().duplicateSelected();
    expect(elementIds(store)).toEqual(['a', 'b', 'new-1']);
    expect(store.getState().selectedIds).toEqual(['new-1']);

    store.getState().removeSelected();
    expect(elementIds(store)).toEqual(['a', 'b']);
    expect(store.getState().selectedIds).toEqual([]);
  });

  it('does nothing for remove/duplicate with an empty selection', () => {
    const store = openStore();

    store.getState().removeSelected();
    store.getState().duplicateSelected();

    expect(store.getState().revision).toBe(0);
  });

  it('reorders layers and nudges the selection', () => {
    const store = openStore();
    store.getState().select(['a']);

    store.getState().moveSelected('front');
    store.getState().nudgeSelected(5, -5);

    expect(elementIds(store)).toEqual(['b', 'a']);
    expect(selectDocument(store.getState())?.elements[1]).toMatchObject({
      x: 15,
      y: 15,
    });
  });

  it('sets the background and title', () => {
    const store = openStore();

    store.getState().setBackground('#123456');
    store.getState().setTitle('New title');

    expect(selectDocument(store.getState())?.background).toBe('#123456');
    expect(store.getState()).toMatchObject({ title: 'New title', revision: 2 });
  });

  it('replaces the whole document as one undoable step', () => {
    const store = openStore();
    store.getState().select(['a']);

    store.getState().replaceDocument(buildDocument([buildRect({ id: 'tpl' })]));
    expect(elementIds(store)).toEqual(['tpl']);
    expect(store.getState().selectedIds).toEqual([]);

    store.getState().undo();
    expect(elementIds(store)).toEqual(['a', 'b']);
  });

  it('toggles selection membership', () => {
    const store = openStore();

    store.getState().toggleSelection('a');
    store.getState().toggleSelection('b');
    store.getState().toggleSelection('a');

    expect(store.getState().selectedIds).toEqual(['b']);
  });
});

describe('editorStore history', () => {
  it('undoes and redoes, pruning selection of vanished elements', () => {
    const store = openStore([]);
    store.getState().addElement(buildRect({ id: 'x' }));

    store.getState().undo();
    expect(elementIds(store)).toEqual([]);
    expect(store.getState().selectedIds).toEqual([]);

    store.getState().redo();
    expect(elementIds(store)).toEqual(['x']);

    store.getState().redo();
    expect(store.getState().revision).toBe(3);
  });
});

describe('editorStore misc', () => {
  it('clamps zoom', () => {
    const store = openStore();

    store.getState().setZoom(100);
    expect(store.getState().zoom).toBe(MAX_ZOOM);
    store.getState().setZoom(0);
    expect(store.getState().zoom).toBe(MIN_ZOOM);
  });

  it('tracks text editing', () => {
    const store = openStore();

    store.getState().startTextEdit('a');
    expect(store.getState()).toMatchObject({
      editingTextId: 'a',
      selectedIds: ['a'],
    });
    store.getState().stopTextEdit();
    expect(store.getState().editingTextId).toBeNull();
  });

  it('records the highest saved revision', () => {
    const store = openStore();
    store.getState().setTitle('x');

    store.getState().markSaved(1);
    store.getState().markSaved(0);

    expect(store.getState().savedRevision).toBe(1);
    expect(selectHasUnsavedChanges(store.getState())).toBe(false);
  });

  it('applies remote copies only to the open design', () => {
    const store = openStore();
    store.getState().select(['a', 'b']);

    store
      .getState()
      .applyRemote({ id: 'other', title: 'X', document: buildDocument() });
    expect(store.getState().title).toBe('Poster');

    store.getState().applyRemote({
      id: 'd1',
      title: 'Remote',
      document: buildDocument([buildRect({ id: 'b' })]),
    });
    expect(store.getState()).toMatchObject({
      title: 'Remote',
      selectedIds: ['b'],
    });
    expect(store.getState().history?.past).toEqual([]);
  });
});
