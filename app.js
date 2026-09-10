'use strict';

/* ---------- state ---------- */
const S = {
  q: null,
  tMin: 0, tMax: 0,
  winStart: 0, winEnd: 0,
  spanMs: 365 * 864e5,
  spanKey: 'y1',
  playing: false,
  map: null,
  projGlobe: true,
  counts: null,
  sunStrip: true,
  sunBars: false,
  capitals: null
};

const $ = id => document.getElementById(id);
const MONTH = 2629800000;

function log(m) { console.log('[renderer] ' + m); }
function hideBoot() {
  const b = $('bootScreen');
  if (b && !b.classList.contains('hide')) { b.classList.add('hide'); setTimeout(() => b.remove(), 900); }
}
setTimeout(hideBoot, 30000);

/* ---------- map ---------- */
function baseStyle() {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0a1020' } }]
  };
}

function buildMap(land, plates) {
  const map = new maplibregl.Map({
    container: 'map',
    style: baseStyle(),
    center: [135, -25],
    zoom: 1.4,
    attributionControl: false
  });
  S.map = map;
  // keep the map filling its container when the window is resized/maximized/fullscreened
  window.addEventListener('resize', () => { try { map.resize(); } catch (e) { } });
  map.on('load', () => {
    try { map.setProjection({ type: 'globe' }); } catch (e) { log('globe unsupported'); }
    map.addSource('land', { type: 'geojson', data: land });
    map.addLayer({ id: 'land-fill', source: 'land', type: 'fill', paint: { 'fill-color': '#18233f', 'fill-opacity': 0.92 } });
    map.addLayer({ id: 'land-line', source: 'land', type: 'line', paint: { 'line-color': '#2c3c63', 'line-width': 0.7 } });
    map.addSource('plates', { type: 'geojson', data: plates });
    map.addLayer({ id: 'plates-line', source: 'plates', type: 'line', paint: { 'line-color': '#5ea8ff', 'line-width': 1.4, 'line-opacity': 0.55 } });
    map.addSource('grid', { type: 'geojson', data: graticule() });
    map.addLayer({ id: 'grid-line', source: 'grid', type: 'line', paint: { 'line-color': '#33405e', 'line-width': 0.5, 'line-opacity': 0.35 } });
    map.addSource('quakes', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'quakes-circle', source: 'quakes', type: 'circle',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'm'], 4.5, 1.6, 5.5, 3.2, 6.5, 6, 7.5, 11, 9.5, 18],
        'circle-color': syzColorExpr(),
        'circle-opacity': 0.85,
        'circle-stroke-width': 0.4,
        'circle-stroke-color': 'rgba(255,255,255,.25)'
      },
      filter: ['>=', ['get', 'm'], 4.5]
    });
    map.addSource('live24', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'live24-circle', source: 'live24', type: 'circle',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'm'], 2.5, 2.2, 4.5, 3.6, 6, 6, 8, 10],
        'circle-color': '#4fffd7',
        'circle-opacity': 0.9,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(79,255,215,.35)'
      },
      filter: ['>=', ['get', 'm'], 2.5]
    });
    map.addSource('hazards', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'hazards-circle', source: 'hazards', type: 'circle',
      paint: {
        'circle-radius': 5,
        'circle-color': ['match', ['get', 'k'], 'TC', '#9b6bff', 'FL', '#4fc3f7', 'WF', '#ff8a3d', 'VO', '#ff2e63', 'DR', '#ffd166', '#aab4d0'],
        'circle-opacity': 0.95,
        'circle-stroke-width': 1.2,
        'circle-stroke-color': 'rgba(255,255,255,.5)'
      }
    });
    map.addSource('volcs', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'volcs-circle', source: 'volcs', type: 'circle',
      paint: {
        'circle-radius': 3,
        'circle-color': '#c9401f',
        'circle-opacity': 0.85,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,120,80,.4)'
      }
    });
    map.addSource('capitals', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'capitals-circle', source: 'capitals', type: 'circle',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': 2.6,
        'circle-color': '#ffd700',
        'circle-opacity': 0.9,
        'circle-stroke-width': 0.8,
        'circle-stroke-color': 'rgba(255,215,0,.45)'
      }
    });
    map.addSource('alertring', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'alert-ring', source: 'alertring', type: 'circle',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': 14,
        'circle-color': 'rgba(255,46,99,0)',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ff2e63'
      }
    });
    map.addSource('flares', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'flare-fill', source: 'flares', type: 'fill',
      paint: { 'fill-color': '#ff8c1a', 'fill-opacity': 0.10 }
    });
    map.addLayer({
      id: 'flare-line', source: 'flares', type: 'line',
      paint: { 'line-color': 'rgba(255,140,26,.25)', 'line-width': 1 }
    });
    map.addSource('cmes', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'cme-fill', source: 'cmes', type: 'fill',
      paint: { 'fill-color': '#4fc3f7', 'fill-opacity': 0.08 }
    });
    map.addLayer({
      id: 'cme-line', source: 'cmes', type: 'line',
      paint: { 'line-color': 'rgba(79,195,247,.2)', 'line-width': 1 }
    });
    map.addSource('cmeghost', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'cmeghost-line', source: 'cmeghost', type: 'line',
      paint: { 'line-color': 'rgba(79,195,247,.25)', 'line-width': 1, 'line-dasharray': [2, 2] }
    });
    // historical (post-impact) layers — static, transparent, distinct colour
    map.addSource('cmehist', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'cme-hist-fill', source: 'cmehist', type: 'fill',
      layout: { visibility: 'none' },
      paint: { 'fill-color': '#5ed6c0', 'fill-opacity': 0.09 }
    });
    map.addLayer({
      id: 'cme-hist-line', source: 'cmehist', type: 'line',
      layout: { visibility: 'none' },
      paint: { 'line-color': 'rgba(94,214,192,.18)', 'line-width': 1 }
    });
    map.addSource('flarehist', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'flare-hist-fill', source: 'flarehist', type: 'fill',
      layout: { visibility: 'none' },
      paint: { 'fill-color': '#ff9d3c', 'fill-opacity': 0.06 }
    });
    map.addLayer({
      id: 'flare-hist-line', source: 'flarehist', type: 'line',
      layout: { visibility: 'none' },
      paint: { 'line-color': 'rgba(255,157,60,.14)', 'line-width': 1 }
    });
    applySidebar();
    refreshQuakes();
    log('map ready');
  });
}

function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

function graticule() {
  const f = [];
  for (let lon = -180; lon <= 180; lon += 15) {
    f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lon, -85], [lon, 85]] } });
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 5) pts.push([lon, lat]);
    f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
  }
  return { type: 'FeatureCollection', features: f };
}

/* ---------- quake window -> geojson ---------- */
function lowerBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}
function upperBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) lo = mid + 1; else hi = mid; }
  return lo;
}

let rafQueued = false, heavyScheduled = false;
function refreshQuakes() {
  if (rafQueued) return;
  rafQueued = true;
  requestAnimationFrame(() => {
    rafQueued = false;
    drawTimeline(); readout();
    if (!heavyScheduled) {
      heavyScheduled = true;
      const delay = S.playing ? 220 : 120;
      setTimeout(() => { heavyScheduled = false; doHeavy(); }, delay);
    }
  });
}
function doHeavy() {
  const n = drawQuakeWindow();
  readout(n);
}
function drawQuakeWindow() {
  if (!S.q || !S.map || !S.map.getSource('quakes')) return 0;
  const t = S.q.t;
  const a = lowerBound(t, S.winStart / 1000);
  const b = upperBound(t, S.winEnd / 1000);
  const n = b - a;
  const CAP = S.playing ? 12000 : 45000;
  const stride = Math.max(1, Math.ceil(n / CAP));
  const feats = new Array(Math.ceil(n / stride));
  let k = 0;
  for (let i = a; i < b; i += stride) {
    feats[k++] = {
      type: 'Feature',
      properties: { m: S.q.m[i], g: S.q.syz ? S.q.syz[i] : 0 },
      geometry: { type: 'Point', coordinates: [S.q.lo[i], S.q.la[i]] }
    };
  }
  feats.length = k;
  S.map.getSource('quakes').setData({ type: 'FeatureCollection', features: feats });
  return n;
}

/* ---------- timeline canvas ---------- */
function buildCounts() {
  const start = Date.UTC(1970, 0, 1);
  const months = Math.ceil((S.tMax * 1000 - start) / MONTH) + 1;
  const c = new Float64Array(months);
  for (let i = 0; i < S.q.t.length; i++) {
    const mi = Math.floor((S.q.t[i] * 1000 - start) / MONTH);
    if (mi >= 0 && mi < months) c[mi]++;
  }
  S.counts = c; S.countsStart = start;
}

function drawSparkline() {
  const cv = $('sparkCanvas');
  if (!cv || !S.q) return;
  const dpr = window.devicePixelRatio || 1;
  const W = 220, H = 48;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const now = Date.now();
  const DAY = 864e5;
  const days = 7;
  const t0 = now - days * DAY;
  const pad = { l: 2, r: 2, t: 4, b: 12 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

  const bins = new Float64Array(days);
  for (let i = 0; i < S.q.t.length; i++) {
    const ms = S.q.t[i] * 1000;
    if (ms < t0 || ms > now) continue;
    const di = Math.floor((ms - t0) / DAY);
    if (di >= 0 && di < days) bins[di]++;
  }
  let qMax = 1;
  for (let i = 0; i < days; i++) if (bins[i] > qMax) qMax = bins[i];
  const bw = cw / days;
  for (let i = 0; i < days; i++) {
    const x = pad.l + i * bw;
    const bh = (bins[i] / qMax) * ch;
    ctx.fillStyle = 'rgba(94,168,255,.55)';
    ctx.fillRect(x + 2, pad.t + ch - bh, bw - 4, bh);
    ctx.fillStyle = '#5ea8ff';
    ctx.font = '9px Segoe UI';
    ctx.fillText(String(Math.round(bins[i])), x + bw / 2 - 5, pad.t + ch - bh - 2);
  }

  ctx.fillStyle = '#55608a';
  ctx.font = '9px Segoe UI';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 0; i < days; i++) {
    const d = new Date(t0 + (i + 0.5) * DAY);
    ctx.fillText(dayNames[d.getUTCDay()], pad.l + i * bw + bw / 2 - 8, H - 1);
  }
}

function drawTimeline() {
  const cv = $('tlCanvas');
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !S.counts) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const t0 = Date.UTC(1970, 0, 1), t1 = S.tMax * 1000;
  const x = ms => ((ms - t0) / (t1 - t0)) * W;
  let maxC = 10;
  for (const v of S.counts) if (v > maxC) maxC = v;

  const bw = Math.max(1.2, W / S.counts.length - 0.4);
  ctx.fillStyle = 'rgba(94,168,255,.75)';
  for (let i = 0; i < S.counts.length; i++) {
    const ms = S.countsStart + i * MONTH;
    if (ms < S.winStart || ms > S.winEnd) continue;
    const h = (S.counts[i] / maxC) * (H - 14);
    ctx.fillRect(x(ms), H - 4 - h, bw, h);
  }
  ctx.fillStyle = 'rgba(5,8,16,.62)';
  ctx.fillRect(0, 0, Math.max(0, x(S.winStart)), H);
  const xe = Math.min(W, x(S.winEnd));
  ctx.fillRect(xe, 0, W - xe, H);
  ctx.fillStyle = '#ffb86b';
  ctx.fillRect(Math.max(0, x(S.winStart) - 1), 0, 2, H);
  ctx.fillRect(xe - 1, 0, 2, H);

  // sunspot cycle strip
  if (S.sunStrip && SILSO && SILSO.length) {
    let maxSn = 1;
    for (const r of SILSO) if (r.sn > maxSn) maxSn = r.sn;
    const bandTop = H - 26;
    ctx.strokeStyle = 'rgba(255,184,107,.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let started = false;
    for (const r of SILSO) {
      if (r.t < t0 || r.t > t1) continue;
      const xx = x(r.t), yy = bandTop - (r.sn / maxSn) * 20;
      if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,184,107,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x(t0), bandTop); ctx.lineTo(W, bandTop); ctx.stroke();
    ctx.fillStyle = 'rgba(255,184,107,.8)';
    ctx.font = '9px Segoe UI';
    ctx.fillText('sunspot cycle', W - 76, bandTop - 2);
  }

  // flare / CME timeline markers — events stay discoverable even when the map
  // suppresses single-instant footprints in wide windows. Ticks near the top.
  const mkTop = 6;
  if (S.flareHistFC && S.flareHistFC.length) {
    ctx.fillStyle = 'rgba(255,140,26,.85)';
    for (const f of S.flareHistFC) {
      const mt = Date.parse(f.properties.t);
      if (isNaN(mt) || mt < t0 || mt > t1) continue;
      ctx.fillRect(x(mt) - 1, mkTop, 2, 5);
    }
  }
  if (S.cmeHistFC && S.cmeHistFC.length) {
    ctx.fillStyle = 'rgba(94,214,192,.85)';
    for (const f of S.cmeHistFC) {
      const mt = f.properties.t;
      if (isNaN(mt) || mt < t0 || mt > t1) continue;
      ctx.fillRect(x(mt) - 1, mkTop + 7, 2, 5);
    }
  }

  // yearly sunspot total bars
  if (S.sunBars && SILSO && SILSO.length) {
    const start = Date.UTC(1970, 0, 1);
    const endYear = new Date(t1).getUTCFullYear();
    const yearTotals = {};
    for (const r of SILSO) {
      if (r.t < t0 || r.t > t1) continue;
      const yr = new Date(r.t).getUTCFullYear();
      if (yr < 1970) continue;
      yearTotals[yr] = (yearTotals[yr] || 0) + r.sn;
    }
    let maxYear = 1;
    for (const yr in yearTotals) if (yearTotals[yr] > maxYear) maxYear = yearTotals[yr];
    const barH = H - 16;
    for (let yr = 1970; yr <= endYear; yr++) {
      const val = yearTotals[yr] || 0;
      if (!val) continue;
      const x0 = x(Date.UTC(yr, 0, 1));
      const x1 = x(Date.UTC(yr + 1, 0, 1));
      const bw = Math.max(1, x1 - x0 - 1);
      const h = (val / maxYear) * barH;
      ctx.fillStyle = 'rgba(255,184,107,.3)';
      ctx.fillRect(x0, H - 4 - h, bw, h);
    }
    ctx.fillStyle = 'rgba(255,184,107,.7)';
    ctx.font = '9px Segoe UI';
    ctx.fillText('yearly sunspot total', W - 100, 14);
  }

  ctx.fillStyle = '#55608a';
  ctx.font = '10px Segoe UI';
  const yStep = W > 900 ? 10 : 20;
  for (let yy = 1970; yy <= new Date(t1).getUTCFullYear(); yy++) {
    if (yy % yStep) continue;
    ctx.fillText(String(yy), x(Date.UTC(yy, 0, 1)) + 2, H - 4);
  }
  drawSparkline();
}

/* ---------- live layers ---------- */
const HZ_COLORS = { TC: '#9b6bff', FL: '#4fc3f7', WF: '#ff8a3d', VO: '#ff2e63', DR: '#ffd166' };
const HZ_ON = Object.assign(
  { TC: true, FL: true, WF: false, VO: true, DR: true },   // wildfires default off
  JSON.parse(localStorage.getItem('ct_hz') || '{}')
);
function saveHz() { localStorage.setItem('ct_hz', JSON.stringify(HZ_ON)); }
function applyHz() {
  if (!S.map || !S.map.getLayer('hazards-circle')) return;
  const on = Object.keys(HZ_ON).filter(k => HZ_ON[k]);
  if (!$('lyHazards').checked || !on.length) {
    S.map.setLayoutProperty('hazards-circle', 'visibility', 'none');
    return;
  }
  S.map.setLayoutProperty('hazards-circle', 'visibility', 'visible');
  S.map.setFilter('hazards-circle', ['in', ['get', 'k'], ['literal', on]]);
}

async function loadLive24() {
  try {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    const gj = await res.json();
    S.map.getSource('live24').setData(gj);
    log('live 24h loaded: ' + gj.features.length);
  } catch (e) { console.error('live24 failed:', e.message || e); }
}

