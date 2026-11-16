import { ElementNode } from '@renderer/modules/editor/components/ElementNode';
import { transformPatch } from '@renderer/modules/editor/components/transformPatch';
import type { DesignElement } from '@renderer/modules/editor/domain/designModel';
import {
  createShape,
  createSticker,
} from '@renderer/modules/library/domain/elementFactory';
import {
  ASSET_ID,
  buildRect,
  buildText,
  sequentialIds,
} from '@renderer/test/factories';
import { fakeNode, konvaProps } from '@renderer/test/reactKonvaMock';
import {
  mockImageLoading,
  renderWithProviders,
} from '@renderer/test/renderWithProviders';
import type Konva from 'konva';
import { act, screen, waitFor } from '@testing-library/react';

function renderNode(element: DesignElement, isEditingText = false) {
  const handlers = {
    onSelect: vi.fn(),
    onChange: vi.fn(),
    onStartTextEdit: vi.fn(),
  };
  renderWithProviders(
    <ElementNode
      element={element}
      isEditingText={isEditingText}
      {...handlers}
    />,
  );
  return handlers;
}

const asFunction = (value: unknown) => value as (...args: unknown[]) => void;

describe('ElementNode', () => {
  it('renders a rect and reports drags as position changes', () => {
    const { onChange } = renderNode(buildRect({ id: 'r' }));

    asFunction(konvaProps('Rect', 'r').onDragEnd)({
      target: fakeNode({ x: 40, y: 60 }),
    });

    expect(onChange).toHaveBeenCalledWith('r', { x: 40, y: 60 });
  });

  it('selects on mouse down, additive with shift or cmd', () => {
    const { onSelect } = renderNode(buildRect({ id: 'r' }));
    const props = konvaProps('Rect', 'r');

    asFunction(props.onMouseDown)({ evt: { shiftKey: false, metaKey: false } });
    asFunction(props.onMouseDown)({ evt: { shiftKey: true, metaKey: false } });
    asFunction(props.onTap)();

    expect(onSelect.mock.calls).toEqual([
      ['r', false],
      ['r', true],
      ['r', false],
    ]);
  });

  it('converts transformer scale into size changes', () => {
    const { onChange } = renderNode(
      buildRect({ id: 'r', width: 100, height: 50 }),
    );

    asFunction(konvaProps('Rect', 'r').onTransformEnd)({
      target: fakeNode({ x: 1, y: 2, rotation: 45, scaleX: 2, scaleY: 3 }),
    });

    expect(onChange).toHaveBeenCalledWith('r', {
      x: 1,
      y: 2,
      rotation: 45,
      width: 200,
      height: 150,
    });
  });

  it.each(['ellipse', 'triangle', 'star'] as const)(
    'renders a %s inside a group',
    (kind) => {
      const shape = createShape(kind, { x: 0, y: 0 }, sequentialIds(kind));

      renderNode(shape);

      expect(konvaProps('Group', shape.id)).toBeDefined();
    },
  );

  it('renders text, hides it while editing and opens the editor on double click', () => {
    const { onStartTextEdit } = renderNode(
      buildText({ id: 't', text: 'Party!' }),
      true,
    );
    const props = konvaProps('Text', 't');

    asFunction(props.onDblClick)();
    asFunction(props.onDblTap)();

    expect(screen.getByText('Party!')).toBeInTheDocument();
    expect(props.visible).toBe(false);
    expect(onStartTextEdit).toHaveBeenCalledTimes(2);
  });

  it('shows a placeholder until a sticker image loads', async () => {
    const restore = mockImageLoading();
    const sticker = createSticker('heart', { x: 0, y: 0 }, () => 's');

    renderNode(sticker);

    await waitFor(() => {
      expect(konvaProps('Image', 's').image).toBeDefined();
    });
    restore();
  });

  it('renders uploaded images from local storage', async () => {
    const restore = mockImageLoading();
    const { workspace } = renderWithProviders(
      <ElementNode
        element={{
          id: 'u',
          type: 'image',
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          width: 10,
          height: 10,
          source: { kind: 'upload', assetId: ASSET_ID },
        }}
        isEditingText={false}
        onSelect={vi.fn()}
        onChange={vi.fn()}
        onStartTextEdit={vi.fn()}
      />,
    );

    expect(konvaProps('Rect', 'u').fill).toBe('#E5E7EB');
    await act(async () => {
      await workspace.assets.get(ASSET_ID);
    });
    restore();
  });
});

describe('transformPatch', () => {
  it('scales text width and font size and resets node scale', () => {
    const node = fakeNode({ scaleX: 2, scaleY: 1.5 });

    const patch = transformPatch(
      buildText({ width: 100, fontSize: 20 }),
      node as unknown as Konva.Node,
    );

    expect(patch).toMatchObject({ width: 200, fontSize: 30 });
    expect(node.scaleX()).toBe(1);
    expect(node.scaleY()).toBe(1);
  });

  it('never shrinks elements below the minimum size', () => {
    const patch = transformPatch(
      buildRect({ width: 10, height: 10 }),
      fakeNode({ scaleX: 0.01, scaleY: 0.01 }) as unknown as Konva.Node,
    );

    expect(patch).toMatchObject({ width: 5, height: 5 });
  });
});
