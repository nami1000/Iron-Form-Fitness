// Energy maths and goal-feasibility assessment.
//
// Sources / conventions (see README → Metric Standardization):
//  * BMR: Mifflin–St Jeor equation (1990).
//  * Activity multipliers: standard sedentary/light/moderate factors.
//  * Exercise energy: MET × 3.5 × kg / 200 kcal per minute (ACSM).
//  * 1 kg of body fat ≈ 7,700 kcal.
//  * Safe loss ceiling: the lower of 1 % of body weight or 1.0 kg per week.
//  * Comfortable target: ≈0.5–0.75 % of body weight per week.
//  * Intake never planned below 1,200 kcal (female) / 1,500 kcal (male).
//  * Planned daily deficit never above 1,000 kcal.

export const KCAL_PER_KG = 7700;
export const MAX_DAILY_DEFICIT = 1000;
export const SAFE_MAX_PCT = 0.01;       // 1 % body weight / week
export const SAFE_MAX_KG = 1.0;         // absolute weekly ceiling
export const COMFORT_PCT = 0.0075;      // recommended pace
export const MIN_BMI = 18.5;
export const DAY_MS = 86400000;

export const ACTIVITY = {
  sedentary: { factor: 1.2, label: 'Mostly sitting (desk job, little walking)' },
  light: { factor: 1.375, label: 'On my feet some of the day' },
  active: { factor: 1.55, label: 'Physically active job / lots of walking' },
};

export function bmr({ sex, kg, cm, age }) {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  if (sex === 'male') return base + 5;
  if (sex === 'female') return base - 161;
  return base - 78; // midpoint when sex isn't specified
}

export function tdee(profile) {
  const f = (ACTIVITY[profile.activity] || ACTIVITY.sedentary).factor;
  return bmr(profile) * f;
}

export const bmi = (kg, cm) => kg / ((cm / 100) ** 2);

export function calorieFloor(sex) {
  if (sex === 'male') return 1500;
  if (sex === 'female') return 1200;
  return 1350;
}

/** kcal burned for `seconds` of an activity with the given MET at body mass `kg`. */
export function metKcal(met, kg, seconds) {
  return ((met * 3.5 * kg) / 200) * (seconds / 60);
}

export function daysBetween(a, b) {
  const da = new Date(a); const db = new Date(b);
  da.setHours(0, 0, 0, 0); db.setHours(0, 0, 0, 0);
  return Math.round((db - da) / DAY_MS);
}

/** Maximum kg that can be lost over `days` starting at `kg` while respecting the weekly safety ceiling. */
export function maxSafeLoss(kg, days, pct = SAFE_MAX_PCT, cap = SAFE_MAX_KG) {
  let w = kg; let lost = 0; let remaining = days;
  while (remaining > 0) {
    const frac = Math.min(1, remaining / 7);
    const weekly = Math.min(w * pct, cap) * frac;
    lost += weekly; w -= weekly; remaining -= 7;
  }
  return lost;
}

/** Days needed to lose `goalKg` at a given weekly % pace (capped). */
export function daysToLose(kg, goalKg, pct = COMFORT_PCT, cap = SAFE_MAX_KG) {
  let w = kg; let lost = 0; let days = 0;
  while (lost < goalKg - 1e-9 && days < 3650) {
    const daily = Math.min(w * pct, cap) / 7;
    lost += daily; w -= daily; days += 1;
  }
  return days;
}

const floorTo = (n, step) => Math.floor(n / step) * step;

/**
 * Assess whether a weight-loss goal is realistic and safe, and produce the
 * numbers the plan runs on.
 *
 * @param {object} p  profile {sex, age, cm, kg, activity}
 * @param {number} goalKg  kg the user wants to lose
 * @param {string|Date} targetDate
 * @param {number} exerciseKcalPerDay  average daily burn the workout plan adds
 * @param {Date} today
 */
