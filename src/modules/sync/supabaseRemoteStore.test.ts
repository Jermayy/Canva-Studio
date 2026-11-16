import {
  SupabaseRemoteStore,
  rowToRemote,
} from '@/modules/sync/supabaseRemoteStore';
import type { SupabaseClient } from '@supabase/supabase-js';

interface QueryResult {
  data: unknown;
  error: {
    message: string;
    code?: string;
    status?: number;
    statusCode?: string;
  } | null;
}

/** Chainable stand-in for the PostgREST query builder that records calls. */
function fakeQuery(result: QueryResult) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  const chain =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    };
  for (const name of [
    'select',
    'insert',
    'update',
    'eq',
    'gte',
    'or',
    'order',
    'limit',
  ]) {
    builder[name] = chain(name);
  }
  builder.single = chain('single');
  builder.maybeSingle = chain('maybeSingle');
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return { builder, calls };
}

const ROW = {
  id: 'd1',
  title: 'T',
  document: { a: 1 },
  version: 2,
  client_updated_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

const WRITE = {
  id: 'd1',
  title: 'T',
  document: {},
  clientUpdatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
};

function setup(result: QueryResult) {
  const query = fakeQuery(result);
  const bucket = {
    upload: vi.fn(() => Promise.resolve({ error: result.error })),
    download: vi.fn(() =>
      Promise.resolve({
        data: result.error
          ? null
          : new Blob([new Uint8Array([1, 2])], { type: 'image/png' }),
        error: result.error,
      }),
    ),
  };
  const channel: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  } = {
    on: vi.fn(() => channel),
    // Real channels return themselves from subscribe().
    subscribe: vi.fn(() => channel),
  };
  const client = {
    from: vi.fn(() => query.builder),
    storage: { from: vi.fn(() => bucket) },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve()),
  };
  const store = new SupabaseRemoteStore(
    client as unknown as SupabaseClient,
    'user-1',
  );
  return { store, client, calls: query.calls, bucket, channel };
}

describe('rowToRemote', () => {
  it('maps snake_case columns', () => {
    expect(rowToRemote(ROW)).toEqual({
      id: 'd1',
      title: 'T',
      document: { a: 1 },
      version: 2,
      clientUpdatedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      deletedAt: null,
    });
  });
});

describe('SupabaseRemoteStore queries', () => {
  it('fetches all rows ordered by keyset without a cursor', async () => {
    const { store, calls } = setup({ data: [ROW], error: null });

    const rows = await store.fetchChangedSince(null, 50);

    expect(rows).toHaveLength(1);
    expect(calls.map(([name]) => name)).toEqual([
      'select',
      'order',
      'order',
      'limit',
    ]);
  });

  it('uses a keyset filter for a precise cursor and gte for a rewound one', async () => {
    const precise = setup({ data: [], error: null });
    await precise.store.fetchChangedSince(
      { updatedAt: '2026-01-01T00:00:00+00:00', id: 'd1' },
      10,
    );
    expect(precise.calls).toContainEqual([
      'or',
      [
        'updated_at.gt."2026-01-01T00:00:00+00:00",and(updated_at.eq."2026-01-01T00:00:00+00:00",id.gt."d1")',
      ],
    ]);

    const rewound = setup({ data: [], error: null });
    await rewound.store.fetchChangedSince(
      { updatedAt: '2026-01-01T00:00:00.000Z', id: '' },
      10,
    );
    expect(rewound.calls).toContainEqual([
      'gte',
      ['updated_at', '2026-01-01T00:00:00.000Z'],
    ]);
  });

  it('rejects malformed rows from the server', async () => {
    const { store } = setup({ data: [{ id: 1 }], error: null });

    await expect(store.fetchChangedSince(null, 10)).rejects.toThrow();
  });

  it('surfaces query errors', async () => {
    const { store } = setup({ data: null, error: { message: 'boom' } });

    await expect(store.fetchChangedSince(null, 10)).rejects.toThrow(
      'fetch designs failed: boom',
    );
    await expect(store.fetchById('d1')).rejects.toThrow('fetch design failed');
    await expect(store.update(WRITE, 1)).rejects.toThrow(
      'update design failed',
    );
    await expect(store.insert(WRITE)).rejects.toThrow('insert design failed');
  });

  it('fetches by id, returning null when absent', async () => {
    await expect(
      setup({ data: ROW, error: null }).store.fetchById('d1'),
    ).resolves.toMatchObject({ id: 'd1' });
    await expect(
      setup({ data: null, error: null }).store.fetchById('d1'),
    ).resolves.toBeNull();
  });

  it('inserts version 1 and maps duplicate ids to null', async () => {
    const ok = setup({ data: ROW, error: null });
    await expect(ok.store.insert(WRITE)).resolves.toMatchObject({ id: 'd1' });
    expect(ok.calls[0]).toEqual([
      'insert',
      [
        expect.objectContaining({
          version: 1,
          client_updated_at: WRITE.clientUpdatedAt,
        }),
      ],
    ]);

    const duplicate = setup({
      data: null,
      error: { message: 'dup', code: '23505' },
    });
    await expect(duplicate.store.insert(WRITE)).resolves.toBeNull();
  });

  it('updates with an optimistic version check', async () => {
    const { store, calls } = setup({ data: ROW, error: null });

    await store.update(WRITE, 4);

    expect(calls).toContainEqual([
      'update',
      [expect.objectContaining({ version: 5 })],
    ]);
    expect(calls).toContainEqual(['eq', ['version', 4]]);
    await expect(
      setup({ data: null, error: null }).store.update(WRITE, 4),
    ).resolves.toBeNull();
  });
});

