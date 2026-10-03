import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mulberry32, randInt, shuffle } from '../public/js/rng.js';
import { GROUND, BOG, ROCK, ORTH, DIRS, addUnit, aimInPlace, actions, clone, step, enemies, wisp, preview } from '../public/js/engine.js';
import { emptyState } from '../public/js/gen.js';
import { solve, solutions } from '../public/js/solver.js';
import { loadTrial } from '../public/js/trials.js';

export const CONFIGS = [
  { chapter: 1, kinds: ['fork', 'bow'], need: 'bow', n: [2, 4], turns: [1, 3], gas: 1, want: 9 },
  { chapter: 2, kinds: ['fork', 'bow', 'hound'], need: 'hound', n: [2, 4], turns: [1, 3], gas: 1, want: 9 },
  { chapter: 3, kinds: ['fork', 'bow', 'hound', 'flask'], need: 'flask', n: [2, 4], turns: [1, 3], gas: 1, want: 9 },
  { chapter: 4, kinds: ['fork', 'bow', 'hound', 'flask', 'knight'], need: 'knight', n: [2, 4], turns: [2, 3], gas: 2, want: 9 },
  { chapter: 5, kinds: ['fork', 'bow', 'hound', 'flask', 'knight', 'priest'], need: 'priest', n: [2, 5], turns: [2, 3], gas: 2, want: 9 },
  { chapter: 6, kinds: ['fork', 'bow', 'hound', 'flask', 'knight', 'priest', 'witch'], need: 'witch', n: [2, 5], turns: [2, 3], gas: 2, want: 9 },
  { chapter: 7, kinds: ['fork', 'bow', 'hound', 'flask', 'knight', 'priest', 'witch'], need: null, n: [4, 6], turns: [3, 4], gas: 2, want: 10 },
];

const CH = { fork: 'f', bow: 'b', hound: 'h', flask: 'a', knight: 'k', priest: 'p', witch: 'w', gas: 'o' };

export function toMap(s) {
  const rows = [];
  for (let y = 0; y < s.h; y++) {
    let r = '';
    for (let x = 0; x < s.w; x++) {
      const t = s.t[y * s.w + x];
      const u = s.u.find((q) => q.x === x && q.y === y);
      if (u) {
        if (u.k === 'wisp') r += t === BOG ? '&' : '@';
        else if (u.k === 'gas') r += t === BOG ? 'O' : 'o';
        else if (u.k === 'witch' && t === BOG) r += 'W';
        else r += CH[u.k];
      } else r += t === BOG ? '~' : t === ROCK ? '#' : '.';
    }
    rows.push(r);
  }
  return rows;
}

function carve(s, rng, type, size) {
  let x = randInt(rng, s.w);
  let y = randInt(rng, s.h);
  for (let n = 0, guard = 0; n < size && guard < 40; guard++) {
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

function randomPuzzle(rng, cfg) {
  const w = 5 + randInt(rng, 3);
  const h = 5 + randInt(rng, 3);
  const s = emptyState(w, h);
  const blobs = 1 + randInt(rng, 2);
  for (let b = 0; b < blobs; b++) carve(s, rng, BOG, 2 + randInt(rng, 4));
  const rocks = randInt(rng, 3);
  for (let r = 0; r < rocks; r++) carve(s, rng, ROCK, 1);
  const cells = [];
  for (let i = 0; i < s.t.length; i++) if (s.t[i] !== ROCK) cells.push([i % w, Math.floor(i / w)]);
  shuffle(cells, rng);
  const [px, py] = cells.pop();
  addUnit(s, 'wisp', px, py, { hp: 3, mhp: 3, d: 0 });
  const n = cfg.n[0] + randInt(rng, cfg.n[1] - cfg.n[0] + 1);
  const kinds = [];
  if (cfg.need) kinds.push(cfg.need);
  while (kinds.length < n) kinds.push(cfg.kinds[randInt(rng, cfg.kinds.length)]);
  const ground = cells.filter(([x, y]) => s.t[y * w + x] === GROUND);
  ground.sort((a, b) => Math.abs(a[0] - px) + Math.abs(a[1] - py) + rng() * 4 - (Math.abs(b[0] - px) + Math.abs(b[1] - py) + rng() * 4));
  for (const k of kinds) {
    const idx = ground.findIndex(([x, y]) => !s.u.some((u) => u.x === x && u.y === y));
    if (idx < 0) return null;
    const [x, y] = ground.splice(idx, 1)[0];
    addUnit(s, k, x, y, { d: 4 });
  }
  const gas = randInt(rng, cfg.gas + 1);
  const free = cells.filter(([x, y]) => !s.u.some((u) => u.x === x && u.y === y));
  for (let g = 0; g < gas && free.length; g++) {
    const [x, y] = free.splice(randInt(rng, free.length), 1)[0];
    addUnit(s, 'gas', x, y);
  }
  for (const e of enemies(s)) if (e.k !== 'fork' && e.k !== 'knight' && e.k !== 'witch' && rng() < 0.15) e.cd = 1;
  s.rules = { rout: false };
  s.party = enemies(s).length;
  aimInPlace(s);
  return s;
}

function greedySolves(s, turns) {
  const c = clone(s);
  for (let t = 0; t < turns; t++) {
    let best = null;
    for (const a of actions(c)) {
      const p = preview(c, a);
      if (p.hurt) continue;
      const v = p.dies.length;
      if (!best || v > best.v) best = { a, v };
    }
    if (!best) return false;
    step(c, best.a);
    if (!enemies(c).length) return true;
  }
  return false;
}

function killKinds(s, sol) {
  const c = clone(s);
  const kinds = new Set();
  for (const a of sol) {
    const r = step(c, a);
    for (const e of r.ev) {
      if (e.t === 'sink') kinds.add('sink');
      if (e.t === 'boom') kinds.add('gas');
      if (e.t === 'die') kinds.add('fire');
    }
  }
  return kinds;
}

function evaluate(s, cfg) {
  if (!enemies(s).some((e) => e.it)) return null;
  let m = null;
  for (let n = 1; n <= cfg.turns[1]; n++) {
    if (solve(s, n)) {
      m = n;
      break;
    }
  }
  if (!m || m < cfg.turns[0]) return null;
  const sols = solutions(s, m, 8);
  if (!sols.length || sols.length > 3) return null;
  if (m > 1 && greedySolves(s, m)) return null;
  const firsts = new Set(sols.map((q) => JSON.stringify(q[0])));
  const safe = actions(s).filter((a) => !preview(s, a).hurt).length;
  const kinds = killKinds(s, sols[0]);
  const diff = m * 3 + Math.log2(Math.max(1, safe)) + enemies(s).length * 0.6 - sols.length * 0.7 + kinds.size * 0.5 - firsts.size * 0.3;
  return { m, sols: sols.length, firsts: firsts.size, safe, kinds: [...kinds], diff, sol: sols[0].map((a) => [a.type, a.x ?? null, a.y ?? null]) };
}

if (!isMainThread) {
  const { cfg, seed, tries } = workerData;
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < tries; i++) {
    const raw = randomPuzzle(rng, cfg);
    if (!raw) continue;
    const map = toMap(raw);
    const rest = enemies(raw).filter((e) => e.rest).map((e) => [e.x, e.y]);
    const s = loadTrial({ map, rest });
    const ev = evaluate(s, cfg);
    if (!ev) continue;
    out.push({ map, rest, turns: ev.m, ...ev });
  }
  parentPort.postMessage(out);
}

async function runChapter(cfg, workers, tries) {
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    jobs.push(
      new Promise((resolve, reject) => {
        const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { cfg, seed: cfg.chapter * 100003 + w * 7919 + 17, tries } });
        wk.on('message', resolve);
        wk.on('error', reject);
      }),
    );
  }
  return (await Promise.all(jobs)).flat();
}

