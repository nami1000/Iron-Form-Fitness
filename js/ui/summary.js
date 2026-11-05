import { go } from '../nav.js';
import { h, mount, ring, fmtDuration, fmtDate, toast } from './dom.js';
import { BY_ID } from '../data/exercises.js';
import { DAY_TYPES } from '../engine/planner.js';
import { rankFor } from '../engine/progress.js';
import { S, fmtW, streak, refreshProjection } from '../service.js';
import { update } from '../store.js';
import { weighInModal } from './home.js';
import { Trainer } from '../trainer.js';

export function muscleBars(tally) {
  const entries = Object.entries(tally).filter(([m]) => m !== 'Heart & lungs' && m !== 'Mind & breath').sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  return h('div', { class: 'bars' }, entries.slice(0, 10).map(([m, v]) =>
    h('div', { class: 'bar' }, h('span', {}, m), h('div', { class: 'progressbar' }, h('i', { style: { width: `${(100 * v) / max}%` } })), h('span', { class: 'tiny muted' }, Math.round(v)))));
}

export function renderSummary(root, id) {
  const st = S();
  const log = st.logs.find((l) => l.id === id);
  if (!log) { go('#/home'); return; }
  const { p, change } = refreshProjection();
  const s = streak();
  if (s > st.bestStreak) update((x) => { x.bestStreak = s; });
  const rank = rankFor(st.logs.length);
  const prevRank = rankFor(st.logs.length - 1);
  const info = log.recovery ? { label: 'Recovery Stretch', icon: '🧘' } : DAY_TYPES[log.type];
  const cardio = (log.muscles['Heart & lungs'] || 0) > 0;
  const hero = h('div', { style: { maxWidth: '300px', margin: '0 auto' } });

  const feedback = h('div', { class: 'card flat' }, h('h3', {}, 'How did that feel?'),
    h('p', { class: 'small muted' }, 'Your answer tunes the next workouts (±5% volume).'),
    h('div', { class: 'grid3' }, [['Too easy', 1.05, '😎'], ['Just right', 1, '💪'], ['Too hard', 0.92, '🥵']].map(([l, f, e]) =>
      h('button', {
        class: `btn ${log.rating === l ? '' : 'dark'} small`, onclick: () => {
          update((x) => {
            const lg = x.logs.find((y) => y.id === id); lg.rating = l;
            x.intensity = Math.max(0.8, Math.min(1.25, (x.intensity || 1) * f));
          });
          toast(f > 1 ? 'Noted: next sessions get a bit tougher.' : f < 1 ? 'Noted: next sessions ease off a little.' : 'Perfect. Holding steady.');
          renderSummary(root, id);
        },
      }, `${e} ${l}`))));

  const items = log.items.filter((it) => it.phase === 'main');
  mount(root,
    h('div', { class: 'header' }, h('a', { href: '#/home', class: 'btn ghost small' }, '← Base'), h('span', { class: 'tiny muted' }, fmtDate(log.date))),
    hero,
    h('h1', { class: 'center' }, log.early ? 'Mission ended' : 'Mission complete'),
    h('p', { class: 'center muted' }, `${info.icon} ${info.label}`),
    h('div', { class: 'streak-banner', style: { margin: '12px 0' } }, h('span', { class: 'flame' }, '🔥'),
      h('div', {}, h('b', {}, `${s}-day streak`), h('div', { class: 'small muted' }, `Best: ${Math.max(s, st.bestStreak)} · Rest days don't break it. Missed training days do.`))),
    rank.title !== prevRank.title ? h('div', { class: 'card good center' }, h('h2', {}, `🎖 Promoted: ${rank.title}!`)) : null,
    change ? h('div', { class: `card ${change.up ? 'good' : 'alert'}` }, h('h3', {}, change.up ? '📈 Projection improved' : '📉 Projection changed'), h('p', { class: 'small' }, change.text)) : null,
    h('div', { class: 'grid3' },
      h('div', { class: 'stat' }, h('b', {}, fmtDuration(log.durationSec)), h('span', {}, 'Time')),
      h('div', { class: 'stat' }, h('b', {}, `≈${log.kcal}`), h('span', {}, 'kcal burned')),
      h('div', { class: 'stat' }, h('b', {}, `🔥 ${s}`), h('span', {}, 'Streak'))),
    h('div', { class: 'grid3', style: { marginTop: '10px' } },
      h('div', { class: 'stat' }, h('b', {}, `${log.setsDone}/${log.setsPlanned}`), h('span', {}, 'Sets')),
      h('div', { class: 'stat' }, h('b', {}, fmtDuration(log.activeSec)), h('span', {}, 'Work time')),
      h('div', { class: 'stat' }, h('b', {}, st.logs.length), h('span', {}, 'Total sessions'))),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Muscles targeted'), muscleBars(log.muscles),
      cardio ? h('p', { class: 'small muted', style: { marginTop: '8px' } }, '❤ Plus a cardio workout for your heart and lungs.') : null),
    h('div', { class: 'card' },
      h('div', { class: 'row', style: { gap: '16px', flexWrap: 'nowrap' } }, ring(p.pct, `${Math.round(p.pct * 100)}%`, 'of goal', 116),
        h('div', { class: 'grow' }, h('h3', {}, 'Goal progress'),
          h('div', { class: 'small' }, `Lost ${fmtW(Math.max(0, p.lost))} of ${fmtW(p.goal)}`),
          h('div', { class: 'small' }, `Projected by ${fmtDate(st.plan.targetDate)}: −${fmtW(Math.max(0, p.projectedLoss))}`),
          h('div', { class: 'tiny muted' }, p.usingTrend ? 'Based on your weigh-in trend and workouts.' : 'Based on your calorie plan and actual workouts. Weekly weigh-ins make this more accurate.'),
          h('div', { class: 'tiny muted' }, `Workout burn vs plan: ${Math.round(p.adherence * 100)}%`))),
      h('button', { class: 'btn dark small', style: { marginTop: '10px' }, onclick: () => weighInModal(() => renderSummary(root, id)) }, '⚖ Log today\'s weight')),
    feedback,
    log.pain?.length ? h('div', { class: 'card alert' }, h('h3', {}, '🩹 Discomfort reported'),
      log.pain.map((x) => h('p', { class: 'small' }, h('b', {}, x.areas?.length ? x.areas.join(' & ') : BY_ID[x.exId]?.name || 'Pain'),
        ` · ${x.severity || 'reported'}${x.exId ? ` during ${BY_ID[x.exId]?.name}` : ''}${x.note ? `: "${x.note}"` : ''}`,
        x.protected || x.removed ? h('span', { class: 'tag ok' }, 'plan adjusted') : null)),
      log.pain.some((x) => x.protected) ? h('p', { class: 'small muted' }, `Exercises that load this area are paused in your plan. I'll check in with you in 14 days (see Settings → Pain & recovery).`) : null,
      h('p', { class: 'small muted' }, 'If pain lasts more than a couple of days, or gets worse, see a doctor or physiotherapist.')) : null,
    h('div', { class: 'card flat' }, h('h3', {}, 'Drill record'),
      items.map((it) => h('div', { class: 'row between small', style: { padding: '4px 0', borderBottom: '1px dashed var(--line)' } },
        h('span', {}, it.skipped ? '⏭ ' : it.setsDone >= it.sets ? '✅ ' : '◐ ', BY_ID[it.exId]?.name),
        h('span', { class: 'muted' }, `${it.setsDone}/${it.sets} sets${it.reps ? ` × ${it.reps}` : it.secs ? ` × ${it.secs}s` : ''}`)))),
    log.endPep ? h('div', { class: 'card flat' }, h('h3', {}, 'Coach\'s debrief'), h('p', { class: 'small muted' }, `“${log.endPep}”`)) : null,
    h('a', { class: 'btn block big', href: '#/home' }, 'Back to base'));
  const t = new Trainer(hero, { size: 'md' });
  t.setExercise({ id: 'victory', view: 'front', frames: [{ ua: 150, fa: 160, th: 8 }, { ua: 160, fa: 172, th: 8, lift: 4 }], tempo: 1.4 });
  t.play();
}
