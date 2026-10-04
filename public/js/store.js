const KEY = 'marshlight:v1';
const BAK = 'marshlight:v1:bak';

const DEFAULT_SETTINGS = { sound: true, ambient: true, haptics: true, confirm: true, hints: true, _u: 0 };

function fresh() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    slots: {},
    best: { hour: 0, score: 0, dawns: 0, runs: 0, kills: 0, drowned: 0, moon: 1 },
    daily: {},
    trials: {},
    seen: {},
    resetAt: 0,
  };
}

export function normalize(d) {
  const base = fresh();
  if (!d || typeof d !== 'object') return base;
  return {
    ...base,
    ...d,
    settings: { ...base.settings, ...(d.settings || {}) },
    best: { ...base.best, ...(d.best || {}) },
    slots: { ...(d.slots || {}) },
    daily: { ...(d.daily || {}) },
    trials: { ...(d.trials || {}) },
    seen: { ...(d.seen || {}) },
  };
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function mergeInto(t, s) {
  if (!s) return t;
  if ((s.resetAt || 0) > (t.resetAt || 0)) {
    const keep = t.settings;
    Object.assign(t, fresh(), { settings: keep, resetAt: s.resetAt });
  }
  const live = (x) => (x?.at || 0) >= (t.resetAt || 0);
  for (const [k, v] of Object.entries(s.slots)) {
    if (!v || (v.at || 0) < t.resetAt) continue;
    if (!t.slots[k] || (v.at || 0) > (t.slots[k].at || 0)) t.slots[k] = v;
  }
  if ((s.best.at || 0) >= t.resetAt) {
    for (const k of Object.keys(t.best)) if (typeof s.best[k] === 'number' && k !== 'at') t.best[k] = Math.max(t.best[k] || 0, s.best[k]);
    t.best.at = Math.max(t.best.at || 0, s.best.at || 0);
  }
  for (const [k, v] of Object.entries(s.daily)) {
    if (!live(v)) continue;
    const cur = t.daily[k];
    if (!cur) t.daily[k] = { ...v };
    else {
      cur.first = cur.first && v.first ? ((cur.first.at || 0) <= (v.first.at || 0) ? cur.first : v.first) : cur.first || v.first;
      cur.bestScore = Math.max(cur.bestScore || 0, v.bestScore || 0);
      cur.bestHour = Math.max(cur.bestHour || 0, v.bestHour || 0);
      cur.won = cur.won || v.won;
      cur.at = Math.max(cur.at || 0, v.at || 0);
    }
  }
  for (const [k, v] of Object.entries(s.trials)) {
    if (!live(v)) continue;
    const cur = t.trials[k];
    if (!cur) t.trials[k] = { ...v };
    else {
      cur.stars = Math.max(cur.stars || 0, v.stars || 0);
      cur.at = Math.max(cur.at || 0, v.at || 0);
    }
  }
  for (const [k, v] of Object.entries(s.seen)) if (!t.seen[k] && (v || 0) >= t.resetAt) t.seen[k] = v;
  if ((s.settings._u || 0) > (t.settings._u || 0)) Object.assign(t.settings, s.settings);
  return t;
}

export const db = read(KEY) || fresh();
mergeInto(db, read(BAK));

const listeners = new Set();
export function onExternalChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function signature(d) {
  return [Object.values(d.slots).map((v) => v && v.at).join(','), Object.keys(d.trials).length, Object.keys(d.daily).length, d.best.at || 0, d.settings._u, d.resetAt].join(':');
}

function absorb() {
  const before = signature(db);
  mergeInto(db, read(KEY));
  mergeInto(db, read(BAK));
  if (signature(db) !== before) for (const fn of listeners) fn();
}

window.addEventListener('storage', (e) => {
  if (e.key === KEY || e.key === BAK || e.key === null) absorb();
});

let timer = 0;
function write() {
  try {
    mergeInto(db, read(KEY));
    mergeInto(db, read(BAK));
    const json = JSON.stringify(db);
    localStorage.setItem(KEY, json);
    localStorage.setItem(BAK, json);
  } catch {}
}

export function persist(now = false) {
  clearTimeout(timer);
  if (now) write();
  else timer = setTimeout(write, 200);
}

window.addEventListener('pagehide', () => persist(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist(true);
  else absorb();
});

export function saveRun(slot, run) {
  db.slots[slot] = { run, at: Date.now() };
  persist();
}

export function loadRun(slot) {
  const v = db.slots[slot];
  return v && v.run && !v.run.over ? v.run : null;
}

export function touchBest() {
  db.best.at = Date.now();
  persist();
}

export function touchSettings() {
  db.settings._u = Date.now();
  persist();
}

export function markSeen(key) {
  if (db.seen[key]) return false;
  db.seen[key] = Date.now();
  persist();
  return true;
}

export function resetAll() {
  const keep = { ...db.settings };
  const f = fresh();
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, f, { settings: keep, resetAt: Date.now() });
  persist(true);
}

const CODE_PREFIX = 'MARSH1:';

export function exportCode() {
  const json = JSON.stringify({ ...db, resetAt: 0 });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return CODE_PREFIX + btoa(bin);
}

export function importCode(code) {
  const raw = String(code).replace(/\s+/g, '');
  const at = raw.indexOf(CODE_PREFIX);
  if (at < 0) throw new Error('Not a Marshlight backup code');
  const bin = atob(raw.slice(at + CODE_PREFIX.length));
  const data = normalize(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))));
  const now = Date.now();
  const lift = (v) => {
    if (v && typeof v === 'object' && (v.at || 0) < db.resetAt) v.at = now;
  };
  Object.values(data.slots).forEach(lift);
  Object.values(data.daily).forEach(lift);
  Object.values(data.trials).forEach(lift);
  lift(data.best);
  for (const k of Object.keys(data.seen)) if ((data.seen[k] || 0) < db.resetAt) data.seen[k] = now;
  data.resetAt = 0;
  data.settings._u = 0;
  const before = Object.keys(db.trials).length;
  mergeInto(db, data);
  persist(true);
  return Object.keys(db.trials).length - before;
}
