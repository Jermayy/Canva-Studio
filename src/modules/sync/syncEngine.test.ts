import {
  CloudUnavailableError,
  createSimulatedCloud,
  createSyncEngine,
  type CloudTransport,
  type Connectivity,
} from '@/modules/sync/syncEngine';
import { createLogger } from '@/shared/logger';
import { makeDocument, NOW } from '@/test/factories';

const logger = createLogger({ service: 'test', sink: () => undefined });

function fakeConnectivity(online = true) {
  const listeners = new Set<() => void>();
  const state = { online };
  const connectivity: Connectivity = {
    isOnline: () => state.online,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    connectivity,
    set: (next: boolean) => {
      state.online = next;
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
}

describe('sync engine', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes queued documents and reports progress', async () => {
    const push = vi.fn<CloudTransport['push']>(() => Promise.resolve());
    const { connectivity } = fakeConnectivity();
    const engine = createSyncEngine({
      transport: { push },
      connectivity,
      now: () => NOW,
      logger,
    });
    engine.enqueue(makeDocument({ id: 'a' }));
    expect(engine.store.getState()).toMatchObject({
      status: 'syncing',
      pending: 1,
    });
    await vi.waitFor(() => {
      expect(engine.store.getState()).toMatchObject({
        status: 'synced',
        pending: 0,
        lastSyncedAt: NOW,
      });
    });
    expect(push).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('only sends the latest version of a document', async () => {
    let release: () => void = () => undefined;
    const push = vi.fn<CloudTransport['push']>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { connectivity } = fakeConnectivity();
    const engine = createSyncEngine({
      transport: { push },
      connectivity,
      now: () => NOW,
      logger,
    });
    engine.enqueue(makeDocument({ id: 'a', name: 'v1' }));
    engine.enqueue(makeDocument({ id: 'a', name: 'v2' }));
    engine.enqueue(makeDocument({ id: 'a', name: 'v3' }));
    release();
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledTimes(2);
    });
    release();
    await vi.waitFor(() => {
      expect(engine.store.getState().status).toBe('synced');
    });
    expect(push.mock.calls.map(([document]) => document.name)).toEqual([
      'v1',
      'v3',
    ]);
  });

  it('waits while offline and syncs when the connection returns', async () => {
    const push = vi.fn<CloudTransport['push']>(() => Promise.resolve());
    const network = fakeConnectivity(false);
    const engine = createSyncEngine({
      transport: { push },
      connectivity: network.connectivity,
      now: () => NOW,
      logger,
    });
    expect(engine.store.getState().status).toBe('offline');
    engine.enqueue(makeDocument());
    expect(engine.store.getState()).toMatchObject({
      status: 'offline',
      pending: 1,
    });
    expect(push).not.toHaveBeenCalled();
    network.set(true);
    await vi.waitFor(() => {
      expect(engine.store.getState().status).toBe('synced');
    });
    network.set(false);
    expect(engine.store.getState().status).toBe('offline');
  });

  it('retries failures with backoff, and on demand', async () => {
    const push = vi
      .fn<CloudTransport['push']>()
      .mockRejectedValueOnce(new CloudUnavailableError('timeout'))
      .mockRejectedValueOnce(new CloudUnavailableError('timeout'))
      .mockResolvedValue(undefined);
    const { connectivity } = fakeConnectivity();
    const engine = createSyncEngine({
      transport: { push },
      connectivity,
      now: () => NOW,
      logger,
      retryBaseMs: 1000,
    });
    engine.enqueue(makeDocument());
    await vi.waitFor(() => {
      expect(engine.store.getState()).toMatchObject({
        status: 'error',
        lastError: 'timeout',
      });
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(push).toHaveBeenCalledTimes(2);
    engine.retryNow();
    await vi.waitFor(() => {
      expect(engine.store.getState().status).toBe('synced');
    });
    engine.dispose();
  });
});

describe('simulated cloud', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds after latency, fails offline, and fails at its failure rate', async () => {
    const { connectivity, set } = fakeConnectivity();
    const ok = createSimulatedCloud({
      connectivity,
      random: () => 0.5,
      minLatencyMs: 100,
      maxLatencyMs: 100,
    });
    const pushed = ok.push(makeDocument());
    await vi.advanceTimersByTimeAsync(100);
    await expect(pushed).resolves.toBeUndefined();

    const flaky = createSimulatedCloud({
      connectivity,
      random: () => 0,
      failureRate: 0.5,
    });
    const failed = flaky.push(makeDocument());
    const assertion = expect(failed).rejects.toBeInstanceOf(
      CloudUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;

    set(false);
    await expect(ok.push(makeDocument())).rejects.toThrow('offline');
  });
});