function parseGdacs(xml) {
  const feats = [];
  const items = xml.split(/<item>/).slice(1);
  for (const it of items.slice(0, 250)) {
    const title = (it.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || it.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const link = (it.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const lat = parseFloat((it.match(/<geo:lat>(-?[\d.]+)<\/geo:lat>/) || [])[1]);
    const lon = parseFloat((it.match(/<geo:long>(-?[\d.]+)<\/geo:long>/) || [])[1]);
    let k = 'OT';
    const mType = link.match(/[?&]eventtype=([A-Z]+)/i);
    if (mType) k = mType[1].toUpperCase();
    else {
      const t2 = title.toUpperCase();
      if (/TROPICAL|CYCLONE|TC\b/.test(t2)) k = 'TC';
      else if (/FLOOD/.test(t2)) k = 'FL';
      else if (/WILDFIRE|FIRE/.test(t2)) k = 'WF';
      else if (/VOLCAN|ERUPTION/.test(t2)) k = 'VO';
      else if (/DROUGHT/.test(t2)) k = 'DR';
    }
    if (!isFinite(lat) || !isFinite(lon)) continue;
    feats.push({ type: 'Feature', properties: { title: title.trim(), k }, geometry: { type: 'Point', coordinates: [lon, lat] } });
  }
  return feats;
}

async function loadHazards() {
  try {
    const r = await window.ct.fetchText('https://www.gdacs.org/xml/rss.xml');
    if (!r.ok) throw new Error('status ' + r.status);
    const feats = parseGdacs(r.body);
    S.map.getSource('hazards').setData({ type: 'FeatureCollection', features: feats });
    log('gdacs hazards loaded: ' + feats.length);
  } catch (e) { console.error('gdacs failed:', e.message || e); }
}

function wirePopups() {
  const pop = (name, fmtP) => {
    S.map.on('click', name, e => {
      const p = e.features && e.features[0];
      if (!p) return;
      new maplibregl.Popup({ closeButton: false, maxWidth: '260px' })
        .setLngLat(p.geometry.coordinates)
        .setHTML(fmtP(p.properties))
        .addTo(S.map);
    });
    S.map.on('mouseenter', name, () => S.map.getCanvas().style.cursor = 'pointer');
    S.map.on('mouseleave', name, () => S.map.getCanvas().style.cursor = '');
  };
  pop('hazards-circle', pr => '<div class="pp"><b>' + (HZ_COLORS[pr.k] ? pr.k : 'EVENT') + '</b> ' + (pr.title || '') + '</div>');
  pop('volcs-circle', pr => {
    if (!S.volcs) return '<div class="pp">volcano</div>';
    const i = S.volcsByNum.get(pr.n);
    const a = S.volcs.v[i];
    if (!a) return '<div class="pp">volcano</div>';
    return '<div class="pp"><b>' + a[1] + '</b><br>' + (a[5] || '') +
      '<br>last known eruption: ' + (a[4] != null ? a[4] : 'unknown') +
      '<br>GVP #' + a[0] + '</div>';
  });
  pop('live24-circle', pr => {
    const d = new Date(pr.time || Date.now());
    return '<div class="pp"><b>M' + (+pr.mag).toFixed(1) + '</b> live<br>' +
      (pr.place || '') + '<br>' + d.toLocaleString('en-AU') + '</div>';
  });
  pop('cme-fill', pr => '<div class="pp"><b>☄ CME arrival footprint</b><br>' + (pr.label || '') + '</div>');
  pop('cme-line', pr => '<div class="pp"><b>☄ CME arrival footprint</b><br>' + (pr.label || '') + '</div>');
  pop('cmeghost-line', pr => '<div class="pp"><b>☄ CME (predicted)</b><br>' + (pr.label || '') + '</div>');
  pop('cme-hist-fill', pr => '<div class="pp"><b>✔ CME impact (known)</b><br>' + (pr.label || '') + '</div>');
  pop('flare-hist-fill', pr => '<div class="pp"><b>☀ ' + (pr.cls || 'flare') + ' (past)</b><br>' + (pr.label || '') + '</div>');
  pop('flare-fill', pr => '<div class="pp"><b>☀ ' + (pr.cls || 'flare') + '</b><br>' + (pr.label || '') + '</div>');
  pop('flare-line', pr => '<div class="pp"><b>☀ ' + (pr.cls || 'flare') + '</b><br>' + (pr.label || '') + '</div>');
}

/* ---------- volcanoes (Smithsonian GVP VOTW) ---------- */
async function loadVolcs() {
  try {
    const data = await window.ct.geoLayer('volcs.json');
    S.volcs = data;
    const byNum = new Map(data.v.map((a, i) => [a[0], i]));
    S.volcsByNum = byNum;
    S.map.getSource('volcs').setData({
      type: 'FeatureCollection',
      features: data.v.map(a => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a[3], a[2]] },
        properties: { n: a[0] }
      }))
    });
    log('volcanoes loaded: ' + data.v.length + ', eruptions since 1970: ' + data.e.length);
  } catch (e) { log('volcanoes failed: ' + (e.message || e)); }
}

/* ---------- sun/moon same-side (new moon) windows, ±3 days ---------- */
const SYZ_DEG = 37;                        // lunar–solar elongation covered in ~3 d (≈12.2°/d)
const RD = Math.PI / 180;
function _norm360(x) { x %= 360; return x < 0 ? x + 360 : x; }
function syzElongDeg(ms) {
  /* Meeus low-precision geocentric ecliptic longitudes — ample for a ±3-day window. */
  const T = (ms / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const g = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const sl = _norm360(L0 + 1.914602 * Math.sin(g * RD) + 0.019993 * Math.sin(2 * g * RD) + 0.000289 * Math.sin(3 * g * RD));
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
  const Ms = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
  const F = 93.2720993 + 483202.0175273 * T - 0.0034029 * T * T;
  const ml = _norm360(Lp
    + 6.288775 * Math.sin(Mp * RD)
    + 1.274018 * Math.sin((2 * D - Mp) * RD)
    + 0.658309 * Math.sin(2 * D * RD)
    + 0.213616 * Math.sin(2 * Mp * RD)
    - 0.185596 * Math.sin(Ms * RD)
    - 0.114336 * Math.sin(2 * F * RD)
    + 0.058793 * Math.sin((2 * D - 2 * Mp) * RD)
    + 0.057212 * Math.sin((2 * D - Ms - Mp) * RD)
    + 0.05332 * Math.sin((2 * D + Mp) * RD));
  let el = Math.abs(_norm360(ml - sl));
  if (el > 180) el = 360 - el;
  return el;
}
function computeSyzygy() {
  if (!S.q || !S.volcs || S.q.syz) return;
  const t = S.q.t, syz = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) {
    if (syzElongDeg(t[i] * 1000) <= SYZ_DEG) syz[i] = 1;
  }
  S.q.syz = syz;
  const e = S.volcs.e, es = new Uint8Array(e.length);
  for (let i = 0; i < e.length; i++) {
    const mo = e[i][1];
    if (mo == null) continue;
    if (syzElongDeg(Date.UTC(e[i][0], mo - 1, 15)) <= SYZ_DEG) es[i] = 1;
  }
  S.eruptionSyz = es;
  log('syzygy windows scanned: ' + t.length + ' quakes + ' + e.length + ' eruptions (±3 d of a new moon)');
}
function syzColorExpr() {
  const mag = ['step', ['get', 'm'], '#ffd166', 5.5, '#ff9f43', 6.5, '#ff6b6b', 7.5, '#ff2e63'];
  const on = (typeof SET === 'undefined' || SET.syz !== 'off');
  return on ? ['case', ['==', ['get', 'g'], 1], '#fff2b0', mag] : mag;
}

/* ---------- settings ---------- */
const SET = Object.assign(
  { speech: 'on', poll: '5', speed: '10', donkiYears: '5', syz: 'on' },
  JSON.parse(localStorage.getItem('ct_settings') || '{}')
);
function saveSet() { localStorage.setItem('ct_settings', JSON.stringify(SET)); }
function applySet() {
  $('setSpeech').value = SET.speech;
  $('setPoll').value = SET.poll;
  $('setSpeed').value = SET.speed;
  if ($('setSyz')) $('setSyz').checked = SET.syz !== 'off';
  restartPoll();
}
function speak(txt) {
  if (SET.speech !== 'on' || !('speechSynthesis' in window)) return;
  try { window.speechSynthesis.speak(new SpeechSynthesisUtterance(txt)); } catch (e) { }
}

/* ---------- notification bubbles + attention ring ---------- */
let ringTimer = null;
function flashRing(ll) {
  const src = S.map.getSource('alertring');
  if (!src) return;
  src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: ll }, properties: {} }] });
  S.map.setLayoutProperty('alert-ring', 'visibility', 'visible');
  const t0 = performance.now();
  clearInterval(ringTimer);
  ringTimer = setInterval(() => {
    const dt = (performance.now() - t0) / 1000;
    if (dt >= 5) {
      clearInterval(ringTimer);
      S.map.setLayoutProperty('alert-ring', 'visibility', 'none');
      src.setData(emptyFC());
      return;
    }
    S.map.setPaintProperty('alert-ring', 'circle-radius', 12 + 6 * Math.abs(Math.sin(dt * Math.PI / 0.625)));
    S.map.setPaintProperty('alert-ring', 'circle-stroke-opacity', dt > 4 ? (5 - dt) : 0.9);
  }, 80);
}
function notify(title, text, ll) {
  speak(title + '. ' + String(text).replace(/<[^>]+>/g, ' '));  const el = document.createElement('div');
  el.className = 'notif';
  el.innerHTML = '<div class="nt">' + title + '</div><div class="nx">' + text + '</div><button class="nclose">×</button>';
  const kill = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  el.querySelector('.nclose').addEventListener('click', ev => { ev.stopPropagation(); kill(); });
  el.addEventListener('click', () => {
    if (ll) {
      try { S.map.flyTo({ center: ll, zoom: Math.max(S.map.getZoom(), 4), duration: 1400 }); } catch (e) { }
      flashRing(ll);
    }
    kill();
  });
  $('notifyStack').appendChild(el);
  setTimeout(kill, 12000);
}

/* 'live' means truly at today's 24 h window — not just the d1 span. If the user has
   dragged the timeline back (or the window doesn't end at the present), nothing is
   "live": forecast CMEs, live24 dots and all pulsing must stand down. */
function isLive() {
  const now = Date.now();
  return S.spanKey === 'd1' && !S.playing && (now - S.winEnd) < 6 * 3600e3;
}

/* gentle breathing glow for solar event layers — per-event phase so they don't pulse in unison */
let glowT = 0;
setInterval(() => {
  if (!S.map || !S.map.getLayer('flare-fill')) return;
  glowT += 0.11;
  const live = isLive();
  try {
    if (live && $('lyFlares').checked) {
      S.map.setPaintProperty('flare-fill', 'fill-opacity', ['*', 0.16, ['+', 0.7, ['*', 0.5, ['cos', ['+', ['get', 'ph'], glowT]]]]]);
      S.map.setPaintProperty('flare-line', 'line-opacity', ['*', 0.4, ['+', 0.7, ['*', 0.5, ['cos', ['+', ['get', 'ph'], glowT * 1.13]]]]]);
    }
    if (live && $('lyCMEs').checked) {
      S.map.setPaintProperty('cme-fill', 'fill-opacity', ['*', ['coalesce', ['get', 'a'], 0.5], ['+', 0.75, ['*', 0.45, ['cos', ['+', ['get', 'ph'], glowT]]]]]);
      S.map.setPaintProperty('cme-line', 'line-opacity', ['*', ['coalesce', ['get', 'a'], 0.4], ['+', 0.75, ['*', 0.45, ['cos', ['+', ['get', 'ph'], glowT * 1.07]]]]]);
    }
  } catch (e) { }
}, 120);

/* ---------- capital cities ---------- */
async function loadCapitals() {
  try {
    const data = await window.ct.geoLayer('capitals.json');
    S.capitals = data.c
      .map(a => ({ name: a[0], country: a[1], ll: [a[3], a[2]], pop: a[4], area: a[5], gdp: a[6] }));
    S.map.getSource('capitals').setData({
      type: 'FeatureCollection',
      features: S.capitals.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c.ll }, properties: { n: c.name } }))
    });
    log('capitals loaded: ' + S.capitals.length);
  } catch (e) { log('capitals failed: ' + (e.message || e)); }
}
function capPopupHTML(c) {
  const row = (k, v) => v ? '<div class="row"><span>' + k + '</span><span>' + v + '</span></div>' : '';
  return '<b class="t">' + c.name + '</b>' +
    '<div class="row"><span>Country</span><span>' + c.country + '</span></div>' +
    row('Population (metro)', c.pop ? c.pop + ' M' : '') +
    row('City area', c.area ? c.area.toLocaleString('en-AU') + ' km²' : '') +
    row('Metro GDP (approx)', c.gdp ? 'US$' + c.gdp + ' B' : '') +
    '<div style="margin-top:7px;color:#55608a;font-size:10.5px">click anywhere else to close</div>';
}
function wireCapitals() {
  S.map.on('click', 'capitals-circle', e => {
    const p = e.features && e.features[0];
    if (!p || !S.capitals) return;
    S._capHit = true; setTimeout(() => S._capHit = false, 60);
    const c = S.capitals.find(x => x.name === p.properties.n);
    if (!c) return;
    const box = $('capPopup');
    box.innerHTML = capPopupHTML(c);
    box.classList.remove('hidden');
    speak(c.name + ', capital region of ' + c.country.replace(/ \(.+\)$/, '') +
      (c.pop ? '. Population about ' + c.pop + ' million.' : '') +
      (c.gdp ? '. Metro G D P around ' + c.gdp + ' billion US dollars.' : ''));
  });
  S.map.on('click', () => { if (!S._capHit) $('capPopup').classList.add('hidden'); });
}

/* ---------- new-event watcher ---------- */
const seen = new Set(JSON.parse(localStorage.getItem('ct_seen') || '[]'));
const rememberSeen = () => localStorage.setItem('ct_seen', JSON.stringify([...seen].slice(-500)));
async function checkNew(quiet) {
  try {
    const r = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    if (r.ok) {
      const j = await r.json();
      let n = 0;
      for (const f of j.features || []) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        const m = f.properties.mag || 0, t = f.properties.time || Date.now();
        if (!quiet && m >= 4.5 && f.geometry && f.geometry.coordinates) {
          n++;
          notify('M' + (+m).toFixed(1) + ' earthquake',
            (f.properties.place || 'location unavailable') + ' · ' + new Date(t).toLocaleTimeString('en-AU'),
            f.geometry.coordinates);
        }
      }
      rememberSeen();
      if (n) log('new quake notifications: ' + n);
    }
    const g = await window.ct.fetchText('https://www.gdacs.org/xml/rss.xml');
    if (g.ok) {
      const doc = new DOMParser().parseFromString(g.body, 'text/xml');
      let hn = 0;
      for (const it of [...doc.querySelectorAll('item')]) {
        const guidEl = it.querySelector('guid'), linkEl = it.querySelector('link'), titleEl = it.querySelector('title');
        const key = (guidEl && guidEl.textContent) || (linkEl && linkEl.textContent) || (titleEl && titleEl.textContent);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const pd = Date.parse((it.querySelector('pubDate') || {}).textContent || '');
        if (!quiet && !isNaN(pd) && Date.now() - pd < 36 * 3600e3) {
          hn++;
          const latEl = it.getElementsByTagName('geo:lat')[0];
          const lonEl = it.getElementsByTagName('geo:long')[0];
          const ll = latEl && lonEl ? [parseFloat(lonEl.textContent), parseFloat(latEl.textContent)] : null;
          notify('New GDACS alert', (titleEl && titleEl.textContent) || 'hazard event', ll);
        }
      }
      rememberSeen();
      if (hn) log('new gdacs notifications: ' + hn);
    }
  } catch (e) { log('checkNew error: ' + (e.message || e)); }
}
let pollT = null;
function restartPoll() {
  if (pollT) { clearInterval(pollT); pollT = null; }
  if (SET.poll === 'load') return;
  pollT = setInterval(() => checkNew(false), parseInt(SET.poll, 10) * 60000);
}
function liveJump() {
  stopPlay();
  document.querySelectorAll('.spans button').forEach(x => x.classList.remove('on'));
  const d1 = document.querySelector('.spans button[data-span="d1"]');
  if (d1) d1.classList.add('on');
  setSpan('d1');
  $('lyLive24').checked = true; $('lyHazards').checked = true;
  applySidebar();
  checkNew(false);
}

/* ---------- solar flares: dayside footprint splotches (DONKI FLR) ---------- */
function mapCMEs() {
  if (!S.map || !S.cmeRows) return;
  const now = Date.now();
  const live = isLive();
  if (live) {
    const active = [], ghosts = [];
    for (const r of S.cmeRows) {
      if (!r.earth || !r.arrival) continue;
      const at = Date.parse(r.arrival);
      if (isNaN(at)) continue;
      const dtH = (at - now) / 3600e3;
      if (dtH > 48 && dtH <= 168) {
        const f = ringBand(subsolar(at), 34, 54);
        f.properties.label = 'CME · ' + r.speed + ' km/s · arrives ' + String(r.t).slice(0, 10);
        ghosts.push(f);
      } else if (dtH >= -24 && dtH <= 48) {
        const f = ringBand(subsolar(at), 34, 54);
        f.properties.a = Math.max(0.15, dtH >= 0 ? dtH / 48 : 1 + dtH / 24);
        f.properties.ph = (Math.abs(at) % 6283) / 1000;   // stable per-event pulse phase
        f.properties.label = 'CME · ' + r.speed + ' km/s · ' + (dtH >= 0 ? 'arrives in ' + Math.round(dtH) + ' h' : 'arrived ' + Math.round(-dtH) + ' h ago');
        active.push(f);
      }
    }
    S.map.getSource('cmes').setData({ type: 'FeatureCollection', features: active });
    S.map.getSource('cmeghost').setData({ type: 'FeatureCollection', features: ghosts });
  } else {
    S.map.getSource('cmes').setData({ type: 'FeatureCollection', features: [] });
    S.map.getSource('cmeghost').setData({ type: 'FeatureCollection', features: [] });
  }
  mapSolarHist();
}
setInterval(mapCMEs, 5 * 60 * 1000);   // lifecycle follows the clock

