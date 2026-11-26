// Tradewind Courier: an island-hopping cargo flight game. The player is a
// bush pilot flying a twin-turboprop between the islands of the Meridian
// archipelago — rings to thread, a short strip to land on, medicine to drop,
// and a squall line to cross. Keyboard only, canvas only, no network.

import { DT } from './flight-physics.js';
import { createWorld, stepWorld, localStorm } from './world.js';
import { makeTerrainMesh, makeProjector, drawSky, drawSea, drawTerrain, drawRunway, drawRing, drawGroundMarker, drawClouds, drawRain, drawBox, RUNWAYS } from './render.js';
import { drawAircraft, drawAircraftShadow } from './aircraft.js';
import { drawHud } from './hud.js';
import { MISSION_LIST, makeMission } from './missions.js';
import { makeInput, attachInput, controlVector, wasPressed, clearPressed, isHeld } from './input.js';
import { makeAudio, startAudio, updateAudio, playEventSound } from './audio.js';
import { rainStreaks } from './weather.js';
import { stageShot, autopilot } from './shots.js';
import { drawParticles } from './particles.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? '7') || 7;
const SHOT = params.get('shot') || '';
const SHOT_MISSION = { cover: 'rings', landing: 'landing', drop: 'drop', storm: 'storm' }[SHOT] ?? 'rings';

const SCREEN_MENU = 'menu';
const SCREEN_PLAY = 'play';
const SCREEN_PAUSE = 'pause';
const SCREEN_OVER = 'over';

let screen = SCREEN_MENU;
let world = null;
let mesh = null;
let selected = 0;
let overTimer = 0;
let overReason = '';
let dpr = 1;

const input = makeInput();
attachInput(input, window);
const audio = makeAudio();

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
window.addEventListener('resize', resize);
resize();

function width() {
  return canvas.width / dpr;
}
function height() {
  return canvas.height / dpr;
}

function bestScores() {
  try {
    return JSON.parse(localStorage.getItem('twc-best') ?? '{}');
  } catch {
    return {};
  }
}

function saveBest(missionId, score) {
  try {
    const best = bestScores();
    if (score > (best[missionId] ?? 0)) {
      best[missionId] = score;
      localStorage.setItem('twc-best', JSON.stringify(best));
    }
  } catch {
    // storage unavailable (private mode, headless): best scores are a nicety
  }
}

function startMission(index) {
  const meta = MISSION_LIST[index];
  world = createWorld(SEED, meta.id);
  mesh = makeTerrainMesh(SEED);
  screen = SCREEN_PLAY;
  overTimer = 0;
  overReason = '';
  document.title = `Tradewind Courier — ${meta.name}`;
}

function toMenu() {
  world = createWorld(SEED, 'free');
  mesh = makeTerrainMesh(SEED);
  screen = SCREEN_MENU;
  document.title = 'Tradewind Courier';
}

/** One fixed step while playing. */
function stepOnce() {
  if (screen !== SCREEN_PLAY) return;
  const control = controlVector(input);
  control.drop = wasPressed(input, 'drop');
  const events = stepWorld(world, control, DT);
  if (wasPressed(input, 'camera')) {
    world.cameraMode = world.cameraMode === 'near' ? 'far' : 'near';
  }
  if (wasPressed(input, 'pause')) {
    screen = SCREEN_PAUSE;
  }
  if (wasPressed(input, 'restart')) {
    startMission(selected);
  }
  // sounds for the step's events
  for (const e of events) {
    if (e === 'touchdown') playEventSound(audio, 'touchdown');
    if (e === 'stall' || e === 'fuel-empty') playEventSound(audio, 'warning');
  }
  if (world.mission.message.startsWith('RING') && world.mission.messageAge < DT * 1.5) {
    playEventSound(audio, 'ring');
  }
  updateAudio(audio, world.ac, DT);
  if (world.ac.crashed || world.mission.done || world.mission.failed) {
    overTimer += DT;
    if (overTimer > 1.4) {
      screen = SCREEN_OVER;
      overReason = world.ac.crashed
        ? 'The Courier went down.'
        : world.mission.failed
          ? world.mission.failedReason
          : `Sortie complete — score ${world.mission.score}`;
      if (world.mission.done) saveBest(world.mission.id, world.mission.score);
    }
  }
  clearPressed(input);
}

