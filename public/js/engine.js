import { mulberry32 } from './rng.js';

export const DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];
export const ORTH = [0, 2, 4, 6];
export const DIAG = [1, 3, 5, 7];

export const GROUND = 0;
export const BOG = 1;
export const ROCK = 2;

export const KINDS = {
  wisp: { hp: 3, flies: true },
  fork: { hp: 1, move: 1, cost: 2 },
  bow: { hp: 1, move: 1, cost: 3 },
  hound: { hp: 1, move: 2, cost: 3 },
  flask: { hp: 1, move: 1, cost: 4 },
  knight: { hp: 2, move: 1, cost: 4 },
  priest: { hp: 1, move: 1, cost: 5 },
  witch: { hp: 1, move: 2, flies: true, cost: 5 },
  finder: { hp: 3, move: 2, cost: 8 },
  gas: { hp: 1, object: true },
};

export const isEnemy = (u) => u.k !== 'wisp' && u.k !== 'gas';
export const flies = (u) => !!KINDS[u.k].flies || u.k === 'gas';

export function clone(s) {
  return JSON.parse(JSON.stringify(s));
}

export const inb = (s, x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h;
export const terr = (s, x, y) => s.t[y * s.w + x];
export const wisp = (s) => s.u.find((u) => u.k === 'wisp');
export const unitAt = (s, x, y) => s.u.find((u) => u.x === x && u.y === y && u.hp > 0);
export const byId = (s, id) => s.u.find((u) => u.id === id);
export const enemies = (s) => s.u.filter((u) => isEnemy(u) && u.hp > 0);

export function dirTo(ax, ay, bx, by) {
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  return DIRS.findIndex(([x, y]) => x === dx && y === dy);
}

export function lineCells(s, x, y, d) {
  const out = [];
  const [dx, dy] = DIRS[d];
  for (let cx = x + dx, cy = y + dy; inb(s, cx, cy) && terr(s, cx, cy) !== ROCK; cx += dx, cy += dy) out.push([cx, cy]);
  return out;
}

export function addUnit(s, k, x, y, extra = {}) {
  const u = { id: s.nid++, k, x, y, hp: KINDS[k].hp, d: 4, it: null, cd: 0, ...extra };
  s.u.push(u);
  return u;
}

export const RULES = { breath: 1, refund: 'sink', help: 5, step: 4, swapRange: 99, rout: true };
const rule = (s, k) => (s.rules && s.rules[k] != null ? s.rules[k] : RULES[k]);
export const maxBreath = (s) => rule(s, 'breath');
export const breath = (s) => wisp(s).br ?? maxBreath(s);

export function actions(s) {
  const p = wisp(s);
  const out = [{ type: 'wait' }];
  const stepN = rule(s, 'step');
  for (let d = 0; d < 8; d++) {
    if (stepN === 0 || (stepN === 4 && d % 2)) continue;
    const [dx, dy] = DIRS[d];
    const x = p.x + dx;
    const y = p.y + dy;
    if (inb(s, x, y) && terr(s, x, y) !== ROCK && !unitAt(s, x, y)) out.push({ type: 'step', x, y });
  }
  const ch = s.charges || {};
  if (ch.gust > 0) out.push({ type: 'gust' });
  if (ch.mire > 0) {
    for (const [dx, dy] of DIRS) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (inb(s, x, y) && terr(s, x, y) === GROUND && !unitAt(s, x, y)) out.push({ type: 'mire', x, y });
    }
  }
  if (ch.lure > 0) {
    for (let d = 0; d < 8; d++) {
      const first = lineCells(s, p.x, p.y, d).find(([x, y]) => unitAt(s, x, y));
      if (!first) continue;
      const u = unitAt(s, first[0], first[1]);
      if (isEnemy(u) && Math.max(Math.abs(u.x - p.x), Math.abs(u.y - p.y)) >= 2) out.push({ type: 'lure', id: u.id, x: u.x, y: u.y });
    }
  }
  if (breath(s) <= 0) return out;
  const range = rule(s, 'swapRange');
  const reach = rule(s, 'reach') ? 2 : 1;
  for (let d = 0; d < 8; d++) {
    let found = 0;
    for (const [x, y] of lineCells(s, p.x, p.y, d).slice(0, range)) {
      const u = unitAt(s, x, y);
      if (!u) continue;
      out.push({ type: 'swap', id: u.id, x, y });
      if (++found >= reach) break;
    }
  }
  return out;
}