/* historical (post-impact) splotches — visible whenever the view is not the 24-48 h live window */
let solarHistT = 0;
function mapSolarHist() {
  if (!S.map || !S.map.getSource('cmehist')) return;
  const now = Date.now();
  if (solarHistT && now - solarHistT < 1500) return;   // throttle during playback sweeps
  solarHistT = now;
  const lo = S.winStart, hi = S.winEnd;
  // a single-instant footprint only makes sense in a narrow window; in wider ranges we
  // suppress the geoblobs entirely (the events stay visible as timeline markers).
  const narrow = S.spanKey === 'd1' || S.spanKey === 'd7';
  const histFeatures = (S.cmeHistFC || []).filter(f => (narrow && f.properties.t >= lo && f.properties.t <= hi));
  S.map.getSource('cmehist').setData({ type: 'FeatureCollection', features: histFeatures });
  if (S.map.getSource('flarehist')) {
    const flareFeatures = (S.flareHistFC || []).filter(f => (narrow && f.properties.t >= lo && f.properties.t <= hi));
    S.map.getSource('flarehist').setData({ type: 'FeatureCollection', features: flareFeatures });
  }
}
function rebuildCMEHistFC() {
  const rows = (S.cmeHistRows && S.cmeHistRows.length) ? S.cmeHistRows : (S.cmeRows || []);
  const feats = [];
  for (const r of rows) {
    if (!r.earth || !r.arrival) continue;
    const at = Date.parse(r.arrival);
    if (isNaN(at)) continue;
    const f = ringBand(subsolar(at), 34, 54);
    f.properties.t = at;
    f.properties.speed = r.speed;
    f.properties.label = 'launch ' + String(r.t).slice(0, 10) + ' · arrived ' + new Date(at).toISOString().slice(0, 10) + ' UTC';
    feats.push(f);
  }
  S.cmeHistFC = feats;
}
async function loadSolarHist() {
  try {
    const cmes = await window.ct.donkiHistoryRead('CME');
    if (cmes.ok && cmes.data && cmes.data.length) {
      S.cmeHistRows = processCME(cmes.data);
      log('CME impact history: ' + S.cmeHistRows.length + ' earth-directed');
    }
    const flrs = await window.ct.donkiHistoryRead('FLR');
    if (flrs.ok && flrs.data && flrs.data.length) {
      S.flareHistFC = processFLR(flrs.data);
      log('FLR history polygons: ' + S.flareHistFC.length);
    }
  } catch (e) { log('solar history unavailable: ' + (e.message || e)); }
  rebuildCMEHistFC();
  mapSolarHist();
  if (typeof drawTimeline === 'function') drawTimeline();
}
function subsolar(ms) {
  const d = new Date(ms);
  const doy = Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  const decl = 23.44 * Math.sin(2 * Math.PI * (doy - 81) / 365.25);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return [-(h - 12) * 15, decl];   // [lng, lat]
}
function capPolygon(centerLL, radDeg) {
  const pts = [];
  const lat1 = centerLL[1] * Math.PI / 180, lon1 = centerLL[0] * Math.PI / 180;
  const ang = radDeg * Math.PI / 180;
  for (let b = 0; b <= 360; b += 6) {
    const brg = b * Math.PI / 180;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brg));
    const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(ang) * Math.cos(lat1), Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2));
    pts.push([((lon2 * 180 / Math.PI + 540) % 360) - 180, lat2 * 180 / Math.PI]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
}
function ringBand(centerLL, rInDeg, rOutDeg) {
  const outer = capPolygon(centerLL, rOutDeg).geometry.coordinates[0];
  const inner = capPolygon(centerLL, rInDeg).geometry.coordinates[0].reverse();
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [outer, inner] }, properties: {} };
}
async function loadFlares() {
  const box = $('flrBox');
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const url = 'https://api.nasa.gov/DONKI/FLR?startDate=' + start + '&endDate=' + end + '&api_key=DEMO_KEY';

  function renderFlares(list) {
    const mx = list.filter(f => /^[MX]/.test(f.classType || ''));
    mx.sort((a, b) => Date.parse(b.peakTime || b.beginTime) - Date.parse(a.peakTime || a.beginTime));
    const feats = mx.map(f => {
      const t = Date.parse(f.peakTime || f.beginTime);
      const big = /^X/.test(f.classType);
      const poly = capPolygon(subsolar(t), big ? 38 : 28);
      poly.properties.ph = (Math.abs(t) % 6283) / 1000;
      return poly;
    });
    feats.forEach((f, i) => {
      f.properties.cls = mx[i].classType;
      f.properties.t = mx[i].peakTime || mx[i].beginTime;
      f.properties.label = mx[i].classType + ' flare · ' + String(f.properties.t).slice(0, 16).replace('T', ' ') + ' UTC · AR' + (mx[i].activeRegionNum || '?');
    });
    S.flareFC = { type: 'FeatureCollection', features: feats };
    S.map.getSource('flares').setData(S.flareFC);
    if (!S.flareHistFC) S.flareHistFC = feats.filter(f => Date.parse(f.properties.t) <= Date.now());
    mapSolarHist();
    box.innerHTML = '<div style="color:#55608a;margin-bottom:4px">' + mx.length +
      ' M/X-class flares in last 30 days — each blob is the sunlit face of Earth at flare peak (the region an EUV/ionospheric hit lands on). Click to highlight.</div>' +
      mx.slice(0, 12).map((f, i) =>
        '<div class="flr-item" data-i="' + i + '">' +
        '<span class="' + (/^X/.test(f.classType) ? 'flr-x' : 'flr-m') + '">' + f.classType + '</span> · ' +
        String(f.peakTime || f.beginTime).slice(0, 16).replace('T', ' ') + ' UTC · AR' + (f.activeRegionNum || '?') +
        '</div>').join('');
    [...box.querySelectorAll('.flr-item')].forEach(el => el.addEventListener('click', () => {
      const i = +el.dataset.i;
      S.map.flyTo({ center: subsolar(Date.parse(mx[i].peakTime || mx[i].beginTime)), zoom: 2.2, duration: 1200 });
      flashRing(subsolar(Date.parse(mx[i].peakTime || mx[i].beginTime)));
    }));
  }

  try {
    const cached = await window.ct.donkiLoadCache('FLR');
    if (cached.ok && cached.data.length) {
      renderFlares(cached.data);
      log('flares loaded from cache: ' + cached.data.length);
      if (!cached.stale) return;
    }
    const r = await window.ct.donki(url);
    if (!r.ok) throw new Error('status ' + r.status);
    const list = JSON.parse(r.body);
    await window.ct.donkiSaveCache('FLR', list);
    renderFlares(list);
    log('flares refreshed from API: ' + list.length);
  } catch (e) {
    console.error('flares failed:', e.message || e);
    box.innerHTML = 'flare feed unavailable (' + (e.message || e) + ')';
  }
}

/* ---------- DONKI deep-history (manual, per-chunk, yields between requests) ---------- */
function processCME(list) {
  const rows = [];
  for (const c of list) {
    const a = ((c.cmeAnalyses || []).filter(x => x.isMostAccurate)[0]) || (c.cmeAnalyses || [])[0];
    if (!a) continue;
    let earth = false, arrival = null;
    for (const e of (a.enlilList || [])) {
      if (e.isEarthGB) earth = true;
      if (e.estimatedShockArrivalTime) arrival = e.estimatedShockArrivalTime;
      for (const im of (e.impactList || [])) {
        if (/earth/i.test(im.location || '')) { earth = true; if (!arrival && im.arrivalTime) arrival = im.arrivalTime; }
      }
    }
    rows.push({ t: c.startTime, speed: a.speed, ha: a.halfAngle, lat: a.latitude, lon: a.longitude, earth, arrival });
  }
  return rows;
}

function processFLR(list) {
  return list.filter(f => /^[MX]/.test(f.classType || '')).map(f => {
    const t = Date.parse(f.peakTime || f.beginTime);
    const big = /^X/.test(f.classType);
    const poly = capPolygon(subsolar(t), big ? 38 : 28);
    poly.properties.ph = (Math.abs(t) % 6283) / 1000;
    poly.properties.cls = f.classType;
    poly.properties.t = f.peakTime || f.beginTime;
    return poly;
  });
}

function yieldMs(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadDonkiHistory() {
  const statusEl = $('cmeStatus');
  const btn = $('donkiFetchBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'fetching…'; }
  const yrs = parseInt(SET.donkiYears || '5', 10);
  const totalChunks = Math.ceil(yrs * 365.25 / 90);
  const endDt = new Date();
  const startDt = new Date(endDt.getTime() - yrs * 365.25 * 864e5);

  for (const type of ['CME', 'FLR']) {
    if (statusEl) statusEl.textContent = type + ': checking cache…';
    const info = await window.ct.donkiHistoryInfo(type);
    const existingSet = new Set((info.count > 0) ? [] : []);
    let existing = [];
    if (info.count > 0) {
      const cached = await window.ct.donkiHistoryInfo(type);
      existing = []; // will re-read from save
    }
    // Read existing from save handler to get the actual data
    const savedData = await window.ct.donkiHistoryInfo(type);
    const existingLastT = savedData.lastTime || 0;
    const cursor = new Date(Math.max(startDt.getTime(), existingLastT));
    const fetched = [];
    let chunkIdx = 0;
    let cur = new Date(cursor);
    while (cur < endDt) {
      const chunkEnd = new Date(Math.min(cur.getTime() + 90 * 864e5, endDt.getTime()));
      const s = cur.toISOString().slice(0, 10);
      const e = chunkEnd.toISOString().slice(0, 10);
      if (statusEl) statusEl.textContent = type + ': chunk ' + (chunkIdx + 1) + '/' + totalChunks + ' (' + s + ' → ' + e + ')';
      const batch = await window.ct.donkiChunk(type, s, e);
      for (const item of batch) fetched.push(item);
      chunkIdx++;
      cur = new Date(chunkEnd.getTime() + 864e5);
      await yieldMs(3500); // rate-limit: ~4s per request
      // yield to renderer so UI stays responsive
      await yieldMs(0);
    }
    // Dedup and merge
    const merged = [];
    const seenIds = new Set();
    // Load existing from disk via a full read (we only have metadata, not data)
    // Actually we need the data too. Let's reconstruct from fetched + last save.
    // Simpler: just save fetched, the caller will re-merge
    if (statusEl) statusEl.textContent = type + ': saving ' + fetched.length + ' events…';
    await window.ct.donkiHistorySave(type, fetched);
    log('donki-history ' + type + ': ' + fetched.length + ' events fetched');
  }
  if (statusEl) statusEl.textContent = 'history fetch complete — reloading…';
  if (btn) { btn.textContent = 'done — reloading…'; }
  await yieldMs(1200);
  location.reload();
}

/* ---------- silso sunspots + correlation ---------- */
function pearson(a, b) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.length; i++) {
    n++; sa += a[i]; sb += b[i];
    saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i];
  }
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  return (va > 0 && vb > 0) ? cov / Math.sqrt(va * vb) : NaN;
}

let SILSO = null;
async function loadKp() {
  try {
    S.kpIdx = await window.ct.kpIndices();
    const n = S.kpIdx.kpM.filter(v => v != null).length;
    log('kp/f10.7 loaded: ' + n + ' months since 1970');
  } catch (e) { console.error('kp failed:', e.message || e); }
}
async function loadSilso() {  try {
    SILSO = await window.ct.silso();
    const startM = Date.UTC(1970, 0, 1);
    const months = Math.ceil((S.tMax * 1000 - startM) / MONTH) + 1;
    const sn = new Array(months).fill(NaN);
    for (const r of SILSO) {
      const mi = Math.floor((r.t - startM) / MONTH);
      if (mi >= 0 && mi < months) sn[mi] = r.sn;
    }
    const qc = new Array(months).fill(0);
    for (let i = 0; i < S.q.t.length; i++) {
      const mi = Math.floor((S.q.t[i] * 1000 - startM) / MONTH);
      if (mi >= 0 && mi < months) qc[mi]++;
    }
    const A = [], B = [];
    for (let i = 0; i < months; i++) if (isFinite(sn[i])) { A.push(sn[i]); B.push(qc[i]); }
    const r = pearson(A, B);
    $('corrStat').innerHTML =
      'First correlation test — monthly sunspots vs quake count (' + A.length.toLocaleString() + ' months):<br>' +
      'Pearson r = <b>' + r.toFixed(3) + '</b> · exploratory, no lag applied';
    log('silso loaded: ' + SILSO.length + ' months, r=' + r.toFixed(3));
  } catch (e) { console.error('silso failed:', e.message || e); }
}

/* ---------- correlation lab ---------- */
function buildMonthlySeries(key) {
  const start = Date.UTC(1970, 0, 1);
  const months = Math.ceil((S.tMax * 1000 - start) / MONTH) + 1;
  const s = new Float64Array(months);
  if (key === 'qcount' || key === 'qenergy' || key === 'qmaj') {
    for (let i = 0; i < S.q.t.length; i++) {
      const mi = Math.floor((S.q.t[i] * 1000 - start) / MONTH);
      if (mi < 0 || mi >= months) continue;
      if (key === 'qcount') s[mi]++;
      else if (key === 'qmaj') { if (S.q.m[i] >= 6) s[mi]++; }
      else s[mi] += Math.pow(10, 1.5 * S.q.m[i] + 4.8);
    }
    return { v: Array.from(s), t0: start };
  }
  if (key === 'sn' && SILSO) {
    const out = new Array(months).fill(null);
    for (const r of SILSO) {
      const mi = Math.floor((r.t - start) / MONTH);
      if (mi >= 0 && mi < months) out[mi] = r.sn;
    }
    return { v: out, t0: start };
  }
  if ((key === 'kp' || key === 'f107') && S.kpIdx) {
    const arr = key === 'kp' ? S.kpIdx.kpM : S.kpIdx.f107M;
    return { v: arr.slice(), t0: S.kpIdx.start };
  }
  if (key === 've') {
    if (!S.volcs) return { v: [], t0: start };
    const out = new Array(months).fill(0);
    for (const e of S.volcs.e) {
      if (e[1] == null) continue;
      const mi = Math.floor((Date.UTC(e[0], e[1] - 1, 15) - start) / MONTH);
      if (mi >= 0 && mi < months) out[mi]++;
    }
    return { v: out, t0: start };
  }
  return { v: [], t0: start };
}

function corrAtLag(A, B, lag) {
  const xs = [], ys = [];
  for (let i = 0; i < A.length; i++) {
    const j = i + lag;
    if (j < 0 || j >= B.length) continue;
    if (A[i] == null || B[j] == null) continue;
    xs.push(A[i]); ys.push(B[j]);
  }
  return { r: pearson(xs, ys), n: xs.length };
}

let LAG_CURVE = null, LAG_META = null, TW_RESULT = null;
function computeLab() {
  const A = buildMonthlySeries($('varA').value);
  const B = buildMonthlySeries($('varB').value);
  if (!A.v.length || !B.v.length) { $('anaOut').textContent = 'Series unavailable.'; return; }
  const lag = parseInt($('lagR').value, 10);
  $('lagVal').textContent = lag;

  const lo = -24, hi = 36;
  LAG_CURVE = [];
  for (let l = lo; l <= hi; l++) LAG_CURVE.push({ lag: l, ...corrAtLag(A.v, B.v, l) });

  const cur = corrAtLag(A.v, B.v, lag);

  // permutation significance at current lag
  const xs = [], ys = [];
  for (let i = 0; i < A.v.length; i++) {
    const j = i + lag;
    if (j < 0 || j >= B.v.length) continue;
    if (A.v[i] == null || B.v[j] == null) continue;
    xs.push(A.v[i]); ys.push(B.v[j]);
  }
  let hits = 0; const PERM = 200;
  for (let p = 0; p < PERM; p++) {
    for (let i = ys.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [ys[i], ys[k]] = [ys[k], ys[i]];
    }
    const rp = pearson(xs, ys);
    if (isFinite(rp) && isFinite(cur.r) && Math.abs(rp) >= Math.abs(cur.r)) hits++;
  }
  const pVal = (hits + 1) / (PERM + 1);

  LAG_META = { keyA: $('varA').value, keyB: $('varB').value, lag, r: cur.r, n: cur.n, p: pVal };
  drawLagBars(lo, hi, lag);
  const cyc = computeCycles();
  const strength = Math.abs(cur.r) > .5 ? 'strong' : Math.abs(cur.r) > .3 ? 'moderate' : Math.abs(cur.r) > .15 ? 'weak' : 'negligible';
  $('anaOut').innerHTML =
    '<b>r = ' + (isFinite(cur.r) ? cur.r.toFixed(3) : '—') + '</b> at lag ' + lag + ' mo · n=' + cur.n.toLocaleString() +
    '<br>permutation p ≈ <b>' + pVal.toFixed(3) + '</b> (' + PERM + ' shuffles)' +
    '<br>' + strength + ' linear association — exploratory only.' +
    '<br>M6+ phase counts: Bartels n=' + cyc.bartels.n.toLocaleString() + ', spring/neap n=' + cyc.synodic.n.toLocaleString();
  log('lab: ' + LAG_META.keyA + '->' + LAG_META.keyB + ' lag=' + lag + ' r=' + (cur.r || 0).toFixed(3) + ' p=' + pVal.toFixed(3));
}

function drawLagBars(lo, hi, cur) {
  const cv = $('lagCanvas');
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !LAG_CURVE) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const bw = W / (hi - lo + 1);
  let mx = 0.05;
  for (const c of LAG_CURVE) if (isFinite(c.r) && Math.abs(c.r) > mx) mx = Math.abs(c.r);
  const yMid = H / 2;
  ctx.strokeStyle = '#33405e';
  ctx.beginPath(); ctx.moveTo(0, yMid); ctx.lineTo(W, yMid); ctx.stroke();
  for (const c of LAG_CURVE) {
    if (!isFinite(c.r)) continue;
    const hgt = (c.r / mx) * (H / 2 - 8);
    const x0 = (c.lag - lo) * bw;
    ctx.fillStyle = c.lag === cur ? '#ffb86b' : (c.r >= 0 ? 'rgba(94,168,255,.75)' : 'rgba(255,107,107,.7)');
    ctx.fillRect(x0 + 0.6, hgt >= 0 ? yMid - hgt : yMid, Math.max(1.5, bw - 1.4), Math.abs(hgt));
  }
  ctx.fillStyle = '#55608a'; ctx.font = '9px Segoe UI';
  ctx.fillText('-24mo', 3, H - 3);
  ctx.fillText('0', W / 2 - 2, H - 3);
  ctx.fillText('+36mo', W - 34, H - 3);
}

function wireAna() {
  $('anaBtn').addEventListener('click', () => {
    $('anaPanel').classList.toggle('hidden');
    if (!$('anaPanel').classList.contains('hidden')) computeLab();
  });
  $('anaClose').addEventListener('click', () => $('anaPanel').classList.add('hidden'));
  $('lagR').addEventListener('input', () => { $('lagVal').textContent = $('lagR').value; });
  $('computeBtn').addEventListener('click', computeLab);
}

