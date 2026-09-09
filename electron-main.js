'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const https = require('https');
const crypto = require('crypto');

/* ---------- incremental archive updater ----------
   Historical years never change -> download each missing year once;
   current year CSV refreshed at most every 6 h; solar files refreshed
   when stale. Rebuilds source\data\quakes.json.gz exactly like
   tools\merge_quakes.mjs so the renderer sees one identical format. */
const ARCHIVE_DIR = process.env.CHRONOS_ARCHIVE || (() => {
  const appPath = process.env.PORTABLE_EXECUTABLE_DIR
    || (app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname);
  return path.join(appPath, 'data_archive');
})();

function httpGetStr(url, redirects) {
  redirects = redirects || 0;
  return new Promise((res, rej) => {
    https.get(url, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects < 3) {
        r.resume();
        return httpGetStr(r.headers.location, redirects + 1).then(res, rej);
      }
      let b = '';
      r.on('data', c => b += c);
      r.on('end', () => r.statusCode === 200 ? res(b) : rej(new Error('status ' + r.statusCode)));
    }).on('error', rej);
  });
}

function parseQuakeCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  const t = [], la = [], lo = [], m = [], d = [];
  let skip = true;
  for (const line of lines) {
    if (!line) continue;
    if (skip) { if (/^time,/i.test(line)) skip = false; continue; }
    const c = line.split(',');
    const time = Date.parse(c[0]);
    if (!isFinite(time)) continue;
    const lat = parseFloat(c[1]), lon = parseFloat(c[2]);
    const dep = parseFloat(c[3]), mag = parseFloat(c[4]);
    if (!isFinite(lat) || !isFinite(lon) || !isFinite(mag)) continue;
    t.push(Math.floor(time / 1000));
    la.push(lat); lo.push(lon);
    m.push(isFinite(mag) ? mag : -1);
    d.push(isFinite(dep) ? dep : -1);
  }
  return { t, la, lo, m, d };
}

