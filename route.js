/**
 * MarsWalk Navigator - Task 2: Route Planner
 * 
 * Implements A* pathfinding across the Martian surface grid for EVA navigation.
 * Evaluates slope cost and avoids blocked hazard cells (cost >= 9999).
 */

/**
 * Simple Min-Heap Priority Queue for A* search.
 * Orders nodes by f-score (g + h) for optimal O(log N) extraction.
 */
class MinHeap {
  constructor() {
    this.heap = [];
  }

  push(item) {
    this.heap.push(item);
    let idx = this.heap.length - 1;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.heap[parentIdx].f <= this.heap[idx].f) break;
      [this.heap[parentIdx], this.heap[idx]] = [this.heap[idx], this.heap[parentIdx]];
      idx = parentIdx;
    }
  }

  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      let idx = 0;
      const length = this.heap.length;
      while (true) {
        const left = (idx << 1) + 1;
        const right = left + 1;
        let smallest = idx;

        if (left < length && this.heap[left].f < this.heap[smallest].f) {
          smallest = left;
        }
        if (right < length && this.heap[right].f < this.heap[smallest].f) {
          smallest = right;
        }
        if (smallest === idx) break;

        [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
        idx = smallest;
      }
    }
    return top;
  }

  isEmpty() {
    return this.heap.length === 0;
  }
}

/**
 * Calculates the safest, least-cost route between two points on the Martian surface.
 * 
 * @param {Object} grid - Grid object from data/grid.json (bounds, cell_m, rows, cols, cost)
 * @param {Object} start - Starting coordinates { lat, lon } in degrees
 * @param {Object} end - Destination coordinates { lat, lon } in degrees
 * @param {number} [speedKmh=2] - Walking speed in km/h (default 2 km/h)
 * @returns {Object|null} { path: [{lat, lon}, ...], distance_m, time_min } or null if invalid/blocked
 */
