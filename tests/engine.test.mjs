import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessGoal, bmr, pickDumbbell, maxSafeLoss } from '../js/engine/calc.js';
import { buildSession, eligiblePool, dayType, sessionSeconds, WEEK_TEMPLATES, addDays, parseKey } from '../js/engine/planner.js';
import { computeStreak, projection, weightTrend } from '../js/engine/progress.js';
import { pepTalk } from '../js/engine/pep.js';
import { EXERCISES, BY_ID } from '../js/data/exercises.js';
import { lbToKg, kgToLb, ftInToCm, cmToFtIn } from '../js/engine/units.js';

const today = new Date(2026, 10, 1);
const base = {
  name: 'Test', sex: 'female', age: 35, cm: 165, kg: 80, activity: 'sedentary', level: 2,
  focus: ['core'], issues: [], equipment: ['dumbbells', 'bands', 'blocks', 'ab wheel', 'mat', 'wall'],
  dumbbells: [2.3, 4.5, 6.8, 9.1], minutes: 30, daysPerWeek: 5,
};
const plan = { startDate: '2026-11-01', targetDate: '2027-03-01', daysPerWeek: 5, version: 1 };

test('unit conversions round-trip', () => {
  assert.ok(Math.abs(kgToLb(lbToKg(150)) - 150) < 1e-9);
  assert.deepEqual(cmToFtIn(ftInToCm(5, 7)), { ft: 5, inch: 7 });
});

test('Mifflin-St Jeor BMR', () => {
  assert.equal(Math.round(bmr({ sex: 'male', kg: 80, cm: 180, age: 30 })), 1780);
  assert.equal(Math.round(bmr({ sex: 'female', kg: 60, cm: 165, age: 30 })), 1320);
});

test('goal assessment: comfortable / ambitious / unrealistic', () => {
  const in120 = new Date(2027, 2, 1); // ~120 days
  const ok = assessGoal(base, 5, in120, 150, today);
  assert.equal(ok.status, 'comfortable');
  assert.ok(ok.feasible);
  const huge = assessGoal(base, 25, in120, 150, today);
  assert.equal(huge.status, 'unrealistic');
  assert.ok(huge.suggestedKg < 25 && huge.suggestedKg > 0);
  assert.ok(huge.maxAchievableKg <= maxSafeLoss(80, huge.days) + 1e-9);
  // never plan intake below the floor
  assert.ok(huge.calorieTarget >= 1200);
  assert.ok(huge.safeGoalDate > in120);
});

test('goal assessment rejects target dates < 1 week', () => {
  const r = assessGoal(base, 2, addDays(today, 3), 0, today);
  assert.equal(r.status, 'invalid');
});

test('goal never plans below BMI 18.5', () => {
  const thin = { ...base, kg: 55, cm: 170 };
  const r = assessGoal(thin, 10, new Date(2027, 10, 1), 100, today);
  assert.ok(55 - r.planKg >= 18.5 * 1.7 * 1.7 - 0.01);
});

test('dumbbell picker respects safety caps', () => {
  assert.equal(pickDumbbell([20, 25], 'light', 1), null); // only heavy weights → skip
  assert.equal(pickDumbbell([2, 4, 6, 8], 'light', 1), 2);
  assert.ok(pickDumbbell([2, 4, 6, 8, 10, 12], 'heavy', 3) >= 8);
});

for (const area of ['knee', 'back', 'shoulder', 'wrist', 'neck', 'hip', 'ankle', 'elbow']) {
  test(`issue area "${area}": no exercise with stress ≥ 2 is ever scheduled`, () => {
    const p = { ...base, issues: [area], level: 3 };
    for (const ex of eligiblePool(p)) assert.ok((ex.stress[area] || 0) < 2, `${ex.id} stresses ${area}`);
    for (let d = 0; d < 28; d += 1) {
      const s = buildSession(p, plan, addDays(parseKey(plan.startDate), d));
      for (const it of s.items) assert.ok((BY_ID[it.exId].stress[area] || 0) < 2, `${it.exId} on day ${d}`);
    }
  });
}

test('knee issue → no jumping/impact at all', () => {
  const p = { ...base, issues: ['knee'], level: 3 };
  assert.ok(eligiblePool(p).every((e) => !e.impact));
});

test('beginners never get impact moves', () => {
  const p = { ...base, level: 1 };
  assert.ok(eligiblePool(p).every((e) => !e.impact));
});

