import type { ExportDeps } from '@main/fileExport';
import {
  createTrustedUrlCheck,
  registerIpcHandlers,
  type InvokeEvent,
  type InvokeHandler,
} from '@main/ipcHandlers';
import type { SecureStore } from '@main/secureStore';
import { IpcChannel } from '@shared/ipc';
import { createLogger } from '@shared/logger';

const TRUSTED: InvokeEvent = { senderFrame: { url: 'file:///app/index.html' } };
const UNTRUSTED: InvokeEvent = { senderFrame: { url: 'https://evil.test/' } };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0]);

function setup() {
  const handlers = new Map<string, InvokeHandler>();
  const secureStore = {
    getItem: vi.fn(() => Promise.resolve('value')),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  } as unknown as SecureStore;
  const exportDeps: ExportDeps = {
    showSaveDialog: () =>
      Promise.resolve({ canceled: false, filePath: '/d/x.png' }),
    writeFile: () => Promise.resolve(),
    mkdtemp: (prefix) => Promise.resolve(`${prefix}1`),
    tempDir: '/t',
    documentsDir: '/d',
    revealFile: vi.fn(),
  };
  const lines: string[] = [];
  registerIpcHandlers(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    {
      secureStore,
      exportDeps,
      appInfo: { version: '1.0.0', platform: 'darwin', canShareNatively: true },
      logger: createLogger({
        service: 'test',
        sink: (_level, line) => lines.push(line),
      }),
      isTrustedUrl: createTrustedUrlCheck('file:///app/index.html', undefined),
    },
  );
  const invoke = (channel: string, event: InvokeEvent, ...args: unknown[]) => {
    const handler = handlers.get(channel);
    if (!handler) {
      throw new Error(`no handler for ${channel}`);
    }
    return handler(event, ...args);
  };
  return { invoke, secureStore, lines };
}

describe('createTrustedUrlCheck', () => {
  it('accepts the packaged renderer and the dev server only', () => {
    const check = createTrustedUrlCheck(
      'file:///app/index.html',
      'http://localhost:5173',
    );

    expect(check('file:///app/index.html#/editor')).toBe(true);
    expect(check('http://localhost:5173/')).toBe(true);
    expect(check('file:///other/index.html')).toBe(false);
    expect(check('https://example.com')).toBe(false);
  });
});

describe('registerIpcHandlers', () => {
  it('rejects calls from untrusted frames and logs them', async () => {
    const { invoke, lines } = setup();

    await expect(
      invoke(IpcChannel.secureStoreGet, UNTRUSTED, 'k'),
    ).rejects.toThrow('Untrusted IPC sender');
    expect(lines.join()).toContain('ipc.rejected_untrusted_sender');
  });

  it('rejects calls with no sender frame', async () => {
    const { invoke } = setup();

    await expect(
      invoke(IpcChannel.appInfo, { senderFrame: null }),
    ).rejects.toThrow();
  });

  it('routes secure-store calls after validating arguments', async () => {
    const { invoke, secureStore } = setup();

    await expect(invoke(IpcChannel.secureStoreGet, TRUSTED, 'k')).resolves.toBe(
      'value',
    );
    await invoke(IpcChannel.secureStoreSet, TRUSTED, 'k', 'v');
    await invoke(IpcChannel.secureStoreRemove, TRUSTED, 'k');

    expect(secureStore.setItem).toHaveBeenCalledWith('k', 'v');
    expect(secureStore.removeItem).toHaveBeenCalledWith('k');
    await expect(
      invoke(IpcChannel.secureStoreSet, TRUSTED, 'k', 42),
    ).rejects.toThrow();
  });

  it('saves and shares validated exports', async () => {
    const { invoke } = setup();
    const request = { suggestedName: 'x', format: 'png', data: PNG };

    await expect(
      invoke(IpcChannel.fileSave, TRUSTED, request),
    ).resolves.toEqual({ status: 'saved', filePath: '/d/x.png' });
    await expect(
      invoke(IpcChannel.fileShare, TRUSTED, request),
    ).resolves.toMatchObject({ status: 'revealed' });
  });

  it('logs and rethrows handler failures', async () => {
    const { invoke, lines } = setup();

    await expect(
      invoke(IpcChannel.fileSave, TRUSTED, { format: 'png' }),
    ).rejects.toThrow();
    expect(lines.join()).toContain('ipc.handler_failed');
  });

  it('returns app info', async () => {
    const { invoke } = setup();

    await expect(invoke(IpcChannel.appInfo, TRUSTED)).resolves.toMatchObject({
      version: '1.0.0',
    });
  });
});
