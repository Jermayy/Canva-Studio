import {
  editorStore,
  selectDocument,
  useEditor,
} from '@renderer/modules/editor/state/editorStore';
import { LibraryTile } from '@renderer/modules/library/components/LibraryTile';
import { SidePanel } from '@renderer/modules/library/components/SidePanel';
import { LIBRARY_DRAG_MIME } from '@renderer/modules/library/domain/elementFactory';
import { buildDocument, buildRect } from '@renderer/test/factories';
import { renderWithProviders } from '@renderer/test/renderWithProviders';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function ConnectedPanel() {
  const document = useEditor(selectDocument);
  return document ? <SidePanel document={document} /> : null;
}

function setup(elements = [buildRect({ id: 'existing' })]) {
  editorStore
    .getState()
    .open({ id: 'd', title: 'D', document: buildDocument(elements) });
  return renderWithProviders(<ConnectedPanel />);
}

const elements = () => selectDocument(editorStore.getState())?.elements ?? [];

afterEach(() => {
  editorStore.getState().close();
});

describe('SidePanel', () => {
  it('shows templates first and switches tabs accessibly', async () => {
    setup();

    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Stickers' }));

    expect(screen.getByRole('tab', { name: 'Stickers' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'tab-Stickers',
    );
    expect(
      screen.getByRole('heading', { name: 'Christmas' }),
    ).toBeInTheDocument();
  });

  it('adds a shape at the page centre on click', async () => {
    setup([]);

    await userEvent.click(screen.getByRole('tab', { name: 'Elements' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Circle' }));

    expect(elements()[0]).toMatchObject({ type: 'ellipse', x: 300, y: 200 });
  });

  it('adds text presets and stickers', async () => {
    setup([]);

    await userEvent.click(screen.getByRole('tab', { name: 'Text' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Add a heading' }),
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Stickers' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Christmas tree' }),
    );

    expect(elements().map((element) => element.type)).toEqual([
      'text',
      'image',
    ]);
  });

  it('asks before replacing a page that has content, and supports undo', async () => {
    setup();
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await userEvent.click(
      screen.getByRole('button', { name: /Christmas party/ }),
    );
    expect(elements()[0]?.id).toBe('existing');

    await userEvent.click(
      screen.getByRole('button', { name: /Christmas party/ }),
    );
    expect(elements().length).toBeGreaterThan(3);
    expect(confirm).toHaveBeenCalledTimes(2);

    editorStore.getState().undo();
    expect(elements()[0]?.id).toBe('existing');
  });

  it('applies templates to an empty page without asking', async () => {
    setup([]);
    const confirm = vi.spyOn(window, 'confirm');

    await userEvent.click(
      screen.getByRole('button', { name: /Balloon birthday/ }),
    );

    expect(confirm).not.toHaveBeenCalled();
    expect(elements().length).toBeGreaterThan(0);
  });

  it('opens the uploads tab', async () => {
    setup();

    await userEvent.click(screen.getByRole('tab', { name: 'Uploads' }));

    expect(screen.getByText('Upload images')).toBeInTheDocument();
  });
});

describe('LibraryTile', () => {
  it('puts the item on the drag payload', () => {
    render(
      <LibraryTile
        item={{ kind: 'shape', shape: 'rect' }}
        label="Square"
        onAdd={vi.fn()}
      >
        x
      </LibraryTile>,
    );
    const setData = vi.fn();

    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Square' }), {
      dataTransfer: { setData, effectAllowed: 'none' },
    });

    expect(setData).toHaveBeenCalledWith(
      LIBRARY_DRAG_MIME,
      '{"kind":"shape","shape":"rect"}',
    );
  });
});
