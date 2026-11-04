'use strict';

const { app, BrowserWindow, WebContentsView, dialog, session, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

let mainWindow = null;
let backendProcess = null;
let quitting = false;
let desktopProxyAuth = null;
let researchBrowser = null;
let browserVisible = false;
let browserTakeover = false;
const researchSession = session.fromPartition('persist:as-radar-research');

function sendBrowserEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('as-radar:browser-event', payload);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function attachResearchBrowser() {
  if (!mainWindow || mainWindow.isDestroyed() || researchBrowser) return;
  researchBrowser = new WebContentsView({
    webPreferences: {
      session: researchSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: true,
      webSecurity: true
    }
  });
  mainWindow.contentView.addChildView(researchBrowser);
  researchBrowser.setVisible(false);
  researchBrowser.webContents.setWindowOpenHandler(({ url }) => {
    const safe = safeHttpUrl(url);
    if (safe) require('electron').shell.openExternal(safe);
    return { action: 'deny' };
  });
  researchBrowser.webContents.on('will-navigate', (event, url) => {
    if (!safeHttpUrl(url)) event.preventDefault();
  });
  const notify = () => sendBrowserEvent({ type: 'navigation', url: researchBrowser.webContents.getURL(), title: researchBrowser.webContents.getTitle(), loading: researchBrowser.webContents.isLoading() });
  researchBrowser.webContents.on('did-navigate', notify);
  researchBrowser.webContents.on('did-navigate-in-page', notify);
  researchBrowser.webContents.on('did-start-loading', notify);
  researchBrowser.webContents.on('did-stop-loading', notify);
  researchBrowser.webContents.on('page-title-updated', notify);
  researchBrowser.webContents.on('render-process-gone', (_event, details) => sendBrowserEvent({ type: 'error', message: 'Research browser renderer stopped.', details }));
  mainWindow.on('resize', updateResearchBrowserBounds);
  mainWindow.on('move', updateResearchBrowserBounds);
  mainWindow.on('maximize', updateResearchBrowserBounds);
  mainWindow.on('unmaximize', updateResearchBrowserBounds);
}

function updateResearchBrowserBounds(_event, bounds) {
  if (!researchBrowser || !mainWindow || mainWindow.isDestroyed()) return;
  const b = bounds && Number.isFinite(bounds.x) ? bounds : { x: 0, y: 0, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height };
  const width = Math.max(0, Math.min(10000, Math.round(b.width)));
  const height = Math.max(0, Math.min(10000, Math.round(b.height)));
  researchBrowser.setBounds({ x: Math.max(0, Math.round(b.x)), y: Math.max(0, Math.round(b.y)), width, height });
}

async function browserSnapshot() {
  if (!researchBrowser) throw new Error('Research browser is not initialized.');
  const snapshot = await researchBrowser.webContents.executeJavaScript(`(() => {
    const active = document.activeElement;
    const focusedPassword = !!active && (active.tagName === 'INPUT' && active.type === 'password' || active.isContentEditable && active.closest('form')?.querySelector('input[type=password]'));
    const text = (document.body?.innerText || '').slice(0, 30000);
    const headings = [...document.querySelectorAll('h1,h2,h3')].slice(0, 80).map(e => (e.innerText || '').trim()).filter(Boolean);
    const links = [...document.querySelectorAll('a[href]')].slice(0, 250).map(a => ({text:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,240),href:a.href})).filter(a => a.href && a.text);
    const images = [...document.images].slice(0, 160).map(i => ({src:i.currentSrc||i.src,alt:i.alt||'',width:i.naturalWidth||i.width||0,height:i.naturalHeight||i.height||0})).filter(i=>i.src);
    const tables = [...document.querySelectorAll('table')].slice(0,20).map(t=>[...t.querySelectorAll('tr')].slice(0,100).map(r=>(r.innerText||'').trim().slice(0,1000)));
    return {url:location.href,title:document.title,text,headings,links,images,tables,passwordFieldCount:document.querySelectorAll('input[type=password]').length,focusedPassword,verificationHint:/captcha|verify you are human|unusual traffic|security check|two-factor|two factor/i.test(text),capturedAt:new Date().toISOString()};
  })()`, true);
  let screenshotBase64;
  if (!snapshot.focusedPassword && browserVisible) {
    const image = await researchBrowser.webContents.capturePage();
    screenshotBase64 = image.toJPEG(65).toString('base64');
  }
  return { snapshot, screenshotBase64, screenshotMimeType: screenshotBase64 ? 'image/jpeg' : undefined, sensitive: !!snapshot.focusedPassword };
}

async function executeBrowserAction(action, args = {}) {
  if (!researchBrowser) throw new Error('Research browser is not initialized.');
  const wc = researchBrowser.webContents;
  switch (action) {
    case 'navigate': {
      const url = safeHttpUrl(args.url);
      if (!url) throw new Error('Only public HTTP/HTTPS navigation is allowed.');
      await wc.loadURL(url);
      return { url: wc.getURL(), title: wc.getTitle() };
    }
    case 'click': {
      const x = Math.max(0, Math.min(10000, Number(args.x)||0));
      const y = Math.max(0, Math.min(10000, Number(args.y)||0));
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      return { clicked: true, x, y };
    }
    case 'scroll': {
      const x = Math.max(0, Number(args.x)||400), y = Math.max(0, Number(args.y)||500);
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      wc.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: Number(args.deltaX)||0, deltaY: Math.max(-3000, Math.min(3000, Number(args.deltaY)||600)) });
      return { scrolled: true };
    }
    case 'keypress': {
      const key = String(args.key||'').toLowerCase();
      if (!['enter','tab','escape','arrowdown','arrowup','pagedown','pageup','home','end'].includes(key)) throw new Error('Key is not allowed.');
      const keyMap = {enter:'Return',tab:'Tab',escape:'Escape',arrowdown:'Down',arrowup:'Up',pagedown:'PageDown',pageup:'PageUp',home:'Home',end:'End'};
      wc.sendInputEvent({type:'keyDown',keyCode:keyMap[key]}); wc.sendInputEvent({type:'keyUp',keyCode:keyMap[key]});
      return { pressed: key };
    }
    case 'type': {
      const focused = await wc.executeJavaScript(`(() => { const e=document.activeElement; return !!e && (e.tagName==='INPUT' || e.tagName==='TEXTAREA' || e.isContentEditable) && !(e.tagName==='INPUT' && e.type==='password') && !e.closest('form')?.querySelector('input[type=password]'); })()`);
      if (!focused) throw new Error('Typing is blocked unless a non-password text field is focused. Login credentials must be entered manually by the user.');
      const value = String(args.text||'').slice(0,2000);
      wc.insertText(value);
      return { typedCharacters: value.length };
    }
    case 'back': await wc.goBack(); return { url: wc.getURL() };
    case 'forward': await wc.goForward(); return { url: wc.getURL() };
    case 'reload': await wc.reload(); return { url: wc.getURL() };
    case 'wait': await new Promise(resolve => setTimeout(resolve, Math.max(250, Math.min(5000, Number(args.ms)||1000)))); return { waited: true };
    case 'capture': return browserSnapshot();
    default: throw new Error('Unsupported browser action.');
  }
}

