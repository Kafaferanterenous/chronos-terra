import fs from 'fs';
import path from 'path';

const ARCH = 'E:/opencode/008_2026_08_25_Chronos_Terra/data_archive';
const OUT = 'E:/opencode/008_2026_08_25_Chronos_Terra/source/data';

const volcs = JSON.parse(fs.readFileSync(path.join(ARCH, 'gvp_volcanoes.json'), 'utf8'));
const erups = JSON.parse(fs.readFileSync(path.join(ARCH, 'gvp_eruptions.json'), 'utf8'));

const vList = [];
const vIdx = new Map();
for (const f of volcs.features) {
  const p = f.properties;
  const num = p.Volcano_Number, name = p.Volcano_Name;
  const [lon, lat] = f.geometry ? f.geometry.coordinates : [p.Longitude, p.Latitude];
  if (!isFinite(lat) || !isFinite(lon)) continue;
  vIdx.set(num, vList.length);
  vList.push([num, name, +lat.toFixed(2), +lon.toFixed(2), p.Last_Eruption_Year ?? null, p.Country || '']);
}

const eList = [];
for (const f of erups.features) {
  const p = f.properties;
  const y = p.StartDateYear, m = p.StartDateMonth ?? null;
  if (!y || y < 1970) continue;
  if (!vIdx.has(p.Volcano_Number)) continue;
  eList.push([y, m, p.Volcano_Number, p.ExplosivityIndexMax ?? null]);
}
eList.sort((a, b) => (a[0] * 12 + (a[1] || 0)) - (b[0] * 12 + (b[1] || 0)));

const out = {
  note: 'Smithsonian GVP VOTW v5.4.0 (7 Aug 2026), doi:10.5479/si.GVP.VOTW5-2026.5.4. eruptions since 1970 only. e=[year,month(1-12|null),volcanoNumber,VEImax]',
  v: vList, e: eList
};
fs.writeFileSync(path.join(OUT, 'volcs.json'), JSON.stringify(out));
console.log('volcanoes:', vList.length, '| eruptions >=1970:', eList.length,
  '| size:', (fs.statSync(path.join(OUT, 'volcs.json')).size / 1048576).toFixed(2) + ' MB');