const A = ['Black', 'Willow', 'Crooked', 'Sunken', 'Mossy', 'Heron', 'Toad', 'Owl', 'Reed', 'Peat', 'Alder', 'Sedge', 'Misty', 'Hollow', 'Lantern', 'Bitter', 'Silver', 'Raven', 'Eel', 'Thorn', 'Bramble', 'Grey', 'Lost', 'Weeping', 'Old', 'Quiet', 'Drowned', 'Candle', 'Moth', 'Bog-oak', 'Hazel', 'Fox', 'Crane', 'Rush', 'Mallow', 'Snipe'];
const B = ['Pool', 'Ford', 'Bend', 'Bank', 'Steps', 'Crossing', 'Tussock', 'Drain', 'Causeway', 'Island', 'Sluice', 'Mere', 'Carr', 'Dyke', 'Path', 'Hummock', 'Spit', 'Wallow', 'Holt', 'Reach', 'Fen', 'Moss', 'Stile', 'Weir', 'Plank'];

function nameFor(ch, i) {
  const k = ch * 13 + i * 7;
  return `${A[(k * 5 + ch) % A.length]} ${B[(k * 3 + i * 11 + ch * 2) % B.length]}`;
}

function pick(cands, want) {
  const seen = new Set();
  const uniq = cands.filter((c) => {
    const k = c.map.join('/');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  uniq.sort((a, b) => a.diff - b.diff);
  if (uniq.length <= want) return uniq;
  const out = [];
  for (let i = 0; i < want; i++) {
    const q = 0.15 + (0.83 * i) / (want - 1);
    out.push(uniq[Math.min(uniq.length - 1, Math.floor(q * uniq.length))]);
  }
  return [...new Set(out)];
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const tries = +(process.argv[2] || 400);
  const only = process.argv[3] ? +process.argv[3] : null;
  const all = [];
  for (const cfg of CONFIGS) {
    if (only != null && cfg.chapter !== only) continue;
    const t0 = Date.now();
    const cands = await runChapter(cfg, 14, tries);
    if (process.argv[4] === 'dump') writeFileSync(`.cands-${cfg.chapter}.json`, JSON.stringify(cands));
    const chosen = pick(cands, cfg.want);
    console.log(`chapter ${cfg.chapter}: ${cands.length} candidates in ${((Date.now() - t0) / 1000).toFixed(1)}s, chose ${chosen.length}`);
    for (const c of chosen) console.log(`  turns ${c.turns} sols ${c.sols} firsts ${c.firsts} safe ${c.safe} diff ${c.diff.toFixed(1)} kinds ${c.kinds.join(',')}  ${c.map.join('/')}`);
    chosen.forEach((c, i) => all.push({ chapter: cfg.chapter, n: i + 1, name: nameFor(cfg.chapter, i), turns: c.turns, map: c.map, rest: c.rest.length ? c.rest : undefined, sol: c.sol }));
  }
  if (only == null) {
    writeFileSync(new URL('../public/js/trials-data.js', import.meta.url), `export const GENERATED = ${JSON.stringify(all)};\n`);
    console.log(`wrote ${all.length} trials`);
  }
}
