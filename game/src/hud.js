// The HUD for Tradewind Courier: glass instruments that look flown, not
// drawn. Compass strip, altitude and airspeed tapes, throttle, fuel and
// damage, the attitude ball, the pitch ladder and the mission panel — all
// canvas, all lit in cyan and amber against the sky.

import { knots, feet } from './flight-physics.js';
import { clamp } from './rng.js';
import { targetBearing, targetDistance, objectiveText } from './missions.js';

const CYAN = '#7fe7ff';
const AMBER = '#ffb042';
const GLASS = 'rgba(8, 26, 38, 0.55)';
const GLASS_EDGE = 'rgba(127, 231, 255, 0.35)';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = GLASS;
  ctx.strokeStyle = GLASS_EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
}

function compassLabel(deg) {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  if (d === 0) return 'N';
  if (d === 90) return 'E';
  if (d === 180) return 'S';
  if (d === 270) return 'W';
  return String(d).padStart(3, '0');
}

/** Compass strip across the top, with the target bearing caret. */
export function drawCompass(ctx, w, heading, targetHeading) {
  const deg = ((-heading * 180) / Math.PI + 360) % 360;
  const cx = w / 2;
  const y = 14;
  const pxPerDeg = 3.2;
  ctx.save();
  ctx.fillStyle = GLASS;
  ctx.fillRect(cx - 210, y - 4, 420, 34);
  ctx.strokeStyle = GLASS_EDGE;
  ctx.strokeRect(cx - 210, y - 4, 420, 34);
  ctx.beginPath();
  ctx.rect(cx - 210, y - 4, 420, 34);
  ctx.clip();
  ctx.fillStyle = CYAN;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  for (let off = -60; off <= 60; off += 5) {
    const d = deg + off;
    const x = cx + off * pxPerDeg;
    const label = compassLabel(d);
    if (off % 15 === 0) {
      ctx.fillRect(x - 0.5, y + 16, 1, 8);
      ctx.fillText(label, x, y + 13);
    } else {
      ctx.fillRect(x - 0.5, y + 20, 1, 4);
    }
  }
  ctx.restore();
  // heading readout
  ctx.fillStyle = '#0a1c28';
  ctx.fillRect(cx - 26, y - 4, 52, 15);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(compassLabel(deg), cx, y + 8);
  // centre caret
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx - 6, y + 30);
  ctx.lineTo(cx + 6, y + 30);
  ctx.lineTo(cx, y + 24);
  ctx.closePath();
  ctx.fill();
  // target bearing diamond
  if (targetHeading !== null && targetHeading !== undefined) {
    let diff = (targetHeading - heading) * 180 / Math.PI;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    if (Math.abs(diff) < 62) {
      const tx = cx + diff * pxPerDeg;
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.moveTo(tx, y + 36);
      ctx.lineTo(tx - 5, y + 30);
      ctx.lineTo(tx + 5, y + 30);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Vertical tape: scrolling numbers with the current value boxed. */
function drawTape(ctx, x, y, h, value, step, unit, format, color) {
  panel(ctx, x - 34, y - h / 2 - 14, 68, h + 28);
  const pxPerUnit = (h - 20) / (step * 8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 34, y - h / 2 - 14, 68, h + 28);
  ctx.clip();
  ctx.fillStyle = 'rgba(200, 230, 240, 0.75)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  const base = Math.floor(value / step) * step;
  for (let v = base - step * 4; v <= base + step * 4; v += step) {
    const yy = y - (v - value) * pxPerUnit;
    if (yy < y - h / 2 || yy > y + h / 2) continue;
    ctx.fillText(format(v), x + 24, yy + 4);
    ctx.fillRect(x - 6, yy - 0.5, 6, 1);
  }
  ctx.restore();
  // current value box
  ctx.fillStyle = '#0a1c28';
  ctx.fillRect(x - 34, y - 11, 68, 22);
  ctx.strokeStyle = color;
  ctx.strokeRect(x - 34, y - 11, 68, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(format(value) + unit, x, y + 5);
}

/** Pitch ladder + flight path marker across the centre of the screen. */
export function drawFlightPath(ctx, w, h, ac) {
  const cx = w / 2;
  const cy = h * 0.52;
  const pxPerDeg = 5.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-ac.roll);
  const pitchPx = (ac.pitch * 180) / Math.PI * pxPerDeg;
  ctx.translate(0, pitchPx);
  ctx.strokeStyle = 'rgba(127, 231, 255, 0.75)';
  ctx.lineWidth = 1.4;
  ctx.fillStyle = 'rgba(127, 231, 255, 0.85)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  for (const deg of [-15, -10, -5, 5, 10, 15]) {
    const y = -deg * pxPerDeg;
    const len = deg % 10 === 0 ? 46 : 26;
    ctx.beginPath();
    ctx.moveTo(-len, y);
    ctx.lineTo(-len + 14, y);
    ctx.moveTo(len - 14, y);
    ctx.lineTo(len, y);
    ctx.stroke();
    if (deg % 10 === 0) ctx.fillText(String(Math.abs(deg)), len + 4, y + 4);
  }
  // horizon line
  ctx.strokeStyle = 'rgba(255, 176, 66, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-130, 0);
  ctx.lineTo(-60, 0);
  ctx.moveTo(60, 0);
  ctx.lineTo(130, 0);
  ctx.stroke();
  ctx.restore();

  // flight path marker: circle with wings at screen centre
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.moveTo(cx - 24, cy);
  ctx.lineTo(cx - 13, cy);
  ctx.moveTo(cx + 13, cy);
  ctx.lineTo(cx + 24, cy);
  ctx.moveTo(cx, cy - 11);
  ctx.lineTo(cx, cy - 4);
  ctx.stroke();
}

/** Attitude ball: a small circular artificial horizon, bottom right. */
export function drawAttitude(ctx, x, y, r, ac) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-ac.roll);
  const pitchPx = (ac.pitch * 180) / Math.PI * (r / 45);
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(-r, -r - pitchPx, r * 2, r + pitchPx);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-r, -pitchPx, r * 2, r + pitchPx);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, -pitchPx);
  ctx.lineTo(r, -pitchPx);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = GLASS_EDGE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // fixed wings
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - r + 4, y);
  ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + r - 4, y);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ATT', x, y + r + 12);
}

