import { h, mount, ring, fmtDate, modal, toast } from './dom.js';
import { Trainer } from '../trainer.js';
import { BY_ID, ISSUE_AREAS } from '../data/exercises.js';
import { DAY_TYPES, dateKey, addDays, parseKey, LEVELS, CATCH_UP, exclusionReason } from '../engine/planner.js';
import { rankFor, needsWeighIn } from '../engine/progress.js';
import { fromKg, toKg, weightUnit, round } from '../engine/units.js';
import { S, fmtW, sessionFor, todayType, streak, refreshProjection, dayPlan, thisWeek } from '../service.js';
import { update } from '../store.js';
import { unlockAudio } from '../music.js';
import { dueCheckIns, answerCheckIn, PAIN_AREAS, CHECK_IN_DAYS, planProfile, planAvoid } from '../engine/injury.js';
import { EXERCISES } from '../data/exercises.js';

export function rxText(it, units) {
  const ex = BY_ID[it.exId];
  let s = it.mode === 'reps' ? `${it.sets} × ${it.reps}` : `${it.sets > 1 ? `${it.sets} × ` : ''}${it.secs}s`;
  if (ex.uni) s += ' /side';
  if (it.weightKg) s += ` @ ${round(fromKg(it.weightKg, units), 1)} ${weightUnit(units)}`;
  return s;
}

export function thumb(ex, phase = 0.5) {
  const box = h('div', { class: 'thumb' });
  const t = new Trainer(box, { size: 'sm' });
  t.setExercise(ex);
  t.still(ex.frames.length > 1 ? phase : 0);
  return box;
}

export function exerciseRow(it, units, onClick) {
  const ex = BY_ID[it.exId];
  return h('div', { class: 'list-ex', style: { cursor: 'pointer' }, onclick: onClick },
    thumb(ex),
    h('div', { class: 'info' },
      h('div', { class: 'name' }, ex.name),
      h('div', { class: 'tiny muted' }, ex.muscles.slice(0, 3).join(' · '), it.label ? ` · ${it.label}` : ''),
      it.cautions?.length ? h('span', { class: 'tag warn' }, `Go gentle: ${it.cautions.map((c) => ISSUE_AREAS.find((x) => x.id === c)?.label).join(', ')}`) : null),
    h('div', { class: 'rx' }, rxText(it, units)));
}

export function weighInModal(onDone) {
  const st = S();
  const u = st.profile.units;
  modal((box, close) => {
    const inp = h('input', { type: 'number', step: '0.1', value: round(fromKg(latest(st), u), 1) });
    box.append(h('h2', {}, 'Weekly weigh-in'),
      h('p', { class: 'small muted' }, 'Best done first thing in the morning, after the bathroom, before eating. Same time each week. Daily numbers bounce around with water, so the trend matters, not one reading.'),
      h('div', { class: 'field' }, h('label', {}, `Weight (${weightUnit(u)})`), inp),
      h('button', {
        class: 'btn block', onclick: () => {
          const v = +inp.value;
          if (!(v > 0)) { toast('Enter your weight'); return; }
          const kg = toKg(v, u);
          update((s) => {
            s.weighIns = s.weighIns.filter((w) => w.date !== dateKey());
            s.weighIns.push({ date: dateKey(), kg });
          });
          const { change } = refreshProjection();
          close();
          toast(change ? change.text : 'Weight logged.', change ? 6000 : 2400);
          onDone?.();
        },
      }, 'Log weight'));
  });
}

function latest(st) {
  const w = [...st.weighIns].sort((a, b) => a.date.localeCompare(b.date)).pop();
  return w ? w.kg : st.profile.kg;
}

