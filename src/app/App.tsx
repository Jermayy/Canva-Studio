import {
  ServicesContext,
  WorkspaceContext,
  type AppServices,
} from '@/app/services';
import {
  browserConnectivity,
  createWorkspace,
  type Workspace,
  type WorkspaceSession,
} from '@/app/workspace';
import { DeleteAccountDialog } from '@/modules/account/components/DeleteAccountDialog';
import {
  deleteAccount,
  type DeleteAccountResult,
} from '@/modules/account/deleteAccount';
import type { AuthService, AuthUser } from '@/modules/auth/authService';
import { AuthScreen } from '@/modules/auth/components/AuthScreen';
import { HomeScreen } from '@/modules/designs/components/HomeScreen';
import {
  deleteWorkspaceDb,
  type DesignRecord,
} from '@/modules/designs/data/localDb';
import { EditorScreen } from '@/modules/editor/components/EditorScreen';
import { editorStore } from '@/modules/editor/state/editorStore';
import type { RemoteDesignStore } from '@/modules/sync/remoteDesignStore';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AppProps {
  services: AppServices;
  auth: AuthService | null;
  createRemote: (user: AuthUser) => RemoteDesignStore;
  /** Lets tests inject an isolated environment. */
  workspaceFactory?: typeof createWorkspace;
}

type Screen = 'loading' | 'auth' | 'home' | 'editor';

/** Remembers that the user chose offline mode (not a credential). */
const MODE_KEY = 'canvas-studio.mode';

function readGuestPreference(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) === 'guest';
  } catch {
    return false;
  }
}

function writeGuestPreference(guest: boolean): void {
  try {
    if (guest) {
      localStorage.setItem(MODE_KEY, 'guest');
    } else {
      localStorage.removeItem(MODE_KEY);
    }
  } catch {
    // Storage unavailable: the user just sees the sign-in screen next time.
  }
}

export function App({
  services,
  auth,
  createRemote,
  workspaceFactory = createWorkspace,
}: AppProps) {
  const [screen, setScreen] = useState<Screen>('loading');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  // The live workspace, so it can be disposed exactly once on switch.
  const workspaceRef = useRef<Workspace | null>(null);

  /** One workspace per session; disposing closes its database and sync. */
  const activate = useCallback(
    (session: WorkspaceSession | null) => {
      workspaceRef.current?.dispose();
      const next = session
        ? workspaceFactory(session, {
            logger: services.logger,
            ...browserConnectivity,
          })
        : null;
      workspaceRef.current = next;
      setWorkspace(next);
    },
    [services.logger, workspaceFactory],
  );

  useEffect(
    () => () => {
      workspaceRef.current?.dispose();
      workspaceRef.current = null;
    },
    [],
  );

  const startCloud = useCallback(
    (user: AuthUser) => {
      writeGuestPreference(false);
      activate({ kind: 'cloud', user, remote: createRemote(user) });
      setScreen('home');
    },
    [activate, createRemote],
  );

  const startGuest = useCallback(() => {
    writeGuestPreference(true);
    activate({ kind: 'guest' });
    setScreen('home');
  }, [activate]);

  // Restore the previous session (works offline from the encrypted store).
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const user = auth ? await auth.currentUser() : null;
      if (cancelled) {
        return;
      }
      if (user) {
        startCloud(user);
      } else if (readGuestPreference()) {
        startGuest();
      } else {
        setScreen('auth');
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [auth, startCloud, startGuest]);

  // Sessions revoked elsewhere (e.g. password change) return to sign-in.
  useEffect(() => {
    if (!auth) {
      return undefined;
    }
    return auth.onSignedOut(() => {
      if (workspaceRef.current?.kind !== 'cloud') {
        return;
      }
      editorStore.getState().close();
      activate(null);
      setScreen('auth');
    });
  }, [auth, activate]);

  const signOut = async () => {
    editorStore.getState().close();
    if (workspaceRef.current?.kind === 'cloud' && auth) {
      await auth.signOut();
    }
    writeGuestPreference(false);
    activate(null);
    setScreen('auth');
  };

  const confirmDeleteAccount = async (
    password: string,
  ): Promise<DeleteAccountResult> => {
    const current = workspaceRef.current;
    if (!auth || current?.kind !== 'cloud' || !current.remote) {
      return { ok: false, message: 'Sign in to delete your account.' };
    }
    const workspaceId = current.id;
    const result = await deleteAccount(
      {
        auth,
        remote: current.remote,
        isOnline: browserConnectivity.isOnline,
        logger: services.logger,
        deleteLocalData: async () => {
          // Close the database before deleting it.
          activate(null);
          await deleteWorkspaceDb(workspaceId);
        },
      },
      password,
    );
    if (result.ok) {
      editorStore.getState().close();
      writeGuestPreference(false);
      activate(null);
      setDeletingAccount(false);
      setAuthNotice(
        result.localDataRemains
          ? 'Your account was deleted. Some data may remain in this browser; clear site data to remove it.'
          : 'Your account and all its data have been deleted.',
      );
      setScreen('auth');
    }
    return result;
  };

  const openDesign = (record: DesignRecord) => {
    editorStore.getState().open(record);
    setScreen('editor');
  };

  const closeEditor = useCallback(() => {
    const pending = editorStore.getState().notice;
    if (pending) {
      setNotice(pending);
    }
    editorStore.getState().close();
    setScreen('home');
  }, []);

  return (
    <ServicesContext.Provider value={services}>
      {screen === 'loading' && (
        <div className="loading-screen" role="status">
          Loading…
        </div>
      )}
      {screen === 'auth' && (
        <AuthScreen
          auth={auth}
          onSignedIn={(user) => {
            setAuthNotice(null);
            startCloud(user);
          }}
          onContinueOffline={() => {
            setAuthNotice(null);
            startGuest();
          }}
          notice={authNotice}
        />
      )}
      {workspace && (screen === 'home' || screen === 'editor') && (
        <WorkspaceContext.Provider value={workspace}>
          {screen === 'home' && (
            <HomeScreen
              onOpen={openDesign}
              onSignOut={() => {
                void signOut();
              }}
              onDeleteAccount={
                auth
                  ? () => {
                      setDeletingAccount(true);
                    }
                  : undefined
              }
              notice={notice}
              onDismissNotice={() => {
                setNotice(null);
              }}
            />
          )}
          {screen === 'editor' && <EditorScreen onClose={closeEditor} />}
        </WorkspaceContext.Provider>
      )}
      {deletingAccount && workspace?.email && (
        <DeleteAccountDialog
          email={workspace.email}
          onCancel={() => {
            setDeletingAccount(false);
          }}
          onConfirm={confirmDeleteAccount}
        />
      )}
    </ServicesContext.Provider>
  );
}
