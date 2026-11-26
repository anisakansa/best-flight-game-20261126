// The aircraft itself: a twin-turboprop island courier, drawn as a built
// machine, not a pasted sprite — fuselage, wings with dihedral, tail, a
// spinning prop disc, cockpit glass and navigation lights. The renderer draws
// it in screen space, banked with the aircraft's roll; the shadow is the
// aircraft's projection onto the terrain below.

import { heightAt } from './terrain.js';

/** Draw the aircraft's shadow on the terrain under it. */
export function drawAircraftShadow(ctx, project, ac, seed) {
  const ground = heightAt(ac.x, ac.z, seed);
  const p = project(ac.x, ground + 0.6, ac.z);
  if (!p || p.z < 4) return;
  const agl = Math.max(0, ac.y - ground);
  const scale = Math.max(0.35, 1 - agl / 900);
  const size = p.scale * 26 * scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-ac.roll * 0.4);
  ctx.fillStyle = `rgba(8, 18, 26, ${0.34 * scale})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 1.15, size * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw the chase-view aircraft at screen position (cx, cy) with the given
 * pixel width. `time` drives the prop and the strobe blink; `lights` toggles
 * the navigation lights (off in bright daylight shots is never used: the
 * Courier always flies lit).
 */
export function drawAircraft(ctx, cx, cy, width, roll, pitch, time) {
  const w = width;
  const h = w * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const pitchShift = pitch * h * 0.35;
  ctx.translate(0, pitchShift);

  const fuselage = '#e8e4da';
  const fuselageShade = '#b9b4a6';
  const accent = '#d94f2b'; // courier orange cheatline
  const accentDark = '#8f2f16';
  const glass = '#1d2f3d';
  const glassHi = '#7fc4d8';

  // --- main wings (behind the fuselage, slight dihedral) ---
  ctx.fillStyle = '#ded9cc';
  ctx.strokeStyle = '#8d887a';
  ctx.lineWidth = Math.max(1, w * 0.004);
  ctx.beginPath();
  ctx.moveTo(-w * 0.06, -h * 0.08);
  ctx.lineTo(-w * 0.5, h * 0.16);
  ctx.lineTo(-w * 0.5, h * 0.3);
  ctx.lineTo(-w * 0.04, h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.06, -h * 0.08);
  ctx.lineTo(w * 0.5, h * 0.16);
  ctx.lineTo(w * 0.5, h * 0.3);
  ctx.lineTo(w * 0.04, h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // --- wing tip navigation lights ---
  ctx.fillStyle = '#ff2d2d';
  ctx.beginPath();
  ctx.arc(-w * 0.5, h * 0.23, w * 0.012, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2dff5e';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.23, w * 0.012, 0, Math.PI * 2);
  ctx.fill();

  // --- tailplane and fin ---
  ctx.fillStyle = fuselageShade;
  ctx.beginPath();
  ctx.moveTo(-w * 0.02, h * 0.42);
  ctx.lineTo(-w * 0.16, h * 0.52);
  ctx.lineTo(-w * 0.16, h * 0.58);
  ctx.lineTo(-w * 0.01, h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.02, h * 0.42);
  ctx.lineTo(w * 0.16, h * 0.52);
  ctx.lineTo(w * 0.16, h * 0.58);
  ctx.lineTo(w * 0.01, h * 0.5);
  ctx.closePath();
  ctx.fill();
  // vertical fin, rising toward the viewer
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-w * 0.045, h * 0.4);
  ctx.lineTo(w * 0.045, h * 0.4);
  ctx.lineTo(w * 0.075, h * 0.72);
  ctx.lineTo(-w * 0.075, h * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accentDark;
  ctx.beginPath();
  ctx.moveTo(-w * 0.075, h * 0.72);
  ctx.lineTo(w * 0.075, h * 0.72);
  ctx.lineTo(w * 0.06, h * 0.78);
  ctx.lineTo(-w * 0.06, h * 0.78);
  ctx.closePath();
  ctx.fill();

  // --- fuselage: rounded body, wider at the cabin, tapering to the tail ---
  ctx.fillStyle = fuselage;
  ctx.strokeStyle = '#8d887a';
  ctx.lineWidth = Math.max(1, w * 0.004);
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.62);
  ctx.bezierCurveTo(w * 0.1, -h * 0.55, w * 0.11, -h * 0.2, w * 0.085, h * 0.05);
  ctx.bezierCurveTo(w * 0.07, h * 0.3, w * 0.05, h * 0.42, 0, h * 0.48);
  ctx.bezierCurveTo(-w * 0.05, h * 0.42, -w * 0.07, h * 0.3, -w * 0.085, h * 0.05);
  ctx.bezierCurveTo(-w * 0.11, -h * 0.2, -w * 0.1, -h * 0.55, 0, -h * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // --- cheatline and cargo door ---
  ctx.fillStyle = accent;
  ctx.fillRect(-w * 0.082, -h * 0.05, w * 0.164, h * 0.07);
  ctx.strokeStyle = '#6d675c';
  ctx.lineWidth = Math.max(1, w * 0.003);
  ctx.strokeRect(-w * 0.05, h * 0.1, w * 0.1, h * 0.16);

  // --- cockpit glass: two panes catching the sky ---
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(-w * 0.055, -h * 0.5);
  ctx.lineTo(w * 0.055, -h * 0.5);
  ctx.lineTo(w * 0.045, -h * 0.32);
  ctx.lineTo(-w * 0.045, -h * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = glassHi;
  ctx.beginPath();
  ctx.moveTo(-w * 0.05, -h * 0.48);
  ctx.lineTo(-w * 0.01, -h * 0.48);
  ctx.lineTo(-w * 0.02, -h * 0.36);
  ctx.lineTo(-w * 0.045, -h * 0.36);
  ctx.closePath();
  ctx.fill();

  // --- prop disc: a spinning blur ahead of the nose ---
  const propAngle = time * 22;
  ctx.save();
  ctx.translate(0, -h * 0.66);
  ctx.rotate(propAngle % Math.PI);
  ctx.fillStyle = 'rgba(40, 48, 56, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.02, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#2c2f33';
  ctx.beginPath();
  ctx.arc(0, -h * 0.66, w * 0.018, 0, Math.PI * 2);
  ctx.fill();

  // --- tail strobe: double blink ---
  const blink = (time % 1.2) < 0.12;
  if (blink) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(0, h * 0.8, w * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
