// "Sgt. Iron" — the animated demo trainer.
//
// A 2D skeleton posed with absolute segment angles (degrees):
//   0 = pointing down, 90 = forward (facing direction), 180 = up, -90 = back.
// In front view, positive angles point *outward* from the body's midline and
// the far (left) side is mirrored automatically.
//
// Each exercise supplies keyframes; the renderer interpolates between them,
// keeps the figure on the floor (auto-grounding) and pins an anchor point
// (feet / knees / hands) so planted contacts don't slide.

const NS = 'http://www.w3.org/2000/svg';
export const VIEW_W = 300;
export const VIEW_H = 240;
export const FLOOR = 214;

const L = { torso: 52, neck: 4, head: 11, ua: 30, fa: 27, th: 40, sh: 40, foot: 12 };

export const LOOK = {
  skin: '#c88a5d', skinFar: '#a8714a', hair: '#231812',
  top: '#5b6b2e', topDark: '#465322', band: '#2f3b14',
  pants: '#23282c', pantsFar: '#16191c', shoe: '#ece6d6', shoeFar: '#c9c2b0',
  db: '#2b2f33', dbPlate: '#4a5056', resist: '#e0742b', block: '#8c6ad8',
  wheel: '#d33f3f', mat: '#33402a', wall: '#bfb59a', floor: '#9aa07e',
};

const STAND = { t: 180, ua: 0, fa: 0, th: 0, sh: 0, ft: 90, dx: 0, lift: 0 };
const PAIRED = ['ua', 'fa', 'th', 'sh', 'ft'];

const rad = (d) => (d * Math.PI) / 180;
const dir = (a) => [Math.sin(rad(a)), Math.cos(rad(a))];
const add = (p, a, len) => { const d = dir(a); return [p[0] + d[0] * len, p[1] + d[1] * len]; };

/** Normalise a keyframe: fill defaults and expand paired values to [near, far]. */
export function normPose(k) {
  const p = { ...STAND, ...k };
  for (const key of PAIRED) {
    const v = p[key];
    p[key] = Array.isArray(v) ? [...v] : [v, v];
  }
  if (p.h == null) p.h = p.t;
  return p;
}

/** Mirror a pose to work the other side. In front view the torso lean, head
 * tilt and sideways travel are mirrored too, so the whole move flips. */
