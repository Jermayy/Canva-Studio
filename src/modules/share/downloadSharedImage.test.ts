import { downloadSharedImage } from '@/modules/share/downloadSharedImage';
import { fakeFiles } from '@/test/renderWithProviders';

const VIEW = { title: 'Party', imageUrl: 'https://cdn.test/x.png' };

describe('downloadSharedImage', () => {
  it('fetches the image bytes and saves them as a PNG', async () => {
    const files = fakeFiles();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(bytes)),
    );

    await downloadSharedImage(VIEW, { fetch: fetchImpl, files });

    expect(fetchImpl).toHaveBeenCalledWith(VIEW.imageUrl, {
      signal: expect.any(AbortSignal),
    });
    expect(files.save).toHaveBeenCalledWith({
      suggestedName: 'Party',
      format: 'png',
      data: bytes,
    });
  });

  it('fails on HTTP errors without saving', async () => {
    const files = fakeFiles();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('gone', { status: 404 })),
    );

    await expect(
      downloadSharedImage(VIEW, { fetch: fetchImpl, files }),
    ).rejects.toThrow('HTTP 404');
    expect(files.save).not.toHaveBeenCalled();
  });
});
