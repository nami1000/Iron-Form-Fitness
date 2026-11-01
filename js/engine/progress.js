// Progress, streaks and goal projection.
import { dayType, dateKey, parseKey, addDays } from './planner.js';
import { KCAL_PER_KG, DAY_MS, SAFE_MAX_PCT } from './calc.js';

export const RANKS = [
  [0, 'Recruit'], [3, 'Private'], [7, 'Private First Class'], [12, 'Corporal'], [20, 'Sergeant'],
  [30, 'Staff Sergeant'], [45, 'Sergeant First Class'], [60, 'Master Sergeant'], [80, 'Sergeant Major'],
  [100, 'Lieutenant'], [130, 'Captain'], [170, 'Major'], [220, 'Colonel'], [300, 'General'],
];

export function rankFor(sessions) {
  let cur = RANKS[0]; let next = null;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (sessions >= RANKS[i][0]) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  return { title: cur[1], next: next ? { title: next[1], at: next[0], remaining: next[0] - sessions } : null };
}

/**
 * Streak = consecutive scheduled training days completed. Rest days neither
 * break nor add to it; a workout logged on a rest day still counts. Today only
 * counts once done (an unfinished today does not break the streak).
 */
export function computeStreak(plan, logs, today = new Date()) {
  const done = new Set(logs.filter((l) => !l.recovery || true).map((l) => l.date));
  let streak = 0;
  const start = parseKey(plan.startDate);
  for (let d = parseKey(dateKey(today)); d >= start; d = addDays(d, -1)) {
    const k = dateKey(d);
    if (done.has(k)) { streak += 1; continue; }
    if (dayType(plan, d) === 'rest') continue;
    if (k === dateKey(today)) continue;
    break;
  }
  return streak;
}

export function latestWeight(state) {
  const w = [...(state.weighIns || [])].sort((a, b) => a.date.localeCompare(b.date));
  return w.length ? w[w.length - 1].kg : state.profile.kg;
}

/** Least-squares slope (kg/day) of weigh-ins in the last `windowDays`. */
export function weightTrend(weighIns, today = new Date(), windowDays = 35) {
  const cutoff = addDays(today, -windowDays);
  const pts = weighIns.filter((w) => parseKey(w.date) >= cutoff).map((w) => [parseKey(w.date).getTime() / DAY_MS, w.kg]);
  if (pts.length < 3) return null;
  const span = pts[pts.length - 1][0] - pts[0][0];
  if (Math.abs(span) < 10) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let num = 0; let den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den ? num / den : null;
}

/**
 * Project where the user will be on the target date.
 * Combines the energy model (planned diet deficit + *actual* workout burn) with
 * the measured weigh-in trend once there is enough data.
 */
export function projection(state, today = new Date()) {
  const { profile, plan, logs = [], weighIns = [] } = state;
  const a = plan.assessment;
  const startKg = profile.kg;
  const current = latestWeight(state);
  const elapsed = Math.max(0, Math.round((parseKey(dateKey(today)) - parseKey(plan.startDate)) / DAY_MS));
  const daysLeft = Math.max(0, Math.round((parseKey(plan.targetDate) - parseKey(dateKey(today))) / DAY_MS));

  // workout burn actually achieved (last 14 days, or since start)
  const window = Math.max(1, Math.min(14, elapsed));
  const since = dateKey(addDays(today, -window));
  const recentKcal = logs.filter((l) => l.date > since).reduce((s, l) => s + (l.kcal || 0), 0);
  const actualExPerDay = elapsed >= 3 ? recentKcal / window : a.exerciseKcalPerDay;
  const adherence = a.exerciseKcalPerDay ? Math.min(1.5, actualExPerDay / a.exerciseKcalPerDay) : 1;

  const modelRate = (a.dietDeficit + actualExPerDay) / KCAL_PER_KG; // kg/day
  const trend = weightTrend(weighIns, today);
  const measuredRate = trend == null ? null : -trend;
  let rate = measuredRate == null ? modelRate : 0.6 * measuredRate + 0.4 * modelRate;
  const maxRate = (current * SAFE_MAX_PCT) / 7;
  rate = Math.max(0, Math.min(rate, maxRate));

  const projectedKg = current - rate * daysLeft;
  const projectedLoss = startKg - projectedKg;
  const lost = startKg - current;
  const goal = a.goalKg;
  const planKg = a.planKg;
  let status = 'on-track';
  if (projectedLoss < planKg * 0.9) status = 'behind';
  else if (projectedLoss > planKg * 1.08) status = 'ahead';

  const tooFast = measuredRate != null && measuredRate * 7 > current * 0.012;

  return {
    current, startKg, lost, goal, planKg, daysLeft, elapsed, projectedKg, projectedLoss,
    pct: goal ? Math.max(0, Math.min(1, lost / goal)) : 0,
    rateKgPerWeek: rate * 7, measuredRatePerWeek: measuredRate == null ? null : measuredRate * 7,
    modelRatePerWeek: modelRate * 7, adherence, actualExPerDay, status, tooFast, usingTrend: measuredRate != null,
  };
}

/** Compare against the last stored projection; return a user-facing note if it moved meaningfully. */
export function projectionChange(prevLoss, proj, fmt) {
  if (prevLoss == null) return null;
  const diff = proj.projectedLoss - prevLoss;
  if (Math.abs(diff) < 0.3) return null;
  const up = diff > 0;
  return {
    up,
    text: up
      ? `Good news: your projected loss by the target date improved from ${fmt(prevLoss)} to ${fmt(proj.projectedLoss)}.`
      : `Heads-up: your projected loss by the target date dropped from ${fmt(prevLoss)} to ${fmt(proj.projectedLoss)}. ${proj.adherence < 0.85 ? 'Missed workouts are the main reason. Getting back on schedule closes the gap.' : 'Your weigh-ins are trending slower than planned. Check your daily calorie target.'}`,
  };
}

export function needsWeighIn(state, today = new Date()) {
  const w = state.weighIns || [];
  if (!w.length) return Math.round((parseKey(dateKey(today)) - parseKey(state.plan.startDate)) / DAY_MS) >= 7;
  const last = [...w].sort((a, b) => a.date.localeCompare(b.date)).pop();
  return (parseKey(dateKey(today)) - parseKey(last.date)) / DAY_MS >= 7;
}
