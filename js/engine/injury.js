// Pain reports → temporary plan restrictions → 2-weekly check-ins.
//
// When the user taps "Something hurts" they say where (body area chips and/or
// free text) and how bad. The report becomes an *active injury*:
//   • its body areas are treated exactly like sign-up problem areas (any
//     exercise loading them at ≥ 2 is excluded, jumping too for knee / ankle /
//     hip / back), for the rest of the week and every week after;
//   • the exercise that hurt is paused;
//   • 14 days later the app asks how it is. "Ready" restores everything;
//     "Not yet" or "Worse" keeps it paused and asks again in 14 days.

import { dateKey, addDays, parseKey } from './planner.js';

export const CHECK_IN_DAYS = 14;

export const PAIN_AREAS = [
  { id: 'knee', label: 'Knee' },
  { id: 'back', label: 'Lower back' },
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'neck', label: 'Neck' },
  { id: 'wrist', label: 'Wrist / hand' },
  { id: 'elbow', label: 'Elbow' },
  { id: 'hip', label: 'Hip / groin' },
  { id: 'ankle', label: 'Ankle / foot' },
];

export const SEVERITY = [
  { id: 'mild', label: 'Mild ache', desc: 'Uncomfortable but I could keep going' },
  { id: 'moderate', label: 'Moderate', desc: 'It hurts enough that I stopped' },
  { id: 'sharp', label: 'Sharp / sudden', desc: 'Sharp, stabbing, a pop, or it gave way' },
];

// Words → joint areas (stress keys used by the exercise library).
const AREA_WORDS = {
  knee: ['knee', 'kneecap', 'patella', 'acl', 'mcl', 'meniscus', 'quad', 'thigh'],
  back: ['back', 'spine', 'lumbar', 'sciatica', 'disc', 'tailbone'],
  shoulder: ['shoulder', 'rotator', 'deltoid', 'collarbone', 'shoulder blade'],
  neck: ['neck', 'cervical', 'trap'],
  wrist: ['wrist', 'hand', 'carpal', 'forearm', 'finger', 'palm', 'thumb'],
  elbow: ['elbow', 'tennis elbow', 'golfer', 'bicep tendon'],
  hip: ['hip', 'groin', 'glute', 'buttock', 'hamstring', 'pelvis', 'adductor'],
  ankle: ['ankle', 'foot', 'feet', 'heel', 'achilles', 'calf', 'calves', 'shin', 'toe', 'arch', 'plantar'],
};
// Words that mean "stop and get checked", not "train around it".
const RED_FLAGS = [
  ['chest', 'chest pain or pressure'], ['heart', 'heart symptoms'], ['breath', 'trouble breathing'],
  ['dizz', 'dizziness'], ['faint', 'feeling faint'], ['light-headed', 'light-headedness'], ['lightheaded', 'light-headedness'],
  ['numb', 'numbness'], ['tingl', 'tingling'], ['radiat', 'pain spreading'], ['shooting', 'shooting pain'],
  ['pop', 'a pop'], ['swell', 'swelling'], ['swollen', 'swelling'], ['bruis', 'bruising'], ['gave way', 'a joint giving way'],
  ["can't bear", 'unable to bear weight'], ['cannot bear', 'unable to bear weight'], ['can’t bear', 'unable to bear weight'],
];

/** Pull body areas and red-flag symptoms out of free text. */
export function analyzePain(text = '') {
  const t = ` ${text.toLowerCase()} `;
  const areas = Object.entries(AREA_WORDS).filter(([, words]) => words.some((w) => new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`).test(t))).map(([a]) => a);
  const redFlags = [...new Set(RED_FLAGS.filter(([w]) => t.includes(w)).map(([, label]) => label))];
  return { areas, redFlags };
}

export const activeInjuries = (injuries = []) => injuries.filter((j) => j.status === 'active');

/**
 * Record a report. If an active injury already covers one of these areas it is
 * updated instead (re-aggravated → the 2-week clock restarts).
 */
export function addReport(injuries = [], { date = dateKey(), areas = [], severity = 'mild', note = '', exId = null }) {
  const list = injuries.map((j) => ({ ...j, areas: [...j.areas], exIds: [...j.exIds], reports: [...(j.reports || [])] }));
  const report = { date, severity, note, exId };
  const nextCheck = dateKey(addDays(parseKey(date), CHECK_IN_DAYS));
  const match = areas.length ? list.find((j) => j.status === 'active' && j.areas.some((a) => areas.includes(a))) : null;
  if (match) {
    for (const a of areas) if (!match.areas.includes(a)) match.areas.push(a);
    if (exId && !match.exIds.includes(exId)) match.exIds.push(exId);
    match.reports.push(report);
    match.severity = rank(severity) > rank(match.severity) ? severity : match.severity;
    match.nextCheck = nextCheck;
    return { injuries: list, injury: match, merged: true };
  }
  const injury = {
    id: `inj-${date}-${Math.random().toString(36).slice(2, 7)}`, date, areas: [...areas], exIds: exId ? [exId] : [],
    severity, note, reports: [report], status: 'active', nextCheck, checks: [],
  };
  list.push(injury);
  return { injuries: list, injury, merged: false };
}
const rank = (s) => SEVERITY.findIndex((x) => x.id === s);

export function dueCheckIns(injuries = [], today = new Date()) {
  const k = dateKey(today);
  return activeInjuries(injuries).filter((j) => j.nextCheck <= k);
}

/** answer: 'ready' | 'not-yet' | 'worse' */
export function answerCheckIn(injuries, id, answer, today = new Date()) {
  const k = dateKey(today);
  return injuries.map((j) => {
    if (j.id !== id) return j;
    const checks = [...(j.checks || []), { date: k, answer }];
    if (answer === 'ready') return { ...j, checks, status: 'resolved', resolvedAt: k };
    return { ...j, checks, nextCheck: dateKey(addDays(parseKey(k), CHECK_IN_DAYS)) };
  });
}

/** The profile the planner should use: sign-up problem areas + active injury areas. */
export function planProfile(profile, injuries = []) {
  const extra = activeInjuries(injuries).flatMap((j) => j.areas);
  if (!extra.length) return profile;
  return { ...profile, issues: [...new Set([...(profile.issues || []), ...extra])] };
}

/** Exercises paused by active injuries (on top of the permanent avoid list). */
export function planAvoid(avoid = [], injuries = []) {
  return [...new Set([...avoid, ...activeInjuries(injuries).flatMap((j) => j.exIds)])];
}

/** Which active injury (if any) is the reason an exercise is excluded. */
export function injuryFor(ex, injuries = []) {
  return activeInjuries(injuries).find((j) => j.exIds.includes(ex.id) || j.areas.some((a) => (ex.stress[a] || 0) >= 2 || (ex.impact && ['knee', 'ankle', 'hip', 'back'].includes(a))));
}
