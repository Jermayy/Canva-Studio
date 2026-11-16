import type { SyncStatus } from '@/modules/sync/syncEngine';

export interface SyncBadgeProps {
  /** null means the workspace has no cloud sync (guest / unconfigured). */
  status: SyncStatus | null;
}

function describe(status: SyncStatus | null): {
  label: string;
  tone: string;
  detail: string;
} {
  if (!status) {
    return {
      label: 'Local only',
      tone: 'neutral',
      detail: 'Designs are saved on this computer only. Sign in to sync them.',
    };
  }
  switch (status.state) {
    case 'offline':
      return {
        label: 'Offline',
        tone: 'warning',
        detail:
          'Changes are saved on this computer and will sync when you reconnect.',
      };
    case 'syncing':
      return {
        label: 'Syncing…',
        tone: 'info',
        detail: 'Saving changes to the cloud.',
      };
    case 'idle':
      return {
        label: status.live ? 'Synced · live' : 'Synced',
        tone: 'success',
        detail: `Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString()}.`,
      };
    case 'error':
      return {
        label: 'Sync paused',
        tone: 'error',
        detail: `Changes are safe locally. Will retry automatically. (${status.message})`,
      };
    case 'update-required':
      return {
        label: 'Update available',
        tone: 'warning',
        detail:
          'A newer version of Canvas Studio saved some of your designs. Reload the page to update; your changes here are safe.',
      };
  }
}

export function SyncBadge({ status }: SyncBadgeProps) {
  const { label, tone, detail } = describe(status);
  return (
    <span
      className={`sync-badge tone-${tone}`}
      role="status"
      title={detail}
      aria-label={`${label}. ${detail}`}
    >
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}
