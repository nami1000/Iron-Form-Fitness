// Glue between stored state and the engine.
import { load, update } from './store.js';
import { assessGoal } from './engine/calc.js';
import { avgExerciseKcalPerDay, buildSession, recoverySession, dateKey, dayType, DAY_TYPES, addDays } from './engine/planner.js';
import { projection, computeStreak, projectionChange } from './engine/progress.js';
import { fmtWeight } from './engine/units.js';

export const S = () => load();
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

export function sessionFor(date = new Date(), opts = {}) {
  const st = S();
  const key = dateKey(date);
  if (opts.recovery) return recoverySession(st.profile, st.plan, date, st.avoid);
  return buildSession(st.profile, st.plan, date, {
    avoid: st.avoid, intensity: st.intensity, salt: st.salt[key] || '', typeOverride: opts.type || st.salt[`${key}:type`],
  });
}

export function todayType(date = new Date()) {
  const st = S();
  return st.salt[`${dateKey(date)}:type`] || dayType(st.plan, date);
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
    const t = dayType(st.plan, addDays(from, i));
    if (t !== 'rest') return i === 1 ? DAY_TYPES[t].label : `${DAY_TYPES[t].label} (${addDays(from, i).toLocaleDateString(undefined, { weekday: 'long' })})`;
  }
  return null;
}
