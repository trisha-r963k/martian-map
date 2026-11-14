# MarsWalk Navigator (`martian-map`)

MarsWalk Navigator is a tactical web application built for the **NASA Space Apps Challenge 2026**. It displays an interactive surface map of Gale Crater on Mars to assist an astronaut in planning an Extravehicular Activity (EVA) walk. The map layers high-resolution NASA HiRISE imagery and USGS terrain elevation data, classifies caution and steep hazard slopes, and provides an astronaut-grade space HUD.

## Features
- **Equirectangular Planetary Projection**: Built using Leaflet `1.9.4` with `L.CRS.EPSG4326`, mapping Martian planetocentric degrees directly without spherical Mercator distortion.
- **HiRISE Orthophoto Base Layer**: High-resolution orbital photo of the landing site.
- **Slope Hazard Overlay**: 148 × 148 grid rendered with crisp pixels (`image-rendering: pixelated`) showing terrain hazards:
  - 🟡 **Caution**: Slope above 12°
  - 🔴 **Hazard**: Slope above 20°
- **Tactical Space HUD Interface**: Tablet-inspired dark sci-fi interface with telemetry readouts (coordinates, zoom level, resolution), layer toggles, and opacity blending sliders.
- **A* EVA Route Planner (Task 2)**: 
  - Interactive map clicking: 1st click = START (green pin), 2nd click = END (cyan pin), 3rd click clears and resets.
  - 8-direction A* pathfinding (`route.js`) avoiding steep blocked ground (`cost >= 9999`) and finding safest low-cost traversals.
  - Live metric computation: Distance in meters (with 1.414× diagonal weighting) and walking time in minutes.
  - Configurable walking speed (default 2 km/h) with live recalculation.
- **Mobile Responsive**: Scaled and touch-optimized for tablet and mobile phone screens.

## Data & Credits
- **Region**: Gale Crater, Mars (~4.8°S, 137.35°E)
- **Imagery & Elevation**: NASA / JPL / University of Arizona; USGS Astrogeology Science Center (Calef and Parker, 2016).

## How to Run Locally

Because the browser's `fetch()` API restricts reading local JSON files via the `file://` protocol, serve the project through any local HTTP server:

### Option 1: Python (Recommended)
```bash
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

### Option 2: Node.js (npx)
```bash
npx serve .
```

## License
MIT License - see [LICENSE](LICENSE) for details.
