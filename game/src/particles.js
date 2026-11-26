// Particles for Tradewind Courier: exhaust smoke, wingtip spray in the
// storm, ring bursts and the crash fireball. All particles live in world
// space and are drawn as projected billboards; their motion is integrated
// on the same fixed step as the physics.

import { makeRng } from './rng.js';

export function makeParticles(seed) {
  return { list: [], rng: makeRng(seed ^ 0x99e1) };
}

/** Spawn `n` particles at a world point with a velocity spread. */
export function spawnBurst(ps, x, y, z, opts) {
  const o = opts ?? {};
  const n = o.count ?? 12;
  const spread = o.spread ?? 6;
  const up = o.up ?? 2;
  const life = o.life ?? 1.2;
  const size = o.size ?? 3;
  const color = o.color ?? '255,255,255';
  for (let i = 0; i < n; i += 1) {
    const a = ps.rng() * Math.PI * 2;
    const sp = ps.rng() * spread;
    ps.list.push({
      x, y, z,
      vx: Math.cos(a) * sp + (o.vx ?? 0),
      vy: up + ps.rng() * spread * 0.5,
      vz: Math.sin(a) * sp + (o.vz ?? 0),
      age: 0,
      life: life * (0.6 + ps.rng() * 0.8),
      size: size * (0.7 + ps.rng() * 0.6),
      color,
      grow: o.grow ?? 1.6,
      fade: o.fade ?? 1,
    });
  }
}

export function spawnSmoke(ps, x, y, z, vx, vy, vz) {
  ps.list.push({
    x, y, z, vx, vy, vz,
    age: 0, life: 0.9, size: 2.2, color: '200,200,205', grow: 2.4, fade: 0.7,
  });
}

export function spawnFireball(ps, x, y, z) {
  spawnBurst(ps, x, y, z, { count: 42, spread: 16, up: 8, life: 1.6, size: 5, color: '255,140,40', grow: 2.2 });
  spawnBurst(ps, x, y, z, { count: 26, spread: 9, up: 5, life: 2.4, size: 7, color: '60,60,64', grow: 3.2, fade: 0.6 });
}

/** Advance all particles one fixed step. */
export function stepParticles(ps, dt) {
  for (let i = ps.list.length - 1; i >= 0; i -= 1) {
    const p = ps.list[i];
    p.age += dt;
    if (p.age >= p.life) {
      ps.list.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= 1.5 * dt;
    p.vx *= 0.985;
    p.vz *= 0.985;
  }
  if (ps.list.length > 420) ps.list.splice(0, ps.list.length - 420);
}

/** Draw particles as soft projected circles, far ones first. */
export function drawParticles(ctx, project, ps) {
  const items = [];
  for (const p of ps.list) {
    const pr = project(p.x, p.y, p.z);
    if (!pr || pr.z < 3) continue;
    items.push({ pr, p });
  }
  items.sort((a, b) => b.pr.z - a.pr.z);
  for (const { pr, p } of items) {
    const t = p.age / p.life;
    const alpha = (1 - t) * p.fade * 0.55;
    const r = Math.max(1, p.size * pr.scale * (1 + t * p.grow));
    ctx.fillStyle = `rgba(${p.color},${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
