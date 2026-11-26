// Weather for Tradewind Courier: drifting cumulus over the archipelago and
// the squall line the Storm Run mission flies through. Clouds are placed by
// the seed; gusts are a pure function of position and time, so a storm run
// is the same storm every time it is flown.

import { makeRng, fbm, clamp } from './rng.js';

/** Build the cloud field for a seed: puff positions, sizes and drift. */
export function makeClouds(seed, count) {
  const rng = makeRng(seed ^ 0x5f3a);
  const clouds = [];
  for (let i = 0; i < count; i += 1) {
    clouds.push({
      x: (rng() * 2 - 1) * 5800,
      z: (rng() * 2 - 1) * 5800,
      y: 420 + rng() * 420,
      r: 180 + rng() * 320,
      shade: 0.82 + rng() * 0.18,
      drift: 2 + rng() * 4,
    });
  }
  return clouds;
}

/**
 * The squall line: a band of storm cells the Storm Run crosses. Cells are
 * fixed by the seed; `storminess(x, z)` is 0 outside the band, 1 inside.
 */
export function makeStorm(seed) {
  const rng = makeRng(seed ^ 0x77aa);
  const cells = [];
  // band runs diagonally from the lagoon toward Beacon Rock
  for (let i = 0; i < 9; i += 1) {
    cells.push({
      x: -400 + i * 560 + (rng() * 2 - 1) * 260,
      z: 300 - i * 470 + (rng() * 2 - 1) * 260,
      r: 420 + rng() * 260,
      top: 900 + rng() * 500,
    });
  }
  return { cells };
}

export function storminess(storm, x, z) {
  let s = 0;
  for (const c of storm.cells) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r) s = Math.max(s, 1 - d / c.r);
  }
  return s;
}

/** Wind gust at a point and sim-time: deterministic, position-based. */
export function gustAt(storm, x, z, t, seed) {
  const s = storminess(storm, x, z);
  if (s <= 0.02) return { x: 0, z: 0, strength: 0 };
  const gx = (fbm(x / 260 + t * 0.05, z / 260, seed + 311, 3) - 0.5) * 26 * s;
  const gz = (fbm(x / 260, z / 260 + t * 0.05, seed + 733, 3) - 0.5) * 26 * s;
  return { x: gx, z: gz, strength: s };
}

/** Rain streaks for the current view: positions wrap around the camera. */
export function rainStreaks(cam, t, seed, count) {
  const rng = makeRng(seed ^ 0x1234 ^ Math.floor(t * 2));
  const streaks = [];
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    const d = 20 + rng() * 90;
    const fall = (t * 240 + rng() * 60) % 90;
    streaks.push({
      x: cam.x + Math.cos(a) * d,
      y: cam.y + 46 - fall,
      z: cam.z + Math.sin(a) * d,
      len: 14 + rng() * 10,
    });
  }
  return streaks;
}

/** Cloud base for the storm: how low the grey ceiling hangs, 0..1 storm. */
export function cloudCeiling(storm, x, z) {
  return 950 - storminess(storm, x, z) * 620;
}

export function clamp01(v) {
  return clamp(v, 0, 1);
}