export function sameAction(a, b) {
  return !!a && !!b && a.type === b.type && a.x === b.x && a.y === b.y;
}

function kill(s, u, ev, how) {
  u.hp = 0;
  ev.push({ t: how, id: u.id, x: u.x, y: u.y });
  if (isEnemy(u)) {
    s.stats.kills++;
    if (how === 'sink') s.stats.drowned++;
  }
}

function sinkIfBog(s, u, ev) {
  if (u.hp > 0 && !flies(u) && terr(s, u.x, u.y) === BOG) kill(s, u, ev, 'sink');
}

export function applyPlayer(s, a, ev) {
  const p = wisp(s);
  if (a.type === 'step') {
    ev.push({ t: 'move', id: p.id, path: [[p.x, p.y], [a.x, a.y]] });
    p.x = a.x;
    p.y = a.y;
  } else if (a.type === 'swap') {
    const o = byId(s, a.id);
    ev.push({ t: 'swap', a: p.id, b: o.id, pa: [p.x, p.y], pb: [o.x, o.y] });
    [p.x, p.y, o.x, o.y] = [o.x, o.y, p.x, p.y];
    s.stats.swaps++;
    p.br = breath(s) - 1;
    sinkIfBog(s, o, ev);
  } else if (a.type === 'gust') {
    s.charges.gust--;
    const pushes = [];
    for (const [dx, dy] of DIRS) {
      const u = unitAt(s, p.x + dx, p.y + dy);
      if (!u) continue;
      const x = u.x + dx;
      const y = u.y + dy;
      if (!inb(s, x, y) || terr(s, x, y) === ROCK || unitAt(s, x, y)) pushes.push({ u, to: null });
      else pushes.push({ u, to: [x, y] });
    }
    ev.push({ t: 'gust', id: p.id, at: [p.x, p.y] });
    for (const { u, to } of pushes) {
      if (!to) continue;
      ev.push({ t: 'move', id: u.id, path: [[u.x, u.y], to], push: true });
      u.x = to[0];
      u.y = to[1];
    }
    for (const { u, to } of pushes) if (to) sinkIfBog(s, u, ev);
  } else if (a.type === 'lure') {
    s.charges.lure--;
    const u = byId(s, a.id);
    const d = dirTo(u.x, u.y, p.x, p.y);
    const path = [[u.x, u.y]];
    for (const [x, y] of lineCells(s, u.x, u.y, d)) {
      if (unitAt(s, x, y)) break;
      path.push([x, y]);
      if (terr(s, x, y) === BOG) break;
    }
    ev.push({ t: 'lure', id: p.id, to: u.id });
    if (path.length > 1) {
      ev.push({ t: 'move', id: u.id, path, push: true });
      [u.x, u.y] = path[path.length - 1];
      sinkIfBog(s, u, ev);
    }
  } else if (a.type === 'mire') {
    s.charges.mire--;
    s.t[a.y * s.w + a.x] = BOG;
    ev.push({ t: 'mire', at: [a.x, a.y] });
  } else {
    ev.push({ t: 'wait', id: p.id });
  }
}

export function intentCells(s, e) {
  const it = e.it;
  if (!it) return [];
  if (it.type === 'strike') {
    const [dx, dy] = DIRS[it.d];
    const x = e.x + dx;
    const y = e.y + dy;
    return inb(s, x, y) ? [[x, y]] : [];
  }
  if (it.type === 'cleave') return cleaveCells(s, e.x, e.y, it.d);
  if (it.type === 'shoot') {
    const out = [];
    for (const c of lineCells(s, e.x, e.y, it.d)) {
      out.push(c);
      if (unitAt(s, c[0], c[1])) break;
    }
    return out;
  }
  if (it.type === 'beam') return lineCells(s, e.x, e.y, it.d);
  if (it.type === 'charge') return chargePath(s, e).cells;
  if (it.type === 'throw') return blastCells(s, it.x, it.y);
  return [];
}

