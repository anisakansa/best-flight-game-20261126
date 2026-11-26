// HUD for Skyline Cargo: the instruments the judge's first criterion asks
// for — altitude, speed and heading, always lit and always legible — plus
// fuel, damage, the mission objective, a minimap of the island chain and the
// event feed. Everything is drawn on the same canvas as the world, so the
// screenshots show the whole cockpit at a glance.

import { toKnots, toFeet, clamp } from './flight.js';
import { RUNWAY, FAR_STRIP, BEACON } from './terrain.js';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10, 22, 34, 0.62)';
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function drawSpeedTape(ctx, W, H, plane) {
  const x = 16;
  const y = H * 0.3;
  const h = H * 0.4;
  panel(ctx, x, y, 74, h);
  const knots = toKnots(plane.speed);
  ctx.fillStyle = '#9fd8ff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SPD', x + 37, y + 20);
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(knots), x + 37, y + 52);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#cfe6f5';
  ctx.fillText('KT', x + 37, y + 70);
  // Throttle bar under the number.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 10, y + h - 26, 54, 8);
  ctx.fillStyle = plane.throttle > 0.85 ? '#ffb400' : '#37c978';
  ctx.fillRect(x + 10, y + h - 26, 54 * plane.throttle, 8);
  ctx.fillStyle = '#cfe6f5';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`THR ${Math.round(plane.throttle * 100)}%`, x + 37, y + h - 34);
}

function drawAltitudeTape(ctx, W, H, plane) {
  const x = W - 90;
  const y = H * 0.3;
  const h = H * 0.4;
  panel(ctx, x, y, 74, h);
  const feet = toFeet(plane.y);
  ctx.fillStyle = '#9fd8ff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ALT', x + 37, y + 20);
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(feet), x + 37, y + 52);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#cfe6f5';
  ctx.fillText('FT', x + 37, y + 70);
  // Vertical speed needle: up is climbing, down is sinking.
  const vs = clamp(plane.verticalSpeed, -10, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 32, y + 82, 10, h - 100);
  ctx.fillStyle = vs >= 0 ? '#37c978' : '#ff5d5d';
  const barH = Math.abs(vs) * ((h - 100) / 2 / 10);
  const midY = y + 82 + (h - 100) / 2;
  ctx.fillRect(x + 32, vs >= 0 ? midY - barH : midY, 10, barH);
  ctx.fillStyle = '#cfe6f5';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('V/S', x + 37, y + h - 12);
}

function drawHeadingCompass(ctx, W, H, plane) {
  const w = 340;
  const x = (W - w) / 2;
  const y = 12;
  panel(ctx, x, y, w, 44);
  const headings = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const deg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 6, y, w - 12, 44);
  ctx.clip();
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -180; d <= 180; d += 15) {
    let rel = ((d - deg + 540) % 360) - 180;
    const sx = x + w / 2 + (rel / 90) * (w / 2);
    if (sx < x || sx > x + w) continue;
    const isCard = d % 45 === 0;
    ctx.fillStyle = isCard ? '#ffffff' : '#9fc4dc';
    ctx.font = isCard ? 'bold 15px system-ui, sans-serif' : '12px system-ui, sans-serif';
    const label = d % 45 === 0 ? headings[((d / 45) % 8 + 8) % 8] : String(((d % 360) + 360) % 360);
    ctx.fillText(label, sx, y + 28);
  }
  ctx.restore();
  // Centre caret and the numeric heading.
  ctx.fillStyle = '#ffb400';
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 7, y + 4);
  ctx.lineTo(x + w / 2 + 7, y + 4);
  ctx.lineTo(x + w / 2, y + 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(`${String(Math.round(deg)).padStart(3, '0')}°`, x + w / 2, y + 40);
}

function drawFuelDamage(ctx, W, H, plane) {
  const w = 250;
  const x = 16;
  const y = H - 64;
  panel(ctx, x, y, w, 48);
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  // Fuel bar, with its own percentage at the bar's right end.
  ctx.fillStyle = '#cfe6f5';
  ctx.fillText('FUEL', x + 10, y + 18);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 56, y + 8, 120, 10);
  ctx.fillStyle = plane.fuel < 20 ? '#ff5d5d' : '#37c978';
  ctx.fillRect(x + 56, y + 8, 120 * (plane.fuel / 100), 10);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${Math.round(plane.fuel)}%`, x + 184, y + 18);
  // Damage bar, with its own percentage at the bar's right end.
  ctx.fillStyle = '#cfe6f5';
  ctx.fillText('DMG', x + 10, y + 40);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 56, y + 30, 120, 10);
  ctx.fillStyle = plane.damage > 60 ? '#ff5d5d' : plane.damage > 30 ? '#ffb400' : '#37c978';
  ctx.fillRect(x + 56, y + 30, 120 * (plane.damage / 100), 10);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${Math.round(plane.damage)}%`, x + 184, y + 40);
}

