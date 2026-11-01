// Minimal DOM helpers (no framework).
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function mount(root, ...nodes) { root.innerHTML = ''; nodes.flat().forEach((n) => n && root.appendChild(n)); }

export function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(build, { onClose } = {}) {
  const root = document.getElementById('modal-root');
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  const close = () => { back.remove(); onClose?.(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.appendChild(box);
  root.appendChild(back);
  build(box, close);
  return close;
}

export function chips(options, selected, { multi = true, danger = false, onChange } = {}) {
  const wrap = h('div', { class: 'chips' });
  const sel = new Set(selected);
  const render = () => {
    wrap.innerHTML = '';
    for (const o of options) {
      wrap.appendChild(h('button', {
        type: 'button', class: `chip ${danger ? 'danger' : ''} ${sel.has(o.id) ? 'on' : ''}`, 'aria-pressed': sel.has(o.id),
        onclick: () => {
          if (multi) { if (sel.has(o.id)) sel.delete(o.id); else sel.add(o.id); } else { sel.clear(); sel.add(o.id); }
          render(); onChange?.([...sel]);
        },
      }, o.label));
    }
  };
  render();
  return wrap;
}

export function ring(pct, label, sub, size = 132) {
  const r = size / 2 - 9; const c = 2 * Math.PI * r;
  const wrap = h('div', { class: 'ring', style: { width: `${size}px`, height: `${size}px` } });
  wrap.innerHTML = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#11160b" stroke-width="12" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="url(#rg)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, pct)))}"/>
    <defs><linearGradient id="rg"><stop offset="0" stop-color="#5b6b2e"/><stop offset="1" stop-color="#e2cf74"/></linearGradient></defs></svg>`;
  wrap.appendChild(h('div', { class: 'lbl' }, h('b', {}, label), h('span', { class: 'tiny muted' }, sub)));
  return wrap;
}

export function fmtDate(key, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

export function fmtDuration(sec) {
  const m = Math.floor(sec / 60); const s = Math.round(sec % 60);
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}
