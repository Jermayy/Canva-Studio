import { useLiveQuery, useLoadedImage, useSyncStatus } from '@/app/hooks';
import { ServicesContext, useServices, useWorkspace } from '@/app/services';
import type { SyncEngine, SyncStatus } from '@/modules/sync/syncEngine';
import { mockImageLoading, testServices } from '@/test/renderWithProviders';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

function withServices(services = testServices()) {
  return {
    services,
    wrapper: ({ children }: { children: ReactNode }) => (
      <ServicesContext.Provider value={services}>
        {children}
      </ServicesContext.Provider>
    ),
  };
}

describe('useLiveQuery', () => {
  it('emits query results', async () => {
    const { wrapper } = withServices();

    const { result } = renderHook(
      () => useLiveQuery(() => Promise.resolve(42), 'k', 0),
      {
        wrapper,
      },
    );

    await waitFor(() => {
      expect(result.current).toBe(42);
    });
  });

  it('logs failing queries and keeps the initial value', async () => {
    const { wrapper, services } = withServices();

    const { result } = renderHook(
      () =>
        useLiveQuery(
          () => Promise.reject(new Error('db closed')),
          'broken',
          'initial',
        ),
      { wrapper },
    );

    await waitFor(() => {
      expect(services.logLines.join()).toContain('live_query.failed');
    });
    expect(result.current).toBe('initial');
  });
});

describe('useSyncStatus', () => {
  it('returns null without sync and follows engine status otherwise', () => {
    let emit: (status: SyncStatus) => void = () => {};
    const sync = {
      onStatus: (listener: (status: SyncStatus) => void) => {
        emit = listener;
        listener({ state: 'offline' });
        return () => undefined;
      },
    } as unknown as SyncEngine;

    const none = renderHook(() => useSyncStatus(null));
    const live = renderHook(() => useSyncStatus(sync));
    expect(none.result.current).toBeNull();
    expect(live.result.current).toEqual({ state: 'offline' });

    emit({ state: 'syncing' });
    live.rerender();

    expect(live.result.current).toEqual({ state: 'syncing' });
  });
});

describe('useLoadedImage', () => {
  it('loads an image for a URL and returns null without one', async () => {
    const restore = mockImageLoading();

    const loaded = renderHook(() => useLoadedImage('data:image/png;base64,x'));
    const empty = renderHook(() => useLoadedImage(null));

    await waitFor(() => {
      expect(loaded.result.current).not.toBeNull();
    });
    expect(empty.result.current).toBeNull();
    restore();
  });
});

describe('context hooks', () => {
  it('throw a clear error outside their providers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useServices())).toThrow('ServicesContext');
    expect(() => renderHook(() => useWorkspace())).toThrow('WorkspaceContext');
  });
});
