// Missions for Tradewind Courier: four sorties with different goals over the
// same archipelago, plus free flight. A mission is a small state machine:
// it watches the aircraft, fires events, and scores the sortie. Missions
// are deterministic for a seed: the same seed always flies the same rings,
// the same strip and the same storm.

import { RUNWAYS } from './terrain.js';
import { clamp } from './rng.js';

export const MISSION_LIST = [
  { id: 'rings', name: 'CORAL RING SPRINT', short: 'Ring Run', blurb: 'Thread 6 rings over the lagoon against the clock.' },
  { id: 'landing', name: 'KAIMANA SHORT STRIP', short: 'Precision Landing', blurb: 'Put the Courier down gently on a 340 m island strip.' },
  { id: 'drop', name: 'MEDICINE RUN', short: 'Supply Drop', blurb: 'Drop two crates into the marked zone on Pulau Karang, then fly home.' },
  { id: 'storm', name: 'THROUGH THE SQUALL', short: 'Storm Run', blurb: 'Cross the squall line to the beacon on Beacon Rock. Mind the gusts.' },
  { id: 'free', name: 'FREE FLIGHT', short: 'Free Flight', blurb: 'No orders. Just you, the Courier and the islands.' },
];

/** Ring course for the Ring Run: an arc over the lagoon, 6 rings. */
function ringCourse() {
  const rings = [];
  const path = [
    [-1800, 260, -900], [-900, 300, -100], [100, 330, 700],
    [1100, 300, 1300], [1900, 260, 900], [2400, 240, 300],
  ];
  for (let i = 0; i < path.length; i += 1) {
    const [x, y, z] = path[i];
    const next = path[Math.min(i + 1, path.length - 1)];
    const dx = next[0] - x;
    const dz = next[2] - z;
    const len = Math.hypot(dx, dz) || 1;
    rings.push({
      x, y, z, radius: 42,
      normal: [dx / len, 0, dz / len],
      passed: false,
    });
  }
  return rings;
}

/** Fresh mission state for a mission id. */
export function makeMission(id, seed) {
  const base = {
    id,
    meta: MISSION_LIST.find((m) => m.id === id) ?? MISSION_LIST[4],
    seed,
    elapsed: 0,
    score: 0,
    done: false,
    failed: false,
    failedReason: '',
    message: '',
    messageAge: 0,
    rings: id === 'rings' ? ringCourse() : [],
    ringIndex: 0,
    prevPlaneDist: null,
    dropsLeft: id === 'drop' ? 2 : 0,
    dropScores: [],
    dropZone: { x: -600, z: 4100, radius: 60 },
    beacon: { x: 4100, z: -3600 },
    stormReached: false,
    landedOk: false,
    landingQuality: 0,
    returnedHome: false,
    startHeading: 0,
  };
  return base;
}

/** Where the mission starts the aircraft: {x, y, z, heading, speed, throttle, onGround}. */
export function missionStart(mission) {
  const home = RUNWAYS[0];
  switch (mission.id) {
    case 'rings':
      return { x: -2400, y: 320, z: -1600, heading: 1.15, speed: 62, throttle: 0.7, onGround: false };
    case 'landing':
      return { x: home.x, y: home.elev + 1.4, z: home.z, heading: home.heading, speed: 0, throttle: 0, onGround: true };
    case 'drop':
      return { x: home.x, y: home.elev + 1.4, z: home.z, heading: home.heading, speed: 0, throttle: 0, onGround: true };
    case 'storm':
      return { x: -1600, y: 420, z: -1200, heading: 0.9, speed: 66, throttle: 0.75, onGround: false };
    default:
      return { x: -2400, y: 420, z: -1600, heading: 1.15, speed: 62, throttle: 0.7, onGround: false };
  }
}

function say(mission, text) {
  mission.message = text;
  mission.messageAge = 0;
}

/** Distance from the aircraft to the mission's current target, in metres. */
export function targetDistance(mission, ac) {
  const t = currentTarget(mission);
  if (!t) return 0;
  return Math.hypot(ac.x - t.x, (ac.y - (t.y ?? 0)), ac.z - t.z);
}

