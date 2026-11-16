import { Toolbar } from '@/modules/editor/components/Toolbar';
import { editorStore } from '@/modules/editor/state/editorStore';
import { buildDocument, buildRect } from '@/test/factories';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function setup(busy = false) {
  editorStore
    .getState()
    .open({ id: 'd', title: 'Party', document: buildDocument() });
  editorStore.getState().setZoom(0.5);
  const props = { onBack: vi.fn(), onFit: vi.fn(), onExport: vi.fn() };
  render(<Toolbar syncStatus={null} busy={busy} {...props} />);
  return props;
}

afterEach(() => {
  editorStore.getState().close();
});

describe('Toolbar', () => {
  it('renames the design on blur and ignores blank titles', async () => {
    setup();
    const title = screen.getByLabelText('Design title');

    await userEvent.clear(title);
    await userEvent.type(title, 'Birthday{Enter}');
    expect(editorStore.getState().title).toBe('Birthday');

    await userEvent.clear(title);
    await userEvent.tab();
    expect(editorStore.getState().title).toBe('Birthday');
    expect(title).toHaveValue('Birthday');
  });

  it('enables undo and redo according to history', async () => {
    setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();

    act(() => {
      editorStore.getState().addElement(buildRect());
    });
    await userEvent.click(undo);
    expect(redo).toBeEnabled();
    await userEvent.click(redo);

    expect(editorStore.getState().history?.present.elements).toHaveLength(1);
  });

  it('zooms in, out and to fit', async () => {
    const { onFit } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('60%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('50%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fit' }));

    expect(onFit).toHaveBeenCalled();
  });

  it('exports and shares in the chosen format', async () => {
    const { onExport, onBack } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    await userEvent.selectOptions(
      screen.getByLabelText('Export format'),
      'png',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Share / Email' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Export format'),
      'pdf',
    );
    await userEvent.click(screen.getByRole('button', { name: '← Designs' }));

    expect(onExport.mock.calls).toEqual([
      ['pdf', 'save'],
      ['png', 'share'],
    ]);
    expect(onBack).toHaveBeenCalled();
  });

  it('disables export while busy', () => {
    setup(true);

    expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  });
});
