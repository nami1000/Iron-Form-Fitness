import { h, mount } from './dom.js';
import { EXERCISES } from '../data/exercises.js';
import { exclusionReason } from '../engine/planner.js';
import { S, planInputs } from '../service.js';
import { injuryFor } from '../engine/injury.js';
import { thumb, exerciseModal } from './home.js';

const CATS = [['warmup', 'Warm-up'], ['strength', 'Strength'], ['core', 'Core'], ['cardio', 'Cardio'], ['dance', 'Dance'], ['yoga', 'Yoga'], ['stretch', 'Stretch & cool-down']];

export function renderLibrary(root) {
  const st = S();
  const { profile, avoid } = planInputs();
  let filter = 'all';
  const draw = () => {
    const sections = CATS.map(([cat, label]) => {
      const list = EXERCISES.filter((e) => e.cat === cat).map((e) => ({ e, why: (injuryFor(e, st.injuries) ? `Paused while your ${injuryFor(e, st.injuries).areas.join(' / ') || 'injury'} recovers (check-in ${injuryFor(e, st.injuries).nextCheck})` : null) || exclusionReason(e, profile, avoid) }))
        .filter(({ why }) => filter === 'all' || (filter === 'mine' ? !why : !!why));
      if (!list.length) return null;
      return h('div', {}, h('div', { class: 'phase-title' }, label.toUpperCase()),
        h('div', { class: 'card flat', style: { padding: '4px 14px' } }, list.map(({ e, why }) =>
          h('div', { class: 'list-ex', style: { cursor: 'pointer', opacity: why ? 0.6 : 1 }, onclick: () => exerciseModal(e, null, why ? h('div', { class: 'card alert' }, h('div', { class: 'small' }, `Not in your plan: ${why}.`)) : h('span', { class: 'tag ok' }, 'In your plan rotation')) },
            thumb(e), h('div', { class: 'info' }, h('div', { class: 'name' }, e.name), h('div', { class: 'tiny muted' }, e.muscles.join(' · ')),
              why ? h('span', { class: 'tag warn' }, why) : h('span', { class: 'tag ok' }, '✓ in your plan'))))));
    }).filter(Boolean);
    mount(root, h('h1', {}, 'Drill library'),
      h('p', { class: 'muted small' }, 'Every move Sgt. Iron can teach you. Tap one to watch the demo.'),
      h('div', { class: 'seg', style: { marginBottom: '10px' } }, [['all', 'All'], ['mine', 'In my plan'], ['excluded', 'Excluded']].map(([k, l]) =>
        h('button', { class: filter === k ? 'on' : '', onclick: () => { filter = k; draw(); } }, l))),
      sections);
  };
  draw();
}
