// Workout player: Sgt. Iron demonstrates and trains alongside the user.
import { go as navigate } from '../nav.js';
import { h, mount, modal, fmtDuration } from './dom.js';
import { Trainer } from '../trainer.js';
import { BY_ID } from '../data/exercises.js';
import { DAY_TYPES, muscleTally, dateKey } from '../engine/planner.js';
import { metKcal } from '../engine/calc.js';
import { pepTalk, timeOfDay } from '../engine/pep.js';
import { fromKg, weightUnit, round } from '../engine/units.js';
import { Voice, beep, unlockAudio, loadVoices } from '../voice.js';
import { music, genreFor, audioState } from '../music.js';
import { S, sessionFor, streak, proj, fmtW, nextTrainingLabel } from '../service.js';
import { update } from '../store.js';

const SALUTE = { id: 'salute', view: 'side', frames: [{ ua: 120, fa: -125 }], tempo: 3 };
const VICTORY = { id: 'victory', view: 'front', frames: [{ ua: 150, fa: 160, th: 8 }, { ua: 160, fa: 172, th: 8, lift: 4 }], tempo: 1.4 };
const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

function buildSteps(session) {
  const steps = [{ k: 'pep', which: 'start', secs: 30 }];
  const items = session.items;
  items.forEach((it, idx) => {
    if (idx === 0) steps.push({ k: 'ready', idx, secs: 10 });
    for (let set = 1; set <= it.sets; set += 1) {
      const sides = it.uni ? ['near', 'far'] : ['near'];
      sides.forEach((side, si) => {
        steps.push({ k: 'work', idx, set, side, sideIdx: si });
        if (it.uni && si === 0) steps.push({ k: 'switch', idx, secs: 5 });
      });
      if (set < it.sets) steps.push({ k: 'rest', idx, nextIdx: idx, secs: it.rest || 20, set });
    }
    if (idx < items.length - 1) {
      const next = items[idx + 1];
      const secs = Math.max(next.phase !== it.phase ? 12 : 7, it.restAfter || 0);
      steps.push({ k: 'rest', idx, nextIdx: idx + 1, secs, transition: true });
    }
  });
  steps.push({ k: 'pep', which: 'end', secs: 30 });
  return steps;
}