function rebuildArchive() {
  const out = { t: [], la: [], lo: [], m: [], d: [] };
  let files = 0;
  for (const f of fs.readdirSync(ARCHIVE_DIR)) {
    if (!/^quakes_\d{4}\.csv$/.test(f)) continue;
    files++;
    const part = parseQuakeCsv(fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf8'));
    out.t.push(...part.t); out.la.push(...part.la); out.lo.push(...part.lo);
    out.m.push(...part.m); out.d.push(...part.d);
  }
  if (!out.t.length) throw new Error('archive empty');
  const idx = out.t.map((v, i) => i).sort((a, b) => out.t[a] - out.t[b]);
  const sorted = {};
  for (const k of ['t', 'la', 'lo', 'm', 'd']) sorted[k] = idx.map(i => out[k][i]);
  const meta = {
    count: sorted.t.length,
    minT: sorted.t[0], maxT: sorted.t[sorted.t.length - 1],
    files, built: new Date().toISOString()
  };
  fs.mkdirSync(dataFile(''), { recursive: true });
  fs.writeFileSync(dataFile('quakes.json.gz'),
    zlib.gzipSync(Buffer.from(JSON.stringify(sorted)), { level: 9 }));
  fs.writeFileSync(dataFile('quakes_meta.json'), JSON.stringify(meta, null, 1));
  return meta;
}

ipcMain.handle('archive-info', () => {
  try { return JSON.parse(fs.readFileSync(dataFile('quakes_meta.json'), 'utf8')); }
  catch (e) { return { count: 0, minT: 0, maxT: 0 }; }
});

ipcMain.handle('update-archive', async () => {
  const now = new Date();
  const curYear = now.getUTCFullYear();
  const have = {};
  try {
    for (const f of fs.readdirSync(ARCHIVE_DIR)) {
      const mt = /^quakes_(\d{4})\.csv$/.exec(f);
      if (mt) have[+mt[1]] = fs.statSync(path.join(ARCHIVE_DIR, f)).mtimeMs;
    }
  } catch (e) { fs.mkdirSync(ARCHIVE_DIR, { recursive: true }); }
  const fetchedYears = [];
  const errors = [];
  for (let y = 1970; y <= curYear; y++) {
    const isCurrent = y === curYear;
    if (have[y] && !isCurrent) continue;                                       // done forever
    if (isCurrent && have[y] && Date.now() - have[y] < 6 * 3600e3) continue;   // fresh enough
    const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv' +
      '&starttime=' + y + '-01-01&endtime=' + (y + 1) + '-01-01&minmagnitude=4.5';
    try {
      const body = await httpGetStr(url);
      if (body.length > 100) {
        fs.writeFileSync(path.join(ARCHIVE_DIR, 'quakes_' + y + '.csv'), body);
        fetchedYears.push(y);
      }
    } catch (e) { errors.push(y + ':' + (e.message || e)); }
  }
  // stale solar reference files -> refresh into archive AND bundled data dir
  const solar = [];
  const jobs = [
    { f: 'silso_monthly.csv', maxAge: 30 * 864e5, url: 'https://www.sidc.be/SILSO/DATA/SN_m_tot_V2.0.csv' },
    { f: 'kp_ap_sn_f107_gfz.txt', maxAge: 7 * 864e5, url: 'https://kp.gfz.de/fileadmin/files_for_gfz_cms/Kp_ap_Ap_SN_F107_since_1932.txt' }
  ];
  for (const j of jobs) {
    const dest = path.join(ARCHIVE_DIR, j.f);
    let age = Infinity;
    try { age = Date.now() - fs.statSync(dest).mtimeMs; } catch (e) { }
    if (age < j.maxAge) continue;
    try {
      const body = await httpGetStr(j.url);
      if (body.length > 500) {
        fs.writeFileSync(dest, body);
        try { fs.writeFileSync(dataFile(j.f), body); } catch (e) { }
        solar.push(j.f);
      }
    } catch (e) { errors.push(j.f + ':' + (e.message || e)); }
  }
  let rebuilt = null;
  try { rebuilt = rebuildArchive(); quakeCache = null; silsoCache = null; }
  catch (e) { errors.push('rebuild:' + (e.message || e)); }
  return { ok: !errors.length || !!rebuilt, fetchedYears, solar, errors, rebuilt };
});

let win = null;
let quakeCache = null;

function dataFile(name) {
  if (app.isPackaged) {
    const base = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
    return path.join(base, 'data', name);
  }
  return path.join(__dirname, 'data', name);
}

/* NASA DONKI with 30-min disk cache so restarts don't burn DEMO_KEY quota */
ipcMain.handle('donki', (_e, url) => {
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
  const cf = path.join(app.getPath('temp'), 'chronos_donki_' + hash + '.json');
  try {
    const st = fs.statSync(cf);
    if (Date.now() - st.mtimeMs < 30 * 60 * 1000) {
      return { ok: true, status: 200, cached: true, body: fs.readFileSync(cf, 'utf8') };
    }
  } catch (e) { /* no cache */ }
  return new Promise(res => {
    https.get(url, r2 => {
      let b = '';
      r2.on('data', c => b += c);
      r2.on('end', () => {
        if (r2.statusCode === 200) { try { fs.writeFileSync(cf, b); } catch (e) { } }
        res({ ok: r2.statusCode === 200, status: r2.statusCode, body: b });
      });
    }).on('error', e => res({ ok: false, status: 0, body: '', error: String(e) }));
  });
});

/* DONKI single-chunk fetch helper */
function donkiChunk(type, start, end) {
  return new Promise(res => {
    const u = 'https://api.nasa.gov/DONKI/' + type + '?startDate=' + start + '&endDate=' + end + '&api_key=DEMO_KEY';
    https.get(u, r => {
      let b = '';
      r.on('data', c => b += c);
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res([]); } });
    }).on('error', () => res([]));
  });
}

/* DONKI single-chunk fetch (one date range, one request) */
ipcMain.handle('donki-chunk', async (_e, type, startDate, endDate) => {
  return await donkiChunk(type, startDate, endDate);
});

/* DONKI deep-history: returns cached file + metadata for resume */
ipcMain.handle('donki-history-info', (_e, type) => {
  const cacheFile = path.join(ARCHIVE_DIR, 'donki_history_' + type + '.json');
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { }
  const lastT = existing.length ? Math.max(...existing.map(e => Date.parse(e.startTime || e.peakTime || '2000'))) : 0;
  return { count: existing.length, lastTime: lastT, cacheFile };
});

