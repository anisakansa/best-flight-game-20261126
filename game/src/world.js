// The world of Tradewind Courier: everything that changes when the game
// runs — aircraft, mission, camera, particles, clouds, storm and the clock.
// main.js renders this; shots.js fast-forwards it. One fixed step, one
// function, so a screenshot scene and a played game are the same physics.

import { makeAircraft, stepAircraft, DT } from './flight-physics.js';
import { makeMission, missionStart, stepMission } from './missions.js';
import { makeCamera, stepCamera } from './camera.js';
import { makeParticles, stepParticles, spawnSmoke, spawnFireball } from './particles.js';
import { makeClouds, makeStorm, gustAt, storminess } from './weather.js';
import { heightAt } from './terrain.js';

/** Fresh world for a seed and a mission id. */
export function createWorld(seed, missionId) {
  const mission = makeMission(missionId, seed);
  const start = missionStart(mission);
  const ac = makeAircraft(start);
  return {
    seed,
    mission,
    ac,
    cam: makeCamera(ac),
    particles: makeParticles(seed),
    clouds: makeClouds(seed, 26),
    storm: makeStorm(seed),
    time: 0,
    cameraMode: 'near',
    smokeTimer: 0,
  };
}

/**
 * One fixed step of the world. `input` is the physics control vector plus
 * `{drop}` for the crate action. Returns the step's event strings.
 */
export function stepWorld(world, input, dt) {
  const { ac, mission, storm } = world;
  const events = [];
  const gust = gustAt(storm, ac.x, ac.z, world.time, world.seed);
  const wind = { x: gust.x, z: gust.z };

  // storm turbulence strains the airframe when flown too fast inside it
  if (gust.strength > 0.4 && ac.speed > 72 && !ac.crashed) {
    ac.damage = Math.min(100, ac.damage + (gust.strength * 2.2 * dt));
    if (ac.damage >= 100) {
      ac.crashed = true;
      events.push('storm-breakup');
    }
  }

  stepAircraft(ac, input, wind, world.seed, events);
  stepMission(mission, ac, events, { drop: !!input.drop }, dt);
  stepCamera(world.cam, ac, dt, world.cameraMode);
  stepParticles(world.particles, dt);

  // engine smoke trail when damaged or at full throttle
  world.smokeTimer -= dt;
  if (world.smokeTimer <= 0 && !ac.crashed && !ac.landed) {
    world.smokeTimer = 0.12;
    if (ac.damage > 35 || ac.throttle > 0.92) {
      spawnSmoke(
        world.particles,
        ac.x - Math.sin(ac.heading) * 8, ac.y + 1, ac.z + Math.cos(ac.heading) * 8,
        -Math.sin(ac.heading) * ac.speed * 0.3, 0.5, Math.cos(ac.heading) * ac.speed * 0.3,
      );
    }
  }
  if (events.includes('crashed') || events.includes('storm-breakup') || events.includes('overspeed-breakup')) {
    spawnFireball(world.particles, ac.x, ac.y, ac.z);
  }

  world.time += dt;
  return events;
}

/** How stormy the air is where the aircraft is right now, 0..1. */
export function localStorm(world) {
  return storminess(world.storm, world.ac.x, world.ac.z);
}

/** Height of the terrain under the aircraft. */
export function groundBelow(world) {
  return heightAt(world.ac.x, world.ac.z, world.seed);
}

export { DT };