test('health-readiness flag caps intensity at beginner', () => {
  const p = { ...base, level: 3, readinessFlag: true };
  const pool = eligiblePool(p);
  assert.ok(pool.every((e) => e.lv[0] <= 1 && !e.impact));
});

test('missing equipment excludes exercises', () => {
  const p = { ...base, equipment: ['mat'], dumbbells: [] };
  for (const ex of eligiblePool(p)) assert.ok(ex.equip.every((e) => e === 'mat'), ex.id);
});

test('avoid list (pain reports) is honoured', () => {
  const pool = eligiblePool(base, ['glute_bridge']);
  assert.ok(!pool.find((e) => e.id === 'glute_bridge'));
});

test('every exercise has valid data', () => {
  const ids = new Set();
  for (const ex of EXERCISES) {
    assert.ok(!ids.has(ex.id), `dup ${ex.id}`); ids.add(ex.id);
    assert.ok(ex.frames && ex.frames.length, ex.id);
    assert.ok(ex.steps.length && ex.cues.length, ex.id);
    assert.ok(ex.met > 0 && ex.tempo > 0, ex.id);
    assert.ok(ex.mode === 'reps' ? ex.reps.length === 3 : ex.secs.length === 3, ex.id);
  }
});

test('sessions fit the requested minutes and include warm-up & cool-down', () => {
  for (const minutes of [10, 20, 30, 45, 60]) {
    for (const level of [1, 2, 3]) {
      const p = { ...base, minutes, level };
      for (let d = 0; d < 7; d += 1) {
        const s = buildSession(p, plan, addDays(parseKey(plan.startDate), d));
        if (s.type === 'rest') continue;
        const mins = sessionSeconds(s) / 60;
        assert.ok(mins <= minutes * 1.2 + 1, `${s.type} ${minutes}m L${level}: ${mins.toFixed(1)}`);
        assert.ok(mins >= minutes * 0.6, `${s.type} ${minutes}m L${level} too short: ${mins.toFixed(1)}`);
        assert.ok(s.items.some((i) => i.phase === 'warmup'), 'warm-up');
        assert.ok(s.items.some((i) => i.phase === 'cooldown'), 'cool-down');
      }
    }
  }
});

test('week templates include a rest day', () => {
  for (const tpl of Object.values(WEEK_TEMPLATES)) assert.ok(tpl.includes('rest'));
  assert.equal(dayType(plan, parseKey('2026-11-07')), 'rest');
});

test('same day → same session; different days vary', () => {
  const a = buildSession(base, plan, parseKey('2026-11-01'));
  const b = buildSession(base, plan, parseKey('2026-11-01'));
  const c = buildSession(base, plan, parseKey('2026-11-08'));
  assert.deepEqual(a.items.map((i) => i.exId), b.items.map((i) => i.exId));
  assert.notDeepEqual(a.items.map((i) => i.exId), c.items.map((i) => i.exId));
});

test('streak: rest days are neutral, misses break it', () => {
  const logs = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((date) => ({ date }));
  // 11-07 is rest → streak continues to 11-08 (today, not yet done)
  assert.equal(computeStreak(plan, logs, parseKey('2026-11-08')), 6);
  // 11-08 missed → on 11-09 the streak is broken
  assert.equal(computeStreak(plan, logs, parseKey('2026-11-09')), 0);
});

test('weight trend + projection react to data', () => {
  const weighIns = [{ date: '2026-11-01', kg: 80 }, { date: '2026-11-08', kg: 79.4 }, { date: '2026-11-15', kg: 78.9 }];
  assert.ok(weightTrend(weighIns, parseKey('2026-11-15')) < 0);
  const a = assessGoal(base, 6, parseKey('2027-03-01'), 150, parseKey('2026-11-01'));
  const st = { profile: base, plan: { ...plan, assessment: a }, logs: [], weighIns };
  const p = projection(st, parseKey('2026-11-15'));
  assert.ok(p.usingTrend);
  assert.ok(p.lost > 1 && p.projectedLoss > p.lost);
  // no workouts logged → lower adherence than planned
  assert.ok(p.adherence < 1);
});

test('pep talks are ~30s and never repeat', () => {
  const used = [];
  for (let i = 0; i < 300; i += 1) {
    const phase = i % 2 ? 'end' : 'start';
    const t = pepTalk(phase, { name: 'Sam', tod: 'morning', type: 'full', streak: i % 5, min: 30, kcal: 210, sets: 14, muscles: 'legs and core', next: 'Dance Cardio' }, used, 1000 + i);
    assert.ok(!used.includes(t.fp));
    assert.ok(t.words >= 55 && t.words <= 115, `${t.words} words: ${t.text}`);
    used.push(t.fp);
  }
});

