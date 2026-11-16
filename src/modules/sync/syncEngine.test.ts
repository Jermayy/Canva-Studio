import {
  AssetRepository,
  sha256Hex,
} from '@/modules/designs/data/assetRepository';
import {
  openWorkspaceDb,
  type CanvasStudioDb,
} from '@/modules/designs/data/localDb';
import { LocalDesignRepository } from '@/modules/designs/data/localDesignRepository';
import { SyncEngine, type SyncStatus } from '@/modules/sync/syncEngine';
import { FakeRemoteStore } from '@/test/fakeRemoteStore';
import { buildDocument, buildRect } from '@/test/factories';
import { createLogger } from '@/shared/logger';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7])
  .buffer;

let db: CanvasStudioDb;
let local: LocalDesignRepository;
let assets: AssetRepository;
let remote: FakeRemoteStore;
let online: boolean;
let logLines: string[];
let engine: SyncEngine;

function makeEngine(overrides: { pageSize?: number } = {}) {
  return new SyncEngine({
    local,
    assets,
    remote,
    isOnline: () => online,
    logger: createLogger({
      service: 'test',
      sink: (_l, line) => logLines.push(line),
    }),
    pollIntervalMs: 10_000,
    debounceMs: 100,
    ...overrides,
  });
}

function remoteWrite(
  id: string,
  title: string,
  deletedAt: string | null = null,
) {
  return {
    id,
    title,
    document: buildDocument([buildRect({ id: `${id}-rect` })]),
    clientUpdatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt,
  };
}

beforeEach(() => {
  db = openWorkspaceDb(`sync-${crypto.randomUUID()}`);
  local = new LocalDesignRepository(db);
  assets = new AssetRepository(db);
  remote = new FakeRemoteStore();
  online = true;
  logLines = [];
  engine = makeEngine();
});

afterEach(async () => {
  engine.stop();
  vi.useRealTimers();
  await db.delete();
});

describe('SyncEngine push', () => {
  it('uploads new designs and marks them clean', async () => {
    const created = await local.create('Party', buildDocument());

    await engine.syncNow();

    expect(remote.rows.get(created.id)).toMatchObject({
      title: 'Party',
      version: 1,
    });
    expect(await local.get(created.id)).toMatchObject({ version: 1, dirty: 0 });
    expect(engine.getStatus()).toMatchObject({ state: 'idle' });
  });

  it('pushes subsequent edits with the expected version', async () => {
    const created = await local.create('Party', buildDocument());
    await engine.syncNow();

    await local.saveEdit(created.id, { title: 'Renamed' });
    await engine.syncNow();

    expect(remote.rows.get(created.id)).toMatchObject({
      title: 'Renamed',
      version: 2,
    });
    expect(await local.get(created.id)).toMatchObject({ version: 2, dirty: 0 });
  });

  it('pushes deletions as tombstones and removes the local record', async () => {
    const created = await local.create('Party', buildDocument());
    await engine.syncNow();

    await local.remove(created.id);
    await engine.syncNow();

    expect(remote.rows.get(created.id)?.deletedAt).not.toBeNull();
    expect(await local.get(created.id)).toBeUndefined();
  });

  it('uploads pending images before the designs that use them', async () => {
    const asset = await assets.addUpload('image/png', PNG);

    await engine.syncNow();

    expect(remote.assets.has(asset.id)).toBe(true);
    expect(await assets.listPendingUpload()).toEqual([]);
  });
});