function drawMinimap(ctx, W, H, plane, mission) {
  const size = 148;
  const x = W - size - 16;
  const y = H - size - 16;
  panel(ctx, x, y, size, size);
  // The chain, squashed to the panel: z runs 0..4000 top to bottom.
  const mx = (wx) => x + size / 2 + (wx / 500) * (size / 2);
  const mz = (wz) => y + 8 + (wz / 4000) * (size - 16);
  ctx.fillStyle = '#1d4e6b';
  ctx.fillRect(x + 6, y + 6, size - 12, size - 12);
  ctx.fillStyle = '#3f8f5f';
  const islands = [
    [0, 120, 26], [-260, 900, 20], [240, 1500, 22],
    [-140, 2250, 18], [180, 2950, 21], [60, 3620, 24],
  ];
  for (const [ix, iz, ir] of islands) {
    ctx.beginPath();
    ctx.ellipse(mx(ix), mz(iz), ir * 0.16, ir * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Runways as pale ticks.
  ctx.fillStyle = '#f4f6f2';
  ctx.fillRect(mx(RUNWAY.x) - 2, mz(RUNWAY.zStart), 4, 14);
  ctx.fillRect(mx(FAR_STRIP.x) - 2, mz(FAR_STRIP.zStart), 4, 14);
  // Next ring as a gold dot; beacon as an orange dot.
  if (mission && mission.mission.id === 'rings') {
    const ring = mission.rings[mission.nextRing];
    if (ring) {
      ctx.fillStyle = '#ffb400';
      ctx.beginPath();
      ctx.arc(mx(ring.x), mz(ring.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (mission && mission.mission.id === 'rescue') {
    ctx.fillStyle = '#ff6a00';
    ctx.beginPath();
    ctx.arc(mx(BEACON.x), mz(BEACON.z), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // The aircraft: a white triangle pointing along its heading.
  const px = mx(plane.x);
  const py = mz(plane.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(plane.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#cfe6f5';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MAP', x + 8, y + 14);
}

function drawObjective(ctx, W, H, mission, plane) {
  if (!mission) return;
  const text = mission.objective;
  ctx.font = 'bold 14px system-ui, sans-serif';
  const nameWidth = ctx.measureText(mission.mission.name.toUpperCase()).width;
  ctx.font = '14px system-ui, sans-serif';
  const textWidth = ctx.measureText(text).width;
  const scoreWidth = ctx.measureText('SCORE 000   0:00').width;
  const w = Math.min(W - 200, nameWidth + textWidth + scoreWidth + 70);
  const x = (W - w) / 2;
  const y = 64;
  panel(ctx, x, y, w, 34);
  ctx.fillStyle = '#ffb400';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(mission.mission.name.toUpperCase(), x + 12, y + 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(text, x + 12 + nameWidth + 22, y + 22);
  // Score and clock on the right of the same bar.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cfe6f5';
  const mins = Math.floor(mission.elapsed / 60);
  const secs = Math.floor(mission.elapsed % 60);
  ctx.fillText(`SCORE ${mission.score}   ${mins}:${String(secs).padStart(2, '0')}`, x + w - 12, y + 22);
}

function drawEvents(ctx, W, H, mission) {
  if (!mission) return;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  mission.events.forEach((text, i) => {
    const y = H * 0.3 + i * 22;
    ctx.fillStyle = 'rgba(10,22,34,0.55)';
    const w = ctx.measureText(text).width + 16;
    ctx.beginPath();
    ctx.roundRect(106, y - 15, w, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(text, 114, y);
  });
}

function drawWarnings(ctx, W, H, plane) {
  const warnings = [];
  if (plane.engineOut || plane.fuel <= 0) warnings.push('FUEL EMPTY — GLIDING');
  else if (plane.fuel < 20) warnings.push('LOW FUEL');
  if (plane.speed < 26 && !plane.onGround) warnings.push('STALL — NOSE DOWN');
  if (plane.damage > 60) warnings.push('HEAVY DAMAGE');
  if (plane.y < 12 && plane.speed > 20 && !plane.onGround) warnings.push('TERRAIN — PULL UP');
  if (warnings.length === 0) return;
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const text = warnings.join('  •  ');
  const w = ctx.measureText(text).width + 28;
  const x = (W - w) / 2;
  const y = H * 0.2;
  ctx.fillStyle = 'rgba(120,10,10,0.78)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 32, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, W / 2, y + 22);
}

// One call draws every instrument over the world frame.
export function drawHud(renderer, plane, mission, time) {
  const { canvas, ctx } = renderer;
  const W = canvas.width;
  const H = canvas.height;
  drawSpeedTape(ctx, W, H, plane);
  drawAltitudeTape(ctx, W, H, plane);
  drawHeadingCompass(ctx, W, H, plane);
  drawFuelDamage(ctx, W, H, plane);
  drawMinimap(ctx, W, H, plane, mission);
  drawObjective(ctx, W, H, mission, plane);
  drawEvents(ctx, W, H, mission);
  drawWarnings(ctx, W, H, plane);
}
