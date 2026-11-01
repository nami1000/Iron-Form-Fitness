// Coach voices (Web Speech API) and countdown beeps (Web Audio).
// Uses the voices installed on the device, so no audio is sent anywhere.
import { music, audioCtx } from './music.js';

let talking = 0;
const talkStart = () => { talking += 1; music.duck(true); };
const talkEnd = () => { talking = Math.max(0, talking - 1); if (!talking) music.duck(false); };

export const COACHES = {
  sgt: { name: 'Sgt. Steel', desc: 'Deep, commanding drill instructor', pitch: 0.7, rate: 1.0, prefer: 'male', sample: 'Listen up, recruit! Form first, then speed. Let\'s move!' },
  nova: { name: 'Capt. Nova', desc: 'Bright, high-energy and upbeat', pitch: 1.25, rate: 1.08, prefer: 'female', sample: 'Hey superstar! You\'ve got this. Big energy, clean reps, let\'s go!' },
  sage: { name: 'Coach Sage', desc: 'Calm, steady and encouraging', pitch: 1.0, rate: 0.9, prefer: 'any', sample: 'Breathe in. Stand tall. We\'ll take this one strong, steady rep at a time.' },
  off: { name: 'Text only', desc: 'No voice, on-screen cues only', pitch: 1, rate: 1, prefer: 'any', sample: '' },
};

const MALE = ['male', 'daniel', 'alex', 'fred', 'david', 'mark', 'james', 'george', 'guy', 'aaron', 'arthur', 'rishi', 'thomas', 'oliver', 'gordon', 'ryan', 'eric', 'christopher', 'roger'];
const FEMALE = ['female', 'samantha', 'victoria', 'karen', 'zira', 'susan', 'moira', 'tessa', 'fiona', 'serena', 'allison', 'ava', 'kate', 'jenny', 'aria', 'emma', 'libby', 'sonia', 'natasha', 'michelle', 'google us english'];

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];

export function loadVoices() {
  if (!synth) return Promise.resolve([]);
  return new Promise((resolve) => {
    const got = () => { voices = synth.getVoices().filter((v) => /^en/i.test(v.lang)); resolve(voices); };
    const v = synth.getVoices();
    if (v.length) { got(); return; }
    synth.addEventListener?.('voiceschanged', got, { once: true });
    setTimeout(got, 1200);
  });
}

export const englishVoices = () => voices;

function chooseVoice(coach, override) {
  if (override) { const v = voices.find((x) => x.name === override); if (v) return v; }
  if (!voices.length) return null;
  const c = COACHES[coach] || COACHES.sgt;
  const has = (v, list) => list.some((n) => v.name.toLowerCase().includes(n));
  let pool = voices;
  if (c.prefer === 'male') pool = voices.filter((v) => has(v, MALE) && !has(v, ['female']));
  if (c.prefer === 'female') pool = voices.filter((v) => has(v, FEMALE));
  if (!pool.length) pool = voices;
  return pool.find((v) => v.localService) || pool[0];
}

export class Voice {
  constructor(settings) { this.configure(settings); }

  configure(settings) {
    this.settings = settings;
    this.coach = COACHES[settings.coach] ? settings.coach : 'sgt';
    this.voice = chooseVoice(this.coach, settings.systemVoice);
  }

  get enabled() { return !!synth && this.coach !== 'off'; }

  /** Speak; resolves when finished (or immediately if voice is off). */
  say(text, { interrupt = false } = {}) {
    if (!this.enabled || !text) return Promise.resolve();
    if (interrupt) { synth.cancel(); talking = 0; }
    const c = COACHES[this.coach];
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.pitch = c.pitch;
      u.rate = c.rate * (this.settings.speechRate || 1);
      let ended = false;
      const done = () => { if (ended) return; ended = true; talkEnd(); resolve(); };
      talkStart();
      u.onend = done; u.onerror = done;
      synth.speak(u);
      // safety net if onend never fires (some browsers)
      setTimeout(done, 2000 + text.length * 110);
    });
  }

  get speaking() { return !!synth && synth.speaking; }
  stop() { if (synth) synth.cancel(); talking = 0; music.duck(false); }
  pause() { if (synth) synth.pause(); }
  resume() { if (synth) synth.resume(); }
}

export function beep(freq = 880, dur = 0.12, vol = 0.18) {
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch { /* audio unavailable */ }
}
export { unlockAudio } from './music.js';
