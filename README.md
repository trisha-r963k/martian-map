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
- **Google-Maps-Style Floating UI (Task 3)**:
  - Full-window map locked to Gale Crater bounds (`maxBoundsViscosity 1.0`, zero black margins).
  - Smooth zoom (`zoomSnap 0.25`, `zoomDelta 0.5`) with deep zoom support (>= 4 levels in).
  - Top-left directions card with Start/Destination coordinates, Swap button, and route telemetry.
  - Top-right live cursor telemetry with coordinates and dynamic slope estimation formula.
  - Bottom-left Google-style "Layers" popup with preset thumbnail tiles (Photo, Slope hazard, Both) and sliders.
  - Bottom-right zoom and "Center on Start" action buttons.
  - Calibrated Mars metric scale bar ($59,200\text{ m/deg}$) and collapsible slope legend.
  - Draggable Start/Destination markers with instant route recalculation.
  - Animated dual-layer route line: white casing + bright cyan animated dash with endpoint ETA label.
  - Mobile bottom sheet mode for screens under 700px.
- **Science Stops & Mission Targets (Task 5)**:
  - 3 geological observation stops in Gale Crater loaded from `data/stops.json`:
    - **Stop 1: Flat plateau**: Smooth, flat ground for safe staging.
    - **Stop 2: Layered terrace**: Terrace between escarpments with visible rock layers.
    - **Stop 3: Escarpment rim**: Edge of steep escarpment with exposed strata.
  - Automatic snapping to the nearest traversable cell (`cost < 9999`) in the connected network so all stops can always be routed to safely.
  - Interactive numbered HUD markers on the map opening detail cards with geological context, coordinates, and "Set as start" / "Set as destination" buttons.
  - In-panel Science Stops list inside the Directions card for 1-click route planning without touching the map.
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
