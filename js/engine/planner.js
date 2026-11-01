// Plan + session builder.
//
// Safety rules applied to every exercise before it can be scheduled:
//  1. Level window (ex.lv) must include the user's level.
//  2. All required equipment must be owned (dumbbells must have a safe weight).
//  3. Any exercise stressing a user's issue area at ≥ 2 is excluded.
//  4. Jumping / impact moves are excluded for beginners, for knee / ankle /
//     hip / back issues, and when the health-readiness check raised a flag.
//  5. Exercises the user reported pain on are never scheduled again
//     (until they clear them in Settings).
//  6. Every session starts with a warm-up and ends with a cool-down.

import { EXERCISES, BY_ID } from '../data/exercises.js';
import { metKcal, pickDumbbell, DAY_MS } from './calc.js';

export const LEVELS = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
const IMPACT_BLOCKERS = ['knee', 'ankle', 'hip', 'back'];

export const DAY_TYPES = {
  upper: { label: 'Upper Body Strength', short: 'Upper', icon: '💪', kind: 'strength' },
  lower: { label: 'Lower Body Strength', short: 'Lower', icon: '🦵', kind: 'strength' },
  full: { label: 'Full Body Strength', short: 'Full', icon: '🎖️', kind: 'strength' },
  cardio: { label: 'Cardio Intervals', short: 'Cardio', icon: '🔥', kind: 'cardio' },
  dance: { label: 'Dance Cardio', short: 'Dance', icon: '💃', kind: 'dance' },
  yoga: { label: 'Yoga & Mobility', short: 'Yoga', icon: '🧘', kind: 'yoga' },
  rest: { label: 'Rest & Recover', short: 'Rest', icon: '🛌', kind: 'rest' },
};

// Weekly rotation by number of training days. Every template includes at
// least one full rest day; yoga days double as active recovery.
export const WEEK_TEMPLATES = {
  3: ['full', 'rest', 'dance', 'rest', 'full', 'yoga', 'rest'],
  4: ['upper', 'lower', 'rest', 'dance', 'full', 'yoga', 'rest'],
  5: ['upper', 'lower', 'dance', 'yoga', 'full', 'cardio', 'rest'],
  6: ['upper', 'lower', 'cardio', 'yoga', 'full', 'dance', 'rest'],
};

// ───────── helpers ─────────
export function dateKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function dayIndex(plan, d) { return Math.round((parseKey(dateKey(d)) - parseKey(plan.startDate)) / DAY_MS); }

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ───────── safety filter ─────────
export function effectiveLevel(profile) {
  // A raised health-readiness flag caps intensity at beginner level.
  return profile.readinessFlag ? 1 : profile.level;
}

export function exclusionReason(ex, profile, avoid = []) {
  const lv = effectiveLevel(profile);
  if (avoid.includes(ex.id)) return 'You reported discomfort on this one';
  if (lv < ex.lv[0]) return 'Above your current level';
  if (lv > ex.lv[1]) return 'You\'ve outgrown this; a harder version is used';
  const owned = new Set([...(profile.equipment || []), 'none']);
  for (const e of ex.equip) if (!owned.has(e)) return `Needs ${e}`;
  if (ex.equip.includes('dumbbells') && pickDumbbell(profile.dumbbells, ex.db, lv) == null) return 'No dumbbell in a safe weight range';
  for (const area of profile.issues || []) {
    if ((ex.stress[area] || 0) >= 2) return `Loads your ${area}`;
  }
  if (ex.impact) {
    if (lv < 2) return 'Jumping is not used at beginner level';
    if (profile.readinessFlag) return 'Jumping is off while the health check is flagged';
    const hit = (profile.issues || []).find((a) => IMPACT_BLOCKERS.includes(a));
    if (hit) return `Jumping avoided to protect your ${hit}`;
  }
  return null;
}

export const isEligible = (ex, profile, avoid) => exclusionReason(ex, profile, avoid) === null;

export function cautions(ex, profile) {
  return (profile.issues || []).filter((a) => (ex.stress[a] || 0) === 1);
}

export function eligiblePool(profile, avoid = []) {
  return EXERCISES.filter((ex) => isEligible(ex, profile, avoid));
}

// ───────── timing ─────────
export const DEFAULT_REST = 30; // seconds between sets (user-adjustable)
export const FLAGGED_MIN_REST = 45; // when the health check raised a flag
const INTERVALS = [[30, 30], [40, 20], [45, 15]];

