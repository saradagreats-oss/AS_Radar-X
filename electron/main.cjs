'use strict';

const { app, BrowserWindow, dialog, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

let mainWindow = null;
let backendProcess = null;
let quitting = false;
let desktopProxyAuth = null;

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

async function applyChromiumProxy(config) {
  desktopProxyAuth = config && config.enabled && config.username
    ? { username: String(config.username), password: String(config.password || '') }
    : null;
  if (config && config.enabled && config.host && Number(config.port) > 0) {
    const scheme = config.protocol === 'socks5' ? 'socks5' : 'http';
    await session.defaultSession.setProxy({
      proxyRules: `${scheme}://${config.host}:${Number(config.port)}`,
      proxyBypassRules: '127.0.0.1;localhost;[::1]'
    });
  } else {
    await session.defaultSession.setProxy({ mode: 'direct' });
  }
}

app.on('login', (event, _webContents, _details, authInfo, callback) => {
  if (authInfo && authInfo.isProxy && desktopProxyAuth) {
    event.preventDefault();
    callback(desktopProxyAuth.username, desktopProxyAuth.password);
  }
});

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
      // app.getAppPath() is app.asar in packaged builds, not a real OS directory.
      cwd: process.resourcesPath,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
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
    let proxyApplyPromise = Promise.resolve();
    backendProcess.on('message', (message) => {
      if (message && message.type === 'as-radar-proxy-config') {
        proxyApplyPromise = applyChromiumProxy(message.config).catch((error) => {
          console.error('[AS-Radar-X proxy]', error);
        });
      }
    });
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
        proxyApplyPromise.then(() => resolve(Number(match[1]))).catch(reject);
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
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

  const splashHtml = `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>AS-Radar-X</title>
      <style>
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; }
        body { display: grid; place-items: center; background: #0a0d14; color: #f0f4f8; font: 14px "Segoe UI", sans-serif; }
        main { width: min(92vw, 440px); padding: 28px 24px; text-align: center; }
        .icon { display: grid; place-items: center; width: 62px; height: 62px; margin: 0 auto 20px; border-radius: 15px; background: #542f19; color: #ffca42; font-size: 28px; font-weight: 800; }
        h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: 1px; }
        p { color: #8a99ad; line-height: 1.55; }
        .spinner { width: 24px; height: 24px; margin: 24px auto 0; border: 3px solid #232d3f; border-top-color: #ffb800; border-radius: 50%; animation: spin .8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
      </style>
    </head>
    <body>
      <main><div class="icon">◎</div><h1>AS-RADAR-X</h1><p>Starting your local research engine…<br />Your saved reports and settings are kept on this device.</p><div class="spinner" role="progressbar" aria-label="Loading"></div></main>
    </body>
  </html>`;
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    if (!hasSingleInstanceLock) return;
    createWindow();
    const port = await startBackend();
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(`http://127.0.0.1:${port}`);
    }
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
