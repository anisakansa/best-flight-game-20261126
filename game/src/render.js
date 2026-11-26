// Renderer for Tradewind Courier: a hand-rolled perspective projector over a
// canvas 2D. Sky, sea, the terrain mesh, runways, rings, markers, clouds
// and rain are all drawn from the same projector, so the world, the aircraft
// and the HUD agree about where everything is.

import { cameraBasis } from './camera.js';
import {
  WORLD_HALF, GRID_CELLS, CELL, heightAt, terrainColor, shadeAt, RUNWAYS, runwayFrame,
} from './terrain.js';
import { clamp } from './rng.js';

const FOV_DEG = 68;

/** Projector: world point -> screen point {x, y, z (depth), scale} or null. */
export function makeProjector(cam, w, h) {
  const basis = cameraBasis(cam);
  const focal = (h * 0.5) / Math.tan((FOV_DEG * Math.PI) / 360);
  const cx = w / 2;
  const cy = h / 2;
  const cr = Math.cos(cam.roll);
  const sr = Math.sin(cam.roll);
  return function project(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const px = dx * basis.right[0] + dy * basis.right[1] + dz * basis.right[2];
    const py = dx * basis.up[0] + dy * basis.up[1] + dz * basis.up[2];
    const pz = dx * basis.fwd[0] + dy * basis.fwd[1] + dz * basis.fwd[2];
    if (pz < 2) return null;
    const rx = px * cr - py * sr;
    const ry = px * sr + py * cr;
    const s = focal / pz;
    return { x: cx + rx * s, y: cy - ry * s, z: pz, scale: s };
  };
}

const SUN_DIR = [-0.62, 0.42, -0.55]; // sun in the west, late afternoon

