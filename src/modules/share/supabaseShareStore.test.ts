import {
  SupabaseShareStore,
  fetchSharedDesign,
  shareImageUrl,
} from '@/modules/share/supabaseShareStore';
import type { SupabaseClient } from '@supabase/supabase-js';

const ROW = {
  id: '5aaaaaaa-0000-4000-8000-000000000001',
  title: 'Party',
  width: 1080,
  height: 1350,
  updated_at: '2026-11-16T10:00:00Z',
};

type Result = { data: unknown; error: { message: string } | null };

/**
 * Fake Supabase client: each table call resolves with the next queued
 * result and records the chain of builder calls.
 */
function fakeClient(
  results: Result[],
  storage: Partial<Record<string, unknown>> = {},
) {
  const calls: string[][] = [];
  const from = vi.fn(() => {
    const chain: string[] = [];
    calls.push(chain);
    const builder: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'upsert', 'delete']) {
      builder[name] = (...args: unknown[]) => {
        chain.push(`${name}:${JSON.stringify(args)}`);
        return builder;
      };
    }
    const next = () =>
      Promise.resolve(results.shift() ?? { data: null, error: null });
    builder.maybeSingle = next;
    builder.single = next;
    builder.then = (resolve: (r: Result) => unknown) => next().then(resolve);
    return builder;
  });
  const bucket = {
    upload: vi.fn(() => Promise.resolve({ error: null })),
    remove: vi.fn(() => Promise.resolve({ error: null })),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://cdn.test/design-shares/${path}` },
    })),
    ...storage,
  };
  const client = {
    from,
    storage: { from: vi.fn(() => bucket) },
    rpc: vi.fn(),
  };
  return {
    client: client as unknown as SupabaseClient & typeof client,
    bucket,
    calls,
  };
}

const INPUT = {
  designId: 'design-1',
  title: 'Party',
  width: 1080,
  height: 1350,
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
};