export function renderHome(root) {
  const st = S();
  const { p } = refreshProjection();
  const s = streak();
  if (s > st.bestStreak) update((x) => { x.bestStreak = s; });
  const rank = rankFor(st.logs.length);
  const today = new Date();
  const tKey = dateKey(today);
  const type = todayType(today);
  const doneToday = st.logs.filter((l) => l.date === tKey);
  const name = st.profile.name || 'Soldier';

  // header
  const header = h('div', { class: 'header' },
    h('div', { class: 'brand' }, 'IRON FORM', h('small', {}, `${rank.title.toUpperCase()} ${name.toUpperCase()}`)),
    h('div', { class: 'row' }, h('span', { class: 'badge fire', title: 'Streak' }, `🔥 ${s}`), h('span', { class: 'badge rank' }, `🎖 ${st.logs.length}`)));

  // notices
  const notices = st.notices.filter((n) => n.date === tKey).slice(0, 2).map((n) =>
    h('div', { class: `card ${n.up ? 'good' : 'alert'}` }, h('div', { class: 'small' }, n.up ? '📈 ' : '📉 ', n.text)));
  if (p.tooFast) {
    notices.push(h('div', { class: 'card alert' }, h('h3', {}, 'Slow down a little'),
      h('p', { class: 'small' }, `You're losing about ${fmtW(p.measuredRatePerWeek)} a week, faster than the safe ~1%/week. Eat a bit more (closer to ${st.plan.assessment.calorieTarget + 150} kcal) to protect muscle and energy.`)));
  }
  if (st.profile.readinessFlag) {
    notices.push(h('div', { class: 'card alert' }, h('div', { class: 'small' }, '⚕ Your health check flagged something. Workouts stay gentle until you get medical clearance (update it in Settings → Edit profile).')));
  }

  // adaptive plan notice
  const ws = thisWeek(today);
  if (ws?.missed) {
    const wd = (k) => parseKey(k).toLocaleDateString(undefined, { weekday: 'short' });
    const missedDays = ws.days.filter((d) => d.status === 'missed');
    const moved = ws.days.filter((d) => d.usedRest);
    const lines = [
      `Missed: ${missedDays.map((d) => `${wd(d.key)} (${DAY_TYPES[d.type].short})`).join(', ')}. Your week has been rearranged so the important workouts still happen.`,
      ws.today.status !== 'done' ? `Today: ${DAY_TYPES[ws.today.type].label}.` : null,
      moved.length ? `${moved.map((d) => wd(d.key)).join(', ')} rest day → ${moved.map((d) => DAY_TYPES[d.type].short).join(', ')} (safe to use: you still get ${7 - ws.days.filter((d) => d.type !== 'rest' && d.status !== 'missed').length} day(s) off this week).` : null,
      ws.dropped.length ? `Dropped this week: ${ws.dropped.map((t) => DAY_TYPES[t].short).join(', ')}. Extra work in the remaining sessions makes up the calories.` : null,
      ws.safe.ok ? `⚡ Catch-up sessions: +${CATCH_UP.minutes} min and up to +${Math.round((CATCH_UP.volume - 1) * 100)}% volume, within your safety limits.`
        : `Not adding extra work or using rest days because ${ws.safe.why}. Safety first; your projection will update.`,
    ].filter(Boolean);
    notices.unshift(h('div', { class: 'card alert' }, h('h3', {}, '📋 Plan adjusted'), lines.map((l) => h('p', { class: 'small' }, l))));
  }

  // today card
  const todayCard = h('div', { class: 'card' });
  const info = DAY_TYPES[type];
  if (doneToday.length) {
    const l = doneToday[doneToday.length - 1];
    todayCard.append(h('div', { class: 'tiny muted' }, 'TODAY'), h('h2', {}, `✅ Mission complete`),
      h('p', {}, `${info.label}: ${Math.round(l.durationSec / 60)} min, ≈${l.kcal} kcal.`),
      h('div', { class: 'row' }, h('a', { class: 'btn dark small', href: `#/summary/${l.id}` }, 'View report'),
        h('a', { class: 'btn ghost small', href: '#/session' }, 'Train again')));
  } else if (type === 'rest') {
    todayCard.append(h('div', { class: 'tiny muted' }, 'TODAY'), h('h2', {}, `${info.icon} Rest day`),
      h('p', { class: 'muted' }, 'Muscles grow and joints recover on rest days. A gentle walk is great. Your streak is safe.'),
      h('div', { class: 'row' },
        h('a', { class: 'btn dark', href: '#/session?recovery=1' }, '🧘 10-min recovery stretch'),
        h('button', { class: 'btn ghost small', onclick: () => pickType() }, 'Train anyway')));
  } else {
    const sess = sessionFor(today);
    const main = sess.items.filter((i) => i.phase === 'main');
    todayCard.append(h('div', { class: 'row between' }, h('div', { class: 'tiny muted' }, `TODAY · WEEK ${sess.prog.week}${sess.prog.deload ? ' · DELOAD (lighter)' : ''}`),
      h('button', { class: 'linkbtn small', onclick: () => pickType() }, 'Change')),
      h('h2', {}, `${info.icon} ${info.label}`),
      h('div', { class: 'row' }, h('span', { class: 'badge' }, `⏱ ${Math.round(sess.seconds / 60)} min`), h('span', { class: 'badge' }, `🔥 ≈${sess.kcal} kcal`), h('span', { class: 'badge' }, `${main.length} drills`),
        sess.catchUp ? h('span', { class: 'badge fire' }, `⚡ Catch-up +${CATCH_UP.minutes} min`) : null),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, [...new Set(main.map((i) => BY_ID[i.exId].name))].slice(0, 6).join(' · ')),
      h('a', { class: 'btn big block', href: '#/session' }, '▶ Start mission'));
  }

  function pickType() {
    modal((box, close) => {
      box.append(h('h2', {}, 'Change today\'s workout'), h('p', { class: 'small muted' }, 'Swap today for a different type, or reshuffle the exercises.'));
      for (const [k, v] of Object.entries(DAY_TYPES)) {
        if (k === 'rest') continue;
        box.append(h('div', { class: 'option', onclick: () => { update((x) => { x.salt[`${tKey}:type`] = k; }); close(); renderHome(root); } }, `${v.icon} ${v.label}`));
      }
      box.append(h('button', { class: 'btn dark block', onclick: () => { update((x) => { x.salt[tKey] = Math.random().toString(36).slice(2, 7); }); close(); renderHome(root); toast('Exercises reshuffled'); } }, '🔀 Reshuffle exercises'),
        h('button', { class: 'btn ghost block', style: { marginTop: '8px' }, onclick: () => { update((x) => { delete x.salt[`${tKey}:type`]; delete x.salt[tKey]; }); close(); renderHome(root); } }, 'Reset to plan'));
    });
  }

  // goal card
  const a = st.plan.assessment;
  const statusTxt = { 'on-track': ['On track', 'ok'], ahead: ['Ahead of plan', 'ok'], behind: ['Behind plan', 'warn'] }[p.status];
  const goalCard = h('div', { class: 'card' },
    h('div', { class: 'row', style: { alignItems: 'center', gap: '16px', flexWrap: 'nowrap' } },
      ring(p.pct, `${Math.round(p.pct * 100)}%`, 'of goal'),
      h('div', { class: 'grow' },
        h('h3', {}, 'Mission objective'),
        h('div', {}, `Lose ${fmtW(a.goalKg)} by ${fmtDate(st.plan.targetDate)}`),
        h('div', { class: 'small muted' }, `Lost so far: ${fmtW(Math.max(0, p.lost))} · Now ${fmtW(p.current)}`),
        h('div', { class: 'small' }, `Projected by deadline: −${fmtW(Math.max(0, p.projectedLoss))} `, h('span', { class: `tag ${statusTxt[1]}` }, statusTxt[0])),
        h('div', { class: 'tiny muted' }, `${p.daysLeft} days left · Food target ${a.calorieTarget} kcal/day`))),
    needsWeighIn(st) ? h('button', { class: 'btn dark block', style: { marginTop: '12px' }, onclick: () => weighInModal(() => renderHome(root)) }, '⚖ Time for your weekly weigh-in') : null);

  // week strip
  const startOfWeek = addDays(today, -((today.getDay() + 6) % 7));
  const logged = new Set(st.logs.map((l) => l.date));
  const week = h('div', { class: 'card flat' }, h('div', { class: 'row between' }, h('h3', {}, 'This week'), h('span', { class: 'tiny muted' }, `Best streak ${Math.max(st.bestStreak, s)} 🔥`)),
    h('div', { class: 'week' }, Array.from({ length: 7 }, (_, i) => {
      const d = addDays(startOfWeek, i); const k = dateKey(d);
      const dp = k < st.plan.startDate ? null : dayPlan(d);
      const t = !dp ? null : k === tKey ? todayType(d) : dp.type;
      const done = logged.has(k);
      const missedDay = !done && dp && dp.status === 'missed';
      const cls = ['day', k === tKey ? 'today' : '', done ? 'done' : '', missedDay ? 'missed' : '', dp?.usedRest ? 'moved' : ''].join(' ');
      return h('div', { class: cls, title: dp?.usedRest ? 'Rest day used to catch up' : '' }, d.toLocaleDateString(undefined, { weekday: 'short' }),
        h('span', { class: 'ic' }, done ? '✅' : missedDay ? '✖' : t ? DAY_TYPES[t].icon : '·'),
        t ? (missedDay ? h('s', {}, DAY_TYPES[t].short) : DAY_TYPES[t].short) : '', dp?.catchUp && !done ? h('span', { class: 'cu' }, '⚡') : null);
    })));

  const rankCard = rank.next ? h('div', { class: 'card flat' }, h('div', { class: 'row between' }, h('div', {}, h('h3', {}, `Rank: ${rank.title}`), h('div', { class: 'small muted' }, `${rank.next.remaining} more sessions to ${rank.next.title}`)), h('span', { style: { fontSize: '2rem' } }, '🎖')),
    h('div', { class: 'progressbar', style: { marginTop: '8px' } }, h('i', { style: { width: `${100 * (1 - rank.next.remaining / Math.max(1, rank.next.at))}%` } }))) : null;

  const streakMsg = doneToday.length ? 'Locked in for today. See you next session.'
    : type === 'rest' ? 'Rest day: your streak is safe.'
      : s > 0 ? `Train today to make it ${s + 1}.` : 'Finish today\'s mission to start your streak.';
  const streakCard = h('div', { class: 'streak-banner', style: { marginBottom: '14px' } }, h('span', { class: 'flame' }, s > 0 ? '🔥' : '🪖'),
    h('div', { class: 'grow' }, h('b', {}, `${s}-day streak`), h('div', { class: 'small muted' }, streakMsg)),
    h('div', { class: 'tiny muted', style: { textAlign: 'right' } }, 'BEST', h('br'), h('b', { style: { fontSize: '1.2rem' } }, Math.max(s, st.bestStreak))));
  // 2-week pain check-ins
  const checkIns = dueCheckIns(st.injuries || []).map((j) => checkInCard(j, () => renderHome(root)));
  mount(root, header, ...checkIns, streakCard, ...notices, todayCard, goalCard, week, rankCard,
    h('p', { class: 'tiny muted center' }, `${LEVELS[st.profile.level]} · ${st.profile.minutes} min · ${st.profile.daysPerWeek} days/week · plan started ${fmtDate(st.plan.startDate)}`));
}

