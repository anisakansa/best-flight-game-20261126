// Deterministic randomness for Tradewind Courier: every number the world, the
// missions and the weather draw comes from a seed, so the same seed always
// builds the same archipelago. No Math.random anywhere in the game.

/** mulberry32: a small fast seeded PRNG with a 32-bit state. */
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer lattice hash: turns a grid point into a stable 0..1 value. */
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Value noise in 2D: smooth interpolation of lattice hashes. */
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const ux = smooth(fx);
  const uz = smooth(fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Fractal Brownian motion: layered value noise, 4 octaves. */
export function fbm(x, z, seed, octaves) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * valueNoise(x * freq, z * freq, seed + o * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Deterministic pick from an array using a seeded rng. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Clamp helper shared by the physics and the renderer. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
