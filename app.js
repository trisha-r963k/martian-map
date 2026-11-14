/**
 * MarsWalk Navigator - Task 1: Surface Map & Tactical HUD
 * 
 * Pair-programmed for NASA Space Apps Challenge
 * 
 * Key Features:
 * - Direct ingestion of Gale Crater planetary grid metadata from data/grid.json
 * - Leaflet EPSG:4326 Equirectangular Coordinate Reference System for Mars
 * - Image overlays: HiRISE photo base + 148x148 pixelated hazard slope overlay
 * - Interactive layer toggle and opacity controls
 * - Dynamic slope classification legend with mission assumption notice
 */

// Execute when DOM content is ready
document.addEventListener('DOMContentLoaded', () => {
  initMarsNavigator();
});

async function initMarsNavigator() {
  const alertEl = document.getElementById('connection-error');
  
  try {
    // 1. Fetch grid metadata (bounds, resolution, and slope criteria)
    const response = await fetch('data/grid.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const gridData = await response.json();

    const { bounds, caution_deg, hazard_deg, rows, cols, cell_m } = gridData;

    // 2. Define LatLng bounds [[south, west], [north, east]]
    // Row 0 in grid is North edge (-4.79), bottom is South (-4.8)
    const mapBounds = [
      [bounds.south, bounds.west],
      [bounds.north, bounds.east]
    ];

    // 3. Initialize Leaflet Map using L.CRS.EPSG4326
    // Mars planetocentric degrees (lat ~ -4.8, lon ~ 137.35) map directly 
    // into EPSG:4326 equirectangular coordinates without spherical distortion.
    const map = L.map('map', {
      crs: L.CRS.EPSG4326,
      minZoom: 12,        // Prevent zooming out to empty black space
      maxZoom: 24,        // Allow zooming in far to inspect individual 4m hazard cells
      zoomSnap: 0.25,     // Smooth fractional zoom for fine adjustments
      zoomDelta: 0.5,
      attributionControl: false // Handled in the HUD credit footer
    });

    // Fit view to the bounds of the Gale Crater region
    map.fitBounds(mapBounds, {
      padding: [24, 24]
    });

    // 4. Create Image Overlays
    // (a) HiRISE Orthophoto base
    const orthoLayer = L.imageOverlay('assets/ortho.jpg', mapBounds, {
      opacity: 1.0,
      alt: 'Gale Crater HiRISE Orthophoto'
    }).addTo(map);

    // (b) Slope Hazard overlay (yellow = caution, red = steep hazard)
    // className: 'hazard-layer' enforces CSS image-rendering: pixelated
    const initialHazardOpacity = 0.80;
    const hazardLayer = L.imageOverlay('assets/hazard.png', mapBounds, {
      opacity: initialHazardOpacity,
      className: 'hazard-layer',
      alt: 'Gale Crater Slope Hazard Map'
    }).addTo(map);

    // 5. Connect HUD Layer Panel Controls
    setupLayerControls(map, orthoLayer, hazardLayer, initialHazardOpacity);

    // 6. Populate Slope Hazard Legend dynamically from grid.json
    setupLegend(caution_deg, hazard_deg);

    // 7. Update Telemetry Readouts (Grid size, live zoom, cursor coordinates)
    setupTelemetry(map, rows, cols, cell_m);

    // 8. Task 2: Setup Interactive Route Planner
    setupRoutePlanner(map, gridData);

  } catch (err) {
    console.error('Failed to initialize MarsWalk Navigator:', err);
    if (alertEl) {
      alertEl.classList.remove('hidden');
    }
  }
}

/**
 * Configure layer visibility toggles and opacity sliders
 */
function setupLayerControls(map, orthoLayer, hazardLayer, initialHazardOpacity) {
  // Orthophoto Controls
  const toggleOrtho = document.getElementById('toggle-ortho');
  const sliderOrtho = document.getElementById('opacity-ortho');
  const readoutOrtho = document.getElementById('readout-ortho');

  toggleOrtho.addEventListener('change', (e) => {
    if (e.target.checked) {
      map.addLayer(orthoLayer);
    } else {
      map.removeLayer(orthoLayer);
    }
  });

  sliderOrtho.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    orthoLayer.setOpacity(val);
    readoutOrtho.textContent = `${Math.round(val * 100)}%`;

    // Automatically check toggle if user adjusts opacity from 0
    if (val > 0 && !toggleOrtho.checked) {
      toggleOrtho.checked = true;
      map.addLayer(orthoLayer);
    }
  });

  // Hazard Overlay Controls
  const toggleHazard = document.getElementById('toggle-hazard');
  const sliderHazard = document.getElementById('opacity-hazard');
  const readoutHazard = document.getElementById('readout-hazard');

  // Set initial slider & readout values
  sliderHazard.value = initialHazardOpacity;
  readoutHazard.textContent = `${Math.round(initialHazardOpacity * 100)}%`;

  toggleHazard.addEventListener('change', (e) => {
    if (e.target.checked) {
      map.addLayer(hazardLayer);
    } else {
      map.removeLayer(hazardLayer);
    }
  });

  sliderHazard.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    hazardLayer.setOpacity(val);
    readoutHazard.textContent = `${Math.round(val * 100)}%`;

    // Automatically check toggle if user adjusts opacity from 0
    if (val > 0 && !toggleHazard.checked) {
      toggleHazard.checked = true;
      map.addLayer(hazardLayer);
    }
  });
}

