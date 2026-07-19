const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nscDesktop', {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizeChange: (callback) => {
    const handler = (_event, maximized) => callback(maximized);
    ipcRenderer.on('window:maximize-changed', handler);
    return () => ipcRenderer.removeListener('window:maximize-changed', handler);
  },
  getBootState: () => ipcRenderer.invoke('boot:get-state'),
  connect: (serverUrl) => ipcRenderer.invoke('boot:connect', serverUrl),
  onBootReady: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('boot:ready', handler);
    return () => ipcRenderer.removeListener('boot:ready', handler);
  },
});