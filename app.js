                                                                                                                                                                                                                                                                    /**
 * MarsWalk Navigator - Task 3: Google-Maps-Style Tactical Web Map
 * 
 * Pair-programmed for NASA Space Apps Challenge
 * 
 * Features:
 * - Full-viewport map locked to Gale Crater bounds (maxBoundsViscosity 1.0, no black margins)
 * - Smooth fractional zoom (zoomSnap 0.25, zoomDelta 0.5) with >= 4 deep zoom levels
 * - Floating cards: Top-left directions card with swap button, top-right slope telemetry
 * - Google-style Layers popup with preset thumbnail tiles (Photo, Slope hazard, Both) and sliders
 * - Draggable START (green) and END (cyan) markers with instant live route recalculation
 * - Route line: white casing + bright cyan animated dash with endpoint ETA label
 * - Correct Mars metric scale bar (EPSG:4326 calibrated to 59,200 m/deg)
 * - Collapsible legend card and responsive mobile bottom sheet (< 700px)
 */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMarsNavigator);
} else {
  initMarsNavigator();
}

async function initMarsNavigator() {
  const alertEl = document.getElementById('connection-error');

  try {
    // 1. Fetch grid metadata and science stops (Task 5)
    const [gridResponse, stopsResponse] = await Promise.all([
      fetch('data/grid.json'),
      fetch('data/stops.json')
    ]);

    if (!gridResponse.ok) {
      throw new Error(`HTTP error! status: ${gridResponse.status}`);
    }
    const gridData = await gridResponse.json();

    let stopsData = [];
    if (stopsResponse && stopsResponse.ok) {
      stopsData = await stopsResponse.json();
    }

    const { bounds, caution_deg, hazard_deg, rows, cols, cell_m } = gridData;

    // LatLng bounds [[south, west], [north, east]]
    // Row 0 is the NORTH edge (-4.79), bottom is SOUTH (-4.80)
    const mapBounds = [
      [bounds.south, bounds.west],
      [bounds.north, bounds.east]
    ];

    // 2. Initialize Map with EPSG:4326 and smooth zoom (Task 4: Whole-Mars context)
    const map = L.map('map', {
      crs: L.CRS.EPSG4326,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      minZoom: 0, // Allow zooming out to view the entire planet Mars (zoom 0-5)
      maxZoom: 22, // Deep zoom into local HiRISE surface details
      maxBounds: [[-90, -180], [90, 180]], // Full planetary bounds
      maxBoundsViscosity: 1.0, // Hard stop at planetary boundaries
      attributionControl: false,
      zoomControl: false // Handled via Google-style bottom-right HUD buttons
    });
    window.map = map;

    // Initial view: fit precisely to Gale Crater study area
    map.fitBounds(mapBounds, { padding: [0, 0] });

    // 3. Mount Surface Layers & NASA Mars Trek Overlays
    // (a) Custom pane for THEMIS thermal layer so it sits above base map/background and below HiRISE & Hazard overlays
    map.createPane('thermalPane');
    map.getPane('thermalPane').style.zIndex = 250; // Above tilePane (200), below overlayPane (400)

    // THEMIS day infrared global mosaic from NASA Mars Trek (verified WMTS layer)
    const THEMIS_TILE_URL = 'https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018/1.0.0/default/default028mm/{z}/{y}/{x}.png';
    const initialThemisOpacity = 1.0;
    const themisLayer = L.tileLayer(THEMIS_TILE_URL, {
      tms: false,
      tileSize: 256,
      minZoom: 0,
      maxNativeZoom: 9, // Highest native zoom level verified from WMTS GetCapabilities (0 to 9)
      maxZoom: 22,      // Allows zooming deep into local surface features with Leaflet scaling
      opacity: initialThemisOpacity,
      pane: 'thermalPane',
      attribution: 'Thermal: NASA/JPL/Arizona State University (THEMIS) via NASA Mars Trek'
    }).addTo(map);
    window.themisLayer = themisLayer;

    // (b) HiRISE Orthophoto base (overlayPane, z-index 400)
    const orthoLayer = L.imageOverlay('assets/ortho.jpg', mapBounds, {
      opacity: 1.0,
      alt: 'Gale Crater HiRISE Orthophoto'
    }).addTo(map);

    // (c) Slope Hazard overlay (overlayPane, z-index 400, crisp pixelated rendering via CSS)
    const initialHazardOpacity = 0.45;
    const hazardLayer = L.imageOverlay('assets/hazard.png', mapBounds, {
      opacity: initialHazardOpacity,
      className: 'hazard-layer',
      alt: 'Gale Crater Slope Hazard Map'
    }).addTo(map);

    // 4. Add Study Area Outline Rectangle & Badge (Task 4 requirement)
    const studyAreaRect = L.rectangle(mapBounds, {
      color: '#00f0ff',
      weight: 2,
      fillColor: '#00f0ff',
      fillOpacity: 0.05,
      dashArray: '6, 6',
      className: 'study-area-rect'
    }).addTo(map);

    studyAreaRect.bindTooltip('STUDY AREA: GALE CRATER', {
      permanent: true,
      direction: 'top',
      offset: [0, -6],
      className: 'study-area-tooltip'
    });

    // Clicking the study area outline zooms back into Gale Crater
    studyAreaRect.on('click', () => {
      map.flyToBounds(mapBounds, { duration: 1.5, padding: [20, 20] });
    });

    // 5. Setup HUD Components
    setupLayersControl(map, orthoLayer, hazardLayer, initialHazardOpacity, themisLayer, initialThemisOpacity);
    setupLegend(caution_deg, hazard_deg);
    setupHeaderTelemetry(map, rows, cols, cell_m);
    setupCursorTelemetry(map, gridData);
    setupScaleBar(map, gridData);
    setupMapActionButtons(map, mapBounds);
    const routePlanner = setupRoutePlanner(map, gridData, studyAreaRect);
    setupScienceStops(map, gridData, stopsData, routePlanner);
    setupEnvironmentalCard();
    setupOnboardingHint();
    setupCollapsiblePanels();
    window.__marsWalkReady = true;

  } catch (err) {
    console.error('Failed to initialize MarsWalk Navigator:', err);
    if (alertEl) {
      alertEl.classList.remove('hidden');
    }
  }
}

/**
 * Configure Layers Button & Popup with Thumbnail Tiles & Sliders
 */
