// Procedural sound for Tradewind Courier: no audio files, everything is
// WebAudio oscillators and filtered noise, started on the first user gesture
// (browsers refuse audio before that). Engine hum follows throttle, wind
// follows airspeed, and the game beeps for rings, warnings and landings.

export function makeAudio() {
  return {
    ctx: null,
    engine: null,
    engineGain: null,
    wind: null,
    windGain: null,
    windFilter: null,
    started: false,
    muted: false,
  };
}

/** Start the audio graph. Call from a user gesture (key/click). */
export function startAudio(audio) {
  if (audio.started) return;
  try {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    audio.ctx = ctx;
    // engine: two detuned saws through a lowpass, gain follows throttle
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 62;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 93;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    osc1.connect(filt);
    osc2.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    osc1.start();
    osc2.start();
    audio.engine = [osc1, osc2];
    audio.engineGain = gain;
    audio.engineFilter = filt;
    // wind: looped noise buffer through a bandpass
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 480;
    band.Q.value = 0.6;
    const wgain = ctx.createGain();
    wgain.gain.value = 0.0;
    noise.connect(band);
    band.connect(wgain);
    wgain.connect(ctx.destination);
    noise.start();
    audio.windGain = wgain;
    audio.windFilter = band;
    audio.started = true;
  } catch {
    audio.started = false;
  }
}

/** Per-frame audio update: throttle -> engine, airspeed -> wind. */
export function updateAudio(audio, ac, dt) {
  if (!audio.started || audio.muted || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  const thr = ac.engineOut ? 0 : ac.throttle;
  audio.engineGain.gain.setTargetAtTime(0.02 + thr * 0.05, t, 0.1);
  audio.engine[0].frequency.setTargetAtTime(52 + thr * 62, t, 0.1);
  audio.engine[1].frequency.setTargetAtTime(78 + thr * 90, t, 0.1);
  audio.engineFilter.frequency.setTargetAtTime(240 + thr * 700, t, 0.1);
  const wind = Math.min(1, ac.speed / 95);
  audio.windGain.gain.setTargetAtTime(wind * 0.06, t, 0.15);
  audio.windFilter.frequency.setTargetAtTime(320 + wind * 900, t, 0.15);
}

/** One short beep: `freq` Hz for `dur` seconds, quiet by default. */
export function beep(audio, freq, dur, vol) {
  if (!audio.started || audio.muted || !audio.ctx) return;
  try {
    const ctx = audio.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol ?? 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur ?? 0.12));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (dur ?? 0.12));
  } catch {
    // audio is decoration: never let it break the game
  }
}

/** Two-note chime for a ring, a low thud for a touchdown. */
export function playEventSound(audio, event) {
  if (event === 'ring') {
    beep(audio, 880, 0.09, 0.14);
    setTimeout(() => beep(audio, 1318, 0.14, 0.14), 90);
  } else if (event === 'touchdown') {
    beep(audio, 196, 0.2, 0.16);
  } else if (event === 'warning') {
    beep(audio, 440, 0.1, 0.12);
    setTimeout(() => beep(audio, 440, 0.1, 0.12), 160);
  }
}