export function swapSides(p, view = 'side') {
  const q = { ...p };
  for (const key of PAIRED) q[key] = [p[key][1], p[key][0]];
  if (view === 'front') {
    q.t = 360 - p.t;
    q.h = 360 - p.h;
    q.dx = -(p.dx || 0);
  }
  return q;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpPose(a, b, t) {
  const o = {};
  for (const key of Object.keys(a)) {
    if (Array.isArray(a[key])) o[key] = [lerp(a[key][0], b[key][0], t), lerp(a[key][1], b[key][1], t)];
    else if (typeof a[key] === 'number') o[key] = lerp(a[key], b[key] ?? a[key], t);
  }
  return o;
}
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

/** Forward kinematics → joint positions relative to the pelvis. */
export function skeleton(p, view) {
  const front = view === 'front';
  const P = [p.dx || 0, 0];
  const N = add(P, p.t, L.torso);
  const td = dir(p.t);
  const perp = [-td[1], td[0]]; // right-hand side of the torso (towards +x when upright)
  const H = add(N, p.h, L.neck + L.head);
  const so = front ? 15 : 0;
  const ho = front ? 8 : 0;
  const shoulderBase = [N[0] - td[0] * 5, N[1] - td[1] * 5];
  const side = (i) => {
    const sgn = front && i === 1 ? -1 : 1; // mirror far side in front view
    const S = [shoulderBase[0] + perp[0] * so * sgn, shoulderBase[1] + perp[1] * so * sgn];
    const Hp = [P[0] + ho * sgn, P[1]];
    const E = add(S, p.ua[i] * sgn, L.ua);
    const W = add(E, p.fa[i] * sgn, L.fa);
    const K = add(Hp, p.th[i] * sgn, L.th);
    const A = add(K, p.sh[i] * sgn, L.sh);
    const T = add(A, p.ft[i] * sgn, front ? 7 : L.foot);
    return { S, Hp, E, W, K, A, T };
  };
  return { P, N, H, near: side(0), far: side(1), view };
}

function groundPoints(sk) {
  const pts = [];
  for (const s of [sk.near, sk.far]) {
    pts.push(s.A[1] + 5, s.T[1] + 2, s.K[1] + 7, s.E[1] + 5, s.W[1] + 4);
  }
  pts.push(sk.P[1] + 11, sk.N[1] + 11, sk.H[1] + L.head);
  return pts;
}

function anchorPoint(sk, anchor) {
  switch (anchor) {
    case 'hands': return sk.near.W;
    case 'knees': return sk.near.K;
    case 'pelvis': return sk.P;
    case 'head': return sk.H;
    case 'feet': return sk.near.A;
    default: return null;
  }
}

function refPoint(sk, ref) {
  const m = {
    hand: sk.near.W, handFar: sk.far.W, foot: sk.near.A, footFar: sk.far.A,
    toe: sk.near.T, knee: sk.near.K, kneeFar: sk.far.K, pelvis: sk.P, neck: sk.N,
    head: sk.H, elbow: sk.near.E, hands: mid(sk.near.W, sk.far.W), feet: mid(sk.near.A, sk.far.A),
    knees: mid(sk.near.K, sk.far.K), shoulder: sk.near.S,
  };
  return m[ref] || sk.P;
}
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * Pre-computes everything needed to draw an exercise at any phase.
 */
export class Motion {
  constructor(ex, { side = 'near' } = {}) {
    this.ex = ex;
    this.view = ex.view || 'side';
    let frames = (ex.frames && ex.frames.length ? ex.frames : [{}]).map(normPose);
    this.swapped = side === 'far';
    if (this.swapped) frames = frames.map((f) => swapSides(f, this.view));
    this.frames = frames;
    this.anchor = ex.anchor === undefined ? (this.view === 'side' ? 'feet' : 'none') : ex.anchor;
    this.props = ex.props || {};
    // Base horizontal offset centres frame 0 (or the widest of all frames).
    const sks = frames.map((f) => skeleton(f, this.view));
    let minX = Infinity; let maxX = -Infinity;
    sks.forEach((sk, i) => {
      const ox = this.anchorShift(sk, sks[0]);
      for (const s of [sk.near, sk.far]) for (const pt of [s.W, s.T, s.A, s.K, s.E]) {
        minX = Math.min(minX, pt[0] + ox); maxX = Math.max(maxX, pt[0] + ox);
      }
      minX = Math.min(minX, sk.H[0] + ox - L.head); maxX = Math.max(maxX, sk.H[0] + ox + L.head);
      void i;
    });
    this.sk0 = sks[0];
    this.baseX = VIEW_W / 2 - (minX + maxX) / 2;
    // Static props resolved from a reference frame
    this.static = {};
    const SWAP_REF = { hand: 'handFar', handFar: 'hand', foot: 'footFar', footFar: 'foot', knee: 'kneeFar', kneeFar: 'knee' };
    for (let [name, spec] of Object.entries(this.props)) {
      if (spec && typeof spec === 'object' && spec.ref) {
        if (this.swapped) {
          // the support (wall/block) follows the working side
          spec = { ...spec, ref: SWAP_REF[spec.ref] || spec.ref };
          if (this.view === 'front') spec = { ...spec, off: -(spec.off || 0), side: spec.side === 'back' ? 'front' : spec.side === 'front' ? 'back' : spec.side };
        }
        const fi = spec.frame || 0;
        const placed = this.place(frames[fi]);
        const pt = refPoint(placed.sk, spec.ref);
        const xs = name === 'blocks' && this.view === 'front' && !spec.single
          ? [placed.sk.near.W[0], placed.sk.far.W[0]] : [pt[0] + (spec.off || 0)];
        this.static[name] = { x: pt[0] + (spec.off || 0), xs, y: pt[1], spec };
      }
    }
  }

  anchorShift(sk, sk0) {
    const a = anchorPoint(sk, this.anchor);
    if (!a) return 0;
    const a0 = anchorPoint(sk0, this.anchor);
    return a0[0] - a[0];
  }

  /** Absolute positions for a pose: returns translated skeleton. */
  place(pose) {
    const sk = skeleton(pose, this.view);
    const ox = this.baseX + this.anchorShift(sk, this.sk0);
    const extra = [];
    if (this.props.blocks && this.props.blocks.under === 'hands') {
      extra.push(sk.near.W[1] + 4 + 15, sk.far.W[1] + 4 + 15);
    }
    if (this.props.wheel) extra.push(mid(sk.near.W, sk.far.W)[1] + 12);
    const maxY = Math.max(...groundPoints(sk), ...extra);
    const oy = FLOOR - maxY - (pose.lift || 0);
    const T = (pt) => [pt[0] + ox, pt[1] + oy];
    const mapSide = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, T(v)]));
    return { sk: { P: T(sk.P), N: T(sk.N), H: T(sk.H), near: mapSide(sk.near), far: mapSide(sk.far), view: sk.view }, pose };
  }

  /** Pose at cycle phase 0..1 */
  poseAt(phase) {
    const n = this.frames.length;
    if (n === 1) {
      const b = Math.sin(phase * Math.PI * 2);
      const f = this.frames[0];
      return { ...f, t: f.t + b * 1.2, h: f.h + b * 1.5, ua: [f.ua[0] + b * 1.5, f.ua[1] + b * 1.5] };
    }
    const x = (((phase % 1) + 1) % 1) * n;
    const i = Math.floor(x);
    return lerpPose(this.frames[i], this.frames[(i + 1) % n], ease(x - i));
  }
}

