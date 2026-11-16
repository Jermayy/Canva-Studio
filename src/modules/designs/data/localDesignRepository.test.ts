import {
  openWorkspaceDb,
  type CanvasStudioDb,
} from '@/modules/designs/data/localDb';
import {
  LocalDesignRepository,
  normaliseTitle,
} from '@/modules/designs/data/localDesignRepository';
import { buildDocument, buildRect, sequentialIds } from '@/test/factories';

let db: CanvasStudioDb;
let clock: number;
let repo: LocalDesignRepository;

beforeEach(() => {
  db = openWorkspaceDb(`test-${crypto.randomUUID()}`);
  clock = 1000;
  repo = new LocalDesignRepository(db, () => clock, sequentialIds('design'));
});

afterEach(async () => {
  await db.delete();
});

describe('LocalDesignRepository', () => {
  it('creates dirty, never-synced designs', async () => {
    const record = await repo.create('  Party  ', buildDocument());

    expect(record).toMatchObject({
      id: 'design-1',
      title: 'Party',
      version: 0,
      dirty: 1,
      deleted: 0,
      createdAt: 1000,
    });
    await expect(repo.get('design-1')).resolves.toEqual(record);
  });

  it('lists visible designs newest first', async () => {
    await repo.create('A', buildDocument());
    clock = 2000;
    await repo.create('B', buildDocument());

    const titles = (await repo.list()).map((record) => record.title);

    expect(titles).toEqual(['B', 'A']);
  });

  it('saves edits with a strictly increasing timestamp', async () => {
    const created = await repo.create('A', buildDocument());

    const edited = await repo.saveEdit(created.id, {
      title: 'Renamed',
      document: buildDocument([buildRect()]),
    });

    expect(edited?.title).toBe('Renamed');
    expect(edited?.document.elements).toHaveLength(1);
    expect(edited?.updatedAt).toBe(1001);
  });

  it('ignores edits to missing or deleted designs', async () => {
    await expect(
      repo.saveEdit('missing', { title: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('keeps the title when only the document changes', async () => {
    const created = await repo.create('Keep me', buildDocument());

    const edited = await repo.saveEdit(created.id, {
      document: buildDocument(),
    });

    expect(edited?.title).toBe('Keep me');
  });

  it('duplicates designs under a new id', async () => {
    const created = await repo.create('Poster', buildDocument([buildRect()]));

    const copy = await repo.duplicate(created.id);

    expect(copy).toMatchObject({
      id: 'design-2',
      title: 'Poster (copy)',
      version: 0,
    });
    await expect(repo.duplicate('missing')).resolves.toBeUndefined();
  });

  it('hard-deletes designs that were never synced', async () => {
    const created = await repo.create('A', buildDocument());

    await repo.remove(created.id);

    await expect(repo.get(created.id)).resolves.toBeUndefined();
  });

  it('tombstones synced designs until the deletion is pushed', async () => {
    const created = await repo.create('A', buildDocument());
    await repo.markSynced(created.id, 3, created.updatedAt);

    await repo.remove(created.id);

    await expect(repo.get(created.id)).resolves.toMatchObject({
      deleted: 1,
      dirty: 1,
    });
    await expect(repo.list()).resolves.toEqual([]);
    await expect(
      repo.saveEdit(created.id, { title: 'x' }),
    ).resolves.toBeUndefined();
    await repo.remove('missing');
  });

  it('clears dirty only when no edit happened during the push', async () => {
    const created = await repo.create('A', buildDocument());
    const pushedAt = created.updatedAt;
    await repo.saveEdit(created.id, { title: 'Edited mid-push' });

    await repo.markSynced(created.id, 1, pushedAt);
    expect(await repo.get(created.id)).toMatchObject({ version: 1, dirty: 1 });

    const current = await repo.get(created.id);
    await repo.markSynced(created.id, 2, current!.updatedAt);
    expect(await repo.get(created.id)).toMatchObject({ version: 2, dirty: 0 });
    await repo.markSynced('missing', 1, 0);
  });

  it('lists dirty records and stores remote copies as clean', async () => {
    await repo.create('Local', buildDocument());
    await repo.putFromRemote({
      id: 'remote-1',
      title: 'Remote',
      document: buildDocument(),
      version: 4,
      createdAt: 1,
      updatedAt: 2,
    });

    const dirty = await repo.listDirty();

    expect(dirty.map((record) => record.title)).toEqual(['Local']);
    await expect(repo.get('remote-1')).resolves.toMatchObject({
      dirty: 0,
      version: 4,
    });
    await repo.hardDelete('remote-1');
    await expect(repo.get('remote-1')).resolves.toBeUndefined();
  });

  it('stores metadata', async () => {
    await expect(repo.getMeta('cursor')).resolves.toBeUndefined();

    await repo.setMeta('cursor', 'abc');

    await expect(repo.getMeta('cursor')).resolves.toBe('abc');
  });
});

describe('normaliseTitle', () => {
  it('trims, truncates and defaults empty titles', () => {
    expect(normaliseTitle('   ')).toBe('Untitled design');
    expect(normaliseTitle('x'.repeat(200))).toHaveLength(120);
  });
});
