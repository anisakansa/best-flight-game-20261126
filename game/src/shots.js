// Screenshot scenes for Tradewind Courier: each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (bank toward the target, pitch for the target altitude,
// throttle for a cruise speed), so the frame is what a real sortie looks
// like and the same seed always gives the same frame.

import { DT } from './flight-physics.js';
import { stepWorld } from './world.js';
import { targetBearing, currentTarget, targetDistance } from './missions.js';
import { RUNWAYS } from './terrain.js';
import { clamp } from './rng.js';
import { heightAt } from './terrain.js';

/** Autopilot control vector: fly toward the mission's current target. */
export function autopilot(world, opts) {
  const o = opts ?? {};
  const ac = world.ac;
  const mission = world.mission;
  const target = currentTarget(mission);
  if (!target) return { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, brake: false, drop: false };

  // THE PHYSICS TAKES PITCH/ROLL RATES, NOT TARGET ANGLES. A plain
  // P-loop on altitude/heading error slams the nose and the bank to the
  // stops and porpoises (alt 25 m <-> 200 m). So steer in two loops:
  // a desired attitude from the error, then a rate that drives the
  // current angle toward it. That is stable and lands like an aircraft.
  // `base` is a feed-forward pitch (the glide slope needs -0.06 rad just
  // to stay on the path; without it a P-loop settles metres above the
  // glide path and floats the whole strip without touching down).
  const pitchFor = (wantAlt, maxPitch = 0.18, base = 0) => {
    const wantPitch = clamp(base + (wantAlt - ac.y) * 0.006, -maxPitch, maxPitch);
    return clamp((wantPitch - ac.pitch) * 3, -1, 1);
  };
  const rollFor = (wantHeading, maxRoll = 0.7) => {
    let err = wantHeading - ac.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const wantRoll = clamp(err * 1.0, -maxRoll, maxRoll);
    return clamp((wantRoll - ac.roll) * 3, -1, 1);
  };
  const levelRoll = () => clamp((0 - ac.roll) * 3, -1, 1);

  const ground = heightAt(ac.x, ac.z, world.seed);
  const agl = ac.y - ground;

  // rollout: wheels on the strip after flying — straight, brakes on, idle
  if (ac.onGround && ac.airborne) {
    return { pitch: 0, roll: 0, yaw: 0, throttleDelta: -0.5 / 60, brake: true, drop: false };
  }

  // climb-out: wings level, full power, straight ahead until 150 m above
  // the ground — no turning into a hillside at takeoff speed. This phase
  // ends once the aircraft has climbed past 120 m AGL or 20 s have passed,
  // so a low, slow landing approach later in the sortie never re-triggers
  // it. (The old 200 m mark never fired: the fix-steering hold is 160 m,
  // so the flag stayed down and the climb-out kept hijacking the final.)
  if (agl > 120 || world.time > 20) world.climbedOut = true;
  if (!world.climbedOut && agl < 150 && (ac.onGround || ac.speed < 55)) {
    return {
      pitch: pitchFor(300, 0.3, 0.15),
      roll: levelRoll(),
      yaw: 0,
      throttleDelta: 0.4 / 60,
      brake: false,
      drop: false,
    };
  }

  // runway approach (landing mission, or the drop mission's return home):
  // steer to a final fix 1.5 km out on the extended centreline, then ride
  // a 3.5-degree glide path with a centreline correction. Either landing
  // direction is fine: pick the one nearer the aircraft's heading.
  const approachRunway = mission.id === 'landing' ? RUNWAYS[1]
    : mission.id === 'drop' && mission.dropsLeft === 0 ? RUNWAYS[0] : null;
  if (approachRunway) {
    const rw = approachRunway;
    const d = Math.hypot(ac.x - rw.x, ac.z - rw.z);
    if (d < 2600) {
      // pick the landing direction whose final fix sits over the lowest
      // ground — an island strip is always approached from the sea side
      let landHeading = rw.heading;
      const fixHeight = (h) => {
        const fx = rw.x - Math.sin(h) * 1500;
        const fz = rw.z + Math.cos(h) * 1500;
        return heightAt(fx, fz, world.seed);
      };
      const hSea = fixHeight(rw.heading);
      const hOther = fixHeight(rw.heading + Math.PI);
      if (hOther < hSea - 5) landHeading = rw.heading + Math.PI;
      const fwd = [Math.sin(landHeading), -Math.cos(landHeading)];
      const rgt = [Math.cos(landHeading), Math.sin(landHeading)];
      const dx = ac.x - rw.x;
      const dz = ac.z - rw.z;
      const along = dx * fwd[0] + dz * fwd[1];
      const across = dx * rgt[0] + dz * rgt[1];
      const onFinal = Math.abs(across) < 150 && along < rw.length / 2 + 30 && along > -2600;
      if (!onFinal) {
        // steer to the final fix, 100 m up — level with the glide path
        // where it starts, so joining the final is a gentle ride down,
        // not a dive that plants the wheels short of the threshold.
        // Never turn low over rising ground: keep 80 m above the terrain
        // below while swinging onto the fix, so a go-around climbs out
        // over the island instead of banking into a hillside.
        const fixX = rw.x - fwd[0] * 1500;
        const fixZ = rw.z - fwd[1] * 1500;
        const wantH = Math.atan2(fixX - ac.x, -(fixZ - ac.z));
        const fixAlt = Math.max(100, ground + 80);
        return {
          pitch: pitchFor(fixAlt, 0.25),
          roll: rollFor(wantH, 0.7),
          yaw: 0,
          throttleDelta: clamp((50 - ac.speed) * 0.02, -0.4, 0.4) / 60,
          brake: false,
          drop: false,
        };
      }
      // on final: correct back to the centreline, descend the glide path;
      // far out, never let the glide path dip under the terrain below
      const wantH = landHeading - clamp(across * 0.0012, -0.5, 0.5);
      let wantAlt = rw.elev + Math.max(6, (Math.abs(along) - 60) * 0.06);
      if (Math.abs(along) > 400) wantAlt = Math.max(wantAlt, ground + 30);
      // flare: inside 250 m, bleed the descent to a kiss — no slamming.
      // Aim just under the touchdown height so the wheels actually meet
      // the strip instead of floating past it forever. Brake only while
      // there is speed to spare: full brake bleeds 14 m/s^2, and braking
      // below 36 m/s stalls the wing and drops the nose into the ground
      // short of the threshold. The rollout branch brakes once down.
      let maxPitch = 0.18;
      let wantSpeed = Math.abs(along) < 300 ? 36 : 42;
      if (Math.abs(along) < 250) {
        wantAlt = rw.elev + 0.5;
        maxPitch = 0.08;
        wantSpeed = 34;
      }
      const throttleDelta = clamp((wantSpeed - ac.speed) * 0.03, -0.8, 0.4) / 60;
      return {
        pitch: pitchFor(wantAlt, maxPitch, -0.06),
        roll: rollFor(wantH, 0.6),
        yaw: 0,
        throttleDelta,
        brake: ac.speed > 36 && Math.abs(along) < 250,
        drop: false,
      };
    }
  }

  const wantHeading = targetBearing(mission, ac);
  // hold the target's altitude, with a floor above the terrain
  const wantAlt = Math.max(target.y, ground + (o.minAgl ?? 90));

  // throttle holds a cruise speed, eases off when fast; slow down near a
  // ring so the turn radius fits the hoop
  let wantSpeed = o.cruise ?? 62;
  if (mission.id === 'rings') {
    const ring = mission.rings[mission.ringIndex];
    if (ring) {
      const dRing = Math.hypot(ac.x - ring.x, ac.y - ring.y, ac.z - ring.z);
      if (dRing < 600) wantSpeed = 50;
    }
  }
  const throttleDelta = clamp((wantSpeed - ac.speed) * 0.02, -0.4, 0.4) / 60;

  // drop the crate when the autopilot is over the zone, low and slow
  let drop = false;
  if (mission.id === 'drop' && mission.dropsLeft > 0) {
    const dz = Math.hypot(ac.x - mission.dropZone.x, ac.z - mission.dropZone.z);
    if (dz < 45 && ac.y < 200 && ac.y > 60 && ac.speed < 72) drop = true;
  }
  return {
    pitch: pitchFor(wantAlt, 0.2),
    roll: rollFor(wantHeading, mission.id === 'rings' ? 0.9 : 0.7),
    yaw: 0,
    throttleDelta,
    brake: false,
    drop,
  };
}