function setupLayersControl(map, orthoLayer, hazardLayer, initialHazardOpacity, themisLayer, initialThemisOpacity) {
  const toggleBtn = document.getElementById('btn-layers-toggle');
  const popup = document.getElementById('layers-popup');

  const tilePhoto = document.getElementById('tile-photo');
  const tileHazard = document.getElementById('tile-hazard');
  const tileBoth = document.getElementById('tile-both');

  const chkThemis = document.getElementById('toggle-themis');
  const sliderThemis = document.getElementById('opacity-themis');
  const readoutThemis = document.getElementById('readout-themis');

  const chkOrtho = document.getElementById('toggle-ortho');
  const sliderOrtho = document.getElementById('opacity-ortho');
  const readoutOrtho = document.getElementById('readout-ortho');

  const chkHazard = document.getElementById('toggle-hazard');
  const sliderHazard = document.getElementById('opacity-hazard');
  const readoutHazard = document.getElementById('readout-hazard');

  // Ensure Layers popup is closed by default
  if (popup) {
    popup.classList.add('hidden');
  }
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  // Toggle Popup open/close
  if (toggleBtn && popup) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = popup.classList.toggle('hidden');
      toggleBtn.setAttribute('aria-expanded', !isHidden);
    });

    // Close popup if clicking outside
    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && !toggleBtn.contains(e.target)) {
        popup.classList.add('hidden');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function setActiveTile(tile) {
    [tilePhoto, tileHazard, tileBoth].forEach(t => t?.classList.remove('active'));
    tile?.classList.add('active');
  }

  function updateThemis(opacity, checked = true) {
    if (chkThemis) chkThemis.checked = checked;
    if (sliderThemis) sliderThemis.value = opacity;
    if (readoutThemis) readoutThemis.textContent = `${Math.round(opacity * 100)}%`;
    if (checked && opacity > 0) {
      if (!map.hasLayer(themisLayer)) map.addLayer(themisLayer);
      themisLayer.setOpacity(opacity);
    } else {
      if (map.hasLayer(themisLayer)) map.removeLayer(themisLayer);
    }
  }

  function updateOrtho(opacity, checked = true) {
    if (chkOrtho) chkOrtho.checked = checked;
    if (sliderOrtho) sliderOrtho.value = opacity;
    if (readoutOrtho) readoutOrtho.textContent = `${Math.round(opacity * 100)}%`;
    if (checked && opacity > 0) {
      if (!map.hasLayer(orthoLayer)) map.addLayer(orthoLayer);
      orthoLayer.setOpacity(opacity);
    } else {
      if (map.hasLayer(orthoLayer)) map.removeLayer(orthoLayer);
    }
  }

  function updateHazard(opacity, checked = true) {
    if (chkHazard) chkHazard.checked = checked;
    if (sliderHazard) sliderHazard.value = opacity;
    if (readoutHazard) readoutHazard.textContent = `${Math.round(opacity * 100)}%`;
    if (checked && opacity > 0) {
      if (!map.hasLayer(hazardLayer)) map.addLayer(hazardLayer);
      hazardLayer.setOpacity(opacity);
    } else {
      if (map.hasLayer(hazardLayer)) map.removeLayer(hazardLayer);
    }
  }

  // Preset Tile: Photo only
  tilePhoto?.addEventListener('click', () => {
    setActiveTile(tilePhoto);
    updateOrtho(1.0, true);
    updateHazard(0, false);
  });

  // Preset Tile: Slope Hazard only
  tileHazard?.addEventListener('click', () => {
    setActiveTile(tileHazard);
    updateOrtho(0, false);
    updateHazard(1.0, true);
  });

  // Preset Tile: Both combined
  tileBoth?.addEventListener('click', () => {
    setActiveTile(tileBoth);
    updateOrtho(1.0, true);
    updateHazard(0.45, true);
  });

  // THEMIS thermal layer listeners
  chkThemis?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    updateThemis(checked ? parseFloat(sliderThemis.value || 1.0) : 0, checked);
  });

  sliderThemis?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    updateThemis(val, val > 0);
  });

  // Sliders and checkboxes listeners
  chkOrtho?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    updateOrtho(checked ? parseFloat(sliderOrtho.value || 1.0) : 0, checked);
  });

  sliderOrtho?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    updateOrtho(val, val > 0);
  });

  chkHazard?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    updateHazard(checked ? parseFloat(sliderHazard.value || 0.8) : 0, checked);
  });

  sliderHazard?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    updateHazard(val, val > 0);
  });
}

/**
 * Configure Collapsible Slope Legend
 */
function setupLegend(cautionDeg, hazardDeg) {
  const cautionEl = document.getElementById('legend-caution');
  const hazardEl = document.getElementById('legend-hazard');
  const toggleBtn = document.getElementById('btn-toggle-legend');
  const legendCard = document.getElementById('legend-card');

  if (cautionEl) {
    cautionEl.innerHTML = `Caution: slope above <span class="val">${cautionDeg}</span> degrees`;
  }
  if (hazardEl) {
    hazardEl.innerHTML = `Hazard: slope above <span class="val">${hazardDeg}</span> degrees`;
  }

  // Ensure Legend card is expanded by default (Task UI/UX #7)
  if (legendCard) {
    legendCard.classList.remove('collapsed');
  }
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', 'true');
  }

  // Toggle Collapse / Expand
  toggleBtn?.addEventListener('click', () => {
    if (legendCard) {
      const isCollapsed = legendCard.classList.toggle('collapsed');
      toggleBtn.setAttribute('aria-expanded', !isCollapsed);
    }
  });
}

/**
 * Header Telemetry (Grid size, Zoom)
 */
function setupHeaderTelemetry(map, rows, cols, cellM) {
  const zoomEl = document.getElementById('telemetry-zoom');
  const gridEl = document.getElementById('telemetry-grid');

  if (gridEl && rows && cols && cellM) {
    gridEl.textContent = `${rows} × ${cols} (${cellM.toFixed(1)}m)`;
  }

  function updateZoom() {
    if (zoomEl) {
      zoomEl.textContent = map.getZoom().toFixed(2);
    }
  }

  map.on('zoom', updateZoom);
  updateZoom();
}

/**
 * Cursor Telemetry Card (Coordinates and Estimated Slope)
 * Slope estimation rule:
 * - If cost < 9999: slope is about (cost - 1) * 5 degrees
 * - If cost >= 9999: show "steeper than <hazard_deg> degrees"
 */
