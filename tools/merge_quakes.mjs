import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ARCH = 'E:/opencode/008_2026_08_25_Chronos_Terra/data_archive';
const OUT = 'E:/opencode/008_2026_08_25_Chronos_Terra/source/data';

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  const t = [], la = [], lo = [], m = [], d = [];
  let skip = true;
  for (const line of lines) {
    if (!line) continue;
    if (skip) {
      if (/^time,/i.test(line)) { skip = false; }
      continue;
    }
    const c = line.split(',');
    // columns: 0 time(ISO), 1 lat, 2 lon, 3 depthKm, 4 mag
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

const out = { t: [], la: [], lo: [], m: [], d: [] };
let files = 0;
for (const f of fs.readdirSync(ARCH)) {
  if (!/^quakes_\d{4}\.csv$/.test(f)) continue;
  files++;
  const part = parseCsv(fs.readFileSync(path.join(ARCH, f), 'utf8'));
  out.t.push(...part.t); out.la.push(...part.la); out.lo.push(...part.lo);
  out.m.push(...part.m); out.d.push(...part.d);
}
// sort by time (years are already ordered but be safe)
const idx = out.t.map((v, i) => i).sort((a, b) => out.t[a] - out.t[b]);
const sorted = {};
for (const k of ['t', 'la', 'lo', 'm', 'd']) sorted[k] = idx.map(i => out[k][i]);

const meta = {
  count: sorted.t.length,
  minT: sorted.t[0], maxT: sorted.t[sorted.t.length - 1],
  files, built: new Date().toISOString()
};
fs.mkdirSync(OUT, { recursive: true });
const buf = zlib.gzipSync(Buffer.from(JSON.stringify(sorted)), { level: 9 });
fs.writeFileSync(path.join(OUT, 'quakes.json.gz'), buf);
fs.writeFileSync(path.join(OUT, 'quakes_meta.json'), JSON.stringify(meta, null, 1));
console.log('merged', meta.count, 'events from', files, 'files ->', (buf.length / 1048576).toFixed(2) + ' MB gz');
