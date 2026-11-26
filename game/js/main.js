// Skyline Cargo — the game itself. Boots the canvas, owns the state machine
// (menu, briefing, flying, paused, ended), steps the flight model on a fixed
// 1/60 s timestep so the same inputs always fly the same sortie, and hands
// each frame to the renderer and the HUD. Screenshot scenes (?scene=ring,
// landing, rescue) pose the aircraft deterministically so the screenshots
// are real renders of this code at a fixed moment.

import { makeRenderer, renderChaseView } from './render.js';
import { drawHud } from './hud.js';
import {
  makeAircraft, stepFlight, evaluateTouchdown, applyDamage, clamp,
  FLIGHT, normalizeAngle,
} from './flight.js';
import {
  MISSIONS, makeMissionState, stepMission, stormWind, objectiveText, debriefText,
} from './missions.js';
import { makeTerrain, makeClouds, makeHeightGrid, RUNWAY, FAR_STRIP, WORLD_SEED } from './terrain.js';
import { makeInput, attachInput, readFlightControls, consumeDropCrate } from './input.js';
import { makeAudio, startAudio, updateEngineSound, playRingChime, playLandingThud, playCrashSound, playClickSound, toggleMute } from './audio.js';

const STEP = 1 / 60;
const SCENES = {
  ring: { mission: 'rings', x: 55, y: 40, z: 1420, heading: 0.05, speed: 68, throttle: 0.72, time: 12.5 },
  landing: { mission: 'landing', x: 62, y: 42, z: 3260, heading: 0.06, speed: 46, throttle: 0.42, time: 8.0 },
  rescue: { mission: 'rescue', x: -170, y: 40, z: 2080, heading: 0.15, speed: 62, throttle: 0.66, time: 20.0 },
};

