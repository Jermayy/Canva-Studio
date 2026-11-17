import { browserConnectivity, createWorkspace } from '@/app/workspace';
import {
  GUEST_WORKSPACE_ID,
  openWorkspaceDb,
} from '@/modules/designs/data/localDb';
import { FakeRemoteStore } from '@/test/fakeRemoteStore';
import { createLogger } from '@/shared/logger';

const logger = createLogger({ service: 't', sink: () => {} });

function env(online = true) {
  const opened: string[] = [];
  const stopOnline = vi.fn();
  let onlineCallback: () => void = () => {};
  return {
    opened,
    stopOnline,
    fireOnline: () => {
      onlineCallback();
    },
    env: {
      logger,
      isOnline: () => online,
      onOnline: (callback: () => void) => {
        onlineCallback = callback;
        return stopOnline;
      },
      openDb: (id: string) => {
        opened.push(id);
        return openWorkspaceDb(`${id}-${crypto.randomUUID()}`);
      },
    },
  };
}

describe('createWorkspace', () => {
  it('gives the guest a local-only workspace', () => {
    const setup = env();

    const workspace = createWorkspace({ kind: 'guest' }, setup.env);

    expect(workspace).toMatchObject({
      id: GUEST_WORKSPACE_ID,
      kind: 'guest',
      sync: null,
    });
    expect(setup.opened).toEqual([GUEST_WORKSPACE_ID]);
    workspace.dispose();
  });

  it('gives each cloud user their own database and a running sync', () => {
    const setup = env(false);
    const remote = new FakeRemoteStore();

    const workspace = createWorkspace(
      { kind: 'cloud', user: { id: 'user-1', email: 'a@b.co' }, remote },
      setup.env,
    );
    const requestSync = vi.spyOn(workspace.sync!, 'requestSync');
    setup.fireOnline();

    expect(setup.opened).toEqual(['user-1']);
    expect(workspace).toMatchObject({ kind: 'cloud', email: 'a@b.co' });
    expect(requestSync).toHaveBeenCalledWith(0);

    workspace.dispose();
    expect(setup.stopOnline).toHaveBeenCalled();
    expect(remote.unsubscribed).toBe(true);
  });
});

describe('browserConnectivity', () => {
  it('reads navigator.onLine and listens for online events', () => {
    const callback = vi.fn();

    const stop = browserConnectivity.onOnline(callback);
    window.dispatchEvent(new Event('online'));
    stop();
    window.dispatchEvent(new Event('online'));

    expect(callback).toHaveBeenCalledOnce();
    expect(typeof browserConnectivity.isOnline()).toBe('boolean');
  });
});