/* ---------- cycle phase histograms (Bartels 27d, spring/neap 29.53d) ---------- */
const BARTELS_T0 = Date.UTC(1832, 1, 8);      // Bartels rotation era start
const SYNODIC_MS = 29.530588853 * 86400000;
const NEWMOON_REF = Date.UTC(2000, 0, 6, 18, 14); // reference new moon

function phaseHistogram(periodMs, t0Ref) {
  const BINS = 12;
  const bins = new Float64Array(BINS);
  let n = 0;
  for (let i = 0; i < S.q.t.length; i++) {
    if (S.q.m[i] < 6) continue;
    const ph = (((S.q.t[i] * 1000 - t0Ref) % periodMs) + periodMs) % periodMs;
    bins[Math.min(BINS - 1, Math.floor(ph / periodMs * BINS))]++;
    n++;
  }
  return { bins, n };
}

function drawCycle(cvId, hist, title) {
  const cv = $(cvId);
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!hist || !hist.n) return;
  const mean = hist.n / hist.bins.length;
  let mx = mean * 1.6;
  for (const v of hist.bins) if (v > mx) mx = v;
  const bw = W / hist.bins.length;
  for (let i = 0; i < hist.bins.length; i++) {
    const hgt = hist.bins[i] / mx * (H - 10);
    ctx.fillStyle = 'rgba(155,107,255,.8)';
    ctx.fillRect(i * bw + 1, H - hgt, bw - 2, hgt);
  }
  const yMean = H - mean / mx * (H - 10);
  ctx.strokeStyle = '#ffb86b';
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(0, yMean); ctx.lineTo(W, yMean); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#55608a'; ctx.font = '9px Segoe UI';
  ctx.fillText(title + ' · dashed=uniform', 4, 9);
}

function computeCycles() {
  const a = phaseHistogram(27 * 86400000, BARTELS_T0);
  const b = phaseHistogram(SYNODIC_MS, NEWMOON_REF);
  drawCycle('cycA', a, '27-day');
  drawCycle('cycB', b, '29.53-day');
  return { bartels: a, synodic: b };
}

/* ---------- trigger-window (superposed epoch around event days) ---------- */
function moonEvents(y0, y1) {
  const ev = [];
  let t = NEWMOON_REF;
  while (t < y1 * 864e5 + 2592e6) {
    const yr = new Date(t).getUTCFullYear();
    if (yr >= y0 && yr <= y1) ev.push(t);
    t += SYNODIC_MS;
  }
  return ev;
}

function triggerDays(type) {
  const y0 = 1970, y1 = new Date(S.tMax * 1000).getUTCFullYear();
  if (type === 'newmoon') return moonEvents(y0, y1);
  if (type === 'fullmoon') return moonEvents(y0, y1).map(t => t + SYNODIC_MS / 2);
  if (type === 'kpstorm' && S.kpIdx) {
    const ev = [];
    for (const d of S.kpIdx.dKp) {
      if (d.v >= 5) ev.push(d.t);
    }
    return ev;
  }
  if (type === 'fhigh' && S.kpIdx) {
    const ev = [];
    for (const d of S.kpIdx.dF) {
      if (d.v >= 200) ev.push(d.t);
    }
    return ev;
  }
  return [];
}

function computeTW() {
  const type = $('twTrig').value;
  const W = parseInt($('twW').value, 10);
  $('twWv').textContent = W;
  const evDays = triggerDays(type);
  if (!evDays.length) { $('twOut').textContent = 'no trigger events found'; return; }
  const qTimes = S.q.t.map(ts => ts * 1000);
  const bins = new Float64Array(2 * W + 1);
  const DAY_MS = 864e5;
  for (const ev of evDays) {
    const lo = ev - W * DAY_MS, hi = ev + W * DAY_MS;
    let i0 = 0, i1 = qTimes.length - 1;
    while (i0 < qTimes.length && qTimes[i0] < lo) i0++;
    while (i1 >= 0 && qTimes[i1] > hi) i1--;
    for (let i = i0; i <= i1; i++) {
      const off = Math.round((qTimes[i] - ev) / DAY_MS) + W;
      if (off >= 0 && off <= 2 * W) bins[off]++;
    }
  }
  const mean = (qTimes.length / S.q.t.length) * evDays.length / (2 * W + 1) * evDays.length;
  const maxCount = Math.max(...bins) || 1;
  let permMax = 0;
  const PERM = 200;
  for (let p = 0; p < PERM; p++) {
    const pb = new Float64Array(2 * W + 1);
    const shift = Math.floor(Math.random() * qTimes.length);
    for (const ev of evDays) {
      const lo = ev - W * DAY_MS, hi = ev + W * DAY_MS;
      for (let i = 0; i < qTimes.length; i++) {
        const adj = qTimes[(i + shift) % qTimes.length];
        if (adj >= lo && adj <= hi) {
          const off = Math.round((adj - ev) / DAY_MS) + W;
          if (off >= 0 && off <= 2 * W) pb[off]++;
        }
      }
    }
    const pm = Math.max(...pb);
    if (pm > permMax) permMax = pm;
  }
  const avgBin = bins.reduce((a, b) => a + b, 0) / bins.length;
  const pctDeviation = bins.map(v => ((v - avgBin) / (avgBin || 1)) * 100);
  TW_RESULT = { bins, evDays: evDays.length, W, pctDeviation, avgBin, permMax };
  $('twCanvas').style.display = 'block';
  drawTW();
  const peak = Math.max(...pctDeviation);
  const trough = Math.min(...pctDeviation);
  const sigBins = pctDeviation.filter((v, i) => Math.abs(v) > 20).length;
  $('twOut').innerHTML =
    '<b>' + evDays.length + ' trigger events</b> · W=' + W + ' days' +
    '<br>peak deviation: ' + peak.toFixed(1) + '% · trough: ' + trough.toFixed(1) + '%' +
    '<br>bins >20% from mean: <b>' + sigBins + '</b> of ' + (2 * W + 1) +
    '<br>max shuffle count: ' + permMax + ' · exploratory only';
}

function drawTW() {
  const cv = $('twCanvas');
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !TW_RESULT) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const { bins, W: hw, pctDeviation } = TW_RESULT;
  const bw = W / bins.length;
  const yMid = H / 2;
  let mx = 5;
  for (const v of pctDeviation) if (Math.abs(v) > mx) mx = Math.abs(v);
  ctx.strokeStyle = '#33405e'; ctx.beginPath(); ctx.moveTo(0, yMid); ctx.lineTo(W, yMid); ctx.stroke();
  for (let i = 0; i < bins.length; i++) {
    const hgt = (pctDeviation[i] / mx) * (H / 2 - 8);
    ctx.fillStyle = pctDeviation[i] >= 0 ? 'rgba(94,168,255,.75)' : 'rgba(255,107,107,.7)';
    ctx.fillRect(i * bw + 0.5, hgt >= 0 ? yMid - hgt : yMid, Math.max(1.5, bw - 1), Math.abs(hgt));
  }
  ctx.strokeStyle = '#ffb86b'; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(0, yMid); ctx.lineTo(W, yMid); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#55608a'; ctx.font = '9px Segoe UI';
  ctx.fillText('-' + hw + 'd', 3, H - 3); ctx.fillText('0', W / 2 - 2, H - 3); ctx.fillText('+' + hw + 'd', W - 30, H - 3);
}

function wireTW() {
  $('twW').addEventListener('input', () => { $('twWv').textContent = $('twW').value; });
  $('twBtn').addEventListener('click', computeTW);
}

/* ---------- stress gauge (experimental composite) ---------- */
function stressGauge() {
  if (!S.q) return 0;
  const qTimes = S.q.t;
  const now = S.tMax * 1000;
  const day30 = now - 30 * 864e5;
  let recentCount = 0, recentEnergy = 0;
  for (let i = qTimes.length - 1; i >= 0; i--) {
    if (qTimes[i] * 1000 < day30) break;
    recentCount++;
    recentEnergy += Math.pow(10, 1.5 * S.q.m[i] + 4.8);
  }
  const avgCount = qTimes.length / ((now - Date.UTC(1970, 0, 1)) / (30 * 864e5));
  const energyZ = avgCount > 0 ? (recentCount - avgCount) / Math.sqrt(avgCount) : 0;
  let kpRank = 0;
  if (S.kpIdx && S.kpIdx.dKp) {
    const recent = S.kpIdx.dKp.slice(-7);
    const maxKp = Math.max(...recent.map(d => d.v));
    kpRank = Math.min(1, maxKp / 9);
  }
  let moonProx = 0;
  if (S.kpIdx && S.kpIdx.start) {
    const dayNow = (now - S.kpIdx.start) / 864e5;
    const phNew = ((dayNow % SYNODIC_MS / 864e5) + SYNODIC_MS / 864e5) % (SYNODIC_MS / 864e5);
    const phFull = (phNew + SYNODIC_MS / (2 * 864e5)) % (SYNODIC_MS / 864e5);
    const distNew = Math.abs(phNew) < Math.abs(phNew - SYNODIC_MS / 864e5) ? Math.abs(phNew) : Math.abs(phNew - SYNODIC_MS / 864e5);
    moonProx = Math.max(0, 1 - distNew / (SYNODIC_MS / (2 * 864e5)));
  }
  const score = Math.max(0, Math.min(100, Math.round(25 + 25 * energyZ + 25 * kpRank + 25 * moonProx)));
  return score;
}

function drawGauge() {
  const cv = $('gaugeCv');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H - 10, r = Math.min(W / 2 - 10, H - 16);
  const lo = Math.PI, hi = 2 * Math.PI;
  const score = stressGauge();
  const ang = lo + (score / 100) * (hi - lo);
  ctx.lineWidth = 6;
  const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  grad.addColorStop(0, '#3a6'); grad.addColorStop(0.5, '#fb3'); grad.addColorStop(1, '#e33');
  ctx.strokeStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, lo, hi); ctx.stroke();
  ctx.strokeStyle = '#222d47'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
  ctx.lineTo(cx + 6 * Math.cos(ang + Math.PI / 2), cy + 6 * Math.sin(ang + Math.PI / 2));
  ctx.lineTo(cx + 6 * Math.cos(ang - Math.PI / 2), cy + 6 * Math.sin(ang - Math.PI / 2));
  ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.fillStyle = '#8b96bd'; ctx.font = '10px Segoe UI';
  ctx.fillText('low', cx - r, cy + 14); ctx.fillText('high', cx + r - 20, cy + 14);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Segoe UI';
  ctx.fillText(score, cx - 8, cy - 6);
  $('gaugeTxt').textContent = 'composite crustal stress score · energy-rate + Kp + syzygy';
}

/* ---------- CME panel (NASA DONKI) ---------- */
async function loadCME() {
  const box = $('cmeBox');
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const url = 'https://api.nasa.gov/DONKI/CME?startDate=' + start + '&endDate=' + end + '&api_key=DEMO_KEY';

  function renderCME(list) {
    const rows = [];
    for (const c of list) {
      const a = ((c.cmeAnalyses || []).filter(x => x.isMostAccurate)[0]) || (c.cmeAnalyses || [])[0];
      if (!a) continue;
      let earth = false, arrival = null;
      for (const e of (a.enlilList || [])) {
        if (e.isEarthGB) earth = true;
        if (e.estimatedShockArrivalTime) arrival = e.estimatedShockArrivalTime;
        for (const im of (e.impactList || [])) {
          if (/earth/i.test(im.location || '')) { earth = true; if (!arrival && im.arrivalTime) arrival = im.arrivalTime; }
        }
      }
      rows.push({ t: c.startTime, speed: a.speed, ha: a.halfAngle, lat: a.latitude, lon: a.longitude, earth, arrival });
    }
    rows.sort((x, y) => Date.parse(y.t) - Date.parse(x.t));
    if (!rows.length) { box.innerHTML = 'no analysed CMEs in last 30 days'; return; }
    S.cmeRows = rows;
    rebuildCMEHistFC();
    mapCMEs();
    box.innerHTML = '<div style="color:#55608a;margin-bottom:4px">teal band = earth-directed shock sweeping the dayside (fades in 48 h before predicted arrival, out 24 h after) · dashed ring = arrival within 7 days</div>' +
      rows.slice(0, 7).map(c =>
      '<div class="cme-item">' +
      '<div>' + String(c.t).slice(0, 16).replace('T', ' ') + ' UTC</div>' +
      '<span class="sp">' + (c.speed != null ? c.speed : '?') + ' km/s</span> · ' +
      'cone <span class="ha">±' + (c.ha != null ? c.ha : '?') + '°</span> ' +
      '(swath ≈ ' + (c.ha != null ? Math.round(2 * c.ha) : '?') + '° of sky at 1 AU) · ' +
      (c.earth ? '<span class="earth">EARTH-DIRECTED</span>' : '<span class="nonearth">off-axis</span>') +
      (c.arrival ? '<br>est. shock arrival ' + String(c.arrival).slice(0, 16).replace('T', ' ') + ' UTC' : '') +
      '</div>'
    ).join('');
  }

  try {
    const cached = await window.ct.donkiLoadCache('CME');
    if (cached.ok && cached.data.length) {
      renderCME(cached.data);
      log('CME loaded from cache: ' + cached.data.length);
      if (!cached.stale) return;
    }
    const r = await window.ct.donki(url);
    if (!r.ok) throw new Error('status ' + r.status);
    const list = JSON.parse(r.body);
    await window.ct.donkiSaveCache('CME', list);
    renderCME(list);
    log('CME refreshed from API: ' + list.length);
  } catch (e) {
    console.error('cme failed:', e.message || e);
    box.innerHTML = 'CME feed unavailable (' + (e.message || e) + ')';
  }
}

/* PART3 */
function fmt(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'short' });
}

function readout(n) {
  $('tlReadout').innerHTML =
    '<b>' + fmt(S.winStart) + ' → ' + fmt(S.winEnd) + '</b><br>' +
    (n == null ? '' : n.toLocaleString() + ' quakes in view');
}

function setSpan(key) {
  const now = S.tMax * 1000;
  const spans = { d1: 864e5, d7: 7 * 864e5, m3: 91 * 864e5, y1: 365 * 864e5, y5: 5 * 365 * 864e5, y10: 10 * 365 * 864e5 };
  if (key === 'all') {
    S.spanMs = Math.max(864e5, now - Date.UTC(1970, 0, 1));
    S.winStart = Date.UTC(1970, 0, 1); S.winEnd = now;
  } else {
    S.spanMs = spans[key];
    S.winEnd = now; S.winStart = Math.max(Date.UTC(1970, 0, 1), now - spans[key]);
  }
  S.spanKey = key;
  refreshQuakes();
  applySidebar();
  mapCMEs();
}

