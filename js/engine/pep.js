// Motivational talk generator: about 30 s of speech (≈ 70–90 words).
// Talks are assembled from phrase banks plus the user's real numbers, and a
// fingerprint of every delivered talk is stored so none ever repeats.

import { rng } from './planner.js';

const pickOne = (r, arr) => arr[Math.floor(r() * arr.length)];

const OPEN_START = [
  'Listen up, {name}.', 'Alright {name}, eyes on me.', 'Good {tod}, {name}. Time to work.', 'Fall in, {name}.',
  'Here we go, {name}.', '{name}, you showed up. That\'s the first win.', 'Boots on, {name}.', 'Attention, {name}!',
  'Welcome back to the training ground, {name}.', 'Deep breath, {name}. Let\'s get to it.', 'Roll call, {name}: present and ready.',
  'Mission briefing, {name}.', 'Stand tall, {name}.', 'Another day, another rep, {name}.',
];

const CONTEXT_START = {
  upper: ['Today we build the upper body: strong arms, a solid back and shoulders that can carry the load.', 'Upper body day. We\'re forging the frame that carries everything else.', 'Today\'s target is everything from the waist up. Push, pull and press with control.'],
  lower: ['Today is legs and glutes, your engine room. Strong legs burn the most fuel.', 'Lower body day. Big muscles, big calorie burn, big results.', 'We\'re building the foundation today: legs, hips and glutes.'],
  full: ['Full body today: every major muscle reports for duty.', 'Today is a full body operation, top to bottom, nothing left out.', 'Full body session. This is where the calorie burn really stacks up.'],
  cardio: ['Cardio intervals today. Short bursts, honest effort, full recovery.', 'Today we train the heart and lungs. Work hard in the intervals, breathe in the rest.', 'Interval day. Every round you finish is a deposit in the fat-loss bank.'],
  dance: ['Dance day! We burn calories and have some fun doing it.', 'Today we move to the rhythm. Let loose, the calories burn either way.', 'Dance cardio today. Nobody is watching, so give it everything.'],
  yoga: ['Yoga and mobility today. Recovery is part of the mission, not a break from it.', 'Today we restore: long breaths, long muscles, a calm mind.', 'Mobility day. Flexible soldiers are durable soldiers.'],
  recovery: ['A short recovery session today to keep the joints happy.', 'Light recovery work today: move gently and breathe.'],
};

const STREAK_LINES = [
  'You\'re on a {streak}-day streak. Protect it.', '{streak} days straight. That\'s discipline, not luck.',
  'Streak count: {streak}. Let\'s make it {streak1}.', 'You\'ve stacked {streak} sessions in a row. Keep the chain unbroken.',
];
const FRESH_LINES = [
  'Today we start a new streak. Day one is the most important day.', 'Every streak begins with a single session, and this is it.',
  'Clean slate today. We build momentum from here.',
];
const PROGRESS_LINES = [
  'You\'re {pct} of the way to your goal.', 'So far you\'ve dropped {lost}. The plan is working.',
  'You\'re {left} from your target. One session at a time.', 'Your projection says {proj} by the deadline. Let\'s beat it.',
];
const CORE_START = [
  'Form first, always. A clean rep beats a fast rep.', 'We don\'t chase pain here. We chase quality.',
  'Control the movement. Never let the movement control you.', 'Strength is built in the slow reps.',
  'Breathe out on the effort, breathe in on the return.', 'You don\'t need to be perfect. You need to be consistent.',
  'Discipline is choosing what you want most over what you want now.', 'The only easy day was yesterday.',
  'Small efforts, repeated daily, win wars.', 'Your body can do more than your mind thinks. But we stay smart.',
  'Results are earned one honest rep at a time.', 'Show up. Work clean. Recover hard. Repeat.',
];
const SAFETY_START = [
  'If anything feels sharp or wrong, hit the "Something hurts" button. No ego today.',
  'Remember: discomfort is fine, pain is not. Stop if something hurts.',
  'Listen to your joints. If something pinches, tap "Something hurts" and we\'ll adapt.',
  'Sharp pain means stop. Muscle burn means you\'re working. Know the difference.',
];
const CLOSE_START = [
  'Let\'s move out!', 'Warm-up starts now. Let\'s go!', 'On my count. Let\'s work!', 'Mission is go!',
  'Let\'s earn it!', 'Ready? Let\'s roll!', 'Hoo-ah! Let\'s get after it!', 'Game face on. Let\'s go!',
];