function setupCursorTelemetry(map, gridData) {
  const cursorCoordsEl = document.getElementById('telemetry-cursor');
  const cursorSlopeEl = document.getElementById('cursor-slope');
  const { west, south, east, north } = gridData.bounds;
  const { rows, cols, cost, hazard_deg } = gridData;

  map.on('mousemove', (e) => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (cursorCoordsEl) {
      cursorCoordsEl.textContent = `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
    }

    if (cursorSlopeEl) {
      const col = Math.floor(((lng - west) / (east - west)) * cols);
      const row = Math.floor(((north - lat) / (north - south)) * rows);

      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        const cellCost = cost[row][col];
        if (cellCost < 9999) {
          const slopeDeg = Math.max(0, Math.round((cellCost - 1) * 5));
          cursorSlopeEl.textContent = `Slope: ~${slopeDeg}°`;
        } else {
          cursorSlopeEl.textContent = `Slope: steeper than ${hazard_deg} degrees`;
        }
      } else {
        cursorSlopeEl.textContent = 'Slope: --';
      }
    }
  });

  map.on('mouseout', () => {
    if (cursorCoordsEl) cursorCoordsEl.textContent = '-- , --';
    if (cursorSlopeEl) cursorSlopeEl.textContent = 'Slope: --';
  });
}

/**
 * Mars Metric Scale Bar
 * Calibrated for Gale Crater EPSG:4326:
 * Span = 0.01 deg = 592 m (148 * 4.0m) => 1 degree = 59,200 metres
 */
function setupScaleBar(map, gridData) {
  const rulerEl = document.getElementById('scale-ruler');
  const labelEl = document.getElementById('scale-label');

  if (!rulerEl || !labelEl) return;

  const metersPerDeg = (gridData.cols * gridData.cell_m) / (gridData.bounds.east - gridData.bounds.west);

  function updateScale() {
    // Measure degrees spanned by 100 screen pixels
    const p0 = map.containerPointToLatLng([0, 0]);
    const p1 = map.containerPointToLatLng([100, 0]);
    const deg100 = Math.abs(p1.lng - p0.lng);
    const meters100 = deg100 * metersPerDeg;

    // Pick round metric steps (from planetary 5,000 km down to local 1 m)
    const steps = [
      5000000, 2000000, 1000000, 500000, 200000, 100000, 50000, 20000, 10000,
      5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1
    ];
    let chosenMeters = steps[steps.length - 1];
    for (const step of steps) {
      if (step <= meters100) {
        chosenMeters = step;
        break;
      }
    }

    const widthPx = Math.max(20, Math.min(160, Math.round((chosenMeters / meters100) * 100)));
    rulerEl.style.width = `${widthPx}px`;

    if (chosenMeters >= 1000) {
      labelEl.textContent = `${chosenMeters / 1000} km`;
    } else {
      labelEl.textContent = `${chosenMeters} m`;
    }
  }

  map.on('zoom', updateScale);
  map.on('resize', updateScale);
  updateScale();
}

/**
 * Bottom-Right Google-style Action Buttons (Zoom +/-, Center Start & Fly to Study Area)
 */
function setupMapActionButtons(map, mapBounds) {
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnCenterStart = document.getElementById('btn-center-start');
  const btnFlyStudyArea = document.getElementById('btn-fly-study-area');

  btnZoomIn?.addEventListener('click', () => map.zoomIn());
  btnZoomOut?.addEventListener('click', () => map.zoomOut());

  // Task 4: Fly smoothly back to Gale Crater study area
  btnFlyStudyArea?.addEventListener('click', () => {
    map.flyToBounds(mapBounds, { duration: 1.5, padding: [20, 20] });
  });

  btnCenterStart?.addEventListener('click', () => {
    // If a start marker exists, center on it; otherwise fit to mapBounds
    if (window._currentStartMarker) {
      map.panTo(window._currentStartMarker.getLatLng(), { animate: true });
    } else {
      map.flyToBounds(mapBounds, { duration: 1.5, padding: [20, 20] });
    }
  });
}

/**
 * Task 2 & 3: Interactive Route Planner
 * - 2 map clicks to set start (green) and end (cyan) markers.
 * - Draggable markers with instant route recalculation.
 * - Route line: white casing with bright cyan line & animated dash.
 * - ETA label near end marker (offset to avoid covering marker pin).
 * - Swap button reverses start/destination.
 */
function setupRoutePlanner(map, gridData, studyAreaRect) {
  const statusEl = document.getElementById('route-status');
  const startCoordEl = document.getElementById('route-start-coord');
  const endCoordEl = document.getElementById('route-end-coord');
  const distanceEl = document.getElementById('route-distance');
  const timeEl = document.getElementById('route-time');
  const speedInput = document.getElementById('speed-input');
  const clearBtn = document.getElementById('btn-clear-route');
  const swapBtn = document.getElementById('btn-swap-route');
  const comparisonEl = document.getElementById('route-comparison-line');

  let startCoord = null;
  let endCoord = null;
  let startMarker = null;
  let endMarker = null;
  let casingPolyline = null;
  let corePolyline = null;
  let currentRoute = null;
  let clickCount = 0; // 0 = ready for start, 1 = ready for end, 2 = route displayed
  let errorPillTimeout = null;

  // Ensure polyline draws in a dedicated high-priority pane above all image overlays
  if (!map.getPane('routePane')) {
    map.createPane('routePane');
    map.getPane('routePane').style.zIndex = 550;
  }

  // Tactical custom HUD marker icons (draggable)
  const startIcon = L.divIcon({
    className: 'hud-marker-start',
    html: '<div class="marker-pin start-pin"></div><span class="marker-label">START</span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  const endIcon = L.divIcon({
    className: 'hud-marker-end',
    html: '<div class="marker-pin end-pin"></div><span class="marker-label">END</span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  function isCellBlocked(lat, lon) {
    const col = Math.floor(((lon - gridData.bounds.west) / (gridData.bounds.east - gridData.bounds.west)) * gridData.cols);
    const row = Math.floor(((gridData.bounds.north - lat) / (gridData.bounds.north - gridData.bounds.south)) * gridData.rows);
    if (row < 0 || row >= gridData.rows || col < 0 || col >= gridData.cols) return true;
    const raw = gridData.cost[row][col];
    if (raw >= 9999) return true;
    const slope = (raw - 1) * 5;
    return slope >= (gridData.hazard_deg || 20);
  }

  // Error Pill management (Task UI/UX #1: Auto-hide after 3s, clear on valid point)
  function clearErrorPill() {
    if (errorPillTimeout) {
      clearTimeout(errorPillTimeout);
      errorPillTimeout = null;
    }
    if (statusEl) {
      statusEl.className = 'route-status-pill hidden';
      statusEl.textContent = '';
    }
  }

  function showErrorPill(text, autoHideMs = 3000) {
    if (!statusEl) return;
    if (errorPillTimeout) {
      clearTimeout(errorPillTimeout);
      errorPillTimeout = null;
    }
    statusEl.className = 'route-status-pill warning';
    statusEl.textContent = text;
    statusEl.classList.remove('hidden');

    if (autoHideMs > 0) {
      errorPillTimeout = setTimeout(() => {
        clearErrorPill();
      }, autoHideMs);
    }
  }

  // Route Optimization Mode (Task: Safest vs Shortest route)
  let currentRouteMode = 'safest';
  const btnModeSafest = document.getElementById('btn-mode-safest');
  const btnModeShortest = document.getElementById('btn-mode-shortest');

  function setRouteMode(mode) {
    if (currentRouteMode === mode) return;
    currentRouteMode = mode;
    if (mode === 'safest') {
      btnModeSafest?.classList.add('active');
      btnModeSafest?.setAttribute('aria-checked', 'true');
      btnModeShortest?.classList.remove('active');
      btnModeShortest?.setAttribute('aria-checked', 'false');
    } else {
      btnModeShortest?.classList.add('active');
      btnModeShortest?.setAttribute('aria-checked', 'true');
      btnModeSafest?.classList.remove('active');
      btnModeSafest?.setAttribute('aria-checked', 'false');
    }
    recalculateRoute();
  }

  btnModeSafest?.addEventListener('click', () => setRouteMode('safest'));
  btnModeShortest?.addEventListener('click', () => setRouteMode('shortest'));

  function clearRouteLines() {
    if (casingPolyline) {
      map.removeLayer(casingPolyline);
      casingPolyline = null;
    }
    if (corePolyline) {
      map.removeLayer(corePolyline);
      corePolyline = null;
    }
    if (endMarker) {
      endMarker.unbindTooltip();
    }
  }

  function clearAll() {
    clearRouteLines();
    if (startMarker) {
      map.removeLayer(startMarker);
      startMarker = null;
      window._currentStartMarker = null;
    }
    if (endMarker) {
      map.removeLayer(endMarker);
      endMarker = null;
    }
    startCoord = null;
    endCoord = null;
    currentRoute = null;
    clickCount = 0;

    if (startCoordEl) startCoordEl.textContent = 'Click map to set';
    if (endCoordEl) endCoordEl.textContent = 'Click map to set';
    if (distanceEl) distanceEl.textContent = '--';
    if (timeEl) timeEl.textContent = '--';
    document.getElementById('route-safety-card')?.classList.add('hidden');

    if (comparisonEl) {
      comparisonEl.classList.add('hidden');
      comparisonEl.textContent = '';
    }

    // Restore study area label (Task UI/UX #3)
    studyAreaRect?.openTooltip();

    // Clear error pill (Task UI/UX #1)
    clearErrorPill();
  }

  clearBtn?.addEventListener('click', clearAll);

  // Analyze route cells for real slope and caution ground stats (Task UI/UX #4)
  function analyzeRouteStats(path) {
    const { west, east, north, south } = gridData.bounds;
    const { rows, cols, cost, caution_deg } = gridData;
    const cautionThreshold = caution_deg || 12;

    let maxSlope = 0;
    let cautionCount = 0;
    const pts = path.map(p => {
      const col = Math.floor(((p.lon - west) / (east - west)) * cols);
      const row = Math.floor(((north - p.lat) / (north - south)) * rows);
      const cR = Math.max(0, Math.min(rows - 1, row));
      const cC = Math.max(0, Math.min(cols - 1, col));
      const raw = cost[cR][cC];
      return raw >= 9999 ? 9999 : Math.max(0, (raw - 1) * 5);
    });

    pts.forEach(slope => {
      if (slope > maxSlope) maxSlope = slope;
      if (slope > cautionThreshold) cautionCount++;
    });

    const cautionPct = pts.length > 0 ? (cautionCount / pts.length) * 100 : 0;
    return { maxSlope, cautionPct };
  }

  // Update Route Comparison Line with real computed values (Task UI/UX #4)
  function updateRouteComparison(safeRoute, shortRoute) {
    if (!comparisonEl) return;
    if (!safeRoute || !shortRoute || !safeRoute.path || !shortRoute.path || !safeRoute.path.length || !shortRoute.path.length) {
      comparisonEl.classList.add('hidden');
      comparisonEl.textContent = '';
      return;
    }

    const safeStats = analyzeRouteStats(safeRoute.path);
    const shortStats = analyzeRouteStats(shortRoute.path);

    const diffDist = Math.round(safeRoute.distance_m - shortRoute.distance_m);
    const slopeDiff = Math.abs(safeStats.maxSlope - shortStats.maxSlope);
    const cautionDiff = Math.abs(safeStats.cautionPct - shortStats.cautionPct);

    // If both routes are identical in distance, slope and caution
    if (Math.abs(diffDist) === 0 && slopeDiff < 0.05 && cautionDiff < 0.05) {
      comparisonEl.textContent = 'Safest and shortest routes are the same here.';
    } else {
      const distStr = diffDist >= 0 ? `+${diffDist} m longer` : `${diffDist} m shorter`;
      comparisonEl.textContent = `Safest: ${distStr}, max slope ${shortStats.maxSlope.toFixed(1)}° -> ${safeStats.maxSlope.toFixed(1)}°, caution ground ${shortStats.cautionPct.toFixed(1)}% -> ${safeStats.cautionPct.toFixed(1)}%`;
    }
    comparisonEl.classList.remove('hidden');
  }

  // Recalculates route and updates polyline + tooltip
  function recalculateRoute() {
    if (!startCoord || !endCoord) return;

    clearRouteLines();

    const speedKmh = speedInput ? (parseFloat(speedInput.value) || 2) : 2;

    // Silently compute BOTH routes for comparison (Task UI/UX #4)
    const safeRoute = findRoute(gridData, startCoord, endCoord, speedKmh, 'safest');
    const shortRoute = findRoute(gridData, startCoord, endCoord, speedKmh, 'shortest');

    currentRoute = (currentRouteMode === 'safest') ? safeRoute : shortRoute;

    if (currentRoute && currentRoute.path && currentRoute.path.length > 0) {
      // Hide study area label while route is shown (Task UI/UX #3)
      studyAreaRect?.closeTooltip();

      // Clear any active error pill (Task UI/UX #1)
      clearErrorPill();

      // Evaluate metrics along the active route and print to console
      const activeStats = analyzeRouteStats(currentRoute.path);
      console.log(`[MarsWalk Route] Mode: ${currentRouteMode.toUpperCase()} | Distance: ${Math.round(currentRoute.distance_m)}m | Max slope: ${activeStats.maxSlope.toFixed(1)}° | Caution: ${activeStats.cautionPct.toFixed(1)}%`);

      const points = [
        [startCoord.lat, startCoord.lon],
        ...currentRoute.path.map(p => [p.lat, p.lon]),
        [endCoord.lat, endCoord.lon]
      ];

      // Route line: white casing + bright cyan line with animated dash
      casingPolyline = L.polyline(points, {
        color: '#ffffff',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'routePane'
      }).addTo(map);

      corePolyline = L.polyline(points, {
        color: '#00f0ff',
        weight: 3.5,
        opacity: 1.0,
        dashArray: '8, 8',
        className: 'animated-route-dash',
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'routePane'
      }).addTo(map);

      // Label near the end marker showing distance and time (offset -22px so it never covers the end marker) (Task UI/UX #3)
      if (endMarker) {
        const etaText = `${Math.round(currentRoute.distance_m)} m · ${currentRoute.time_min.toFixed(1)} min`;
        if (endMarker.getTooltip()) {
          endMarker.setTooltipContent(etaText);
        } else {
          endMarker.bindTooltip(etaText, {
            permanent: true,
            direction: 'top',
            offset: [0, -22],
            className: 'route-eta-badge'
          });
        }
        endMarker.openTooltip();
      }

      if (distanceEl) distanceEl.textContent = `${Math.round(currentRoute.distance_m)} m`;
      if (timeEl) timeEl.textContent = `${currentRoute.time_min.toFixed(1)} min`;

      // Task 6: Compute route safety metrics and render elevation profile
      updateRouteSafety(gridData, startCoord, endCoord, currentRoute);

      // Update Route Comparison Line under Safest/Shortest toggle (Task UI/UX #4)
      updateRouteComparison(safeRoute, shortRoute);

      clickCount = 2;
    } else {
      if (distanceEl) distanceEl.textContent = '--';
      if (timeEl) timeEl.textContent = '--';
      document.getElementById('route-safety-card')?.classList.add('hidden');
      if (comparisonEl) {
        comparisonEl.classList.add('hidden');
        comparisonEl.textContent = '';
      }
      showErrorPill('No safe route found: start or end is on steep blocked ground, or enclosed by steep slopes.', 4000);
      clickCount = 2;
    }
  }

  // Speed Input live update
  speedInput?.addEventListener('input', () => {
    const speedKmh = parseFloat(speedInput.value) || 2;
    if (currentRoute && currentRoute.distance_m > 0) {
      const speedMpm = (speedKmh * 1000) / 60;
      const updatedTime = speedMpm > 0 ? (currentRoute.distance_m / speedMpm) : 0;
      currentRoute.time_min = updatedTime;
      if (timeEl) timeEl.textContent = `${updatedTime.toFixed(1)} min`;
      if (endMarker) {
        endMarker.setTooltipContent(`${Math.round(currentRoute.distance_m)} m · ${updatedTime.toFixed(1)} min`);
      }
    }
  });

  // Swap Button: Inverts start and destination
  swapBtn?.addEventListener('click', () => {
    if (!startCoord || !endCoord) return;

    // Swap coordinates
    const tempCoord = startCoord;
    startCoord = endCoord;
    endCoord = tempCoord;

    // Update marker positions
    startMarker.setLatLng([startCoord.lat, startCoord.lon]);
    endMarker.setLatLng([endCoord.lat, endCoord.lon]);

    if (startCoordEl) startCoordEl.textContent = `${startCoord.lat.toFixed(5)}°, ${startCoord.lon.toFixed(5)}°`;
    if (endCoordEl) endCoordEl.textContent = `${endCoord.lat.toFixed(5)}°, ${endCoord.lon.toFixed(5)}°`;

    recalculateRoute();
  });

  // Marker creation helper with draggable support
  function createDraggableMarker(lat, lon, isStart) {
    const marker = L.marker([lat, lon], {
      icon: isStart ? startIcon : endIcon,
      draggable: true,
      pane: 'markerPane'
    }).addTo(map);

    if (isStart) {
      window._currentStartMarker = marker;
    }

    // Recalculate route instantly on drag
    marker.on('drag', (e) => {
      clearErrorPill();
      const pos = e.latlng;
      if (isStart) {
        startCoord = { lat: pos.lat, lon: pos.lng };
        if (startCoordEl) startCoordEl.textContent = `${pos.lat.toFixed(5)}°, ${pos.lng.toFixed(5)}°`;
      } else {
        endCoord = { lat: pos.lat, lon: pos.lng };
        if (endCoordEl) endCoordEl.textContent = `${pos.lat.toFixed(5)}°, ${pos.lng.toFixed(5)}°`;
      }

      if (startCoord && endCoord) {
        recalculateRoute();
      }
    });

    // Check blocked state on drag end
    marker.on('dragend', (e) => {
      const pos = e.latlng;
      if (isCellBlocked(pos.lat, pos.lng)) {
        showErrorPill(`Warning: ${isStart ? 'Start' : 'Destination'} is on steep blocked ground!`, 3000);
      }
    });

    return marker;
  }

  // Map Click Handling
  map.on('click', (e) => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    // Gale Crater bounds check (Task UI/UX #1: Error pill auto-hides after 3 seconds)
    if (lat < gridData.bounds.south || lat > gridData.bounds.north ||
        lon < gridData.bounds.west || lon > gridData.bounds.east) {
      showErrorPill('Clicked outside Gale Crater study area', 3000);
      return;
    }

    // Third click clears and restarts with this point as START
    if (clickCount === 2) {
      clearAll();
    }

    if (clickCount === 0) {
      // First click: START (Task UI/UX #1: Clears error pill on valid start)
      clearErrorPill();
      startCoord = { lat, lon };
      startMarker = createDraggableMarker(lat, lon, true);
      if (startCoordEl) startCoordEl.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;

      if (isCellBlocked(lat, lon)) {
        showErrorPill('Warning: Start is on steep blocked ground.', 3000);
      }
      clickCount = 1;

    } else if (clickCount === 1) {
      // Second click: DESTINATION (Task UI/UX #1: Clears error pill on valid destination)
      clearErrorPill();
      endCoord = { lat, lon };
      endMarker = createDraggableMarker(lat, lon, false);
      if (endCoordEl) endCoordEl.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;

      if (isCellBlocked(lat, lon)) {
        showErrorPill('Warning: Destination is on steep blocked ground.', 3000);
      }

      recalculateRoute();
    }
  });

  // Set start point programmatically (e.g. from Science Stops)
  function setRouteStart(lat, lon, label) {
    clearErrorPill();
    startCoord = { lat, lon };
    if (!startMarker) {
      startMarker = createDraggableMarker(lat, lon, true);
    } else {
      startMarker.setLatLng([lat, lon]);
    }
    window._currentStartMarker = startMarker;

    if (startCoordEl) {
      startCoordEl.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;
      if (label) startCoordEl.title = label;
    }

    if (endCoord) {
      recalculateRoute();
      clickCount = 2;
    } else {
      clickCount = 1;
    }
  }

  // Set destination point programmatically (e.g. from Science Stops)
  function setRouteDestination(lat, lon, label) {
    clearErrorPill();
    endCoord = { lat, lon };
    if (!endMarker) {
      endMarker = createDraggableMarker(lat, lon, false);
    } else {
      endMarker.setLatLng([lat, lon]);
    }

    if (endCoordEl) {
      endCoordEl.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;
      if (label) endCoordEl.title = label;
    }

    if (startCoord) {
      recalculateRoute();
      clickCount = 2;
    } else {
      clickCount = 0;
    }
  }

  return {
    setRouteStart,
    setRouteDestination,
    clearAll,
    recalculateRoute,
    setMode: setRouteMode,
    getMode: () => currentRouteMode
  };
}

/**
 * Setup Science Stops (Task 5)
 * Loads stops.json, snaps them to nearest traversable cell (<9999 cost)
 * in the main walkable component, creates numbered HUD markers with interactive
 * popups, and populates the Science Stops list in the Directions card.
 */
function setupScienceStops(map, gridData, stopsData, routePlanner) {
  if (!stopsData || !stopsData.length) return;

  const { west, east, north, south } = gridData.bounds;
  const { rows, cols, cost } = gridData;

  // 1. Identify the main traversable connected network of Gale Crater
  // Find seed cell with lowest terrain cost
  let seedR = 0, seedC = 0, minCost = Infinity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cost[r][c] < minCost) {
        minCost = cost[r][c];
        seedR = r;
        seedC = c;
      }
    }
  }

  const visited = new Uint8Array(rows * cols);
  const queue = [seedR * cols + seedC];
  visited[seedR * cols + seedC] = 1;
  let head = 0;

  const dirs = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  while (head < queue.length) {
    const idx = queue[head++];
    const r = Math.floor(idx / cols);
    const c = idx % cols;

    for (let i = 0; i < 8; i++) {
      const nr = r + dirs[i][0];
      const nc = c + dirs[i][1];
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const nidx = nr * cols + nc;
        if (!visited[nidx] && cost[nr][nc] < 9999) {
          visited[nidx] = 1;
          queue.push(nidx);
        }
      }
    }
  }

  // 2. Snap each stop to the nearest traversable cell so route can always reach it
  const snappedStops = stopsData.map(stop => {
    const targetCol = Math.floor(((stop.lon - west) / (east - west)) * cols);
    const targetRow = Math.floor(((north - stop.lat) / (north - south)) * rows);
    const targetIdx = targetRow * cols + targetCol;

    // Check if stop's cell is already traversable and connected
    if (
      targetRow >= 0 && targetRow < rows &&
      targetCol >= 0 && targetCol < cols &&
      cost[targetRow][targetCol] < 9999 &&
      visited[targetIdx] === 1
    ) {
      return { ...stop, snapped: false };
    }

    // Otherwise find the closest reachable traversable cell in the main network
    let bestIdx = -1;
    let minSqDist = Infinity;
    for (let i = 0; i < queue.length; i++) {
      const idx = queue[i];
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const sqDist = (r - targetRow) ** 2 + (c - targetCol) ** 2;
      if (sqDist < minSqDist) {
        minSqDist = sqDist;
        bestIdx = idx;
      }
    }

    const bestR = Math.floor(bestIdx / cols);
    const bestC = bestIdx % cols;
    const snappedLat = north - (bestR + 0.5) * (north - south) / rows;
    const snappedLon = west + (bestC + 0.5) * (east - west) / cols;

    return {
      ...stop,
      lat: snappedLat,
      lon: snappedLon,
      origLat: stop.lat,
      origLon: stop.lon,
      snapped: true
    };
  });

  const stopMarkers = {};

  // 3. Render numbered markers on the map
  snappedStops.forEach(stop => {
    const stopIcon = L.divIcon({
      className: 'science-stop-marker-wrap',
      html: `
        <div class="science-stop-marker" data-stop-id="${stop.id}" title="${stop.name}">
          <span class="stop-marker-ping"></span>
          <span class="stop-marker-core">${stop.id}</span>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -18]
    });

    const marker = L.marker([stop.lat, stop.lon], {
      icon: stopIcon,
      pane: 'markerPane',
      title: stop.name
    }).addTo(map);

    // Popup card in HUD style
    const popupContent = `
      <div class="hud-stop-card">
        <div class="stop-card-header">
          <span class="stop-card-badge">SCIENCE TARGET 0${stop.id}</span>
          <h3 class="stop-card-title">${stop.name}</h3>
        </div>
        <div class="stop-card-coords">
          <span class="coord-tag">COORDS:</span>
          <span class="coord-text">${stop.lat.toFixed(5)}°, ${stop.lon.toFixed(5)}°</span>
        </div>
        <p class="stop-card-why">${stop.why}</p>
        <div class="stop-card-note">Stop positions are approximate and chosen from the photo.</div>
        <div class="stop-card-actions">
          <button type="button" class="stop-btn stop-btn-start" data-stop-id="${stop.id}">
            Set as start
          </button>
          <button type="button" class="stop-btn stop-btn-dest" data-stop-id="${stop.id}">
            Set as destination
          </button>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent, {
      className: 'hud-stop-popup',
      maxWidth: 300,
      closeButton: true
    });

    stopMarkers[stop.id] = marker;
  });

  // 4. Populate Science Stops list inside the Directions card
  const listEl = document.getElementById('science-stops-list');
  const countEl = document.getElementById('science-stops-count');
  if (countEl) countEl.textContent = `${snappedStops.length} SITES`;

  if (listEl) {
    listEl.innerHTML = snappedStops.map(stop => `
      <div class="science-stop-item" data-stop-id="${stop.id}" title="Click to inspect ${stop.name}">
        <div class="stop-item-badge">${stop.id}</div>
        <div class="stop-item-content">
          <div class="stop-item-name">${stop.name}</div>
          <div class="stop-item-desc">${stop.why}</div>
        </div>
        <div class="stop-item-actions">
          <button type="button" class="btn-stop-chip btn-chip-start" data-stop-id="${stop.id}" title="Set ${stop.name} as Start">START</button>
          <button type="button" class="btn-stop-chip btn-chip-dest" data-stop-id="${stop.id}" title="Set ${stop.name} as Destination">DEST</button>
        </div>
      </div>
    `).join('');
  }

  // 5. Wire button clicks for setting Start and Destination
  document.addEventListener('click', (e) => {
    // Start button clicked (either in marker popup or in directions card)
    const startBtn = e.target.closest('.stop-btn-start, .btn-chip-start');
    if (startBtn) {
      e.stopPropagation();
      const stopId = parseInt(startBtn.dataset.stopId, 10);
      const stop = snappedStops.find(s => s.id === stopId);
      if (stop) {
        routePlanner.setRouteStart(stop.lat, stop.lon, stop.name);
        if (stopMarkers[stop.id]) {
          stopMarkers[stop.id].closePopup();
        }
      }
      return;
    }

    // Destination button clicked (either in marker popup or in directions card)
    const destBtn = e.target.closest('.stop-btn-dest, .btn-chip-dest');
    if (destBtn) {
      e.stopPropagation();
      const stopId = parseInt(destBtn.dataset.stopId, 10);
      const stop = snappedStops.find(s => s.id === stopId);
      if (stop) {
        routePlanner.setRouteDestination(stop.lat, stop.lon, stop.name);
        if (stopMarkers[stop.id]) {
          stopMarkers[stop.id].closePopup();
        }
      }
      return;
    }

    // Clicking a stop row in the Directions card pans to it and opens its card
    const stopRow = e.target.closest('.science-stop-item');
    if (stopRow) {
      const stopId = parseInt(stopRow.dataset.stopId, 10);
      const stop = snappedStops.find(s => s.id === stopId);
      const marker = stopMarkers[stopId];
      if (stop && marker) {
        map.flyTo([stop.lat, stop.lon], Math.max(map.getZoom(), 17), { duration: 0.8 });
        marker.openPopup();
      }
    }
  });
}

/**
 * Update Route Safety Summary Card (Task 6)
 * Computes elevation stats (start/end, total climb/descent),
 * max slope, caution slope percentage, overall rating, and renders SVG elevation profile.
 */
function updateRouteSafety(gridData, startCoord, endCoord, currentRoute) {
  const safetyCard = document.getElementById('route-safety-card');
  if (!safetyCard || !currentRoute || !currentRoute.path || !currentRoute.path.length) return;

  const { west, east, north, south } = gridData.bounds;
  const { rows, cols, elev, cost, caution_deg, cell_m } = gridData;

  // Map each route point to its grid cell
  const points = currentRoute.path.map(p => {
    const col = Math.floor(((p.lon - west) / (east - west)) * cols);
    const row = Math.floor(((north - p.lat) / (north - south)) * rows);
    const cR = Math.max(0, Math.min(rows - 1, row));
    const cC = Math.max(0, Math.min(cols - 1, col));
    const cellElev = elev[cR][cC];
    const cellCost = cost[cR][cC];
    // Estimate slope: slope is about (cost - 1) * 5 degrees
    const slope = Math.max(0, (cellCost - 1) * 5);
    return {
      lat: p.lat,
      lon: p.lon,
      row: cR,
      col: cC,
      elev: cellElev,
      cost: cellCost,
      slope
    };
  });

  const startElev = points[0].elev;
  const endElev = points[points.length - 1].elev;

  let totalClimb = 0;
  let totalDescent = 0;
  let maxSlope = 0;
  let cautionCount = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.slope > maxSlope) {
      maxSlope = pt.slope;
    }
    if (pt.slope > caution_deg) {
      cautionCount++;
    }
    if (i > 0) {
      const diff = pt.elev - points[i - 1].elev;
      if (diff > 0) totalClimb += diff;
      else if (diff < 0) totalDescent += Math.abs(diff);
    }
  }

  const cautionPct = points.length > 0 ? (cautionCount / points.length) * 100 : 0;
  const isSafe = cautionCount === 0;

  // 1. Update metric displays
  const startEl = document.getElementById('safety-start-elev');
  const endEl = document.getElementById('safety-end-elev');
  const climbEl = document.getElementById('safety-climb');
  const descentEl = document.getElementById('safety-descent');
  const maxSlopeEl = document.getElementById('safety-max-slope');
  const cautionPctEl = document.getElementById('safety-caution-pct');
  const ratingPill = document.getElementById('safety-rating-pill');

  if (startEl) startEl.textContent = `${Math.round(startElev)} m`;
  if (endEl) endEl.textContent = `${Math.round(endElev)} m`;
  if (climbEl) climbEl.textContent = `+${totalClimb.toFixed(1)} m`;
  if (descentEl) descentEl.textContent = `-${totalDescent.toFixed(1)} m`;
  if (maxSlopeEl) maxSlopeEl.textContent = `${maxSlope.toFixed(1)}°`;
  if (cautionPctEl) {
    cautionPctEl.textContent = `${cautionPct.toFixed(1)}%`;
    cautionPctEl.style.color = cautionPct > 0 ? '#fcd34d' : '#6ee7b7';
  }

  // 2. Overall Rating: Green if no part is above caution_deg, Yellow if some part is above it
  if (ratingPill) {
    ratingPill.className = 'safety-rating-pill ' + (isSafe ? 'green' : 'yellow');
    ratingPill.innerHTML = isSafe
      ? `<span class="rating-dot">●</span> GREEN (SAFE)`
      : `<span class="rating-dot">▲</span> YELLOW (CAUTION)`;
  }

  // 3. Distance profile for SVG chart
  let cumDist = 0;
  const profile = points.map((pt, i) => {
    if (i > 0) {
      const prev = points[i - 1];
      const dr = Math.abs(pt.row - prev.row);
      const dc = Math.abs(pt.col - prev.col);
      const stepUnits = (dr !== 0 && dc !== 0) ? 1.414 : 1.0;
      cumDist += stepUnits * cell_m;
    }
    return { dist: cumDist, elev: pt.elev, slope: pt.slope };
  });

  const chartWrap = document.getElementById('chart-svg-wrap');
  if (chartWrap) {
    chartWrap.innerHTML = renderElevationSvg(profile, currentRoute.distance_m || cumDist);
  }

  // Reveal Safety Card
  safetyCard.classList.remove('hidden');
}

/**
 * Render pure SVG elevation profile chart (no libraries)
 * Distance on X-axis, Elevation on Y-axis.
 */
function renderElevationSvg(profile, totalDist) {
  if (!profile || profile.length === 0) return '';

  const w = 300;
  const h = 95;
  const padLeft = 42;
  const padRight = 15;
  const padTop = 14;
  const padBottom = 22;

  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  let minE = Infinity;
  let maxE = -Infinity;
  profile.forEach(p => {
    if (p.elev < minE) minE = p.elev;
    if (p.elev > maxE) maxE = p.elev;
  });

  // Ensure minimum vertical range to avoid divide-by-zero
  const span = Math.max(2, maxE - minE);
  const yMin = minE - span * 0.08;
  const yMax = maxE + span * 0.08;
  const yRange = yMax - yMin;

  const distMax = totalDist > 0 ? totalDist : (profile[profile.length - 1].dist || 1);

  const pts = profile.map(p => {
    const x = padLeft + (p.dist / distMax) * chartW;
    const y = padTop + (1 - (p.elev - yMin) / yRange) * chartH;
    return { x, y, elev: p.elev };
  });

  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L ${pts[pts.length - 1].x.toFixed(1)} ${padTop + chartH} L ${pts[0].x.toFixed(1)} ${padTop + chartH} Z`;

  const startDot = pts[0];
  const endDot = pts[pts.length - 1];

  return `
    <svg viewBox="0 0 ${w} ${h}" class="elevation-chart-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="elevFillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#00f0ff" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <!-- Gridlines -->
      <line x1="${padLeft}" y1="${padTop}" x2="${w - padRight}" y2="${padTop}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2,2"/>
      <line x1="${padLeft}" y1="${padTop + chartH}" x2="${w - padRight}" y2="${padTop + chartH}" stroke="rgba(255,255,255,0.2)"/>
      <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + chartH}" stroke="rgba(255,255,255,0.2)"/>

      <!-- Elevation Profile Area & Line -->
      <path d="${areaD}" fill="url(#elevFillGrad)"/>
      <path d="${lineD}" fill="none" stroke="#00f0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- Waypoint Dots -->
      <circle cx="${startDot.x.toFixed(1)}" cy="${startDot.y.toFixed(1)}" r="3.5" fill="#10b981" stroke="#ffffff" stroke-width="1"/>
      <circle cx="${endDot.x.toFixed(1)}" cy="${endDot.y.toFixed(1)}" r="3.5" fill="#00f0ff" stroke="#ffffff" stroke-width="1"/>

      <!-- Elevation Labels on Y-axis -->
      <text x="${padLeft - 5}" y="${padTop + 4}" fill="#94a3b8" font-size="8" font-family="monospace" text-anchor="end">${Math.round(maxE)}m</text>
      <text x="${padLeft - 5}" y="${padTop + chartH}" fill="#94a3b8" font-size="8" font-family="monospace" text-anchor="end">${Math.round(minE)}m</text>

      <!-- Distance Labels on X-axis -->
      <text x="${padLeft}" y="${h - 6}" fill="#64748b" font-size="8" font-family="monospace" text-anchor="start">0m</text>
      <text x="${w - padRight}" y="${h - 6}" fill="#64748b" font-size="8" font-family="monospace" text-anchor="end">${Math.round(distMax)}m</text>
    </svg>
  `;
}

