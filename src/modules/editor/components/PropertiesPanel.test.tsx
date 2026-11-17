import { PropertiesPanel } from '@/modules/editor/components/PropertiesPanel';
import type { DesignElement } from '@/modules/editor/domain/designModel';
import {
  editorStore,
  selectDocument,
  useEditor,
} from '@/modules/editor/state/editorStore';
import { createShape } from '@/modules/library/domain/elementFactory';
import { buildDocument, buildRect, buildText } from '@/test/factories';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** Mirrors EditorScreen: the document prop follows the store. */
function ConnectedPanel() {
  const document = useEditor(selectDocument);
  return document ? <PropertiesPanel document={document} /> : null;
}

function setup(elements: DesignElement[], selected: string[] = []) {
  editorStore
    .getState()
    .open({ id: 'd', title: 'D', document: buildDocument(elements) });
  editorStore.getState().select(selected);
  render(<ConnectedPanel />);
}

const element = (id: string) =>
  selectDocument(editorStore.getState())?.elements.find(
    (candidate) => candidate.id === id,
  );

async function setNumber(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  await userEvent.type(input, `${value}{Enter}`);
}

afterEach(() => {
  editorStore.getState().close();
});

describe('PropertiesPanel', () => {
  it('edits the page background when nothing is selected', async () => {
    setup([]);

    expect(screen.getByText('800 × 600 px')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Background'));
    await userEvent.type(screen.getByLabelText('Background'), '#000000{Enter}');

    expect(selectDocument(editorStore.getState())?.background).toBe('#000000');
  });

  it('edits position, size, rotation and opacity of a shape', async () => {
    setup([buildRect({ id: 'r' })], ['r']);

    await setNumber('X', '5');
    await setNumber('Y', '6');
    await setNumber('Width', '70');
    await setNumber('Height', '80');
    await setNumber('Rotation', '15');
    await setNumber('Opacity %', '50');
    await setNumber('Border width', '3');
    await setNumber('Corner radius', '9');

    expect(element('r')).toMatchObject({
      x: 5,
      y: 6,
      width: 70,
      height: 80,
      rotation: 15,
      opacity: 0.5,
      strokeWidth: 3,
      cornerRadius: 9,
    });
  });

  it('edits fill and border colours', () => {
    setup([buildRect({ id: 'r' })], ['r']);

    fireEvent.change(screen.getByLabelText('Fill picker'), {
      target: { value: '#00ff00' },
    });
    fireEvent.change(screen.getByLabelText('Border picker'), {
      target: { value: '#0000ff' },
    });

    expect(element('r')).toMatchObject({ fill: '#00FF00', stroke: '#0000FF' });
  });

  it('edits sides and points of polygons and stars', async () => {
    const hexagon = createShape('hexagon', { x: 0, y: 0 }, () => 'h');
    const star = createShape('star', { x: 0, y: 0 }, () => 's');

    setup([hexagon, star], ['h']);
    await setNumber('Sides', '8');
    expect(element('h')).toMatchObject({ sides: 8 });

    act(() => {
      editorStore.getState().select(['s']);
    });
    await setNumber('Points', '7');
    expect(element('s')).toMatchObject({ points: 7 });
  });

  it('edits typography', async () => {
    setup([buildText({ id: 't', fontStyle: 'normal' })], ['t']);

    expect(screen.queryByLabelText('Height')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Font'), 'Georgia');
    await setNumber('Size', '48');
    await setNumber('Line height', '1.5');
    await setNumber('Spacing', '2');
    await userEvent.selectOptions(screen.getByLabelText('Align'), 'Right');
    fireEvent.change(screen.getByLabelText('Colour picker'), {
      target: { value: '#ff0000' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    await userEvent.click(screen.getByRole('button', { name: 'I' }));
    expect(element('t')).toMatchObject({ fontStyle: 'italic bold' });

    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(element('t')).toMatchObject({
      fontFamily: 'Georgia',
      fontSize: 48,
      lineHeight: 1.5,
      letterSpacing: 2,
      align: 'right',
      fill: '#FF0000',
      fontStyle: 'italic',
    });

    await userEvent.click(screen.getByRole('button', { name: 'I' }));
    expect(element('t')).toMatchObject({ fontStyle: 'normal' });
  });

  it('starts inline text editing', async () => {
    setup([buildText({ id: 't' })], ['t']);

    await userEvent.click(screen.getByRole('button', { name: 'Edit text' }));

    expect(editorStore.getState().editingTextId).toBe('t');
  });

  it('arranges, duplicates and deletes the selection', async () => {
    setup([buildRect({ id: 'a' }), buildRect({ id: 'b' })], ['a']);
    const order = () =>
      selectDocument(editorStore.getState())?.elements.map((e) => e.id);

    await userEvent.click(
      screen.getByRole('button', { name: 'Bring to front' }),
    );
    expect(order()).toEqual(['b', 'a']);
    await userEvent.click(screen.getByRole('button', { name: 'Send to back' }));
    expect(order()).toEqual(['a', 'b']);
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(order()).toEqual(['b', 'a']);
    await userEvent.click(screen.getByRole('button', { name: 'Backward' }));
    expect(order()).toEqual(['a', 'b']);
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(order()).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(order()).toHaveLength(2);
  });

  it('edits opacity for a multi-selection', async () => {
    setup([buildRect({ id: 'a' }), buildRect({ id: 'b' })], ['a', 'b']);

    expect(screen.getByText('2 elements selected')).toBeInTheDocument();
    await setNumber('Opacity %', '25');

    expect(element('a')?.opacity).toBe(0.25);
    expect(element('b')?.opacity).toBe(0.25);
  });

  it('labels images', () => {
    setup(
      [
        {
          id: 'i',
          type: 'image',
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          width: 10,
          height: 10,
          source: { kind: 'sticker', stickerId: 'heart' },
        },
      ],
      ['i'],
    );

    expect(screen.getByRole('heading', { name: 'Image' })).toBeInTheDocument();
  });
});
