// The archipelago of Tradewind Courier: a procedural heightmap over a 12 km
// square of ocean, built from a seed. Islands rise from the sea as smooth
// gaussian bumps textured with fractal noise; two of them carry airstrips
// flattened into the terrain. Everything here is pure function of the seed.

import { fbm, clamp } from './rng.js';

export const WORLD_HALF = 6000; // world spans -6000..6000 m on x and z
export const SEA_LEVEL = 0;
export const GRID_CELLS = 96; // heightmap mesh cells per side
export const CELL = (WORLD_HALF * 2) / GRID_CELLS;

// Islands: centre, radius, peak height. The first two carry airports.
export const ISLANDS = [
  { name: 'Meridian', x: -2600, z: -2400, r: 2100, peak: 260, airport: true },
  { name: 'Kaimana', x: 2600, z: 1600, r: 1500, peak: 210, airport: true },
  { name: 'Karang', x: -600, z: 4100, r: 1100, peak: 150, airport: false },
  { name: 'Beacon Rock', x: 4100, z: -3600, r: 900, peak: 190, airport: false },
  { name: 'Turtle Cay', x: 1200, z: -4200, r: 800, peak: 90, airport: false },
  { name: 'Palm Reef', x: -4200, z: 3200, r: 950, peak: 70, airport: false },
  { name: 'Sister Islet', x: 4400, z: 3400, r: 650, peak: 60, airport: false },
];

// Airstrips: flat ground the physics treats as runway. heading in radians
// (0 = north, -z). length/width in metres, elevation in metres. Both strips
// sit on their island's coast, pointing out to sea, so a takeoff climbs
// over water instead of into the island behind it.
export const RUNWAYS = [
  {
    id: 'home',
    name: 'MERIDIAN FIELD',
    x: -2600, z: -700, heading: Math.PI, length: 900, width: 46, elev: 12,
  },
  {
    id: 'kaimana',
    name: 'KAIMANA SHORT STRIP',
    x: 3600, z: 1600, heading: Math.PI / 2, length: 340, width: 30, elev: 8,
  },
];

// Distance from a point to a runway centreline, and along-track position.
export function runwayFrame(runway, x, z) {
  const dx = x - runway.x;
  const dz = z - runway.z;
  const sin = Math.sin(runway.heading);
  const cos = Math.cos(runway.heading);
  // runway forward is (sin h, -cos h) in (x, z)
  const along = dx * sin - dz * cos;
  const across = dx * cos + dz * sin;
  return { along, across };
}

export function onRunway(runway, x, z, margin) {
  const f = runwayFrame(runway, x, z);
  const m = margin ?? 0;
  return Math.abs(f.along) <= runway.length / 2 + m && Math.abs(f.across) <= runway.width / 2 + m;
}

function islandMask(x, z) {
  let mask = 0;
  for (const isl of ISLANDS) {
    const dx = (x - isl.x) / isl.r;
    const dz = (z - isl.z) / isl.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1) {
      const fall = Math.exp(-d2 * 2.2);
      mask = Math.max(mask, fall);
    }
  }
  return mask;
}

/** Raw terrain height (metres) at a world point, before runway flattening. */
export function rawHeightAt(x, z, seed) {
  const mask = islandMask(x, z);
  if (mask <= 0.01) return -8; // sea floor, safely below the water plane
  const n = fbm(x / 900 + 7.3, z / 900 + 2.9, seed, 4);
  const ridge = fbm(x / 420 + 1.7, z / 420 + 8.4, seed + 57, 3);
  const h = mask * (26 + 150 * n + 90 * ridge * ridge);
  return h;
}

function runwayFlatten(x, z, h) {
  // flatten the ground around each runway into a level approach corridor:
  // 500 m of flat along the strip's axis (so the final approach never has
  // to clear a hillside) and 160 m across it
  for (const rw of RUNWAYS) {
    const f = runwayFrame(rw, x, z);
    const ax = Math.abs(f.across);
    const al = Math.abs(f.along);
    if (al < rw.length / 2 + 500 && ax < rw.width / 2 + 160) {
      const edge = Math.max(
        (al - rw.length / 2) / 500,
        (ax - rw.width / 2) / 160,
        0,
      );
      const t = clamp(1 - Math.max(edge, 0), 0, 1);
      const blend = t * t * (3 - 2 * t);
      return h * (1 - blend) + rw.elev * blend;
    }
  }
  return h;
}

/** Terrain height (metres) at a world point, runways flattened in. */
export function heightAt(x, z, seed) {
  return runwayFlatten(x, z, rawHeightAt(x, z, seed));
}

/** Colour of a terrain point, by height and slope, as [r, g, b]. */
export function terrainColor(x, z, h, seed) {
  if (h < 2.5) return [216, 196, 138]; // sand
  if (h < 7) return [190, 178, 120]; // dry grass fringe
  const n = fbm(x / 260 + 3.1, z / 260 + 5.6, seed + 91, 3);
  if (h < 55) {
    const g = 118 + Math.floor(n * 46);
    return [74, g, 62]; // lowland green
  }
  if (h < 120) {
    const g = 96 + Math.floor(n * 40);
    return [56, g, 58]; // forest
  }
  if (h < 190) {
    const v = 118 + Math.floor(n * 30);
    return [v, v - 8, v - 16]; // rock
  }
  return [232, 236, 240]; // snow caps
}

/** Shading factor from a height sample's slope (fake sun from the west). */
export function shadeAt(x, z, seed) {
  const e = 60;
  const hx = heightAt(x + e, z, seed) - heightAt(x - e, z, seed);
  const hz = heightAt(x, z + e, seed) - heightAt(x, z - e, seed);
  const slope = Math.hypot(hx, hz) / (2 * e);
  const face = (hx * 0.7 + hz * 0.7) / (2 * e);
  return clamp(1 - slope * 0.55 - face * 0.28, 0.62, 1.12);
}