describe('SupabaseRemoteStore assets', () => {
  it('uploads under the user folder and treats duplicates as success', async () => {
    const ok = setup({ data: null, error: null });
    await ok.store.uploadAsset('abc', new ArrayBuffer(1), 'image/png');
    expect(ok.bucket.upload).toHaveBeenCalledWith(
      'user-1/abc',
      expect.any(ArrayBuffer),
      {
        contentType: 'image/png',
        upsert: false,
      },
    );

    const duplicate = setup({
      data: null,
      error: { message: 'exists', status: 409 },
    });
    await expect(
      duplicate.store.uploadAsset('abc', new ArrayBuffer(1), 'image/png'),
    ).resolves.toBeUndefined();

    const failure = setup({
      data: null,
      error: { message: 'denied', status: 403 },
    });
    await expect(
      failure.store.uploadAsset('abc', new ArrayBuffer(1), 'image/png'),
    ).rejects.toThrow('denied');
  });

  it('downloads assets and maps 404 to null', async () => {
    const ok = setup({ data: null, error: null });
    await expect(ok.store.downloadAsset('abc')).resolves.toMatchObject({
      mime: 'image/png',
    });

    const missing = setup({
      data: null,
      error: { message: 'nf', status: 404 },
    });
    await expect(missing.store.downloadAsset('abc')).resolves.toBeNull();

    const failure = setup({ data: null, error: { message: 'x', status: 500 } });
    await expect(failure.store.downloadAsset('abc')).rejects.toThrow(
      'download asset failed',
    );
  });
});

describe('SupabaseRemoteStore realtime', () => {
  it('subscribes to the user rows and reports connection status', () => {
    const { store, client, channel } = setup({ data: null, error: null });
    const onChange = vi.fn();
    const onStatus = vi.fn();

    const unsubscribe = store.subscribe(onChange, onStatus);
    const [, filter, handler] = channel.on.mock.calls[0] as unknown as [
      string,
      { filter: string },
      () => void,
    ];
    const statusCallback = (
      channel.subscribe.mock.calls[0] as unknown as [(s: string) => void]
    )[0];
    handler();
    statusCallback('SUBSCRIBED');
    statusCallback('CHANNEL_ERROR');
    unsubscribe();

    expect(filter.filter).toBe('user_id=eq.user-1');
    expect(onChange).toHaveBeenCalledOnce();
    expect(onStatus.mock.calls).toEqual([['connected'], ['disconnected']]);
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});

describe('SupabaseRemoteStore.deleteAllFiles', () => {
  function withListing(
    pages: { name: string }[][],
    removeError = null,
    shares: { id: string }[] = [],
  ) {
    const { store, bucket, client } = setup({ data: shares, error: null });
    const list = vi.fn(() =>
      Promise.resolve({ data: pages.shift() ?? [], error: null }),
    );
    const remove = vi.fn(() => Promise.resolve({ error: removeError }));
    Object.assign(bucket, { list, remove });
    return { store, list, remove, client };
  }

  it('lists and removes the user folder page by page until empty', async () => {
    const { store, list, remove } = withListing([
      [{ name: 'a.png' }, { name: 'b.png' }],
      [{ name: 'c.png' }],
    ]);

    await expect(store.deleteAllFiles()).resolves.toBe(3);
    expect(list).toHaveBeenCalledWith('user-1', { limit: 100 });
    expect(remove).toHaveBeenNthCalledWith(1, ['user-1/a.png', 'user-1/b.png']);
    expect(remove).toHaveBeenNthCalledWith(2, ['user-1/c.png']);
  });

  it('also deletes share images, which are named by share id', async () => {
    const { store, remove, client } = withListing([], null, [
      { id: 'share-1' },
    ]);

    await expect(store.deleteAllFiles()).resolves.toBe(1);
    expect(client.from).toHaveBeenCalledWith('design_shares');
    expect(client.storage.from).toHaveBeenCalledWith('design-shares');
    expect(remove).toHaveBeenCalledWith(['share-1.png']);
  });

  it('fails loudly when share images cannot be listed or removed', async () => {
    const listing = setup({ data: null, error: { message: 'rls' } });
    Object.assign(listing.bucket, {
      list: () => Promise.resolve({ data: [], error: null }),
    });
    const removing = withListing([], { message: 'gone' } as never, [
      { id: 's' },
    ]);

    await expect(listing.store.deleteAllFiles()).rejects.toThrow(
      'list shares failed: rls',
    );
    await expect(removing.store.deleteAllFiles()).rejects.toThrow(
      'delete share images failed: gone',
    );
  });

  it('succeeds with nothing to delete', async () => {
    const { store, remove } = withListing([]);

    await expect(store.deleteAllFiles()).resolves.toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it('fails loudly on list or remove errors', async () => {
    const failingList = setup({ data: null, error: null });
    Object.assign(failingList.bucket, {
      list: () => Promise.resolve({ data: null, error: { message: 'denied' } }),
    });
    const failingRemove = withListing([[{ name: 'a.png' }]], {
      message: 'nope',
    } as never);

    await expect(failingList.store.deleteAllFiles()).rejects.toThrow(
      'list files failed: denied',
    );
    await expect(failingRemove.store.deleteAllFiles()).rejects.toThrow(
      'delete files failed: nope',
    );
  });

  it('gives up instead of looping forever if files never disappear', async () => {
    const { store, bucket } = setup({ data: null, error: null });
    Object.assign(bucket, {
      list: () =>
        Promise.resolve({ data: [{ name: 'stuck.png' }], error: null }),
      remove: () => Promise.resolve({ error: null }),
    });

    await expect(store.deleteAllFiles()).rejects.toThrow('never emptied');
  });
});
