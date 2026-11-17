import type { Workspace } from '@/app/workspace';
import type { ExportService } from '@/modules/export/exportService';
import type { Logger } from '@/shared/logger';
import { createContext, useContext } from 'react';

/** App-wide services, provided once at the root. */
export interface AppServices {
  logger: Logger;
  exporter: ExportService;
}

export const ServicesContext = createContext<AppServices | null>(null);
export const WorkspaceContext = createContext<Workspace | null>(null);

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error('useServices must be used inside ServicesContext');
  }
  return services;
}

export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) {
    throw new Error('useWorkspace must be used inside WorkspaceContext');
  }
  return workspace;
}