function runSteps(world, seconds, control, stopWhen) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, control(world), DT);
    if (stopWhen && stopWhen(world)) break;
    if (world.ac.crashed || world.mission.done || world.mission.failed) break;
  }
}

/**
 * Stage the named scene on a fresh world: 'cover' (ring run, a ring dead
 * ahead), 'landing' (on final to Kaimana), 'drop' (crate away over the
 * zone) or 'storm' (deep in the squall, beacon ahead). Returns the world.
 */
export function stageShot(world, name) {
  if (name === 'landing') {
    // stop only once the aircraft is actually ON FINAL — lined up on the
    // sea-approach centreline, heading west, 200-900 m out, below 110 m —
    // so the strip sits dead ahead in the frame. Stopping on mere
    // proximity fires while still enroute, with the runway behind the
    // camera.
    runSteps(world, 240, (w) => autopilot(w, { cruise: 58, minAgl: 70 }), (w) => {
      const ac = w.ac;
      const rw = RUNWAYS[1];
      const along = rw.x - ac.x; // westward final: along is negative east of the strip
      const across = rw.z - ac.z;
      let dh = ac.heading - (3 * Math.PI) / 2;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      return along < -150 && along > -300 && Math.abs(across) < 60 && Math.abs(dh) < 0.35 && ac.y < 110;
    });
    return world;
  }
  if (name === 'drop') {
    runSteps(world, 260, (w) => autopilot(w, { cruise: 56, minAgl: 110 }), (w) => w.mission.dropsLeft < 2);
    return world;
  }
  if (name === 'storm') {
    // 92 s: deep in the squall band (stormFactor ~0.45, rain on, sky
    // greyed) and 300 m from the beacon — the band hugs Beacon Rock, so
    // earlier frames are still clear air
    runSteps(world, 92, (w) => autopilot(w, { cruise: 64, minAgl: 120 }));
    return world;
  }
  // cover: ring run, 40 seconds in, second ring ahead
  runSteps(world, 42, (w) => autopilot(w, { cruise: 64, minAgl: 90 }));
  return world;
}