export function itemSeconds(item) {
  const ex = BY_ID[item.exId];
  const work = item.mode === 'reps' ? item.reps * ex.tempo : item.secs;
  const sides = item.uni ? 2 : 1;
  const perSet = work * sides + (item.uni ? 5 : 0) + (item.mode === 'reps' ? 6 : 3);
  return item.sets * perSet + (item.sets - 1) * item.rest + (item.restAfter || 0);
}

export function workSeconds(item) {
  const ex = BY_ID[item.exId];
  const work = item.mode === 'reps' ? item.reps * ex.tempo : item.secs;
  return item.sets * work * (item.uni ? 2 : 1);
}

export function sessionSeconds(session) {
  return session.items.reduce((s, it) => s + itemSeconds(it), 0);
}

export function estimateKcal(session, kg) {
  let kcal = 0;
  for (const it of session.items) {
    const ex = BY_ID[it.exId];
    const w = workSeconds(it);
    kcal += metKcal(ex.met, kg, w);
    kcal += metKcal(1.8, kg, Math.max(0, itemSeconds(it) - w));
  }
  return Math.round(kcal);
}

// ───────── progression ─────────
export function progression(plan, date, intensity = 1) {
  const idx = Math.max(0, dayIndex(plan, date));
  const week = Math.floor(idx / 7);
  const inBlock = week % 4;
  const block = Math.floor(week / 4);
  const deload = inBlock === 3;
  const factor = deload ? 0.9 : Math.min(1.5, (1 + 0.06 * inBlock + 0.05 * block) * intensity);
  return { week: week + 1, deload, factor };
}

function makeItem(ex, profile, prog, phase, opts = {}) {
  const lv = effectiveLevel(profile);
  const li = lv - 1;
  const chosen = profile.restSec || DEFAULT_REST;
  const restBase = profile.readinessFlag ? Math.max(FLAGGED_MIN_REST, chosen) : chosen;
  const baseSets = phase === 'main' ? [2, 3, 3][li] : 1;
  let sets = opts.sets ?? Math.max(1, baseSets - (prog.deload && phase === 'main' ? 1 : 0));
  const scale = phase === 'main' ? prog.factor : 1;
  const item = {
    exId: ex.id, phase, mode: ex.mode, uni: !!ex.uni, sets,
    rest: opts.rest ?? (phase === 'main' ? restBase : 0),
    restAfter: opts.restAfter ?? (phase === 'main' ? 20 : 5),
    cautions: cautions(ex, profile),
  };
  if (ex.mode === 'reps') {
    const base = ex.reps[li];
    item.reps = Math.max(4, Math.round(base * scale));
    if (ex.cycleReps === 2 && item.reps % 2) item.reps += 1;
  } else {
    item.secs = opts.secs ?? Math.round((ex.secs[li] * scale) / 5) * 5;
  }
  if (ex.equip.includes('dumbbells')) item.weightKg = pickDumbbell(profile.dumbbells, ex.db, lv);
  if (opts.label) item.label = opts.label;
  return item;
}

function pick(pool, r, scoreFn, used) {
  const scored = pool.filter((e) => !used.has(e.id)).map((e) => ({ e, s: scoreFn(e) + r() * 1.6 }));
  if (!scored.length) return null;
  scored.sort((a, b) => b.s - a.s);
  return scored[0].e;
}

function focusScore(profile) {
  const focus = (profile.focus || []).filter((f) => f !== 'full');
  return (ex) => (focus.length ? ex.focus.filter((f) => focus.includes(f)).length * 1.4 : 0);
}

// ───────── warm-up / cool-down ─────────
function warmup(profile, pool, r, prog, seconds, type) {
  const items = [];
  const used = new Set();
  let wp = pool.filter((e) => e.cat === 'warmup');
  // dance & cardio days start with marching; strength days hinge/mobility
  const prefer = type === 'upper' ? ['arm_circles', 'shoulder_rolls'] : type === 'lower' ? ['leg_swings', 'good_morning', 'hip_circles'] : ['march'];
  let t = 0;
  const first = wp.find((e) => e.id === 'march');
  const order = [];
  if (first) order.push(first);
  for (const id of prefer) { const e = wp.find((x) => x.id === id); if (e && !order.includes(e)) order.push(e); }
  wp = wp.filter((e) => !order.includes(e)).sort(() => r() - 0.5);
  for (const e of [...order, ...wp]) {
    if (t >= seconds) break;
    if (used.has(e.id)) continue;
    const it = makeItem(e, profile, prog, 'warmup', { restAfter: 5 });
    if (items.length && t + itemSeconds(it) > seconds + 10) continue;
    items.push(it); used.add(e.id); t += itemSeconds(it);
  }
  return items;
}

