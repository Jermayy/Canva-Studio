import type { AuthService } from '@/modules/auth/application/authService';
import type { StoredSession } from '@/modules/auth/application/ports';
import type { ExportDependencies } from '@/modules/export/application/exportDesign';
import type { FileDelivery } from '@/modules/export/infrastructure/fileDelivery';
import type { PreferencesStore } from '@/modules/preferences/preferences';
import type { SyncEngine } from '@/modules/sync/syncEngine';
import type { WorkspaceStore } from '@/modules/workspace/state/workspaceStore';
import type { Logger } from '@/shared/logger';
import type { ToastState, ToastStore } from '@/shared/ui/toastStore';
import { createContext, use } from 'react';
import { useStore } from 'zustand';

/**
 * The app's dependency container. `main.tsx` builds the browser version;
 * tests build one from fakes. Screens reach services only through these
 * hooks, never through imports of concrete adapters.
 */

export interface Workspace {
  kind: 'account' | 'sandbox';
  store: WorkspaceStore;
  sync: SyncEngine | null;
  close: () => Promise<void>;
}

export type ExportServices = Omit<ExportDependencies, 'loadAsset' | 'onPhase'>;

export interface AppServices {
  version: string;
  logger: Logger;
  auth: AuthService;
  preferences: PreferencesStore;
  toasts: ToastStore;
  files: FileDelivery;
  exporter: ExportServices;
  now: () => number;
  createId: () => string;
  openWorkspace: (stored: StoredSession) => Workspace;
  openSandbox: () => Workspace;
}

export interface SessionContextValue {
  session: StoredSession['session'] | null;
  signOut: () => Promise<void>;
}

export const ServicesContext = createContext<AppServices | null>(null);
export const SessionContext = createContext<SessionContextValue | null>(null);
export const WorkspaceContext = createContext<Workspace | null>(null);

function required<T>(value: T | null, name: string): T {
  if (value === null) {
    throw new Error(`${name} is missing: render inside its provider`);
  }
  return value;
}

export function useServices(): AppServices {
  return required(use(ServicesContext), 'ServicesContext');
}

export function useSession(): SessionContextValue {
  return required(use(SessionContext), 'SessionContext');
}

export function useWorkspace(): Workspace {
  return required(use(WorkspaceContext), 'WorkspaceContext');
}

export function useWorkspaceState<T>(
  selector: (state: ReturnType<WorkspaceStore['getState']>) => T,
): T {
  return useStore(useWorkspace().store, selector);
}

export function useNotify(): ToastState['notify'] {
  return useStore(useServices().toasts, (state) => state.notify);
}

export function usePreferences() {
  const store = useServices().preferences;
  return {
    preferences: useStore(store, (state) => state.preferences),
    update: useStore(store, (state) => state.update),
    reset: useStore(store, (state) => state.reset),
  };
}
