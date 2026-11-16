import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ExportDeps } from '@main/fileExport';
import { createTrustedUrlCheck, registerIpcHandlers } from '@main/ipcHandlers';
import { decideNavigation } from '@main/navigationPolicy';
import { SecureStore } from '@main/secureStore';
import { createLogger } from '@shared/logger';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  ShareMenu,
} from 'electron';

const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const rendererFile = join(__dirname, '../renderer/index.html');
const isTrustedUrl = createTrustedUrlCheck(
  pathToFileURL(rendererFile).href,
  devServerUrl,
);

const logger = createLogger({
  service: 'canvas-studio-main',
  minLevel: app.isPackaged ? 'info' : 'debug',
  baseContext: {
    version: app.getVersion(),
    env: app.isPackaged ? 'prod' : 'dev',
  },
});

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Canvas Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  const handleUrl = (url: string): boolean => {
    const decision = decideNavigation(url, isTrustedUrl);
    if (decision === 'open-external') {
      void shell.openExternal(url);
    }
    if (decision !== 'allow') {
      logger.warn('navigation.blocked', { url, decision });
    }
    return decision === 'allow';
  };

  window.webContents.setWindowOpenHandler(({ url }) => {
    handleUrl(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!handleUrl(url)) {
      event.preventDefault();
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error('renderer.crashed', { reason: details.reason });
  });

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(rendererFile);
  }
  return window;
}

function buildExportDeps(): ExportDeps {
  const isMac = process.platform === 'darwin';
  return {
    showSaveDialog: (options) =>
      mainWindow
        ? dialog.showSaveDialog(mainWindow, options)
        : dialog.showSaveDialog(options),
    writeFile: (path, data) => writeFile(path, data),
    mkdtemp: (prefix) => mkdtemp(prefix),
    tempDir: tmpdir(),
    documentsDir: app.getPath('documents'),
    shareFiles: isMac
      ? (filePaths) => {
          const menu = new ShareMenu({ filePaths });
          menu.popup(mainWindow ? { window: mainWindow } : {});
        }
      : undefined,
    revealFile: (filePath) => {
      shell.showItemInFolder(filePath);
    },
  };
}

process.on('uncaughtException', (error) => {
  logger.error('process.uncaught_exception', { error });
});
process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandled_rejection', { reason: String(reason) });
});

void app.whenReady().then(() => {
  const secureStore = new SecureStore(
    join(app.getPath('userData'), 'secure-store.json'),
    safeStorage,
    { readFile, writeFile },
  );

  registerIpcHandlers(ipcMain, {
    secureStore,
    exportDeps: buildExportDeps(),
    appInfo: {
      version: app.getVersion(),
      platform: process.platform,
      canShareNatively: process.platform === 'darwin',
    },
    logger,
    isTrustedUrl,
  });

  mainWindow = createWindow();
  logger.info('app.started');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
