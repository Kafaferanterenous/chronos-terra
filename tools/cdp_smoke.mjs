#!/usr/bin/env node
/*
 * Chronos Terra - headless CDP smoke suite.
 *
 * Launches the packaged Electron build with a remote-debugging port, attaches
 * over CDP, and verifies boot data, syzygy masks, all five views, graph canvas
 * sizing, play/pause, and page-console cleanliness.
 *
 * Usage:
 *   node tools\cdp_smoke.mjs
 *   node tools\cdp_smoke.mjs --port 9238 --timeout 90000 --shot temp\smoke.png
 *
 * Node 22+ is required for the built-in WebSocket client. No npm deps needed.
 * Exits 0 when every check passes, 1 on a failed check, 2 on setup failure.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Works both in the working tree (temp\builder\dist) and in a clean clone
// built with `npm run dist` (dist\win-unpacked).
const EXE_CANDIDATES = [
  path.join(ROOT, 'temp', 'builder', 'dist', 'win-unpacked', 'ChronosTerra.exe'),
  path.join(ROOT, 'dist', 'win-unpacked', 'ChronosTerra.exe')
];
const DEFAULT_EXE = EXE_CANDIDATES.find(p => existsSync(p)) || EXE_CANDIDATES[0];

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const exe = path.resolve(arg('exe', DEFAULT_EXE));
const port = Number(arg('port', '9238'));
const timeoutMs = Number(arg('timeout', '90000'));
const shot = arg('shot', '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!existsSync(exe)) {
  console.error('EXE NOT FOUND: ' + exe + '\nBuild first with temp\\builder\\build.cmd, or pass --exe <path>.');
  process.exit(2);
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('Invalid --port: ' + port);
  process.exit(2);
}

const results = [];
const pageErrors = [];
let child = null;
let ws = null;
let outBuf = '';
let errBuf = '';

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : ''));
}

async function waitForTargets() {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list');
      if (res.ok) {
        const list = await res.json();
        const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl) ||
                     list.find(t => t.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch { /* not listening yet */ }
    await sleep(400);
  }
  throw new Error('CDP endpoint did not expose a page target within ' + timeoutMs + ' ms');
}

function makeClient(socket) {
  let seq = 0;
  const pending = new Map();
  socket.addEventListener('message', ev => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails;
      pageErrors.push('exception: ' + (d?.text || '') + ' ' + (d?.exception?.description || ''));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      const parts = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
      pageErrors.push('console.error: ' + parts);
    }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      const timer = setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }
      }, 20000);
      const done = fn => v => { clearTimeout(timer); fn(v); };
      pending.set(id, { resolve: done(resolve), reject: done(reject) });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  return { send };
}