const OPEN_END = [
  'Mission complete, {name}!', 'That\'s a wrap, {name}. Outstanding work.', 'And that\'s how it\'s done, {name}.',
  'Session secured, {name}.', 'Stand down, {name}. You earned it.', 'Done and dusted, {name}!',
  'Workout complete. Proud of you, {name}.', 'Great effort today, {name}.', 'That\'s the finish line, {name}.',
];
const STATS_END = [
  'You put in {min} minutes and burned roughly {kcal} calories.', 'About {kcal} calories burned in {min} minutes of honest work.',
  '{sets} sets completed and roughly {kcal} calories burned.', 'You trained {muscles} today.',
];
const CORE_END = [
  'Most people talked about it today. You did it.', 'Consistency beats intensity, and you just proved you\'re consistent.',
  'Every session is a brick in the wall. Today\'s brick is laid.', 'This is how goals become results: quietly, day after day.',
  'Your future self is already thanking you.', 'Remember why you started, and look how far you\'ve come.',
  'You didn\'t just burn calories. You built discipline.', 'Strong body, stronger mind.',
  'One more step closer. Keep marching.', 'Progress isn\'t always loud, but it\'s always building.',
];
const RECOVER_END = [
  'Now refuel: drink water, eat some protein, stay within your calorie target.',
  'Hydrate, eat a protein-rich meal, and get good sleep tonight. That\'s where the change happens.',
  'Recovery is part of training: water, protein and sleep.',
  'Stretch a little more if you can, drink some water, and keep tonight\'s dinner on plan.',
];
const NEXT_END = [
  'Tomorrow is {next}. Be ready.', 'Next on the schedule: {next}.', 'Rest up. Tomorrow brings {next}.',
];
const CLOSE_END = [
  'Dismissed!', 'See you next session, soldier.', 'Carry on!', 'Outstanding. Dismissed!', 'Hoo-ah!', 'Stay strong. Out.',
];

function fill(tpl, ctx) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] != null ? ctx[k] : ''));
}

function fingerprint(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;

/**
 * @param {'start'|'end'} phase
 * @param {object} ctx  name, tod, type, streak, pct, lost, left, proj, min, kcal, sets, muscles, next
 * @param {string[]} used  previously used fingerprints (mutated by caller via return value)
 */
export function pepTalk(phase, ctx, used = [], seed = Date.now()) {
  const usedSet = new Set(used);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const r = rng(`${seed}|${attempt}|${phase}`);
    const c = { ...ctx, name: ctx.name || 'soldier', streak1: (ctx.streak || 0) + 1 };
    const parts = [];
    if (phase === 'start') {
      parts.push(pickOne(r, OPEN_START));
      parts.push(pickOne(r, CONTEXT_START[ctx.type] || CONTEXT_START.full));
      parts.push(ctx.streak > 0 ? pickOne(r, STREAK_LINES) : pickOne(r, FRESH_LINES));
      if (ctx.lostRaw > 0.2 || ctx.proj) parts.push(pickOne(r, PROGRESS_LINES.filter((l) => (ctx.lostRaw > 0.2 ? true : !l.includes('{lost}') && !l.includes('{pct}')))));
      const cores = [...CORE_START].sort(() => r() - 0.5);
      parts.push(cores[0]);
      parts.push(pickOne(r, SAFETY_START));
      let i = 1;
      while (words(parts.join(' ')) < 68 && i < cores.length) { parts.splice(parts.length - 1, 0, cores[i]); i += 1; }
      parts.push(pickOne(r, CLOSE_START));
    } else {
      parts.push(pickOne(r, OPEN_END));
      parts.push(pickOne(r, STATS_END));
      if (ctx.streak > 0) parts.push(pickOne(r, STREAK_LINES));
      if (ctx.lostRaw > 0.2) parts.push(pickOne(r, PROGRESS_LINES));
      const cores = [...CORE_END].sort(() => r() - 0.5);
      parts.push(cores[0]);
      parts.push(pickOne(r, RECOVER_END));
      if (ctx.next) parts.push(pickOne(r, NEXT_END));
      let i = 1;
      while (words(parts.join(' ')) < 68 && i < cores.length) { parts.splice(parts.length - 1, 0, cores[i]); i += 1; }
      parts.push(pickOne(r, CLOSE_END));
    }
    const text = fill(parts.join(' '), c).replace(/\s+/g, ' ').trim();
    const fp = fingerprint(text);
    if (!usedSet.has(fp)) return { text, fp, words: words(text) };
  }
  // Exhausted combinations (practically impossible): append a session number to keep it unique
  const text = fill(`${pickOne(rng(seed), OPEN_START)} Session number ${ctx.sessionNo || ''}. Let's make it count.`, ctx);
  return { text, fp: fingerprint(text + seed), words: words(text) };
}

export function timeOfDay(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
