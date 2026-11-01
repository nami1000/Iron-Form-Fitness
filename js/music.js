// Original workout beats, synthesised live with the Web Audio API.
// No recordings or licensed music: every sound is generated in the browser,
// so it works offline and there are no copyright concerns.
//
// A lookahead scheduler queues 16th-note steps slightly ahead of time. Each
// session picks a random key and chord progression, and arrangement changes
// every 8 bars (layers drop in and out), so the music doesn't feel looped.
// Music "ducks" (drops to a low volume) whenever the coach is speaking.

let ctx = null;
export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

// ── iPhone / iPad audio unlock ──
// iOS only lets audio start inside a tap, and by default it routes Web Audio
// through the "ringer" channel, which the silent switch mutes (speech is not
// affected, which is why the coach can be heard but the beats can't).
// Fix: (1) ask for the "playback" audio session where supported (iOS 17+);
// (2) play a silent looping <audio> element, which moves the page onto the
// media channel on older iOS; (3) resume the context and play a 1-sample
// buffer synchronously inside the tap.
let keepAlive = null;
function silentWavUrl() {
  const rate = 8000; const n = 800; const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** Call synchronously from a tap/click handler. Safe to call repeatedly. */
export function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
  const c = audioCtx();
  if (!c) return;
  try {
    const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
  } catch { /* ignore */ }
  try {
    if (!keepAlive) {
      keepAlive = new Audio(silentWavUrl());
      keepAlive.loop = true; keepAlive.setAttribute('playsinline', ''); keepAlive.volume = 0.01;
    }
    if (keepAlive.paused) keepAlive.play().catch(() => {});
  } catch { /* ignore */ }
}

export const audioState = () => (ctx ? ctx.state : 'none');

// Unlock on every tap until audio is running (covers any button that starts sound).
if (typeof document !== 'undefined') {
  const onTap = () => { if (!ctx || ctx.state !== 'running' || !keepAlive || keepAlive.paused) unlockAudio(); };
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(ev, onTap, { capture: true, passive: true });
}

export const GENRES = {
  edm: { name: 'EDM / House', desc: 'Four-on-the-floor kick, rolling bass, bright arps', bpm: 128 },
  hiphop: { name: 'Hip-Hop', desc: 'Heavy 808s, crisp snares, laid-back swing', bpm: 92 },
  rock: { name: 'Rock', desc: 'Driving drums and distorted power chords', bpm: 140 },
  latin: { name: 'Latin / Reggaeton', desc: 'Dembow groove with plucky melodies', bpm: 98 },
  lofi: { name: 'Lo-fi Chill', desc: 'Warm, mellow beats for yoga and cool-downs', bpm: 78 },
};

// Minor-key progressions as scale degrees (0 = i).
const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 5, 6, 4], [0, 6, 5, 3], [0, 3, 4, 3]];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const ROOTS = [40, 41, 42, 43, 45, 38]; // MIDI bass roots (E2, F2, F#2, G2, A2, D2)
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const deg = (root, d, oct = 0) => root + MINOR[((d % 7) + 7) % 7] + 12 * (oct + Math.floor(d / 7));

class Engine {
  constructor() {
    this.genre = 'edm';
    this.volume = 0.5;
    this.playing = false;
    this.ducked = false;
    this.step = 0;
    this.timer = null;
  }

