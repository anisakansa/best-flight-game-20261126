// Flight physics for Tradewind Courier: a light arcade model with real
// trade-offs. Throttle, pitch and bank are the pilot's levers; speed, lift,
// stall, fuel burn and damage are the bill. Fixed-step (1/60 s), fully
// deterministic: the same inputs always fly the same line.

import { clamp } from './rng.js';
import { heightAt, onRunway, RUNWAYS } from './terrain.js';

export const DT = 1 / 60;
export const STALL_SPEED = 26; // m/s, below this the wing quits
export const MAX_SPEED = 98; // m/s, structural redline
export const CRUISE_SPEED = 62; // m/s at 0.65 throttle, level
export const GRAVITY = 9.81;

/** Fresh aircraft state. `start` is {x, y, z, heading, speed, throttle}. */
export function makeAircraft(start) {
  return {
    x: start.x,
    y: start.y,
    z: start.z,
    heading: start.heading, // radians, 0 = north (-z)
    pitch: 0, // radians, + = nose up
    roll: 0, // radians, + = bank right
    speed: start.speed,
    throttle: start.throttle ?? 0.6,
    fuel: 100,
    damage: 0,
    verticalSpeed: 0,
    onGround: start.onGround ?? false,
    airborne: false, // true once the aircraft has left the ground this sortie
    crashed: false,
    landed: false,
    landedRunway: null,
    engineOut: false,
  };
}

/**
 * One fixed step. `input` is {pitch: -1..1, roll: -1..1, yaw: -1..1,
 * throttleDelta, brake} and `wind` is {x, z} gusts in m/s. `events` collects
 * strings the game turns into HUD messages ('stall', 'hard-landing', ...).
 */
