// Local-only persistence. Nothing leaves the device.
const KEY = 'ironform.v1';

const DEFAULTS = () => ({
  version: 1,
  profile: null,
  plan: null,
  settings: { coach: 'sgt', systemVoice: '', beeps: true, countReps: true, speechRate: 1, music: true, musicGenre: 'edm', musicVolume: 0.5, calmForYoga: true },
  logs: [],
  weighIns: [],
  usedPep: [],
  avoid: [],
  injuries: [],
  intensity: 1,
  lastProjectedLoss: null,
  notices: [],
  bestStreak: 0,
  salt: {},
});

let state = null;

export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...DEFAULTS(), ...JSON.parse(raw) } : DEFAULTS();
    state.settings = { ...DEFAULTS().settings, ...state.settings };
  } catch {
    state = DEFAULTS();
  }
  return state;
}

export function save() {
  state.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('local save failed', e); }
  scheduleCloudSave();
}

// ───── Durable cloud copy (when hosted as a Claude artifact with a per-user db) ─────
// Data lives under data/users/<your id>/, which is private to you. The core
// state is one document; workout logs are split into one document per month
// so each stays far below the 256 KiB document limit.
const cloud = { db: null, uid: null, status: 'local', last: {}, timer: null, chain: Promise.resolve() };
export const cloudStatus = () => cloud.status;

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const monthOf = (log) => `logs-${log.date.slice(0, 7)}`;

function splitState(st) {
  const { logs = [], ...core } = st;
  const months = {};
  for (const l of logs) (months[monthOf(l)] ||= []).push(l);
  core.usedPep = (core.usedPep || []).slice(-1500);
  core.logMonths = Object.keys(months).sort();
  return { core, months };
}

function ref(id) { return cloud.db.collection(`data/users/${cloud.uid}`).doc(id); }

function scheduleCloudSave() {
  if (!cloud.db) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(() => {
    const { core, months } = splitState(state);
    const docs = { core: { json: JSON.stringify(core) }, ...Object.fromEntries(Object.entries(months).map(([k, v]) => [k, { json: JSON.stringify({ logs: v }) }])) };
    // one write at a time, only for documents whose content changed
    cloud.chain = cloud.chain.then(async () => {
      for (const [id, body] of Object.entries(docs)) {
        if (cloud.last[id] === body.json) continue;
        try { await ref(id).set(body); cloud.last[id] = body.json; cloud.status = 'synced'; } catch (e) { cloud.status = 'error'; console.warn('cloud save failed', e?.code || e); return; }
      }
    });
  }, 1500);
}

/** Connect to the per-user cloud store if the host provides one; pull a newer copy if there is one. */
export async function connectCloud(onRemoteNewer) {
  try {
    if (!window.claude?.use) return false;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return false;
    const uid = await user.id();
    if (!uid) return false;
    cloud.db = db; cloud.uid = uid; cloud.status = 'connecting';
    const snap = await withTimeout(ref('core').get(), 10000);
    if (snap.exists) {
      const coreJson = snap.data().json;
      const core = JSON.parse(coreJson);
      cloud.last.core = coreJson;
      const local = load();
      if (!local.profile || (core.savedAt || 0) > (local.savedAt || 0)) {
        const logs = [];
        for (const m of core.logMonths || []) {
          const ms = await withTimeout(ref(m).get(), 10000);
          if (ms.exists) { const j = ms.data().json; cloud.last[m] = j; logs.push(...JSON.parse(j).logs); }
        }
        delete core.logMonths;
        state = { ...DEFAULTS(), ...core, logs, settings: { ...DEFAULTS().settings, ...core.settings } };
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
        cloud.status = 'synced';
        onRemoteNewer?.();
        return true;
      }
    }
    cloud.status = 'synced';
    if (state?.profile) scheduleCloudSave(); // push local data up
    return true;
  } catch (e) {
    cloud.status = 'error';
    console.warn('cloud unavailable', e?.code || e?.message || e);
    return false;
  }
}

export function update(fn) { fn(state); save(); return state; }

export function exportJSON() {
  return JSON.stringify({ app: 'iron-form-fitness', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const data = parsed.data || parsed;
  if (!data || typeof data !== 'object' || !('profile' in data)) throw new Error('Not an Iron Form backup file');
  state = { ...DEFAULTS(), ...data };
  save();
  return state;
}

export function resetAll() { state = DEFAULTS(); save(); return state; }