async function main() {
  const args = ['--remote-debugging-port=' + port, '--remote-allow-origins=*', '--enable-logging'];
  child = spawn(exe, args, { cwd: path.dirname(exe), stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => { outBuf += b.toString(); });
  child.stderr.on('data', b => { errBuf += b.toString(); });

  const target = await waitForTargets();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', e => reject(new Error('WebSocket failed: ' + String(e.message || e))), { once: true });
  });

  const { send } = makeClient(ws);
  await send('Runtime.enable');
  await send('Page.enable');

  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate failed');
    }
    return r.result?.value;
  };

  // Boot: wait for the archive to finish loading.
  let quakes = 0;
  let ready = false;
  const bootDeadline = Date.now() + timeoutMs;
  while (Date.now() < bootDeadline) {
    ready = !!(await evaluate("typeof S !== 'undefined' && S.q && S.q.t && S.q.t.length > 0 && S.tMax > 0").catch(() => false));
    if (ready) { quakes = await evaluate('S.q.t.length'); break; }
    await sleep(500);
  }
  check('boot + quake archive', ready, quakes + ' quakes');
  if (!ready) throw new Error('App never became ready; see captured logs.');

  const bridge = await evaluate("typeof window.ct === 'object' && typeof window.ct.quakeArchive === 'function'");
  check('preload bridge', bridge === true);

  // Syzygy is computed later in init(), after the volcano layer loads.
  let syzReady = false;
  const syzDeadline = Date.now() + timeoutMs;
  while (Date.now() < syzDeadline) {
    syzReady = !!(await evaluate("S.q.syz && S.q.syz.length === S.q.t.length && S.eruptionSyz").catch(() => false));
    if (syzReady) break;
    await sleep(300);
  }
  const syzLen = syzReady ? await evaluate('S.q.syz.length') : 0;
  const syzGold = syzReady
    ? await evaluate('Array.prototype.reduce.call(S.q.syz, (a,b) => a + b, 0)')
    : -1;
  check('syzygy masks', syzReady && syzGold > 0,
        syzGold + ' of ' + syzLen + ' quakes flagged');

  let climateCount = 0;
  const climateDeadline = Date.now() + timeoutMs;
  while (Date.now() < climateDeadline) {
    climateCount = await evaluate('S.climate ? S.climate.length : 0').catch(() => 0);
    if (climateCount > 0) break;
    await sleep(300);
  }
  const climateUi = await evaluate(`({
    toggle: !!document.getElementById('lyClimate'),
    box: (document.getElementById('climateBox') || {}).textContent || ''
  })`);
  check('climate/weather layer',
        climateCount > 0 && climateUi.toggle && /GDACS weather events/.test(climateUi.box),
        climateCount + ' events');

  // setView() is scoped inside init(), so drive the real tab buttons. Retry
  // because the listener is attached near the end of the async boot sequence.
  async function switchView(tabId, verify) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await evaluate(`document.getElementById(${JSON.stringify(tabId)}).click()`).catch(() => false);
      await sleep(250);
      if (await evaluate(verify).catch(() => false)) return true;
    }
    return false;
  }

  const moon = await switchView('tabMoon',
    "!document.getElementById('moonPanel').classList.contains('hidden')");
  const speeds = await evaluate("Array.from(document.querySelectorAll('#moonSpd button')).map(b => b.textContent.trim())");
  check('moon view + speed presets', moon === true && speeds.includes('30 m/s'), speeds.join(' | '));

  const graphs = await switchView('tabGraphs',
    "document.body.classList.contains('view-graphs') && !document.getElementById('graphsPanel').classList.contains('hidden')");
  await sleep(900);
  const canvasFit = await evaluate(`(() => {
    const cv = document.getElementById('graphCanvas'), st = document.getElementById('graphStage');
    if (!cv || !st) return null;
    return Math.abs(cv.getBoundingClientRect().width - st.clientWidth);
  })()`);
  check('graphs view', graphs === true);
  check('graph canvas fills stage', canvasFit !== null && canvasFit < 2, 'delta=' + canvasFit + ' px');

  // Enable a second series (historical proton density) so the lag scan has a pair.
  await evaluate(`(() => {
    const cb = document.getElementById('gd2');
    if (!cb) return false;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);

  const lagExpr = `({
    slider: !!document.getElementById('lagSteps'),
    band: !!document.querySelector('.lagband'),
    label: (document.getElementById('lagStepsLabel') || {}).textContent || '',
    active: typeof GRAPH_SERIES !== 'undefined'
      ? GRAPH_SERIES.filter(s => document.getElementById(s.id) && document.getElementById(s.id).checked).map(s => s.id).join(',')
      : '?'
  })`;
  let lagUi = null;
  const lagDeadline = Date.now() + 20000;
  while (Date.now() < lagDeadline) {
    lagUi = await evaluate(lagExpr).catch(() => null);
    if (lagUi && lagUi.slider && lagUi.band) break;
    await sleep(300);
  }
  check('lag slider + null band', !!(lagUi && lagUi.slider && lagUi.band),
        (lagUi ? lagUi.label + ' [active=' + lagUi.active + ']' : 'no enrichment'));

  const startLabel = lagUi ? lagUi.label : '';
  const lagChanged = await evaluate(`(() => {
    const s = document.getElementById('lagSteps');
    if (!s) return false;
    s.value = Math.min(+s.max, (+s.value || 6) + 4);
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  let lagAfter = null;
  const lagAfterDeadline = Date.now() + 10000;
  while (Date.now() < lagAfterDeadline) {
    lagAfter = await evaluate(`({
      band: !!document.querySelector('.lagband'),
      label: (document.getElementById('lagStepsLabel') || {}).textContent || ''
    })`).catch(() => null);
    if (lagAfter && lagAfter.band && lagAfter.label && lagAfter.label !== startLabel) break;
    await sleep(200);
  }
  check('lag slider widens scan',
        !!(lagChanged && lagAfter && lagAfter.band && lagAfter.label !== startLabel && /±\d+ [dhmo]/.test(lagAfter.label)),
        lagAfter ? lagAfter.label : 'no update');

  // Region filter: a coarse lat/lon box narrows the quake series, and the
  // choice is carried into saved views and exported metadata.
  await evaluate(`(() => {
    const sel = document.getElementById('gRegion');
    if (sel) { sel.value = 'all'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  })()`);
  let allRegion = null;
  const allDeadline = Date.now() + 20000;
  while (Date.now() < allDeadline) {
    allRegion = await evaluate(`({
      region: (typeof graphCur !== 'undefined' && graphCur) ? graphCur.region : '',
      total: (typeof graphSeriesCache !== 'undefined' && graphSeriesCache['gq']
        ? graphSeriesCache['gq'].reduce((a, p) => a + (p.v || 0), 0) : -1)
    })`).catch(() => null);
    if (allRegion && allRegion.region === 'all' && allRegion.total > 0) break;
    await sleep(300);
  }
  const regionStart = await evaluate(`(() => {
    const sel = document.getElementById('gRegion');
    if (!sel) return null;
    sel.value = 'south';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  let region = null;
  const regionDeadline = Date.now() + 20000;
  while (Date.now() < regionDeadline) {
    region = await evaluate(`({
      sel: (document.getElementById('gRegion') || {}).value || '',
      region: (typeof graphCur !== 'undefined' && graphCur) ? graphCur.region : '',
      total: (typeof graphSeriesCache !== 'undefined' && graphSeriesCache['gq']
        ? graphSeriesCache['gq'].reduce((a, p) => a + (p.v || 0), 0) : -1),
      capture: typeof captureView === 'function' ? captureView().region : '',
      metaRegion: typeof findingMeta === 'function' ? findingMeta().window.region : '',
      label: typeof findingMeta === 'function' ? findingMeta().window.regionLabel : ''
    })`).catch(() => null);
    if (region && region.region === 'south' && region.sel === 'south' && region.total >= 0) break;
    await sleep(300);
  }
  check('region filter (coarse box)', !!allRegion && !!regionStart && !!region &&
        allRegion.total > 0 && region.sel === 'south' && region.region === 'south' &&
        region.capture === 'south' && region.metaRegion === 'south' &&
        region.total > 0 && region.total < allRegion.total,
        region ? region.label + ' · ' + region.total + ' of ' + allRegion.total + ' quakes' : 'no filter');
  await evaluate(`(() => {
    const sel = document.getElementById('gRegion');
    if (sel) { sel.value = 'all'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  })()`);

  // Benjamini–Hochberg FDR across the scanned lags.
  let bh = null;
  const bhDeadline = Date.now() + 25000;
  while (Date.now() < bhDeadline) {
    bh = await evaluate(`({
      q: typeof lastLagResult !== 'undefined' && lastLagResult ? lastLagResult.q : null,
      p: typeof lastLagResult !== 'undefined' && lastLagResult ? lastLagResult.p : null,
      k: typeof lastLagResult !== 'undefined' && lastLagResult ? lastLagResult.bhK : 0,
      m: typeof lastLagResult !== 'undefined' && lastLagResult ? lastLagResult.bhM : -1,
      helper: typeof fisherP === 'function' ? fisherP(0.5, 30) : -1,
      sanity: typeof benjaminiHochberg === 'function' ? benjaminiHochberg([0.001, 0.02, 0.4], 0.05) : null,
      text: (document.getElementById('graphEnrich') || {}).textContent || ''
    })`).catch(() => null);
    if (bh && bh.q != null && bh.k > 0 && bh.helper > 0) break;
    await sleep(300);
  }
  check('BH false-discovery correction', !!bh && bh.q != null && bh.p != null &&
        bh.k > 0 && bh.m >= 0 && bh.helper > 0 && bh.helper < 0.01 &&
        !!bh.sanity && bh.sanity.bhM === 2 && bh.sanity.q.every(v => v >= 0 && v <= 1) &&
        /Benjamini/.test(bh.text),
        bh ? 'k=' + bh.k + ' · pass=' + bh.m + ' · peak q=' +
             (bh.q < 1e-4 ? bh.q.toExponential(1) : bh.q.toFixed(3)) : 'no correction');

  // A/B earlier window: toggle rebuilds the preceding equal-width window and
  // draws ghost bars behind the current lag profile.
  const abStart = await evaluate(`(() => {
    const cb = document.getElementById('lagAB');
    if (!cb) return null;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  let ab = null;
  const abDeadline = Date.now() + 30000;
  while (Date.now() < abDeadline) {
    ab = await evaluate(`({
      checked: !!(document.getElementById('lagAB') || {}).checked,
      ab: typeof lastLagResult !== 'undefined' && lastLagResult ? lastLagResult.ab : null,
      ghosts: document.querySelectorAll('.lagstrip .lagprev').length,
      text: (document.getElementById('graphEnrich') || {}).textContent || ''
    })`).catch(() => null);
    if (ab && ab.ab && ab.ghosts > 0) break;
    await sleep(300);
  }
  check('lag A/B previous window', !!abStart && !!ab && ab.checked && !!ab.ab &&
        (ab.ab.prevLag === null || typeof ab.ab.prevLag === 'number') && ab.ghosts > 0 &&
        /A\/B previous window/.test(ab.text),
        ab ? (ab.ab ? 'prev ' + (ab.ab.prevLag === null ? 'n/a' : ab.ab.prevLag) +
              ' · ' + ab.ab.stable + ' · ' + ab.ghosts + ' ghosts' : 'no ab') : 'no toggle');
  // Leave it off so the export and saved-view checks reflect the default view.
  await evaluate(`(() => {
    const cb = document.getElementById('lagAB');
    if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  })()`);

  // Event-time magnetic/electric context: global OMNI2 values joined to an
  // event timestamp, explicitly labelled as not local to the epicentre.
  let eventFields = null;
  const efDeadline = Date.now() + 20000;
  while (Date.now() < efDeadline) {
    eventFields = await evaluate(`(() => {
      const t = Date.UTC(2011, 2, 11, 5, 46);
      return {
        helpers: typeof magnetAt === 'function' && typeof fieldGlance === 'function' && typeof fieldPopupHTML === 'function',
        bz: typeof magnetAt === 'function' ? magnetAt('bz', t) : null,
        efield: typeof magnetAt === 'function' ? magnetAt('efield', t) : null,
        glance: typeof fieldGlance === 'function' ? fieldGlance(t, false) : '',
        html: typeof fieldPopupHTML === 'function' ? fieldPopupHTML(t) : ''
      };
    })()`).catch(() => null);
    if (eventFields && eventFields.helpers && eventFields.bz && eventFields.efield &&
        /not a local measurement above the epicentre/.test(eventFields.html)) break;
    await sleep(300);
  }
  check('event-time field context', !!(eventFields && eventFields.helpers && eventFields.bz &&
        eventFields.efield && /Bz/.test(eventFields.glance) && /E /.test(eventFields.glance) &&
        /not a local measurement above the epicentre/.test(eventFields.html)),
        eventFields && eventFields.bz ? 'Bz ' + eventFields.bz.v + ' nT · E ' + eventFields.efield.v + ' mV/m' : 'no field data');

  // Data health badge — every tracked feed records its last fetch outcome.
  const health = await evaluate(`({
    badge: (document.getElementById('dataHealth') || {}).textContent || '',
    tracked: typeof S !== 'undefined' && S.health ? Object.keys(S.health).length : 0,
    pop: !!document.getElementById('healthPop')
  })`);
  check('data health badge', health.tracked >= 5 && health.pop && /sources OK|unavailable|stale/.test(health.badge),
        health.badge + ' · ' + health.tracked + ' tracked');

  // v0.18 reliability: writable-cache fallback, persisted window/zoom, stale UI.
  const reliability = await evaluate(`(async () => {
    if (typeof ensureMagnet === 'function') await ensureMagnet();
    const has = fn => !!(window.ct && typeof window.ct[fn] === 'function');
    const info = has('cacheInfo') ? await window.ct.cacheInfo() : null;
    const wst = has('windowState') ? await window.ct.windowState() : null;
    const sample = (typeof MAGNET !== 'undefined' && typeof magnetRowMeta === 'function')
      ? magnetRowMeta(Object.values(MAGNET)[0]) : null;
    return {
      bridges: has('cacheInfo') && has('windowState') && has('openCache') && has('donkiClearCache'),
      info, wst, sample,
      staleCount: typeof omniStale === 'function' ? omniStale().length : -1,
      settingsUi: !!document.getElementById('cachePaths'),
      aboutUi: !!document.getElementById('aboutCache'),
      healthButton: !!document.getElementById('healthRefresh'),
      magnetButton: !!document.getElementById('magnetRefreshAll'),
      rendered: (document.getElementById('cachePaths') || {}).textContent || ''
    };
  })()`).catch(() => null);
  const cacheOk = !!(reliability && reliability.bridges && reliability.info &&
    typeof reliability.info.archiveDir === 'string' && reliability.info.archiveDir.length > 0 &&
    typeof reliability.info.dataDir === 'string' && reliability.info.dataDir.length > 0 &&
    typeof reliability.info.magnetDir === 'string' && reliability.info.magnetDir.length > 0 &&
    typeof reliability.info.portable === 'boolean' && reliability.wst &&
    reliability.wst.width >= 1100 && reliability.wst.height >= 700 &&
    Number.isFinite(reliability.wst.zoom) && reliability.settingsUi && reliability.aboutUi &&
    /archive:/.test(reliability.rendered));
  check('cache paths + window state', cacheOk,
        reliability && reliability.info
          ? (reliability.info.portable ? 'portable' : 'user-data fallback') + ' · archive=' + reliability.info.archiveDir
          : 'no cache info');
  check('stale-data indicators', !!(reliability && reliability.staleCount >= 0 && reliability.sample &&
        /d old|current|no data/.test(reliability.sample.txt + (reliability.sample.badge || '')) &&
        reliability.healthButton && reliability.magnetButton),
        reliability ? reliability.staleCount + ' stale OMNI series · refresh controls present' : 'no indicators');

  // Export — PNG with baked-in caption plus reproducible JSON metadata.
  const exp = await evaluate(`({
    button: !!document.getElementById('graphExport'),
    bridge: !!(window.ct && typeof window.ct.saveFile === 'function'),
    meta: typeof findingMeta === 'function' ? findingMeta() : null,
    png: typeof findingPngDataUrl === 'function' ? findingPngDataUrl().slice(0, 22) : ''
  })`);
  check('finding export', exp.button && exp.bridge && !!exp.meta && !!exp.meta.window && !!exp.meta.lag &&
        exp.meta.series.length > 0 && exp.png.startsWith('data:image/png'),
        (exp.meta ? exp.meta.series.length + ' series' : 'no meta') + ' · ' + exp.png);

  // CSV export of the visible series (long format, one row per point).
  const csv = await evaluate(`({
    button: !!document.getElementById('graphCsv'),
    bridge: !!(window.ct && typeof window.ct.saveFile === 'function'),
    data: typeof graphCsvData === 'function' ? (() => {
      const d = graphCsvData();
      return { header: d.header, rows: d.rows, series: d.series.length };
    })() : null
  })`);
  check('series CSV export', csv.button && csv.bridge && !!csv.data &&
        csv.data.header === 'series,time_iso,time_ms,value' && csv.data.rows > 0 && csv.data.series > 0,
        csv.data ? csv.data.rows + ' rows · ' + csv.data.series + ' series' : 'no data');

  // Event markers on the graph.
  const markers = await evaluate(`({
    toggle: !!(document.getElementById('gEvents') && document.getElementById('gEvents').checked),
    cached: typeof graphEventCache !== 'undefined' ? graphEventCache.length : 0,
    hits: typeof graphEventHits !== 'undefined' ? graphEventHits.length : 0
  })`);
  check('graph event markers', markers.toggle && markers.cached > 0 && markers.hits > 0,
        markers.cached + ' events · ' + markers.hits + ' drawn');

  // Built-in view presets restore range / magnitude / series / lag together.
  const presetCount = await evaluate(`document.querySelectorAll('#viewPreset option[value^="builtin:"]').length`);
  await evaluate(`(() => {
    const s = document.getElementById('viewPreset');
    s.value = 'builtin:marchitelli';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  let preset = null;
  const presetDeadline = Date.now() + 20000;
  while (Date.now() < presetDeadline) {
    preset = await evaluate(`({
      range: document.getElementById('gRange').value,
      mag: document.getElementById('gMag').value,
      region: (document.getElementById('gRegion') || {}).value || '',
      gd2: document.getElementById('gd2').checked,
      gsn: document.getElementById('gsn').checked,
      lag: typeof lagScanSteps !== 'undefined' ? lagScanSteps : 0
    })`).catch(() => null);
    if (preset && preset.range === 'y1' && preset.mag === '6' && preset.gd2 && !preset.gsn) break;
    await sleep(300);
  }
  check('saved view presets', presetCount >= 3 && !!preset && preset.range === 'y1' &&
        preset.mag === '6' && preset.region === 'all' && preset.gd2 && !preset.gsn && preset.lag === 3,
        preset ? preset.range + ' M≥' + preset.mag + ' ' + preset.region + ' lag±' + preset.lag : 'no preset');

  // Lunation times are refined from the Meeus elongation, not mean-month arithmetic.
  const lun = await evaluate(`(() => {
    if (typeof moonEvents !== 'function') return null;
    const nm = moonEvents(2024, 2024, false).find(t => t >= Date.UTC(2024, 3, 1) && t < Date.UTC(2024, 4, 1));
    const fm = moonEvents(2024, 2024, true).find(t => t >= Date.UTC(2024, 3, 1) && t < Date.UTC(2024, 4, 1));
    return {
      nm: nm ? new Date(nm).toISOString() : '',
      fm: fm ? new Date(fm).toISOString() : '',
      nmErr: nm ? Math.abs(nm - Date.UTC(2024, 3, 8, 18, 21)) / 60000 : 1e9,
      fmErr: fm ? Math.abs(fm - Date.UTC(2024, 3, 23, 23, 49)) / 60000 : 1e9
    };
  })()`);
  check('precise lunation times', !!lun && lun.nmErr <= 10 && lun.fmErr <= 10,
        lun ? 'new ' + lun.nm.slice(11, 16) + ' (±' + lun.nmErr.toFixed(1) + ' min) · full ' +
              lun.fm.slice(11, 16) + ' (±' + lun.fmErr.toFixed(1) + ' min)' : 'not available');

  // Trigger windows: superposed-epoch profile tested against a 95% shuffle envelope.
  await evaluate(`(() => {
    const b = document.getElementById('anaBtn');
    if (b) b.click();
    return true;
  })()`);
  await sleep(250);
  const twStart = await evaluate(`(() => {
    const t = document.getElementById('twTrig'), w = document.getElementById('twW'), m = document.getElementById('twMag');
    if (!t || !w || !m) return false;
    t.value = 'newmoon';
    w.value = '3';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    m.value = '6';
    document.getElementById('twBtn').click();
    return true;
  })()`);
  let tw = null;
  const twDeadline = Date.now() + 45000;
  while (Date.now() < twDeadline) {
    tw = await evaluate(`({
      has: typeof TW_RESULT !== 'undefined' && !!TW_RESULT,
      evDays: typeof TW_RESULT !== 'undefined' && TW_RESULT ? TW_RESULT.evDays : 0,
      w: typeof TW_RESULT !== 'undefined' && TW_RESULT ? TW_RESULT.W : 0,
      lo: typeof TW_RESULT !== 'undefined' && TW_RESULT && TW_RESULT.loEnv ? TW_RESULT.loEnv.length : 0,
      hi: typeof TW_RESULT !== 'undefined' && TW_RESULT && TW_RESULT.hiEnv ? TW_RESULT.hiEnv.length : 0,
      outside: typeof TW_RESULT !== 'undefined' && TW_RESULT ? TW_RESULT.outside : -1,
      mag: typeof TW_RESULT !== 'undefined' && TW_RESULT ? TW_RESULT.magMin : 0,
      out: (document.getElementById('twOut') || {}).textContent || ''
    })`).catch(() => null);
    if (tw && tw.has && tw.evDays > 0 && tw.w === 3 && tw.mag === 6) break;
    await sleep(250);
  }
  check('trigger-window envelope', !!twStart && !!tw && tw.has && tw.evDays > 0 && tw.w === 3 &&
        tw.mag === 6 && tw.lo === 7 && tw.hi === 7 && tw.outside >= 0 && /shuffle band/.test(tw.out),
        tw ? tw.evDays + ' triggers · ±' + tw.w + 'd · M≥' + tw.mag + ' · ' +
             tw.outside + ' outside · env ' + tw.lo + '/' + tw.hi + ' · ' + String(tw.out).slice(0, 90) : 'no result');
  if (tw) await evaluate("document.getElementById('anaClose').click()");

  const papers = await switchView('tabPapers',
    "document.body.classList.contains('view-papers') && !document.getElementById('papersPanel').classList.contains('hidden')");
  check('studies view', papers === true);

  // Play / pause (wrap at archive end must keep playing).
  await switchView('tabGlobe', "document.body.classList.contains('view-globe')");
  await evaluate("document.getElementById('playBtn').click()");
  await sleep(600);
  const playing = await evaluate('S.playing === true');
  await evaluate("document.getElementById('playBtn').click()");
  await sleep(200);
  const stopped = await evaluate('S.playing === false');
  check('play / pause', playing && stopped, 'playing=' + playing + ', stopped=' + stopped);

  if (shot) {
    const dir = path.dirname(path.resolve(shot));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const img = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.resolve(shot), Buffer.from(img.data, 'base64'));
    check('screenshot', true, path.resolve(shot));
  }

  // Electron 43 emits a known sandbox_bundle startup error in CDP-attached
  // packaged builds even when the app boots cleanly. Ignore only that vendor
  // message; every application error still fails the suite.
  const appErrors = pageErrors.filter(m => !/sandboxed_renderer\.bundle|sandbox_bundle|preloadScripts/.test(m));
  check('no page errors', appErrors.length === 0, appErrors.slice(0, 3).join(' || '));
  const initFailure = /(?:INFO:CONSOLE:\d+\]\s*)?"?init failed:/.exec(outBuf + errBuf);
  check('no init failure', !initFailure, initFailure ? initFailure[0] : '');
}

try {
  await main();
} catch (e) {
  check('suite completed', false, e.message || String(e));
} finally {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  if (child && child.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  const logs = path.join(ROOT, 'temp');
  if (existsSync(logs)) {
    writeFileSync(path.join(logs, 'cdp-smoke-out.log'), outBuf);
    writeFileSync(path.join(logs, 'cdp-smoke-err.log'), errBuf);
  }
}

const failed = results.filter(r => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  console.log('Failed: ' + failed.map(r => r.name).join(', '));
  process.exit(1);
}
process.exit(0);
