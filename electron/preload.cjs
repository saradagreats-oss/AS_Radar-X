'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Deliberately expose a narrow, allow-listed API. Never expose ipcRenderer itself.
contextBridge.exposeInMainWorld('asRadarDesktop', {
  isDesktop: true,
  setBrowserBounds: (bounds) => ipcRenderer.send('as-radar:browser-bounds', bounds),
  showBrowser: (url) => ipcRenderer.invoke('as-radar:browser-show', url),
  hideBrowser: () => ipcRenderer.invoke('as-radar:browser-hide'),
  setBrowserTakeover: (enabled) => ipcRenderer.invoke('as-radar:browser-takeover', !!enabled),
  browserStatus: () => ipcRenderer.invoke('as-radar:browser-status'),
  onBrowserEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('as-radar:browser-event', listener);
    return () => ipcRenderer.removeListener('as-radar:browser-event', listener);
  }
});
