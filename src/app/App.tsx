import { FullScreenLoader, Redirect } from '@/app/components/AppChrome';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { NotFoundPage } from '@/app/components/NotFoundPage';
import { navigate, parseRoute, useLocation, type Route } from '@/app/router';
import {
  ServicesContext,
  SessionContext,
  WorkspaceContext,
  type AppServices,
  type Workspace,
} from '@/app/services';
import type { StoredSession } from '@/modules/auth/application/ports';
import { AuthPage } from '@/modules/auth/components/AuthPage';
import { LandingPage } from '@/modules/landing/LandingPage';
import { applyPreferences } from '@/modules/preferences/preferences';
import { Toaster } from '@/shared/ui/Toaster';
import { lazy, Suspense, useEffect, useEffectEvent, useState } from 'react';
import { useStore } from 'zustand';

// Route-level code splitting: the editor (and jsPDF behind it) only loads
// when someone opens a design.
const DashboardPage = lazy(() => import('@/modules/dashboard/DashboardPage'));
const StudioRoute = lazy(() => import('@/modules/studio/StudioRoute'));
const SandboxRoute = lazy(() => import('@/modules/studio/SandboxRoute'));

type AuthState =
  | { status: 'restoring' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; stored: StoredSession; workspace: Workspace };

/** Keeps preferences applied to <html> (theme, accent, density, scale). */
function PreferencesEffect({ services }: { services: AppServices }) {
  const preferences = useStore(
    services.preferences,
    (state) => state.preferences,
  );
  useEffect(() => {
    applyPreferences(document.documentElement, preferences);
  }, [preferences]);
  return null;
}

/**
 * Pending saves are written when the tab is hidden or the page unloads.
 * Those are the events browsers reliably deliver (beforeunload alone
 * loses writes, playbook 06); beforeunload only asks to confirm leaving
 * while a save is still pending.
 */
function useFlushOnHide(workspace: Workspace | null) {
  useEffect(() => {
    if (!workspace) {
      return;
    }
    const flush = () => {
      void workspace.store.getState().flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const saves = Object.values(workspace.store.getState().saves);
      if (saves.some((save) => save.status !== 'saved')) {
        flush();
        event.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [workspace]);
}

function routeNeedsAccount(
  route: Route,
): route is Extract<Route, { name: 'projects' | 'studio' }> {
  return route.name === 'projects' || route.name === 'studio';
}

function Routes({
  route,
  auth,
  onAuthenticated,
}: {
  route: Route;
  auth: AuthState;
  onAuthenticated: (stored: StoredSession, next: string) => void;
}) {
  const location = useLocation();
  switch (route.name) {
    case 'landing':
      return <LandingPage signedIn={auth.status === 'signed-in'} />;
    case 'sign-in':
    case 'sign-up':
      if (auth.status === 'signed-in') {
        return <Redirect to={route.next} />;
      }
      return (
        <AuthPage
          mode={route.name}
          next={route.next}
          onAuthenticated={(stored) => {
            onAuthenticated(stored, route.next);
          }}
        />
      );
    case 'sandbox':
      return <SandboxRoute />;
    case 'not-found':
      return <NotFoundPage />;
    case 'projects':
    case 'studio':
      break;
  }
  if (!routeNeedsAccount(route)) {
    return null;
  }
  if (auth.status === 'restoring') {
    return <FullScreenLoader label="Unlocking your workspace…" />;
  }
  if (auth.status === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Redirect to={`/sign-in?next=${next}`} />;
  }
  return (
    <WorkspaceContext value={auth.workspace}>
      {route.name === 'projects' ? (
        <DashboardPage search={route.search} />
      ) : (
        <StudioRoute key={route.documentId} documentId={route.documentId} />
      )}
    </WorkspaceContext>
  );
}

export function App({ services }: { services: AppServices }) {
  const location = useLocation();
  const route = parseRoute(location.pathname, location.search);
  const [auth, setAuth] = useState<AuthState>({ status: 'restoring' });
  const workspace = auth.status === 'signed-in' ? auth.workspace : null;

  useFlushOnHide(workspace);

  const open = (stored: StoredSession) => {
    const opened = services.openWorkspace(stored);
    void opened.store.getState().load();
    setAuth({ status: 'signed-in', stored, workspace: opened });
  };

  useEffect(() => {
    let cancelled = false;
    void services.auth.restore().then((stored) => {
      if (cancelled) {
        return;
      }
      if (stored) {
        const opened = services.openWorkspace(stored);
        void opened.store.getState().load();
        setAuth({ status: 'signed-in', stored, workspace: opened });
      } else {
        setAuth({ status: 'signed-out' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services]);

  const signOut = async (reason?: string) => {
    if (auth.status !== 'signed-in') {
      return;
    }
    await auth.workspace.close();
    await services.auth.signOut();
    setAuth({ status: 'signed-out' });
    navigate('/', { replace: true });
    services.toasts
      .getState()
      .notify(
        reason ??
          'You’re signed out. Your designs stay encrypted on this device.',
        {
          tone: reason ? 'warning' : 'success',
        },
      );
  };

  // Sessions end on time even if the tab stays open.
  const expiresAt =
    auth.status === 'signed-in' ? auth.stored.session.expiresAt : null;
  const onExpired = useEffectEvent(() => {
    void signOut('Your session expired. Sign in again to continue.');
  });
  useEffect(() => {
    if (expiresAt === null) {
      return;
    }
    const timer = setTimeout(
      onExpired,
      Math.min(Math.max(0, expiresAt - services.now()), 2_147_483_647),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [expiresAt, services]);

  return (
    <ServicesContext value={services}>
      <PreferencesEffect services={services} />
      <SessionContext
        value={{
          session: auth.status === 'signed-in' ? auth.stored.session : null,
          signOut: () => signOut(),
        }}
      >
        <ErrorBoundary logger={services.logger}>
          <Suspense fallback={<FullScreenLoader label="Loading…" />}>
            <Routes
              route={route}
              auth={auth}
              onAuthenticated={(stored, next) => {
                open(stored);
                navigate(next, { replace: true });
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </SessionContext>
      <Toaster store={services.toasts} />
    </ServicesContext>
  );
}