export function cleaveCells(s, x, y, d) {
  const fx = x + DIRS[d][0];
  const fy = y + DIRS[d][1];
  const out = [[fx, fy]];
  for (const side of [(d + 2) % 8, (d + 6) % 8]) out.push([fx + DIRS[side][0], fy + DIRS[side][1]]);
  return out.filter(([cx, cy]) => inb(s, cx, cy) && terr(s, cx, cy) !== ROCK);
}

export function blastCells(s, x, y) {
  return [[x, y], ...ORTH.map((d) => [x + DIRS[d][0], y + DIRS[d][1]])].filter(([cx, cy]) => inb(s, cx, cy) && terr(s, cx, cy) !== ROCK);
}

export function chargePath(s, e) {
  const [dx, dy] = DIRS[e.it.d];
  const cells = [];
  let x = e.x;
  let y = e.y;
  for (;;) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inb(s, nx, ny) || terr(s, nx, ny) === ROCK) return { cells, end: [x, y], hit: null, drown: false };
    const u = unitAt(s, nx, ny);
    if (u) {
      cells.push([nx, ny]);
      return { cells, end: [x, y], hit: u, drown: false };
    }
    cells.push([nx, ny]);
    x = nx;
    y = ny;
    if (terr(s, x, y) === BOG && !flies(e)) return { cells, end: [x, y], hit: null, drown: true };
  }
}

