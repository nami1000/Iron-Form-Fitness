import { h, mount, fmtDate, fmtDuration } from './dom.js';
import { DAY_TYPES, parseKey, dateKey, addDays } from '../engine/planner.js';
import { fromKg, weightUnit, round } from '../engine/units.js';
import { S, fmtW, proj, streak } from '../service.js';
import { weighInModal } from './home.js';
import { muscleBars } from './summary.js';
import { update } from '../store.js';

function weightChart(st, p) {
  const u = st.profile.units;
  const start = parseKey(st.plan.startDate);
  const end = parseKey(st.plan.targetDate);
  const pts = [{ date: st.plan.startDate, kg: st.profile.kg }, ...st.weighIns.filter((w) => w.date >= st.plan.startDate)].sort((a, b) => a.date.localeCompare(b.date));
  const goalKg = st.profile.kg - st.plan.assessment.goalKg;
  const planKg = st.profile.kg - st.plan.assessment.planKg;
  const today = new Date();
  const all = [...pts.map((x) => x.kg), goalKg, p.projectedKg, st.profile.kg];
  const lo = Math.min(...all) - 1; const hi = Math.max(...all) + 1;
  const W = 600; const H = 300; const L = 64; const R = 14; const T = 14; const B = 40;
  const x = (d) => L + ((d - start) / Math.max(1, end - start)) * (W - L - R);
  const y = (kg) => T + ((hi - kg) / (hi - lo)) * (H - T - B);
  const fmt = (kg) => round(fromKg(kg, u), 0);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight chart">`;
  for (let k = 0; k <= 4; k += 1) {
    const kg = lo + ((hi - lo) * k) / 4;
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(kg)}" y2="${y(kg)}" stroke="#2c3622"/><text x="${L - 6}" y="${y(kg) + 4}" fill="#a7ab92" font-size="20" text-anchor="end">${fmt(kg)}</text>`;
  }
  svg += `<line x1="${L}" x2="${W - R}" y1="${y(goalKg)}" y2="${y(goalKg)}" stroke="#7fb04a" stroke-dasharray="6 5"/>`;
  svg += `<line x1="${x(start)}" y1="${y(st.profile.kg)}" x2="${x(end)}" y2="${y(planKg)}" stroke="#6b7350" stroke-dasharray="3 4"/>`;
  const tx = Math.min(x(today), x(end));
  svg += `<line x1="${tx}" y1="${y(p.current)}" x2="${x(end)}" y2="${y(p.projectedKg)}" stroke="#e0912b" stroke-dasharray="5 4" stroke-width="2"/>`;
  svg += `<polyline fill="none" stroke="#e2cf74" stroke-width="3" stroke-linejoin="round" points="${pts.map((q) => `${x(parseKey(q.date))},${y(q.kg)}`).join(' ')}"/>`;
  for (const q of pts) svg += `<circle cx="${x(parseKey(q.date))}" cy="${y(q.kg)}" r="6" fill="#e2cf74"/>`;
  svg += `<text x="${L}" y="${H - 8}" fill="#a7ab92" font-size="20">${fmtDate(st.plan.startDate, { month: 'short', day: 'numeric' })}</text><text x="${W - R}" y="${H - 8}" fill="#a7ab92" font-size="20" text-anchor="end">${fmtDate(st.plan.targetDate, { month: 'short', day: 'numeric' })}</text>`;
  svg += '</svg>';
  const box = h('div', { class: 'chart', html: svg });
  return h('div', {}, box, h('div', { class: 'legend' },
    h('span', {}, h('i', { style: { background: '#e2cf74' } }), `Weigh-ins (${weightUnit(u)})`),
    h('span', {}, h('i', { style: { background: '#6b7350' } }), 'Plan'),
    h('span', {}, h('i', { style: { background: '#e0912b' } }), 'Projection'),
    h('span', {}, h('i', { style: { background: '#7fb04a' } }), 'Goal')));
}

