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

document.addEventListener('DOMContentLoaded', () => {
  initMarsNavigator();
});

async function initMarsNavigator() {
  const alertEl = document.getElementById('connection-error');

  try {
    // 1. Fetch grid metadata
    const response = await fetch('data/grid.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const gridData = await response.json();

    const { bounds, caution_deg, hazard_deg, rows, cols, cell_m } = gridData;

    // LatLng bounds [[south, west], [north, east]]
    // Row 0 is the NORTH edge (-4.79), bottom is SOUTH (-4.80)
    const mapBounds = [
      [bounds.south, bounds.west],
      [bounds.north, bounds.east]
    ];

    // 2. Initialize Map with EPSG:4326 and smooth zoom
    const map = L.map('map', {
      crs: L.CRS.EPSG4326,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      maxBoundsViscosity: 1.0, // Hard stop at bounds: users cannot pan out into empty space
      attributionControl: false,
      zoomControl: false // Handled via Google-style bottom-right HUD buttons
    });

    // Fit map precisely to the Gale Crater region
    map.fitBounds(mapBounds, { padding: [0, 0] });

    // Establish zoom constraints: minZoom locked to fit zoom, maxZoom >= 4 levels in
    const initialZoom = map.getZoom();
    map.setMinZoom(initialZoom);
    map.setMaxZoom(initialZoom + 5); // Allows zooming in at least 5 levels deep
    map.setMaxBounds(mapBounds);

    // 3. Mount Image Overlays
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

    // 4. Setup HUD Components
    setupLayersControl(map, orthoLayer, hazardLayer, initialHazardOpacity);
    setupLegend(caution_deg, hazard_deg);
    setupHeaderTelemetry(map, rows, cols, cell_m);
    setupCursorTelemetry(map, gridData);
    setupScaleBar(map, gridData);
    setupMapActionButtons(map, mapBounds);
    setupRoutePlanner(map, gridData);

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

    // Pick round metric steps
    const steps = [500, 200, 100, 50, 20, 10, 5, 2, 1];
    let chosenMeters = steps[0];
    for (const step of steps) {
      if (step <= meters100) {
        chosenMeters = step;
        break;
      }
    }

    const widthPx = Math.max(20, Math.round((chosenMeters / meters100) * 100));
    rulerEl.style.width = `${widthPx}px`;
    labelEl.textContent = `${chosenMeters} m`;
  }

  map.on('zoom', updateScale);
  map.on('resize', updateScale);
  updateScale();
}

/**
 * Bottom-Right Google-style Action Buttons (Zoom +/- & Center Start)
 */
function setupMapActionButtons(map, mapBounds) {
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnCenterStart = document.getElementById('btn-center-start');

  btnZoomIn?.addEventListener('click', () => map.zoomIn());
  btnZoomOut?.addEventListener('click', () => map.zoomOut());

  btnCenterStart?.addEventListener('click', () => {
    // If a start marker exists, center on it; otherwise fit to mapBounds
    if (window._currentStartMarker) {
      map.panTo(window._currentStartMarker.getLatLng(), { animate: true });
    } else {
      map.fitBounds(mapBounds, { padding: [20, 20] });
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
        endMarker.bindTooltip(`${Math.round(currentRoute.distance_m)} m · ${currentRoute.time_min.toFixed(1)} min`, {
          permanent: true,
          direction: 'top',
          offset: [0, -12],
          className: 'route-eta-badge'
        }).openTooltip();
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
      setStatus('Clicked outside Gale Crater mapped area.', 'warning');
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
}
