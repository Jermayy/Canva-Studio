import { useServices } from '@/app/services';
import type { SyncEngine, SyncStatus } from '@/modules/sync/syncEngine';
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/**
 * Subscribes to a Dexie query and re-renders when its tables change.
 * `key` must change whenever the query's inputs change.
 */
export function useLiveQuery<T>(
  query: () => Promise<T>,
  key: string,
  initial: T,
): T {
  const { logger } = useServices();
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: setValue,
      error: (error: unknown) => {
        logger.error('live_query.failed', { key, error: String(error) });
      },
    });
    return () => {
      subscription.unsubscribe();
    };
    // The query closure is recreated each render; `key` captures its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

const DISABLED: SyncStatus | null = null;

export function useSyncStatus(sync: SyncEngine | null): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(DISABLED);
  useEffect(() => {
    if (!sync) {
      return undefined;
    }
    return sync.onStatus(setStatus);
  }, [sync]);
  return sync ? status : DISABLED;
}

/** Loads an image URL into an HTMLImageElement for Konva. */
export function useLoadedImage(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      return undefined;
    }
    let cancelled = false;
    const element = new Image();
    element.onload = () => {
      if (!cancelled) {
        setImage(element);
      }
    };
    element.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return url ? image : null;
}