/** The mission's current target point {x, y, z, label}. */
export function currentTarget(mission) {
  switch (mission.id) {
    case 'rings': {
      const r = mission.rings[mission.ringIndex];
      return r ? { x: r.x, y: r.y, z: r.z, label: `RING ${mission.ringIndex + 1}/6` } : null;
    }
    case 'landing':
      return { x: RUNWAYS[1].x, y: RUNWAYS[1].elev + 30, z: RUNWAYS[1].z, label: 'KAIMANA STRIP' };
    case 'drop':
      if (mission.dropsLeft > 0) return { x: mission.dropZone.x, y: 120, z: mission.dropZone.z, label: 'DROP ZONE' };
      return { x: RUNWAYS[0].x, y: RUNWAYS[0].elev + 30, z: RUNWAYS[0].z, label: 'FLY HOME' };
    case 'storm':
      return { x: mission.beacon.x, y: 120, z: mission.beacon.z, label: 'BEACON ROCK' };
    default:
      return null;
  }
}

/** Heading (radians) from the aircraft to the current target. */
export function targetBearing(mission, ac) {
  const t = currentTarget(mission);
  if (!t) return ac.heading;
  // forward is (sin h, -cos h): heading to a point is atan2(dx, -dz)
  return Math.atan2(t.x - ac.x, -(t.z - ac.z));
}

/**
 * Advance the mission one step. `events` are physics events from this step
 * ('touchdown', 'crashed', 'terrain-strike', 'fuel-empty', ...). `actions`
 * carries player-triggered actions this step ({drop: true}).
 */
