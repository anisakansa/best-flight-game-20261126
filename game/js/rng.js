// Seeded random numbers and smooth value noise for Skyline Cargo.
// Every number the game uses comes from a fixed seed, so the same mission
// always builds the same islands, the same rings and the same weather.
// No Math.random and no clock anywhere in here: the game is deterministic.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value = value ^ (value + Math.imul(value ^ (value >>> 7), value | 61));
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// A small shuffled permutation table, built once from the seed, that the
// noise functions below read. Two worlds with the same seed are identical.
export function makePermutation(seed) {
  const random = mulberry32(seed);
  const table = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) table[i] = base[i & 255];
  return table;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// 2D value noise in [-1, 1]. Cheap, smooth, and fully determined by the seed.
export function makeNoise2D(seed) {
  const perm = makePermutation(seed);
  function lattice(ix, iz) {
    return perm[(perm[ix & 255] + iz) & 255] / 255;
  }
  return function noise2D(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const a = lattice(ix, iz);
    const b = lattice(ix + 1, iz);
    const c = lattice(ix, iz + 1);
    const d = lattice(ix + 1, iz + 1);
    const u = fade(fx);
    const v = fade(fz);
    const value = lerp(lerp(a, b, u), lerp(c, d, u), v);
    return value * 2 - 1;
  };
}

// Fractal noise: several octaves of value noise stacked, still deterministic.
export function makeFractalNoise(seed, octaves) {
  const noise = makeNoise2D(seed);
  return function fractal(x, z) {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      total += noise(x * frequency, z * frequency) * amplitude;
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return total / norm;
  };
}

// Deterministic pick from an array: index from the seeded stream.
export function pickFrom(random, items) {
  return items[Math.floor(random() * items.length)];
}
