# Chronos Terra

A planetary correlation observatory desktop app — earthquakes × solar activity × magnetosphere × tides, **1970–present**.

Built with Electron + Canvas + MapLibre GL. Ships as a Windows portable `.exe` with all historical data bundled, no connection required for the archive views.

![coverage](https://img.shields.io/badge/data-1970%E2%80%93present-blue) ![version](https://img.shields.io/badge/version-0.15.4-brightgreen)

## Features

- **Planetary map** — real-time earthquakes (live USGS feed), volcanoes, tectonic plates, city capitals, lunar/solar tides overlay.
- **Solar activity** — sunspot number, F10.7 flux, Ap/Kp geomagnetic indices (NOAA/GFZ bundled series).
- **Magnetosphere wires** — bundled historical OMNIWeb series, 1970 → now, marked **·theory**:
  - Proton density (n/cm³)
  - IMF magnitude |B| and IMF Bz (nT)
  - Solar wind dynamic pressure (nPa)
  - Geomagnetic Dst index (nT)
  - Convective electric field E (mV/m)
- **Graphs view** — multi-series overlay charts with independent y-scaling, daily/monthly binning, hover inspection, range windowing/paging.
- **Lag-scan engine** — below every graph window, a correlation strip time-shifts each series pair (days or months) to surface lead/lag structure; the ≈1-day proton-density scale follows Marchitelli et al. 2020. Tagged exploratory.
- **Per-type reload** — a downloader dialog refreshes any bundled magnetosphere series live from NASA OMNIWeb (daily resolution) and caches the result locally.
- **Live proton density** — a second live wire streamed from NOAA ACE (10-minute cache TTL).
- Honest labeling: anything computed/bundled/estimated rather than measured-retail is tagged **·theory**.

## Quick start

```bash
npm install        # installs electron + electron-builder
npm start          # run from source
npm run dist       # build the Windows portable .exe into dist/
```

The portable build packages `data/` (all series) and `vendor/` (MapLibre) inside the asar — the archive runs fully offline.

## Data provenance / endpoints

| Series | Source | Note |
| --- | --- | --- |
| Quakes catalog | USGS `query?format=geojson` | `.json.gz` bundled, filtered M4+ |
| Sunspots / F10.7 / Kp / Ap | SILSO + GFZ monthly table | bundled CSV/txt |
| Magnetosphere (6 series) | NASA OMNIWeb `nx1.cgi` (daily, OMNI2) | bundled as `data/magnet/*.json`; refreshable in-app |
| Live ACE proton density | NOAA SWPC `ace-swepam.txt` | 10-min cache |

Reproducing the bundled magnetosphere series: `node tools/fetch_magnet.mjs`.

## Tech notes

- `app.js` is a single logical module (views, canvas rendering, live feeds, IPC for magnet data + caching). No framework.
- Bundled quake catalog is **historical archive** (1970+) — the live USGS feed only covers a recent window; both are aggregated per bin.
- All IPC payloads live under `window.ct` in the preload bridge (`preload.js`); fetches to OMNIWeb/ACE/SWC go through `electron-main.js` (CORS-safe, plain `net`).
- Runtime data-cache directory `data_archive/` is created on first run next to the app; ignored by git.

## Layout

```
app.js            main application logic
electron-main.js  main process: IPC, net fetches, archive dir, window
preload.js        contextBridge (window.ct)
index.html        single-page UI
style.css         dark theme
data/             bundled archives + magnetosphere series (offline)
vendor/           MapLibre GL
tools/            data generators (fetch_magnet, build_volcs, merge_quakes)
tests/            PowerShell live-endpoint smoke tests
```

## License

MIT — see [LICENSE](LICENSE).