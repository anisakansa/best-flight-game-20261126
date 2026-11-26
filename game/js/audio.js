// Sound for Skyline Cargo: every sound is synthesised with the Web Audio
// API, so the game ships no audio files at all. The engine hum follows the
// throttle, rings chime, a landing thuds, and a crash crunches. Audio starts
// only after the pilot's first input, as browsers require.

export function makeAudio() {
  const state = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    windGain: null,
    muted: false,
    started: false,
  };
  return state;
}

export function startAudio(state) {
  if (state.started) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.ctx = new AudioCtx();
    state.master = state.ctx.createGain();
    state.master.gain.value = 0.5;
    state.master.connect(state.ctx.destination);
    // Engine: two detuned saws through a low-pass, pitched by throttle.
    state.engineOsc = state.ctx.createOscillator();
    state.engineOsc.type = 'sawtooth';
    state.engineOsc.frequency.value = 52;
    const engineFilter = state.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    state.engineGain = state.ctx.createGain();
    state.engineGain.gain.value = 0.0;
    state.engineOsc.connect(engineFilter);
    engineFilter.connect(state.engineGain);
    state.engineGain.connect(state.master);
    state.engineOsc.start();
    // Wind: looped filtered noise whose level follows airspeed.
    const buffer = state.ctx.createBuffer(1, state.ctx.sampleRate * 2, state.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const windSrc = state.ctx.createBufferSource();
    windSrc.buffer = buffer;
    windSrc.loop = true;
    const windFilter = state.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    state.windGain = state.ctx.createGain();
    state.windGain.gain.value = 0.0;
    windSrc.connect(windFilter);
    windFilter.connect(state.windGain);
    state.windGain.connect(state.master);
    windSrc.start();
    state.started = true;
  } catch (err) {
    // Audio is decoration: a browser without it still plays the game.
    state.started = false;
  }
}

// Called every frame with the live flight state.
export function updateEngineSound(state, plane) {
  if (!state.started || state.muted) return;
  const t = state.ctx.currentTime;
  state.engineGain.gain.setTargetAtTime(plane.onGround && plane.throttle < 0.05 ? 0.0 : 0.05 + plane.throttle * 0.09, t, 0.1);
  state.engineOsc.frequency.setTargetAtTime(48 + plane.throttle * 70 + plane.speed * 0.4, t, 0.1);
  state.windGain.gain.setTargetAtTime(Math.min(0.12, plane.speed * 0.0012), t, 0.15);
}

function blip(state, frequency, duration, type, volume) {
  if (!state.started || state.muted) return;
  const t = state.ctx.currentTime;
  const osc = state.ctx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.value = frequency;
  const gain = state.ctx.createGain();
  gain.gain.setValueAtTime(volume || 0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(state.master);
  osc.start(t);
  osc.stop(t + duration);
}

export function playRingChime(state) {
  blip(state, 880, 0.35, 'sine', 0.25);
  setTimeout(() => blip(state, 1318, 0.4, 'sine', 0.2), 90);
}

export function playLandingThud(state, quality) {
  const volume = quality === 'perfect' ? 0.12 : quality === 'firm' ? 0.22 : 0.32;
  blip(state, 90, 0.3, 'triangle', volume);
}

export function playCrashSound(state) {
  blip(state, 60, 0.7, 'sawtooth', 0.3);
  blip(state, 45, 0.9, 'square', 0.2);
}

export function playClickSound(state) {
  blip(state, 660, 0.08, 'sine', 0.12);
}

export function toggleMute(state) {
  state.muted = !state.muted;
  if (state.master) state.master.gain.value = state.muted ? 0 : 0.5;
  return state.muted;
}
