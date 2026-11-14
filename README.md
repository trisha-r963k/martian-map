# MarsWalk Navigator

A static web app built for the **NASA Space Apps Challenge**. It displays a tactical surface map of Gale Crater on Mars for an astronaut planning an Extravehicular Activity (EVA) walk.

## Features
- **Equirectangular Planetary Projection**: Built using Leaflet `1.9.4` with `L.CRS.EPSG4326`, mapping Martian planetocentric degrees directly without distortion.
- **HiRISE Orthophoto Base Layer**: High-resolution orbital photo of the landing site.
- **Slope Hazard Overlay**: 148 × 148 grid rendered with crisp pixels (`image-rendering: pixelated`) showing terrain hazards:
  - 🟡 **Caution**: Slope above 12°
  - 🔴 **Hazard**: Slope above 20°
- **Tactical Space HUD Interface**: Tablet-inspired dark sci-fi interface with telemetry readouts (coordinates, zoom level, resolution), layer toggles, and opacity blending sliders.
- **Mobile Responsive**: Scaled and touch-optimized for tablet and mobile phone screens.

## Data & Credits
- **Region**: Gale Crater, Mars (~4.8°S, 137.35°E)
- **Imagery & Elevation**: NASA / JPL / University of Arizona; USGS Astrogeology Science Center (Calef and Parker, 2016).

## How to Run Locally

Because the browser's `fetch()` API restricts reading local JSON files via the `file://` protocol, serve the project through any local HTTP server:

### Option 1: Python
```bash
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

### Option 2: Node.js (npx)
```bash
npx serve .
```