// Which trained muscle groups each cool-down stretch actually lengthens
// (same vocabulary as exercise.muscles). Used to match the cool-down to the
// muscles worked in that day's main block.
export const STRETCH_TARGETS = {
  hamstring_band: ['Hamstrings', 'Calves', 'Glutes'],
  quad_stretch: ['Quads', 'Hip flexors'],
  calf_stretch: ['Calves', 'Ankles'],
  chest_wall: ['Chest', 'Shoulders', 'Biceps', 'Forearms'],
  cross_body: ['Shoulders', 'Rear delts', 'Upper back'],
  triceps_stretch: ['Triceps', 'Lats', 'Shoulders'],
  side_stretch: ['Obliques', 'Lats', 'Core'],
  neck_release: ['Neck', 'Upper back'],
  knees_to_chest: ['Lower back', 'Glutes'],
  figure_four: ['Glutes', 'Hips', 'Abductors'],
  child_pose: ['Lower back', 'Lats', 'Hips', 'Adductors', 'Shoulders'],
  seated_fold: ['Hamstrings', 'Lower back', 'Calves'],
  sphinx: ['Core', 'Hip flexors', 'Chest'],
};
// Muscles with no meaningful stretch (or that aren't muscles) are ignored.
export const NOT_STRETCHED = new Set(['Heart & lungs', 'Full body', 'Mind & breath', 'Spine', 'Legs']);

export function mainMuscleLoad(items) {
  const load = {};
  for (const it of items) {
    if (it.phase !== 'main') continue;
    const ex = BY_ID[it.exId];
    const w = it.sets * (it.uni ? 2 : 1);
    for (const m of ex.muscles) if (!NOT_STRETCHED.has(m)) load[m] = (load[m] || 0) + w;
  }
  return load;
}

function cooldown(profile, pool, r, prog, seconds, mainItems) {
  const avail = Object.keys(STRETCH_TARGETS).map((id) => pool.find((e) => e.id === id)).filter(Boolean);
  const load = mainMuscleLoad(mainItems);
  const covered = new Set();
  const items = []; const used = new Set(); let t = 0;
  // Greedy cover: repeatedly take the stretch that lengthens the most
  // still-uncovered training volume, until the cool-down time is used.
  while (t < seconds) {
    let best = null; let bestGain = 0;
    for (const e of avail) {
      if (used.has(e.id)) continue;
      const cost = itemSeconds(makeItem(e, profile, prog, 'cooldown', { restAfter: 5, secs: e.uni ? 20 : undefined }));
      if (items.length && t + cost > seconds + 10) continue; // only stretches that still fit
      // squared load: the most-worked muscles are stretched first
      const raw = STRETCH_TARGETS[e.id].reduce((g, m) => g + (covered.has(m) ? 0 : (load[m] || 0) ** 2), 0);
      const gain = raw ? raw / (e.uni ? 1.5 : 1) + r() * 0.01 : 0; // prefer coverage per minute
      if (gain > bestGain) { best = e; bestGain = gain; }
    }
    if (!best || bestGain < 0.25) {
      // everything worked is stretched: finish with general relaxers
      best = ['knees_to_chest', 'neck_release', 'side_stretch', 'child_pose'].map((id) => avail.find((e) => e.id === id && !used.has(id))).find(Boolean);
      if (best && items.length && t + itemSeconds(makeItem(best, profile, prog, 'cooldown', { restAfter: 5, secs: best.uni ? 20 : undefined })) > seconds + 10) break;
      if (!best) break;
    }
    used.add(best.id);
    // 20 s per side for one-sided stretches (within the 10–30 s hold guideline)
    const it = makeItem(best, profile, prog, 'cooldown', { restAfter: 5, secs: best.uni ? 20 : undefined });
    if (items.length && t + itemSeconds(it) > seconds + 10) continue;
    items.push(it); t += itemSeconds(it);
    STRETCH_TARGETS[best.id].forEach((m) => covered.add(m));
  }
  return items;
}

// ───────── main blocks ─────────
const PATTERNS = {
  upper: ['upper', 'core', 'upper', 'upper', 'core', 'upper', 'upper', 'core'],
  lower: ['lower', 'core', 'lower', 'lower', 'core', 'lower', 'lower', 'core'],
  full: ['lower', 'upper', 'core', 'lower', 'upper', 'core', 'full', 'upper', 'lower'],
};