export function assessGoal(p, goalKg, targetDate, exerciseKcalPerDay = 0, today = new Date()) {
  const days = daysBetween(today, targetDate);
  const out = { days, weeks: days / 7, goalKg, notes: [] };
  const maintenance = tdee(p);
  const floor = calorieFloor(p.sex);
  out.maintenance = Math.round(maintenance);
  out.calorieFloor = floor;
  out.exerciseKcalPerDay = Math.round(exerciseKcalPerDay);

  if (!(goalKg > 0)) {
    out.status = 'invalid'; out.feasible = false;
    out.notes.push('Enter how much weight you want to lose.');
    return out;
  }
  if (days < 7) {
    out.status = 'invalid'; out.feasible = false;
    out.notes.push('Pick a target date at least one week away.');
    return out;
  }

  // 1) weekly-rate ceiling
  const byRate = maxSafeLoss(p.kg, days);
  // 2) energy ceiling: intake can't drop under the floor, deficit ≤ 1000/day
  const maxDeficit = Math.max(0, Math.min(MAX_DAILY_DEFICIT, maintenance + exerciseKcalPerDay - floor));
  const byEnergy = (maxDeficit * days) / KCAL_PER_KG;
  // 3) healthy-weight ceiling: don't plan below BMI 18.5
  const minHealthyKg = MIN_BMI * (p.cm / 100) ** 2;
  const byBmi = Math.max(0, p.kg - minHealthyKg);

  const maxAchievable = Math.min(byRate, byEnergy, byBmi);
  out.maxAchievableKg = maxAchievable;
  out.limitedBy = maxAchievable === byBmi ? 'bmi' : maxAchievable === byEnergy ? 'energy' : 'rate';
  out.comfortableKg = Math.min(maxSafeLoss(p.kg, days, COMFORT_PCT, 0.75), maxAchievable);
  out.requiredWeeklyKg = goalKg / out.weeks;
  out.requiredWeeklyPct = out.requiredWeeklyKg / p.kg;
  out.requiredDailyDeficit = (goalKg * KCAL_PER_KG) / days;
  out.targetBmi = bmi(p.kg - goalKg, p.cm);

  if (goalKg <= out.comfortableKg + 1e-9) out.status = 'comfortable';
  else if (goalKg <= maxAchievable + 1e-9) out.status = 'ambitious';
  else out.status = 'unrealistic';
  out.feasible = out.status !== 'unrealistic';

  // What the plan will actually aim for
  const planKg = out.feasible ? goalKg : floorTo(maxAchievable, 0.5) || Math.round(maxAchievable * 10) / 10;
  out.planKg = planKg;
  out.suggestedKg = out.feasible ? goalKg : planKg;
  out.dailyDeficit = Math.round((planKg * KCAL_PER_KG) / days);
  out.dietDeficit = Math.max(0, out.dailyDeficit - Math.round(exerciseKcalPerDay));
  out.calorieTarget = Math.max(floor, Math.round(maintenance - out.dietDeficit));
  out.weeklyKg = planKg / out.weeks;

  // When the full goal could be reached at a comfortable pace
  out.comfortableDays = daysToLose(p.kg, goalKg);
  out.safeGoalDate = new Date(new Date(today).getTime() + out.comfortableDays * DAY_MS);

  if (out.targetBmi < MIN_BMI) {
    out.notes.push(`Your goal weight would put your BMI under ${MIN_BMI}. The plan stops at a healthy weight.`);
  }
  if (out.status === 'ambitious') {
    out.notes.push('This is achievable but at the top of the safe range. Expect it to feel demanding; consistency with food matters most.');
  }
  return out;
}

// Upper safety caps (kg, per hand) by load class and level. If every dumbbell
// the user owns is heavier than the cap, the exercise is skipped rather than
// loaded unsafely.
export const DB_CAPS = {
  light: [4.5, 7, 10],
  medium: [7, 12, 18],
  heavy: [11, 18, 27],
};

/** Recommend a dumbbell (kg) from what the user owns for a given load class, or null if none is safe. */
export function pickDumbbell(owned, loadClass, level) {
  if (!owned || !owned.length) return null;
  const lv = Math.max(0, Math.min(2, level - 1));
  const cap = DB_CAPS[loadClass || 'medium'][lv];
  const sorted = [...owned].filter((w) => w <= cap + 0.01).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const pos = { light: [0, 0.3, 0.6], medium: [0.2, 0.5, 0.8], heavy: [0.4, 0.75, 1] }[loadClass || 'medium'];
  return sorted[Math.round(pos[lv] * (sorted.length - 1))];
}