export function renderProgress(root) {
  const st = S();
  const p = proj();
  const s = streak();
  const since = dateKey(addDays(new Date(), -28));
  const recent = st.logs.filter((l) => l.date > since);
  const tally = {};
  for (const l of recent) for (const [m, v] of Object.entries(l.muscles || {})) tally[m] = (tally[m] || 0) + v;
  const totalKcal = st.logs.reduce((a, l) => a + (l.kcal || 0), 0);
  const totalMin = Math.round(st.logs.reduce((a, l) => a + (l.durationSec || 0), 0) / 60);
  mount(root,
    h('h1', {}, 'Progress'),
    h('div', { class: 'grid3' },
      h('div', { class: 'stat' }, h('b', {}, `🔥 ${s}`), h('span', {}, `Streak (best ${Math.max(s, st.bestStreak)})`)),
      h('div', { class: 'stat' }, h('b', {}, st.logs.length), h('span', {}, 'Sessions')),
      h('div', { class: 'stat' }, h('b', {}, `${totalKcal}`), h('span', {}, `kcal · ${totalMin} min`))),
    h('div', { class: 'card', style: { marginTop: '14px' } },
      h('div', { class: 'row between' }, h('h3', {}, 'Weight'), h('button', { class: 'btn small', onclick: () => weighInModal(() => renderProgress(root)) }, '+ Log weight')),
      weightChart(st, p),
      h('dl', { class: 'kv', style: { marginTop: '10px' } },
        h('dt', {}, 'Start → now'), h('dd', {}, `${fmtW(st.profile.kg)} → ${fmtW(p.current)}`),
        h('dt', {}, 'Lost so far'), h('dd', {}, fmtW(Math.max(0, p.lost))),
        h('dt', {}, 'Goal'), h('dd', {}, `−${fmtW(p.goal)} by ${fmtDate(st.plan.targetDate)}`),
        h('dt', {}, 'Projected by deadline'), h('dd', {}, `−${fmtW(Math.max(0, p.projectedLoss))}`),
        h('dt', {}, 'Current pace'), h('dd', {}, `${fmtW(p.rateKgPerWeek)} / week`),
        h('dt', {}, 'Workout burn vs plan (14 days)'), h('dd', {}, `${Math.round(p.adherence * 100)}%`)),
      p.usingTrend ? null : h('p', { class: 'tiny muted', style: { marginTop: '8px' } }, 'Projection uses your calorie plan and actual workouts until you have 3+ weigh-ins over 10+ days, then blends in your real trend.')),
    st.notices.length ? h('div', { class: 'card flat' }, h('h3', {}, 'Projection updates'),
      st.notices.slice(0, 6).map((n) => h('p', { class: 'small' }, h('span', { class: 'muted' }, `${fmtDate(n.date, { month: 'short', day: 'numeric' })}: `), n.text))) : null,
    h('div', { class: 'card' }, h('h3', {}, 'Muscles trained · last 4 weeks'), Object.keys(tally).length ? muscleBars(tally) : h('p', { class: 'muted small' }, 'Complete a workout to see this.')),
    h('div', { class: 'card flat' }, h('h3', {}, 'Mission log'),
      st.logs.length ? [...st.logs].reverse().slice(0, 40).map((l) => h('a', { href: `#/summary/${l.id}`, class: 'row between', style: { padding: '8px 0', borderBottom: '1px dashed var(--line)', textDecoration: 'none', color: 'inherit' } },
        h('span', {}, `${l.recovery ? '🧘' : DAY_TYPES[l.type]?.icon || '•'} ${fmtDate(l.date, { weekday: 'short', month: 'short', day: 'numeric' })}`),
        h('span', { class: 'small muted' }, `${fmtDuration(l.durationSec)} · ≈${l.kcal} kcal${l.rating ? ` · ${l.rating}` : ''}`))) : h('p', { class: 'muted small' }, 'No missions yet. Your first one is waiting on the Base screen.')),
    st.weighIns.length ? h('div', { class: 'card flat' }, h('h3', {}, 'Weigh-ins'),
      [...st.weighIns].sort((a, b) => b.date.localeCompare(a.date)).map((w) => h('div', { class: 'row between small', style: { padding: '4px 0' } },
        h('span', {}, fmtDate(w.date)), h('span', {}, fmtW(w.kg), ' ',
          h('button', { class: 'linkbtn tiny', onclick: () => { update((x) => { x.weighIns = x.weighIns.filter((y) => y !== w && !(y.date === w.date && y.kg === w.kg)); }); renderProgress(root); } }, 'delete'))))) : null);
}
