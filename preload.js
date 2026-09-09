'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ct', {
  quakeArchive: () => ipcRenderer.invoke('quake-archive'),
  geoLayer: (name) => ipcRenderer.invoke('geo-layer', name),
  silso: () => ipcRenderer.invoke('silso'),
  kpIndices: () => ipcRenderer.invoke('kp-indices'),
  fetchText: (url) => ipcRenderer.invoke('fetch-text', url),
  postText: (url, body) => ipcRenderer.invoke('post-text', url, body),
  magnetLoad: (type) => ipcRenderer.invoke('magnet-load', type),
  magnetSave: (type, data) => ipcRenderer.invoke('magnet-save', type, data),
  donki: (url) => ipcRenderer.invoke('donki', url),
  donkiChunk: (type, startDate, endDate) => ipcRenderer.invoke('donki-chunk', type, startDate, endDate),
  donkiHistoryInfo: (type) => ipcRenderer.invoke('donki-history-info', type),
  donkiHistorySave: (type, data) => ipcRenderer.invoke('donki-history-save', type, data),
  donkiHistoryRead: (type) => ipcRenderer.invoke('donki-history-read', type),
  donkiLoadCache: (type) => ipcRenderer.invoke('donki-load-cache', type),
  donkiSaveCache: (type, data) => ipcRenderer.invoke('donki-save-cache', type, data),
  updateArchive: () => ipcRenderer.invoke('update-archive'),
  archiveInfo: () => ipcRenderer.invoke('archive-info'),
  log: (msg) => console.log('[renderer] ' + msg)
});