export const areaNames = (j) => (j.areas.length ? j.areas.map((a) => PAIN_AREAS.find((p) => p.id === a)?.label.toLowerCase()).join(' & ') : (j.exIds.map((id) => BY_ID[id]?.name).join(', ') || 'injury'));

/** Exercises currently held back by an injury report. */
export function pausedBy(j, injuries) {
  const st = S();
  const others = injuries.filter((x) => x.id !== j.id);
  const without = { p: planProfile(st.profile, others), a: planAvoid(st.avoid, others) };
  const withIt = { p: planProfile(st.profile, injuries), a: planAvoid(st.avoid, injuries) };
  // in the plan if not for this report
  return EXERCISES.filter((e) => !exclusionReason(e, without.p, without.a) && exclusionReason(e, withIt.p, withIt.a));
}

export function checkInCard(j, onDone) {
  const st = S();
  const n = pausedBy(j, st.injuries).length;
  const weeks = Math.round((Date.now() - parseKey(j.date).getTime()) / (7 * 86400000));
  const answer = (a) => {
    update((x) => { x.injuries = answerCheckIn(x.injuries, j.id, a); });
    if (a === 'ready') toast(`Welcome back! ${n} exercises are back in your plan. Start gently.`, 4500);
    else if (a === 'worse') toast('Keeping them paused. Please get it checked by a doctor or physio.', 5000);
    else toast(`No rush. I'll check again in ${CHECK_IN_DAYS} days.`, 3500);
    onDone?.();
  };
  return h('div', { class: 'card alert' },
    h('h3', {}, `🩹 Check-in: how is your ${areaNames(j)}?`),
    h('p', { class: 'small' }, `You reported ${j.severity} pain ${weeks >= 1 ? `${weeks} week${weeks > 1 ? 's' : ''}` : 'recently'} ago (${fmtDate(j.date, { month: 'short', day: 'numeric' })})${j.note ? `: "${j.note}"` : ''}. Since then ${n} exercise${n === 1 ? ' has' : 's have'} been paused to protect it.`),
    (j.checks || []).length ? h('p', { class: 'tiny muted' }, `Earlier check-ins: ${j.checks.map((c) => `${fmtDate(c.date, { month: 'short', day: 'numeric' })} ${c.answer === 'worse' ? 'worse' : 'not ready'}`).join(', ')}`) : null,
    h('p', { class: 'small' }, 'Are you pain-free in daily life and ready to bring those exercises back?'),
    h('button', { class: 'btn green block', onclick: () => answer('ready') }, '✅ Feeling good. Add them back'),
    h('button', { class: 'btn dark block', style: { marginTop: '8px' }, onclick: () => answer('not-yet') }, `⏳ Better, but not ready yet (ask in ${CHECK_IN_DAYS} days)`),
    h('button', { class: 'btn ghost block', style: { marginTop: '8px' }, onclick: () => answer('worse') }, '😣 Still hurts or worse'),
    h('p', { class: 'tiny muted', style: { marginTop: '8px' } }, 'Pain lasting more than 2 weeks is worth getting checked by a doctor or physiotherapist.'));
}