function renderWorld() {
  const w = width();
  const h = height();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cam = world.cam;
  const project = makeProjector(cam, w, h);
  const storm = localStorm(world);
  drawSky(ctx, w, h, cam, world.time, storm);
  drawSea(ctx, project, w, h, cam, world.time);
  drawTerrain(ctx, project, mesh, cam);
  for (const rw of RUNWAYS) drawRunway(ctx, project, rw, world.time);
  // home field buildings: a hangar and a terminal hut by the main strip
  drawBox(ctx, project, -2685, 12, -640, 46, 14, 30, Math.PI, '#c9c2b2', '#8a4a2b');
  drawBox(ctx, project, -2685, 12, -560, 20, 8, 16, Math.PI, '#d8d2c2', '#5b6b7a');
  // mission markers
  const mission = world.mission;
  if (mission.id === 'rings') {
    mission.rings.forEach((ring, i) => {
      drawRing(ctx, project, ring, i === mission.ringIndex, world.time);
    });
  }
  if (mission.id === 'drop' && mission.dropsLeft > 0) {
    drawGroundMarker(ctx, project, mission.dropZone.x, mission.dropZone.z, SEED, '255, 122, 26', 'DROP ZONE', world.time, mission.dropZone.radius);
  }
  if (mission.id === 'storm') {
    drawGroundMarker(ctx, project, mission.beacon.x, mission.beacon.z, SEED, '255, 220, 80', 'BEACON', world.time, 90);
  }
  if (mission.id === 'landing') {
    drawGroundMarker(ctx, project, RUNWAYS[1].x, RUNWAYS[1].z, SEED, '64, 224, 255', 'KAIMANA', world.time, 60);
  }
  drawClouds(ctx, project, world.clouds, world.time, storm);
  drawParticles(ctx, project, world.particles);
  drawAircraftShadow(ctx, project, world.ac, SEED);
  if (storm > 0.25) {
    drawRain(ctx, project, rainStreaks(cam, world.time, SEED, 90));
  }
  // the aircraft, screen-space, banked with its roll
  const acW = Math.min(w * 0.32, h * 0.62);
  drawAircraft(ctx, w / 2, h * 0.62, acW, world.ac.roll, world.ac.pitch, world.time);
}

function renderMenu() {
  const w = width();
  const h = height();
  renderWorld();
  ctx.fillStyle = 'rgba(6, 20, 30, 0.45)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb042';
  ctx.font = 'bold 54px monospace';
  ctx.fillText('TRADEWIND COURIER', w / 2, h * 0.2);
  ctx.fillStyle = '#dceef5';
  ctx.font = '18px monospace';
  ctx.fillText('Island-hopping cargo pilot — Meridian Archipelago', w / 2, h * 0.2 + 32);
  const best = bestScores();
  ctx.textAlign = 'left';
  const listX = w / 2 - 330;
  let y = h * 0.36;
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#7fe7ff';
  ctx.fillText('CHOOSE A SORTIE  (keys 1-5, Enter to fly)', listX, y);
  y += 30;
  MISSION_LIST.forEach((m, i) => {
    const isSel = i === selected;
    if (isSel) {
      ctx.fillStyle = 'rgba(127, 231, 255, 0.16)';
      ctx.fillRect(listX - 12, y - 18, 684, 30);
      ctx.strokeStyle = '#7fe7ff';
      ctx.strokeRect(listX - 12, y - 18, 684, 30);
    }
    ctx.fillStyle = isSel ? '#ffffff' : '#cfe8f2';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`${i + 1}. ${m.name}`, listX, y);
    ctx.fillStyle = '#9fc6d4';
    ctx.font = '13px monospace';
    ctx.fillText(m.blurb, listX + 330, y);
    const b = best[m.id];
    if (b !== undefined) {
      ctx.fillStyle = '#ffb042';
      ctx.fillText(`best ${b}`, listX + 560, y);
    }
    y += 36;
  });
  ctx.fillStyle = '#9fc6d4';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Arrows fly • Shift/Ctrl throttle • Space airbrake • B drop crate • C camera • P pause • R restart', w / 2, h - 48);
  ctx.fillText('Fuel burns faster at full throttle. Mind the stall below 50 kt. Land gently or not at all.', w / 2, h - 26);
}