describe('SyncEngine pull', () => {
  it('downloads designs created on another device', async () => {
    remote.serverWrite(remoteWrite('other-1', 'From laptop'));

    await engine.syncNow();

    expect(await local.get('other-1')).toMatchObject({
      title: 'From laptop',
      version: 1,
      dirty: 0,
    });
  });

  it('notifies listeners about remotely changed designs', async () => {
    const listener = vi.fn();
    engine.onRemoteChanges(listener);
    remote.serverWrite(remoteWrite('other-1', 'A'));

    await engine.syncNow();

    expect(listener).toHaveBeenCalledWith(['other-1']);
  });

  it('applies remote deletions', async () => {
    remote.serverWrite(remoteWrite('other-1', 'A'));
    await engine.syncNow();

    remote.serverWrite(remoteWrite('other-1', 'A', '2026-01-02T00:00:00.000Z'));
    await engine.syncNow();

    expect(await local.get('other-1')).toBeUndefined();
  });

  it('pages through large change sets', async () => {
    engine = makeEngine({ pageSize: 2 });
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      remote.serverWrite(remoteWrite(id, id));
    }

    await engine.syncNow();

    expect((await local.list()).map((record) => record.id).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('skips remote documents that fail validation', async () => {
    remote.serverWrite({
      ...remoteWrite('bad', 'Bad'),
      document: { evil: true },
    });

    await engine.syncNow();

    expect(await local.get('bad')).toBeUndefined();
    expect(logLines.join()).toContain('sync.invalid_remote_document');
  });

  it('downloads images referenced by pulled designs', async () => {
    const assetId = await sha256Hex(PNG);
    remote.assets.set(assetId, { bytes: PNG, mime: 'image/png' });
    remote.serverWrite({
      ...remoteWrite('img', 'With image'),
      document: buildDocument([
        {
          id: 'i',
          type: 'image',
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          width: 10,
          height: 10,
          source: { kind: 'upload', assetId },
        },
      ]),
    });

    await engine.syncNow();

    expect(await assets.has(assetId)).toBe(true);
  });

  it('logs missing remote images without failing the sync', async () => {
    remote.serverWrite({
      ...remoteWrite('img', 'Missing image'),
      document: buildDocument([
        {
          id: 'i',
          type: 'image',
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          width: 10,
          height: 10,
          source: { kind: 'upload', assetId: 'f'.repeat(64) },
        },
      ]),
    });

    await engine.syncNow();

    expect(await local.get('img')).toBeDefined();
    expect(logLines.join()).toContain('sync.asset_missing');
  });

  it('recovers from a corrupt cursor with a full pull', async () => {
    await local.setMeta('pull-cursor', 'not json');
    remote.serverWrite(remoteWrite('x', 'X'));

    await engine.syncNow();

    expect(await local.get('x')).toBeDefined();
    expect(logLines.join()).toContain('sync.cursor_reset');
  });

  it('does not re-apply its own pushes', async () => {
    const created = await local.create('Mine', buildDocument());
    await engine.syncNow();
    const listener = vi.fn();
    engine.onRemoteChanges(listener);

    await engine.syncNow();

    expect(listener).not.toHaveBeenCalled();
    expect(await local.get(created.id)).toMatchObject({ dirty: 0 });
  });
});

describe('SyncEngine conflicts', () => {
  it('keeps the server copy and saves local edits as a conflicted copy', async () => {
    const created = await local.create('Poster', buildDocument());
    await engine.syncNow();
    remote.serverWrite({
      ...remoteWrite(created.id, 'Poster (edited elsewhere)'),
    });
    await local.saveEdit(created.id, { title: 'Poster (edited here)' });

    await engine.syncNow();

    const titles = (await local.list()).map((record) => record.title).sort();
    expect(titles).toEqual([
      'Poster (edited elsewhere)',
      'Poster (edited here) (conflicted copy)',
    ]);
    expect(logLines.join()).toContain('sync.conflict');
  });

  it('does not create a copy when both sides made the same change', async () => {
    const document = buildDocument();
    const created = await local.create('Same', document);
    await engine.syncNow();
    remote.serverWrite({ ...remoteWrite(created.id, 'Same'), document });
    await local.saveEdit(created.id, { title: 'Same' });

    await engine.syncNow();

    expect(await local.list()).toHaveLength(1);
    expect(await local.get(created.id)).toMatchObject({ version: 2, dirty: 0 });
  });

  it('adopts the server copy when an insert finds the id already exists', async () => {
    const created = await local.create('Dup', buildDocument());
    remote.serverWrite({
      ...remoteWrite(created.id, 'Dup'),
      document: created.document,
    });

    await engine.syncNow();

    expect(await local.list()).toHaveLength(1);
    expect(await local.get(created.id)).toMatchObject({ dirty: 0, version: 1 });
  });

  it('keeps local work when the server row has vanished', async () => {
    const created = await local.create('Gone', buildDocument());
    await engine.syncNow();
    remote.rows.delete(created.id);
    await local.saveEdit(created.id, { title: 'Gone but edited' });

    await engine.syncNow();

    expect(await local.get(created.id)).toBeUndefined();
    const titles = (await local.list()).map((record) => record.title);
    expect(titles).toEqual(['Gone but edited (conflicted copy)']);
  });

  it('treats a pulled newer version over a dirty local record as a conflict', async () => {
    const created = await local.create('P', buildDocument());
    await engine.syncNow();
    await local.saveEdit(created.id, { title: 'Local edit' });
    remote.serverWrite({ ...remoteWrite(created.id, 'Remote edit') });
    // Make the push see no conflict so the pull path handles it.
    const dirtyBefore = await local.get(created.id);
    vi.spyOn(local, 'listDirty').mockResolvedValueOnce([]);

    await engine.syncNow();

    expect(dirtyBefore?.dirty).toBe(1);
    const titles = (await local.list()).map((record) => record.title).sort();
    expect(titles).toEqual(['Local edit (conflicted copy)', 'Remote edit']);
  });
});

describe('SyncEngine status and scheduling', () => {
  it('reports offline and skips network calls without connectivity', async () => {
    online = false;
    await local.create('Offline work', buildDocument());

    await engine.syncNow();

    expect(engine.getStatus()).toEqual({ state: 'offline' });
    expect(remote.rows.size).toBe(0);
  });

  it('reports errors and recovers on the next run', async () => {
    await local.create('A', buildDocument());
    remote.failNext = new Error('network down');

    await engine.syncNow();
    expect(engine.getStatus()).toEqual({
      state: 'error',
      message: 'network down',
    });

    await engine.syncNow();
    expect(engine.getStatus()).toMatchObject({ state: 'idle' });
  });

  it('reports offline when the connection drops mid-sync', async () => {
    remote.failNext = new Error('fetch failed');
    const original = remote.fetchChangedSince.bind(remote);
    vi.spyOn(remote, 'fetchChangedSince').mockImplementationOnce((...args) => {
      online = false;
      return original(...args);
    });

    await engine.syncNow();

    expect(engine.getStatus()).toEqual({ state: 'offline' });
  });

  it('broadcasts status changes to listeners and supports unsubscribe', async () => {
    const statuses: SyncStatus['state'][] = [];
    const unsubscribe = engine.onStatus((status) =>
      statuses.push(status.state),
    );

    await engine.syncNow();
    unsubscribe();
    await engine.syncNow();

    expect(statuses).toEqual(['offline', 'syncing', 'idle']);
  });

  it('coalesces concurrent sync calls into one rerun', async () => {
    const spy = vi.spyOn(remote, 'fetchChangedSince');

    await Promise.all([engine.syncNow(), engine.syncNow(), engine.syncNow()]);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('debounces requests and polls on an interval once started', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    const spy = vi.spyOn(engine, 'syncNow');

    engine.start();
    engine.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(1);

    engine.requestSync();
    engine.requestSync();
    await vi.advanceTimersByTimeAsync(100);
    expect(spy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(spy).toHaveBeenCalledTimes(3);

    engine.requestSync();
    engine.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(remote.unsubscribed).toBe(true);
  });

  it('syncs on realtime events and tracks live status', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    const spy = vi.spyOn(engine, 'syncNow');
    engine.start();
    await vi.advanceTimersByTimeAsync(0);
    spy.mockClear();

    remote.emitChange();
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(1);

    remote.emitStatus('connected');
    await vi.advanceTimersByTimeAsync(0);
    await engine.syncNow();
    expect(engine.getStatus()).toMatchObject({ state: 'idle', live: true });

    remote.emitStatus('disconnected');
    expect(engine.getStatus()).toMatchObject({ live: false });
  });
});