/* DONKI save merged history to disk */
ipcMain.handle('donki-history-save', (_e, type, data) => {
  const cacheFile = path.join(ARCHIVE_DIR, 'donki_history_' + type + '.json');
  try { fs.writeFileSync(cacheFile, JSON.stringify(data)); return { ok: true }; } catch (e) { return { ok: false }; }
});

/* DONKI read full deep history back into the renderer (for historical map splotches) */
ipcMain.handle('donki-history-read', (_e, type) => {
  const cacheFile = path.join(ARCHIVE_DIR, 'donki_history_' + type + '.json');
  try {
    if (!fs.existsSync(cacheFile)) return { ok: false, data: [] };
    return { ok: true, data: JSON.parse(fs.readFileSync(cacheFile, 'utf8')) };
  } catch (e) { return { ok: false, data: [] }; }
});

/* DONKI 30-day disk cache — avoids 429 on every startup */
ipcMain.handle('donki-load-cache', (_e, type) => {
  const f = path.join(ARCHIVE_DIR, 'donki_30d_' + type + '.json');
  try {
    const st = fs.statSync(f);
    if (Date.now() - st.mtimeMs < 6 * 3600e3) {
      return { ok: true, stale: false, data: JSON.parse(fs.readFileSync(f, 'utf8')) };
    }
    return { ok: true, stale: true, data: JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (e) { return { ok: false, stale: true, data: [] }; }
});

ipcMain.handle('donki-save-cache', (_e, type, data) => {
  const f = path.join(ARCHIVE_DIR, 'donki_30d_' + type + '.json');
  try { fs.writeFileSync(f, JSON.stringify(data)); return { ok: true }; } catch (e) { return { ok: false }; }
});

ipcMain.handle('quake-archive', () => {
  if (!quakeCache) {
    let gzPath = dataFile('quakes.json.gz');
    if (!fs.existsSync(gzPath)) gzPath = path.join(__dirname, 'data', 'quakes.json.gz');
    const gz = fs.readFileSync(gzPath);
    quakeCache = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  }
  return quakeCache;
});

ipcMain.handle('geo-layer', (_e, name) => {
  let p = path.join(__dirname, 'data', name);
  if (!fs.existsSync(p)) p = path.join(ARCHIVE_DIR, name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
});

let silsoCache = null;
ipcMain.handle('silso', () => {
  if (!silsoCache) {
    const rows = [];
    let p = dataFile('silso_monthly.csv');
    if (!fs.existsSync(p)) p = path.join(__dirname, 'data', 'silso_monthly.csv');
    let text = fs.readFileSync(p, 'utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    for (const line of text.split(/\r?\n/)) {
      if (!line || /^;/.test(line)) continue;
      const c = line.split(';');
      if (c.length < 4) continue;
      const y = parseInt(c[0], 10), mo = parseInt(c[1], 10), sn = parseFloat(c[3]);
      if (!isFinite(y) || !isFinite(mo) || !isFinite(sn)) continue;
      rows.push({ t: Date.UTC(y, mo - 1, 1), sn });
    }
    rows.sort((a, b) => a.t - b.t);
    silsoCache = rows;
  }
  return silsoCache;
});

let kpCache = null;
ipcMain.handle('kp-indices', () => {
  if (!kpCache) {
    let p = path.join(ARCHIVE_DIR, 'kp_ap_sn_f107_gfz.txt');
    if (!fs.existsSync(p)) p = path.join(__dirname, 'data', 'kp_ap_sn_f107_gfz.txt');
    const text = fs.readFileSync(p, 'utf8');
    const start = Date.UTC(1970, 0, 1);
    const months = Math.ceil((Date.now() - start) / (30.44 * 86400000)) + 2;
    const kpSum = new Float64Array(months), kpN = new Float64Array(months);
    const fSum = new Float64Array(months), fN = new Float64Array(months);
    for (const line of text.split(/\r?\n/)) {
      if (!line || line[0] === '#') continue;
      const c = line.trim().split(/\s+/);
      if (c.length < 26) continue;
      const y = +c[0], mo = +c[1], d = +c[2];
      if (y < 1970) continue;
      const t = Date.UTC(y, mo - 1, d);
      const mi = Math.floor((t - start) / (30.44 * 86400000));
      if (mi < 0 || mi >= months) continue;
      let ksum = 0, kn = 0;
      for (let k = 7; k <= 14; k++) {
        const v = parseFloat(c[k]);
        if (isFinite(v) && v >= 0) { ksum += v; kn++; }
      }
      if (kn) { kpSum[mi] += ksum / kn; kpN[mi]++; }
      const f = parseFloat(c[25]);
      if (isFinite(f) && f >= 0) { fSum[mi] += f; fN[mi]++; }
    }
    const kpM = [], f107M = [];
    for (let i = 0; i < months; i++) {
      kpM.push(kpN[i] ? +(kpSum[i] / kpN[i]).toFixed(3) : null);
      f107M.push(fN[i] ? +(fSum[i] / fN[i]).toFixed(2) : null);
    }
    // daily series for trigger-window analysis
    const dKp = [], dF = [];
    const seenDays = new Map();
    for (const line of text.split(/\r?\n/)) {
      if (!line || line[0] === '#') continue;
      const c = line.trim().split(/\s+/);
      if (c.length < 26) continue;
      const y = +c[0], mo = +c[1], d = +c[2];
      if (y < 1970) continue;
      const key = y * 10000 + mo * 100 + d;
      if (seenDays.has(key)) continue;
      let ksum = 0, kn = 0;
      for (let k = 7; k <= 14; k++) {
        const v = parseFloat(c[k]);
        if (isFinite(v) && v >= 0) { ksum += v; kn++; }
      }
      const f = parseFloat(c[25]);
      seenDays.set(key, 1);
      dKp.push(kn ? { t: Date.UTC(y, mo - 1, d), v: +(ksum / kn).toFixed(2) } : null);
      dF.push(isFinite(f) && f >= 0 ? { t: Date.UTC(y, mo - 1, d), v: f } : null);
    }
    kpCache = {
      start, monthMs: 30.44 * 86400000, kpM, f107M,
      dKp: dKp.filter(Boolean), dF: dF.filter(Boolean)
    };
  }
  return kpCache;
});

ipcMain.handle('fetch-text', async (_e, url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, error: String(err && err.message || err) };
  }
});

/* HTTP POST (form-encoded) — OMNIWeb nx1.cgi requires POST. */
ipcMain.handle('post-text', async (_e, url, body) => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, error: String(err && err.message || err) };
  }
});

