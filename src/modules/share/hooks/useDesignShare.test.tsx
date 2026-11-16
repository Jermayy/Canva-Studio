import { useDesignShare } from '@/modules/share/hooks/useDesignShare';
import { FakeShareStore } from '@/test/fakeShareStore';
import { createLogger } from '@/shared/logger';
import { renderHook, waitFor } from '@testing-library/react';

describe('useDesignShare', () => {
  it('logs and stays unshared when loading fails', async () => {
    const shares = new FakeShareStore();
    shares.failNext = new Error('offline');
    const lines: string[] = [];
    const logger = createLogger({
      service: 't',
      sink: (_l, line) => lines.push(line),
    });

    const { result } = renderHook(() => useDesignShare(shares, 'd1', logger));

    await waitFor(() => {
      expect(lines.join()).toContain('share.load_failed');
    });
    expect(result.current[0]).toBeNull();
  });

  it('is empty for guests and when no design is open', () => {
    const logger = createLogger({ service: 't', sink: () => {} });

    const guest = renderHook(() => useDesignShare(null, 'd1', logger));
    const closed = renderHook(() =>
      useDesignShare(new FakeShareStore(), null, logger),
    );

    expect(guest.result.current[0]).toBeNull();
    expect(closed.result.current[0]).toBeNull();
  });
});