function renderOver() {
  const w = width();
  const h = height();
  renderWorld();
  ctx.fillStyle = 'rgba(6, 20, 30, 0.55)';
  ctx.fillRect(0, 0, w, h);
  const m = world.mission;
  ctx.textAlign = 'center';
  ctx.fillStyle = m.done ? '#59d867' : '#ff5a3c';
  ctx.font = 'bold 40px monospace';
  ctx.fillText(m.done ? 'SORTIE COMPLETE' : 'SORTIE FAILED', w / 2, h * 0.34);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px monospace';
  ctx.fillText(overReason, w / 2, h * 0.34 + 36);
  ctx.fillStyle = '#dceef5';
  ctx.font = '16px monospace';
  const mm = Math.floor(m.elapsed / 60);
  const ss = Math.floor(m.elapsed % 60).toString().padStart(2, '0');
  ctx.fillText(`SCORE ${m.score}    TIME ${mm}:${ss}    FUEL ${Math.round(world.ac.fuel)}%    DAMAGE ${Math.round(world.ac.damage)}%`, w / 2, h * 0.34 + 76);
  ctx.fillStyle = '#7fe7ff';
  ctx.fillText('R — fly again    M — mission select', w / 2, h * 0.34 + 116);
}

function render() {
  const w = width();
  const h = height();
  if (!world) return;
  if (screen === SCREEN_MENU) {
    renderMenu();
    return;
  }
  renderWorld();
  if (screen === SCREEN_PLAY || screen === SCREEN_PAUSE) {
    drawHud(ctx, w, h, world.ac, world.mission, world.time);
    if (screen === SCREEN_PAUSE) {
      ctx.fillStyle = 'rgba(6, 20, 30, 0.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', w / 2, h / 2);
      ctx.font = '15px monospace';
      ctx.fillText('P — resume    R — restart    M — mission select', w / 2, h / 2 + 34);
    }
  } else if (screen === SCREEN_OVER) {
    renderOver();
  }
}

// --- menu keys ---
function menuKeys() {
  if (wasPressed(input, 'confirm')) startMission(selected);
  for (let i = 0; i < MISSION_LIST.length; i += 1) {
    if (input.pressed.has(`Digit${i + 1}`)) {
      selected = i;
      startMission(selected);
    }
  }
  if (wasPressed(input, 'pitchDown')) selected = Math.min(MISSION_LIST.length - 1, selected + 1);
  if (wasPressed(input, 'pitchUp')) selected = Math.max(0, selected - 1);
  clearPressed(input);
}

function overKeys() {
  if (wasPressed(input, 'restart')) startMission(selected);
  if (input.pressed.has('KeyM')) toMenu();
  clearPressed(input);
}

function pauseKeys() {
  if (wasPressed(input, 'pause')) screen = SCREEN_PLAY;
  if (wasPressed(input, 'restart')) startMission(selected);
  if (input.pressed.has('KeyM')) toMenu();
  clearPressed(input);
}

