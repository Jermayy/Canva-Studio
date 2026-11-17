import { SharedDesignPage } from '@/modules/share/components/SharedDesignPage';
import type { SharedDesignView } from '@/modules/share/shareStore';
import { createLogger } from '@/shared/logger';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ID = '5aaaaaaa-0000-4000-8000-000000000001';
const VIEW: SharedDesignView = {
  id: ID,
  title: 'Sam turns 30',
  width: 1080,
  height: 1350,
  updatedAt: '2026-11-16T10:00:00Z',
  imageUrl: 'https://cdn.test/x.png?v=1',
};

function renderPage(
  overrides: Partial<Parameters<typeof SharedDesignPage>[0]> = {},
) {
  const lines: string[] = [];
  const props = {
    shareId: ID,
    loadShare: vi.fn(() => Promise.resolve<SharedDesignView | null>(VIEW)),
    download: vi.fn(() => Promise.resolve()),
    logger: createLogger({
      service: 't',
      sink: (_l, line) => lines.push(line),
    }),
    ...overrides,
  };
  render(<SharedDesignPage {...props} />);
  return { ...props, lines };
}

describe('SharedDesignPage', () => {
  it('shows the shared image read-only, with its title', async () => {
    const { loadShare } = renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    const image = await screen.findByRole('img', {
      name: 'Design: Sam turns 30',
    });
    expect(image).toHaveAttribute('src', VIEW.imageUrl);
    expect(image).toHaveAttribute('width', '1080');
    expect(loadShare).toHaveBeenCalledWith(ID);
    expect(document.title).toBe('Sam turns 30 · Canvas Studio');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('downloads the PNG and reports download failures', async () => {
    const download = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('HTTP 500'));
    const { lines } = renderPage({ download });
    const button = await screen.findByRole('button', { name: 'Download PNG' });

    await userEvent.click(button);
    expect(download).toHaveBeenCalledWith(VIEW);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Download failed',
    );
    expect(lines.join()).toContain('share.download_failed');
  });

  it('explains unknown or turned-off links', async () => {
    renderPage({ loadShare: vi.fn(() => Promise.resolve(null)) });

    expect(
      await screen.findByRole('heading', { name: "This link isn't available" }),
    ).toBeInTheDocument();
  });

  it('never calls the server for a malformed id or without a backend', () => {
    const loadShare = vi.fn();
    renderPage({ shareId: null, loadShare });

    expect(
      screen.getByRole('heading', { name: "This link isn't available" }),
    ).toBeInTheDocument();
    expect(loadShare).not.toHaveBeenCalled();
  });

  it('works without a backend configured', () => {
    renderPage({ loadShare: null });

    expect(
      screen.getByRole('heading', { name: "This link isn't available" }),
    ).toBeInTheDocument();
  });

  it('reports load failures', async () => {
    const { lines } = renderPage({
      loadShare: vi.fn(() => Promise.reject(new Error('offline'))),
    });

    expect(
      await screen.findByRole('heading', { name: "Couldn't load this design" }),
    ).toBeInTheDocument();
    expect(lines.join()).toContain('share.view_failed');
  });

  it('links back to the app', async () => {
    renderPage();
    await screen.findByRole('img');

    expect(screen.getByRole('link', { name: 'Canvas Studio' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
