// Glue between stored state and the engine.
import { load, update } from './store.js';
import { assessGoal } from './engine/calc.js';
import { avgExerciseKcalPerDay, buildSession, recoverySession, dateKey, DAY_TYPES, addDays, parseKey, dayIndex, weekSchedule } from './engine/planner.js';
import { projection, computeStreak, projectionChange } from './engine/progress.js';
import { fmtWeight } from './engine/units.js';
import { planProfile, planAvoid } from './engine/injury.js';

export const S = () => load();

/** Profile + avoid list the planner should use: sign-up problem areas plus any
 * active pain reports (until the user is cleared at a check-in). */
export function planInputs() {
  const st = S();
  return { profile: planProfile(st.profile, st.injuries || []), avoid: planAvoid(st.avoid, st.injuries || []) };
}
export const fmtW = (kg, dp = 1) => fmtWeight(kg, S().profile?.units || 'metric', dp);

/** Create the plan object + feasibility assessment for a profile draft (not saved). */
export function draftPlan(profile, { startDate = dateKey(new Date()), version = 1 } = {}) {
  const plan = { startDate, targetDate: profile.targetDate, daysPerWeek: profile.daysPerWeek, version };
  const ex = avgExerciseKcalPerDay(profile, plan);
  plan.assessment = assessGoal(profile, profile.goalKg, profile.targetDate, ex, new Date(startDate + 'T00:00'));
  return plan;
}

export function commitPlan(profile, plan) {
  update((st) => {
    st.profile = profile;
    st.plan = { ...plan, createdAt: new Date().toISOString() };
    st.lastProjectedLoss = null;
    st.salt = {};
  });
}

/** This plan-week as it should now run, given missed/completed workouts. */
export function thisWeek(today = new Date()) {
  const st = S();
  return weekSchedule(planInputs().profile, st.plan, st.logs, today);
}

/**
 * What a given date holds in the (adaptive) plan: {type, status, catchUp, usedRest}.
 * Current week → rescheduled around misses; future weeks → the normal rotation.
 */
export function dayPlan(date, today = new Date()) {
  const st = S();
  const idx = dayIndex(st.plan, date);
  if (idx < 0) return { key: dateKey(date), type: 'rest', status: 'before' };
  const tIdx = dayIndex(st.plan, today);
  const w = Math.floor(idx / 7);
  let ref = date;
  if (w === Math.floor(tIdx / 7)) ref = today;
  else if (idx > tIdx) ref = addDays(parseKey(st.plan.startDate), w * 7);
  const ws = weekSchedule(planInputs().profile, st.plan, st.logs, ref);
  return ws.days.find((d) => d.key === dateKey(date));
}

export function sessionFor(date = new Date(), opts = {}) {
  const st = S();
  const key = dateKey(date);
  const { profile, avoid } = planInputs();
  if (opts.recovery) return recoverySession(profile, st.plan, date, avoid);
  const planned = dayPlan(date);
  return buildSession(profile, st.plan, date, {
    avoid, intensity: st.intensity, salt: st.salt[key] || '',
    typeOverride: opts.type || st.salt[`${key}:type`] || planned.type,
    catchUp: !!planned.catchUp,
  });
}

export function todayType(date = new Date()) {
  const st = S();
  return st.salt[`${dateKey(date)}:type`] || dayPlan(date).type;
}

export function streak() {
  const st = S();
  return computeStreak(st.plan, st.logs);
}

export function proj() { return projection(S()); }

/** Recompute projection; if it moved ≥0.3 kg since last time, store a notice. */
export function refreshProjection() {
  const st = S();
  const p = projection(st);
  const change = projectionChange(st.lastProjectedLoss, p, (kg) => fmtW(kg));
  update((s) => {
    if (change) s.notices.unshift({ date: dateKey(new Date()), ...change });
    s.notices = s.notices.slice(0, 20);
    s.lastProjectedLoss = p.projectedLoss;
  });
  return { p, change };
}

export function nextTrainingLabel(from = new Date()) {
  const st = S();
  for (let i = 1; i <= 7; i += 1) {
    const t = dayPlan(addDays(from, i), from).type;
    if (t !== 'rest') return i === 1 ? DAY_TYPES[t].label : `${DAY_TYPES[t].label} (${addDays(from, i).toLocaleDateString(undefined, { weekday: 'long' })})`;
  }
  return null;
}
