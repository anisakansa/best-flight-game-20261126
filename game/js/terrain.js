// Terrain for Skyline Cargo: a lagoon island chain the missions fly over.
// The world is a heightfield built from seeded noise plus hand-placed island
// bumps, so every pilot flies the same recognisable islands. Sea level is 0;
// anything below it is water. The runway sits on the home island at z = 0.

import { makeFractalNoise, mulberry32 } from './rng.js';

export const SEA_LEVEL = 0;
export const WORLD_SEED = 20261126;

// Home runway: a flat strip on the home island, heading north (+z).
export const RUNWAY = {
  x: 0,
  zStart: -40,
  zEnd: 320,
  halfWidth: 14,
  heading: 0,
};

// The far island strip the landing mission aims for.
export const FAR_STRIP = {
  x: 60,
  zStart: 3480,
  zEnd: 3760,
  halfWidth: 12,
  heading: 0.06,
};

// Island bumps: smooth hills that rise out of the lagoon. Each one is a
// gaussian mound with its own height, so the chain reads as separate islands.
const ISLANDS = [
  { x: 0, z: 120, r: 420, h: 26 },
  { x: -260, z: 900, r: 300, h: 48 },
  { x: 240, z: 1500, r: 340, h: 58 },
  { x: -140, z: 2250, r: 280, h: 42 },
  { x: 180, z: 2950, r: 320, h: 64 },
  { x: 60, z: 3620, r: 380, h: 30 },
  { x: -420, z: 3400, r: 260, h: 38 },
  { x: 460, z: 700, r: 240, h: 34 },
];

export function makeTerrain(seed) {
  const hills = makeFractalNoise(seed + 11, 3);
  const detail = makeFractalNoise(seed + 77, 2);

  function islandBump(x, z) {
    let height = 0;
    for (const island of ISLANDS) {
      const dx = (x - island.x) / island.r;
      const dz = (z - island.z) / island.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < 4) {
        height += island.h * Math.exp(-d2 * 1.4);
      }
    }
    return height;
  }

  // Height in metres at world (x, z). Deterministic: same inputs, same land.
  function heightAt(x, z) {
    // Flatten the runway and the far strip so landings are fair.
    const onRunway =
      Math.abs(x - RUNWAY.x) < RUNWAY.halfWidth + 6 &&
      z > RUNWAY.zStart - 30 &&
      z < RUNWAY.zEnd + 30;
    const onFarStrip =
      Math.abs(x - FAR_STRIP.x) < FAR_STRIP.halfWidth + 6 &&
      z > FAR_STRIP.zStart - 30 &&
      z < FAR_STRIP.zEnd + 30;
    if (onRunway || onFarStrip) return 2.5;
    // Open water sits below sea level: most of the map is lagoon, and the
    // islands rise out of it as distinct green mounds, not one brown mass.
    const base = hills(x * 0.004, z * 0.004) * 9 - 7;
    const bumps = islandBump(x, z);
    const rough = detail(x * 0.02, z * 0.02) * 2.2;
    return base + bumps + rough;
  }

  function isWater(x, z) {
    return heightAt(x, z) < SEA_LEVEL;
  }

  return { heightAt, isWater };
}

// A precomputed height grid over the route corridor, so the renderer can
// sample the land thousands of times a frame without re-running the noise.
// The grid is built once from the same seeded height function, so it agrees
// with the analytic heights the flight model uses, to the grid's resolution.
export function makeHeightGrid(terrain, step) {
  const x0 = -700;
  const x1 = 700;
  const z0 = -200;
  const z1 = 4300;
  const cols = Math.floor((x1 - x0) / step) + 1;
  const rows = Math.floor((z1 - z0) / step) + 1;
  const grid = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      grid[r * cols + c] = terrain.heightAt(x0 + c * step, z0 + r * step);
    }
  }
  // Bilinear interpolation between grid points: smooth, deterministic.
  function at(x, z) {
    const fx = (x - x0) / step;
    const fz = (z - z0) / step;
    const c0 = Math.max(0, Math.min(cols - 2, Math.floor(fx)));
    const r0 = Math.max(0, Math.min(rows - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - c0));
    const tz = Math.max(0, Math.min(1, fz - r0));
    const a = grid[r0 * cols + c0];
    const b = grid[r0 * cols + c0 + 1];
    const d = grid[(r0 + 1) * cols + c0];
    const e = grid[(r0 + 1) * cols + c0 + 1];
    return a + (b - a) * tx + (d - a) * tz + (a - b - d + e) * tx * tz;
  }
  return { at };
}

// Colour ramp for the terrain slices the renderer draws. The colours blend
// smoothly between height stops — water, sand, grass, forest, rock, snow —
// so a hillside reads as one style instead of hard flat bands, and a band
// edge never cuts across the land as a straight bar.
const COLOR_STOPS = [
  { h: -4, c: [30, 130, 168] },
  { h: 0.5, c: [38, 148, 178] },
  { h: 3.5, c: [232, 209, 158] },
  { h: 10, c: [110, 168, 80] },
  { h: 16, c: [96, 158, 74] },
  { h: 30, c: [58, 122, 62] },
  { h: 48, c: [122, 108, 94] },
  { h: 62, c: [238, 240, 244] },
];

export function terrainColor(height, sunShade) {
  const shade = Math.max(0.55, Math.min(1.15, sunShade));
  let lower = COLOR_STOPS[0];
  let upper = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i += 1) {
    if (height >= COLOR_STOPS[i].h && height <= COLOR_STOPS[i + 1].h) {
      lower = COLOR_STOPS[i];
      upper = COLOR_STOPS[i + 1];
      break;
    }
  }
  const span = upper.h - lower.h || 1;
  const t = Math.max(0, Math.min(1, (height - lower.h) / span));
  const r = lower.c[0] + (upper.c[0] - lower.c[0]) * t;
  const g = lower.c[1] + (upper.c[1] - lower.c[1]) * t;
  const b = lower.c[2] + (upper.c[2] - lower.c[2]) * t;
  return `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`;
}

// Ring gates for the Ring Run mission: twelve gates along a lazy S-curve
// over the lagoon, heights that reward gentle climbs and descents.
export function makeRingCourse(seed) {
  const random = mulberry32(seed + 5);
  const rings = [];
  for (let i = 0; i < 12; i += 1) {
    const t = i / 11;
    const z = 420 + t * 3120;
    const x = Math.sin(t * Math.PI * 2.2) * 130 + (random() - 0.5) * 36;
    const y = 42 + Math.sin(t * Math.PI * 3.1) * 18 + random() * 8;
    rings.push({ x, y, z, radius: 16, index: i });
  }
  return rings;
}

// Scattered cloud puffs: fixed world positions, drawn as soft billboards.
export function makeClouds(seed) {
  const random = mulberry32(seed + 99);
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: (random() - 0.5) * 1600,
      y: 150 + random() * 90,
      z: random() * 4200 - 200,
      size: 60 + random() * 110,
    });
  }
  return clouds;
}

// A rescue beacon: the downed pilot's smoke column on the far island.
export const BEACON = { x: -140, z: 2250, y: 44 };
