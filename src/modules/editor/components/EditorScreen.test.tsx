import { createWorkspace } from '@/app/workspace';
import { openWorkspaceDb } from '@/modules/designs/data/localDb';
import { EditorScreen } from '@/modules/editor/components/EditorScreen';
import { editorStore } from '@/modules/editor/state/editorStore';
import { buildDocument, buildRect } from '@/test/factories';
import { FakeRemoteStore } from '@/test/fakeRemoteStore';
import { FakeShareStore } from '@/test/fakeShareStore';
import {
  renderWithProviders,
  testServices,
  testWorkspace,
} from '@/test/renderWithProviders';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createLogger } from '@/shared/logger';

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
  return { ...view, services, onClose, record };
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

  it('downloads a PDF', async () => {
    const { services } = await setup();

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(services.files.save).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedName: 'Poster', format: 'pdf' }),
      );
    });
    expect(
      await screen.findByText('Downloaded Poster.pdf'),
    ).toBeInTheDocument();
  });

  it('explains when the browser downloads instead of sharing', async () => {
    const { services } = await setup();
    vi.mocked(services.files.share).mockResolvedValueOnce({
      status: 'downloaded',
      fileName: 'Poster.pdf',
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Share / Email' }),
    );

    expect(
      await screen.findByText(/can't share files, so we downloaded Poster.pdf/),
    ).toBeInTheDocument();
  });

  it('reports export failures and lets the user dismiss them', async () => {
    const { services } = await setup();
    vi.mocked(services.files.save).mockRejectedValueOnce(
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

describe('EditorScreen share links', () => {
  const writeText = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  async function setupCloud(
    shares = new FakeShareStore(),
    { alreadyShared = false } = {},
  ) {
    const remote = new FakeRemoteStore();
    const services = testServices();
    const workspace = createWorkspace(
      {
        kind: 'cloud',
        user: { id: 'user-1', email: 'sam@example.com' },
        remote,
        shares,
      },
      {
        logger: createLogger({ service: 'test', sink: () => {} }),
        isOnline: () => true,
        onOnline: () => () => {},
        openDb: (id) => openWorkspaceDb(`${id}-${crypto.randomUUID()}`),
        locks: undefined,
      },
    );
    const record = await workspace.designs.create(
      'Party',
      buildDocument([buildRect()]),
    );
    if (alreadyShared) {
      await shares.publish({
        designId: record.id,
        title: 'Party',
        width: 100,
        height: 100,
        png: new Uint8Array([0x89]),
      });
    }
    editorStore.getState().open(record);
    const view = renderWithProviders(<EditorScreen onClose={vi.fn()} />, {
      workspace,
      services,
    });
    return { ...view, shares, remote, record, services, workspace };
  }

  afterEach(() => {
    editorStore.getState().close();
  });

  it('is not offered to guests', async () => {
    await setup();

    expect(
      screen.queryByRole('button', { name: 'Copy link' }),
    ).not.toBeInTheDocument();
  });

  it('syncs the design, publishes an image and copies the view link', async () => {
    const { shares, remote, record, workspace } = await setupCloud();

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(
      await screen.findByText(/Link copied. Anyone with it can view/),
    ).toBeInTheDocument();
    const share = shares.shares.get(record.id);
    expect(share).toMatchObject({ title: 'Party' });
    expect(shares.images.get(share!.id)?.[0]).toBe(0x89);
    expect(remote.rows.has(record.id)).toBe(true);
    const url = `${window.location.origin}/s/${share!.id}`;
    expect(writeText).toHaveBeenCalledWith(url);
    expect(
      screen.getByRole('textbox', { name: /Anyone with this link/ }),
    ).toHaveValue(url);
    workspace.dispose();
  });

  it('shows an existing link when the design opens', async () => {
    const { workspace } = await setupCloud(new FakeShareStore(), {
      alreadyShared: true,
    });

    expect(
      await screen.findByRole('region', { name: 'Share link' }),
    ).toBeInTheDocument();
    workspace.dispose();
  });

  it('stops sharing', async () => {
    const { shares, record, workspace } = await setupCloud();
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await screen.findByRole('region', { name: 'Share link' });

    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));

    expect(
      await screen.findByText('Sharing stopped. The link no longer works.'),
    ).toBeInTheDocument();
    expect(shares.shares.has(record.id)).toBe(false);
    expect(
      screen.queryByRole('region', { name: 'Share link' }),
    ).not.toBeInTheDocument();
    workspace.dispose();
  });

  it('falls back to manual copy when the clipboard refuses', async () => {
    writeText.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { workspace } = await setupCloud();

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(
      await screen.findByText(
        'Your link is ready. Copy it from the box below.',
      ),
    ).toBeInTheDocument();
    workspace.dispose();
  });

  it('reports publish and stop failures without losing the link', async () => {
    const { shares, workspace, services } = await setupCloud();
    shares.failNext = new Error('storage down');

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't create the share link",
    );
    expect(services.logLines.join()).toContain('share.publish_failed');

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await screen.findByRole('region', { name: 'Share link' });
    shares.failNext = new Error('denied');
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't stop sharing",
    );
    expect(
      screen.getByRole('region', { name: 'Share link' }),
    ).toBeInTheDocument();
    workspace.dispose();
  });

  it('asks for a connection when offline', async () => {
    const { shares, workspace } = await setupCloud();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connect to the internet',
    );
    expect(shares.shares.size).toBe(0);
    online.mockRestore();
    workspace.dispose();
  });
});
