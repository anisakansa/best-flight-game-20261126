// Missions for Skyline Cargo: three sorties with different goals, so flying
// is never just staying airborne. Each mission states its objective in plain
// words on the briefing screen and on the HUD, scores the pilot on what the
// mission asked for, and awards a medal. Fuel and damage are the decisions:
// push the throttle and the tank empties; fly careless and the airframe pays.

import { makeRingCourse, RUNWAY, FAR_STRIP, BEACON, WORLD_SEED } from './terrain.js';
import { toKnots, toFeet } from './flight.js';

export const MISSIONS = [
  {
    id: 'rings',
    name: 'Ring Run',
    tagline: 'Twelve gates over the lagoon. Beat the clock, mind the fuel.',
    briefing:
      'Take off from Coral Bay and thread all twelve rings in order. ' +
      'Each gate is worth points; a clean line is worth more than full throttle. ' +
      'Fuel burns fast at full power — a pilot who plans the throttle lands with a medal.',
    par: { time: 150, fuel: 35 },
  },
  {
    id: 'landing',
    name: 'Island Landing',
    tagline: 'Cross the chain and put her down soft on the far strip.',
    briefing:
      'Depart Coral Bay, cross the island chain, and land on the far strip at ' +
      'Palma Cay. Come in slow, lined up, sinking gently: a perfect touchdown ' +
      'pays double. Hard landings damage the airframe; a crash ends the sortie.',
    par: { time: 240, fuel: 30 },
  },
  {
    id: 'rescue',
    name: 'Storm Rescue',
    tagline: 'A pilot is down on Gull Rock. Drop the crate, fight the crosswind.',
    briefing:
      'A pilot is down on Gull Rock in a storm crosswind. Fly low over the ' +
      'beacon and drop the supply crate inside the smoke ring, then bring the ' +
      'aircraft home to Coral Bay. The wind will push you sideways — correct ' +
      'with bank, not with panic.',
    par: { time: 300, fuel: 25 },
  },
];

export function makeMissionState(missionId) {
  const mission = MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
  const state = {
    mission,
    startedAt: 0,
    elapsed: 0,
    rings: mission.id === 'rings' ? makeRingCourse(WORLD_SEED) : [],
    nextRing: 0,
    ringsHit: 0,
    crateDropped: false,
    crateHit: false,
    landed: false,
    landingQuality: null,
    returnedHome: false,
    score: 0,
    events: [],
    complete: false,
    medal: null,
  };
  return state;
}

function addEvent(state, text) {
  state.events.push(text);
  if (state.events.length > 4) state.events.shift();
}

// Storm crosswind: a smooth deterministic function of distance along the
// route, so the same sortie always blows the same way.
export function stormWind(z) {
  return Math.sin(z * 0.004) * 9 + Math.sin(z * 0.0013 + 1.7) * 6;
}

function distance3D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// One mission step: checks rings, the crate drop, landings and the return
// home. Returns nothing; the state carries the results.
export function stepMission(state, plane, actions, dt) {
  state.elapsed += dt;

  if (state.mission.id === 'rings') {
    const ring = state.rings[state.nextRing];
    if (ring) {
      const d = distance3D(plane, ring);
      if (d < ring.radius) {
        state.ringsHit += 1;
        state.nextRing += 1;
        state.score += 100;
        addEvent(state, `Gate ${state.ringsHit} of 12 — clean! +100`);
      } else if (plane.z > ring.z + 60 && Math.abs(plane.x - ring.x) > 40) {
        // Flew past the gate without threading it: it stays missed.
        state.nextRing += 1;
        addEvent(state, `Gate ${state.nextRing} missed — fly on`);
      }
      if (state.nextRing >= state.rings.length) {
        state.complete = true;
        state.score += Math.max(0, Math.round((150 - state.elapsed) * 4));
        state.score += Math.round(plane.fuel * 2);
        state.medal = awardMedal(state);
        addEvent(state, 'Course complete — return to Coral Bay');
      }
    }
  }

  if (state.mission.id === 'landing' && actions.landed) {
    state.landed = true;
    state.landingQuality = actions.landingQuality;
    state.complete = true;
    const qualityBonus = { perfect: 300, firm: 150, hard: 40 }[actions.landingQuality] || 0;
    state.score += qualityBonus;
    state.score += Math.max(0, Math.round((240 - state.elapsed) * 2));
    state.score += Math.round(plane.fuel * 2);
    state.medal = awardMedal(state);
    addEvent(state, `Touchdown ${actions.landingQuality} — +${qualityBonus}`);
  }

  if (state.mission.id === 'rescue') {
    if (actions.dropCrate && !state.crateDropped) {
      state.crateDropped = true;
      const dx = plane.x - BEACON.x;
      const dz = plane.z - BEACON.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      state.crateHit = dist < 55 && plane.y < 70;
      if (state.crateHit) {
        state.score += 250;
        addEvent(state, 'Crate on target — the pilot is safe! +250');
      } else {
        addEvent(state, 'Crate missed the smoke — fly on');
      }
    }
    const home =
      Math.abs(plane.x - RUNWAY.x) < RUNWAY.halfWidth &&
      plane.z > RUNWAY.zStart &&
      plane.z < RUNWAY.zEnd;
    if (state.crateHit && actions.landed && home) {
      state.returnedHome = true;
      state.complete = true;
      state.score += 200;
      state.score += Math.max(0, Math.round((300 - state.elapsed) * 2));
      state.score += Math.round(plane.fuel * 2);
      state.medal = awardMedal(state);
      addEvent(state, 'Home safe — rescue complete');
    }
  }
}

function awardMedal(state) {
  const par = state.mission.par;
  const fuelLeft = state.score > 0;
  if (state.elapsed <= par.time && fuelLeft) return 'gold';
  if (state.elapsed <= par.time * 1.4) return 'silver';
  return 'bronze';
}

// The objective line the HUD shows, so the pilot always knows the job.
export function objectiveText(state, plane) {
  if (state.mission.id === 'rings') {
    if (state.complete) return 'Course complete — well flown!';
    const ring = state.rings[state.nextRing];
    if (!ring) return 'Course complete';
    return `Gate ${state.nextRing + 1} of 12 — ${Math.round(ring.z - plane.z)} m ahead`;
  }
  if (state.mission.id === 'landing') {
    if (state.complete) return `Landed ${state.landingQuality} on Palma Cay`;
    return `Land on Palma Cay — ${Math.round(FAR_STRIP.zStart - plane.z)} m ahead`;
  }
  if (!state.crateDropped) return 'Reach the smoke on Gull Rock — press C to drop';
  if (!state.crateHit) return 'Crate missed — return to Coral Bay and try again';
  if (!state.returnedHome) return 'Crate delivered — bring her home to Coral Bay';
  return 'Rescue complete';
}

// One-line debrief for the end screen. Numbers are the pilot's own.
export function debriefText(state, plane) {
  const mins = Math.floor(state.elapsed / 60);
  const secs = Math.floor(state.elapsed % 60);
  const time = `${mins}:${String(secs).padStart(2, '0')}`;
  return [
    `Time ${time}`,
    `Fuel left ${Math.round(plane.fuel)}%`,
    `Damage ${Math.round(plane.damage)}%`,
    `Speed at finish ${toKnots(plane.speed)} kt`,
    `Altitude ${toFeet(plane.y)} ft`,
    `Score ${state.score}`,
  ];
}