export function stepAircraft(ac, input, wind, seed, events) {
  if (ac.crashed || ac.landed) return;

  const groundH = heightAt(ac.x, ac.z, seed);
  const agl = ac.y - groundH;

  // --- throttle and fuel ---
  ac.throttle = clamp(ac.throttle + input.throttleDelta, 0, 1);
  if (!ac.engineOut) {
    const burn = (0.08 + ac.throttle * ac.throttle * 0.42) * DT;
    ac.fuel = Math.max(0, ac.fuel - burn);
    if (ac.fuel <= 0) {
      ac.engineOut = true;
      events.push('fuel-empty');
    }
  }
  const thrust = ac.engineOut ? 0 : ac.throttle;

  // --- control authority fades near the stall ---
  const authority = clamp((ac.speed - 14) / 26, 0.25, 1);
  const pitchRate = input.pitch * 0.85 * authority;
  const rollRate = input.roll * 2.0 * authority;
  ac.pitch = clamp(ac.pitch + pitchRate * DT, -0.5, 0.55);
  ac.roll = clamp(ac.roll + rollRate * DT, -1.1, 1.1);
  if (input.roll === 0) ac.roll *= Math.pow(0.35, DT); // wings level themselves
  if (input.pitch === 0) ac.pitch *= Math.pow(0.6, DT);

  // --- stall: below the wing's speed the nose drops and the turn dies ---
  const stalled = ac.speed < STALL_SPEED && agl > 2;
  if (stalled) {
    ac.pitch -= 0.35 * DT;
    ac.roll *= Math.pow(0.8, DT);
    if (!ac.stallWarned) {
      events.push('stall');
      ac.stallWarned = true;
    }
  } else if (ac.speed > STALL_SPEED + 6) {
    ac.stallWarned = false;
  }

  // --- turn: banked lift turns the nose; rudder yaws it a little ---
  const turnRate = (GRAVITY * Math.tan(ac.roll)) / Math.max(ac.speed, 12);
  ac.heading += (turnRate + input.yaw * 0.22 * authority) * DT;

  // --- speed: thrust fights drag and the climb ---
  const drag = 0.0042 * ac.speed * ac.speed;
  const climbCost = GRAVITY * Math.sin(ac.pitch);
  let accel = thrust * 30 - drag - climbCost;
  if (input.brake) accel -= 14;
  if (ac.onGround) {
    accel = thrust * 30 - drag * 0.4 - (input.brake ? 22 : 3);
  }
  ac.speed = Math.max(0, ac.speed + accel * DT);

  // --- overspeed strains the airframe ---
  if (ac.speed > MAX_SPEED) {
    ac.damage = Math.min(100, ac.damage + (ac.speed - MAX_SPEED) * 0.55 * DT);
    if (ac.damage >= 100) {
      ac.crashed = true;
      events.push('overspeed-breakup');
      return;
    }
  }

  // --- move ---
  const fwdX = Math.sin(ac.heading);
  const fwdZ = -Math.cos(ac.heading);
  const windX = wind ? wind.x : 0;
  const windZ = wind ? wind.z : 0;
  const vx = fwdX * ac.speed * Math.cos(ac.pitch) + windX;
  const vz = fwdZ * ac.speed * Math.cos(ac.pitch) + windZ;
  const vy = ac.speed * Math.sin(ac.pitch) - (stalled ? 6 : 0);
  ac.verticalSpeed = vy;
  ac.x += vx * DT;
  ac.z += vz * DT;
  ac.y += vy * DT;

  // --- ground contact ---
  const newGroundH = heightAt(ac.x, ac.z, seed);
  const clearance = ac.y - newGroundH;
  if (clearance > 10) ac.airborne = true;
  if (clearance <= 1.4) {
    ac.y = newGroundH + 1.4;
    const runway = RUNWAYS.find((rw) => onRunway(rw, ac.x, ac.z, 6));
    const gentle = Math.abs(vy) < 4 && ac.speed < 38 && Math.abs(ac.roll) < 0.18;
    if (runway && gentle && ac.airborne) {
      // a real touchdown after flying: wheels on the strip
      if (!ac.onGround) {
        events.push('touchdown');
        ac.landedRunway = runway.id;
      }
      ac.onGround = true;
      ac.pitch = 0;
      ac.roll *= 0.9;
      if (ac.speed < 2) {
        ac.landed = true;
        events.push('landed');
      }
    } else if (runway && ac.onGround) {
      // rolling on the strip: takeoff roll, or rolling out after landing
      ac.pitch = 0;
      if (ac.speed < 2 && ac.airborne) {
        ac.landed = true;
        events.push('landed');
      }
    } else if (!runway || !gentle) {
      // terrain strike (never on a fresh takeoff roll: airborne is false
      // and the strip is under the wheels, so this branch cannot fire there)
      if (!ac.onGround || ac.airborne) {
        const impact = Math.abs(vy) + ac.speed * 0.25;
        ac.damage = Math.min(100, ac.damage + impact * 2.2);
        events.push('terrain-strike');
        if (ac.damage >= 100 || impact > 18) {
          ac.crashed = true;
          events.push('crashed');
        } else {
          // bounce off a slope, bleeding speed
          ac.speed *= 0.55;
          ac.y = newGroundH + 3;
          ac.pitch = 0.12;
        }
      } else {
        // rolling on rough grass off the strip: heavy drag, no damage yet
        ac.speed *= 0.985;
      }
    }
  } else {
    ac.onGround = false;
  }

  // --- world edge: steer gently back toward the archipelago ---
  const dist = Math.hypot(ac.x, ac.z);
  if (dist > 6800) {
    // heading that points at the origin: forward is (sin h, -cos h)
    const home = Math.atan2(-ac.x, ac.z);
    let diff = home - ac.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ac.heading += clamp(diff, -1, 1) * 0.4 * DT;
    events.push('turn-back');
  }
}

/** Knots from m/s, for the HUD. */
export function knots(ms) {
  return ms * 1.94384;
}

/** Feet from metres, for the HUD altimeter. */
export function feet(m) {
  return m * 3.28084;
}