/**
 * Update legend values and text from grid.json
 */
function setupLegend(cautionDeg, hazardDeg) {
  const cautionEl = document.getElementById('legend-caution');
  const hazardEl = document.getElementById('legend-hazard');

  if (cautionEl) {
    cautionEl.innerHTML = `Caution: slope above <span class="val">${cautionDeg}</span> degrees`;
  }
  if (hazardEl) {
    hazardEl.innerHTML = `Hazard: slope above <span class="val">${hazardDeg}</span> degrees`;
  }
}

/**
 * Telemetry bar: Displays live zoom level, grid resolution, and cursor coordinates
 */
function setupTelemetry(map, rows, cols, cellM) {
  const zoomEl = document.getElementById('telemetry-zoom');
  const gridEl = document.getElementById('telemetry-grid');
  const cursorEl = document.getElementById('telemetry-cursor');

  if (gridEl && rows && cols && cellM) {
    gridEl.textContent = `${rows} × ${cols} (${cellM.toFixed(1)}m)`;
  }

  // Update zoom display
  function updateZoom() {
    if (zoomEl) {
      zoomEl.textContent = map.getZoom().toFixed(2);
    }
  }

  map.on('zoom', updateZoom);
  updateZoom();

  // Update live coordinate tracker
  map.on('mousemove', (e) => {
    if (cursorEl) {
      const lat = e.latlng.lat.toFixed(5);
      const lng = e.latlng.lng.toFixed(5);
      cursorEl.textContent = `${lat}°, ${lng}°`;
    }
  });

  map.on('mouseout', () => {
    if (cursorEl) {
      cursorEl.textContent = '-- , --';
    }
  });
}


/**
 * Task 2: Interactive Route Planner
 * - Two map clicks to set start (green) and end (cyan) markers.
 * - Third click clears and starts again.
 * - Calculates safest route using A* (route.js) avoiding cost >= 9999.
 * - Displays telemetry (distance in metres, walking time in minutes).
 * - Interactive walking speed input (default 2 km/h).
 */