  ensure() {
    const c = audioCtx();
    if (!c) return null;
    if (!this.out) {
      this.out = c.createGain();
      this.out.gain.value = 0;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.out.connect(this.comp).connect(c.destination);
      // shared noise buffer for drums
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
      // distortion curve for rock guitars
      this.curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i += 1) { const x = (i / 512) - 1; this.curve[i] = Math.tanh(x * 6); }
    }
    return c;
  }

  newSong() {
    this.root = ROOTS[Math.floor(Math.random() * ROOTS.length)];
    this.prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
    this.arp = Array.from({ length: 16 }, () => [0, 2, 4, 7, 4, 2][Math.floor(Math.random() * 6)]);
    this.melody = Array.from({ length: 16 }, (_, i) => (Math.random() < (i % 4 === 0 ? 0.7 : 0.3) ? [0, 2, 4, 5, 7][Math.floor(Math.random() * 5)] : null));
  }

  setGenre(g) { if (GENRES[g]) this.genre = g; }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.applyGain(0.2); }

  applyGain(t = 0.25) {
    if (!this.out) return;
    const c = this.ensure();
    const target = !this.playing ? 0 : this.ducked ? this.volume * 0.12 : this.volume * 0.9;
    this.out.gain.cancelScheduledValues(c.currentTime);
    this.out.gain.setTargetAtTime(target, c.currentTime, t);
  }

  duck(on) { this.ducked = on; this.applyGain(on ? 0.06 : 0.5); }

  start(genre) {
    const c = this.ensure();
    if (!c) return;
    if (genre) this.setGenre(genre);
    if (this.playing) { this.applyGain(); return; }
    this.newSong();
    this.playing = true;
    this.step = 0;
    this.nextTime = c.currentTime + 0.08;
    this.applyGain(0.4);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.playing = false;
    this.applyGain(0.15);
    clearInterval(this.timer); this.timer = null;
  }

  get stepDur() { return 60 / GENRES[this.genre].bpm / 4; }

  schedule() {
    const c = ctx;
    while (this.nextTime < c.currentTime + 0.12) {
      let t = this.nextTime;
      const s = this.step % 16;
      if (this.genre === 'hiphop' && s % 2 === 1) t += this.stepDur * 0.18; // swing
      this.playStep(s, Math.floor(this.step / 16), t);
      this.nextTime += this.stepDur;
      this.step += 1;
    }
  }

  // ───── instruments ─────
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  kick(t, vol = 1, len = 0.35) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.003, 0.9 * vol, len);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + len + 0.05);
  }

  noiseHit(t, { type = 'highpass', freq = 7000, q = 1, vol = 0.3, dec = 0.05 }) {
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); this.env(g, t, 0.002, vol, dec);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5); src.stop(t + dec + 0.05);
  }

  snare(t, vol = 0.5) {
    this.noiseHit(t, { type: 'bandpass', freq: 1800, q: 0.7, vol, dec: 0.16 });
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 190; this.env(g, t, 0.002, vol * 0.5, 0.09);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.15);
  }

  clap(t, vol = 0.45) {
    for (const off of [0, 0.012, 0.024]) this.noiseHit(t + off, { type: 'bandpass', freq: 1300, q: 1.2, vol, dec: off === 0.024 ? 0.18 : 0.02 });
  }

  hat(t, vol = 0.12, open = false) { this.noiseHit(t, { freq: 8000, vol, dec: open ? 0.16 : 0.035 }); }

  tone(t, midi, { type = 'sawtooth', dur = 0.2, vol = 0.2, cutoff = 1200, q = 4, detune = 0, attack = 0.005, dist = false }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(midi); o.detune.value = detune;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.Q.value = q;
    const g = ctx.createGain(); this.env(g, t, attack, vol, dur);
    let node = o.connect(f);
    if (dist) { const ws = ctx.createWaveShaper(); ws.curve = this.curve; node = node.connect(ws); }
    node.connect(g).connect(this.out);
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  chord(t, degree, opts) {
    for (const d of [0, 2, 4]) this.tone(t, deg(this.root + 12, degree + d), opts);
  }

  playStep(s, bar, t) {
    const chordDeg = this.prog[Math.floor(bar / 1) % 4];
    const section = Math.floor(bar / 8) % 4; // 0 intro-ish, 1 full, 2 breakdown, 3 full+
    const full = section !== 2;
    const bassNote = deg(this.root, chordDeg);
    const sd = this.stepDur;
    switch (this.genre) {
      case 'edm': {
        if (s % 4 === 0 && (full || s === 0)) this.kick(t);
        if (s === 4 || s === 12) this.clap(t);
        if (s % 4 === 2) this.hat(t, 0.13, true);
        else if (section === 3) this.hat(t, 0.05);
        if (s % 2 === 1) this.tone(t, bassNote, { dur: sd * 1.2, vol: 0.28, cutoff: 600 + 400 * (s % 4 === 3), q: 6 });
        if (section >= 1) this.tone(t, deg(this.root + 24, chordDeg + this.arp[s]), { type: 'square', dur: sd * 0.9, vol: 0.06, cutoff: 2600 });
        if (s === 0 && section !== 0) this.chord(t, chordDeg, { dur: sd * 14, vol: 0.035, cutoff: 900, attack: 0.08, detune: 8 });
        break;
      }
      case 'hiphop': {
        if ([0, 7, 10].includes(s) && full) { this.kick(t, 1, 0.5); this.tone(t, bassNote - 12, { type: 'sine', dur: sd * 5, vol: 0.45, cutoff: 300, q: 1 }); }
        if (s === 0 && !full) this.kick(t, 0.8, 0.5);
        if (s === 4 || s === 12) this.snare(t, 0.55);
        if (s % 2 === 0) this.hat(t, s % 4 === 0 ? 0.1 : 0.06);
        if (section === 3 && s >= 13) this.hat(t, 0.05);
        if (s === 0 || s === 8) this.chord(t, chordDeg, { type: 'triangle', dur: sd * 6, vol: 0.05, cutoff: 1500, attack: 0.01 });
        if (section >= 1 && this.melody[s] != null) this.tone(t, deg(this.root + 24, chordDeg + this.melody[s]), { type: 'triangle', dur: sd * 1.5, vol: 0.06, cutoff: 3000 });
        break;
      }
      case 'rock': {
        if ([0, 8, 10].includes(s) || (section === 3 && s === 14)) this.kick(t, 1, 0.25);
        if (s === 4 || s === 12) this.snare(t, 0.6);
        if (s % 2 === 0) this.hat(t, 0.08);
        if (full && s % 2 === 0) {
          for (const iv of [0, 7, 12]) this.tone(t, bassNote + 12 + iv, { dur: sd * 1.6, vol: 0.05, cutoff: 2400, q: 1, dist: true });
        } else if (!full && s % 4 === 0) {
          for (const iv of [0, 7]) this.tone(t, bassNote + 12 + iv, { dur: sd * 3, vol: 0.04, cutoff: 1500, q: 1, dist: true });
        }
        if (s % 2 === 0) this.tone(t, bassNote, { dur: sd * 1.4, vol: 0.22, cutoff: 700, q: 2 });
        break;
      }
      case 'latin': {
        if (s % 4 === 0) this.kick(t, 0.95, 0.3);
        if ([3, 6, 11, 14].includes(s)) this.snare(t, 0.4);
        if (s % 2 === 0) this.hat(t, 0.07);
        if ([0, 3, 8, 11].includes(s)) this.tone(t, bassNote, { type: 'square', dur: sd * 2, vol: 0.18, cutoff: 500, q: 2 });
        if (full && this.melody[s] != null) this.tone(t, deg(this.root + 24, chordDeg + this.melody[s]), { type: 'triangle', dur: sd * 1.2, vol: 0.09, cutoff: 4000 });
        if (s === 0 || s === 8) this.chord(t, chordDeg, { type: 'square', dur: sd * 0.8, vol: 0.03, cutoff: 1800 });
        break;
      }
      default: { // lofi
        if (s === 0 || s === 10) this.kick(t, 1, 0.35);
        if (s === 4 || s === 12) this.snare(t, 0.5);
        if (s % 2 === 0) this.hat(t, 0.08);
        if (s === 0) this.chord(t, chordDeg, { type: 'triangle', dur: sd * 15, vol: 0.13, cutoff: 1100, attack: 0.15, q: 1 });
        if (s === 0) this.tone(t, bassNote, { type: 'sine', dur: sd * 12, vol: 0.45, cutoff: 400, q: 1, attack: 0.02 });
        if (section !== 0 && this.melody[s] != null && s % 2 === 0) this.tone(t, deg(this.root + 24, chordDeg + this.melody[s]), { type: 'sine', dur: sd * 3, vol: 0.12, cutoff: 2200, attack: 0.02 });
      }
    }
  }
}

export const music = new Engine();

/** Genre for a given session phase, honouring the "calm music for yoga & cool-down" option. */
export function genreFor(settings, sessionType, phase) {
  if (settings.calmForYoga && (sessionType === 'yoga' || sessionType === 'recovery' || phase === 'cooldown')) return 'lofi';
  return settings.musicGenre || 'edm';
}
