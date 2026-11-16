import { CanvasStage } from '@renderer/modules/editor/components/CanvasStage';
import {
  editorStore,
  selectDocument,
} from '@renderer/modules/editor/state/editorStore';
import { getActiveStage } from '@renderer/modules/editor/state/stageRegistry';
import { LIBRARY_DRAG_MIME } from '@renderer/modules/library/domain/elementFactory';
import { buildDocument, buildRect, buildText } from '@renderer/test/factories';
import {
  fakeNode,
  fakeStage,
  fakeTransformer,
  konvaProps,
} from '@renderer/test/reactKonvaMock';
import { renderWithProviders } from '@renderer/test/renderWithProviders';
import { act, createEvent, fireEvent, screen } from '@testing-library/react';

const asFunction = (value: unknown) => value as (...args: unknown[]) => void;

function openAndRender(
  elements = [buildRect({ id: 'a' }), buildText({ id: 't' })],
) {
  editorStore
    .getState()
    .open({ id: 'd', title: 'D', document: buildDocument(elements) });
  editorStore.getState().setZoom(0.5);
  const document = () => selectDocument(editorStore.getState())!;
  const view = renderWithProviders(<CanvasStage document={document()} />);
  const rerender = () => {
    view.rerender(<CanvasStage document={document()} />);
  };
  return { ...view, document, rerender };
}

function dataTransfer(payload: string | null) {
  return {
    types: payload ? [LIBRARY_DRAG_MIME] : [],
    getData: () => payload ?? '',
    dropEffect: 'none',
  };
}

afterEach(() => {
  editorStore.getState().close();
});

describe('CanvasStage', () => {
  it('renders the page at the current zoom and registers the stage', () => {
    openAndRender();

    expect(screen.getAllByTestId('konva-Stage')).toHaveLength(1);
    expect(konvaProps('Stage')).toMatchObject({
      width: 400,
      height: 300,
      scaleX: 0.5,
    });
    expect(getActiveStage()).toBe(fakeStage);
  });

  it('attaches the transformer to selected elements', () => {
    const spy = vi.spyOn(fakeTransformer, 'nodes');
    const view = openAndRender();

    act(() => {
      editorStore.getState().select(['a']);
    });
    view.rerender();

    expect(spy).toHaveBeenLastCalledWith([expect.anything()]);
  });

  it('clears the selection when the empty page is clicked', () => {
    openAndRender();
    act(() => {
      editorStore.getState().select(['a']);
    });

    act(() => {
      asFunction(konvaProps('Stage').onMouseDown)({ target: fakeStage });
    });

    expect(editorStore.getState().selectedIds).toEqual([]);
  });

  it('keeps the selection when an element is clicked', () => {
    openAndRender();
    const element = {
      ...fakeNode(),
      getStage: () => fakeStage,
      name: () => 'design-element',
    };

    asFunction(konvaProps('Stage').onMouseDown)({ target: element });
    act(() => {
      asFunction(konvaProps('Rect', 'a').onMouseDown)({
        evt: { shiftKey: false },
      });
    });
    act(() => {
      asFunction(konvaProps('Text', 't').onMouseDown)({
        evt: { shiftKey: true },
      });
    });

    expect(editorStore.getState().selectedIds).toEqual(['a', 't']);
  });

  it('updates elements when they are dragged', () => {
    openAndRender();

    act(() => {
      asFunction(konvaProps('Rect', 'a').onDragEnd)({
        target: fakeNode({ x: 70, y: 80 }),
      });
    });

    expect(selectDocument(editorStore.getState())?.elements[0]).toMatchObject({
      x: 70,
      y: 80,
    });
  });

  it('adds dropped library items under the cursor', () => {
    openAndRender([]);
    const viewport = screen.getByTestId('canvas-viewport');
    const payload = JSON.stringify({ kind: 'shape', shape: 'rect' });

    const over = fireEvent.dragOver(viewport, {
      dataTransfer: dataTransfer(payload),
    });
    // jsdom has no DragEvent, so set the pointer coordinates directly.
    const drop = createEvent.drop(viewport, {
      dataTransfer: dataTransfer(payload),
    });
    Object.defineProperties(drop, {
      clientX: { value: 100 },
      clientY: { value: 50 },
    });
    fireEvent(viewport, drop);

    expect(over).toBe(false);
    const [added] = selectDocument(editorStore.getState())!.elements;
    // 100px at 0.5 zoom = 200 design px; shape is centred on that point.
    expect(added).toMatchObject({ type: 'rect', x: 100, y: 0 });
  });

  it('ignores drops that are not library items', () => {
    openAndRender([]);
    const viewport = screen.getByTestId('canvas-viewport');

    const over = fireEvent.dragOver(viewport, {
      dataTransfer: dataTransfer(null),
    });
    fireEvent.drop(viewport, { dataTransfer: dataTransfer('{"evil":1}') });

    expect(over).toBe(true);
    expect(selectDocument(editorStore.getState())?.elements).toEqual([]);
  });

  it('edits text in place and commits the change', () => {
    const view = openAndRender();

    act(() => {
      asFunction(konvaProps('Text', 't').onDblClick)();
    });
    view.rerender();
    const textarea = screen.getByLabelText('Edit text');
    fireEvent.change(textarea, { target: { value: 'Updated' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(selectDocument(editorStore.getState())?.elements[1]).toMatchObject({
      text: 'Updated',
    });
    expect(editorStore.getState().editingTextId).toBeNull();
  });

  it('cancels text editing on Escape', () => {
    const view = openAndRender();
    act(() => {
      editorStore.getState().startTextEdit('t');
    });
    view.rerender();

    fireEvent.keyDown(screen.getByLabelText('Edit text'), { key: 'Escape' });

    expect(editorStore.getState().editingTextId).toBeNull();
  });

  it('enforces a minimum transformer box size', () => {
    openAndRender();
    const bound = konvaProps('Transformer').boundBoxFunc as (
      a: object,
      b: object,
    ) => object;
    const oldBox = { width: 10, height: 10 };

    expect(bound(oldBox, { width: 2, height: 10 })).toBe(oldBox);
    const fine = { width: 20, height: 20 };
    expect(bound(oldBox, fine)).toBe(fine);
  });
});
