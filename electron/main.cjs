'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

let mainWindow = null;
let backendProcess = null;
let quitting = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function getStablePort() {
  const filePath = path.join(app.getPath('userData'), 'desktop-server-port.json');
  let savedPort = 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Number.isInteger(parsed.port) && parsed.port >= 1024 && parsed.port <= 65535) savedPort = parsed.port;
  } catch (_) { /* first launch */ }

  let port = savedPort && await canBindPort(savedPort) ? savedPort : 0;
  if (!port) port = await findFreePort();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ port }), 'utf8');
  return port;
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    try { backendProcess.kill(); } catch (_) { /* best-effort shutdown */ }
  }
  backendProcess = null;
}

async function startBackend() {
  const stablePort = await getStablePort();
  return new Promise((resolve, reject) => {
    const appRoot = app.getAppPath();
    const tsxCli = path.join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const serverEntry = path.join(appRoot, 'server.ts');
    const dataDirectory = path.join(app.getPath('userData'), 'data');

    backendProcess = spawn(process.execPath, [tsxCli, serverEntry], {
      cwd: appRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(stablePort),
        AS_RADAR_LOCAL_ONLY: 'true',
        AS_RADAR_DATA_DIR: dataDirectory
      }
    });

    let settled = false;
    let output = '';
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('The local research engine did not start within 30 seconds. Check the installation and restart the app.'));
      }
    }, 30000);

    const onText = (chunk) => {
      const text = String(chunk);
      output += text;
      if (output.length > 12000) output = output.slice(-12000);
      const match = output.match(/AS-Radar-X server running on http:\/\/(?:127\.0\.0\.1|0\.0\.0\.0):(\d+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    };

    backendProcess.stdout.on('data', onText);
    backendProcess.stderr.on('data', (chunk) => {
      const text = String(chunk);
      console.error('[AS-Radar-X engine]', text);
      onText(chunk);
    });
    backendProcess.once('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
    backendProcess.once('exit', (code) => {
      if (!settled && !quitting) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`The local research engine exited before startup (code ${code}). ${output.slice(-1500)}`));
      }
    });
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0a0d14',
    title: 'AS-Radar-X',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Keep the app self-contained; do not allow arbitrary sites to open inside the app.
    if (url.startsWith('https://')) {
      const { shell } = require('electron');
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    if (!hasSingleInstanceLock) return;
    const port = await startBackend();
    createWindow(port);
  } catch (error) {
    console.error(error);
    dialog.showErrorBox(
      'AS-Radar-X could not start',
      `${error && error.message ? error.message : String(error)}\n\nTry reinstalling the app. Your saved local reports and settings are kept in your Windows user-data folder.`
    );
    stopBackend();
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !backendProcess) {
      app.relaunch();
      app.exit(0);
    }
  });
});

app.on('before-quit', () => {
  quitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
