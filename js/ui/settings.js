import { go } from '../nav.js';
import { h, mount, toast, modal } from './dom.js';
import { BY_ID } from '../data/exercises.js';
import { COACHES, Voice, loadVoices, englishVoices, unlockAudio } from '../voice.js';
import { S } from '../service.js';
import { update, exportJSON, importJSON, resetAll, cloudStatus } from '../store.js';
import { musicPicker } from './musicpicker.js';
import { activeInjuries, answerCheckIn } from '../engine/injury.js';
import { areaNames, pausedBy } from './home.js';
import { fmtDate } from './dom.js';

export function renderSettings(root) {
  const st = S();
  const voice = new Voice(st.settings);
  const draw = () => {
    const sysVoices = englishVoices();
    mount(root,
      h('h1', {}, 'Settings'),
      h('div', { class: 'card' }, h('h3', {}, 'Coach voice'),
        Object.entries(COACHES).map(([id, c]) => h('div', { class: `option ${st.settings.coach === id ? 'on' : ''}`, onclick: () => { update((x) => { x.settings.coach = id; }); voice.configure(S().settings); draw(); } },
          h('div', { class: 'row between' }, h('div', {}, h('b', {}, c.name), h('div', { class: 'small muted' }, c.desc)),
            c.sample ? h('button', { class: 'btn dark small', onclick: (e) => { e.stopPropagation(); unlockAudio(); voice.configure({ ...S().settings, coach: id }); voice.say(c.sample, { interrupt: true }); } }, '▶') : null))),
        sysVoices.length ? h('div', { class: 'field' }, h('label', {}, 'Device voice (optional override)'),
          h('select', { onchange: (e) => { update((x) => { x.settings.systemVoice = e.target.value; }); voice.configure(S().settings); } },
            h('option', { value: '' }, 'Automatic (match coach)'),
            sysVoices.map((v) => h('option', { value: v.name, selected: st.settings.systemVoice === v.name }, `${v.name} (${v.lang})`)))) : null,
        h('div', { class: 'field' }, h('label', {}, `Speech speed: ${st.settings.speechRate.toFixed(2)}×`),
          h('input', { type: 'range', min: 0.7, max: 1.3, step: 0.05, value: st.settings.speechRate, style: { width: '100%' }, onchange: (e) => { update((x) => { x.settings.speechRate = +e.target.value; }); draw(); } })),
        toggle('Count reps out loud', 'countReps'), toggle('Countdown beeps', 'beeps')),
      h('div', { class: 'card' }, h('h3', {}, 'Workout music'),
        musicPicker(S().settings, (patch) => update((x) => { Object.assign(x.settings, patch); }), () => { const y = window.scrollY; draw(); window.scrollTo(0, y); })),
      h('div', { class: 'card' }, h('h3', {}, 'Rest between sets'),
        h('div', { class: 'chips' }, [20, 30, 45, 60].map((sec) => h('button', {
          class: `chip ${(st.profile.restSec || 30) === sec ? 'on' : ''}`,
          onclick: () => { update((x) => { x.profile.restSec = sec; }); draw(); toast(`Rest set to ${sec} seconds`); },
        }, `${sec}s`))),
        h('p', { class: 'tiny muted', style: { marginTop: '8px' } }, st.profile.readinessFlag ? 'Your health check is flagged, so rest stays at least 45s until you update it.' : 'Applies to rest between sets. Between exercises you get about 20s to switch.')),
      h('div', { class: 'card' }, h('h3', {}, 'Plan'),
        h('p', { class: 'small muted' }, 'Change your weight goal, date, level, focus areas, problem areas, equipment, dumbbells, minutes, days per week, or health answers. Your history and streak are kept.'),
        h('a', { class: 'btn block', href: '#/edit' }, '✎ Edit profile & rebuild plan')),
      h('div', { class: 'card' }, h('h3', {}, 'Pain & recovery'),
        activeInjuries(S().injuries).length
          ? activeInjuries(S().injuries).map((j) => {
            const paused = pausedBy(j, S().injuries);
            return h('div', { class: 'card flat', style: { marginBottom: '10px' } },
              h('div', {}, h('b', {}, `🩹 ${areaNames(j)}`), ` · ${j.severity} · reported ${fmtDate(j.date, { month: 'short', day: 'numeric' })}`),
              j.note ? h('p', { class: 'small muted' }, `"${j.note}"`) : null,
              (j.reports || []).length > 1 ? h('p', { class: 'tiny muted' }, `Reported ${j.reports.length} times`) : null,
              h('p', { class: 'small' }, `Next check-in: ${fmtDate(j.nextCheck, { weekday: 'short', month: 'short', day: 'numeric' })}`),
              h('details', {}, h('summary', { class: 'small muted' }, `${paused.length} exercises paused`), h('p', { class: 'tiny muted' }, paused.map((e) => e.name).join(' · ') || 'None in your current plan')),
              (j.checks || []).length ? h('p', { class: 'tiny muted' }, `Check-ins: ${j.checks.map((c) => `${fmtDate(c.date, { month: 'short', day: 'numeric' })} ${c.answer}`).join(', ')}`) : null,
              h('button', { class: 'btn ghost small', style: { marginTop: '6px' }, onclick: () => { update((x) => { x.injuries = answerCheckIn(x.injuries, j.id, 'ready'); }); toast('Exercises added back. Start gently.'); draw(); } }, 'I\'m better now: add them back'));
          })
          : h('p', { class: 'small muted' }, 'No active pain reports. Use "Something hurts" during a workout to tell me what hurts; I\'ll protect that area and check in every 2 weeks.'),
        (S().injuries || []).filter((j) => j.status === 'resolved').length
          ? h('details', {}, h('summary', { class: 'small muted' }, 'Recovered'), (S().injuries || []).filter((j) => j.status === 'resolved').slice(-8).reverse().map((j) =>
            h('p', { class: 'tiny muted' }, `${areaNames(j)}: reported ${fmtDate(j.date, { month: 'short', day: 'numeric' })}, cleared ${fmtDate(j.resolvedAt, { month: 'short', day: 'numeric' })}`)))
          : null),
      h('div', { class: 'card' }, h('h3', {}, 'Removed exercises'),
        st.avoid.length
          ? [h('p', { class: 'small muted' }, 'Removed permanently, so they\'re never scheduled. Only restore one when it\'s pain-free.'),
            ...st.avoid.map((id) => h('div', { class: 'row between', style: { padding: '4px 0' } }, h('span', {}, BY_ID[id]?.name || id),
              h('button', { class: 'btn ghost small', onclick: () => { update((x) => { x.avoid = x.avoid.filter((a) => a !== id); }); draw(); toast('Restored to rotation'); } }, 'Restore')))]
          : h('p', { class: 'small muted' }, 'None.'),
        h('p', { class: 'tiny muted', style: { marginTop: '8px' } }, `Training intensity adjustment: ${Math.round((st.intensity - 1) * 100)}% (from your post-workout ratings)`)),
      h('div', { class: 'card' }, h('h3', {}, 'Your data'),
        h('p', { class: 'small muted' }, cloudStatus() === 'synced'
          ? '☁ Synced to your private storage. Only you can read it, and it follows you to any device where you open this app.'
          : 'Stored on this device, in this browser. Export a backup now and then.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn dark small', onclick: async () => {
            const filename = `iron-form-backup-${new Date().toISOString().slice(0, 10)}.json`;
            const data = exportJSON();
            const dl = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
            if (dl) { try { await dl.save({ filename, data }); } catch { toast('Download cancelled'); } return; }
            const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: filename });
            document.body.appendChild(a); a.click(); a.remove();
          } }, '⬇ Export backup'),
          h('button', { class: 'btn dark small', onclick: async () => {
            try { await navigator.clipboard.writeText(exportJSON()); toast('Backup copied to clipboard'); } catch { toast('Copy not allowed here'); }
          } }, '📋 Copy backup'),
          h('label', { class: 'btn dark small', style: { margin: 0 } }, '⬆ Import backup',
            h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
              const f = e.target.files[0]; if (!f) return;
              try { importJSON(await f.text()); toast('Backup restored'); go('/home'); } catch (err) { toast(`Import failed: ${err.message}`); }
            } }))),
        h('button', { class: 'btn red small', style: { marginTop: '12px' }, onclick: () => modal((box, close) => {
          box.append(h('h2', {}, 'Erase everything?'), h('p', { class: 'muted' }, 'This deletes your profile, plan, history and streak from this device. It can\'t be undone.'),
            h('button', { class: 'btn red block', onclick: () => { resetAll(); close(); go('/'); } }, 'Yes, erase all data'),
            h('button', { class: 'btn ghost block', style: { marginTop: '8px' }, onclick: close }, 'Cancel'));
        }) }, 'Reset app')),
      h('p', { class: 'tiny muted center' }, 'Iron Form Fitness v1.0 · General fitness guidance, not medical advice.'));
  };
  const toggle = (label, key) => h('label', { class: 'row between', style: { color: 'var(--text)', margin: '8px 0' } }, label,
    h('input', { type: 'checkbox', checked: st.settings[key], onchange: (e) => { update((x) => { x.settings[key] = e.target.checked; }); } }));
  loadVoices().then(() => { voice.configure(st.settings); draw(); });
  draw();
}