export function resolveAttacks(s, ev) {
  const hits = new Map();
  const hit = (u, from) => {
    if (!u || u.hp <= 0) return;
    hits.set(u.id, (hits.get(u.id) || 0) + 1);
    if (from != null) ev.push({ t: 'hit', id: u.id, by: from });
  };
  const moves = [];
  const attackers = enemies(s).filter((e) => e.it);
  for (const e of attackers) {
    const it = e.it;
    if (it.type === 'strike') {
      const x = e.x + DIRS[it.d][0];
      const y = e.y + DIRS[it.d][1];
      ev.push({ t: 'strike', id: e.id, at: [x, y] });
      if (inb(s, x, y)) hit(unitAt(s, x, y), e.id);
    } else if (it.type === 'cleave') {
      const cells = cleaveCells(s, e.x, e.y, it.d);
      ev.push({ t: 'strike', id: e.id, at: [e.x + DIRS[it.d][0], e.y + DIRS[it.d][1]], cells });
      for (const [x, y] of cells) hit(unitAt(s, x, y), e.id);
    } else if (it.type === 'shoot') {
      const cells = intentCells(s, e);
      const last = cells[cells.length - 1];
      const tgt = last && unitAt(s, last[0], last[1]);
      const [dx, dy] = DIRS[it.d];
      ev.push({ t: 'shoot', id: e.id, from: [e.x, e.y], to: last || [e.x + dx * 0.5, e.y + dy * 0.5], d: it.d });
      hit(tgt, e.id);
    } else if (it.type === 'beam') {
      const cells = intentCells(s, e);
      ev.push({ t: 'beam', id: e.id, cells, d: it.d });
      for (const [x, y] of cells) hit(unitAt(s, x, y), e.id);
    } else if (it.type === 'charge') {
      const cp = chargePath(s, e);
      ev.push({ t: 'charge', id: e.id, from: [e.x, e.y], to: cp.end, hitAt: cp.hit ? [cp.hit.x, cp.hit.y] : null, drown: cp.drown });
      hit(cp.hit, e.id);
      moves.push({ e, cp });
    } else if (it.type === 'throw') {
      const cells = blastCells(s, it.x, it.y);
      ev.push({ t: 'throw', id: e.id, from: [e.x, e.y], at: [it.x, it.y], cells });
      for (const [x, y] of cells) hit(unitAt(s, x, y), e.id);
    }
  }
  const blown = new Set();
  for (let again = true; again; ) {
    again = false;
    for (const g of s.u) {
      if (g.k !== 'gas' || g.hp <= 0 || blown.has(g.id) || !hits.has(g.id)) continue;
      blown.add(g.id);
      again = true;
      const cells = [];
      for (const [dx, dy] of DIRS) {
        const x = g.x + dx;
        const y = g.y + dy;
        if (inb(s, x, y)) cells.push([x, y]);
      }
      ev.push({ t: 'boom', id: g.id, at: [g.x, g.y], cells });
      for (const [x, y] of cells) hit(unitAt(s, x, y), g.id);
    }
  }
  for (const [id, n0] of hits) {
    const u = byId(s, id);
    let n = n0;
    if (u.k === 'wisp' && s.veil > 0) {
      s.veil = 0;
      n--;
      ev.push({ t: 'veil', id });
      if (!n) continue;
    }
    u.hp -= n;
    if (u.k === 'wisp') {
      s.stats.hurt += Math.min(n, u.hp + n);
      ev.push({ t: 'hurt', id, n });
      if (rule(s, 'secondWind')) u.br = maxBreath(s);
    }
    if (u.hp <= 0) {
      u.hp = 0;
      if (u.k === 'gas') ev.push({ t: 'pop', id, x: u.x, y: u.y });
      else if (u.k !== 'wisp') kill(s, u, ev, 'die');
    }
  }
  for (const { e, cp } of moves) {
    if (e.hp <= 0) continue;
    let [ex, ey] = cp.end;
    const path = [[e.x, e.y], ...cp.cells.filter((c) => !(cp.hit && c[0] === cp.hit.x && c[1] === cp.hit.y))];
    while (path.length > 1 && unitAt(s, ex, ey) && unitAt(s, ex, ey) !== e) {
      path.pop();
      [ex, ey] = path[path.length - 1];
    }
    if (ex !== e.x || ey !== e.y) ev.push({ t: 'move', id: e.id, path, fast: true });
    e.x = ex;
    e.y = ey;
    if (cp.drown && ex === cp.end[0] && ey === cp.end[1]) kill(s, e, ev, 'sink');
  }
  const noReload = rule(s, 'noReload') || [];
  for (const e of attackers) {
    if (e.hp > 0) e.cd = e.it.type === 'strike' || e.it.type === 'cleave' || noReload.includes(e.k) ? 0 : 1;
    e.it = null;
  }
  s.u = s.u.filter((u) => u.hp > 0 || u.k === 'wisp');
}

function passable(s, e, x, y) {
  if (!inb(s, x, y)) return false;
  const t = terr(s, x, y);
  if (t === ROCK || (t === BOG && !flies(e))) return false;
  const o = unitAt(s, x, y);
  return !o || o === e;
}

function bfs(s, e) {
  const dist = new Map();
  const prev = new Map();
  const key = (x, y) => y * s.w + x;
  const start = key(e.x, e.y);
  dist.set(start, 0);
  const q = [[e.x, e.y]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    const dcur = dist.get(key(x, y));
    for (const d of ORTH) {
      const nx = x + DIRS[d][0];
      const ny = y + DIRS[d][1];
      const k = key(nx, ny);
      if (dist.has(k) || !passable(s, e, nx, ny)) continue;
      dist.set(k, dcur + 1);
      prev.set(k, key(x, y));
      q.push([nx, ny]);
    }
  }
  const pathTo = (x, y) => {
    const path = [];
    for (let k = key(x, y); k !== undefined; k = prev.get(k)) path.unshift([k % s.w, Math.floor(k / s.w)]);
    return path;
  };
  return { dist, pathTo, key };
}

function clearBetween(s, ax, ay, bx, by, opts) {
  const d = dirTo(ax, ay, bx, by);
  const [dx, dy] = DIRS[d];
  for (let x = ax + dx, y = ay + dy; x !== bx || y !== by; x += dx, y += dy) {
    const t = terr(s, x, y);
    if (t === ROCK) return false;
    if (opts.noBog && t === BOG) return false;
    if (opts.noUnits && unitAt(s, x, y)) return false;
  }
  return true;
}