export function startGame() {
  const canvas = document.getElementById('game');
  const renderer = makeRenderer(canvas);
  const terrain = makeTerrain(WORLD_SEED);
  const heightGrid = makeHeightGrid(terrain, 8);
  const clouds = makeClouds(WORLD_SEED);
  const input = makeInput();
  const audio = makeAudio();

  const game = {
    state: 'menu', // menu | briefing | flying | paused | ended
    missionId: 'rings',
    mission: null,
    plane: makeAircraft(),
    time: 0,
    accumulator: 0,
    lastNow: 0,
    endReason: null,
    scene: null,
  };

  const overlay = document.getElementById('overlay');
  const endPanel = document.getElementById('end-panel');

  function showMenu() {
    game.state = 'menu';
    overlay.classList.remove('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    document.getElementById('briefing-screen').classList.add('hidden');
    endPanel.classList.add('hidden');
    renderMenuPlane();
  }

  function showBriefing(missionId) {
    game.missionId = missionId;
    const mission = MISSIONS.find((m) => m.id === missionId);
    document.getElementById('brief-title').textContent = mission.name;
    document.getElementById('brief-tagline').textContent = mission.tagline;
    document.getElementById('brief-text').textContent = mission.briefing;
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('briefing-screen').classList.remove('hidden');
    game.state = 'briefing';
  }

  function beginSortie() {
    game.mission = makeMissionState(game.missionId);
    game.plane = makeAircraft();
    game.plane.onGround = true;
    game.time = 0;
    game.endReason = null;
    overlay.classList.add('hidden');
    endPanel.classList.add('hidden');
    game.state = 'flying';
    startAudio(audio);
  }

  function endSortie(reason) {
    game.state = 'ended';
    game.endReason = reason;
    const title = document.getElementById('end-title');
    const lines = document.getElementById('end-lines');
    const medal = document.getElementById('end-medal');
    if (reason === 'crashed') {
      title.textContent = 'Aircraft lost';
      medal.textContent = '';
    } else if (game.mission.complete) {
      title.textContent = game.mission.mission.name + ' — complete!';
      medal.textContent = game.mission.medal ? `Medal: ${game.mission.medal.toUpperCase()}` : '';
    } else {
      title.textContent = 'Sortie over';
      medal.textContent = '';
    }
    lines.innerHTML = '';
    for (const line of debriefText(game.mission, game.plane)) {
      const li = document.createElement('li');
      li.textContent = line;
      lines.appendChild(li);
    }
    endPanel.classList.remove('hidden');
  }

  // The menu backdrop: a slow orbit over the lagoon so the title screen is
  // the game itself, not a static picture.
  function renderMenuPlane() {
    game.plane = makeAircraft();
    game.plane.x = -40;
    game.plane.y = 90;
    game.plane.z = 1800;
    game.plane.heading = 0.3;
    game.plane.speed = 40;
    game.plane.throttle = 0.4;
    game.time = 6;
  }

  function windFor(plane) {
    if (game.mission && game.mission.mission.id === 'rescue') {
      return { x: stormWind(plane.z) };
    }
    return { x: 0 };
  }

  function stepWorld(dt) {
    const plane = game.plane;
    const mission = game.mission;
    const controls = readFlightControls(input, canvas.clientWidth);
    const wind = windFor(plane);

    if (plane.onGround) {
      // Takeoff roll: throttle builds speed on the strip; pull up to lift.
      plane.throttle = clamp(plane.throttle + controls.throttleDelta * dt * 0.9, 0, 1);
      const target = 12 + plane.throttle * (FLIGHT.maxSpeed - 12);
      plane.speed += (target - plane.speed) * Math.min(1, 0.5 * dt);
      plane.z += plane.speed * dt;
      plane.x += clamp(controls.roll, -1, 1) * 6 * dt;
      plane.heading = 0;
      if (plane.speed > 30 && controls.pitch > 0.3) {
        plane.onGround = false;
        plane.y = 4;
        mission.events.push('Airborne — gear up, enjoy the lagoon');
      }
      if (plane.z > RUNWAY.zEnd + 40 && plane.onGround) {
        // Ran off the end of the strip without lifting: a rough stop.
        plane.speed = 0;
        plane.throttle = 0;
        mission.events.push('Off the end of the runway — taxi back and try again');
        plane.z = 40;
        plane.x = 0;
      }
      return;
    }

    const beforeRings = mission.ringsHit;
    stepFlight(plane, controls, wind, dt);
    const ground = terrain.heightAt(plane.x, plane.z);

    // Terrain strike or ditching: the sortie ends here.
    if (plane.y <= ground + 0.6) {
      const strip = stripUnder(plane);
      if (strip) {
        const quality = evaluateTouchdown(plane, strip, ground);
        if (quality === 'crash') {
          plane.crashed = true;
          applyDamage(plane, 100);
          playCrashSound(audio);
          endSortie('crashed');
          return;
        }
        if (quality) {
          plane.landed = true;
          plane.y = ground;
          plane.speed = Math.max(0, plane.speed - 30 * dt);
          playLandingThud(audio, quality);
          stepMission(mission, plane, { landed: true, landingQuality: quality }, dt);
          if (mission.id === 'landing' || mission.returnedHome) endSortie('landed');
          return;
        }
      }
      plane.crashed = true;
      applyDamage(plane, 100);
      playCrashSound(audio);
      endSortie('crashed');
      return;
    }

    // Soft boundary: past the chart's edge the wind nudges the pilot back.
    if (plane.z > 4100 || plane.z < -260 || Math.abs(plane.x) > 880) {
      plane.heading += (0 - normalizeAngle(plane.heading)) * 0.4 * dt;
      if (mission.events[mission.events.length - 1] !== 'End of the chart — turn back') {
        mission.events.push('End of the chart — turn back');
      }
    }

    if (consumeDropCrate(input) && mission.mission.id === 'rescue') {
      stepMission(mission, plane, { dropCrate: true }, dt);
    }
    stepMission(mission, plane, {}, dt);
    if (mission.ringsHit > beforeRings) playRingChime(audio);
    if (mission.complete && mission.mission.id === 'rings') {
      // Rings done: the sortie ends when the pilot lands or the clock runs out.
      if (mission.elapsed > 200) endSortie('complete');
    }
    updateEngineSound(audio, plane);
  }

  function stripUnder(plane) {
    const near = (s) => Math.abs(plane.x - s.x) < s.halfWidth + 4 && plane.z > s.zStart - 10 && plane.z < s.zEnd + 10;
    if (near(RUNWAY)) return RUNWAY;
    if (near(FAR_STRIP)) return FAR_STRIP;
    return null;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (game.state === 'menu') {
      // Gentle drift for the title backdrop.
      game.time += STEP;
      game.plane.heading = 0.3 + Math.sin(game.time * 0.05) * 0.1;
      renderFrame();
      return;
    }
    if (game.state !== 'flying') {
      renderFrame();
      return;
    }
    if (!game.lastNow) game.lastNow = now;
    let elapsed = Math.min(0.1, (now - game.lastNow) / 1000);
    game.lastNow = now;
    game.accumulator += elapsed;
    while (game.accumulator >= STEP) {
      game.accumulator -= STEP;
      game.time += STEP;
      if (game.state === 'flying') stepWorld(STEP);
    }
    renderFrame();
  }

  function renderFrame() {
    const world = { terrain, heightGrid, clouds, mission: game.mission };
    renderChaseView(renderer, game.plane, world, game.time);
    if (game.state === 'flying' || game.state === 'paused' || game.state === 'ended') {
      game.mission.objective = objectiveText(game.mission, game.plane);
      drawHud(renderer, game.plane, game.mission, game.time);
    }
  }

  function poseScene(name) {
    const scene = SCENES[name];
    if (!scene) return false;
    game.scene = name;
    game.mission = makeMissionState(scene.mission);
    game.plane = makeAircraft();
    game.plane.x = scene.x;
    game.plane.y = scene.y;
    game.plane.z = scene.z;
    game.plane.heading = scene.heading;
    game.plane.speed = scene.speed;
    game.plane.throttle = scene.throttle;
    game.plane.onGround = false;
    game.time = scene.time;
    game.state = 'flying';
    overlay.classList.add('hidden');
    // Skip gates already behind the aircraft so the HUD names the gate
    // ahead of it, not one it has already passed.
    if (game.mission.rings.length > 0) {
      while (
        game.mission.nextRing < game.mission.rings.length &&
        game.mission.rings[game.mission.nextRing].z < game.plane.z - 10
      ) {
        game.mission.nextRing += 1;
      }
    }
    // Settle the world for a few fixed steps so the pose is stable.
    for (let i = 0; i < 30; i += 1) {
      game.time += STEP;
      stepMission(game.mission, game.plane, {}, STEP);
    }
    renderFrame();
    return true;
  }

  // Menu buttons.
  document.querySelectorAll('[data-mission]').forEach((button) => {
    button.addEventListener('click', () => {
      playClickSound(audio);
      startAudio(audio);
      showBriefing(button.dataset.mission);
    });
  });
  document.getElementById('start-button').addEventListener('click', () => {
    playClickSound(audio);
    beginSortie();
  });
  document.getElementById('back-button').addEventListener('click', () => {
    playClickSound(audio);
    showMenu();
  });
  document.getElementById('restart-button').addEventListener('click', () => {
    playClickSound(audio);
    beginSortie();
  });
  document.getElementById('menu-button').addEventListener('click', () => {
    playClickSound(audio);
    showMenu();
  });
  document.getElementById('pause-button').addEventListener('click', () => {
    if (game.state === 'flying') game.state = 'paused';
    else if (game.state === 'paused') game.state = 'flying';
  });

  attachInput(input, canvas, {
    onMute: () => toggleMute(audio),
    onPause: () => {
      if (game.state === 'flying') game.state = 'paused';
      else if (game.state === 'paused') game.state = 'flying';
    },
    onRestart: () => {
      if (game.state === 'flying' || game.state === 'ended') beginSortie();
    },
    onEscape: () => {
      if (game.state === 'flying') game.state = 'paused';
      else if (game.state === 'paused') game.state = 'flying';
    },
  });

  // Screenshot scenes render once, deterministically, without interaction.
  const params = new URLSearchParams(window.location.search);
  const scene = params.get('scene');
  if (scene && poseScene(scene)) {
    return;
  }

  showMenu();
  requestAnimationFrame(frame);
}

document.addEventListener('DOMContentLoaded', startGame);
