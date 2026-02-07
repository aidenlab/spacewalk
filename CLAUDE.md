# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spacewalk is a browser-based 3D visualization application for super-resolution microscopy data. It renders chromatin 3D structures and integrates with IGV.js (genomics browser) and Juicebox.js (Hi-C contact map viewer) for synchronized genomic analysis. Built with Three.js, Vite, and vanilla JavaScript (no framework).

## Build & Development Commands

```bash
npm install          # Install dependencies (Node.js >= 18.0.0 required)
npm run dev          # Start Vite dev server with HMR
npm run build        # Production build to dist/
npm run preview      # Preview production build locally
```

There is no test framework or linter configured. The `.env` file contains a `TINYURL_API_KEY` for URL shortening (injected via `vite.config.mjs`).

## Architecture

### Initialization Flow (js/main.js → js/app.js)

On `DOMContentLoaded`, `App.initialize()` runs a multi-stage bootstrap:
1. **Core Managers** — `EnsembleManager` (3D data), `ColorMapManager`, material providers
2. **Three.js Scene** — `ThreeJSInitializer` creates scene, camera, renderer, and visualization objects (PointCloud, BallAndStick, Ribbon)
3. **UI Bootstrap** — `UIBootstrapper` creates all widgets, file loaders, trace selector, genomic navigator
4. **Panel Init** — `PanelInitializer` creates IGV and Juicebox panels with live contact/distance map services
5. **URL/Session Restore** — Loads session from URL params if present
6. **Render Loop** — `requestAnimationFrame` loop calling `render()` each frame

### Module-Level Shared State (js/app.js)

`app.js` exports module-level variables (`scene`, `camera`, `ensembleManager`, `pointCloud`, `ballAndStick`, `ribbon`, `igvPanel`, `juiceboxPanel`, etc.) that are populated during initialization. Other modules import these directly to access shared application state without circular dependencies.

### Event Bus (js/spacewalkEventBus.js)

`SpacewalkEventBus.globalBus` is a custom pub-sub system for inter-component communication. Subscribers implement `receiveEvent({type, data})`. Key events: `RenderStyleDidChange`, `DidSelectTrace`, `DidUpdateGenomicInterpolant`, `DidLeaveGenomicNavigator`, `DidHideCrosshairs`, `DidLoadSWBEnsembleGroup`. The bus supports `hold()`/`release()` to queue events during initialization.

### Visualization Modes

Three mutually exclusive render styles managed by `SceneManager`:
- **BallAndStick** — Spheres at chromatin centroids connected by cylinders
- **Ribbon** — Continuous tube geometry
- **PointCloud** — Point clusters for dense spatial data

Each has `configure(trace)`, `addToScene(scene)`, `show()`/`hide()`, `dispose()`, and `renderLoopHelper()` methods.

### Data Flow

```
File (.sw/.swb/.cndb) → Datasource (js/datasource/) → EnsembleManager → Trace
  → Visualization objects (PointCloud/BallAndStick/Ribbon)
  → IGVPanel (genomic view sync)
  → JuiceboxPanel (Hi-C view sync, web workers for live contact/distance maps)
```

### Key Directories

- `js/initializers/` — Three-stage app bootstrap (ThreeJS, UI, Panels)
- `js/datasource/` — File format loaders (SWBDatasource for HDF5-based .sw/.swb files, CNDBDatasource)
- `js/widgets/` — UI components (file loading, session management, track registry, genome selection)
- `js/juicebox/` — Juicebox integration with web workers for live map computation
- `js/utils/` — Color utilities, math, disposal helpers, web worker support
- `js/share/` — URL compression/shortening for session sharing
- `styles/` — SCSS stylesheets
- `src/resources/` — Static JSON configs (genomes, track registries, colormaps)

### External Libraries (CDN via index.html)

Bootstrap 5.3.3, jQuery 3.7.0, jQuery UI 1.13.2, Spectrum Colorpicker, DataTables, Font Awesome, Dropbox Chooser. These are loaded from CDNs in `index.html`, not bundled.

### Configuration

`spacewalk-config.js` exports `spacewalkConfig` with IGV config (default genome hg19), Juicebox config (dimensions, contact map menu), and URL shortener settings.

## Code Conventions

- Vanilla JavaScript with ES modules (no TypeScript, no framework)
- Three.js resources must be explicitly disposed (geometries, materials, textures) — see `js/utils/disposalUtils.js` and `purgeScene()` in `SceneManager`
- Color utilities use Apple Crayon color names (e.g., `appleCrayonColorRGB255('snow')`, `appleCrayonColorThreeJS('iron')`) — see `js/utils/colorUtils.js`
- Heavy computations (contact maps, distance maps) run in web workers (`js/juicebox/liveContactMapWorker.js`, `liveDistanceMapWorker.js`)