function attackFrom(s, e, x, y, p) {
  const dx = p.x - x;
  const dy = p.y - y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const aligned = (dx === 0) !== (dy === 0);
  switch (e.k) {
    case 'fork':
      return ax + ay === 1 ? { type: 'strike', d: dirTo(x, y, p.x, p.y) } : null;
    case 'knight':
    case 'finder':
      return ax + ay === 1 ? { type: 'cleave', d: dirTo(x, y, p.x, p.y) } : null;
    case 'witch':
      return ax === 1 && ay === 1 ? { type: 'strike', d: dirTo(x, y, p.x, p.y) } : null;
    case 'bow':
      return aligned && ax + ay >= 2 && clearBetween(s, x, y, p.x, p.y, { noUnits: true }) ? { type: 'shoot', d: dirTo(x, y, p.x, p.y) } : null;
    case 'priest':
      return aligned && ax + ay >= 2 && clearBetween(s, x, y, p.x, p.y, { noUnits: true }) ? { type: 'beam', d: dirTo(x, y, p.x, p.y) } : null;
    case 'hound':
      return aligned && clearBetween(s, x, y, p.x, p.y, { noUnits: true, noBog: true }) ? { type: 'charge', d: dirTo(x, y, p.x, p.y) } : null;
    case 'flask': {
      const cheb = Math.max(ax, ay);
      return cheb >= 2 && cheb <= 4 && !unitAt(s, p.x, p.y) ? { type: 'throw', x: p.x, y: p.y } : null;
    }
  }
  return null;
}

const WISP_W = 12;
const ESCAPE_W = 7;

function huntTargets(s, p) {
  const t = new Map([[p.y * s.w + p.x, WISP_W]]);
  for (const d of ORTH) {
    const x = p.x + DIRS[d][0];
    const y = p.y + DIRS[d][1];
    if (inb(s, x, y) && terr(s, x, y) !== ROCK && !unitAt(s, x, y)) t.set(y * s.w + x, ESCAPE_W);
  }
  return t;
}

function landingCells(s, p) {
  const out = [];
  for (const [dx, dy] of DIRS) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (inb(s, x, y) && terr(s, x, y) !== ROCK && !unitAt(s, x, y)) out.push({ x, y });
  }
  return out;
}

function attackOptions(s, e, x, y, p, targets) {
  if (e.k === 'flask') return landingCells(s, p).map((c) => attackFrom(s, e, x, y, c)).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const k of targets.keys()) {
    const it = attackFrom(s, e, x, y, { x: k % s.w, y: Math.floor(k / s.w) });
    if (!it || seen.has(it.type + it.d)) continue;
    seen.add(it.type + it.d);
    out.push(it);
  }
  return out;
}

function cellsAt(s, e, x, y, it) {
  const [ox, oy, oit] = [e.x, e.y, e.it];
  [e.x, e.y, e.it] = [x, y, it];
  const cells = intentCells(s, e);
  [e.x, e.y, e.it] = [ox, oy, oit];
  return cells;
}

function crossfire(s, e, x, y, it, cells) {
  const ally = (u) => u && u !== e && isEnemy(u);
  if (it.type !== 'shoot' && it.type !== 'beam' && it.type !== 'charge') return cells.filter(([cx, cy]) => ally(unitAt(s, cx, cy))).length;
  let n = 0;
  for (const [cx, cy] of lineCells(s, x, y, it.d)) {
    const u = unitAt(s, cx, cy);
    if (!u || u === e || u.k === 'wisp') continue;
    if (ally(u)) n++;
    if (it.type !== 'beam') break;
  }
  return n;
}

function threatened(s, x, y) {
  for (const e of enemies(s)) {
    if (!e.it) continue;
    if (intentCells(s, e).some(([cx, cy]) => cx === x && cy === y)) return true;
  }
  return false;
}