function strengthMain(profile, pool, r, prog, seconds, type) {
  const items = [];
  const used = new Set();
  const fs = focusScore(profile);
  const byRegion = (reg) => pool.filter((e) => (e.cat === 'strength' || e.cat === 'core') && (e.region === reg || (reg !== 'core' && e.region === 'full')));
  let t = 0;
  const covered = new Set();
  for (const reg of PATTERNS[type]) {
    const cand = byRegion(reg);
    // favour focus areas, loaded moves, and muscles not yet trained this session (balance push/pull)
    const ex = pick(cand, r, (e) => fs(e) + (e.equip.includes('dumbbells') ? 0.4 : 0)
      + 0.7 * e.muscles.filter((m) => !covered.has(m)).length - (e.muscles.length ? 0.35 * e.muscles.length : 0), used);
    if (!ex) continue;
    const it = makeItem(ex, profile, prog, 'main');
    while (it.sets > 1 && t + itemSeconds(it) > seconds * 1.05) it.sets -= 1;
    const s = itemSeconds(it);
    if (t + s > seconds * 1.05 && items.length >= 2) break;
    items.push(it); used.add(ex.id); t += s;
    ex.muscles.forEach((m) => covered.add(m));
  }
  // use leftover time: add sets round-robin (max 4)
  let guard = 0;
  while (items.length && seconds - t > 60 && guard < 20) {
    const it = items[guard % items.length];
    if (it.sets < 4) {
      const before = itemSeconds(it); it.sets += 1;
      const after = itemSeconds(it);
      if (t + after - before > seconds * 1.05) { it.sets -= 1; } else t += after - before;
    }
    guard += 1;
  }
  // cardio finisher when cardio is a focus
  if ((profile.focus || []).includes('cardio') && seconds >= 12 * 60) {
    const cardio = pool.filter((e) => e.cat === 'cardio' && e.mode === 'time');
    const [w, rest] = INTERVALS[effectiveLevel(profile) - 1];
    const fin = [];
    for (let k = 0; k < 2; k += 1) { const e = pick(cardio, r, () => 0, new Set(fin.map((x) => x.id))); if (e) fin.push(e); }
    for (let round = 1; round <= 2; round += 1) {
      for (const e of fin) items.push(makeItem(e, profile, prog, 'main', { sets: 1, secs: w, restAfter: rest, label: `Finisher · round ${round}` }));
    }
  }
  return items;
}

function intervalMain(profile, pool, r, prog, seconds, kind) {
  const lv = effectiveLevel(profile);
  const fs = focusScore(profile);
  if (kind === 'dance') {
    const moves = pool.filter((e) => e.cat === 'dance').sort(() => r() - 0.5);
    const items = []; let t = 0; let i = 0;
    while (t < seconds - 30 && moves.length) {
      const e = moves[i % moves.length];
      const it = makeItem(e, profile, prog, 'main', { sets: 1, secs: Math.round(60 * Math.min(1.25, prog.factor)), restAfter: 15, label: `Song ${Math.floor(i / moves.length) + 1}` });
      items.push(it); t += itemSeconds(it); i += 1;
    }
    return items;
  }
  // cardio intervals: circuits of 4–5 moves (cardio + core holds)
  const [w, rest] = INTERVALS[lv - 1];
  const cardio = pool.filter((e) => e.cat === 'cardio' && e.mode === 'time');
  const core = pool.filter((e) => e.cat === 'core');
  const circuit = []; const used = new Set();
  for (let k = 0; k < 4; k += 1) { const e = pick(cardio, r, fs, used); if (e) { circuit.push(e); used.add(e.id); } }
  const c = pick(core, r, fs, used); if (c) circuit.push(c);
  const items = []; let t = 0; let round = 1;
  while (t < seconds - 45 && circuit.length && round <= 8) {
    for (const e of circuit) {
      const opts = { sets: 1, restAfter: rest, label: `Round ${round}` };
      if (e.mode === 'time') opts.secs = Math.round((w * prog.factor) / 5) * 5;
      const it = makeItem(e, profile, prog, 'main', opts);
      if (t + itemSeconds(it) > seconds + 20) break;
      items.push(it); t += itemSeconds(it);
    }
    // a slightly longer breather between rounds
    if (items.length) items[items.length - 1].restAfter = rest + 20;
    round += 1;
  }
  return items;
}

const YOGA_ORDER = ['sun_breath', 'half_fold_blocks', 'chair_pose', 'warrior2', 'triangle_block', 'tree_pose', 'down_dog', 'cat_cow', 'child_pose', 'sphinx', 'bridge_block', 'seated_fold', 'figure_four', 'knees_to_chest', 'legs_up_wall'];