let dragX = null;
function canvasTime(ev) {
  const cv = $('tlCanvas');
  const r = cv.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  return Date.UTC(1970, 0, 1) + frac * (S.tMax * 1000 - Date.UTC(1970, 0, 1));
}
function wireTimeline() {
  const cv = $('tlCanvas');
  cv.addEventListener('pointerdown', e => { dragX = e.clientX; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (dragX == null || !S.q) return;
    const half = S.spanMs / 2;
    let mid = canvasTime(e);
    const loAll = Date.UTC(1970, 0, 1) + half;
    const hiAll = S.tMax * 1000 - half;
    mid = hiAll > loAll ? Math.min(Math.max(mid, loAll), hiAll) : (Date.UTC(1970, 0, 1) + S.tMax * 1000) / 2;
    S.winStart = mid - half; S.winEnd = mid + half;
    stopPlay();
    refreshQuakes();
  });
  const end = () => { dragX = null; };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  document.querySelectorAll('.spans button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.spans button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      setSpan(b.dataset.span);
    });
  });

  $('playBtn').addEventListener('click', () => {
    if (S.playing) { stopPlay(); return; }
    S.playing = true;
    $('playBtn').textContent = '❚❚';
    applySidebar();
    let lastTs = null;
    const tick = ts => {
      if (!S.playing) return;
      const dt = lastTs == null ? 1 / 60 : Math.min(0.25, (ts - lastTs) / 1000);
      lastTs = ts;
      const step = Math.max(0.01 * 864e5 / 60, (+SET.speed || 10) * 864e5 * dt);
      S.winEnd += step;
      if (S.winEnd >= S.tMax * 1000) {
        if (S.winEnd - S.spanMs > S.tMin * 1000) {
          S.winEnd = S.tMax * 1000 - S.spanMs;   // wrap: loop the window instead of stalling at the archive end
        } else {
          S.winEnd = S.tMax * 1000; stopPlay(); refreshQuakes(); return;
        }
      }
      S.winStart = S.winEnd - S.spanMs;
      refreshQuakes();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
let heavyTimer = null;
function stopPlay() {
  if (!S.playing) return;
  S.playing = false;
  const pb = $('playBtn'); if (pb) pb.textContent = '▶';
  clearTimeout(heavyTimer);
  applySidebar();
  doHeavy();
}

/* ---------- sidebar ---------- */
function applySidebar() {
  if (!S.map) return;
  const vis = (id, on) => { if (S.map.getLayer(id)) S.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
  vis('quakes-circle', $('lyQuakes').checked);
  vis('plates-line', $('lyPlates').checked);
  vis('grid-line', $('lyGrid').checked);
  vis('volcs-circle', $('lyVolcs').checked);
  // live-now layers show ONLY when the window is genuinely at today (span d1, not playing,
  // window ends at the present); otherwise historical splotches show — and only in narrow
  // windows (1D/7D) where a single-instant footprint is meaningful. In wide windows the
  // events are carried by the timeline markers instead, not static geoblobs.
  const liveLayers = isLive();
  vis('live24-circle', $('lyLive24').checked && liveLayers);
  document.getElementById('lyRowLive').classList.toggle('dimmed', S.playing);
  document.getElementById('lyRowHz').classList.toggle('dimmed', S.playing);
  applyHz();
  vis('capitals-circle', $('lyCaps').checked);
  const showCME = $('lyCMEs').checked, showFlare = $('lyFlares').checked;
  const narrow = S.spanKey === 'd1' || S.spanKey === 'd7';
  vis('cme-fill', showCME && liveLayers);
  vis('cme-line', showCME && liveLayers);
  vis('cmeghost-line', showCME && liveLayers);
  vis('flare-fill', showFlare && liveLayers);
  vis('flare-line', showFlare && liveLayers);
  vis('cme-hist-fill', showCME && !liveLayers && narrow);
  vis('cme-hist-line', showCME && !liveLayers && narrow);
  vis('flare-hist-fill', showFlare && !liveLayers && narrow);
  vis('flare-hist-line', showFlare && !liveLayers && narrow);
  if (S.map.getLayer('quakes-circle')) {
    S.map.setPaintProperty('quakes-circle', 'circle-opacity', $('opQuakes').value / 100);
    S.map.setPaintProperty('quakes-circle', 'circle-color', syzColorExpr());
    const mm = $('magMin').value / 10;
    $('magVal').textContent = mm.toFixed(1);
    S.map.setFilter('quakes-circle', ['>=', ['get', 'm'], mm]);
  }
}

/* ---------- graphs panel: overlaid time series ---------- */
// Series are defined declaratively; data is built window-aware (only the visible range is
// binned/iterated) so loading stays instant and the canvas never drowns in points.
const GRAPH_SERIES = [
  { id: 'gve', label: 'eruptions', color: '#ff5a3c' },
  { id: 'gsn', label: 'sunspot number', color: '#ffb86b' },
  { id: 'gkp', label: 'Kp index', color: '#9b6bff' },
  { id: 'gf10', label: 'F10.7 flux', color: '#4fffd7' },
  { id: 'gpd', label: 'proton density (live)', color: '#ff9de2' },
  { id: 'gq', label: 'quakes', color: '#5ea8ff' },
  { id: 'gd2', label: 'proton density', color: '#35c9c0' },
  { id: 'gpr', label: 'SW pressure', color: '#e0b0ff' },
  { id: 'gbz', label: 'IMF Bz', color: '#7dff6a' },
  { id: 'gim', label: 'IMF |B|', color: '#ffd76a' },
  { id: 'gdst', label: 'Dst index', color: '#ff8a4a' },
  { id: 'gef', label: 'SW E-field', color: '#9adcff' }
];

/* Historical OMNIWeb OMNI2 magnet series: id -> {varNum, unit, label}. varNums verified:
   23=proton density N/cm^3, 28=flow pressure nPa, 16=Bz GSM nT, 8=Scalar B nT,
   40=Dst nT, 35=E-field mV/m. Bundled daily data in data/magnet/<id>.json. */
const MAGNET = {
  gd2:  { key: 'proton',   varNum: 23, unit: 'N/cm³', label: 'proton density', color: '#35c9c0' },
  gpr:  { key: 'pressure', varNum: 28, unit: 'nPa',   label: 'SW pressure',    color: '#e0b0ff' },
  gbz:  { key: 'bz',       varNum: 16, unit: 'nT',    label: 'IMF Bz (GSM)',   color: '#7dff6a' },
  gim:  { key: 'imfb',     varNum: 8,  unit: 'nT',    label: 'IMF |B|',        color: '#ffd76a' },
  gdst: { key: 'dst',      varNum: 40, unit: 'nT',    label: 'Dst index',      color: '#ff8a4a' },
  gef:  { key: 'efield',   varNum: 35, unit: 'mV/m',  label: 'SW E-field',     color: '#9adcff' }
};
async function loadMagnet(type) {
  const r = await window.ct.magnetLoad(type);
  if (!r || !r.ok || !r.data || !r.data.pts) { MAGNETDATA[type] = null; return null; }
  const pts = (r.data.pts || []).map(p => ({ t: p[0], v: p[1] }));
  MAGNETDATA[type] = { pts, count: r.data.count, cache: r.data.cache, source: r.data.source };
  return MAGNETDATA[type];
}
const MAGNETDATA = {};
let magnetLoaded = false;
async function ensureMagnet() {
  if (magnetLoaded) return;
  magnetLoaded = true;
  await Promise.all(Object.values(MAGNET).map(m => loadMagnet(m.key)));
}
const GRAPH_SPAN_DAYS = { m30: 30, m3: 92, m6: 183, y1: 366, y3: 3 * 366, y5: 5 * 366, y10: 10 * 366, y25: 25 * 366 };
const GRAPH_RANGE_DESC = {
  all: 'Full archive 1970 → now (no paging)',
  y25: '25 years — long-term trend & solar-cycle resolution',
  y10: '10 years — the longest practical multi-cycle window',
  y5: '5 years — about half a solar cycle',
  y3: '3 years — recent trend with decent resolution',
  y1: '1 year — resolves the 11-year cycle dip/growth well',
  m6: '6 months — mid-term zoom',
  m3: '3 months — tight zoom, monthly binned solar data',
  m30: '30 days — shortest useful (solar data is monthly)'
};
// Current window's end for the selected range. Defaults to "now" (end of archive);
// the ‹ › pager steps it one range-width at a time, clamped to the archive span.
let graphWinEnd = null;

// Turn a monthly-points array into {t,v} list (used by solar/kp which are already monthly).
function idxToPts(arr, start) {
  if (!arr || !arr.length) return [];
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = { t: start + i * MONTH, v: arr[i] };
  return out;
}
// Keep only the points that fall inside the visible window (cheap for a few hundred pts).
function windowPoints(pts, t0, t1) {
  const out = [];
  for (const p of pts) if (p.v != null && isFinite(p.v) && p.t >= t0 && p.t <= t1) out.push(p);
  return out;
}
// Window-aware quake binning: binary-search the (sorted) archive slice for the window only,
// so a 1Y/1D view never re-iterates the full 294k-quake archive.
function windowedQuakes(t0, t1, bin, magMin) {
  const t = S.q.t, m = S.q.m;
  const a = lowerBound(t, t0 / 1000);
  const b = upperBound(t, t1 / 1000);
  const bins = Math.max(1, Math.ceil((t1 - t0) / bin));
  const arr = new Float64Array(bins);
  for (let i = a; i < b; i++) {
    if (magMin && (m[i] == null || !isFinite(m[i]) || m[i] < magMin)) continue;
    const bi = Math.floor((t[i] * 1000 - t0) / bin);
    if (bi >= 0 && bi < bins) arr[bi]++;
  }
  const out = new Array(bins);
  for (let i = 0; i < bins; i++) out[i] = { t: t0 + i * bin, v: arr[i] };
  return out;
}
function windowedEruptions(t0, t1, bin) {
  if (!S.volcs) return [];
  const bins = Math.max(1, Math.ceil((t1 - t0) / bin));
  const arr = new Float64Array(bins);
  for (const e of S.volcs.e) {
    if (e[1] == null) continue;
    const mt = Date.UTC(e[0], e[1] - 1, 15);
    if (mt < t0 || mt > t1) continue;
    const bi = Math.floor((mt - t0) / bin);
    if (bi >= 0 && bi < bins) arr[bi]++;
  }
  const out = new Array(bins);
  for (let i = 0; i < bins; i++) out[i] = { t: t0 + i * bin, v: arr[i] };
  return out;
}
function buildGraphSeries(s, t0, t1, bin) {
  switch (s.id) {
    case 'gq': return S.q ? windowedQuakes(t0, t1, bin, graphMagMin()) : [];
    case 'gve': return windowedEruptions(t0, t1, bin);
    case 'gsn': return SILSO ? windowPoints(SILSO.map(r => ({ t: r.t, v: r.sn })), t0, t1) : [];
    case 'gkp': return S.kpIdx ? windowPoints(idxToPts(S.kpIdx.kpM, S.kpIdx.start), t0, t1) : [];
    case 'gf10': return S.kpIdx ? windowPoints(idxToPts(S.kpIdx.f107M, S.kpIdx.start), t0, t1) : [];
    case 'gpd': return (bin === 864e5 && protonPts) ? windowPoints(protonPts, t0, t1) : [];
    case 'gd2': case 'gpr': case 'gbz': case 'gim': case 'gdst': case 'gef': {
      const m = MAGNET[s.id];
      if (!m || !MAGNETDATA[m.key] || !MAGNETDATA[m.key].pts) return [];
      return windowPoints(MAGNETDATA[m.key].pts, t0, t1);
    }
  }
  return [];
}
let graphSizing = 0;

/* Live solar-wind proton density from NOAA ACE SWEPAM (L1, ~24 h of 1-min data).
   Only ~1 day of live data exists - so this series is meaningful only in the
   short (30D/3M) ranges. Labels it as theoretical/exploratory per Marchitelli
   et al. 2020. Cached in memory, refreshed at most every 10 minutes. */
let protonPts = null;
let protonFetched = 0;
const PROTON_TTL = 10 * 60 * 1000;
async function loadProtons(force) {
  const now = Date.now();
  if (!force && protonFetched && now - protonFetched < PROTON_TTL) return;
  try {
    const r = await window.ct.fetchText('https://services.swpc.noaa.gov/text/ace-swepam.txt');
    if (!r || !r.ok) { if (protonPts) return; throw new Error('no proton feed'); }
    const pts = [];
    for (const line of r.body.split(/\r?\n/)) {
      if (!line || line[0] === '#' || line[0] === ':' || line[0] === '\uFEFF') continue;
      const c = line.trim().split(/\s+/);
      if (c.length < 9) continue;
      const y = +c[0], mo = +c[1], d = +c[2], hhmm = c[3];
      const S = +c[6];
      const dens = parseFloat(c[7]);
      if (S !== 0 || !isFinite(dens)) continue;
      const hh = Math.floor(hhmm / 100), mm = hhmm % 100;
      pts.push({ t: Date.UTC(y, mo - 1, d, hh, mm), v: dens });
    }
    pts.sort((a, b) => a.t - b.t);
    protonPts = pts;
    protonFetched = Date.now();
    log('proton density (ACE): ' + pts.length + ' pts, ' + (pts.length ? new Date(pts[pts.length - 1].t).toISOString() : '') + ' latest');
    if (!$('gpd')) return;
    $('gpd').disabled = !pts.length;
    if (!pts.length) { $('gpd').checked = false; }
  } catch (e) {
    log('proton density unavailable: ' + (e && e.message || e));
  }
}


function graphSizeGuess() {
  const st = $('graphStage');
  const cw = st.clientWidth > 10 ? st.clientWidth : (window.innerWidth - 90);
  graphSizing = Math.floor(cw);
  // clamp height so a layout glitch can never allocate a giant offscreen canvas and black-screen the app
  const ch = st.clientHeight > 100 ? st.clientHeight : Math.min(460, Math.floor(window.innerHeight * 0.52));
  return {
    W: Math.floor(cw),
    H: Math.min(1400, Math.floor(ch))
  };
}
let graphHoverX = null;
let graphMouse = null;   // last cursor client coords — positions the floating date/value tag
let graphDrawn = false;
let graphSeriesCache = {};
function updateGraphDebug(W, H, t0, t1) {
  const cv = $('graphCanvas'), st = $('graphStage'), dbg = $('graphDebug');
  if (!cv || !st || !dbg) return;
  const dpr = window.devicePixelRatio || 1;
  dbg.textContent = 'gfx: draw=' + W + 'x' + H +
    '  buffer=' + cv.width + 'x' + cv.height +
    '  canvasCss=' + Math.round(cv.getBoundingClientRect().width) + 'x' + Math.round(cv.getBoundingClientRect().height) +
    '  stage=' + st.clientWidth + 'x' + st.clientHeight +
    '  dpr=' + dpr + '  win=' + window.innerWidth + 'x' + window.innerHeight +
    '  range=' + new Date(t0).toISOString().slice(0, 10) + ' -> ' + new Date(t1).toISOString().slice(0, 10);
}
function niceStep(raw) {
  if (!isFinite(raw) || raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}
function niceTicks(min, max, want) {
  if (!isFinite(min) || !isFinite(max)) return [];
  const span = Math.max(max - min, 1e-9);
  const step = niceStep(span / Math.max(1, want - 1));
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(4));
  return out;
}
function drawGraphAxes(ctx, W, H, t0, t1, padL, padR, padT, padB, refSeries) {
  const x = t => padL + (t - t0) / (t1 - t0) * (W - padL - padR);
  const spanDays = (t1 - t0) / 864e5;
  // x axis: denser date ticks — minor gridlines between labelled majors
  let stepMs, fmt, minorMs = 0;
  if (spanDays <= 3) { stepMs = 6 * 3600e3; minorMs = 3 * 3600e3; fmt = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }; }
  else if (spanDays <= 40) { stepMs = 7 * 864e5; minorMs = 864e5; fmt = { day: 'numeric', month: 'short', year: '2-digit' }; }
  else if (spanDays <= 210) { stepMs = 31 * 864e5; minorMs = 14 * 864e5; fmt = { month: 'short', year: '2-digit' }; }
  else if (spanDays <= 10 * 366) { stepMs = 366 * 864e5; minorMs = Math.round(366 * 864e5 / 4); fmt = { month: 'short', year: 'numeric' }; }
  else { stepMs = 5 * 366 * 864e5; minorMs = 366 * 864e5; fmt = { year: 'numeric' }; }
  if (minorMs) {
    ctx.strokeStyle = 'rgba(140,160,220,.05)';
    ctx.beginPath();
    for (let t = Math.ceil(t0 / minorMs) * minorMs; t <= t1; t += minorMs) {
      const xx = x(t);
      if (xx < padL - 4 || xx > W - 2) continue;
      ctx.moveTo(xx, padT); ctx.lineTo(xx, H - padB);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(140,160,220,.12)';
  ctx.fillStyle = '#8b97b5';
  ctx.font = '9px Segoe UI';
  let prevEnd = -1e9;
  for (let t = Math.ceil(t0 / stepMs) * stepMs; t <= t1; t += stepMs) {
    const xx = x(t);
    if (xx < padL - 4 || xx > W - 2 || xx + 3 < prevEnd) continue;
    ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, H - padB); ctx.stroke();
    const lbl = new Date(t).toLocaleDateString('en-AU', fmt);
    ctx.fillText(lbl, xx + 3, H - 8);
    prevEnd = xx + 4 + ctx.measureText(lbl).width;
  }
  const firstLbl = new Date(t0).toLocaleDateString('en-AU', fmt);
  if (padL + 3 + ctx.measureText(firstLbl).width < prevEnd) ctx.fillText(firstLbl, padL + 2, H - 8);
  ctx.strokeStyle = 'rgba(140,160,220,.3)';
  ctx.beginPath(); ctx.moveTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
  // y axis: numeric ruler with close increments, keyed to the first series that has data
  if (!refSeries || !refSeries.pts || !refSeries.pts.length) return;
  let mn = Infinity, mx = -Infinity;
  for (const p of refSeries.pts) { if (p.v < mn) mn = p.v; if (p.v > mx) mx = p.v; }
  if (!isFinite(mn) || !isFinite(mx) || mx === mn) return;
  const y = v => H - padB - (v - mn) / (mx - mn) * (H - padT - padB);
  ctx.strokeStyle = 'rgba(140,160,220,.07)';
  ctx.fillStyle = refSeries.color;
  ctx.font = '9px Segoe UI';
  for (const v of niceTicks(mn, mx, 5)) {
    const yy = Math.round(y(v));
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    const lbl = Math.abs(v) >= 100 ? v.toFixed(0) : (Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0));
    ctx.fillText(lbl, 2, yy + 3);
  }
  ctx.font = 'bold 9px Segoe UI';
  ctx.fillText(String((refSeries.label || '').split(' ').slice(0, 2).join(' ')), padL + 2, padT - 4);
}
function drawGraphLine(ctx, pts, t0, t1, W, H, padL, padR, padT, padB, color) {
  if (!pts.length) return;
  let mn = Infinity, mx = -Infinity;
  for (const p of pts) { if (p.v < mn) mn = p.v; if (p.v > mx) mx = p.v; }
  if (mx === mn) mx = mn + 1;
  const x = t => padL + (t - t0) / (t1 - t0) * (W - padL - padR);
  const y = v => H - padB - (v - mn) / (mx - mn) * (H - padT - padB);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  pts.forEach((p, i) => { const px = x(p.t), py = y(p.v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.font = '9px Segoe UI';
  ctx.fillText(mx.toFixed(mx < 20 ? 1 : 0), W - 30, y(mx) + 3);
  ctx.fillText(mn.toFixed(mn < 20 ? 1 : 0), W - 30, y(mn) + 8);
}
function graphMagMin() {
  const el = $('gMag');
  const v = el ? parseFloat(el.value) : 4.5;
  return isFinite(v) ? v : 4.5;
}
function graphRange() {
  const sel = $('gRange').value;
  const endNow = S.tMax * 1000;
  if (sel === 'all' || !GRAPH_SPAN_DAYS[sel]) { graphWinEnd = null; return { t0: Date.UTC(1970, 0, 1), t1: endNow, bin: MONTH }; }
  const days = GRAPH_SPAN_DAYS[sel];
  // Default window ends at "now"; the pager moves this back/forward.
  if (graphWinEnd == null) graphWinEnd = endNow;
  const start0 = Date.UTC(1970, 0, 1);
  const lo = start0 + days * 864e5;  // earliest allowed window end
  const t1 = Math.min(endNow, Math.max(lo, graphWinEnd));
  return {
    t0: t1 - days * 864e5,
    t1,
    bin: days <= 366 ? 864e5 : MONTH   // daily resolution up to a year, monthly beyond
  };
}
function graphStep(step) {
  const sel = $('gRange').value;
  if (sel === 'all' || !GRAPH_SPAN_DAYS[sel]) return;
  const days = GRAPH_SPAN_DAYS[sel];
  const endNow = S.tMax * 1000;
  const start0 = Date.UTC(1970, 0, 1);
  const lo = start0 + days * 864e5;
  if (graphWinEnd == null) graphWinEnd = endNow;
  graphWinEnd = Math.min(endNow, Math.max(lo, graphWinEnd + step * days * 864e5));
  updateGraphWinTip();
  loadGraphSeries();
}
function updateGraphWinTip() {
  const sel = $('gRange').value;
  const tip = $('gWinTip');
  if (!tip) return;
  const desc = GRAPH_RANGE_DESC[sel] || '';
  if (sel === 'all' || !GRAPH_SPAN_DAYS[sel]) {
    tip.innerHTML = '<b>Full archive</b> — ' + desc;
    return;
  }
  const { t0, t1 } = graphRange();
  const a = new Date(t0).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const b = new Date(t1).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const newest = t1 >= S.tMax * 1000 - 2 * 864e5;
  tip.innerHTML = '<b>' + a + ' → ' + b + '</b>' + (newest ? ' · latest' : ' · earlier window') + ' — ' + desc;
}
function drawGraph() {
  if (!S.q) return;
  const cv = $('graphCanvas');
  const { W, H } = graphSizeGuess();
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const { t0, t1 } = graphRange();
  const active = GRAPH_SERIES.filter(s => $(s.id).checked);
  const padL = 34, padR = 8, padT = 16, padB = 22;
  let refSeries = null;
  for (const s of active) if (!refSeries && graphSeriesCache[s.id] && graphSeriesCache[s.id].length) refSeries = { pts: graphSeriesCache[s.id], color: s.color, label: s.label };
  drawGraphAxes(ctx, W, H, t0, t1, padL, padR, padT, padB, refSeries);
  for (const s of active) {
    const pts = graphSeriesCache[s.id];
    if (pts) drawGraphLine(ctx, pts, t0, t1, W, H, padL, padR, padT, padB, s.color);
  }
  drawGraphCrosshair(ctx, W, H, t0, t1, padL, padR, padT, padB, active);
  graphDrawn = true;
}
function drawGraphCrosshair(ctx, W, H, t0, t1, padL, padR, padT, padB, active) {
  const tag = $('graphCursorTag');
  if (graphHoverX != null && graphHoverX >= padL && graphHoverX <= W - padR) {
    const x = t => padL + (t - t0) / (t1 - t0) * (W - padL - padR);
    const tt = t0 + (graphHoverX - padL) / (W - padL - padR) * (t1 - t0);
    if (!isFinite(tt) || !isFinite(t0) || !isFinite(t1)) {
      $('graphTip').textContent = 'hover the chart to inspect · each series scaled independently for overlay comparison';
      if (tag) tag.classList.add('hidden');
      return;
    }
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(graphHoverX, padT); ctx.lineTo(graphHoverX, H - padB); ctx.stroke();
    ctx.setLineDash([]);
    const spanDays = (t1 - t0) / 864e5;
    const dateStr = new Date(tt).toLocaleString('en-AU',
      spanDays <= 40
        ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
        : { day: 'numeric', month: 'short', year: 'numeric' });
    const tips = [];
    for (const s of active) {
      const pts = graphSeriesCache[s.id];
      if (!pts || !pts.length) continue;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p.t - tt) < Math.abs(best.t - tt)) best = p;
      const unit = (s.id === 'gpd' ? ' /cc' : (MAGNET[s.id] ? ' ' + MAGNET[s.id].unit : ''));
      const tagTxt = (s.id === 'gpd' || MAGNET[s.id]) ? ' ·theory' : '';
      const val = best.v.toFixed(best.v < 20 ? 2 : 0);
      tips.push('<span style="color:' + s.color + '">●</span> ' + val + unit + '<span style="color:#8b96bd">' + tagTxt + '</span>');
      s.hoverVal = val + unit;
    }
    $('graphTip').innerHTML = '<b>' + dateStr + '</b> · ' + tips.join(' · ');
    if (tag && graphMouse) {
      tag.classList.remove('hidden');
      tag.innerHTML = '<span class="d">' + dateStr + '</span>' + tips.map(t => '<span class="sep">|</span>' + t).join('');
      const st = $('graphStage'), r = st.getBoundingClientRect();
      let left = graphMouse.x - r.left + 14;
      let top = graphMouse.y - r.top - tag.offsetHeight - 12;
      if (top < 4) top = graphMouse.y - r.top + 14;
      left = Math.max(4, Math.min(left, r.width - tag.offsetWidth - 6));
      tag.style.left = left + 'px';
      tag.style.top = Math.max(4, Math.min(top, r.height - tag.offsetHeight - 6)) + 'px';
    }
  } else {
    $('graphTip').textContent = 'hover the chart to inspect · each series scaled independently for overlay comparison';
    if (tag) tag.classList.add('hidden');
  }
}

let graphLoadSeq = 0;
async function loadGraphSeries() {
  const seq = ++graphLoadSeq;
  const cv = $('graphCanvas'), tip = $('graphTip');
  if (!$('graphsPanel')) return;
  // skip silently if the graphs panel is hidden (switched away) or archive not ready
  if (!S.q) { if (!$('graphsPanel').classList.contains('hidden')) setTimeout(loadGraphSeries, 800); return; }
  if ($('graphsPanel').classList.contains('hidden')) return;
  try {
    const { W, H } = graphSizeGuess();
    if (seq !== graphLoadSeq) return;
    log('graph load: W=' + W + ' H=' + H);
    if (!W || !H) { if (!$('graphsPanel').classList.contains('hidden')) setTimeout(loadGraphSeries, 200); return; }
    await loadProtons(false);   // ensure live proton density available before drawing (cached 10 min)
    await ensureMagnet();       // bundled historical OMNIWeb series (cached in memory, one-time load)
    if (seq !== graphLoadSeq) return;   // a newer load started while we were fetching
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { t0, t1, bin } = graphRange();
    const active = GRAPH_SERIES.filter(s => $(s.id).checked);
    const padL = 34, padR = 8, padT = 16, padB = 22;
    graphSeriesCache = {};
    tip.classList.add('loading');
    tip.textContent = 'loading data for the selected range…';
    drawGraphAxes(ctx, W, H, t0, t1, padL, padR, padT, padB, null);   // axes always draw first, so it never looks like a blank black box
    // build + draw each checked series, yielding to the event loop between them so the
    // panel paints progressively (a little now, then more) instead of one long block.
    for (let i = 0; i < active.length; i++) {
      const s = active[i];
      if (seq !== graphLoadSeq) return;                       // superseded mid-load (resize, tab switch, reload)
      if ($('graphsPanel').classList.contains('hidden')) return;   // switched away mid-load
      tip.textContent = 'loading ' + s.label + (bin === 864e5 ? ' (daily)' : ' (monthly)') + '… (' + (i + 1) + '/' + active.length + ')';
      await new Promise(r => setTimeout(r, 10));
      if (seq !== graphLoadSeq) return;
      const pts = buildGraphSeries(s, t0, t1, bin);
      graphSeriesCache[s.id] = pts;
      log(s.label + ': ' + pts.length + ' pts in ' + $('gRange').value + ' range');
      drawGraphLine(ctx, pts, t0, t1, W, H, padL, padR, padT, padB, s.color);
    }
    if (seq !== graphLoadSeq) return;
    tip.classList.remove('loading');
    drawGraph();   // full repaint: axes + y-ruler + all series + crosshair, so the ruler reflects loaded data
    graphDrawn = true;
    graphCur = { t0, t1, bin, sel: $('gRange').value, mag: graphMagMin() };
    updateGraphPager();
    renderGraphEnrich(t0, t1, active, bin);
    updateGraphDebug(W, H, t0, t1);
    updateSeriesCoverage(active, t1);
  } catch (e) {
    if (seq !== graphLoadSeq) return;
    tip.classList.remove('loading');
    tip.textContent = 'graph error: ' + (e.message || e);
    log('graph error: ' + (e.message || e));
  }
}
let graphCur = null;
function updateGraphPager() {
  const sel = $('gRange').value;
  const prev = $('gPrev'), next = $('gNext');
  if (!prev || !next) return;
  if (sel === 'all' || !GRAPH_SPAN_DAYS[sel]) { prev.disabled = true; next.disabled = true; return; }
  const endNow = S.tMax * 1000;
  const start0 = Date.UTC(1970, 0, 1);
  const days = GRAPH_SPAN_DAYS[sel];
  const lo = start0 + days * 864e5;
  const end = (graphWinEnd == null) ? endNow : Math.min(endNow, Math.max(lo, graphWinEnd));
  prev.disabled = end <= lo + 864e5;
  next.disabled = end >= endNow - 864e5;
}
function updateSeriesCoverage(active, t1) {
  // If a series' data ends before the window's end, label its coverage so a
  // short line is understood as "data ends here" rather than a bug.
  for (const s of active) {
    const inp = $(s.id);
    const lbl = inp && inp.closest('label');
    if (!lbl) continue;
    lbl.querySelectorAll('.cov-hint').forEach(n => n.remove());
    const pts = graphSeriesCache[s.id];
    if (!pts || !pts.length) continue;
    const lastT = pts[pts.length - 1].t;
    if (lastT < t1 - 3 * 864e5) {
      const h = document.createElement('span');
      h.className = 'cov-hint';
      h.textContent = ' · to ' + new Date(lastT).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
      lbl.appendChild(h);
    }
  }
}

/* ---------- live news (RSS) — Studies view right column ---------- */
const RSS_FEEDS = [
  { key: 'sun', title: 'Sun & space weather', src: 'Google News', url: 'https://news.google.com/rss/search?q=solar+flare+OR+geomagnetic+storm+OR+sunspot+OR+space+weather&hl=en-US&gl=US&ceid=US:en' },
  { key: 'vol', title: 'Volcanoes', src: 'Google News', url: 'https://news.google.com/rss/search?q=volcanic+eruption+OR+volcano+alert+OR+volcano+activity&hl=en-US&gl=US&ceid=US:en' },
  { key: 'wx', title: 'Extreme weather', src: 'Google News', url: 'https://news.google.com/rss/search?q=extreme+weather+OR+hurricane+OR+cyclone+OR+flood+OR+drought&hl=en-US&gl=US&ceid=US:en' },
  { key: 'qk', title: 'Quakes today', src: 'USGS', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.atom' }
];
let rssFetched = 0;
let rssTimer = null;
function rssEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function parseFeedXml(text) {
  try {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const isAtom = !!doc.querySelector('feed');
    const items = doc.querySelectorAll(isAtom ? 'feed > entry' : 'channel > item');
    const out = [];
    const tSel = isAtom ? 'updated' : 'pubDate';
    for (const it of items) {
      let el = it.querySelector(':scope > title');
      if (!el) continue;
      let href = '';
      if (isAtom) {
        el = it.querySelector(':scope > link');
        if (el) href = el.getAttribute('href') || '';
      } else {
        el = it.querySelector(':scope > link');
        if (el) href = el.textContent.trim();
      }
      el = it.querySelector(':scope > ' + tSel);
      out.push({ title: it.querySelector(':scope > title').textContent.trim(), href, t: el ? Date.parse(el.textContent.trim()) : 0 });
    }
    return out;
  } catch (e) { return []; }
}
function renderRssFeed(f, items, err) {
  const feedEl = document.getElementById('rss-' + f.key);
  if (!feedEl) return;
  const meta = feedEl.querySelector('.rss-meta');
  const ul = feedEl.querySelector('ul');
  if (err) {
    if (meta) meta.textContent = 'refresh failed — will retry later';
    return;
  }
  if (meta) meta.textContent = 'updated ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) + ' · ' + items.length + ' items';
  if (!items.length) { ul.innerHTML = '<li class="rss-empty">no items right now</li>'; return; }
  ul.innerHTML = items.slice(0, 12).map(i => {
    const link = i.href ? 'href="' + i.href + '" target="_blank" rel="noopener"' : '';
    const when = i.t ? new Date(i.t).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return '<li><a ' + link + '>' + rssEsc(i.title) + '</a>' + (when ? '<span class="rss-when">' + when + '</span>' : '') + '</li>';
  }).join('');
}
async function loadRss(force) {
  if (!document.getElementById('rssFeeds')) return;
  const now = Date.now();
  if (!force && rssFetched && now - rssFetched < 15 * 60 * 1000) return;
  for (const f of RSS_FEEDS) {
    const feedEl = document.getElementById('rss-' + f.key);
    const meta = feedEl && feedEl.querySelector('.rss-meta');
    if (meta) meta.textContent = 'fetching…';
    try {
      const r = await window.ct.fetchText(f.url);
      if (!r || !r.ok) throw new Error('status ' + (r ? r.status : 0));
      renderRssFeed(f, parseFeedXml(r.body), null);
    } catch (e) {
      log('rss ' + f.key + ' failed: ' + (e && e.message || e));
      renderRssFeed(f, [], String(e && e.message || e));
    }
  }
  rssFetched = Date.now();
}
function wireRSS() {
  const box = document.getElementById('rssFeeds');
  if (!box) return;
  box.innerHTML = RSS_FEEDS.map(f =>
    '<section class="rss-feed" id="rss-' + f.key + '">' +
    '<h6>' + f.title + ' <span class="rss-src">' + f.src + '</span></h6>' +
    '<div class="rss-meta"></div><ul></ul></section>').join('');
  const b = document.getElementById('rssRefresh');
  if (b) b.addEventListener('click', () => loadRss(true));
  loadRss(false);
  if (rssTimer) clearInterval(rssTimer);
  rssTimer = setInterval(() => loadRss(true), 15 * 60 * 1000);
}

function wireGraphs() {
  $('graphsClose').addEventListener('click', () => setView('globe'));
  $('papersClose').addEventListener('click', () => setView('globe'));
  $('moonClose').addEventListener('click', () => setView('globe'));
  [...document.querySelectorAll('#gSeries input')].forEach(cb => cb.addEventListener('change', loadGraphSeries));
  $('gMag').addEventListener('change', loadGraphSeries);
  $('gRange').addEventListener('change', () => { graphWinEnd = null; updateGraphWinTip(); loadGraphSeries(); });
  $('gPrev').addEventListener('click', () => graphStep(-1));
  $('gNext').addEventListener('click', () => graphStep(1));
  const cv = $('graphCanvas');
  cv.addEventListener('mousemove', e => {
    graphHoverX = e.clientX - cv.getBoundingClientRect().left;
    graphMouse = { x: e.clientX, y: e.clientY };
    drawGraph();
  });
  cv.addEventListener('mouseleave', () => {
    graphHoverX = null;
    graphMouse = null;
    drawGraph();
    const tag = $('graphCursorTag');
    if (tag) tag.classList.add('hidden');
  });
  window.addEventListener('resize', () => { if (!$('graphsPanel').classList.contains('hidden')) loadGraphSeries(); });
  if ('ResizeObserver' in window) {
    let roFrame = false;
    new ResizeObserver(() => {
      if ($('graphsPanel').classList.contains('hidden')) return;
      if (roFrame) return;   // debounce the resize storm; the latest frame wins
      roFrame = true;
      requestAnimationFrame(() => { roFrame = false; loadGraphSeries(); });
    }).observe($('graphStage'));
  }
}

/* ---------- magnet data management dialog ---------- */
function magnetRowMeta(m) {
  const d = MAGNETDATA[m.key];
  if (!d || !d.pts) return { txt: 'no data', cache: false };
  const a = new Date(d.pts[0].t).toISOString().slice(0, 10);
  const b = new Date(d.pts[d.pts.length - 1].t).toISOString().slice(0, 10);
  return { txt: d.pts.length.toLocaleString() + ' daily pts · ' + a + ' → ' + b + (d.cache ? ' · refreshed' : ' · bundled'), cache: !!d.cache };
}
function renderMagnetRows() {
  const box = $('magnetRows');
  if (!box) return;
  let html = '';
  for (const [sid, m] of Object.entries(MAGNET)) {
    const meta = magnetRowMeta(m);
    html += '<div class="magnet-row">' +
      '<div class="m-info"><div class="m-name">' + m.label + ' <span style="color:' + m.color + '">●</span></div>' +
      '<div class="m-meta">OMNI2 var ' + m.varNum + ' · ' + m.unit + ' · ' + meta.txt + '</div></div>' +
      '<div class="m-status" id="mst-' + m.key + '"></div>' +
      '<button data-key="' + m.key + '" data-sid="' + sid + '">⟳ refresh</button></div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => refreshMagnet(b, b.dataset.key, b.dataset.sid)));
}
function setMagnetStatus(key, txt) {
  const el = $('mst-' + key);
  if (el) el.textContent = txt;
}
async function refreshMagnet(btn, key, sid) {
  const m = MAGNET[sid];
  if (!m || btn.disabled) return;
  btn.disabled = true;
  setMagnetStatus(key, 'fetching…');
  try {
    const cur = new Date().getUTCFullYear();
    // fetch 1970→now in year chunks, daily res (politely, ~10 requests for long spans)
    const all = [];
    for (let y = 1970; y <= cur; y++) {
      const body = 'activity=retrieve&res=daily&spacecraft=omni2' +
        '&start_date=' + y + '0101&end_date=' + y + '1231' +
        '&scale=linear&imagex=960&imagey=720&charsize=1.5&symsize=0.5&vars=' + m.varNum;
      const r = await window.ct.postText('https://omniweb.gsfc.nasa.gov/cgi/nx1.cgi', body);
      if (!r || !r.ok) throw new Error('OMNIWeb failed (status ' + (r && r.status) + ')');
      const pts = parseOmniDaily(r.body);
      for (const p of pts) all.push(p);
      await new Promise(res => setTimeout(res, 700));   // polite
    }
    all.sort((a, b) => a.t - b.t);
    // de-dup by day (OMNIWeb can return overlapping covering full year chunks)
    const seen = new Set();
    const dedup = [];
    for (const p of all) { const k = Math.floor(p.t / 864e5); if (!seen.has(k)) { seen.add(k); dedup.push(p); } }
    const rec = { id: key, source: 'OMNIWeb OMNI2 daily (refreshed ' + new Date().toISOString().slice(0, 10) + ')', varNum: m.varNum,
      startT: dedup.length ? dedup[0].t : 0, endT: dedup.length ? dedup[dedup.length - 1].t : 0,
      count: dedup.length, pts: dedup.map(p => [p.t, p.v]), cache: true };
    const sv = await window.ct.magnetSave(key, rec);
    if (!sv.ok) throw new Error('could not save cache: ' + sv.error);
    MAGNETDATA[key] = { pts: dedup, count: dedup.length, cache: true, source: rec.source };
    setMagnetStatus(key, '✓ refreshed ' + dedup.length.toLocaleString() + ' pts');
    renderMagnetRows();
    if (!$('graphsPanel').classList.contains('hidden')) loadGraphSeries();
  } catch (e) {
    setMagnetStatus(key, '✗ ' + (e && e.message || e));
  } finally {
    btn.disabled = false;
  }
}
function parseOmniDaily(html) {
  // OMNIWeb returns hourly rows even for res=daily; average per day to one point
  // so refresh results are consistent with the bundled daily series.
  const pre = /<pre>([\s\S]*?)<\/pre>/.exec(html);
  if (!pre) return [];
  const daySum = new Map();
  let started = false;
  for (const line of pre[1].split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    if (/^YEAR\s+DOY/i.test(s)) { started = true; continue; }
    if (!started) continue;
    const c = s.split(/\s+/);
    if (c.length < 4) continue;
    const y = +c[0], doy = +c[1];
    if (!isFinite(y) || !isFinite(doy)) continue;
    const v = parseFloat(c[3]);
    if (!isFinite(v) || Math.abs(v) > 990) continue;
    const key = y * 1000 + doy;
    const e = daySum.get(key) || { s: 0, n: 0 };
    e.s += v; e.n++;
    daySum.set(key, e);
  }
  const rows = [];
  for (const [key, e] of daySum) {
    const y = Math.floor(key / 1000), doy = key % 1000;
    rows.push({ t: Date.UTC(y, 0, doy), v: +(e.s / e.n).toFixed(3) });
  }
  return rows;
}
function wireMagnetData() {
  $('magnetDataBtn').addEventListener('click', () => { ensureMagnet().then(() => { renderMagnetRows(); $('magnetDialog').classList.remove('hidden'); }); });
  $('magnetDialogClose').addEventListener('click', () => $('magnetDialog').classList.add('hidden'));
}

/* ---------- below-graph enrichment ---------- */
function pearsonXY(aV, bV, aT, bT, lagMs) {
  // align a's value at time t with b's value at t+lagMs (b is "shifted later")
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < aT.length; i++) {
    const target = aT[i] + lagMs;
    // find b point nearest target
    let best = -1, bd = Infinity;
    for (let j = 0; j < bT.length; j++) {
      const d = Math.abs(bT[j] - target);
      if (d < bd) { bd = d; best = j; }
    }
    if (best < 0) continue;
    const x = aV[i], y = bV[best];
    if (!isFinite(x) || !isFinite(y) || x == null || y == null) continue;
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  if (n < 3) return null;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  if (!den) return null;
  return { r: (n * sxy - sx * sy) / den, n };
}
function enrichStats(active) {
  let html = '<h5>Window summary</h5>';
  for (const s of active) {
    const pts = graphSeriesCache[s.id];
    if (!pts || !pts.length) continue;
    let sum = 0, cnt = 0, mx = -Infinity, mn = Infinity;
    for (const p of pts) { if (!isFinite(p.v) || p.v == null) continue; sum += p.v; cnt++; if (p.v > mx) mx = p.v; if (p.v < mn) mn = p.v; }
    if (!cnt) continue;
    const avg = sum / cnt;
    const fmt = v => v < 20 ? v.toFixed(2) : Math.round(v).toLocaleString();
    const unit = MAGNET[s.id] ? (' ' + MAGNET[s.id].unit) : (s.id === 'gpd' ? ' /cc' : '');
    html += '<div class="row"><span>' + s.label + '</span><span>total <b>' + fmt(sum) + unit + '</b> · avg <b>' + fmt(avg) + unit + '</b> · max <b>' + fmt(mx) + unit + '</b></span></div>';
  }
  return html;
}
function enrichMagDist(t0, t1) {
  const t = S.q.t, m = S.q.m;
  const bins = [4.5, 5, 6, 7, 9];
  const counts = new Array(bins.length - 1).fill(0);
  const a = lowerBound(t, t0 / 1000), b = upperBound(t, t1 / 1000);
  for (let i = a; i < b; i++) {
    const mg = m[i];
    if (!isFinite(mg)) continue;
    for (let k = 0; k < bins.length - 1; k++) if (mg >= bins[k] && mg < bins[k + 1]) { counts[k]++; break; }
  }
  const total = counts.reduce((x, y) => x + y, 0);
  if (!total) return '<h5>Magnitude distribution</h5><div class="row"><span>No quakes in window</span><span>—</span></div>';
  const colors = ['#8fd0ff', '#5ea8ff', '#ffd166', '#ff6b6b'];
  const labels = ['M4.5–5', 'M5–6', 'M6–7', 'M7+'];
  let bar = '<div class="magbar">';
  counts.forEach((c, k) => { if (c) bar += '<i style="width:' + (c / total * 100).toFixed(1) + '%;background:' + colors[k] + '"></i>'; });
  bar += '</div><div class="mag-legend">';
  counts.forEach((c, k) => { bar += '<span style="margin-right:12px"><b style="color:' + colors[k] + '">' + labels[k] + '</b>: ' + c.toLocaleString() + '</span>'; });
  bar += '</div>';
  return '<h5>Magnitude distribution · ' + total.toLocaleString() + ' quakes</h5>' + bar;
}
function enrichCorr(t0, t1, active, bin) {
  // Pearson r between every pair of active series over the window (0-lag), tagged "exploratory".
  const suit = active.filter(s => graphSeriesCache[s.id] && graphSeriesCache[s.id].length);
  let html = '<h5>Cross-correlation (Pearson, 0-lag)</h5>';
  if (suit.length < 2) { html += '<div class="row"><span>Turn on 2+ series</span><span>—</span></div>'; return html; }
  let nPairs = 0;
  const pairs = [];
  for (let i = 0; i < suit.length; i++) for (let j = i + 1; j < suit.length; j++) {
    const A = graphSeriesCache[suit[i].id], Bst = graphSeriesCache[suit[j].id];
    const res = pearsonXY(A.map(p => p.v), Bst.map(p => p.v), A.map(p => p.t), Bst.map(p => p.t), 0);
    if (!res) continue;
    nPairs++;
    pairs.push({ a: suit[i], b: suit[j] });
    html += '<div class="row"><span>' + suit[i].label + ' ↔ ' + suit[j].label + '</span><span>r = <b>' + res.r.toFixed(3) + '</b> (n=' + res.n + ')</span></div>';
  }
  if (!nPairs) html += '<div class="row"><span>Not enough aligned points</span><span>—</span></div>';
  html += enrichLagStrip(pairs, bin || 864e5);
  return html;
}
function enrichLagStrip(pairs, bin) {
  // Scan a small window of lags (the "lag engine" from the spec: time-shift one
  // series against another) on the strongest pair. EXPLORATORY - aligned to the
  // Marchitelli ~1-day proton-density effect when the bin is daily.
  const isMo = bin >= 26 * 864e5;
  const unit = isMo ? 'mo' : (bin <= 3600e3 ? 'h' : 'd');
  const maxLag = isMo ? 4 : 6;
  const lagMs = bin <= 3600e3 ? 3600e3 : bin;
  let best = null, bestAbs = 0;
  for (const pr of pairs) {
    const aP = graphSeriesCache[pr.a.id], bP = graphSeriesCache[pr.b.id];
    if (!aP || !bP || aP.length < 10 || bP.length < 10) continue;
    // bound the scan to ~1k points so 25Y windows stay instant
    const strideA = Math.ceil(aP.length / 1000), strideB = Math.ceil(bP.length / 1000);
    const aV = [], bV = [], aT = [], bT = [];
    for (let i = 0; i < aP.length; i += strideA) { aV.push(aP[i].v); aT.push(aP[i].t); }
    for (let i = 0; i < bP.length; i += strideB) { bV.push(bP[i].v); bT.push(bP[i].t); }
    for (let l = -maxLag; l <= maxLag; l++) {
      const r = pearsonXY(aV, bV, aT, bT, l * lagMs);
      if (!r) continue;
      const av = Math.abs(r.r);
      if (l && av > bestAbs) { bestAbs = av; best = { a: pr.a, b: pr.b, l, r: r.r, n: r.n, val: r }; }
    }
  }
  if (!best) return '';
  // recompute the strip values for the best pair (sampled) so bars have heights
  const aP = graphSeriesCache[best.a.id], bP = graphSeriesCache[best.b.id];
  const strideA = Math.ceil(aP.length / 1000), strideB = Math.ceil(bP.length / 1000);
  const aV = [], bV = [], aT = [], bT = [];
  for (let i = 0; i < aP.length; i += strideA) { aV.push(aP[i].v); aT.push(aP[i].t); }
  for (let i = 0; i < bP.length; i += strideB) { bV.push(bP[i].v); bT.push(bP[i].t); }
  let stripHtml = '<div class="lagstrip">';
  for (let l = -maxLag; l <= maxLag; l++) {
    const rr = pearsonXY(aV, bV, aT, bT, l * lagMs);
    const v = rr ? rr.r : 0;
    const h = Math.max(6, Math.round(Math.abs(v) * 34));
    const col = v >= 0 ? 'rgba(94,168,255,.85)' : 'rgba(255,107,107,.85)';
    const hl = l === best.l ? ' style="outline:2px solid #ffd166"' : '';
    stripHtml += '<i' + hl + ' style="height:' + h + 'px;background:' + col + '" title="' + (l >= 0 ? '+' : '−') + Math.abs(l) + ' ' + unit + ': r=' + (rr ? rr.r.toFixed(3) : '-') + '"></i>';
  }
  stripHtml += '</div>';
  const lagTxt = (best.l >= 0 ? '+' : '−') + Math.abs(best.l) + ' ' + unit;
  const dirTxt = best.l === 0 ? '' : (best.l < 0 ? ' earlier' : ' later');
  const theo = unit === 'd' ? ' Marchitelli et al. report a ≈1-day proton-density lead — this is the same scale.' : '';
  return '<div class="g-note"><b>Lag scan · ' + unit + '</b> — strongest shift is <b>' + lagTxt + '</b> (' + best.a.label + ' ↔ ' + best.b.label + '), r = <b>' + best.r.toFixed(3) + '</b> when the second series sits ' + dirTxt + ' (n=' + best.n + ').' + theo + '</div>' + stripHtml +
    '<div class="lagcap"><span>−' + maxLag + ' ' + unit + '</span><span style="color:#ffd166">peak ' + lagTxt + '</span><span>+' + maxLag + ' ' + unit + '</span></div>';
}
function enrichNotable(t0, t1) {
  // largest quakes in window + biggest sunspot month + earth-directed CME arrivals
  const t = S.q.t, m = S.q.m, la = S.q.la, lo = S.q.lo;
  const a = lowerBound(t, t0 / 1000), b = upperBound(t, t1 / 1000);
  const big = [];
  for (let i = a; i < b; i++) big.push([m[i] || 0, t[i] * 1000, la[i], lo[i]]);
  big.sort((x, y) => y[0] - x[0]);
  let html = '<h5>Notable in window</h5><ul>';
  if (big.length) {
    const top = big.slice(0, 4);
    for (const e of top) {
      const d = new Date(e[1]).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      html += '<li><span class="ev">M' + e[0].toFixed(1) + '</span> ' + d + '  (' + e[2].toFixed(1) + '°, ' + e[3].toFixed(1) + '°)</li>';
    }
  }
  // sunspot max in window
  const snPts = graphSeriesCache['gsn'];
  if (snPts && snPts.length) {
    let bm = -Infinity, bt = t0;
    for (const p of snPts) if (p.v != null && p.v > bm) { bm = p.v; bt = p.t; }
    if (isFinite(bm)) html += '<li><span class="ev">☀ max SN ' + Math.round(bm) + '</span> ' + new Date(bt).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) + '</li>';
  }
  // earth-directed CME arrival within window (if historical rows present)
  if (S.cmeHistRows && S.cmeHistRows.length) {
    let shown = 0;
    for (const c of S.cmeHistRows) {
      const at = c.arrival ? Date.parse(c.arrival) : NaN;
      if (isFinite(at) && at >= t0 && at <= t1 && `${c.earth}` === 'true') {
        html += '<li><span class="ev">☄ CME arrival</span> ' + new Date(at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + '</li>';
        if (++shown >= 3) break;
      }
    }
  }
  if (html === '<h5>Notable in window</h5><ul>') html += '<li>No notable events</li>';
  html += '</ul>';
  return html;
}
function enrichCharging(t0, t1, active) {
  // "cumulative charging" overlay: integrate a stress proxy over the window and
  // compare the running cumulative vs quake timing. EXPLORATORY.
  const proxy = active.find(s => s.id === 'gbz') || active.find(s => s.id === 'gpr') || active.find(s => s.id === 'gdst') || active.find(s => s.id === 'gkp');
  let html = '<h5>Cumulative “charging” overlay (exploratory)</h5>';
  if (!proxy || !graphSeriesCache[proxy.id] || !graphSeriesCache[proxy.id].length) {
    html += '<div class="row"><span>Enable one of Bz / SW pressure / Dst / Kp</span><span>—</span></div>';
    return html;
  }
  const pts = graphSeriesCache[proxy.id].filter(p => isFinite(p.v) && p.v != null);
  if (pts.length < 4) { html += '<div class="row"><span>Not enough data</span><span>—</span></div>'; return html; }
  let cum = 0, min = 0, max = 0;
  for (const p of pts) { cum += p.v; if (cum < min) min = cum; if (cum > max) max = cum; }
  const b = Math.max(1, Math.min(200, pts.length));
  const step = Math.floor(pts.length / b);
  let bar = '<div class="magbar" style="height:26px">';
  for (let i = 0; i + step <= pts.length; i += step) {
    const c = pts.slice(i, i + step);
    let s = 0; for (const p of c) s += p.v;
    const cumv = s;
    const h = 2 + Math.round((cumv - min) / (max - min || 1) * 22);
    bar += '<i style="width:' + (step / pts.length * 100).toFixed(2) + '%;height:' + h + 'px;background:' + proxy.color + ';opacity:' + (0.35 + 0.65 * h / 24).toFixed(2) + ';display:inline-block;vertical-align:bottom"></i>';
  }
  bar += '</div>';
  html += '<div class="row"><span>Integrated proxy (' + proxy.label + ')</span><span>window cumulative <b>' + Math.round(cum) + '</b> ' + (MAGNET[proxy.id] ? MAGNET[proxy.id].unit : '') + ' · min <b>' + Math.round(min) + '</b> · max <b>' + Math.round(max) + '</b></span></div>';
  html += bar;
  html += '<div class="g-note">Cumulative sum of the selected space-weather stress proxy over the window. The idea is to look for quake clusters after rising cumulative charge — a “threshold/charging” narrative. This is <b>exploratory</b>: integration order and units make it a heuristic, not a validated mechanism (see Love &amp; Thomas 2013 for the null result).</div>';
  return html;
}
function renderGraphEnrich(t0, t1, active, bin) {
  const box = $('graphEnrich');
  if (!box) return;
  let html = '<div class="g-blk">' + enrichStats(active) + '</div>';
  html += '<div class="g-blk">' + enrichMagDist(t0, t1) + '</div>';
  html += '<div class="g-blk">' + enrichCorr(t0, t1, active, bin) + '</div>';
  html += '<div class="g-blk">' + enrichNotable(t0, t1) + '</div>';
  html += '<div class="g-blk">' + enrichCharging(t0, t1, active) + '</div>';
  html += '<div class="g-blk" style="flex-basis:100%"><h5>Solar-proton hypothesis (Marchitelli et al. 2020)</h5>' +
    '<div class="row"><span>Reported finding</span><span>Solar-wind <b>proton density</b> correlates with worldwide <b>M≥5.6</b> quakes at <b>~1 day</b> lag (p &lt; 1e-5); signal grows with magnitude threshold</span></div>' +
    '<div class="row"><span>What we show here</span><span><b>Historical proton density</b> (bundled OMNI2 daily, 1970→now, <b>·theory</b>) plus <b>IMF Bz / |B|, SW pressure, Dst and E-field</b>, all from the same OMNIWeb feed. The live 24 h ACE series is the magenta “proton density (live)”. All exploratory, not a verified mechanism</span></div>' +
    '<div class="g-note">Try: enable <b>proton density</b> + <b>IMF Bz</b> + <b>quakes (M≥6)</b> + <b>Kp</b>, then page the 3Y–25Y ranges and look at the 0-lag cross-correlation, the day-lag scan strip, and the cumulative “charging” bar. Use the <b>data ▾</b> dialog to refresh any of these series individually.</div></div>';
  box.innerHTML = html;
}

/* ---------- studies / papers ---------- */
const PAPERS = [
  {
    title: 'On the correlation between solar activity and large earthquakes worldwide',
    src: 'Marchitelli, Harabaglia, Troise & De Natale — Scientific Reports (2020) 10:11495',
    doi: 'https://doi.org/10.1038/s41598-020-67860-3',
    year: 2020,
    label: 'THE paper you asked about',
    find: 'Analysed 20 years of SOHO solar-wind proton density against the ISC-GEM quake catalogue. Found a clear correlation between proton density and worldwide M&gt;5.6 quakes at ~1 day time shift (p &lt; 1e-5), and the signal strengthens as the magnitude threshold rises. Proposed reverse-piezoelectric triggering as a mechanism.',
    caveat: 'Uses proton flux/density data we do not bundle (we show Kp/F10.7/sunspot proxies instead). Still disputed; a later 2025 GRL paper argues the inverse-piezoelectric mechanism is not plausible.'
  },
  {
    title: 'On Solar-Terrestrial Interactions: correlation between intense geomagnetic storms and global strong earthquakes',
    src: 'Chen, Han, Zhuang, Hattori et al. — Geophysical Research Letters (2025), doi:10.1029/2024GL108590',
    doi: 'https://doi.org/10.1029/2024GL108590',
    year: 2025,
    label: 'Geomagnetic storms ↔ quakes',
    find: 'Used a new SNMC method over ~a century of Dst/Kp storm data and global M≥7.5 quakes. Found an increased likelihood of strong quakes ~27–28 days after intense geomagnetic storms (a lag close to the sun’s rotation period).',
    caveat: 'Significance weakens when quakes are replaced by random series; authors caution the gain is far from reliable prediction and is not proof of causation.'
  },
  {
    title: 'Insignificant solar-terrestrial triggering of earthquakes',
    src: 'Love & Thomas — Geophysical Research Letters (2013) 40(6):1165–1170',
    doi: 'https://doi.org/10.1002/grl.50211',
    year: 2013,
    label: 'The skeptical counterpoint',
    find: 'Analysed ~century-long annual/monthly/daily sunspot, solar-wind and geomagnetic (aa) data against global quakes. Found no statistically significant difference in quake distributions, even testing delays of a few years down to ≤5 days.',
    caveat: 'Often cited as the strongest null result. Note it considered delays ≤5 days and ≤2 months, and used different centrality/stacking methods than the positive-claim papers.'
  },
  {
    title: 'A statistical study of the correlation between geomagnetic storms and M≥7.0 global earthquakes during 1957–2020',
    src: 'Chen, Wang, Miao, Liu, Ma, Hattori & Han — Entropy (2020) 22(11):1270',
    doi: 'https://doi.org/10.3390/e22111270',
    year: 2020,
    label: 'Storms before M7+',
    find: 'Found statistically significant evidence that geomagnetic storm probability increased about 26–27 days before M≥7.0 quakes over 1957–2020.',
    caveat: 'Direction here is storms-before-quakes with a ~27-day lead, which is the opposite timing to the Marchitelli ~1-day-lag claim — the literature is genuinely mixed.'
  },
  {
    title: 'Kp-index variability before large earthquakes (geomagnetic triggering)',
    src: 'Urata et al. (2018) — geomagnetic triggering via Lorentz force',
    doi: '',
    year: 2018,
    label: 'Kp before quakes',
    find: 'Stacking of thousands of Kp records (1932–2016) suggests an increase in the Kp index roughly a month before large earthquakes, and a distinct geomagnetic-surge pattern synchronized with seismicity; the effect is stronger for M8 than M6 events.',
    caveat: 'Early work, regional/complex behaviour; magnitude- and region-dependent and not universally confirmed.'
  },
  {
    title: 'Space weather and earthquakes: possible triggering of seismic activity by strong solar flares',
    src: 'Novikov, Ruzhin, Sorokin & Yaschenko — Ann. Geophys. (2020) 63, PA554',
    doi: '',
    year: 2020,
    label: 'X-flares ↔ seismicity',
    find: 'Proposed and tested electromagnetic triggering of quakes by strong solar flares (GICs in conductive crustal faults). Superposed-epoch analysis of ~50 X-class flares (1997–2024) found increased seismicity, strongest near the subsolar point (up to ~33%), in the ~10 days after a flare.',
    caveat: 'Statistical-support, mechanism-driven position; the physical coupling model remains debated.'
  },
  {
    title: 'On the relation between seismicity and magnetic storms (Kp>7)',
    src: 'Sobolev (2021) — referenced across the literature',
    doi: '',
    year: 2021,
    label: 'Severe storms → quakes',
    find: 'Of 50 of the strongest magnetic storms (Kp&gt;7) between 1994–2017, 17 M≥6.5 quakes occurred within 2 days, judged non-random with &gt;95% probability.',
    caveat: 'Small counts and an eastern-hemisphere location bias were noted; correlation, not causation.'
  },
  {
    title: 'Effect of solar activity on electromagnetic fields and seismicity of the Earth',
    src: 'Tarasov — IOP Conf. Ser. Earth Environ. Sci. 929 (2021) 012019',
    doi: 'https://doi.org/10.1088/1755-1315/929/1/012019',
    year: 2021,
    label: 'Mixed sign with storm vs radiation',
    find: 'Bursts of solar ionizing radiation statistically decrease the total number of quakes, while geomagnetic storms increase it — mainly via an increase in the strongest (MS&gt;7) events for a few days after storms (probability more than doubles).',
    caveat: 'Shows the effect sign depends on which solar variable is used — a caution against oversimplified “solar activity causes quakes” narratives.'
  }
];
function renderPapers() {
  const box = $('papersList');
  if (!box) return;
  let html = '';
  for (const p of PAPERS) {
    html += '<div class="paper"><div class="p-title">' + p.title + '</div>' +
      '<div class="p-src">' + p.src + (p.doi ? ' · <a href="' + p.doi + '" target="_blank" rel="noopener">open paper ↗</a>' : '') + '</div>' +
      '<div class="p-lbl">' + p.label + ' · ' + p.year + '</div>' +
      '<div class="p-find">' + p.find + '</div>' +
      '<div class="p-caveat">Caveat: ' + p.caveat + '</div></div>';
  }
  box.innerHTML = html;
}

/* ---------- first-time tutorial ---------- */
const TUTORIAL_STEPS = [
  { sel: '#sidebar', arrow: 'right', text: 'This is the <b>layers panel</b> — toggle what you want to see: earthquakes, plate boundaries, volcanoes, live hazard alerts, CMEs and flares.' },
  { sel: '.view-tabs', arrow: 'down', text: 'Switch between the <b>Globe</b>, a <b>Flat</b> map, and the <b>Graphs</b> view in the top-right corner.' },
  { sel: '#tlCanvas', arrow: 'up', text: 'The <b>timeline</b> — drag to sweep through 56 years of earthquake history, or press ▶ to animate it.' },
  { sel: '#sparkWrap', arrow: 'up', text: 'A quick glance at the <b>last 7 days</b> of earthquake activity — one bar per day.' },
  { sel: '#anaBtn', arrow: 'left', text: 'The <b>correlation lab</b> compares solar indices against quake frequency, with lag analysis.' },
  { sel: '#aboutBtn', arrow: '', text: 'Hit <b>ℹ️</b> any time to be reminded what this tool is for.' },
  { sel: '#gearBtn', arrow: '', text: '<b>⚙️ Settings</b> — spoken announcements, polling, speed, and data depth.' },
  { sel: '#map', arrow: '', text: 'That\u2019s it. This is a <b>tool for the curious</b> \u2014 find cosmic correlations, or don\u2019t. Either way is a valid result. Enjoy the exploration.' }
];
let tutorialIdx = 0;
function showTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIdx];
  const el = $(step.sel);
  if (!el) { tutorialIdx++; if (tutorialIdx < TUTORIAL_STEPS.length) showTutorialStep(); return; }
  const r = el.getBoundingClientRect();
  const hl = $('tutorialHighlight');
  hl.style.width = r.width + 'px';
  hl.style.height = r.height + 'px';
  hl.style.left = r.left + window.scrollX + 'px';
  hl.style.top = r.top + window.scrollY + 'px';
  const bb = $('tutorialBubble');
  const tw = 300, th = 120;
  let left = r.left + r.width / 2 - tw / 2;
  let top = r.top - th - 14;
  if (top < 8) top = r.top + r.height + 14;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  if (top + th > window.innerHeight - 8) top = window.innerHeight - th - 8;
  bb.style.left = left + 'px';
  bb.style.top = top + 'px';
  $('tutorialText').innerHTML = step.text;
  $('tutorialStep').textContent = (tutorialIdx + 1) + ' / ' + TUTORIAL_STEPS.length;
  $('tutorialNext').textContent = tutorialIdx === TUTORIAL_STEPS.length - 1 ? 'Done' : 'Next →';
}
function startTutorial() {
  tutorialIdx = 0;
  $('tutorialOverlay').classList.remove('hidden');
  showTutorialStep();
}
function endTutorial() {
  $('tutorialOverlay').classList.add('hidden');
  SET.tutorialDone = true;
  saveSet();
}
$('tutorialNext').addEventListener('click', () => {
  if (tutorialIdx < TUTORIAL_STEPS.length - 1) { tutorialIdx++; showTutorialStep(); }
  else endTutorial();
});
$('tutorialEnd').addEventListener('click', endTutorial);
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('tutorialOverlay').classList.contains('hidden')) { endTutorial(); return; }
  const hp = $('helpPanel');
  if (hp && !hp.classList.contains('hidden')) hp.classList.add('hidden');
});

/* ---------- boot ---------- */
const BOOT_MIN_MS = 2200;
let bootT0 = Date.now();
function bootMsg(msg) { const b = $('bootSub'); if (b) b.textContent = msg; }

(async function init() {
  try {
    bootMsg('decoding earthquake archive…');
    log('requesting archive…');
    S.q = await window.ct.quakeArchive();
    S.tMin = S.q.t[0]; S.tMax = S.q.t[S.q.t.length - 1];
    buildCounts();
    S.winEnd = S.tMax * 1000;
    S.winStart = S.winEnd - S.spanMs;
    $('statChip').textContent = 'archive: ' + S.q.t.length.toLocaleString() + ' quakes · M4.5+ · 1970→' + new Date(S.tMax * 1000).getUTCFullYear();
    bootMsg('building globe…');
    log('archive ready: ' + S.q.t.length);

    const land = await window.ct.geoLayer('land.geojson');
    const plates = await window.ct.geoLayer('plates.geojson');
    buildMap(land, plates);

    wireTimeline();
    applySidebar();

    $('lyQuakes').addEventListener('change', applySidebar);
    $('lyPlates').addEventListener('change', applySidebar);
    $('lyGrid').addEventListener('change', applySidebar);
    $('opQuakes').addEventListener('input', applySidebar);
    $('magMin').addEventListener('input', applySidebar);
    $('lyLive24').addEventListener('change', applySidebar);
    $('lyHazards').addEventListener('change', applySidebar);
    $('lyVolcs').addEventListener('change', applySidebar);
    document.querySelectorAll('.hz-types input').forEach(cb => cb.addEventListener('change', () => {
      HZ_ON[cb.dataset.hz] = cb.checked; saveHz(); applyHz();
    }));
    [...document.querySelectorAll('.hz-types input')].forEach(cb => cb.checked = !!HZ_ON[cb.dataset.hz]);
    $('lyFlares').addEventListener('change', applySidebar);
    $('sunStripBtn').addEventListener('click', () => {
      S.sunStrip = !S.sunStrip;
      $('sunStripBtn').classList.toggle('on', S.sunStrip);
      drawTimeline();
    });
    $('sunBarsBtn').addEventListener('click', () => {
      S.sunBars = !S.sunBars;
      $('sunBarsBtn').classList.toggle('on', S.sunBars);
      drawTimeline();
    });

    $('hzLegend').innerHTML = Object.entries(HZ_COLORS)
      .map(([k, c]) => '<span><i style="background:' + c + '"></i>' +
        ({ TC: 'cyclone', FL: 'flood', WF: 'wildfire', VO: 'volcano', DR: 'drought' }[k] || k) + '</span>').join('');

    wirePopups();
    wireCapitals();
    loadLive24();
    loadHazards();
    bootMsg('loading CME + flare data…');
    await loadCME();
    await loadFlares();
    loadSolarHist();
    loadCapitals();
    bootMsg('loading volcanoes + solar indices…');
    await loadVolcs();
    computeSyzygy();
    await loadKp();
    await loadSilso();
    bootMsg('rendering quakes…');
    refreshQuakes();
    wireAna();
    wireTW();
    wireGraphs();
    wireMagnetData();
    wireRSS();
    drawGauge();
    if ($('donkiFetchBtn')) {
      const yrs = parseInt(SET.donkiYears || '5', 10);
      $('donkiFetchBtn').textContent = '⟳ Fetch ' + yrs + 'yr CME + flare history';
      $('donkiFetchBtn').addEventListener('click', loadDonkiHistory);
    }

    applySet();
    $('liveBtn').addEventListener('click', liveJump);
    $('aboutBtn').addEventListener('click', () => {
      $('aboutPanel').classList.toggle('hidden');
      $('settingsPanel').classList.add('hidden');
    });
    $('aboutClose').addEventListener('click', () => $('aboutPanel').classList.add('hidden'));
    $('gearBtn').addEventListener('click', () => {
      $('settingsPanel').classList.toggle('hidden');
      $('aboutPanel').classList.add('hidden');
    });
    $('settingsClose').addEventListener('click', () => $('settingsPanel').classList.add('hidden'));
    $('helpBtn').addEventListener('click', () => {
      $('helpPanel').classList.toggle('hidden');
      $('aboutPanel').classList.add('hidden');
      $('settingsPanel').classList.add('hidden');
    });
    $('helpClose').addEventListener('click', () => $('helpPanel').classList.add('hidden'));
    $('helpBtnReopen').addEventListener('click', () => { $('helpPanel').classList.add('hidden'); startTutorial(); });
    $('setShowTutorial').checked = !SET.tutorialDone;
    $('setShowTutorial').addEventListener('change', e => {
      SET.tutorialDone = !e.target.checked; saveSet();
      if (e.target.checked) startTutorial();
    });
    $('setSyz').checked = SET.syz !== 'off';
    $('setSyz').addEventListener('change', e => {
      SET.syz = e.target.checked ? 'on' : 'off'; saveSet(); applySidebar();
    });
    $('setSpeech').addEventListener('change', e => {
      SET.speech = e.target.value; saveSet();
      if (SET.speech === 'on') speak('Speech enabled.');
    });
    $('setPoll').addEventListener('change', e => { SET.poll = e.target.value; saveSet(); restartPoll(); });
    $('setSpeed').addEventListener('change', e => { SET.speed = e.target.value; saveSet(); });
    $('setDonkiYears').value = SET.donkiYears || '5';
    $('setDonkiYears').addEventListener('change', e => { SET.donkiYears = e.target.value; saveSet(); });
    (async () => {
      try {
        const m = await window.ct.archiveInfo();
        $('arcStat').textContent = 'coverage ' + new Date(m.minT * 1000).toISOString().slice(0, 10) +
          ' → ' + new Date(m.maxT * 1000).toISOString().slice(0, 10) +
          ' · ' + m.count.toLocaleString() + ' events · built ' + String(m.built || '').slice(0, 10);
      } catch (e) { $('arcStat').textContent = 'archive info unavailable'; }
    })();
    $('updBtn').addEventListener('click', async () => {
      const b = $('updBtn');
      b.disabled = true; b.textContent = 'downloading missing data…';
      try {
        const r = await window.ct.updateArchive();
        if (r.rebuilt) {
          b.textContent = 'done: +' + r.fetchedYears.length + ' yr · solar: ' + r.solar.length + ' · reloading…';
          setTimeout(() => location.reload(), 1600);
        } else {
          b.textContent = 'update failed — will retry later'; b.disabled = false;
        }
      } catch (e) { b.textContent = 'update failed — no connection'; b.disabled = false; }
    });
    $('lyCaps').checked = localStorage.getItem('ct_caps') === 'on';
    $('lyCaps').addEventListener('change', e => {
      localStorage.setItem('ct_caps', e.target.checked ? 'on' : 'off'); applySidebar();
    });
    $('lyCMEs').addEventListener('change', applySidebar);

    checkNew(true);   // first pass: mark current events seen without spamming

function setView(mode) {
  document.body.classList.remove('view-globe', 'view-flat', 'view-graphs', 'view-papers', 'view-moon');
  document.body.classList.add('view-' + mode);
  const hp = $('helpPanel');
  if (hp) hp.classList.add('hidden');   // full-screen overlays clear when switching views
  S.projGlobe = mode === 'globe';
  $('tabGlobe').classList.toggle('on', mode === 'globe');
  $('tabFlat').classList.toggle('on', mode === 'flat');
  $('tabGraphs').classList.toggle('on', mode === 'graphs');
  $('tabPapers').classList.toggle('on', mode === 'papers');
  $('tabMoon').classList.toggle('on', mode === 'moon');
  $('graphsPanel').classList.toggle('hidden', mode !== 'graphs');
  $('papersPanel').classList.toggle('hidden', mode !== 'papers');
  $('moonPanel').classList.toggle('hidden', mode !== 'moon');
  if (mode === 'moon' && window.MoonView) MoonView.enter();
  else if (window.MoonView) MoonView.leave();
  if (mode === 'globe' || mode === 'flat') {
    try {
      S.map.setProjection({ type: mode === 'globe' ? 'globe' : 'mercator' });
      if (mode === 'flat') { S.map.setPitch(0); S.map.easeTo({ bearing: 0, duration: 300 }); }
    } catch (e) { /* older maplibre */ }
    drawTimeline();
  } else if (mode === 'graphs') {
    $('graphTip').textContent = 'loading graph data…';
    $('graphTip').classList.add('loading');
    setTimeout(loadGraphSeries, 120);
  }
  if (mode === 'graphs') updateGraphWinTip();
  if (mode === 'papers') renderPapers();
}

$('tabGlobe').addEventListener('click', () => setView('globe'));
$('tabFlat').addEventListener('click', () => setView('flat'));
$('tabGraphs').addEventListener('click', () => setView('graphs'));
$('tabPapers').addEventListener('click', () => setView('papers'));
$('tabMoon').addEventListener('click', () => setView('moon'));

    bootMsg('ready');
    const elapsed = Date.now() - bootT0;
    const delay = Math.max(0, BOOT_MIN_MS - elapsed);
    setTimeout(hideBoot, delay);
    setTimeout(() => { if (!SET.tutorialDone) startTutorial(); }, delay + 700);
  } catch (err) {
    console.error('init failed:', err.message || err);
    $('bootSub').textContent = 'failed to load archive: ' + (err.message || err);
  }
})();

