// Chase camera for Tradewind Courier: it trails the aircraft, never fights
// the pilot. Position and heading ease toward their targets so the view is
// steady in a turn, and the camera looks slightly ahead of the nose so a
// ring or runway stays in frame while the aircraft banks under it.

import { clamp, lerp } from './rng.js';

/** Fresh camera state, parked behind the aircraft. */
export function makeCamera(ac) {
  return {
    x: ac.x - Math.sin(ac.heading) * 26,
    y: ac.y + 7,
    z: ac.z + Math.cos(ac.heading) * 26,
    heading: ac.heading,
    pitch: 0.02,
    roll: 0,
    distance: 26,
    height: 7,
  };
}

/** Ease the camera toward its chase position behind the aircraft. */
export function stepCamera(cam, ac, dt, mode) {
  const dist = mode === 'far' ? 40 : 26;
  const height = mode === 'far' ? 11 : 7;
  cam.distance = lerp(cam.distance, dist, 1 - Math.pow(0.001, dt));
  cam.height = lerp(cam.height, height, 1 - Math.pow(0.001, dt));

  const backX = ac.x - Math.sin(ac.heading) * cam.distance;
  const backZ = ac.z + Math.cos(ac.heading) * cam.distance;
  const backY = ac.y + cam.height - ac.pitch * 6;
  const k = 1 - Math.pow(0.0000001, dt); // critically damped-ish chase
  cam.x = lerp(cam.x, backX, k);
  cam.y = lerp(cam.y, backY, k);
  cam.z = lerp(cam.z, backZ, k);

  // heading eases slower than position, so the view swings gently in a turn
  let dh = ac.heading - cam.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  cam.heading += dh * (1 - Math.pow(0.01, dt));
  cam.pitch = lerp(cam.pitch, clamp(ac.pitch * 0.45 + 0.02, -0.14, 0.22), 1 - Math.pow(0.01, dt));
  cam.roll = lerp(cam.roll, ac.roll * 0.35, 1 - Math.pow(0.01, dt));
}

/** Camera basis vectors from heading/pitch/roll, for the projector. */
export function cameraBasis(cam) {
  const ch = Math.cos(cam.heading);
  const sh = Math.sin(cam.heading);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  // forward: (sin h * cos p, sin p, -cos h * cos p)
  const fwd = [sh * cp, sp, -ch * cp];
  // right: (cos h, 0, sin h)
  const right = [ch, 0, sh];
  // up = right x fwd
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  return { fwd, right, up };
}