function idealRange(e) {
  return e.k === 'bow' || e.k === 'priest' ? 3 : e.k === 'flask' ? 3 : 1;
}

function chooseAttack(s, e, reach, p, targets, covered) {
  let best = null;
  for (const [x, y, dd] of reach) {
    const danger = threatened(s, x, y) ? 50 : 0;
    const range = Math.abs(Math.abs(p.x - x) + Math.abs(p.y - y) - idealRange(e));
    for (const it of attackOptions(s, e, x, y, p, targets)) {
      const cells = cellsAt(s, e, x, y, it);
      let value = 0;
      for (const [cx, cy] of cells) {
        const k = cy * s.w + cx;
        const w = targets.get(k);
        if (w) value += covered.has(k) ? (w === WISP_W ? 2 : 1) : w;
      }
      if (!value) continue;
      const score = -value * 10 + dd * 4 + danger + crossfire(s, e, x, y, it, cells) * 80 + range;
      if (!best || score < best.score) best = { x, y, it, score, cells };
    }
  }
  return best;
}

export function plan(s, ev = []) {
  const p = wisp(s);
  const targets = huntTargets(s, p);
  const covered = new Set();
  const order = enemies(s).sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)) || a.id - b.id);
  for (const e of order) {
    const { dist, pathTo } = bfs(s, e);
    const move = KINDS[e.k].move;
    const reach = [];
    for (const [k, dd] of dist) if (dd <= move) reach.push([k % s.w, Math.floor(k / s.w), dd]);
    const resting = e.cd > 0;
    e.rest = resting;
    let best = resting ? null : chooseAttack(s, e, reach, p, targets, covered);
    if (!best) {
      let goal = null;
      for (const [k, dd] of dist) {
        const x = k % s.w;
        const y = Math.floor(k / s.w);
        if (!attackFrom(s, e, x, y, p) && !(e.k === 'flask' && Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 4)) continue;
        const score = dd * 10 + Math.abs(Math.abs(p.x - x) + Math.abs(p.y - y) - idealRange(e));
        if (!goal || score < goal.score) goal = { x, y, score, dd };
      }
      let tx;
      let ty;
      if (goal) {
        const path = pathTo(goal.x, goal.y);
        [tx, ty] = path[Math.min(move, path.length - 1)];
      } else {
        let bestR = null;
        for (const [x, y, dd] of reach) {
          const score = (Math.abs(p.x - x) + Math.abs(p.y - y)) * 10 + dd;
          if (!bestR || score < bestR.score) bestR = { x, y, score };
        }
        [tx, ty] = [bestR.x, bestR.y];
      }
      best = { x: tx, y: ty, it: null };
      if (resting) e.cd--;
    }
    if (best.x !== e.x || best.y !== e.y) {
      ev.push({ t: 'move', id: e.id, path: pathTo(best.x, best.y) });
      e.d = dirTo(e.x, e.y, best.x, best.y);
      e.x = best.x;
      e.y = best.y;
    }
    e.it = best.it;
    if (e.it && e.it.d != null) e.d = e.it.d;
    else if (e.it) e.d = dirTo(e.x, e.y, e.it.x, e.it.y);
    if (e.it) {
      ev.push({ t: 'aim', id: e.id });
      for (const [cx, cy] of intentCells(s, e)) covered.add(cy * s.w + cx);
    }
  }
  return ev;
}

export function outcome(s) {
  if (wisp(s).hp <= 0) return 'lost';
  if (enemies(s).length === 0) return 'won';
  return null;
}

function rout(s, ev) {
  const left = enemies(s);
  if (!rule(s, 'rout') || !left.length) return;
  let fleeing;
  if (s.bossFight) {
    if (left.some((e) => e.k === 'finder')) return;
    fleeing = left;
  } else {
    if (left.length !== 1 || !(s.party > 1)) return;
    fleeing = left;
  }
  for (const e of fleeing) {
    e.hp = 0;
    ev.push({ t: 'flee', id: e.id, x: e.x, y: e.y });
    s.stats.routed = (s.stats.routed || 0) + 1;
  }
  s.u = s.u.filter((u) => !fleeing.includes(u));
}

