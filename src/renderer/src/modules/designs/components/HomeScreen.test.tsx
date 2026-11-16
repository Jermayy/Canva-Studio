import { HomeScreen } from '@renderer/modules/designs/components/HomeScreen';
import { buildDocument } from '@renderer/test/factories';
import {
  renderWithProviders,
  testServices,
  testWorkspace,
} from '@renderer/test/renderWithProviders';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function setup(workspace = testWorkspace()) {
  const props = {
    onOpen: vi.fn(),
    onSignOut: vi.fn(),
    onDismissNotice: vi.fn(),
  };
  const services = testServices();
  renderWithProviders(<HomeScreen {...props} notice={null} />, {
    workspace,
    services,
  });
  return { ...props, workspace, services };
}

describe('HomeScreen', () => {
  it('shows the empty state and offline guest info', async () => {
    setup();

    expect(await screen.findByText(/No designs yet/)).toBeInTheDocument();
    expect(screen.getByText('Offline guest')).toBeInTheDocument();
    expect(screen.getByText('Local only')).toBeInTheDocument();
  });

  it('creates and opens a design from a template', async () => {
    const { onOpen, workspace } = setup();

    await userEvent.click(
      screen.getByRole('button', { name: /Christmas party/ }),
    );

    await waitFor(() => {
      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Christmas party' }),
      );
    });
    expect(await workspace.designs.list()).toHaveLength(1);
  });

  it('names blank designs "Untitled design"', async () => {
    const { onOpen } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Blank' }));
    await userEvent.click(
      screen.getByRole('button', { name: /Blank Square post/ }),
    );

    await waitFor(() => {
      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Untitled design' }),
      );
    });
  });

  it('filters templates by category', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Christmas' }));

    expect(
      screen.queryByRole('button', { name: /Balloon birthday/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Christmas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('lists, opens, duplicates and deletes existing designs', async () => {
    const workspace = testWorkspace();
    await workspace.designs.create('Office party', buildDocument());
    const { onOpen } = setup(workspace);

    const list = await screen.findByRole('list');
    await userEvent.click(
      within(list).getByRole('button', { name: /^Preview of Office party/ }),
    );
    expect(onOpen).toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Duplicate Office party' }),
    );
    expect(await screen.findByText('Office party (copy)')).toBeInTheDocument();

    vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Office party' }),
    );
    expect(screen.getByText('Office party')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Office party' }),
    );
    await waitFor(() => {
      expect(screen.queryByText('Office party')).not.toBeInTheDocument();
    });
  });

  it('reports failures without crashing', async () => {
    const workspace = testWorkspace();
    vi.spyOn(workspace.designs, 'create').mockRejectedValueOnce(
      new Error('quota'),
    );
    const { services } = setup(workspace);

    await userEvent.click(
      screen.getByRole('button', { name: /Party night banner/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create',
    );
    expect(services.logLines.join()).toContain('home.create_failed');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers sign in for guests', async () => {
    const { onSignOut } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSignOut).toHaveBeenCalled();
  });
});
