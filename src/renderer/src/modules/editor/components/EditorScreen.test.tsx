import { EditorScreen } from '@renderer/modules/editor/components/EditorScreen';
import { editorStore } from '@renderer/modules/editor/state/editorStore';
import { buildDocument, buildRect } from '@renderer/test/factories';
import {
  renderWithProviders,
  testServices,
  testWorkspace,
} from '@renderer/test/renderWithProviders';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

async function setup() {
  const workspace = testWorkspace();
  const services = testServices();
  const record = await workspace.designs.create(
    'Poster',
    buildDocument([buildRect()]),
  );
  editorStore.getState().open(record);
  const onClose = vi.fn();
  const view = renderWithProviders(<EditorScreen onClose={onClose} />, {
    workspace,
    services,
  });
  return { ...view, onClose, record };
}

afterEach(() => {
  editorStore.getState().close();
});

describe('EditorScreen', () => {
  it('renders the toolbar, library, canvas and properties', async () => {
    await setup();

    expect(screen.getByLabelText('Design title')).toHaveValue('Poster');
    expect(
      screen.getByRole('complementary', { name: 'Library' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Canvas' })).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Properties' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Local only')).toBeInTheDocument();
  });

  it('downloads a PDF through the platform save dialog', async () => {
    const { services } = await setup();

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(services.platform.files.save).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedName: 'Poster', format: 'pdf' }),
      );
    });
    expect(
      await screen.findByText('Saved to /tmp/out.pdf'),
    ).toBeInTheDocument();
  });

  it('shares and explains when the file is revealed instead', async () => {
    const { services } = await setup();
    vi.mocked(services.platform.files.share).mockResolvedValueOnce({
      status: 'revealed',
      filePath: '/tmp/x.png',
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Share / Email' }),
    );

    expect(await screen.findByText(/ready to attach/)).toBeInTheDocument();
  });

  it('reports export failures and lets the user dismiss them', async () => {
    const { services } = await setup();
    vi.mocked(services.platform.files.save).mockRejectedValueOnce(
      new Error('disk full'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('saves pending edits before going back', async () => {
    const { onClose, workspace, record } = await setup();
    act(() => {
      editorStore.getState().setTitle('Renamed');
    });

    await userEvent.click(screen.getByRole('button', { name: '← Designs' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect((await workspace.designs.get(record.id))?.title).toBe('Renamed');
  });

  it('shows store notices such as the element limit', async () => {
    await setup();

    act(() => {
      editorStore.setState({
        notice: 'A design can contain at most 500 elements',
      });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('at most 500');
  });
});