async function handleBrowserRequest(message) {
  const { requestId, method, args = {} } = message || {};
  if (!requestId || typeof requestId !== 'string') return;
  try {
    let result;
    if (method === 'show') {
      attachResearchBrowser();
      browserVisible = true;
      researchBrowser.setVisible(true);
      updateResearchBrowserBounds();
      const url = args.url ? safeHttpUrl(args.url) : null;
      if (url && url !== researchBrowser.webContents.getURL()) await researchBrowser.webContents.loadURL(url);
      result = { visible: true, url: researchBrowser.webContents.getURL(), title: researchBrowser.webContents.getTitle() };
    } else if (method === 'hide') {
      browserVisible = false;
      if (researchBrowser) researchBrowser.setVisible(false);
      result = { visible: false };
    } else if (method === 'takeover') {
      browserTakeover = !!args.enabled;
      result = { takeover: browserTakeover };
    } else if (method === 'status') {
      result = { available: !!researchBrowser, visible: browserVisible, takeover: browserTakeover, url: researchBrowser?.webContents.getURL() || '', title: researchBrowser?.webContents.getTitle() || '' };
    } else if (method === 'capture') {
      result = await browserSnapshot();
    } else if (method === 'action') {
      if (browserTakeover) throw new Error('Browser control is paused while the user has taken over.');
      result = await executeBrowserAction(args.action, args.args || {});
    } else throw new Error('Unknown browser bridge method.');
    if (backendProcess && !backendProcess.killed) backendProcess.send({ type: 'as-radar-browser-response', requestId, ok: true, result });
  } catch (error) {
    if (backendProcess && !backendProcess.killed) backendProcess.send({ type: 'as-radar-browser-response', requestId, ok: false, error: error && error.message ? error.message : String(error) });
  }
}


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
    const browserSessionData = path.join(app.getPath('userData'), 'research-browser');
    fs.mkdirSync(browserSessionData, { recursive: true });

    backendProcess = spawn(process.execPath, [tsxCli, serverEntry], {
      cwd: appRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(stablePort),
        AS_RADAR_LOCAL_ONLY: 'true',
        AS_RADAR_DATA_DIR: dataDirectory,
        AS_RADAR_BROWSER_PROFILE: browserSessionData
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
      preload: path.join(app.getAppPath(), 'electron', 'preload.cjs'),
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
  mainWindow.on('closed', () => { if (researchBrowser) { researchBrowser.webContents.close(); researchBrowser = null; } mainWindow = null; });
}

app.whenReady().then(async () => {
  if (process.send) process.on('message', (message) => { if (message && message.type === 'as-radar-browser-request') void handleBrowserRequest(message); });
  ipcMain.on('as-radar:browser-bounds', (_event, bounds) => updateResearchBrowserBounds(null, bounds));
  ipcMain.handle('as-radar:browser-show', async (_event, url) => { attachResearchBrowser(); browserVisible = true; researchBrowser.setVisible(true); updateResearchBrowserBounds(); const safe = safeHttpUrl(url); if (safe && safe !== researchBrowser.webContents.getURL()) await researchBrowser.webContents.loadURL(safe); return { visible: true, url: researchBrowser.webContents.getURL() }; });
  ipcMain.handle('as-radar:browser-hide', () => { browserVisible = false; if (researchBrowser) researchBrowser.setVisible(false); return { visible: false }; });
  ipcMain.handle('as-radar:browser-takeover', (_event, enabled) => { browserTakeover = !!enabled; return { takeover: browserTakeover }; });
  ipcMain.handle('as-radar:browser-status', () => ({ available: !!researchBrowser, visible: browserVisible, takeover: browserTakeover, url: researchBrowser?.webContents.getURL() || '', title: researchBrowser?.webContents.getTitle() || '' }));
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
  if (researchBrowser) { try { researchBrowser.webContents.close(); } catch (_) {} researchBrowser = null; }
  quitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
