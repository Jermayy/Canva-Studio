import { FullScreenLoader, Link } from '@/app/components/AppChrome';
import { useWorkspaceState } from '@/app/services';
import { Studio } from '@/modules/studio/components/Studio';
import { EmptyState } from '@/shared/ui/feedback';
import { useState } from 'react';

/** Opens a saved design from the signed-in workspace. */
export default function StudioRoute({ documentId }: { documentId: string }) {
  const status = useWorkspaceState((state) => state.status);
  const document = useWorkspaceState((state) => state.documents[documentId]);
  // The editor owns the document once open; later workspace updates are
  // its own saves echoing back, so only the first version seeds it.
  const [initial, setInitial] = useState(document);
  if (!initial && document) {
    setInitial(document);
  }

  if (status === 'idle' || status === 'loading') {
    return <FullScreenLoader label="Opening your design…" />;
  }
  if (!initial) {
    return (
      <main className="centered-page">
        <EmptyState
          icon="folder"
          title="This design isn’t here"
          action={
            <Link to="/projects" className="btn btn--primary btn--md">
              Back to projects
            </Link>
          }
        >
          It may have been deleted, or it belongs to another account on this
          device.
        </EmptyState>
      </main>
    );
  }
  return <Studio initialDocument={initial} mode="account" />;
}