/** Throttle, fuel and damage bars, bottom left. */
export function drawEngine(ctx, x, y, ac) {
  panel(ctx, x, y, 220, 86);
  ctx.fillStyle = '#cfe8f2';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('THR', x + 10, y + 18);
  ctx.fillText('FUEL', x + 10, y + 42);
  ctx.fillText('DMG', x + 10, y + 66);
  const bar = (yy, frac, color) => {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + 56, yy - 9, 120, 12);
    ctx.fillStyle = color;
    ctx.fillRect(x + 56, yy - 9, 120 * clamp(frac, 0, 1), 12);
  };
  bar(y + 9, ac.throttle, CYAN);
  const fuelCol = ac.fuel < 25 ? '#ff5a3c' : '#59d867';
  bar(y + 33, ac.fuel / 100, fuelCol);
  bar(y + 57, ac.damage / 100, '#ff5a3c');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(ac.throttle * 100)}%`, x + 210, y + 18);
  ctx.fillText(`${Math.round(ac.fuel)}%`, x + 210, y + 42);
  ctx.fillText(`${Math.round(ac.damage)}%`, x + 210, y + 66);
  if (ac.engineOut) {
    ctx.fillStyle = '#ff5a3c';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ENGINE OUT — GLIDE!', x + 10, y + 82);
  }
}

/** Mission panel, top left: name, objective, target, timer, score. */
export function drawMissionPanel(ctx, x, y, mission, ac) {
  const meta = mission.meta;
  panel(ctx, x, y, 320, 96);
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(meta.name, x + 12, y + 20);
  ctx.fillStyle = '#dceef5';
  ctx.font = '12px monospace';
  ctx.fillText(objectiveText(mission), x + 12, y + 40);
  const t = currentTargetInfo(mission, ac);
  if (t) {
    ctx.fillStyle = CYAN;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${t.label}  ${t.dist}  ${t.brg}`, x + 12, y + 60);
  }
  ctx.fillStyle = '#dceef5';
  ctx.font = '12px monospace';
  const mm = Math.floor(mission.elapsed / 60);
  const ss = Math.floor(mission.elapsed % 60).toString().padStart(2, '0');
  ctx.fillText(`TIME ${mm}:${ss}   SCORE ${mission.score}`, x + 12, y + 82);
}

function currentTargetInfo(mission, ac) {
  if (mission.id === 'free') return null;
  const bearing = targetBearing(mission, ac);
  let diff = (bearing - ac.heading) * 180 / Math.PI;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  const d = targetDistance(mission, ac);
  const dist = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
  const brg = diff >= 0 ? `R${Math.round(diff)}°` : `L${Math.round(-diff)}°`;
  const label = mission.id === 'rings'
    ? `RING ${mission.ringIndex + 1}/6`
    : mission.id === 'landing' ? 'KAIMANA'
    : mission.id === 'drop' ? (mission.dropsLeft > 0 ? 'DROP ZONE' : 'HOME')
    : 'BEACON';
  return { label, dist, brg };
}

/** Centre-top message banner. */
export function drawBanner(ctx, w, text, age) {
  if (!text || age > 4) return;
  const alpha = age > 3 ? 1 - (age - 3) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 20px monospace';
  const tw = ctx.measureText(text).width;
  const x = (w - tw) / 2 - 18;
  panel(ctx, x, 58, tw + 36, 34);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, 81);
  ctx.restore();
}

/** Full HUD pass. */
export function drawHud(ctx, w, h, ac, mission, time) {
  const heading = ac.heading;
  const tb = mission.id === 'free' ? null : targetBearing(mission, ac);
  drawCompass(ctx, w, heading, tb);
  drawTape(ctx, 56, h * 0.44, 220, feet(ac.y), 500, ' ft', (v) => String(Math.round(v)), CYAN);
  drawTape(ctx, w - 56, h * 0.44, 220, knots(ac.speed), 20, ' kt', (v) => String(Math.round(v)), CYAN);
  // vertical speed under the altimeter
  ctx.fillStyle = '#dceef5';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  const vs = ac.verticalSpeed * 196.85; // ft/min
  ctx.fillText(`VS ${vs >= 0 ? '+' : ''}${Math.round(vs)}`, 56, h * 0.44 + 140);
  drawFlightPath(ctx, w, h, ac);
  drawAttitude(ctx, w - 84, h - 84, 44, ac);
  drawEngine(ctx, 16, h - 108, ac);
  drawMissionPanel(ctx, 16, 16, mission, ac);
  drawBanner(ctx, w, mission.message, mission.messageAge);
  // stall warning
  if (ac.speed < 26 && !ac.onGround) {
    const blink = Math.sin(time * 10) > 0;
    if (blink) {
      ctx.fillStyle = '#ff5a3c';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STALL — NOSE DOWN, POWER UP', w / 2, h * 0.3);
    }
  }
}
