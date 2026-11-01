// Enlistment wizard: collects everything needed to build a safe plan.
import { go as navigate } from '../nav.js';
import { h, mount, chips, toast, fmtDate } from './dom.js';
import { ISSUE_AREAS, FOCUS_AREAS, EQUIPMENT, EXERCISES } from '../data/exercises.js';
import { ACTIVITY, bmi } from '../engine/calc.js';
import { toKg, fromKg, ftInToCm, cmToFtIn, weightUnit, round, lbToKg, kgToLb } from '../engine/units.js';
import { dateKey, addDays, LEVELS, WEEK_TEMPLATES, DAY_TYPES, exclusionReason } from '../engine/planner.js';
import { COACHES, Voice, loadVoices, unlockAudio } from '../voice.js';
import { Trainer } from '../trainer.js';
import { S, draftPlan, commitPlan, fmtW } from '../service.js';
import { update } from '../store.js';
import { musicPicker, stopPreview } from './musicpicker.js';
import { GENRES } from '../music.js';

const DB_LB = [2, 3, 5, 8, 10, 12, 15, 17.5, 20, 25, 30, 35, 40, 45, 50];
const DB_KG = [1, 2, 3, 4, 5, 6, 7.5, 8, 10, 12.5, 15, 17.5, 20, 22.5, 25];

const READINESS = [
  'Has a doctor ever said you have a heart condition or high blood pressure?',
  'Do you feel pain in your chest at rest, during daily activities, or when you exercise?',
  'Do you lose balance from dizziness, or have you lost consciousness in the last 12 months?',
  'Are you currently pregnant, or have you given birth in the last 6 months?',
  'Has a doctor told you to only do medically supervised physical activity?',
  'Are you taking medication for a chronic medical condition (e.g. diabetes, blood pressure)?',
];

export function defaultDraft() {
  return {
    name: '', sex: 'female', age: 35, units: 'imperial', cm: 165, kg: 75, activity: 'sedentary',
    readiness: READINESS.map(() => false), readinessFlag: false,
    issues: [], issueNotes: '',
    goalKg: 5, targetDate: dateKey(addDays(new Date(), 90)), level: 1,
    focus: ['full'], equipment: EQUIPMENT.map((e) => e.id), dumbbells: [],
    minutes: 30, daysPerWeek: 4, coach: 'sgt', music: true, musicGenre: 'edm', musicVolume: 0.5, calmForYoga: true,
  };
}

