import { h, toast } from './dom.js';
import { GENRES, music, unlockAudio, audioState } from '../music.js';

let previewTimer = null;
function preview(genre, volume) {
  // must run synchronously inside the tap (iOS audio rules)
  unlockAudio();
  clearTimeout(previewTimer);
  music.stop();
  music.setVolume(volume);
  music.start(genre);
  previewTimer = setTimeout(() => music.stop(), 9000);
  if (audioState() !== 'running') setTimeout(() => { if (audioState() !== 'running') toast('Sound is blocked. Check your volume, and on iPhone try flipping the silent switch off.', 5000); }, 800);
}
export function stopPreview() { clearTimeout(previewTimer); music.stop(); }

/**
 * Music settings block.
 * @param {object} s  settings object (music, musicGenre, musicVolume, calmForYoga)
 * @param {(patch: object) => void} set  persist a change
 * @param {() => void} redraw
 */
export function musicPicker(s, set, redraw) {
  const wrap = h('div', {});
  wrap.append(h('p', { class: 'small muted' }, 'Original beats generated live by the app, so there are no licensing issues and it works offline. The music dips whenever the coach is talking.'));
  for (const [id, g] of Object.entries(GENRES)) {
    const on = s.music && s.musicGenre === id;
    wrap.append(h('div', { class: `option ${on ? 'on' : ''}`, onclick: () => { set({ music: true, musicGenre: id }); redraw(); } },
      h('div', { class: 'row between' },
        h('div', {}, h('b', {}, g.name), h('div', { class: 'small muted' }, `${g.desc} · ${g.bpm} BPM`)),
        h('button', { class: 'btn dark small', type: 'button', 'aria-label': `Preview ${g.name}`, onclick: (e) => { e.stopPropagation(); preview(id, s.musicVolume); } }, '▶ Preview'))));
  }
  wrap.append(h('div', { class: `option ${!s.music ? 'on' : ''}`, onclick: () => { stopPreview(); set({ music: false }); redraw(); } },
    h('b', {}, 'No music'), h('div', { class: 'small muted' }, 'Play your own playlist in another app instead')));
  if (s.music) {
    wrap.append(
      h('div', { class: 'field' }, h('label', {}, `Music volume: ${Math.round(s.musicVolume * 100)}%`),
        h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: s.musicVolume, style: { width: '100%' }, oninput: (e) => { music.setVolume(+e.target.value); }, onchange: (e) => { set({ musicVolume: +e.target.value }); redraw(); } })),
      h('label', { class: 'row between', style: { color: 'var(--text)', margin: '8px 0' } }, 'Switch to Lo-fi Chill for yoga & cool-downs',
        h('input', { type: 'checkbox', checked: s.calmForYoga, onchange: (e) => set({ calmForYoga: e.target.checked }) })));
  }
  return wrap;
}
