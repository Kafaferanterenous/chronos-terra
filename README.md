<div align="center">

# 🌋 Chronos‑Terra

### A planetary correlation observatory — earthquakes × solar activity × magnetosphere × tides

`1970 → present` &nbsp;·&nbsp; Windows portable desktop app &nbsp;·&nbsp; Electron + MapLibre + Canvas

![data](https://img.shields.io/badge/data-1970%E2%80%93present-blue)
![version](https://img.shields.io/badge/version-0.15.4-brightgreen)
![license](https://img.shields.io/badge/license-MIT-9b6bff)
![platform](https://img.shields.io/badge/platform-Windows-5ea8ff)
![stack](https://img.shields.io/badge/stack-Electron%20%C2%B7%20MapLibre-e6a23c)

</div>

---

**Chronos‑Terra asks an open question:** do solar‑terrestrial forces measurably correlate with seismic activity?
It bundles **56 years** of global seismicity and the full space‑weather stack — solar wind, IMF, geomagnetic indices —
into one offline‑capable desktop app, then lets *you* test the relationship graph‑by‑graph, with honest caveats on every estimate.

*Exploratory research tool — not a seismology product. Everything theoretical is labeled `·theory`.*

---

## ✨ Feature highlights

| | |
| --- | --- |
| 🌐 | **Planetary map** — real‑time quakes (live USGS feed), volcanoes, tectonic plates, capitals, plus lunar/solar tidal overlay |
| ☀️ | **Solar activity** — sunspot number, F10.7 flux, Ap/Kp geomagnetic indices (NOAA/GFZ bundled series) |
| 🧲 | **Magnetosphere wires** — bundled NASA OMNIWeb history (1970→now) *·theory*: proton density, IMF |B| & Bz, dynamic pressure, Dst, E‑field |
| 📈 | **Graphs view** — multi‑series overlays, independent y‑scaling, daily/monthly binning, hover inspection, range windowing |
| ⏳ | **Lag‑scan engine** — shifts each series pair across days *or* months to surface lead/lag structure (≈1‑day proton scale follows Marchitelli et al. 2020) |
| 🔄 | **Per‑type reload** — refresh any bundled magnetosphere series live from NASA OMNIWeb with local caching |
| ⚡ | **Live proton density** — streamed from NOAA ACE (10‑min cache TTL) |
| 📚 | **Studies & live news** — peer‑reviewed papers and fresh RSS feeds on sun, volcanoes & weather |
| 👁️ | **Focus views & Help** — full‑screen graph/study modes, dense rulers, floating date cursor, and a glossary‑backed Help screen |

## 🚀 Getting started

```bash
npm install        # electron + electron-builder
npm start          # run from source
npm run dist       # build the Windows portable .exe → dist/
```

The portable build packages `data/` (all series) and `vendor/` (MapLibre) inside the asar — **the archive views run fully offline**, no internet needed.

## 🗄️ Data provenance

| Series | Source | Notes |
| --- | --- | --- |
| Quakes catalog | USGS `query?format=geojson` | `.json.gz` bundled, filtered M4+ |
| Sunspots / F10.7 / Kp / Ap | SILSO + GFZ monthly table | bundled CSV/txt |
| Magnetosphere (6 series) | NASA OMNIWeb `nx1.cgi` (daily, OMNI2) | bundled `data/magnet/*.json`; refreshable in‑app |
| Live ACE proton density | NOAA SWPC `ace-swepam.txt` | 10‑min cache |

Reproduce the bundled magnetosphere series: `node tools/fetch_magnet.mjs`.

## 📁 Layout

```
app.js            main application logic (views, canvas rendering, live feeds, IPC)
electron-main.js  main process: IPC, net fetches, archive dir, window
preload.js        contextBridge (window.ct)
index.html        single‑page UI
style.css         dark theme
data/             bundled archives + magnetosphere series (offline)
vendor/           MapLibre GL
tools/            data generators (fetch_magnet, build_volcs, merge_quakes)
tests/            PowerShell live‑endpoint smoke tests
```

## 🧠 Design notes

- `app.js` is one logical module — no framework, hand‑rolled canvas and DOM.
- Bundle quake catalog is the **historical archive**; the live USGS feed covers only a recent window; both aggregate per bin.
- All IPC payloads live under `window.ct` in the preload bridge; external fetches go through the main process (`net`) — CORS‑safe.
- Runtime cache `data_archive/` is created next to the app on first run; git‑ignored.
- Honest labeling: computed, bundled, or estimated series are tagged `·theory`.

## 🗺️ Roadmap

- [x] v0.15.x — focus views, denser rulers, cursor readout, Studies + live news, help system
- [ ] Correlation lab round 2 — day‑scale lag slider + significance band
- [ ] Climate & extreme‑weather event layer on the timeline
- [ ] macOS / ARM portable builds
- [ ] Headless CDP smoke suite for build verification

## 📄 License

MIT — see [LICENSE](LICENSE). All bundled data remains property of its respective sources (USGS, NASA OMNIWeb, NOAA SWPC, SILSO, GFZ).