describe('SupabaseShareStore', () => {
  it('loads the share for a design', async () => {
    const { client, calls } = fakeClient([{ data: ROW, error: null }]);

    await expect(
      new SupabaseShareStore(client).getForDesign('design-1'),
    ).resolves.toEqual({
      id: ROW.id,
      title: 'Party',
      width: 1080,
      height: 1350,
      updatedAt: ROW.updated_at,
    });
    expect(calls[0]).toContain('eq:["design_id","design-1"]');
  });

  it('returns null for unshared designs and throws on errors', async () => {
    const none = fakeClient([{ data: null, error: null }]);
    const broken = fakeClient([{ data: null, error: { message: 'rls' } }]);

    await expect(
      new SupabaseShareStore(none.client).getForDesign('d'),
    ).resolves.toBeNull();
    await expect(
      new SupabaseShareStore(broken.client).getForDesign('d'),
    ).rejects.toThrow('load share failed: rls');
  });

  it('upserts the share row, then uploads the image under its id', async () => {
    const { client, bucket, calls } = fakeClient([
      { data: null, error: null },
      { data: ROW, error: null },
    ]);

    const share = await new SupabaseShareStore(client).publish(INPUT);

    expect(share.id).toBe(ROW.id);
    expect(calls[1]?.[0]).toContain('"design_id":"design-1"');
    expect(calls[1]?.[0]).toContain('"onConflict":"design_id"');
    expect(client.storage.from).toHaveBeenCalledWith('design-shares');
    expect(bucket.upload).toHaveBeenCalledWith(
      `${ROW.id}.png`,
      expect.any(Blob),
      { contentType: 'image/png', upsert: true, cacheControl: '60' },
    );
  });

  it('removes a brand-new link if its image fails to upload', async () => {
    const { client, calls } = fakeClient(
      [
        { data: null, error: null },
        { data: ROW, error: null },
        { data: null, error: null },
      ],
      { upload: () => Promise.resolve({ error: { message: 'too big' } }) },
    );

    await expect(new SupabaseShareStore(client).publish(INPUT)).rejects.toThrow(
      'upload share image failed: too big',
    );
    expect(calls[2]).toEqual(['delete:[]', `eq:["id","${ROW.id}"]`]);
  });

  it('keeps an existing link when refreshing its image fails', async () => {
    const { client, calls } = fakeClient(
      [
        { data: ROW, error: null },
        { data: ROW, error: null },
      ],
      { upload: () => Promise.resolve({ error: { message: 'offline' } }) },
    );

    await expect(new SupabaseShareStore(client).publish(INPUT)).rejects.toThrow(
      'offline',
    );
    expect(calls).toHaveLength(2);
  });

  it('fails when the share row cannot be written', async () => {
    const { client, bucket } = fakeClient([
      { data: null, error: null },
      { data: null, error: { message: 'not your design' } },
    ]);

    await expect(new SupabaseShareStore(client).publish(INPUT)).rejects.toThrow(
      'create share failed: not your design',
    );
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('unpublishes by deleting the image, then the link', async () => {
    const { client, bucket, calls } = fakeClient([
      { data: ROW, error: null },
      { data: null, error: null },
    ]);

    await new SupabaseShareStore(client).unpublish('design-1');

    expect(bucket.remove).toHaveBeenCalledWith([`${ROW.id}.png`]);
    expect(calls[1]).toEqual(['delete:[]', `eq:["id","${ROW.id}"]`]);
  });

  it('keeps the link when its image cannot be deleted, so it can retry', async () => {
    const { client, calls } = fakeClient([{ data: ROW, error: null }], {
      remove: () => Promise.resolve({ error: { message: 'denied' } }),
    });

    await expect(
      new SupabaseShareStore(client).unpublish('design-1'),
    ).rejects.toThrow('delete share image failed');
    expect(calls).toHaveLength(1);
  });

  it('treats unpublishing an unshared design as done', async () => {
    const { client, bucket } = fakeClient([{ data: null, error: null }]);

    await new SupabaseShareStore(client).unpublish('design-1');

    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('reports a failure to delete the link row', async () => {
    const { client } = fakeClient([
      { data: ROW, error: null },
      { data: null, error: { message: 'boom' } },
    ]);

    await expect(
      new SupabaseShareStore(client).unpublish('design-1'),
    ).rejects.toThrow('delete share failed: boom');
  });
});

describe('fetchSharedDesign', () => {
  it('loads a public share with a cache-busted image URL', async () => {
    const { client } = fakeClient([]);
    client.rpc.mockResolvedValueOnce({ data: [ROW], error: null });

    const view = await fetchSharedDesign(client, ROW.id);

    expect(client.rpc).toHaveBeenCalledWith('get_shared_design', {
      share_id: ROW.id,
    });
    expect(view).toMatchObject({ title: 'Party', width: 1080 });
    expect(view?.imageUrl).toBe(
      `https://cdn.test/design-shares/${ROW.id}.png?v=2026-11-16T10%3A00%3A00Z`,
    );
  });

  it('returns null for unknown links and throws on server errors', async () => {
    const { client } = fakeClient([]);
    client.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'down' } });

    await expect(fetchSharedDesign(client, ROW.id)).resolves.toBeNull();
    await expect(fetchSharedDesign(client, ROW.id)).rejects.toThrow(
      'load shared design failed: down',
    );
  });

  it('rejects malformed server responses', async () => {
    const { client } = fakeClient([]);
    client.rpc.mockResolvedValueOnce({
      data: [{ ...ROW, id: 'not-a-uuid' }],
      error: null,
    });

    await expect(fetchSharedDesign(client, ROW.id)).rejects.toThrow();
  });
});

describe('shareImageUrl', () => {
  it('uses the public URL of "<id>.png"', () => {
    const { client, bucket } = fakeClient([]);

    shareImageUrl(client, { id: 'abc', updatedAt: 't' });

    expect(bucket.getPublicUrl).toHaveBeenCalledWith('abc.png');
  });
});