export function renderSessionPreview(root, query) {
  const st = S();
  const recovery = query.get('recovery') === '1';
  const sess = sessionFor(new Date(), { recovery });
  const u = st.profile.units;
  const info = recovery ? { label: 'Recovery Stretch', icon: '🧘' } : DAY_TYPES[sess.type];
  const groups = [['warmup', 'Warm-up'], ['main', 'Main mission'], ['cooldown', 'Cool-down']];
  const equip = new Set(sess.items.flatMap((i) => BY_ID[i.exId].equip));
  const weights = sess.items.filter((i) => i.weightKg).map((i) => i.weightKg);
  const body = h('div', {});
  for (const [ph, label] of groups) {
    const items = sess.items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.phase === ph);
    if (!items.length) continue;
    body.append(h('div', { class: 'phase-title' }, label.toUpperCase()));
    const card = h('div', { class: 'card flat', style: { padding: '4px 14px' } });
    items.forEach(({ it }) => card.append(exerciseRow(it, u, () => exerciseModal(BY_ID[it.exId], it))));
    body.append(card);
  }
  mount(root,
    h('div', { class: 'header' }, h('a', { href: '#/home', class: 'btn ghost small' }, '← Base'), h('span', { class: 'tiny muted' }, recovery ? 'OPTIONAL' : `WEEK ${sess.prog.week}`)),
    h('h1', {}, `${info.icon} ${info.label}`),
    h('div', { class: 'row' }, h('span', { class: 'badge' }, `⏱ ${Math.round(sess.seconds / 60)} min + 1 min pep talks`), h('span', { class: 'badge' }, `🔥 ≈${sess.kcal} kcal`),
      sess.catchUp ? h('span', { class: 'badge fire' }, `⚡ Catch-up: +${CATCH_UP.minutes} min, +${Math.round((CATCH_UP.volume - 1) * 100)}% volume`) : null),
    h('div', { class: 'card flat', style: { marginTop: '12px' } }, h('div', { class: 'small' }, h('b', {}, 'Gear: '), equip.size ? [...equip].join(', ') : 'none, bodyweight only',
      weights.length ? ` · Dumbbells: ${[...new Set(weights)].sort((a, b) => a - b).map((w) => `${round(fromKg(w, u), 1)}`).join(', ')} ${weightUnit(u)}` : ''),
    h('div', { class: 'tiny muted' }, 'Tap any drill to see the demo and how to do it.')),
    body,
    h('a', { class: 'btn big block', href: `#/player${recovery ? '?recovery=1' : ''}`, style: { position: 'sticky', bottom: '76px' }, onclick: () => { unlockAudio(); } }, '▶ Start'));
}

export function exerciseModal(ex, item, extra) {
  modal((box, close) => {
    const stage = h('div', {});
    const st = S();
    box.append(h('div', { class: 'row between' }, h('h2', {}, ex.name), h('button', { class: 'btn ghost small', onclick: close }, '✕')), stage,
      item ? h('div', { class: 'rx-line' }, h('span', { class: 'badge' }, rxText(item, st.profile?.units || 'metric'))) : null,
      h('div', { style: { margin: '8px 0' } }, ex.muscles.map((m) => h('span', { class: 'tag' }, m)), ex.equip.map((e) => h('span', { class: 'tag ok' }, e))),
      extra || null,
      h('h3', {}, 'How to do it'), h('ol', { class: 'steps-list' }, ex.steps.map((s) => h('li', {}, s))),
      h('h3', {}, 'Coach\'s cues'), h('p', { class: 'muted' }, ex.cues.join(' · ')),
      item?.cautions?.length ? h('div', { class: 'card alert' }, h('div', { class: 'small' }, `This lightly involves your ${item.cautions.join(', ')}. Use a smaller range, go slowly, and stop if it hurts.`)) : null);
    const t = new Trainer(stage);
    t.setExercise(ex);
    t.play();
  });
}

export { parseKey };