/** Sky gradient, sun disc and haze band. */
export function drawSky(ctx, w, h, cam, time, stormFactor) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  const grey = clamp(stormFactor, 0, 1);
  const top = [26 + grey * 40, 92 - grey * 20, 158 - grey * 60];
  const mid = [126 - grey * 40, 178 - grey * 60, 216 - grey * 70];
  const hor = [222 - grey * 60, 236 - grey * 70, 242 - grey * 70];
  g.addColorStop(0, `rgb(${top[0]},${top[1]},${top[2]})`);
  g.addColorStop(0.55, `rgb(${mid[0]},${mid[1]},${mid[2]})`);
  g.addColorStop(0.78, `rgb(${hor[0]},${hor[1]},${hor[2]})`);
  g.addColorStop(1, `rgb(${hor[0]},${hor[1]},${hor[2]})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // sun: a warm disc with a soft halo, placed far along SUN_DIR
  const basis = cameraBasis(cam);
  const sd = SUN_DIR;
  const px = sd[0] * basis.right[0] + sd[1] * basis.right[1] + sd[2] * basis.right[2];
  const py = sd[0] * basis.up[0] + sd[1] * basis.up[1] + sd[2] * basis.up[2];
  const pz = sd[0] * basis.fwd[0] + sd[1] * basis.fwd[1] + sd[2] * basis.fwd[2];
  if (pz > 0.05) {
    const focal = (h * 0.5) / Math.tan((FOV_DEG * Math.PI) / 360);
    const sx = w / 2 + (px / pz) * focal;
    const sy = h / 2 - (py / pz) * focal;
    const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, 150);
    halo.addColorStop(0, 'rgba(255, 236, 180, 0.9)');
    halo.addColorStop(0.25, 'rgba(255, 214, 130, 0.45)');
    halo.addColorStop(1, 'rgba(255, 214, 130, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sx - 160, sy - 160, 320, 320);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(sx, sy, 17, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Sea: a projected plane at y=0 with a sun-glint lane. */
export function drawSea(ctx, project, w, h, cam, time) {
  const ext = WORLD_HALF + 400;
  const corners = [
    project(-ext, 0.2, -ext), project(ext, 0.2, -ext),
    project(ext, 0.2, ext), project(-ext, 0.2, ext),
  ];
  if (corners.some((c) => c === null)) {
    // camera looking up: flat sea below the horizon line
    const horizonY = h * 0.52 - cam.pitch * h * 1.4;
    const g = ctx.createLinearGradient(0, horizonY, 0, h);
    g.addColorStop(0, '#7fb0c8');
    g.addColorStop(1, '#1d5a80');
    ctx.fillStyle = g;
    ctx.fillRect(0, horizonY, w, h - horizonY);
    return;
  }
  const top = Math.min(...corners.map((c) => c.y));
  const bot = Math.max(...corners.map((c) => c.y));
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, '#8fbccd');
  g.addColorStop(0.5, '#3f88ab');
  g.addColorStop(1, '#1d5a80');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();

  // sun glint: a shimmering lane toward the sun azimuth
  const glintX = w * 0.5 + (SUN_DIR[0] * -1) * w * 0.22;
  const glint = ctx.createLinearGradient(glintX - 130, 0, glintX + 130, 0);
  glint.addColorStop(0, 'rgba(255, 240, 200, 0)');
  glint.addColorStop(0.5, 'rgba(255, 240, 200, 0.20)');
  glint.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.fillStyle = glint;
  ctx.fillRect(glintX - 130, top, 260, bot - top);
}

/** Precompute the terrain mesh (vertices + quantised colours) for a seed. */
export function makeTerrainMesh(seed) {
  const n = GRID_CELLS + 1;
  const verts = new Float32Array(n * n * 3);
  const cols = new Uint8Array(n * n * 3);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = -WORLD_HALF + i * CELL;
      const z = -WORLD_HALF + j * CELL;
      const y = heightAt(x, z, seed);
      const k = (j * n + i) * 3;
      verts[k] = x;
      verts[k + 1] = y;
      verts[k + 2] = z;
      const shade = y <= 0.5 ? 1 : shadeAt(x, z, seed);
      const c = terrainColor(x, z, y, seed);
      cols[k] = Math.min(255, Math.round(c[0] * shade));
      cols[k + 1] = Math.min(255, Math.round(c[1] * shade));
      cols[k + 2] = Math.min(255, Math.round(c[2] * shade));
    }
  }
  return { verts, cols, n };
}

const MAX_DRAW_DIST = 5200;

/** Draw the terrain mesh, far cells first, batched by colour bucket. */
export function drawTerrain(ctx, project, mesh, cam) {
  const { verts, cols, n } = mesh;
  const px = new Float32Array(n * n);
  const py = new Float32Array(n * n);
  const pz = new Float32Array(n * n);
  for (let v = 0; v < n * n; v += 1) {
    const p = project(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]);
    if (p === null) {
      pz[v] = -1;
    } else {
      px[v] = p.x;
      py[v] = p.y;
      pz[v] = p.z;
    }
  }
  const cells = [];
  for (let j = 0; j < GRID_CELLS; j += 1) {
    for (let i = 0; i < GRID_CELLS; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      const za = pz[a];
      const zb = pz[b];
      const zc = pz[c];
      const zd = pz[d];
      const vis = (za > 0 ? 1 : 0) + (zb > 0 ? 1 : 0) + (zc > 0 ? 1 : 0) + (zd > 0 ? 1 : 0);
      if (vis < 3) continue;
      // fully underwater: skip it so the blue sea plane shows instead of
      // the sand-coloured sea floor turning the whole ocean into desert
      if (verts[a * 3 + 1] < 0.5 && verts[b * 3 + 1] < 0.5 && verts[c * 3 + 1] < 0.5 && verts[d * 3 + 1] < 0.5) continue;
      const depth = (Math.max(za, 0) + Math.max(zb, 0) + Math.max(zc, 0) + Math.max(zd, 0)) / vis;
      if (depth > MAX_DRAW_DIST) continue;
      cells.push({ depth, a, b, c, d });
    }
  }
  cells.sort((m, o) => o.depth - m.depth);
  const buckets = new Map();
  for (const cell of cells) {
    const { a, b, c, d } = cell;
    // two triangles per quad; colour from the quad's first vertex
    const key = ((cols[a * 3] >> 3) << 10) | ((cols[a * 3 + 1] >> 3) << 5) | (cols[a * 3 + 2] >> 3);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { r: cols[a * 3], g: cols[a * 3 + 1], b: cols[a * 3 + 2], tris: [] };
      buckets.set(key, bucket);
    }
    bucket.tris.push(px[a], py[a], px[b], py[b], px[d], py[d]);
    bucket.tris.push(px[a], py[a], px[d], py[d], px[c], py[c]);
  }
  for (const bucket of buckets.values()) {
    ctx.fillStyle = `rgb(${bucket.r},${bucket.g},${bucket.b})`;
    ctx.beginPath();
    const t = bucket.tris;
    for (let i = 0; i < t.length; i += 6) {
      ctx.moveTo(t[i], t[i + 1]);
      ctx.lineTo(t[i + 2], t[i + 3]);
      ctx.lineTo(t[i + 4], t[i + 5]);
      ctx.closePath();
    }
    ctx.fill();
  }
}

/** Draw one runway strip: asphalt, centreline dashes, thresholds, edge lights. */
export function drawRunway(ctx, project, runway, time) {
  const sin = Math.sin(runway.heading);
  const cos = Math.cos(runway.heading);
  const fwd = [sin, -cos]; // (x, z) forward
  const rgt = [cos, sin];
  const corner = (along, across) => {
    const x = runway.x + fwd[0] * along + rgt[0] * across;
    const z = runway.z + fwd[1] * along + rgt[1] * across;
    return project(x, runway.elev + 0.4, z);
  };
  const L = runway.length / 2;
  const W = runway.width / 2;
  const p1 = corner(-L, -W);
  const p2 = corner(L, -W);
  const p3 = corner(L, W);
  const p4 = corner(-L, W);
  if (!p1 || !p2 || !p3 || !p4) return;
  ctx.fillStyle = '#33363b';
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.fill();
  // centreline dashes
  ctx.fillStyle = '#e8e8e8';
  for (let along = -L + 20; along < L - 10; along += 40) {
    const a = corner(along, -2.2);
    const b = corner(along + 18, -2.2);
    const c = corner(along + 18, 2.2);
    const d = corner(along, 2.2);
    if (!a || !b || !c || !d) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }
  // threshold bars at both ends
  ctx.fillStyle = '#f2f2f2';
  for (const end of [-1, 1]) {
    for (let off = -W + 5; off < W - 4; off += 9) {
      const a = corner(end * L - end * 12, off);
      const b = corner(end * L - end * 2, off);
      const c = corner(end * L - end * 2, off + 5);
      const d = corner(end * L - end * 12, off + 5);
      if (!a || !b || !c || !d) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // edge lights, amber, blinking gently
  const glow = 0.55 + 0.35 * Math.sin(time * 2.4);
  ctx.fillStyle = `rgba(255, 176, 66, ${glow.toFixed(2)})`;
  for (let along = -L; along <= L; along += 60) {
    for (const side of [-1, 1]) {
      const p = corner(along, side * (W + 2));
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.2, p.scale * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A simple box (hangar, terminal) projected from 8 corners. */
export function drawBox(ctx, project, x, y, z, w, h, d, heading, wall, roof) {
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  const local = (lx, ly, lz) => {
    const wx = x + lx * cos + lz * sin;
    const wz = z - lx * sin + lz * cos;
    return project(wx, y + ly, wz);
  };
  const hw = w / 2;
  const hd = d / 2;
  const c = [
    local(-hw, 0, -hd), local(hw, 0, -hd), local(hw, 0, hd), local(-hw, 0, hd),
    local(-hw, h, -hd), local(hw, h, -hd), local(hw, h, hd), local(-hw, h, hd),
  ];
  if (c.some((p) => p === null)) return;
  const quad = (a, b, cc, dd, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(c[a].x, c[a].y);
    ctx.lineTo(c[b].x, c[b].y);
    ctx.lineTo(c[cc].x, c[cc].y);
    ctx.lineTo(c[dd].x, c[dd].y);
    ctx.closePath();
    ctx.fill();
  };
  quad(0, 1, 5, 4, wall);
  quad(1, 2, 6, 5, wall);
  quad(4, 5, 6, 7, roof);
}

/** A glowing ring to fly through. `next` rings burn orange, others cyan. */
export function drawRing(ctx, project, ring, next, time) {
  const SEG = 26;
  // ring plane faces along its normal; build an orthonormal frame
  const n = ring.normal;
  const up0 = [0, 1, 0];
  const dot = n[0] * up0[0] + n[1] * up0[1] + n[2] * up0[2];
  let up = [up0[0] - n[0] * dot, up0[1] - n[1] * dot, up0[2] - n[2] * dot];
  const ul = Math.hypot(up[0], up[1], up[2]) || 1;
  up = [up[0] / ul, up[1] / ul, up[2] / ul];
  const right = [
    up[1] * n[2] - up[2] * n[1],
    up[2] * n[0] - up[0] * n[2],
    up[0] * n[1] - up[1] * n[0],
  ];
  const pts = [];
  for (let i = 0; i <= SEG; i += 1) {
    const t = (i / SEG) * Math.PI * 2;
    const px = ring.x + (Math.cos(t) * right[0] + Math.sin(t) * up[0]) * ring.radius;
    const py = ring.y + (Math.cos(t) * right[1] + Math.sin(t) * up[1]) * ring.radius;
    const pz = ring.z + (Math.cos(t) * right[2] + Math.sin(t) * up[2]) * ring.radius;
    pts.push(project(px, py, pz));
  }
  if (pts.every((p) => p === null)) return;
  const pulse = next ? 0.75 + 0.25 * Math.sin(time * 4) : 0.6;
  const col = next ? '255, 122, 26' : '64, 224, 255';
  const scales = pts.filter((p) => p !== null).map((p) => p.scale);
  const avgScale = scales.reduce((a, b) => a + b, 0) / scales.length;
  const trace = (width, style) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      if (p === null) {
        pen = false;
        continue;
      }
      if (!pen) {
        ctx.moveTo(p.x, p.y);
        pen = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.closePath();
    ctx.stroke();
  };
  trace(Math.max(3, avgScale * 1.6), `rgba(${col},${(0.22 * pulse).toFixed(2)})`);
  trace(Math.max(1.5, avgScale * 0.55), `rgba(${col},${pulse.toFixed(2)})`);
  // inner disc, faint
  ctx.fillStyle = `rgba(${col},0.07)`;
  ctx.beginPath();
  let pen = false;
  for (const p of pts) {
    if (p === null) continue;
    if (!pen) {
      ctx.moveTo(p.x, p.y);
      pen = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

/** A ground marker: pulsing circle on the terrain + a light beam + label. */
export function drawGroundMarker(ctx, project, x, z, seed, color, label, time, radius) {
  const y = heightAt(x, z, seed) + 1.5;
  const SEG = 24;
  const pts = [];
  for (let i = 0; i <= SEG; i += 1) {
    const t = (i / SEG) * Math.PI * 2;
    pts.push(project(x + Math.cos(t) * radius, heightAt(x + Math.cos(t) * radius, z + Math.sin(t) * radius, seed) + 1.5, z + Math.sin(t) * radius));
  }
  if (pts.some((p) => p !== null)) {
    ctx.fillStyle = `rgba(${color},0.22)`;
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      if (p === null) continue;
      if (!pen) {
        ctx.moveTo(p.x, p.y);
        pen = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
  }
  const top = project(x, y + 260, z);
  const base = project(x, y, z);
  if (top && base) {
    const beam = ctx.createLinearGradient(base.x, base.y, top.x, top.y);
    beam.addColorStop(0, `rgba(${color},0.18)`);
    beam.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = beam;
    const wdt = Math.max(2, base.scale * 1.2);
    ctx.fillRect(base.x - wdt / 2, top.y, wdt, base.y - top.y);
    const pulse = 0.7 + 0.3 * Math.sin(time * 3);
    ctx.fillStyle = `rgba(${color},${pulse.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(base.x, base.y - 14 * base.scale, Math.max(3, base.scale * 2.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(12, Math.round(base.scale * 6))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, base.x, top.y - 8);
  }
}

/** Clouds: soft billboards that drift slowly with the wind. */
export function drawClouds(ctx, project, clouds, time, stormFactor) {
  const items = [];
  for (const c of clouds) {
    const drift = time * c.drift;
    const p = project(c.x + drift, c.y, c.z);
    if (!p || p.z < 4) continue;
    items.push({ p, c });
  }
  items.sort((a, b) => b.p.z - a.p.z);
  for (const { p, c } of items) {
    const r = Math.max(6, c.r * p.scale);
    const grey = clamp(0.35 + stormFactor * 0.4, 0, 0.75);
    const base = Math.round(255 - grey * 90);
    ctx.fillStyle = `rgba(${base},${base},${Math.min(255, base + 8)},0.82)`;
    for (const [ox, oy, s] of [[-0.45, 0.1, 0.55], [0, -0.08, 0.75], [0.45, 0.08, 0.6], [0.15, 0.14, 0.5]]) {
      ctx.beginPath();
      ctx.ellipse(p.x + ox * r, p.y + oy * r, s * r, s * r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Rain streaks inside the storm: short slanted lines around the camera. */
export function drawRain(ctx, project, streaks) {
  ctx.strokeStyle = 'rgba(190, 210, 225, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const s of streaks) {
    const a = project(s.x, s.y, s.z);
    const b = project(s.x - 2, s.y - s.len, s.z);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

export { RUNWAYS, runwayFrame };