test('user is told when the projection moves', async () => {
  const { projectionChange } = await import('../js/engine/progress.js');
  const fmt = (kg) => `${kg.toFixed(1)} kg`;
  assert.equal(projectionChange(5.0, { projectedLoss: 5.1 }, fmt), null);
  const down = projectionChange(5.0, { projectedLoss: 4.2, adherence: 0.6 }, fmt);
  assert.ok(down && !down.up && /Missed workouts/.test(down.text));
  const up = projectionChange(5.0, { projectedLoss: 5.8, adherence: 1 }, fmt);
  assert.ok(up && up.up);
});

test('cool-down stretches the muscles worked that day', async () => {
  const { STRETCH_TARGETS, mainMuscleLoad } = await import('../js/engine/planner.js');
  const profiles = [base, { ...base, level: 1, issues: ['knee'] }, { ...base, level: 3, focus: ['legs', 'glutes'] }, { ...base, level: 2, issues: ['back', 'shoulder'] }];
  let checked = 0; let volume = 0; let coveredVol = 0;
  for (const p of profiles) for (const minutes of [20, 30, 45]) for (let d = 0; d < 14; d += 1) {
    const s = buildSession({ ...p, minutes }, plan, addDays(parseKey(plan.startDate), d));
    if (s.type === 'rest' || s.type === 'yoga') continue;
    const load = mainMuscleLoad(s.items);
    const cool = s.items.filter((i) => i.phase === 'cooldown');
    const stretched = new Set(cool.flatMap((i) => STRETCH_TARGETS[i.exId] || []));
    const pool = eligiblePool({ ...p, minutes });
    const stretchable = (m) => pool.some((e) => (STRETCH_TARGETS[e.id] || []).includes(m));
    const ranked = Object.entries(load).filter(([m]) => stretchable(m)).sort((a, b) => b[1] - a[1]);
    const max = ranked[0][1];
    // every most-worked muscle group is stretched, and at least 2 of the top 3
    const tied = ranked.filter(([, v]) => v === max).map(([m]) => m);
    const hit = tied.filter((m) => stretched.has(m)).length;
    // all most-worked groups when ≤3 tie; otherwise at least 75% (only ~4 stretches fit)
    assert.ok(tied.length <= 3 ? hit === tied.length : hit / tied.length >= 0.75 - 1e-9 || hit >= 4,
      `${s.type} ${minutes}m L${p.level} day ${d}: most-worked ${tied} vs stretched ${[...stretched]}`);
    const top3 = ranked.slice(0, 3).filter(([m]) => stretched.has(m)).length;
    assert.ok(top3 >= Math.min(2, ranked.length), `${s.type} ${minutes}m day ${d}: only ${top3}/3 top muscles stretched`);
    const total = ranked.reduce((a, [, v]) => a + v, 0);
    volume += total; coveredVol += ranked.filter(([m]) => stretched.has(m)).reduce((a, [, v]) => a + v, 0);
    checked += 1;
  }
  assert.ok(checked > 50);
  console.log(`# cool-down covers ${Math.round((100 * coveredVol) / volume)}% of trained muscle volume across ${checked} sessions`);
  assert.ok(coveredVol / volume > 0.7);
});

test('default rest between sets is 30s; health flag keeps ≥45s', () => {
  const s = buildSession(base, plan, parseKey('2026-11-01'));
  for (const it of s.items.filter((i) => i.phase === 'main' && i.sets > 1)) assert.equal(it.rest, 30);
  const f = buildSession({ ...base, readinessFlag: true }, plan, parseKey('2026-11-01'));
  for (const it of f.items.filter((i) => i.phase === 'main' && i.sets > 1)) assert.ok(it.rest >= 45);
});

// ───── adaptive week ─────
const plan6 = { startDate: '2026-11-01', targetDate: '2026-11-24', daysPerWeek: 6, version: 1 }; // Sun start
const shape = (ws) => ws.days.map((d) => `${d.type}${d.status === 'done' ? '✓' : d.status === 'missed' ? '✗' : ''}`).join(' ');

test('adaptive: on schedule → plan unchanged', async () => {
  const { weekSchedule, WEEK_TEMPLATES: T } = await import('../js/engine/planner.js');
  const ws = weekSchedule({ ...base, level: 1 }, plan6, [{ date: '2026-11-01', type: 'upper' }], parseKey('2026-11-02'));
  assert.deepEqual(ws.days.map((d) => d.type), T[6]);
  assert.equal(ws.missed, 0);
  assert.ok(ws.days.every((d) => !d.catchUp));
});

