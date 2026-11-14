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