// --- boot ---
// the hint bar shows the controls, not a permanent "loading" label
const hintEl = document.getElementById('hint');
if (hintEl) hintEl.textContent = 'Arrows: pitch / bank · Shift/Ctrl: throttle · Space: airbrake · B: drop · C: camera · P: pause · R: restart';
if (SHOT) {
  // Screenshot mode: stage the scene deterministically, render once, stop.
  world = createWorld(SEED, SHOT_MISSION);
  mesh = makeTerrainMesh(SEED);
  screen = SCREEN_PLAY;
  stageShot(world, SHOT);
  render();
  window.__shotReady = true;
  window.__flightGame = { world, screen, seed: SEED, shot: SHOT };
} else {
  toMenu();
  // attract mode: the menu world drifts on autopilot behind the title
  let acc = 0;
  let last = performance.now();
  const attract = (now) => {
    const dtMs = Math.min(100, now - last);
    last = now;
    acc += dtMs / 1000;
    startAudio(audio);
    // key handling first: it may change the screen, so re-check after
    if (screen === SCREEN_MENU) menuKeys();
    else if (screen === SCREEN_PAUSE) pauseKeys();
    else if (screen === SCREEN_OVER) overKeys();
    if (screen === SCREEN_MENU) {
      // gentle circling autopilot for the backdrop
      const target = { x: -2600, z: -2400 };
      const want = Math.atan2(target.x - world.ac.x, -(target.z - world.ac.z));
      let err = want - world.ac.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      const inputVec = {
        pitch: 0,
        roll: Math.max(-1, Math.min(1, err * 1.4)),
        yaw: 0,
        throttleDelta: 0,
        brake: false,
        drop: false,
      };
      let n = 0;
      while (acc >= DT && n < 5) {
        stepWorld(world, inputVec, DT);
        acc -= DT;
        n += 1;
      }
      if (world.ac.crashed || world.mission.failed) toMenu();
    } else if (screen === SCREEN_PLAY) {
      let n = 0;
      while (acc >= DT && n < 5) {
        stepOnce();
        acc -= DT;
        n += 1;
      }
    }
    render();
    requestAnimationFrame(attract);
  };
  requestAnimationFrame(attract);

  window.__flightGame = {
    get world() {
      return world;
    },
    get screen() {
      return screen;
    },
    seed: SEED,
    startMission,
    toMenu,
    stepOnce,
    // synchronous stepping for scripted tests (headless browsers throttle
    // requestAnimationFrame, so tests drive the world directly)
    stepSeconds(seconds, inputVec) {
      const vec = inputVec ?? { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, brake: false, drop: false };
      const steps = Math.round(seconds / DT);
      for (let i = 0; i < steps; i += 1) stepWorld(world, vec, DT);
      return {
        alt: world.ac.y, speed: world.ac.speed, fuel: world.ac.fuel,
        damage: world.ac.damage, heading: world.ac.heading,
        pitch: world.ac.pitch, roll: world.ac.roll,
        mission: world.mission.id, done: world.mission.done,
        failed: world.mission.failed, score: world.mission.score,
      };
    },
    inputKeys() {
      return [...input.keys];
    },
    // the screenshot autopilot, exposed so scripted tests can fly a whole
    // sortie with the real rules and prove a mission is completable
    autopilot,
    stepAutopilot(seconds, opts) {
      const steps = Math.round(seconds / DT);
      for (let i = 0; i < steps; i += 1) stepWorld(world, autopilot(world, opts), DT);
      return {
        alt: world.ac.y, speed: world.ac.speed, fuel: world.ac.fuel,
        damage: world.ac.damage, heading: world.ac.heading,
        x: world.ac.x, z: world.ac.z, vy: world.ac.vy,
        pitch: world.ac.pitch, roll: world.ac.roll,
        mission: world.mission.id, done: world.mission.done,
        failed: world.mission.failed, reason: world.mission.failedReason,
        score: world.mission.score, t: Math.round(world.time),
      };
    },
    version: 'tradewind-courier-1.0',
  };
  window.addEventListener('keydown', () => startAudio(audio), { once: true });
  window.addEventListener('pointerdown', () => startAudio(audio), { once: true });
}