test('adaptive: missed Mon+Tue → Wed Lower, rest day reused, yoga dropped, catch-up on', async () => {
  const { weekSchedule } = await import('../js/engine/planner.js');
  const ws = weekSchedule({ ...base, level: 1 }, plan6, [{ date: '2026-11-01', type: 'upper' }], parseKey('2026-11-04'));
  assert.equal(shape(ws), 'upper✓ lower✗ cardio✗ lower cardio full dance');
  assert.deepEqual(ws.dropped, ['yoga']);
  assert.equal(ws.today.type, 'lower');
  assert.ok(ws.today.catchUp);
  assert.ok(ws.days[6].usedRest);
});

test('adaptive: never same muscles on back-to-back days', async () => {
  const { weekSchedule } = await import('../js/engine/planner.js');
  for (const dpw of [3, 4, 5, 6]) for (let skip = 1; skip < 6; skip += 1) {
    const p = { ...plan6, daysPerWeek: dpw };
    const ws = weekSchedule({ ...base, level: 2 }, p, [], addDays(parseKey('2026-11-01'), skip));
    const types = ws.days.slice(skip).map((d) => d.type);
    for (let i = 1; i < types.length; i += 1) {
      const a = types[i - 1]; const b = types[i];
      const reg = { upper: ['u'], lower: ['l'], full: ['u', 'l'] };
      assert.ok(!(reg[a] || []).some((x) => (reg[b] || []).includes(x)), `${dpw}d skip ${skip}: ${types}`);
    }
  }
});

test('adaptive: keeps ≥1 day off per week and respects hard-day cap', async () => {
  const { weekSchedule, MAX_HARD_STREAK } = await import('../js/engine/planner.js');
  for (const level of [1, 2, 3]) for (const dpw of [3, 4, 5, 6]) for (let skip = 0; skip < 7; skip += 1) {
    const ws = weekSchedule({ ...base, level }, { ...plan6, daysPerWeek: dpw }, [], addDays(parseKey('2026-11-01'), skip));
    const off = ws.days.filter((d) => d.status === 'missed' || d.type === 'rest').length;
    assert.ok(off >= 1, `L${level} ${dpw}d skip ${skip}: no day off`);
    let run = 0;
    for (const d of ws.days.slice(skip)) {
      run = ['upper', 'lower', 'full', 'cardio'].includes(d.type) ? run + 1 : 0;
      assert.ok(run <= MAX_HARD_STREAK[level - 1], `L${level}: ${d.key} hard run ${run}`);
    }
  }
});

test('adaptive: rest days are NOT reused when it is unsafe', async () => {
  const { weekSchedule } = await import('../js/engine/planner.js');
  const sun = [{ date: '2026-11-01', type: 'upper' }];
  const pain = [{ date: '2026-11-03', type: 'upper', pain: [{ exId: 'pushup' }] }];
  for (const [prof, logs, label] of [[{ ...base, level: 1, readinessFlag: true }, sun, 'health flag'], [{ ...base, level: 1 }, [...sun, ...pain], 'pain'],
    [{ ...base, level: 1 }, [...sun, { date: '2026-11-03', type: 'cardio', rating: 'Too hard' }], 'too hard']]) {
    const ws = weekSchedule(prof, plan6, logs, parseKey('2026-11-04'));
    assert.equal(ws.days[6].type, 'rest', label);
    assert.ok(ws.days.every((d) => !d.catchUp), label);
  }
});

test('catch-up session: up to +10 min and +10% volume, still safe', () => {
  const p = { ...base, level: 1, issues: ['knee'], minutes: 20 };
  const normal = buildSession(p, plan6, parseKey('2026-11-04'), { typeOverride: 'lower' });
  const extra = buildSession(p, plan6, parseKey('2026-11-04'), { typeOverride: 'lower', catchUp: true });
  assert.ok(sessionSeconds(extra) > sessionSeconds(normal) + 240, 'longer');
  assert.ok(sessionSeconds(extra) / 60 <= 20 + 10 + 3, `${sessionSeconds(extra) / 60} min`);
  assert.ok(extra.kcal > normal.kcal);
  for (const it of extra.items) assert.ok((BY_ID[it.exId].stress.knee || 0) < 2 && !BY_ID[it.exId].impact, it.exId);
});