export function renderPlayer(root, query) {
  const st = S();
  const recovery = query.get('recovery') === '1';
  const session = sessionFor(new Date(), { recovery });
  if (!session.items.length) { navigate('/home'); return () => {}; }
  const steps = buildSteps(session);
  const units = st.profile.units;
  const voice = new Voice(st.settings);
  loadVoices().then(() => voice.configure(st.settings));
  unlockAudio();
  const musicOn = () => st.settings.music;
  if (musicOn()) { music.setVolume(st.settings.musicVolume); music.start(genreFor(st.settings, recovery ? 'recovery' : session.type, 'warmup')); }

  const done = session.items.map(() => 0); // completed sides
  const active = session.items.map(() => 0); // active seconds
  const skipped = new Set();
  const pain = [];
  const startedAt = Date.now();
  let i = 0;
  let paused = false;
  let stepElapsed = 0;
  let last = performance.now();
  let reps = 0;
  let spokenMarks = new Set();
  let pepDone = false;
  let pepText = '';
  let endPep = null;
  let finished = false;
  let wakeLock = null;
  navigator.wakeLock?.request('screen').then((w) => { wakeLock = w; }).catch(() => {});

  // ───── layout ─────
  const wrap = h('div', { class: 'player' });
  const inner = h('div', { class: 'player-inner' });
  const bar = h('i', { style: { width: '0%' } });
  const pauseBtn = h('button', { class: 'btn', onclick: () => togglePause() }, '⏸ Pause');
  const top = h('div', { class: 'player-top' },
    h('button', { class: 'btn ghost small', onclick: () => confirmEnd() }, '✕'),
    h('div', { class: 'progressbar' }, bar),
    h('span', { class: 'tiny muted', id: 'p-elapsed' }, '0:00'));
  const soundBtn = h('button', { class: 'btn small', hidden: true, onclick: () => { unlockAudio(); if (musicOn()) music.start(); } }, '🔇 Tap for music');
  top.append(soundBtn);
  const pill = h('span', { class: 'phase-pill' });
  const title = h('div', { class: 'ex-title' });
  const rx = h('div', { class: 'rx-line' });
  const stage = h('div', { class: 'player-stage' });
  const trainerBox = h('div', {});
  const counter = h('div', { class: 'big-count' });
  const overlay = h('div', { class: 'overlay' }, pill, counter);
  stage.append(trainerBox, overlay);
  const cue = h('div', { class: 'cue' });
  const extra = h('div', {});
  const doneBtn = h('button', { class: 'btn green block', style: { marginTop: '10px' }, onclick: () => advance() }, '✓ Done');
  const controls = h('div', { class: 'controls' },
    h('button', { class: 'btn dark', onclick: () => go(i - 1) }, '⏮ Back'), pauseBtn,
    h('button', { class: 'btn dark', onclick: () => skip() }, 'Skip ⏭'));
  const hurt = h('button', { class: 'btn ghost block hurt-btn', onclick: () => hurtFlow() }, '🩹 Something hurts');
  inner.append(top, h('div', { style: { marginTop: '10px' } }, title, rx), stage, cue, doneBtn, extra, controls, hurt);
  wrap.append(inner);
  mount(root, wrap);
  const trainer = new Trainer(trainerBox);

  const item = (idx) => session.items[idx];
  const exOf = (idx) => BY_ID[item(idx).exId];
  const phaseName = (it) => ({ warmup: 'WARM-UP', main: 'MISSION', cooldown: 'COOL-DOWN' }[it.phase]);
  const wtxt = (it) => (it.weightKg ? `${round(fromKg(it.weightKg, units), 1)} ${weightUnit(units)}` : null);

  function rxBadges(it, s) {
    const ex = BY_ID[it.exId];
    const b = [];
    if (s && it.sets > 1) b.push(`Set ${s.set} of ${it.sets}`);
    b.push(it.mode === 'reps' ? `${it.reps} reps${ex.uni ? ' / side' : ''}` : `${it.secs}s${ex.uni ? ' / side' : ''}`);
    if (it.weightKg) b.push(`🏋 ${wtxt(it)}`);
    if (s?.k === 'work' && ex.uni) b.push(s.side === 'near' ? 'Side 1' : 'Side 2');
    if (it.label) b.push(it.label);
    return b.map((t) => h('span', { class: 'badge' }, t));
  }

  function setStageExercise(ex, side = 'near', play = true) {
    trainer.setExercise(ex, { side });
    trainer.onCycle = null;
    if (play) trainer.play(); else trainer.still(0);
  }

  function totalKcal() {
    const kg = st.profile.kg;
    let kcal = 0; let act = 0;
    session.items.forEach((it, idx) => { kcal += metKcal(BY_ID[it.exId].met, kg, active[idx]); act += active[idx]; });
    const elapsed = (Date.now() - startedAt) / 1000;
    kcal += metKcal(1.8, kg, Math.max(0, elapsed - act));
    return Math.round(kcal);
  }

  function setsCompleted() { return session.items.map((it, idx) => Math.floor(done[idx] / (it.uni ? 2 : 1))); }

  // ───── step entry ─────
  function enter() {
    const s = steps[i];
    stepElapsed = 0; reps = 0; spokenMarks = new Set();
    bar.style.width = `${(100 * i) / steps.length}%`;
    extra.innerHTML = ''; cue.textContent = ''; doneBtn.hidden = true; counter.textContent = '';
    if (s.k === 'pep') return enterPep(s);
    const it = item(s.k === 'rest' ? s.nextIdx : s.idx);
    const ex = BY_ID[it.exId];
    if (musicOn()) music.setGenre(genreFor(st.settings, recovery ? 'recovery' : session.type, it.phase));
    if (s.k === 'work') {
      pill.className = 'phase-pill work'; pill.textContent = phaseName(it);
      title.textContent = ex.name;
      mount(rx, rxBadges(it, s));
      setStageExercise(ex, s.side, true);
      cue.textContent = ex.cues[0];
      const sideTxt = ex.uni ? (s.side === 'near' ? ' First side.' : ' Other side.') : '';
      const amount = it.mode === 'reps' ? `${it.reps} reps` : `${it.secs} seconds`;
      const setTxt = it.sets > 1 ? ` Set ${s.set} of ${it.sets}.` : '';
      voice.say(`${s.set === 1 && s.sideIdx === 0 ? ex.name + '.' : ''}${setTxt} ${amount}.${sideTxt} ${ex.cues[(s.set - 1) % ex.cues.length]}.`, { interrupt: true });
      if (it.mode === 'reps') {
        doneBtn.hidden = false; doneBtn.textContent = '✓ Done set';
        trainer.cycleSec = ex.tempo * (ex.cycleReps || 1);
        counter.innerHTML = `0<small>/${it.reps}</small>`;
        // short lead-in so the voice can finish before reps start
        trainer.still(0);
        s.leadIn = 2.2;
        trainer.onCycle = () => {
          reps = Math.min(it.reps, reps + (ex.cycleReps || 1));
          counter.innerHTML = `${reps}<small>/${it.reps}</small>`;
          if (st.settings.countReps && ex.tempo >= 1.4 && !voice.speaking) voice.say(NUMBERS[reps] || String(reps));
          else if (st.settings.beeps) beep(660, 0.05, 0.08);
          if (reps >= it.reps) { trainer.pause(); setTimeout(() => { if (steps[i] === s && !paused) { if (st.settings.beeps) beep(1180, 0.25); advance(); } }, 700); }
        };
      } else {
        counter.textContent = it.secs;
        doneBtn.hidden = false; doneBtn.textContent = '✓ Done early';
      }
      if (it.cautions?.length) extra.append(h('div', { class: 'tag warn' }, `Gentle with your ${it.cautions.join(', ')}: smaller range, stop if it hurts`));
      extra.append(h('details', {}, h('summary', { class: 'small muted' }, 'How to do it'), h('ol', { class: 'steps-list small' }, ex.steps.map((x) => h('li', {}, x)))));
    } else if (s.k === 'rest' || s.k === 'ready' || s.k === 'switch') {
      const isNext = s.k === 'ready' || s.transition;
      pill.className = 'phase-pill rest';
      pill.textContent = s.k === 'switch' ? 'SWITCH SIDES' : isNext ? 'GET READY' : 'REST';
      title.textContent = isNext ? `Next: ${ex.name}` : s.k === 'switch' ? ex.name : 'Recover';
      mount(rx, rxBadges(it, isNext ? null : { set: (s.set || 0) + 1, k: 'rest' }));
      counter.textContent = s.secs;
      if (s.k === 'switch') { setStageExercise(ex, 'far', false); voice.say('Switch sides.', { interrupt: true }); }
      else if (isNext) {
        // demo the next exercise while the user gets in position
        setStageExercise(ex, 'near', true);
        trainer.cycleSec = Math.max(2, ex.tempo * (ex.cycleReps || 1));
        cue.textContent = ex.steps[0];
        const gear = it.weightKg ? ` Grab your ${wtxt(it).replace('kg', 'kilo').replace('lb', 'pound')} dumbbells.` : ex.equip.includes('bands') ? ' Grab your band.' : '';
        voice.say(`${s.k === 'ready' ? 'First up' : 'Next up'}: ${ex.name}.${gear} ${ex.steps[0]}`, { interrupt: true });
        extra.append(h('ol', { class: 'steps-list small muted' }, ex.steps.map((x) => h('li', {}, x))));
      } else {
        setStageExercise(ex, 'near', false);
        cue.textContent = 'Breathe. Shake it out. Sip some water.';
        voice.say(`Rest ${s.secs} seconds.`, { interrupt: true });
      }
      doneBtn.hidden = false; doneBtn.textContent = isNext ? '▶ I\'m ready' : 'Skip rest';
    }
  }

  function enterPep(s) {
    pill.className = 'phase-pill work'; pill.textContent = s.which === 'start' ? 'BRIEFING' : 'DEBRIEF';
    pepDone = false;
    const p = proj();
    const ctx = {
      name: st.profile.name || 'soldier', tod: timeOfDay(), type: recovery ? 'recovery' : session.type, streak: streak(),
      lostRaw: p.lost, lost: fmtW(Math.max(0, p.lost)), pct: `${Math.round(p.pct * 100)} percent`, left: fmtW(Math.max(0, p.goal - p.lost)),
      proj: p.projectedLoss > 0 ? `${fmtW(p.projectedLoss)} down` : null, sessionNo: st.logs.length + 1,
    };
    if (s.which === 'end') {
      const sets = setsCompleted().reduce((a, b) => a + b, 0);
      const tally = muscleTally(session.items, setsCompleted());
      const top3 = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m.toLowerCase());
      Object.assign(ctx, { min: Math.max(1, Math.round((Date.now() - startedAt) / 60000)), kcal: totalKcal(), sets, muscles: top3.length ? `${top3.slice(0, -1).join(', ')}${top3.length > 1 ? ' and ' : ''}${top3[top3.length - 1]}` : 'your whole body', next: nextTrainingLabel() });
      ctx.streak = streak() + (st.logs.some((l) => l.date === dateKey()) ? 0 : 1);
    }
    const talk = pepTalk(s.which, ctx, st.usedPep, Date.now());
    update((x) => { x.usedPep.push(talk.fp); x.usedPep = x.usedPep.slice(-2000); });
    pepText = talk.text;
    if (s.which === 'end') endPep = talk.text;
    title.textContent = s.which === 'start' ? 'Mission briefing' : 'Mission debrief';
    mount(rx, [h('span', { class: 'badge' }, recovery ? '🧘 Recovery' : `${DAY_TYPES[session.type].icon} ${DAY_TYPES[session.type].label}`)]);
    setStageExercise(s.which === 'start' ? SALUTE : VICTORY, 'near', true);
    counter.textContent = s.secs;
    if (s.which === 'end') {
      const p2 = proj();
      extra.append(h('div', { class: 'streak-banner' }, h('span', { class: 'flame' }, '🔥'),
        h('div', {}, h('b', {}, `${ctx.streak}-day streak`), h('div', { class: 'small muted' }, ctx.next ? `Next: ${ctx.next}` : 'Keep the chain going.'))),
        h('div', { class: 'grid3', style: { margin: '10px 0' } },
          h('div', { class: 'stat' }, h('b', {}, `${ctx.min}m`), h('span', {}, 'Time')),
          h('div', { class: 'stat' }, h('b', {}, `≈${ctx.kcal}`), h('span', {}, 'kcal')),
          h('div', { class: 'stat' }, h('b', {}, `${ctx.sets}`), h('span', {}, 'Sets'))),
        h('p', { class: 'small muted' }, `Worked: ${ctx.muscles}. Goal: ${fmtW(Math.max(0, p2.lost))} of ${fmtW(p2.goal)} lost, projected −${fmtW(Math.max(0, p2.projectedLoss))} by the deadline.`));
    }
    extra.append(h('div', { class: 'pep-text' }, pepText));
    doneBtn.hidden = false; doneBtn.textContent = s.which === 'start' ? 'Skip briefing ▶' : 'See full report ▶';
    voice.say(pepText, { interrupt: true }).then(() => { pepDone = true; });
    if (!voice.enabled) pepDone = true;
  }

  // ───── ticking ─────
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    if (finished) return;
    document.getElementById('p-elapsed').textContent = fmtDuration((Date.now() - startedAt) / 1000);
    soundBtn.hidden = !(musicOn() && !paused && audioState() !== 'running' && stepElapsed > 1.5);
    if (paused) return;
    const s = steps[i];
    stepElapsed += dt;
    if (s.k === 'work') {
      const it = item(s.idx);
      active[s.idx] += dt;
      if (it.mode === 'reps') {
        if (s.leadIn != null && stepElapsed >= s.leadIn && !trainer.playing && reps < it.reps) { s.leadIn = null; trainer.reset(); trainer.play(); }
        return;
      }
      const left = Math.ceil(it.secs - stepElapsed);
      counter.textContent = Math.max(0, left);
      const ex = BY_ID[it.exId];
      if (!spokenMarks.has('half') && it.secs >= 20 && stepElapsed >= it.secs / 2) { spokenMarks.add('half'); voice.say(`Halfway. ${ex.cues[1] || ex.cues[0]}.`); cue.textContent = ex.cues[1] || ex.cues[0]; }
      countdownBeeps(left);
      if (stepElapsed >= it.secs) { if (st.settings.beeps) beep(1180, 0.25); advance(); }
      return;
    }
    if (s.k === 'pep') {
      counter.textContent = Math.max(0, Math.ceil(s.secs - stepElapsed));
      if ((stepElapsed >= s.secs && pepDone) || stepElapsed >= s.secs + 15) advance();
      return;
    }
    const left = Math.ceil(s.secs - stepElapsed);
    counter.textContent = Math.max(0, left);
    if (left === 3 && !spokenMarks.has('ready') && s.secs > 5) { spokenMarks.add('ready'); voice.say('Get ready.'); }
    countdownBeeps(left);
    if (stepElapsed >= s.secs) advance();
  }

  function countdownBeeps(left) {
    if (left <= 3 && left >= 1 && !spokenMarks.has(`b${left}`)) { spokenMarks.add(`b${left}`); if (st.settings.beeps) beep(880, 0.1); }
  }

  function advance() {
    const s = steps[i];
    if (s.k === 'work') done[s.idx] += 1;
    if (i >= steps.length - 1) { finish(); return; }
    i += 1; enter();
  }

  function go(n) {
    if (n < 0 || n >= steps.length) return;
    i = n; if (paused) togglePause(); enter();
  }

  /** Skip the current exercise entirely (or the current rest). */
  function skip() {
    const s = steps[i];
    if (s.k === 'work' || s.k === 'switch') {
      skipped.add(s.idx);
      let j = i + 1;
      while (j < steps.length && steps[j].idx === s.idx && !(steps[j].k === 'rest' && steps[j].transition)) j += 1;
      go(Math.min(j, steps.length - 1));
    } else advance();
  }

  function togglePause() {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    if (paused) { trainer.pause(); voice.stop(); music.stop(); } else {
      if (musicOn()) music.start();
      const s = steps[i];
      if (!(s.k === 'work' && item(s.idx).mode === 'reps' && reps >= item(s.idx).reps) && s.k !== 'switch' && !(s.k === 'rest' && !s.transition)) trainer.play();
      last = performance.now();
    }
  }

  function hurtFlow() {
    if (!paused) togglePause();
    const s = steps[i];
    const idx = s.k === 'rest' ? s.nextIdx : s.idx;
    const ex = idx != null ? exOf(idx) : null;
    voice.say('Stop. Let\'s take care of that.', { interrupt: true });
    modal((box, close) => {
      box.append(h('h2', {}, '🩹 Stop and check in'),
        h('div', { class: 'card danger' }, h('p', { class: 'small' }, h('b', {}, 'Stop the workout now'), ' if you have chest pain or pressure, trouble breathing, dizziness, or sharp or sudden joint pain. Seek medical help if it\'s severe or doesn\'t settle.')),
        ex ? h('p', {}, `Was it during `, h('b', {}, ex.name), '?') : null,
        ex ? h('button', { class: 'btn block', onclick: () => { pain.push({ exId: ex.id, removed: true }); update((x) => { if (!x.avoid.includes(ex.id)) x.avoid.push(ex.id); }); close(); skipToAfter(idx); } }, 'Skip it and remove it from my plan') : null,
        ex ? h('button', { class: 'btn dark block', style: { marginTop: '8px' }, onclick: () => { pain.push({ exId: ex.id, removed: false }); close(); skipToAfter(idx); } }, 'Skip it just for today') : null,
        h('button', { class: 'btn ghost block', style: { marginTop: '8px' }, onclick: () => { close(); togglePause(); } }, 'It was nothing, continue'),
        h('button', { class: 'btn red block', style: { marginTop: '8px' }, onclick: () => { if (ex) pain.push({ exId: ex.id, removed: false, ended: true }); close(); finish(true); } }, 'End workout now'));
    });
  }

  function skipToAfter(idx) {
    skipped.add(idx);
    let j = steps.findIndex((x, n) => n > i && ((x.k === 'rest' && x.transition && x.idx === idx) || (x.idx != null && x.idx > idx) || x.k === 'pep'));
    if (j < 0) j = steps.length - 1;
    i = j; paused = false; pauseBtn.textContent = '⏸ Pause'; last = performance.now(); enter();
  }

  function confirmEnd() {
    if (!paused) togglePause();
    modal((box, close) => {
      box.append(h('h2', {}, 'End this workout?'), h('p', { class: 'muted' }, 'Everything you completed so far still counts toward your record.'),
        h('button', { class: 'btn block', onclick: () => { close(); const e = steps.length - 1; if (done.some((x) => x > 0) && i < e) { i = e; paused = false; enter(); } else finish(true); } }, 'End & debrief'),
        h('button', { class: 'btn ghost block', style: { marginTop: '8px' }, onclick: () => { close(); togglePause(); } }, 'Keep going'),
        h('button', { class: 'linkbtn small', style: { marginTop: '12px' }, onclick: () => { close(); cleanup(); navigate('/home'); } }, 'Quit without saving'));
    });
  }

  function finish(early = false) {
    if (finished) return;
    finished = true;
    cleanup();
    const sets = setsCompleted();
    const anyWork = sets.some((x) => x > 0) || active.some((x) => x > 20);
    if (!anyWork) { navigate('/home'); return; }
    const log = {
      id: `${dateKey()}-${Date.now().toString(36)}`, date: dateKey(), type: recovery ? 'recovery' : session.type, recovery,
      startedAt: new Date(startedAt).toISOString(), durationSec: Math.round((Date.now() - startedAt) / 1000),
      activeSec: Math.round(active.reduce((a, b) => a + b, 0)), kcal: totalKcal(), plannedKcal: session.kcal,
      setsDone: sets.reduce((a, b) => a + b, 0), setsPlanned: session.items.reduce((a, it) => a + it.sets, 0),
      items: session.items.map((it, idx) => ({ exId: it.exId, phase: it.phase, sets: it.sets, setsDone: sets[idx], reps: it.reps, secs: it.secs, weightKg: it.weightKg, skipped: skipped.has(idx) })),
      muscles: muscleTally(session.items, sets), pain, early, endPep, week: session.prog.week,
    };
    update((x) => { x.logs.push(log); });
    navigate(`/summary/${log.id}`);
  }

  function cleanup() {
    clearInterval(timer);
    music.stop();
    trainer.destroy();
    voice.stop();
    wakeLock?.release?.().catch(() => {});
    document.removeEventListener('keydown', onKey);
  }

  const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); togglePause(); } if (e.code === 'ArrowRight') skip(); };
  document.addEventListener('keydown', onKey);
  const timer = setInterval(tick, 100);
  enter();
  return cleanup;
}
