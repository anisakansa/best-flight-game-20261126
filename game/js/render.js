// Chase-view renderer for Skyline Cargo: sky, sea, islands, runway, rings
// and the aircraft, drawn on one canvas with a small perspective projector.
// The camera sits behind and just above the aircraft and looks along its
// heading, so the pilot always sees the nose, the horizon and the next
// objective. Terrain is drawn as depth slices, far to near, each strip
// coloured by the height it stands on — one style across sky and ground.

import { terrainColor, RUNWAY, FAR_STRIP, BEACON } from './terrain.js';

const VIEW_DISTANCE = 260;

export function makeRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

// Project a world point into screen space. Returns null behind the camera.
export function projectPoint(cam, focal, horizonY, cx, x, y, z) {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const cosH = Math.cos(cam.heading);
  const sinH = Math.sin(cam.heading);
  const rx = dx * cosH - dz * sinH;
  const rz = dx * sinH + dz * cosH;
  if (rz < 1.5) return null;
  return {
    sx: cx + (rx / rz) * focal,
    sy: horizonY - (dy / rz) * focal,
    depth: rz,
    scale: focal / rz,
  };
}

function drawSky(ctx, W, H, horizonY, heading, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
  sky.addColorStop(0, '#2f6fd0');
  sky.addColorStop(0.55, '#7fb2e8');
  sky.addColorStop(1, '#d8ecf7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizonY + 40);

  // Sun: a fixed direction in the world, so it swings with the heading.
  const sunAngle = heading + 0.85;
  const sunX = W * 0.5 + Math.sin(sunAngle) * W * 0.42;
  const sunY = H * 0.13;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
  glow.addColorStop(0, 'rgba(255,244,200,0.95)');
  glow.addColorStop(0.35, 'rgba(255,226,140,0.55)');
  glow.addColorStop(1, 'rgba(255,226,140,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 95, sunY - 95, 190, 190);
  ctx.fillStyle = '#fff6cf';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 17, 0, Math.PI * 2);
  ctx.fill();
}

function drawTerrainSlices(ctx, W, H, sampleHeight, cam, focal, horizonY, time) {
  const cx = W / 2;
  const cosH = Math.cos(cam.heading);
  const sinH = Math.sin(cam.heading);
  const colStep = 6;
  const cols = Math.ceil(W / colStep) + 1;
  // Depth rows: dense near the camera, sparse far away. Denser than the
  // first version, so colour-band edges step in small increments.
  const rows = [];
  let rz = 5;
  while (rz < VIEW_DISTANCE) {
    rows.push(rz);
    rz += 2 + rz * 0.03;
  }
  // Far rows first: nearer strips paint over them. Each row is drawn as one
  // smooth path per colour band, its top edge following the projected
  // heights column by column, so the bands follow the land's contours and
  // the silhouette never steps.
  for (let r = rows.length - 1; r >= 0; r -= 1) {
    const depth = rows[r];
    const top = new Float32Array(cols);
    const band = new Uint8Array(cols);
    const heights = new Float32Array(cols);
    for (let c = 0; c < cols; c += 1) {
      const sx = c * colStep;
      const rx = ((sx - cx) / focal) * depth;
      const wx = cam.x + rx * cosH + depth * sinH;
      const wz = cam.z - rx * sinH + depth * cosH;
      const h = sampleHeight(wx, wz);
      heights[c] = h;
      band[c] = h < 0.5 ? 0 : h < 3.5 ? 1 : h < 16 ? 2 : h < 30 ? 3 : h < 48 ? 4 : 5;
      top[c] = horizonY - ((h - cam.y) / depth) * focal;
    }
    let c = 0;
    while (c < cols - 1) {
      const b = band[c];
      let end = c + 1;
      // Split on a band change or a steep height change, so a long slope
      // grades through the colour ramp instead of painting one flat tone.
      while (
        end < cols &&
        band[end] === b &&
        Math.abs(heights[end] - heights[c]) < 4
      ) end += 1;
      const slope = (heights[Math.min(end, cols - 1)] - heights[c]) / Math.max(1, end - c);
      const shade = 1 - Math.max(-0.22, Math.min(0.22, slope * 0.05));
      ctx.fillStyle = terrainColor(heights[(c + end - 1) >> 1], shade);
      ctx.beginPath();
      ctx.moveTo(c * colStep, top[c]);
      for (let k = c + 1; k < end; k += 1) ctx.lineTo(k * colStep, top[k]);
      ctx.lineTo((end - 1) * colStep, H);
      ctx.lineTo(c * colStep, H);
      ctx.closePath();
      ctx.fill();
      c = end;
    }
  }
}

function drawRunwayStrip(ctx, cam, focal, horizonY, cx, strip, colour) {
  const half = strip.halfWidth;
  const corners = [
    [strip.x - half, 2.5, strip.zStart],
    [strip.x + half, 2.5, strip.zStart],
    [strip.x + half, 2.5, strip.zEnd],
    [strip.x - half, 2.5, strip.zEnd],
  ];
  const pts = corners.map(([x, y, z]) => projectPoint(cam, focal, horizonY, cx, x, y, z));
  if (pts.some((p) => p === null)) return;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].sx, pts[i].sy);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes: projected one dash at a time so they shrink with
  // distance exactly like the strip does.
  ctx.fillStyle = '#f4f6f2';
  for (let z = strip.zStart + 12; z < strip.zEnd - 8; z += 26) {
    const a = projectPoint(cam, focal, horizonY, cx, strip.x - 0.8, 2.7, z);
    const b = projectPoint(cam, focal, horizonY, cx, strip.x + 0.8, 2.7, z);
    const d = projectPoint(cam, focal, horizonY, cx, strip.x + 0.8, 2.7, z + 13);
    const e = projectPoint(cam, focal, horizonY, cx, strip.x - 0.8, 2.7, z + 13);
    if (!a || !b || !d || !e) continue;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(d.sx, d.sy);
    ctx.lineTo(e.sx, e.sy);
    ctx.closePath();
    ctx.fill();
  }
  // Threshold bars at the near end of the strip.
  ctx.fillStyle = '#ffffff';
  for (let i = -2; i <= 2; i += 1) {
    if (i === 0) continue;
    const a = projectPoint(cam, focal, horizonY, cx, strip.x + i * 3 - 1.1, 2.7, strip.zStart + 6);
    const b = projectPoint(cam, focal, horizonY, cx, strip.x + i * 3 + 1.1, 2.7, strip.zStart + 6);
    const d = projectPoint(cam, focal, horizonY, cx, strip.x + i * 3 + 1.1, 2.7, strip.zStart + 20);
    const e = projectPoint(cam, focal, horizonY, cx, strip.x + i * 3 - 1.1, 2.7, strip.zStart + 20);
    if (!a || !b || !d || !e) continue;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(d.sx, d.sy);
    ctx.lineTo(e.sx, e.sy);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRingGate(ctx, cam, focal, horizonY, cx, ring, isNext, time) {
  const p = projectPoint(cam, focal, horizonY, cx, ring.x, ring.y, ring.z);
  if (!p) return;
  const radius = ring.radius * p.scale;
  if (radius < 2) return;
  const pulse = isNext ? 1 + Math.sin(time * 4) * 0.08 : 1;
  const r = radius * pulse;
  ctx.save();
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.strokeStyle = isNext ? '#ffb400' : '#37c978';
  ctx.shadowColor = isNext ? 'rgba(255,180,0,0.8)' : 'rgba(55,201,120,0.5)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.ellipse(p.sx, p.sy, r, r * 0.94, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = isNext ? '#7a5200' : '#14532d';
  ctx.font = `bold ${Math.max(11, Math.round(r * 0.42))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(ring.index + 1), p.sx, p.sy);
}

function drawBeaconSmoke(ctx, cam, focal, horizonY, cx, time) {
  const base = projectPoint(cam, focal, horizonY, cx, BEACON.x, BEACON.y, BEACON.z);
  if (!base) return;
  for (let i = 0; i < 7; i += 1) {
    const rise = ((time * 6 + i * 9) % 63) + i * 2;
    const p = projectPoint(cam, focal, horizonY, cx, BEACON.x + Math.sin(i * 2.4) * 3, BEACON.y + rise, BEACON.z);
    if (!p) continue;
    const radius = Math.max(2, (4 + i * 2.2) * p.scale * 0.9);
    ctx.fillStyle = `rgba(90,90,96,${0.5 - i * 0.05})`;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  // Orange marker ring on the ground where the crate must land.
  const ground = projectPoint(cam, focal, horizonY, cx, BEACON.x, 3, BEACON.z);
  if (ground) {
    ctx.strokeStyle = '#ff6a00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(ground.sx, ground.sy, 55 * ground.scale * 0.5, 55 * ground.scale * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawClouds(ctx, clouds, cam, focal, horizonY, cx) {
  for (const cloud of clouds) {
    const p = projectPoint(cam, focal, horizonY, cx, cloud.x, cloud.y, cloud.z);
    if (!p || p.depth < 4) continue;
    const s = cloud.size * p.scale * 0.5;
    if (s < 3) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, s, s * 0.36, 0, 0, Math.PI * 2);
    ctx.ellipse(p.sx - s * 0.5, p.sy + s * 0.1, s * 0.6, s * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(p.sx + s * 0.5, p.sy + s * 0.08, s * 0.65, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The aircraft itself, drawn from behind: fuselage, wings, tail and nav
// lights, banking with the roll and nodding with the pitch. It is drawn
// last so it always sits in front of the world.
function drawAircraftSprite(ctx, W, H, plane, time) {
  const cx = W / 2;
  const cy = H * 0.74 - plane.pitch * 260;
  const bob = Math.sin(time * 1.7) * 1.5;
  const size = 1 + Math.min(0.25, plane.speed / 400);
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.rotate(-plane.roll * 0.85);
  ctx.scale(size, size);
  // Wings: a warm coral red with a cream stripe, spanning the frame.
  ctx.fillStyle = '#e4572e';
  ctx.beginPath();
  ctx.moveTo(-118, 6);
  ctx.quadraticCurveTo(-70, -12, -16, -4);
  ctx.lineTo(16, -4);
  ctx.quadraticCurveTo(70, -12, 118, 6);
  ctx.quadraticCurveTo(70, 14, 16, 10);
  ctx.lineTo(-16, 10);
  ctx.quadraticCurveTo(-70, 14, -118, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f6ead8';
  ctx.fillRect(-104, -2, 208, 5);
  // Fuselage: cream body with a teal cheatline, tapering to the tail.
  ctx.fillStyle = '#f6ead8';
  ctx.beginPath();
  ctx.moveTo(-13, -58);
  ctx.quadraticCurveTo(0, -66, 13, -58);
  ctx.lineTo(10, 34);
  ctx.quadraticCurveTo(0, 42, -10, 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#17817b';
  ctx.fillRect(-12, -18, 24, 7);
  // Tail fin and stabiliser.
  ctx.fillStyle = '#17817b';
  ctx.beginPath();
  ctx.moveTo(-4, -56);
  ctx.lineTo(0, -86);
  ctx.lineTo(7, -56);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e4572e';
  ctx.fillRect(-34, -52, 68, 9);
  // Cockpit glass catching the sun.
  ctx.fillStyle = '#274b63';
  ctx.beginPath();
  ctx.ellipse(0, -44, 8, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-3, -48, 3, 5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Nav lights: red on the left wingtip, green on the right.
  ctx.fillStyle = '#ff2e2e';
  ctx.beginPath();
  ctx.arc(-116, 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22dd55';
  ctx.beginPath();
  ctx.arc(116, 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// One full frame: sky, clouds, terrain, runway, rings, beacon, aircraft.
export function renderChaseView(renderer, plane, world, time) {
  const { canvas, ctx } = renderer;
  const W = canvas.width;
  const H = canvas.height;
  const focal = H * 1.05;
  const horizonY = H * 0.44 - plane.pitch * H * 1.1;
  const cam = {
    x: plane.x,
    y: plane.y + 3.4,
    z: plane.z - 10,
    heading: plane.heading,
  };
  drawSky(ctx, W, H, horizonY, plane.heading, time);
  drawClouds(ctx, world.clouds, cam, focal, horizonY, W / 2);
  const sampleHeight = world.heightGrid ? world.heightGrid.at : world.terrain.heightAt;
  drawTerrainSlices(ctx, W, H, sampleHeight, cam, focal, horizonY, time);
  drawRunwayStrip(ctx, cam, focal, horizonY, W / 2, RUNWAY, '#3a3f46');
  drawRunwayStrip(ctx, cam, focal, horizonY, W / 2, FAR_STRIP, '#3a3f46');
  if (world.mission && world.mission.mission.id === 'rings') {
    for (const ring of world.mission.rings) {
      drawRingGate(ctx, cam, focal, horizonY, W / 2, ring, ring.index === world.mission.nextRing, time);
    }
  }
  if (world.mission && world.mission.mission.id === 'rescue') {
    drawBeaconSmoke(ctx, cam, focal, horizonY, W / 2, time);
  }
  drawAircraftSprite(ctx, W, H, plane, time);
}