export function stepMission(mission, ac, events, actions, dt) {
  mission.elapsed += dt;
  mission.messageAge += dt;

  if (ac.crashed) {
    mission.failed = true;
    mission.failedReason = 'The Courier went down. The sortie is over.';
    return;
  }
  if (ac.engineOut && mission.id !== 'landing' && !ac.onGround) {
    // gliding on empty tanks is allowed briefly; the fuel gauge warns first
  }
  if (mission.done || mission.failed) return;

  switch (mission.id) {
    case 'rings': {
      const ring = mission.rings[mission.ringIndex];
      if (ring) {
        // a ring counts when the aircraft crosses its plane inside the hoop:
        // flying through the disc, not merely near its centre
        const sd = (ac.x - ring.x) * ring.normal[0]
          + (ac.y - ring.y) * ring.normal[1]
          + (ac.z - ring.z) * ring.normal[2];
        const crossed = mission.prevPlaneDist !== null && mission.prevPlaneDist < 0 && sd >= 0;
        mission.prevPlaneDist = sd;
        const dx = ac.x - ring.x;
        const dy = ac.y - ring.y;
        const dz = ac.z - ring.z;
        const perp = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - sd * sd));
        const through = crossed && perp < ring.radius * 0.95;
        const centred = Math.hypot(dx, dy, dz) < ring.radius * 0.85;
        if (through || centred) {
          ring.passed = true;
          mission.ringIndex += 1;
          mission.prevPlaneDist = null;
          mission.score += 100;
          say(mission, `RING ${mission.ringIndex}/6 — CLEAN!  +100`);
          if (mission.ringIndex >= mission.rings.length) {
            mission.done = true;
            const par = 150;
            const bonus = Math.max(0, Math.round((par - mission.elapsed) * 6));
            mission.score += bonus;
            say(mission, `COURSE COMPLETE in ${mission.elapsed.toFixed(1)}s — time bonus +${bonus}`);
          }
        }
      }
      if (mission.elapsed > 300) {
        mission.failed = true;
        mission.failedReason = 'Out of time on the ring course.';
      }
      break;
    }
    case 'landing': {
      if (events.includes('touchdown') && ac.landedRunway === 'kaimana') {
        const vy = Math.abs(ac.verticalSpeed);
        const frame = runwayFrameOf('kaimana', ac);
        const centre = Math.abs(frame.across);
        const quality = clamp(1 - vy / 4, 0, 1) * 0.6 + clamp(1 - centre / 15, 0, 1) * 0.4;
        mission.landingQuality = quality;
        mission.landedOk = true;
        mission.score = Math.round(400 + quality * 600);
        say(mission, `TOUCHDOWN — quality ${(quality * 100).toFixed(0)}%`);
      }
      if (events.includes('landed') && mission.landedOk) {
        mission.done = true;
        say(mission, `LANDED AT KAIMANA — score ${mission.score}`);
      }
      if (events.includes('landed') && !mission.landedOk) {
        mission.failed = true;
        mission.failedReason = 'You landed at the wrong strip.';
      }
      if (events.includes('terrain-strike')) {
        mission.failed = true;
        mission.failedReason = 'You put it down off the strip.';
      }
      if (mission.elapsed > 600) {
        mission.failed = true;
        mission.failedReason = 'Out of time to reach Kaimana.';
      }
      break;
    }
    case 'drop': {
      if (actions.drop && mission.dropsLeft > 0) {
        const dz = Math.hypot(ac.x - mission.dropZone.x, ac.z - mission.dropZone.z);
        const agl = ac.y;
        const speedOk = ac.speed < 72;
        const altOk = agl >= 60 && agl <= 200;
        if (dz < 220 && altOk && speedOk) {
          const acc = clamp(1 - dz / 220, 0, 1);
          const pts = Math.round(300 + acc * 500);
          mission.dropScores.push(pts);
          mission.score += pts;
          mission.dropsLeft -= 1;
          say(mission, `CRATE AWAY — ${dz.toFixed(0)}m off centre, +${pts}`);
        } else {
          say(mission, 'DROP REJECTED — be low, slow and over the zone');
        }
      }
      if (mission.dropsLeft === 0 && !mission.returnedHome) {
        if (events.includes('landed') && ac.landedRunway === 'home') {
          mission.returnedHome = true;
          mission.done = true;
          mission.score += 300;
          say(mission, `HOME SAFE — return bonus +300, total ${mission.score}`);
        } else if (events.includes('landed')) {
          mission.failed = true;
          mission.failedReason = 'Wrong airfield — the medicine run ends at Meridian.';
        }
      }
      if (mission.elapsed > 720) {
        mission.failed = true;
        mission.failedReason = 'Out of time on the medicine run.';
      }
      break;
    }
    case 'storm': {
      const d = Math.hypot(ac.x - mission.beacon.x, ac.z - mission.beacon.z);
      if (d < 260 && ac.y < 420) {
        mission.stormReached = true;
        mission.done = true;
        mission.score = Math.round(500 + Math.max(0, ac.fuel) * 4 + Math.max(0, 100 - ac.damage) * 2);
        say(mission, `BEACON REACHED — through the squall! Score ${mission.score}`);
      }
      if (mission.elapsed > 480) {
        mission.failed = true;
        mission.failedReason = 'The storm outlasted you.';
      }
      break;
    }
    default:
      break;
  }

  // fuel exhaustion: a 90-second glide window to put it down somewhere
  if (ac.fuel <= 0 && !ac.onGround && mission.id !== 'free') {
    if (mission.fuelOutAt === undefined) mission.fuelOutAt = mission.elapsed;
    if (mission.elapsed - mission.fuelOutAt > 90) {
      mission.failed = true;
      mission.failedReason = 'Out of fuel over open water.';
    }
  }
}

function runwayFrameOf(id, ac) {
  const rw = RUNWAYS.find((r) => r.id === id);
  const dx = ac.x - rw.x;
  const dz = ac.z - rw.z;
  const sin = Math.sin(rw.heading);
  const cos = Math.cos(rw.heading);
  return { along: dx * sin - dz * cos, across: dx * cos + dz * sin };
}

/** One-line objective text for the HUD. */
export function objectiveText(mission) {
  switch (mission.id) {
    case 'rings':
      return `Fly the rings: ${mission.ringIndex}/6  •  par 150s`;
    case 'landing':
      return mission.landedOk ? 'Parked at Kaimana — sortie complete' : 'Land gently on Kaimana Short Strip';
    case 'drop':
      return mission.dropsLeft > 0
        ? `Drop ${mission.dropsLeft} crate${mission.dropsLeft > 1 ? 's' : ''} in the zone (B key, low & slow)`
        : 'Crates away — fly home to Meridian Field';
    case 'storm':
      return 'Reach the beacon on Beacon Rock — keep it under 145 kt in the storm';
    default:
      return 'Free flight — enjoy the islands';
  }
}
