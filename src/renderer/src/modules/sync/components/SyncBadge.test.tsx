import { SyncBadge } from '@renderer/modules/sync/components/SyncBadge';
import type { SyncStatus } from '@renderer/modules/sync/syncEngine';
import { render, screen } from '@testing-library/react';

describe('SyncBadge', () => {
  it.each<[SyncStatus | null, string]>([
    [null, 'Local only'],
    [{ state: 'offline' }, 'Offline'],
    [{ state: 'syncing' }, 'Syncing…'],
    [{ state: 'idle', lastSyncedAt: 0, live: true }, 'Synced · live'],
    [{ state: 'idle', lastSyncedAt: 0, live: false }, 'Synced'],
    [{ state: 'error', message: 'boom' }, 'Sync paused'],
  ])('shows %j as "%s"', (status, label) => {
    render(<SyncBadge status={status} />);

    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('describes errors without implying data loss', () => {
    render(<SyncBadge status={{ state: 'error', message: 'timeout' }} />);

    expect(screen.getByRole('status')).toHaveAccessibleName(
      /safe locally.*timeout/,
    );
  });
});
