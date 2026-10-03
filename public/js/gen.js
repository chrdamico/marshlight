import { randInt, shuffle } from './rng.js';
import { GROUND, BOG, ROCK, ORTH, DIRS, addUnit, plan } from './engine.js';

export const ROSTER = [
  { k: 'fork', from: 1, w: 3 },
  { k: 'bow', from: 2, w: 3 },
  { k: 'hound', from: 3, w: 3 },
  { k: 'flask', from: 4, w: 2 },
  { k: 'knight', from: 5, w: 2 },
  { k: 'priest', from: 6, w: 2 },
  { k: 'witch', from: 7, w: 2 },
];

const COST = { fork: 2, bow: 3, hound: 3, flask: 4, knight: 4, priest: 4, witch: 5 };

export function emptyState(w, h) {
  return { w, h, t: new Array(w * h).fill(GROUND), u: [], nid: 0, turn: 0, stats: { kills: 0, drowned: 0, swaps: 0, hurt: 0 } };
}

function groundConnected(s) {
  const cells = [];
  for (let i = 0; i < s.t.length; i++) if (s.t[i] === GROUND) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const q = [cells[0]];
  while (q.length) {
    const i = q.pop();
    const x = i % s.w;
    const y = Math.floor(i / s.w);
    for (const d of ORTH) {
      const nx = x + DIRS[d][0];
      const ny = y + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      const j = ny * s.w + nx;
      if (s.t[j] === GROUND && !seen.has(j)) {
        seen.add(j);
        q.push(j);
      }
    }
  }
  return seen.size === cells.length;
}

function carve(s, rng, type, size) {
  let x = randInt(rng, s.w);
  let y = randInt(rng, s.h);
  for (let n = 0, guard = 0; n < size && guard < 60; guard++) {
    const i = y * s.w + x;
    if (s.t[i] === GROUND) {
      s.t[i] = type;
      n++;
    }
    const d = ORTH[randInt(rng, 4)];
    x = Math.max(0, Math.min(s.w - 1, x + DIRS[d][0]));
    y = Math.max(0, Math.min(s.h - 1, y + DIRS[d][1]));
  }
}

export function pickEnemies(rng, depth, mult = 1.6) {
  const pool = ROSTER.filter((r) => r.from <= depth);
  const fresh = ROSTER.find((r) => r.from === depth);
  let budget = Math.round((2 + depth * 1.6) * mult);
  const out = [];
  if (fresh) {
    out.push(fresh.k);
    budget -= COST[fresh.k];
  }
  const cap = Math.min(9, Math.round((2 + depth / 2) * mult));
  while (budget >= 2 && out.length < cap) {
    const opts = pool.filter((r) => COST[r.k] <= budget);
    if (!opts.length) break;
    const total = opts.reduce((a, r) => a + r.w, 0);
    let roll = rng() * total;
    const r = opts.find((o) => (roll -= o.w) < 0) || opts[0];
    out.push(r.k);
    budget -= COST[r.k];
  }
  return out;
}

export const THEMES = {
  meadow: { name: 'Wet meadow', blobs: [2, 3], blob: [3, 6], rocks: [2, 4], gas: 0 },
  flooded: { name: 'Flooded fen', blobs: [4, 5], blob: [4, 7], rocks: [1, 2], gas: 0 },
  stones: { name: 'Standing stones', blobs: [1, 2], blob: [2, 4], rocks: [7, 10], gas: 0 },
  gas: { name: 'Gas field', blobs: [2, 3], blob: [3, 5], rocks: [2, 3], gas: 4 },
  causeway: { name: 'The causeway', blobs: [1, 1], blob: [2, 3], rocks: [1, 3], gas: 1, band: true },
};

export function pickTheme(rng, depth, final) {
  if (depth === 1 || final) return 'meadow';
  const r = rng();
  return r < 0.4 ? 'meadow' : r < 0.58 ? 'flooded' : r < 0.74 ? 'stones' : r < 0.88 ? 'gas' : 'causeway';
}

const span = (rng, [a, b]) => a + randInt(rng, b - a + 1);

export function makeFloor(rng, depth, { w = 7, h = 8, hp = 3, mhp = 3, kinds = null, mult = 1.6, extraGas = 0, theme = 'meadow', boss = false } = {}) {
  const T = THEMES[theme] || THEMES.meadow;
  for (let attempt = 0; attempt < 500; attempt++) {
    const s = emptyState(w, h);
    if (T.band) {
      const y = Math.floor(h / 2) - 1 + randInt(rng, 2);
      const gaps = new Set([randInt(rng, w), randInt(rng, w)]);
      for (let x = 0; x < w; x++) if (!gaps.has(x)) s.t[y * w + x] = BOG;
    }
    const blobs = span(rng, T.blobs);
    for (let b = 0; b < blobs; b++) carve(s, rng, BOG, span(rng, T.blob));
    const rocks = span(rng, T.rocks);
    for (let r = 0; r < rocks; r++) carve(s, rng, ROCK, 1 + (rng() < 0.3 ? 1 : 0));
    if (!groundConnected(s)) continue;
    const ground = [];
    for (let i = 0; i < s.t.length; i++) if (s.t[i] === GROUND) ground.push([i % w, Math.floor(i / w)]);
    const bottom = ground.filter(([, y]) => y >= h - 2);
    if (!bottom.length) continue;
    const [px, py] = bottom[randInt(rng, bottom.length)];
    addUnit(s, 'wisp', px, py, { hp, mhp, d: 0 });
    const spots = shuffle(
      ground.filter(([x, y]) => Math.abs(x - px) + Math.abs(y - py) >= 4),
      rng,
    );
    const list = kinds || pickEnemies(rng, depth, mult);
    if (boss) list.unshift('finder');
    if (spots.length < list.length + 2) continue;
    if (boss) spots.sort((a, b) => Math.abs(a[0] - px) + Math.abs(a[1] - py) - (Math.abs(b[0] - px) + Math.abs(b[1] - py)));
    for (const k of list) {
      const [x, y] = spots.pop();
      addUnit(s, k, x, y, { d: 4 });
    }
    const gasCount = (depth >= 2 ? randInt(rng, 3) : 0) + extraGas + T.gas;
    const free = shuffle(
      s.t
        .map((t, i) => [i % w, Math.floor(i / w), t])
        .filter(([x, y, t]) => t !== ROCK && !s.u.some((u) => u.x === x && u.y === y) && Math.abs(x - px) + Math.abs(y - py) >= 2),
      rng,
    );
    for (let g = 0; g < gasCount && free.length; g++) {
      const [x, y] = free.pop();
      addUnit(s, 'gas', x, y);
    }
    s.depth = depth;
    s.theme = theme;
    s.party = list.length;
    if (boss) s.bossFight = true;
    plan(s);
    return s;
  }
  throw new Error('floor generation failed');
}
