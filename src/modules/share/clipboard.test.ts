import { copyText } from '@/modules/share/clipboard';

describe('copyText', () => {
  it('writes to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());

    await expect(copyText('hi', { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hi');
  });

  it('returns false when the clipboard is missing or refuses', async () => {
    await expect(copyText('hi', undefined)).resolves.toBe(false);
    await expect(
      copyText('hi', { writeText: () => Promise.reject(new Error('denied')) }),
    ).resolves.toBe(false);
  });
});