export function renderOnboarding(root, { editing = false } = {}) {
  const st = S();
  const d = editing && st.profile ? structuredClone(st.profile) : defaultDraft();
  if (editing && st.profile) {
    // goal restarts from the latest weight
    const w = [...st.weighIns].sort((a, b) => a.date.localeCompare(b.date)).pop();
    if (w) d.kg = w.kg;
    d.coach = st.settings.coach;
    Object.assign(d, { music: st.settings.music, musicGenre: st.settings.musicGenre, musicVolume: st.settings.musicVolume, calmForYoga: st.settings.calmForYoga });
  }
  let step = editing ? 1 : 0;
  let plan = null;

  const steps = [welcome, aboutYou, readiness, issues, goal, focus, equipment, schedule, coach, review];
  const titles = ['Welcome', 'About you', 'Health check', 'Problem areas', 'Goal & level', 'Focus areas', 'Equipment', 'Schedule', 'Coach & music', 'Your plan'];

  function go(n) { stopPreview(); step = Math.max(0, Math.min(steps.length - 1, n)); draw(); window.scrollTo(0, 0); }

  function draw() {
    const body = h('div', { class: 'stack' });
    const valid = steps[step](body);
    const nav = h('div', { class: 'wizard-nav' },
      step > 0 ? h('button', { class: 'btn ghost', onclick: () => go(step - 1) }, '← Back') : null,
      step < steps.length - 1
        ? h('button', { class: 'btn', onclick: () => { const err = valid?.(); if (err) { toast(err); return; } go(step + 1); } }, step === 0 ? 'Enlist →' : 'Next →')
        : null);
    mount(root,
      h('div', { class: 'header' }, h('div', { class: 'brand' }, 'IRON FORM', h('small', {}, editing ? 'UPDATE YOUR PLAN' : 'ENLISTMENT')),
        editing ? h('a', { href: '#/settings', class: 'btn ghost small' }, 'Cancel') : null),
      step > 0 ? h('div', { class: 'wizard-steps' }, steps.slice(1).map((_, i) => h('i', { class: i < step ? 'done' : '' }))) : null,
      step > 0 ? h('div', { class: 'tiny muted' }, `STEP ${step} OF ${steps.length - 1} · ${titles[step].toUpperCase()}`) : null,
      body, nav);
  }

  // ───────── steps ─────────
  function welcome(b) {
    const stage = h('div', { class: 'hero' });
    b.append(stage,
      h('h1', { class: 'center' }, 'Iron Form Fitness'),
      h('p', { class: 'center muted' }, 'Military-style home workouts built around your body, your goal, and keeping you injury-free.'),
      h('div', { class: 'card flat' },
        h('h3', {}, 'What you\'ll get'),
        h('ul', { class: 'steps-list' },
          h('li', {}, 'A plan that tells you honestly what\'s achievable by your date'),
          h('li', {}, 'Exercises filtered around your sore spots and your equipment'),
          h('li', {}, 'Sgt. Iron demonstrates every move and works out alongside you'),
          h('li', {}, 'Voice coaching, timers, streaks, and a progress record after every session'))),
      h('p', { class: 'disclaimer' }, 'Iron Form gives general fitness guidance, not medical advice. Check with a doctor before starting a new exercise or diet programme, especially if you have a medical condition, injury, or are pregnant. Stop if you feel pain, dizziness or chest discomfort.'));
    setTimeout(() => {
      const t = new Trainer(stage);
      t.setExercise({ id: 'salute', view: 'side', frames: [{ ua: 120, fa: -125, h: 180 }], tempo: 3 });
      t.play();
    });
    return null;
  }

  function aboutYou(b) {
    const imp = d.units === 'imperial';
    const { ft, inch } = cmToFtIn(d.cm);
    const unitSeg = h('div', { class: 'seg' },
      ['imperial', 'metric'].map((u) => h('button', { type: 'button', class: d.units === u ? 'on' : '', onclick: () => { d.units = u; draw(); } }, u === 'imperial' ? 'lb / ft' : 'kg / cm')));
    b.append(
      h('h2', {}, 'About you'),
      h('p', { class: 'muted small' }, 'Used to estimate your daily calorie needs and how much you can safely lose. Stays on this device.'),
      h('div', { class: 'field' }, h('label', {}, 'Name (what the coach calls you)'), h('input', { type: 'text', value: d.name, placeholder: 'e.g. Sam', oninput: (e) => { d.name = e.target.value.trim(); } })),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', {}, 'Sex (for calorie maths)'),
          h('select', { onchange: (e) => { d.sex = e.target.value; } },
            [['female', 'Female'], ['male', 'Male'], ['other', 'Prefer not to say']].map(([v, l]) => h('option', { value: v, selected: d.sex === v }, l)))),
        h('div', { class: 'field' }, h('label', {}, 'Age'), h('input', { type: 'number', min: 16, max: 90, value: d.age, oninput: (e) => { d.age = +e.target.value; } }))),
      h('div', { class: 'row between' }, h('label', {}, 'Units'), unitSeg),
      h('div', { class: 'grid2', style: { marginTop: '10px' } },
        h('div', { class: 'field' }, h('label', {}, 'Height'),
          imp
            ? h('div', { class: 'inline-inputs' },
              h('input', { type: 'number', min: 4, max: 7, value: ft, 'aria-label': 'feet', oninput: (e) => { const c = cmToFtIn(d.cm); d.cm = ftInToCm(+e.target.value, c.inch); } }),
              h('input', { type: 'number', min: 0, max: 11, value: inch, 'aria-label': 'inches', oninput: (e) => { const c = cmToFtIn(d.cm); d.cm = ftInToCm(c.ft, +e.target.value); } }))
            : h('input', { type: 'number', min: 120, max: 220, value: Math.round(d.cm), oninput: (e) => { d.cm = +e.target.value; } }),
          h('div', { class: 'tiny muted' }, imp ? 'feet / inches' : 'cm')),
        h('div', { class: 'field' }, h('label', {}, `Current weight (${weightUnit(d.units)})`),
          h('input', { type: 'number', step: '0.1', value: round(fromKg(d.kg, d.units), 1), oninput: (e) => { d.kg = toKg(+e.target.value, d.units); } }))),
      h('div', { class: 'field' }, h('label', {}, 'Daily activity outside of workouts'),
        Object.entries(ACTIVITY).map(([k, v]) => h('div', { class: `option ${d.activity === k ? 'on' : ''}`, onclick: () => { d.activity = k; draw(); } }, v.label))),
    );
    return () => {
      if (!(d.age >= 16 && d.age <= 90)) return 'Enter an age between 16 and 90.';
      if (!(d.cm >= 120 && d.cm <= 230)) return 'Check your height.';
      if (!(d.kg >= 35 && d.kg <= 300)) return 'Check your weight.';
      return null;
    };
  }

  function readiness(b) {
    b.append(h('h2', {}, 'Health readiness check'),
      h('p', { class: 'muted small' }, 'Based on the standard pre-exercise screening questions (PAR-Q+). Answering "yes" doesn\'t stop you training. It keeps your plan at a gentle, low-impact level until a doctor clears you.'));
    READINESS.forEach((q, i) => {
      b.append(h('div', { class: 'card flat' }, h('p', {}, q),
        h('div', { class: 'seg' }, [['No', false], ['Yes', true]].map(([l, v]) => h('button', { type: 'button', class: d.readiness[i] === v ? 'on' : '', onclick: () => { d.readiness[i] = v; d.readinessFlag = d.readiness.some(Boolean); draw(); } }, l)))));
    });
    if (d.readinessFlag) {
      b.append(h('div', { class: 'card alert' }, h('h3', {}, '⚠ Please get medical clearance'),
        h('p', { class: 'small' }, 'Talk to your doctor before starting. Until then Iron Form keeps you at beginner intensity with no jumping, adds longer rests, and reminds you to stop if anything feels wrong.')));
    }
    return null;
  }

  function issues(b) {
    b.append(h('h2', {}, 'Any problem areas?'),
      h('p', { class: 'muted small' }, 'Pick any joints or areas that are injured, painful or sensitive. Every exercise that loads them is removed from your plan, and jumping is removed for knees, ankles, hips and lower back.'),
      chips(ISSUE_AREAS, d.issues, { danger: true, onChange: (v) => { d.issues = v; draw(); } }),
      h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', {}, 'Notes (optional, e.g. "old ACL repair on left knee")'),
        h('textarea', { rows: 2, oninput: (e) => { d.issueNotes = e.target.value; } }, d.issueNotes)));
    if (d.issues.length) {
      const removed = EXERCISES.filter((ex) => (d.issues || []).some((a) => (ex.stress[a] || 0) >= 2) || (ex.impact && d.issues.some((a) => ['knee', 'ankle', 'hip', 'back'].includes(a))));
      b.append(h('div', { class: 'card good' }, h('h3', {}, `🛡 ${removed.length} exercises that load this area will never be scheduled`),
        h('p', { class: 'small muted' }, removed.slice(0, 14).map((e) => e.name).join(' · ') + (removed.length > 14 ? ' …' : ''))));
    } else {
      b.append(h('p', { class: 'small muted' }, 'No problem areas? Great. Tap Next.'));
    }
    return null;
  }

  function goal(b) {
    const u = weightUnit(d.units);
    const goalKgTarget = d.kg - d.goalKg;
    b.append(h('h2', {}, 'Your mission'),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', {}, `Weight to lose (${u})`),
          h('input', { type: 'number', step: '0.5', min: 0.5, value: round(fromKg(d.goalKg, d.units), 1), oninput: (e) => { d.goalKg = toKg(+e.target.value, d.units); goalNote.textContent = note(); } })),
        h('div', { class: 'field' }, h('label', {}, 'By this date'),
          h('input', { type: 'date', value: d.targetDate, min: dateKey(addDays(new Date(), 7)), oninput: (e) => { d.targetDate = e.target.value; } }))));
    const note = () => `Target weight: ${fmtW2(d.kg - d.goalKg)} · BMI ${bmi(d.kg - d.goalKg, d.cm).toFixed(1)}`;
    const fmtW2 = (kg) => `${round(fromKg(kg, d.units), 1)} ${u}`;
    const goalNote = h('p', { class: 'small muted' }, note());
    b.append(goalNote);
    void goalKgTarget;
    b.append(h('h3', { style: { marginTop: '14px' } }, 'Fitness level'));
    const desc = {
      1: 'New to exercise or returning after a long break. Can\'t yet do a full push-up.',
      2: 'Training 2–3× a week for a few months. Comfortable with squats, planks, a few push-ups.',
      3: 'Training regularly for 6+ months. Push-ups, lunges and intervals are routine.',
    };
    for (const lv of [1, 2, 3]) {
      b.append(h('div', { class: `option ${d.level === lv ? 'on' : ''}`, onclick: () => { d.level = lv; draw(); } }, h('b', {}, LEVELS[lv]), h('div', { class: 'small muted' }, desc[lv])));
    }
    if (d.readinessFlag && d.level > 1) b.append(h('p', { class: 'small', style: { color: '#ffcf8f' } }, 'Intensity stays at beginner level until your health check is cleared.'));
    return () => {
      if (!(d.goalKg > 0)) return 'Enter how much you want to lose.';
      if (!d.targetDate || d.targetDate < dateKey(addDays(new Date(), 7))) return 'Pick a date at least a week away.';
      return null;
    };
  }

  function focus(b) {
    b.append(h('h2', {}, 'Focus areas'),
      h('p', { class: 'muted small' }, 'Choose as many as you like. Your workouts will lean toward these.'),
      chips(FOCUS_AREAS, d.focus, { onChange: (v) => { d.focus = v.length ? v : ['full']; } }),
      h('div', { class: 'card flat', style: { marginTop: '14px' } },
        h('p', { class: 'small muted' }, '💡 Honest note: you can\'t "spot-reduce" fat from one area (like the belly). Fat loss happens across the whole body from a calorie deficit. Training a focus area builds and tones the muscle underneath, so it looks better as the fat comes off.')));
    return null;
  }

  function equipment(b) {
    const list = d.units === 'imperial' ? DB_LB : DB_KG;
    const toDisp = (kg) => round(d.units === 'imperial' ? kgToLb(kg) : kg, 1);
    const fromDisp = (v) => (d.units === 'imperial' ? lbToKg(v) : v);
    const owned = new Set(d.dumbbells.map(toDisp));
    b.append(h('h2', {}, 'Your equipment'),
      h('p', { class: 'muted small' }, 'Untick anything you don\'t have handy.'),
      chips(EQUIPMENT, d.equipment, { onChange: (v) => { d.equipment = v; draw(); } }));
    if (d.equipment.includes('dumbbells')) {
      const u = weightUnit(d.units);
      b.append(h('h3', { style: { marginTop: '16px' } }, `Which dumbbell weights do you have? (${u} each)`),
        h('p', { class: 'small muted' }, 'Tap every weight you own. The coach picks a safe weight for each exercise and will never prescribe one heavier than is sensible for your level.'),
        chips(list.map((w) => ({ id: w, label: `${w} ${u}` })), [...owned], { onChange: (v) => { d.dumbbells = [...v.map(fromDisp), ...d.dumbbells.filter((w) => !list.includes(toDisp(w)))]; } }));
      const custom = h('input', { type: 'number', step: '0.5', placeholder: `Other weight (${u})` });
      b.append(h('div', { class: 'row', style: { marginTop: '10px' } }, h('div', { class: 'grow' }, custom),
        h('button', { class: 'btn dark small', type: 'button', onclick: () => { const v = +custom.value; if (v > 0) { d.dumbbells = [...new Set([...d.dumbbells, fromDisp(v)])]; draw(); } } }, '+ Add')));
      const extra = d.dumbbells.map(toDisp).filter((w) => !list.includes(w));
      if (extra.length) b.append(h('p', { class: 'small muted' }, `Also: ${extra.map((w) => `${w} ${u}`).join(', ')}`));
    }
    return () => {
      if (d.equipment.includes('dumbbells') && !d.dumbbells.length) return 'Select the dumbbell weights you have (or untick Dumbbells).';
      return null;
    };
  }

  function schedule(b) {
    b.append(h('h2', {}, 'Your schedule'),
      h('h3', {}, 'Minutes per workout'),
      chips([10, 15, 20, 30, 45, 60].map((m) => ({ id: m, label: `${m} min` })), [d.minutes], { multi: false, onChange: ([m]) => { d.minutes = m; } }),
      h('p', { class: 'small muted', style: { marginTop: '6px' } }, 'Includes warm-up and cool-down. The 30-second pep talks are extra.'),
      h('h3', { style: { marginTop: '16px' } }, 'Training days per week'),
      chips([3, 4, 5, 6].map((n) => ({ id: n, label: `${n} days` })), [d.daysPerWeek], { multi: false, onChange: ([n]) => { d.daysPerWeek = n; draw(); } }));
    const tpl = WEEK_TEMPLATES[d.daysPerWeek];
    b.append(h('div', { class: 'card flat', style: { marginTop: '12px' } }, h('div', { class: 'tiny muted' }, 'YOUR WEEKLY ROTATION (repeats from your start day)'),
      h('div', { class: 'week', style: { marginTop: '8px' } }, tpl.map((t, i) => h('div', { class: 'day' }, h('span', { class: 'ic' }, DAY_TYPES[t].icon), `Day ${i + 1}`, h('br'), DAY_TYPES[t].short)))));
    b.append(h('p', { class: 'small muted' }, 'Rest days let muscles repair. Yoga days keep you moving while you recover. Dance days burn calories with less strain.'));
    return null;
  }

  function coach(b) {
    const v = new Voice({ ...st.settings, coach: d.coach });
    loadVoices().then(() => v.configure({ ...st.settings, coach: d.coach }));
    b.append(h('h2', {}, 'Choose your coach\'s voice'),
      h('p', { class: 'muted small' }, 'Sgt. Iron always looks the same. Pick how they sound. Uses your device\'s built-in voices.'));
    for (const [id, c] of Object.entries(COACHES)) {
      b.append(h('div', { class: `option ${d.coach === id ? 'on' : ''}`, onclick: () => { d.coach = id; draw(); } },
        h('div', { class: 'row between' }, h('div', {}, h('b', {}, c.name), h('div', { class: 'small muted' }, c.desc)),
          c.sample ? h('button', { class: 'btn dark small', type: 'button', onclick: (e) => { e.stopPropagation(); unlockAudio(); v.configure({ ...st.settings, coach: id }); v.say(c.sample, { interrupt: true }); } }, '▶ Preview') : null)));
    }
    b.append(h('h2', { style: { marginTop: '18px' } }, 'Workout music'),
      musicPicker(d, (patch) => Object.assign(d, patch), () => { const y = window.scrollY; draw(); window.scrollTo(0, y); }));
    return null;
  }

  function review(b) {
    plan = draftPlan(d);
    const a = plan.assessment;
    const u = d.units;
    const W = (kg) => `${round(fromKg(kg, u), 1)} ${weightUnit(u)}`;
    const statusCard = {
      comfortable: ['good', '✅ Realistic and safe', `Losing ${W(d.goalKg)} by ${fmtDate(d.targetDate)} is about ${W(a.requiredWeeklyKg)} a week, a healthy, sustainable pace.`],
      ambitious: ['alert', '⚡ Achievable, but demanding', `${W(d.goalKg)} by ${fmtDate(d.targetDate)} needs about ${W(a.requiredWeeklyKg)} a week. That's at the top of the safe range, so it'll take strict consistency.`],
      unrealistic: ['danger', '⛔ Not safely achievable by this date', `${W(d.goalKg)} would need ${W(a.requiredWeeklyKg)} a week, more than the safe limit of about 1% of body weight per week.`],
      invalid: ['danger', 'Check your goal', a.notes.join(' ')],
    }[a.status];
    b.append(h('h2', {}, 'Mission assessment'),
      h('div', { class: `card ${statusCard[0]}` }, h('h3', {}, statusCard[1]), h('p', {}, statusCard[2]),
        a.status === 'unrealistic' ? h('div', {},
          h('p', {}, h('b', {}, `Realistic by ${fmtDate(d.targetDate)}: about ${W(a.suggestedKg)}.`), ` To lose the full ${W(d.goalKg)} at a comfortable pace, aim for ${a.safeGoalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.`),
          h('div', { class: 'row' },
            h('button', { class: 'btn small', onclick: () => { d.goalKg = a.suggestedKg; draw(); } }, `Aim for ${W(a.suggestedKg)} by my date`),
            h('button', { class: 'btn dark small', onclick: () => { d.targetDate = dateKey(a.safeGoalDate); draw(); } }, 'Move my date'))) : null,
        a.notes.filter((n) => a.status !== 'invalid').map((n) => h('p', { class: 'small' }, n))));
    if (a.status === 'invalid') return () => 'Go back and fix your goal first.';

    const kv = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
    b.append(h('div', { class: 'card' }, h('h3', {}, 'The numbers'),
      h('dl', { class: 'kv' },
        kv('Maintenance calories', `${a.maintenance} kcal/day`),
        kv('Daily calorie target (food)', `${a.calorieTarget} kcal/day`),
        kv('Planned daily deficit', `${a.dailyDeficit} kcal`),
        kv('From workouts (avg)', `≈${a.exerciseKcalPerDay} kcal/day`),
        kv('From food', `≈${a.dietDeficit} kcal/day`),
        kv('Expected pace', `${W(a.weeklyKg)} / week`),
        kv('Plan target', `−${W(a.planKg)} by ${fmtDate(d.targetDate)}`)),
      h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Workouts alone rarely create a big enough deficit. Most of the loss comes from eating at your calorie target, and the workouts protect muscle, burn extra and speed things up. The plan never sets your intake below a safe minimum.')));

    const owned = { ...d };
    const excluded = EXERCISES.filter((ex) => exclusionReason(ex, owned) && !exclusionReason(ex, { ...owned, issues: [], readinessFlag: false }));
    b.append(h('div', { class: 'card' }, h('h3', {}, 'Your plan'),
      h('p', {}, `${d.daysPerWeek} training days a week · ${d.minutes} min · ${LEVELS[d.readinessFlag ? 1 : d.level]} · Coach: ${COACHES[d.coach].name} · Music: ${d.music ? GENRES[d.musicGenre].name : 'off'}`),
      h('p', { class: 'small muted' }, `Focus: ${d.focus.map((f) => FOCUS_AREAS.find((x) => x.id === f)?.label).join(', ')}`),
      d.issues.length ? h('p', { class: 'small' }, `🛡 Protecting: ${d.issues.map((i) => ISSUE_AREAS.find((x) => x.id === i).label).join(', ')}. ${excluded.length} exercises removed.`) : null,
      h('p', { class: 'small muted' }, 'Volume rises a little each week for 3 weeks, then every 4th week is a lighter "deload" week so your joints recover.')));

    b.append(h('button', {
      class: 'btn big block', onclick: () => {
        d.originalKg = st.profile?.originalKg ?? d.kg;
        commitPlan(d, { ...plan, version: (st.plan?.version || 0) + 1 });
        update((s) => { Object.assign(s.settings, { coach: d.coach, music: d.music, musicGenre: d.musicGenre, musicVolume: d.musicVolume, calmForYoga: d.calmForYoga }); });
        toast(editing ? 'Plan updated.' : 'Welcome aboard, soldier!');
        navigate('/home');
      },
    }, editing ? 'Save new plan' : 'Start my plan'));
    return null;
  }

  draw();
}
