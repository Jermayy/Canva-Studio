import { Notice } from '@/app/components/Notice';
import { useLiveQuery, useSyncStatus } from '@/app/hooks';
import { useServices, useWorkspace } from '@/app/services';
import { DesignPreview } from '@/modules/designs/components/DesignPreview';
import type { DesignRecord } from '@/modules/designs/data/localDb';
import { requestPersistentStorage } from '@/modules/designs/data/storagePersistence';
import { TemplateCard } from '@/modules/library/components/SidePanel';
import {
  TEMPLATES,
  type Template,
  type TemplateCategory,
} from '@/modules/library/domain/templates';
import { SyncBadge } from '@/modules/sync/components/SyncBadge';
import { useState } from 'react';

export interface HomeScreenProps {
  onOpen: (record: DesignRecord) => void;
  onSignOut: () => void;
  /** Shown for signed-in users only. */
  onDeleteAccount?: () => void;
  notice: string | null;
  onDismissNotice: () => void;
}

const FILTERS: ('All' | TemplateCategory)[] = [
  'All',
  'Birthday',
  'Christmas',
  'Party',
  'Blank',
];

export function HomeScreen({
  onOpen,
  onSignOut,
  onDeleteAccount,
  notice,
  onDismissNotice,
}: HomeScreenProps) {
  const workspace = useWorkspace();
  const { logger } = useServices();
  const syncStatus = useSyncStatus(workspace.sync);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [error, setError] = useState<string | null>(null);
  const designs = useLiveQuery(
    () => workspace.designs.list(),
    'designs',
    null as DesignRecord[] | null,
  );

  const run = async (label: string, action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (actionError) {
      logger.error(`home.${label}_failed`, { error: String(actionError) });
      setError(`Could not ${label} the design. Please try again.`);
    }
  };

  const createFrom = (template: Template) =>
    run('create', async () => {
      // A user action: the right moment for a possible browser prompt.
      void requestPersistentStorage().then((result) => {
        logger.info('storage.persistence', { result });
      });
      const name =
        template.category === 'Blank' ? 'Untitled design' : template.name;
      onOpen(await workspace.designs.create(name, template.build()));
    });

  const templates = TEMPLATES.filter(
    (template) => filter === 'All' || template.category === filter,
  );

  return (
    <div className="home-screen">
      <header className="home-header">
        <h1>Canvas Studio</h1>
        <div className="toolbar-group">
          <SyncBadge status={syncStatus} />
          <span className="muted">{workspace.email ?? 'Offline guest'}</span>
          <button type="button" className="secondary" onClick={onSignOut}>
            {workspace.kind === 'cloud' ? 'Sign out' : 'Sign in'}
          </button>
          {workspace.kind === 'cloud' && onDeleteAccount && (
            <button
              type="button"
              className="link-danger"
              onClick={onDeleteAccount}
            >
              Delete account
            </button>
          )}
        </div>
      </header>
      <Notice
        message={error ?? notice}
        tone="error"
        onDismiss={() => {
          setError(null);
          onDismissNotice();
        }}
      />
      {workspace.kind === 'guest' && (
        <p className="guest-note" role="note">
          Your designs are saved in this browser only, and browsers can clear
          site data (Safari does after 7 days without a visit).{' '}
          <button type="button" className="link" onClick={onSignOut}>
            Sign in to back them up
          </button>
        </p>
      )}
      <main className="home-main">
        <section aria-labelledby="create-heading">
          <div className="section-heading">
            <h2 id="create-heading">Start something new</h2>
            <div
              role="group"
              aria-label="Filter templates"
              className="chip-row"
            >
              {FILTERS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`chip ${filter === name ? 'active' : ''}`}
                  aria-pressed={filter === name}
                  onClick={() => {
                    setFilter(name);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="template-strip">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={(selected) => {
                  void createFrom(selected);
                }}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="designs-heading">
          <h2 id="designs-heading">Your designs</h2>
          {designs === null && <p className="muted">Loading your designs…</p>}
          {designs?.length === 0 && (
            <p className="empty-state">
              No designs yet. Pick a template above to get started.
            </p>
          )}
          {designs && designs.length > 0 && (
            <ul className="design-grid">
              {designs.map((record) => (
                <li key={record.id} className="design-card">
                  <button
                    type="button"
                    className="design-open"
                    onClick={() => {
                      onOpen(record);
                    }}
                  >
                    <DesignPreview
                      document={record.document}
                      title={record.title}
                    />
                    <span className="design-title">{record.title}</span>
                    <span className="muted small">
                      Edited {new Date(record.updatedAt).toLocaleString()}
                      {record.dirty === 1 && workspace.kind === 'cloud'
                        ? ' · not yet synced'
                        : ''}
                    </span>
                  </button>
                  <div className="design-actions">
                    <button
                      type="button"
                      className="ghost small"
                      aria-label={`Duplicate ${record.title}`}
                      onClick={() => {
                        void run('duplicate', async () => {
                          await workspace.designs.duplicate(record.id);
                          workspace.sync?.requestSync();
                        });
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="ghost small danger"
                      aria-label={`Delete ${record.title}`}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Delete “${record.title}”? This can't be undone.`,
                          )
                        ) {
                          return;
                        }
                        void run('delete', async () => {
                          await workspace.designs.remove(record.id);
                          workspace.sync?.requestSync();
                          // The link dies with the design server-side; this
                          // also removes its public image. Best effort.
                          workspace.shares
                            ?.unpublish(record.id)
                            .catch((error: unknown) => {
                              logger.warn('share.cleanup_failed', {
                                designId: record.id,
                                error: String(error),
                              });
                            });
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
