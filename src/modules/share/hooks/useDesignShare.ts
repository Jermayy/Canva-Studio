import type { DesignShare, ShareStore } from '@/modules/share/shareStore';
import type { Logger } from '@/shared/logger';
import { useEffect, useState } from 'react';

interface Loaded {
  designId: string;
  share: DesignShare | null;
}

/**
 * The share link of the open design. Loaded once per design; `setShare`
 * records changes made in this session (publish / stop sharing).
 */
export function useDesignShare(
  shares: ShareStore | null,
  designId: string | null,
  logger: Logger,
): [DesignShare | null, (share: DesignShare | null) => void] {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!shares || !designId) {
      return undefined;
    }
    let cancelled = false;
    shares.getForDesign(designId).then(
      (share) => {
        if (!cancelled) {
          setLoaded({ designId, share });
        }
      },
      (error: unknown) => {
        // Offline or transient: the link controls still work on demand.
        logger.warn('share.load_failed', { designId, error: String(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [shares, designId, logger]);

  const share = loaded && loaded.designId === designId ? loaded.share : null;
  const setShare = (next: DesignShare | null) => {
    if (designId) {
      setLoaded({ designId, share: next });
    }
  };
  return [share, setShare];
}
