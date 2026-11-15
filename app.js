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

    // Initial view: fit precisely to Gale Crater study area
    map.fitBounds(mapBounds, { padding: [0, 0] });

    // 3. Mount Image Overlays (HiRISE Photo & Slope Hazard)
    // (a) HiRISE Orthophoto base
    const orthoLayer = L.imageOverlay('assets/ortho.jpg', mapBounds, {
      opacity: 1.0,
      alt: 'Gale Crater HiRISE Orthophoto'
    }).addTo(map);

    // (b) Slope Hazard overlay (crisp pixelated rendering via CSS)
    const initialHazardOpacity = 0.80;
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

    studyAreaRect.bindTooltip('Study area: Gale Crater', {
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
    setupLayersControl(map, orthoLayer, hazardLayer, initialHazardOpacity);
    setupLegend(caution_deg, hazard_deg);
    setupHeaderTelemetry(map, rows, cols, cell_m);
    setupCursorTelemetry(map, gridData);
    setupScaleBar(map, gridData);
    setupMapActionButtons(map, mapBounds);
    const routePlanner = setupRoutePlanner(map, gridData);
    setupScienceStops(map, gridData, stopsData, routePlanner);

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
function setupLayersControl(map, orthoLayer, hazardLayer, initialHazardOpacity) {
  const toggleBtn = document.getElementById('btn-layers-toggle');
  const popup = document.getElementById('layers-popup');

  const tilePhoto = document.getElementById('tile-photo');
  const tileHazard = document.getElementById('tile-hazard');
  const tileBoth = document.getElementById('tile-both');

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
    updateHazard(0.80, true);
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

  // Ensure Legend card is collapsed by default
  if (legendCard) {
    legendCard.classList.add('collapsed');
  }
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', 'false');
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
 * - ETA label near end marker.
 * - Swap button reverses start/destination.
 */
function setupRoutePlanner(map, gridData) {
  const statusEl = document.getElementById('route-status');
  const startCoordEl = document.getElementById('route-start-coord');
  const endCoordEl = document.getElementById('route-end-coord');
  const distanceEl = document.getElementById('route-distance');
  const timeEl = document.getElementById('route-time');
  const speedInput = document.getElementById('speed-input');
  const clearBtn = document.getElementById('btn-clear-route');
  const swapBtn = document.getElementById('btn-swap-route');

  let startCoord = null;
  let endCoord = null;
  let startMarker = null;
  let endMarker = null;
  let casingPolyline = null;
  let corePolyline = null;
  let currentRoute = null;
  let clickCount = 0; // 0 = ready for start, 1 = ready for end, 2 = route displayed

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
    return gridData.cost[row][col] >= 9999;
  }

  function setStatus(text, type = 'normal') {
    if (!statusEl) return;
    statusEl.className = 'route-status-pill';
    if (type === 'warning') statusEl.classList.add('warning');
    if (type === 'success') statusEl.classList.add('success');
    statusEl.textContent = text;
  }

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
    setStatus('Click map or drag pins to set route', 'normal');
  }

  clearBtn?.addEventListener('click', clearAll);

  // Recalculates route and updates polyline + tooltip
  function recalculateRoute() {
    if (!startCoord || !endCoord) return;

    clearRouteLines();

    const speedKmh = speedInput ? (parseFloat(speedInput.value) || 2) : 2;
    currentRoute = findRoute(gridData, startCoord, endCoord, speedKmh);

    if (currentRoute && currentRoute.path && currentRoute.path.length > 0) {
      const points = [
        [startCoord.lat, startCoord.lon],
        ...currentRoute.path.map(p => [p.lat, p.lon]),
        [endCoord.lat, endCoord.lon]
      ];

      // Route line: white casing + bright cyan line with animated dash (Requirement 4)
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

      // Label near the end marker showing distance and time (Requirement 4)
      if (endMarker) {
        const etaText = `${Math.round(currentRoute.distance_m)} m · ${currentRoute.time_min.toFixed(1)} min`;
        if (endMarker.getTooltip()) {
          endMarker.setTooltipContent(etaText);
        } else {
          endMarker.bindTooltip(etaText, {
            permanent: true,
            direction: 'top',
            offset: [0, -12],
            className: 'route-eta-badge'
          });
        }
        endMarker.openTooltip();
      }

      if (distanceEl) distanceEl.textContent = `${Math.round(currentRoute.distance_m)} m`;
      if (timeEl) timeEl.textContent = `${currentRoute.time_min.toFixed(1)} min`;
      setStatus('Route active. Drag markers to adjust.', 'success');
      clickCount = 2;
    } else {
      if (distanceEl) distanceEl.textContent = '--';
      if (timeEl) timeEl.textContent = '--';
      setStatus('No safe route found: start or end is on steep blocked ground, or the area is enclosed by steep slopes.', 'warning');
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

  // Marker creation helper with draggable support (Requirement 3)
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
        setStatus(`Warning: ${isStart ? 'Start' : 'Destination'} is on steep blocked ground!`, 'warning');
      }
    });

    return marker;
  }

  // Map Click Handling
  map.on('click', (e) => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    // Gale Crater bounds check
    if (lat < gridData.bounds.south || lat > gridData.bounds.north ||
        lon < gridData.bounds.west || lon > gridData.bounds.east) {
      setStatus('Clicked outside Gale Crater study area. Click "Fly to study area" to return.', 'warning');
      return;
    }

    // Third click clears and restarts with this point as START
    if (clickCount === 2) {
      clearAll();
    }

    if (clickCount === 0) {
      // First click: START
      startCoord = { lat, lon };
      startMarker = createDraggableMarker(lat, lon, true);
      if (startCoordEl) startCoordEl.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;

      if (isCellBlocked(lat, lon)) {
        setStatus('Warning: Start is on steep blocked ground.', 'warning');
      } else {
        setStatus('START set. Click map for DESTINATION.', 'normal');
      }
      clickCount = 1;

    } else if (clickCount === 1) {
      // Second click: DESTINATION
      endCoord = { lat, lon };
      endMarker = createDraggableMarker(lat, lon, false);
      if (endCoordEl) endCoordEl.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;

      if (isCellBlocked(lat, lon)) {
        setStatus('Warning: Destination is on steep blocked ground.', 'warning');
      }

      recalculateRoute();
    }
  });

  // Set start point programmatically (e.g. from Science Stops)
  function setRouteStart(lat, lon, label) {
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
      setStatus(`START set: ${label || 'target'}. Select DESTINATION.`, 'normal');
    }
  }

  // Set destination point programmatically (e.g. from Science Stops)
  function setRouteDestination(lat, lon, label) {
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
      setStatus(`DESTINATION set: ${label || 'target'}. Select START.`, 'normal');
    }
  }

  return {
    setRouteStart,
    setRouteDestination,
    clearAll,
    recalculateRoute
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
