import { UploadsTab } from '@renderer/modules/library/components/UploadsTab';
import {
  mockImageLoading,
  renderWithProviders,
  testServices,
} from '@renderer/test/renderWithProviders';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1,
]);

function pngFile(name = 'photo.png') {
  return new File([PNG_BYTES], name, { type: 'image/png' });
}

describe('UploadsTab', () => {
  it('shows an empty state before anything is uploaded', () => {
    renderWithProviders(<UploadsTab onAdd={vi.fn()} />);

    expect(screen.getByText(/uploaded images appear here/)).toBeInTheDocument();
  });

  it('stores uploads and adds them with their natural size', async () => {
    const restore = mockImageLoading(1200, 600);
    const onAdd = vi.fn();
    const { workspace } = renderWithProviders(<UploadsTab onAdd={onAdd} />);

    await userEvent.upload(screen.getByLabelText('Upload images'), pngFile());
    const tile = await screen.findByRole('button', {
      name: 'Add uploaded image',
    });
    await waitFor(async () => {
      await userEvent.click(tile);
      expect(onAdd).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'upload', width: 1200, height: 600 }),
      );
    });

    expect(await workspace.assets.list()).toHaveLength(1);
    restore();
  });

  it('explains why an image was rejected', async () => {
    renderWithProviders(<UploadsTab onAdd={vi.fn()} />);
    const fake = new File([new Uint8Array([1, 2, 3])], 'fake.png', {
      type: 'image/png',
    });

    await userEvent.upload(screen.getByLabelText('Upload images'), fake);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'does not match',
    );
  });

  it('logs unexpected storage errors with a generic message', async () => {
    const services = testServices();
    const { workspace } = renderWithProviders(<UploadsTab onAdd={vi.fn()} />, {
      services,
    });
    vi.spyOn(workspace.assets, 'addUpload').mockRejectedValueOnce(
      new Error('quota'),
    );

    await userEvent.upload(screen.getByLabelText('Upload images'), pngFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add that image',
    );
    expect(services.logLines.join()).toContain('upload.failed');
  });
});