function catchBreath(s, a, ev) {
  const refund = rule(s, 'refund');
  const fell = ev.some((e) => e.t === 'sink' || (e.t === 'die' && refund !== 'sink'));
  if (a.type !== 'swap' || (refund && fell)) wisp(s).br = Math.min(maxBreath(s), breath(s) + 1);
}

function edgeCell(s, rng) {
  const p = wisp(s);
  const free = (x, y) => terr(s, x, y) === GROUND && !unitAt(s, x, y);
  const cells = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if ((x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1) && free(x, y)) cells.push([x, y]);
  const far = cells.filter(([x, y]) => Math.abs(x - p.x) + Math.abs(y - p.y) >= 4);
  const pool = far.length ? far : cells;
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

export const helpIn = (s) => (rule(s, 'help') && s.helpPool && !s.coming ? Math.max(1, rule(s, 'help') - (s.calm || 0)) : 0);

function arrive(s, ev) {
  const c = s.coming;
  if (!c) return;
  s.coming = null;
  let [x, y] = [c.x, c.y];
  if (terr(s, x, y) !== GROUND || unitAt(s, x, y)) {
    const alt = edgeCell(s, mulberry32(s.helpSeed + s.turn * 31));
    if (!alt) return;
    [x, y] = alt;
  }
  const u = addUnit(s, c.k, x, y, { d: 4 });
  s.party++;
  ev.push({ t: 'arrive', id: u.id, k: u.k, x, y });
}

function callHelp(s, ev, fell) {
  s.calm = fell ? 0 : (s.calm || 0) + 1;
  const n = rule(s, 'help');
  if (!n || !s.helpPool || s.coming || s.calm < n) return;
  const rng = mulberry32(s.helpSeed + s.turn * 7919);
  const cell = edgeCell(s, rng);
  if (!cell) return;
  s.coming = { k: s.helpPool[Math.floor(rng() * s.helpPool.length)], x: cell[0], y: cell[1] };
  s.calm = 0;
  ev.push({ t: 'call', x: cell[0], y: cell[1] });
}

export function step(s, a) {
  const ev = [];
  applyPlayer(s, a, ev);
  resolveAttacks(s, ev);
  s.turn++;
  const p = wisp(s);
  catchBreath(s, a, ev);
  const fell = ev.some((e) => e.t === 'die' || e.t === 'sink');
  if (p.hp > 0) rout(s, ev);
  const o = outcome(s);
  if (!o) {
    arrive(s, ev);
    plan(s, ev);
    callHelp(s, ev, fell);
  }
  return { ev, outcome: o };
}

export function preview(s, a) {
  const moved = clone(s);
  const ev = [];
  applyPlayer(moved, a, ev);
  const after = clone(moved);
  resolveAttacks(after, ev);
  catchBreath(after, a, ev);
  wisp(moved).br = breath(after);
  const dies = [];
  const hurtE = [];
  for (const e of s.u) {
    if (!isEnemy(e)) continue;
    const z = byId(after, e.id);
    if (!z || z.hp <= 0) dies.push(e.id);
    else if (z.hp < e.hp) hurtE.push(e.id);
  }
  return { state: moved, dies, hurtE, hurt: wisp(s).hp - wisp(after).hp, breath: breath(after) };
}

export function aimInPlace(s) {
  const p = wisp(s);
  const targets = huntTargets(s, p);
  const covered = new Set();
  const order = enemies(s).sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)) || a.id - b.id);
  for (const e of order) {
    e.rest = e.cd > 0;
    e.cd = 0;
    e.it = e.rest ? null : chooseAttack(s, e, [[e.x, e.y, 0]], p, targets, covered)?.it || null;
    if (e.it && e.it.d != null) e.d = e.it.d;
    else if (e.it) e.d = dirTo(e.x, e.y, e.it.x, e.it.y);
    if (e.it) for (const [cx, cy] of intentCells(s, e)) covered.add(cy * s.w + cx);
  }
}