function setupRoutePlanner(map, gridData) {
  // DOM element references
  const statusEl = document.getElementById('route-status');
  const startCoordEl = document.getElementById('route-start-coord');
  const endCoordEl = document.getElementById('route-end-coord');
  const distanceEl = document.getElementById('route-distance');
  const timeEl = document.getElementById('route-time');
  const speedInput = document.getElementById('speed-input');
  const clearBtn = document.getElementById('btn-clear-route');

  // Route state
  let startCoord = null;
  let endCoord = null;
  let startMarker = null;
  let endMarker = null;
  let routePolyline = null;
  let currentRoute = null;
  let clickCount = 0; // 0 = ready for start, 1 = ready for end, 2 = route displayed

  // Ensure polyline draws in a dedicated pane above all image overlays
  if (!map.getPane('routePane')) {
    map.createPane('routePane');
    map.getPane('routePane').style.zIndex = 550;
  }

  // Tactical custom HUD marker icons
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

  /**
   * Helper: checks if a given lat/lon lands on a blocked slope cell (cost >= 9999)
   */
  function isCellBlocked(lat, lon) {
    const col = Math.floor(((lon - gridData.bounds.west) / (gridData.bounds.east - gridData.bounds.west)) * gridData.cols);
    const row = Math.floor(((gridData.bounds.north - lat) / (gridData.bounds.north - gridData.bounds.south)) * gridData.rows);
    if (row < 0 || row >= gridData.rows || col < 0 || col >= gridData.cols) return true;
    return gridData.cost[row][col] >= 9999;
  }

  /**
   * Clears active route, markers, and resets readouts
   */
  function clearRoute() {
    if (startMarker) {
      map.removeLayer(startMarker);
      startMarker = null;
    }
    if (endMarker) {
      map.removeLayer(endMarker);
      endMarker = null;
    }
    if (routePolyline) {
      map.removeLayer(routePolyline);
      routePolyline = null;
    }
    startCoord = null;
    endCoord = null;
    currentRoute = null;
    clickCount = 0;

    if (startCoordEl) startCoordEl.textContent = '--';
    if (endCoordEl) endCoordEl.textContent = '--';
    if (distanceEl) distanceEl.textContent = '--';
    if (timeEl) timeEl.textContent = '--';
    if (statusEl) {
      statusEl.className = 'route-status';
      statusEl.innerHTML = 'Click map to set <span class="badge-start">START</span> point.';
    }
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearRoute);
  }

  // Recalculate walking time live when speed input changes
  if (speedInput) {
    speedInput.addEventListener('input', () => {
      const speedKmh = parseFloat(speedInput.value) || 2;
      if (currentRoute && currentRoute.distance_m > 0 && timeEl) {
        const speedMpm = (speedKmh * 1000) / 60;
        const updatedTime = speedMpm > 0 ? (currentRoute.distance_m / speedMpm) : 0;
        timeEl.textContent = `${updatedTime.toFixed(1)} min`;
      }
    });
  }

  // Map click interaction
  map.on('click', (e) => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    // Check bounds
    if (lat < gridData.bounds.south || lat > gridData.bounds.north ||
        lon < gridData.bounds.west || lon > gridData.bounds.east) {
      if (statusEl) {
        statusEl.className = 'route-status warning';
        statusEl.textContent = 'Coordinates outside mapped Gale Crater area.';
      }
      return;
    }

    // Third click clears previous route and immediately sets new start point
    if (clickCount === 2) {
      clearRoute();
    }

    if (clickCount === 0) {
      // First click: START (green marker)
      startCoord = { lat, lon };
      startMarker = L.marker([lat, lon], { icon: startIcon, pane: 'markerPane' }).addTo(map);
      if (startCoordEl) {
        startCoordEl.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;
      }

      const blocked = isCellBlocked(lat, lon);
      if (statusEl) {
        if (blocked) {
          statusEl.className = 'route-status warning';
          statusEl.textContent = 'Warning: Start point is on steep blocked ground (slope hazard).';
        } else {
          statusEl.className = 'route-status';
          statusEl.innerHTML = 'START set. Click map to set <span class="badge-end">END</span> destination.';
        }
      }
      clickCount = 1;

    } else if (clickCount === 1) {
      // Second click: END (cyan marker)
      endCoord = { lat, lon };
      endMarker = L.marker([lat, lon], { icon: endIcon, pane: 'markerPane' }).addTo(map);
      if (endCoordEl) {
        endCoordEl.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;
      }

      const endBlocked = isCellBlocked(lat, lon);
      if (endBlocked && statusEl) {
        statusEl.className = 'route-status warning';
        statusEl.textContent = 'Warning: End point is on steep blocked ground (slope hazard).';
      }

      // Compute optimal safe route avoiding cost >= 9999
      const speedKmh = speedInput ? (parseFloat(speedInput.value) || 2) : 2;
      currentRoute = findRoute(gridData, startCoord, endCoord, speedKmh);

      if (currentRoute && currentRoute.path && currentRoute.path.length > 0) {
        // Draw the route as a bright polyline above the overlays
        const points = [
          [startCoord.lat, startCoord.lon],
          ...currentRoute.path.map(p => [p.lat, p.lon]),
          [endCoord.lat, endCoord.lon]
        ];

        routePolyline = L.polyline(points, {
          color: '#00f0ff',
          weight: 4,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          pane: 'routePane'
        }).addTo(map);

        if (distanceEl) {
          distanceEl.textContent = `${Math.round(currentRoute.distance_m)} m`;
        }
        if (timeEl) {
          timeEl.textContent = `${currentRoute.time_min.toFixed(1)} min`;
        }
        if (statusEl) {
          statusEl.className = 'route-status success';
          statusEl.textContent = 'Route calculated. Click map to clear and start again.';
        }
      } else {
        // No safe path available (Requirement 4 text)
        if (distanceEl) distanceEl.textContent = '--';
        if (timeEl) timeEl.textContent = '--';
        if (statusEl) {
          statusEl.className = 'route-status warning';
          statusEl.textContent = 'No safe route found: start or end is on steep blocked ground, or the area is enclosed by steep slopes.';
        }
      }
      clickCount = 2;
    }
  });
}