function findRoute(grid, start, end, speedKmh = 2) {
  // Validate input parameters
  if (!grid || !grid.bounds || !grid.cost) {
    const reason = "Invalid grid data provided.";
    console.warn(reason);
    findRoute.reason = reason;
    findRoute.error = reason;
    return null;
  }

  const { west, south, east, north } = grid.bounds;
  const { rows, cols, cell_m, cost } = grid;

  // 1. Convert geographic coordinates {lat, lon} to grid indices [row, col]
  // Row 0 is the NORTH edge (-4.79), bottom is SOUTH (-4.80)
  const startCol = Math.floor(((start.lon - west) / (east - west)) * cols);
  const startRow = Math.floor(((north - start.lat) / (north - south)) * rows);
  const endCol = Math.floor(((end.lon - west) / (east - west)) * cols);
  const endRow = Math.floor(((north - end.lat) / (north - south)) * rows);

  // 2. Validate grid bounds
  if (startRow < 0 || startRow >= rows || startCol < 0 || startCol >= cols) {
    const reason = "Start location is outside map bounds.";
    console.warn(reason);
    findRoute.reason = reason;
    findRoute.error = reason;
    return null;
  }

  if (endRow < 0 || endRow >= rows || endCol < 0 || endCol >= cols) {
    const reason = "End location is outside map bounds.";
    console.warn(reason);
    findRoute.reason = reason;
    findRoute.error = reason;
    return null;
  }

  // 3. Check for steep blocked terrain (cost >= 9999)
  if (cost[startRow][startCol] >= 9999) {
    const reason = "Start point is on steep blocked ground.";
    console.warn(reason);
    findRoute.reason = reason;
    findRoute.error = reason;
    return null;
  }

  if (cost[endRow][endCol] >= 9999) {
    const reason = "End point is on steep blocked ground.";
    console.warn(reason);
    findRoute.reason = reason;
    findRoute.error = reason;
    return null;
  }

  // Trivial case: start and end are in the same grid cell
  if (startRow === endRow && startCol === endCol) {
    findRoute.reason = null;
    findRoute.error = null;
    return {
      path: [
        {
          lat: north - (startRow + 0.5) * (north - south) / rows,
          lon: west + (startCol + 0.5) * (east - west) / cols
        }
      ],
      distance_m: 0,
      time_min: 0
    };
  }

  // 4. Initialize A* data structures
  const numCells = rows * cols;
  const gScore = new Float64Array(numCells).fill(Infinity);
  const cameFrom = new Int32Array(numCells).fill(-1);
  const closed = new Uint8Array(numCells);

  const startIdx = startRow * cols + startCol;
  const endIdx = endRow * cols + endCol;

  // Octile distance heuristic for 8-direction grid
  function heuristic(r, c) {
    const dr = Math.abs(r - endRow);
    const dc = Math.abs(c - endCol);
    return Math.max(dr, dc) + 0.414 * Math.min(dr, dc);
  }

  gScore[startIdx] = 0;
  const openSet = new MinHeap();
  openSet.push({
    r: startRow,
    c: startCol,
    idx: startIdx,
    f: heuristic(startRow, startCol)
  });

  // 8 movement directions: 4 orthogonal (cost 1.0) and 4 diagonal (cost 1.414)
  const directions = [
    [-1, 0, 1.0],   // North
    [1, 0, 1.0],    // South
    [0, -1, 1.0],   // West
    [0, 1, 1.0],    // East
    [-1, -1, 1.414],// North-West
    [-1, 1, 1.414], // North-East
    [1, -1, 1.414], // South-West
    [1, 1, 1.414]   // South-East
  ];

  let pathFound = false;

  // 5. A* Search Loop
  while (!openSet.isEmpty()) {
    const current = openSet.pop();

    if (current.idx === endIdx) {
      pathFound = true;
      break;
    }

    if (closed[current.idx]) continue;
    closed[current.idx] = 1;

    for (let i = 0; i < 8; i++) {
      const dr = directions[i][0];
      const dc = directions[i][1];
      const stepDistanceMultiplier = directions[i][2];

      const nr = current.r + dr;
      const nc = current.c + dc;

      // Check bounds
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

      const neighborIdx = nr * cols + nc;
      if (closed[neighborIdx]) continue;

      // Rule: Never enter a cell with cost 9999 (steep hazard slope)
      const cellCost = cost[nr][nc];
      if (cellCost >= 9999) continue;

      // Diagonal step is 1.414 times longer and costs more
      const moveCost = stepDistanceMultiplier * cellCost;
      const tentativeG = gScore[current.idx] + moveCost;

      if (tentativeG < gScore[neighborIdx]) {
        gScore[neighborIdx] = tentativeG;
        cameFrom[neighborIdx] = current.idx;
        openSet.push({
          r: nr,
          c: nc,
          idx: neighborIdx,
          f: tentativeG + heuristic(nr, nc)
        });
      }
    }
  }

  // If no path was found to the goal cell
  if (!pathFound) {
    const reason = "No safe path exists: the route is blocked or enclosed by steep slopes.";
    console.warn(reason);
    findRoute.reason = reason;
    findRoute.error = reason;
    return null;
  }

  // 6. Reconstruct the Path from end to start
  const cellPath = [];
  let curr = endIdx;
  while (curr !== -1) {
    const r = Math.floor(curr / cols);
    const c = curr % cols;
    cellPath.push({ r, c });
    if (curr === startIdx) break;
    curr = cameFrom[curr];
  }
  cellPath.reverse();

  // 7. Calculate Distance (metres) and Walking Time (minutes)
  // Diagonal steps count as 1.414 cells; orthogonal steps count as 1.0 cells
  let totalStepUnits = 0;
  for (let i = 0; i < cellPath.length - 1; i++) {
    const dr = Math.abs(cellPath[i + 1].r - cellPath[i].r);
    const dc = Math.abs(cellPath[i + 1].c - cellPath[i].c);
    const isDiagonal = (dr !== 0 && dc !== 0);
    totalStepUnits += isDiagonal ? 1.414 : 1.0;
  }

  const distance_m = totalStepUnits * cell_m;

  // time_min = distance_m / (speedKmh * 1000 / 60)
  const speedMetersPerMin = (speedKmh * 1000) / 60;
  const time_min = speedMetersPerMin > 0 ? (distance_m / speedMetersPerMin) : 0;

  // Convert cells back to geographic coordinates {lat, lon}
  const path = cellPath.map(cell => ({
    lat: north - ((cell.r + 0.5) * (north - south)) / rows,
    lon: west + ((cell.c + 0.5) * (east - west)) / cols
  }));

  findRoute.reason = null;
  findRoute.error = null;

  return {
    path,
    distance_m,
    time_min
  };
}

// Support Node.js testing environment if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { findRoute };
}