function yogaMain(profile, pool, r, prog, seconds) {
  const items = []; let t = 0;
  const avail = YOGA_ORDER.map((id) => pool.find((e) => e.id === id)).filter(Boolean);
  for (let flow = 1; flow <= 3 && seconds - t > 60; flow += 1) {
    for (const e of avail) {
      const it = makeItem(e, profile, prog, 'main', { sets: 1, restAfter: 8, rest: 0, label: flow > 1 ? `Flow ${flow}` : undefined });
      if (e.mode === 'reps') { it.reps = Math.min(it.reps, 10); }
      if (t + itemSeconds(it) > seconds + 20) continue;
      items.push(it); t += itemSeconds(it);
    }
  }
  // fill remaining time by holding poses longer
  let guard = 0;
  while (items.length && seconds - t > 30 && guard < 40) {
    const it = items[guard % items.length];
    if (it.mode === 'time' && it.secs < 90) { const b = itemSeconds(it); it.secs += 10; t += itemSeconds(it) - b; }
    guard += 1;
  }
  return items;
}

// ───────── public API ─────────
export function dayType(plan, date) {
  const idx = dayIndex(plan, date);
  if (idx < 0) return 'rest';
  const tpl = WEEK_TEMPLATES[plan.daysPerWeek] || WEEK_TEMPLATES[4];
  return tpl[idx % 7];
}

/**
 * Build the session for a date. Deterministic for (plan, date, seedSalt) so the
 * same day always shows the same workout; `salt` lets the user reshuffle.
 */
export function buildSession(profile, plan, date, { avoid = [], intensity = 1, salt = '', typeOverride } = {}) {
  const type = typeOverride || dayType(plan, date);
  const prog = progression(plan, date, intensity);
  const minutes = profile.minutes;
  const r = rng(`${dateKey(date)}|${type}|${plan.version}|${salt}`);
  const pool = eligiblePool(profile, avoid);
  if (type === 'rest') {
    return { type, date: dateKey(date), items: [], prog, minutes: 0 };
  }
  const total = minutes * 60;
  const warmSec = Math.max(120, Math.round(total * (type === 'yoga' ? 0.1 : 0.15)));
  const coolSec = Math.max(150, Math.round(total * 0.15));
  const mainSec = Math.max(180, total - warmSec - coolSec);
  const kind = DAY_TYPES[type].kind;
  const warm = warmup(profile, pool, r, prog, warmSec, type);
  let main;
  if (kind === 'strength') main = strengthMain(profile, pool, r, prog, mainSec, type);
  else if (kind === 'yoga') main = yogaMain(profile, pool, r, prog, mainSec);
  else main = intervalMain(profile, pool, r, prog, mainSec, kind);
  const cool = type === 'yoga' ? [] : cooldown(profile, pool, r, prog, coolSec, main);
  if (type === 'yoga') {
    const sav = pool.find((e) => e.id === 'savasana');
    if (sav) cool.push(makeItem(sav, profile, prog, 'cooldown', { restAfter: 0 }));
  }
  const session = { type, date: dateKey(date), items: [...warm, ...main, ...cool], prog };
  session.seconds = sessionSeconds(session);
  session.kcal = estimateKcal(session, profile.kg);
  return session;
}

/** Optional recovery routine offered on rest days. */
export function recoverySession(profile, plan, date, avoid = []) {
  const p = { ...profile, minutes: 10 };
  const s = buildSession(p, plan, date, { avoid, typeOverride: 'yoga', salt: 'recovery' });
  s.type = 'recovery';
  return s;
}

/** Average daily exercise kcal for the first 4 weeks of the plan. */
export function avgExerciseKcalPerDay(profile, plan) {
  let kcal = 0;
  const start = parseKey(plan.startDate);
  for (let d = 0; d < 28; d += 1) kcal += buildSession(profile, plan, addDays(start, d)).kcal || 0;
  return kcal / 28;
}

export function muscleTally(items, completedSets) {
  const tally = {};
  items.forEach((it, i) => {
    const sets = completedSets ? completedSets[i] || 0 : it.sets;
    if (!sets) return;
    const ex = BY_ID[it.exId];
    const weight = it.phase === 'main' ? 1 : 0.3;
    for (const m of ex.muscles) tally[m] = (tally[m] || 0) + sets * weight * (it.uni ? 2 : 1);
  });
  return tally;
}