// ───────────────────────── SVG drawing ─────────────────────────

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
const seg = (a, b) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;

export class Trainer {
  constructor(container, { size = 'lg' } = {}) {
    this.container = container;
    this.svg = el('svg', { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, class: `trainer trainer-${size}`, role: 'img', 'aria-label': 'Trainer demonstration' });
    container.innerHTML = '';
    container.appendChild(this.svg);
    this.buildScene();
    this.motion = null;
    this.playing = false;
    this.phase = 0;
    this.cycleSec = 3;
    this.onCycle = null;
    this._raf = null;
    this._last = 0;
  }

  buildScene() {
    const s = this.svg;
    const defs = el('defs', {}, s);
    const g = el('linearGradient', { id: 'bgGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': '#1d2416' }, g);
    el('stop', { offset: '100%', 'stop-color': '#2a3320' }, g);
    el('rect', { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: 'url(#bgGrad)', rx: 14 }, s);
    // stencil-style backdrop chevrons
    for (let i = 0; i < 3; i += 1) {
      el('path', { d: `M${20 + i * 14} 24 l10 10 l-10 10`, stroke: '#3a4630', 'stroke-width': 4, fill: 'none' }, s);
    }
    el('rect', { x: 0, y: FLOOR, width: VIEW_W, height: VIEW_H - FLOOR, fill: '#141a10' }, s);
    this.matEl = el('rect', { x: 40, y: FLOOR - 2, width: 220, height: 5, rx: 2, fill: LOOK.mat }, s);
    this.propBack = el('g', {}, s);
    this.figure = el('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, s);
    this.propFront = el('g', {}, s);
  }

  setExercise(ex, opts = {}) {
    this.ex = ex;
    this.motion = new Motion(ex, opts);
    this.cycleSec = opts.cycleSec || ex.tempo * (ex.cycleReps || 1) || 3;
    this.phase = 0;
    this.drawStatic();
    this.render();
  }

  drawStatic() {
    this.propBack.innerHTML = '';
    const st = this.motion.static;
    if (this.ex.props?.mat === false) this.matEl.setAttribute('opacity', 0);
    else this.matEl.setAttribute('opacity', 1);
    if (st.wall) {
      const x = st.wall.x;
      el('rect', { x: x - (st.wall.spec.side === 'back' ? 12 : 0), y: 18, width: 12, height: FLOOR - 18, fill: LOOK.wall, opacity: 0.85 }, this.propBack);
      el('rect', { x: x - (st.wall.spec.side === 'back' ? 12 : 0), y: 18, width: 12, height: FLOOR - 18, fill: 'url(#bgGrad)', opacity: 0.15 }, this.propBack);
    }
    if (st.blocks) {
      for (const bx of st.blocks.xs) {
        el('rect', { x: bx - 9, y: FLOOR - 15, width: 18, height: 15, rx: 2, fill: LOOK.block }, this.propBack);
      }
    }
  }

  render() {
    if (!this.motion) return;
    const pose = this.motion.poseAt(this.phase);
    const { sk } = this.motion.place(pose);
    this.draw(sk, pose);
  }

  draw(sk, pose) {
    const g = this.figure;
    g.innerHTML = '';
    this.propFront.innerHTML = '';
    const front = sk.view === 'front';
    const props = this.ex.props || {};
    const limb = (s, far) => {
      const skin = far && !front ? LOOK.skinFar : LOOK.skin;
      const pants = far && !front ? LOOK.pantsFar : LOOK.pants;
      const shoe = far && !front ? LOOK.shoeFar : LOOK.shoe;
      return {
        legs: () => {
          el('path', { d: seg(s.Hp, s.K), stroke: pants, 'stroke-width': 15 }, g);
          el('path', { d: seg(s.K, s.A), stroke: pants, 'stroke-width': 12 }, g);
          el('path', { d: seg(s.A, s.T), stroke: shoe, 'stroke-width': 8 }, g);
        },
        arms: () => {
          el('path', { d: seg(s.S, s.E), stroke: skin, 'stroke-width': 10 }, g);
          el('path', { d: seg(s.E, s.W), stroke: skin, 'stroke-width': 9 }, g);
          el('circle', { cx: s.W[0], cy: s.W[1], r: 5, fill: skin }, g);
        },
      };
    };
    const nearL = limb(sk.near, false);
    const farL = limb(sk.far, true);
    // band (behind)
    if (props.band) this.drawBand(sk, props.band);
    if (front) {
      farL.legs(); nearL.legs();
      this.drawTorso(sk, front);
      this.drawHead(sk, pose, front);
      farL.arms(); nearL.arms();
    } else {
      farL.arms(); farL.legs();
      this.drawTorso(sk, front);
      nearL.legs();
      this.drawHead(sk, pose, front);
      nearL.arms();
    }
    if (props.db) this.drawDumbbells(sk, props.db, front);
    if (props.wheel) this.drawWheel(sk);
    if (props.blockKnees) this.drawKneeBlock(sk);
  }

  drawTorso(sk, front) {
    const g = this.figure;
    const { P, N } = sk;
    const w = front ? 34 : 26;
    const hip = front ? [[sk.near.Hp, sk.far.Hp]] : [];
    for (const [a, b] of hip) el('path', { d: seg(a, b), stroke: LOOK.pants, 'stroke-width': 18 }, g);
    // torso: shorts at the bottom, tank top above
    const v = [N[0] - P[0], N[1] - P[1]];
    const hipTop = [P[0] + v[0] * 0.2, P[1] + v[1] * 0.2];
    el('path', { d: seg(P, hipTop), stroke: LOOK.pants, 'stroke-width': w - 2 }, g);
    el('path', { d: seg(hipTop, N), stroke: LOOK.top, 'stroke-width': w }, g);
    // chest stripe (rank flash)
    const c = [P[0] + v[0] * 0.72, P[1] + v[1] * 0.72];
    el('circle', { cx: c[0], cy: c[1], r: 3.2, fill: '#c9b458' }, g);
    if (front) {
      el('path', { d: seg(sk.near.S, sk.far.S), stroke: LOOK.top, 'stroke-width': 12 }, g);
    }
  }

  drawHead(sk, pose, front) {
    const g = this.figure;
    const { H, N } = sk;
    el('path', { d: seg(N, H), stroke: LOOK.skin, 'stroke-width': 9 }, g);
    const top = dir(pose.h); // neck → crown
    const face = front ? [0, 0] : [-top[1], top[0]]; // facing direction (side view)
    // hair as the full head, face as an offset skin disc → hair shows on crown/back
    el('circle', { cx: H[0], cy: H[1], r: L.head + 0.5, fill: LOOK.hair }, g);
    const fc = [H[0] + face[0] * 2.6 - top[0] * 2.2, H[1] + face[1] * 2.6 - top[1] * 2.2];
    el('circle', { cx: fc[0], cy: fc[1], r: L.head - 1.6, fill: LOOK.skin }, g);
    // headband across the forehead
    const perp = [-top[1], top[0]];
    const bc = [H[0] + top[0] * 5.5, H[1] + top[1] * 5.5];
    el('path', { d: seg([bc[0] - perp[0] * 10, bc[1] - perp[1] * 10], [bc[0] + perp[0] * 10, bc[1] + perp[1] * 10]), stroke: LOOK.band, 'stroke-width': 3.5 }, g);
    if (front) {
      for (const sx of [-4, 4]) el('circle', { cx: fc[0] + perp[0] * sx, cy: fc[1] + perp[1] * sx + 1, r: 1.4, fill: '#1a120c' }, g);
    } else {
      const eye = [H[0] + face[0] * 7 + top[0] * 0.5, H[1] + face[1] * 7 + top[1] * 0.5];
      el('circle', { cx: eye[0], cy: eye[1], r: 1.5, fill: '#1a120c' }, g);
    }
  }

  drawDumbbells(sk, which, front) {
    const g = this.propFront;
    // a single-hand dumbbell follows the working side when the trainer switches sides
    const working = this.motion?.swapped ? sk.far.W : sk.near.W;
    const hands = which === 'one' ? [mid(sk.near.W, sk.far.W)] : which === 'near' ? [working] : [sk.near.W, sk.far.W];
    for (const W of hands) {
      if (front) {
        el('path', { d: `M${W[0] - 9} ${W[1]}L${W[0] + 9} ${W[1]}`, stroke: LOOK.db, 'stroke-width': 3.5 }, g);
        el('rect', { x: W[0] - 12, y: W[1] - 6, width: 5, height: 12, rx: 1.5, fill: LOOK.dbPlate }, g);
        el('rect', { x: W[0] + 7, y: W[1] - 6, width: 5, height: 12, rx: 1.5, fill: LOOK.dbPlate }, g);
      } else {
        el('circle', { cx: W[0], cy: W[1], r: 7, fill: LOOK.db }, g);
        el('circle', { cx: W[0], cy: W[1], r: 3, fill: LOOK.dbPlate }, g);
      }
    }
  }

  drawBand(sk, spec) {
    const g = this.figure;
    const [a, b] = (spec === true ? 'hand-foot' : spec).split('-');
    const pt = (n, i) => {
      const s = i === 0 ? sk.near : sk.far;
      if (n === 'hand') return s.W;
      if (n === 'hands') return i === 0 ? sk.near.W : sk.far.W;
      if (n === 'foot') return s.A;
      if (n === 'feet') return i === 0 ? sk.near.A : sk.far.A;
      if (n === 'knee') return s.K;
      return s.W;
    };
    if (a === 'hand' && b === 'hand') {
      el('path', { d: seg(sk.near.W, sk.far.W), stroke: LOOK.resist, 'stroke-width': 4 }, this.propFront);
      return;
    }
    if (a === 'ankle' && b === 'ankle') {
      el('path', { d: seg(sk.near.A, sk.far.A), stroke: LOOK.resist, 'stroke-width': 4 }, this.propFront);
      return;
    }
    if (a === 'knee' && b === 'knee') {
      el('path', { d: seg(sk.near.K, sk.far.K), stroke: LOOK.resist, 'stroke-width': 4 }, this.propFront);
      return;
    }
    for (const i of [1, 0]) {
      el('path', { d: seg(pt(a, i), pt(b, i)), stroke: LOOK.resist, 'stroke-width': 3, opacity: i ? 0.7 : 1 }, i ? g : this.propFront);
    }
  }

  drawWheel(sk) {
    const W = mid(sk.near.W, sk.far.W);
    const c = [W[0], W[1] + 4];
    el('circle', { cx: c[0], cy: c[1] + 4, r: 9, fill: LOOK.wheel }, this.propFront);
    el('circle', { cx: c[0], cy: c[1] + 4, r: 3, fill: '#222' }, this.propFront);
  }

  drawKneeBlock(sk) {
    const K = mid(sk.near.K, sk.far.K);
    el('rect', { x: K[0] - 7, y: K[1] - 8, width: 14, height: 16, rx: 2, fill: LOOK.block, opacity: 0.95 }, this.propFront);
  }

  // ───────── playback ─────────
  play() {
    if (this.playing) return;
    this.playing = true;
    this._last = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      if (!this.svg.isConnected) { this.pause(); return; }
      const dt = Math.max(0, Math.min(0.25, (now - this._last) / 1000));
      this._last = now;
      const prev = this.phase;
      this.phase += dt / this.cycleSec;
      if (Math.floor(this.phase) > Math.floor(prev) && this.onCycle) this.onCycle(Math.floor(this.phase));
      this.render();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  pause() { this.playing = false; if (this._raf) cancelAnimationFrame(this._raf); }
  reset() { this.phase = 0; this.render(); }
  /** Show a frozen pose (e.g. the starting position during rest). */
  still(phase = 0) { this.pause(); this.phase = phase; this.render(); }
  destroy() { this.pause(); this.container.innerHTML = ''; }
}
