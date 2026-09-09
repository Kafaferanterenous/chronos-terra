#!/usr/bin/env node
/* Fetch historical solar-wind / magnetosphere data from NASA OMNIWeb (OMNI2, daily res)
   and write bundled JSON seeds into source\data\magnet\.
   Endpoint: https://omniweb.gsfc.nasa.gov/cgi/nx1.cgi  (needs HTTP POST, form-encoded)
   Run: node tools/fetch_magnet.mjs [startYear] [endYear]
   Defaults: startYear=1970, endYear=<current year>.
   One HTTP request per year per single var (kept small + polite). Reuses disk cache
   in data_archive\magnet_raw\ so re-runs are cheap. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'source', 'data', 'magnet');
const RAWCACHE = path.join(ROOT, 'data_archive', 'magnet_raw');

const VARS = {
  'proton': 23,       // SW Proton Density, N/cm^3
  'pressure': 28,     // Flow pressure (dynamic), nPa
  'bz': 16,           // BZ, nT (GSM)
  'imfb': 8,          // Scalar B, nT
  'dst': 40,          // Dst-index, nT
  'efield': 35        // E electric field, mV/m (motional VxBz)
};

function postText(url, body) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const data = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length,
        'User-Agent': 'chronos-terra-magnet-builder'
      }
    }, r => {
      let b = '';
      r.on('data', c => b += c);
      r.on('end', () => r.statusCode === 200 ? res(b) : rej(new Error('status ' + r.statusCode)));
    });
    req.on('error', rej);
    req.write(data);
    req.end();
  });
}

/* parse the OMNIWeb HTML <pre> block into rows. Returns array of rows:
   { y, doy, hr, values: number[] }  (values already NaN for missing) */
function parsePre(html) {
  const preMatch = /<pre>([\s\S]*?)<\/pre>/.exec(html);
  if (!preMatch) throw new Error('no <pre> block in OMNIWeb reply');
  const lines = preMatch[1].split(/\r?\n/);
  const rows = [];
  let started = false;
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    if (/^YEAR\s+DOY/i.test(s)) { started = true; continue; }
    if (/^Selected parameters:/i.test(s) || /^HP/i.test(s)) continue;
    if (!started) continue;
    const c = s.split(/\s+/);
    if (c.length < 4) continue;
    const y = +c[0], doy = +c[1], hr = +c[2];
    if (!isFinite(y) || !isFinite(doy)) continue;
    const values = c.slice(3).map(x => {
      const v = parseFloat(x);
      // OMNIWeb missing markers
      if (Math.abs(v) > 990) return NaN;
      return isFinite(v) ? v : NaN;
    });
    rows.push({ y, doy, hr, values });
  }
  return rows;
}

function doyToUtcMs(y, doy) {
  return Date.UTC(y, 0, doy);
}

async function fetchYear(year, varId, varNum) {
  if (year < 1970) return null;
  const rawFile = path.join(RAWCACHE, `${varId}_${year}.txt`);
  let html;
  if (fs.existsSync(rawFile)) {
    html = fs.readFileSync(rawFile, 'utf8');
  } else {
    const sd = `${year}0101`, ed = `${year}1231`;
    const body = `activity=retrieve&res=daily&spacecraft=omni2` +
      `&start_date=${sd}&end_date=${ed}` +
      `&scale=linear&imagex=960&imagey=720&charsize=1.5&symsize=0.5&vars=${varNum}`;
    html = await postText('https://omniweb.gsfc.nasa.gov/cgi/nx1.cgi', body);
    fs.mkdirSync(RAWCACHE, { recursive: true });
    fs.writeFileSync(rawFile, html);
    await new Promise(r => setTimeout(r, 1200)); // polite
  }
  const rows = parsePre(html);
  // OMNIWeb returns hourly rows even for res=daily; average an entire day into
  // one daily point so the bundled seed stays small (fits the daily resolution
  // used by the Marchitelli analysis).
  const byDay = new Map();
  for (const r of rows) {
    if (!r.values.length) continue;
    const v = r.values[0];
    if (!isFinite(v)) continue;
    const key = r.y * 1000 + r.doy;
    const e = byDay.get(key) || { s: 0, n: 0 };
    e.s += v; e.n++;
    byDay.set(key, e);
  }
  const pts = [];
  for (const [key, e] of byDay) {
    const y = Math.floor(key / 1000), doy = key % 1000;
    pts.push({ t: doyToUtcMs(y, doy), v: +(e.s / e.n).toFixed(3) });
  }
  return pts;
}

async function main() {
  const curYear = new Date().getUTCFullYear();
  const start = process.argv[2] ? parseInt(process.argv[2], 10) : 1970;
  const end = process.argv[3] ? parseInt(process.argv[3], 10) : curYear;
  fs.mkdirSync(OUT, { recursive: true });

  const summary = {};
  for (const [id, num] of Object.entries(VARS)) {
    const all = [];
    let got = 0;
    for (let y = start; y <= end; y++) {
      try {
        const pts = await fetchYear(y, id, num);
        all.push(...(pts || []));
        if (pts && pts.length) got = y;
      } catch (e) {
        console.error(`[${id}] ${y}: ${e.message}`);
      }
    }
    all.sort((a, b) => a.t - b.t);
    const compact = { id, source: 'OMNIWeb OMNI2 daily (NASA/GSFC SPDF)', varNum: num,
      startT: all.length ? all[0].t : 0, endT: all.length ? all[all.length - 1].t : 0,
      count: all.length, pts: all.map(p => [p.t, p.v]) };
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(compact));
    console.log(`[${id}] saved ${compact.count} pts (${new Date(compact.startT).toISOString().slice(0,10)} .. ${new Date(compact.endT).toISOString().slice(0,10)})`);
    summary[id] = compact.count;
  }
  console.log('DONE', JSON.stringify(summary, null, 1));
}

main().catch(e => { console.error(e); process.exit(1); });