/* Bundled magnet (solar-wind/IMF/Dst) historical series, with a userData cache
   override so an in-app "reload" can refresh data without touching the asar. */
const MAGNET_CACHE_DIR = () => process.env.CHRONOS_MAGNET_CACHE
  || path.join(app.getPath('userData'), 'magnetCache');

function magnetBundledPath(type) {
  let p = path.join(__dirname, 'data', 'magnet', type + '.json');
  if (!fs.existsSync(p) && typeof dataFile === 'function') p = dataFile(path.join('magnet', type + '.json'));
  return p;
}

function magnetUserPath(type) {
  return path.join(MAGNET_CACHE_DIR(), type + '.json');
}

ipcMain.handle('magnet-load', (_e, type) => {
  try {
    const up = magnetUserPath(type);
    if (fs.existsSync(up)) {
      return { ok: true, cache: true, data: JSON.parse(fs.readFileSync(up, 'utf8')) };
    }
    const bp = magnetBundledPath(type);
    if (fs.existsSync(bp)) {
      return { ok: true, cache: false, data: JSON.parse(fs.readFileSync(bp, 'utf8')) };
    }
    return { ok: false, error: 'no data for ' + type };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

ipcMain.handle('magnet-save', (_e, type, data) => {
  try {
    const dir = MAGNET_CACHE_DIR();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(magnetUserPath(type), JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

function createWindow() {
  try { fs.mkdirSync(ARCHIVE_DIR, { recursive: true }); } catch (e) { }
  win = new BrowserWindow({
    width: 1600, height: 950,
    minWidth: 1100, minHeight: 700,
    backgroundColor: '#070b16',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.maximize();   // fill the available screen by default
  win.setMenuBarVisibility(false);
  // F11 toggles fullscreen so the app can scale to fill any screen
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