/**
 * Configure Radiation and Weather Environmental Card (Task 6)
 */
function setupEnvironmentalCard() {
  const toggleBtn = document.getElementById('btn-toggle-env');
  const envCard = document.getElementById('env-card');
  toggleBtn?.addEventListener('click', () => {
    if (envCard) {
      const isCollapsed = envCard.classList.toggle('collapsed');
      toggleBtn.setAttribute('aria-expanded', !isCollapsed);
    }
  });
}

/**
 * Configure First-time Mission Hint Card (Task UI/UX #5)
 * Remember dismissal in memory only (no localStorage).
 */
let hintDismissed = false;
function setupOnboardingHint() {
  const hintCard = document.getElementById('onboarding-hint');
  const btnDismiss = document.getElementById('btn-dismiss-hint');

  if (hintDismissed && hintCard) {
    hintCard.classList.add('hidden');
  }

  btnDismiss?.addEventListener('click', () => {
    hintDismissed = true;
    hintCard?.classList.add('hidden');
  });
}

/**
 * Configure Collapsible Panels & Mobile Tabs (Task UI/UX #6)
 * Supports collapsing Directions and Route Safety into tabs or collapsible cards.
 */
function setupCollapsiblePanels() {
  const btnToggleDirections = document.getElementById('btn-toggle-directions');
  const directionsCard = document.getElementById('directions-card');
  btnToggleDirections?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (directionsCard) {
      const isCollapsed = directionsCard.classList.toggle('collapsed');
      btnToggleDirections.setAttribute('aria-expanded', !isCollapsed);
      document.body.classList.toggle('mobile-collapsed', isCollapsed);
    }
  });

  const btnToggleSafety = document.getElementById('btn-toggle-safety');
  const safetyCard = document.getElementById('route-safety-card');
  btnToggleSafety?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (safetyCard) {
      const isCollapsed = safetyCard.classList.toggle('collapsed');
      btnToggleSafety.setAttribute('aria-expanded', !isCollapsed);
    }
  });

  // Mobile HUD Tabs: Switcher between Directions and Route Safety
  const tabBtnDirections = document.getElementById('tab-btn-directions');
  const tabBtnSafety = document.getElementById('tab-btn-safety');
  const rightColumn = document.getElementById('right-hud-column');

  function switchMobileTab(tab) {
    if (tab === 'directions') {
      tabBtnDirections?.classList.add('active');
      tabBtnDirections?.setAttribute('aria-selected', 'true');
      tabBtnSafety?.classList.remove('active');
      tabBtnSafety?.setAttribute('aria-selected', 'false');
      directionsCard?.classList.remove('mobile-tab-hidden');
      rightColumn?.classList.remove('mobile-tab-active');
    } else {
      tabBtnSafety?.classList.add('active');
      tabBtnSafety?.setAttribute('aria-selected', 'true');
      tabBtnDirections?.classList.remove('active');
      tabBtnDirections?.setAttribute('aria-selected', 'false');
      directionsCard?.classList.add('mobile-tab-hidden');
      rightColumn?.classList.add('mobile-tab-active');
    }
  }

  tabBtnDirections?.addEventListener('click', () => switchMobileTab('directions'));
  tabBtnSafety?.addEventListener('click', () => switchMobileTab('safety'));
}
