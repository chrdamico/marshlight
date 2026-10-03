import { actions, clone, step, preview, wisp, enemies } from './engine.js';

function quick(s) {
  let bestSafe = -Infinity;
  for (const a of actions(s)) {
    const p = preview(s, a);
    const v = -p.hurt * 100 + p.dies.length * 10;
    if (v > bestSafe) bestSafe = v;
  }
  return bestSafe;
}

export function botMove(s, ply = 2) {
  let best = null;
  const hp0 = wisp(s).hp;
  const n0 = enemies(s).length;
  for (const a of actions(s)) {
    const c = clone(s);
    const r = step(c, a);
    const hurt = hp0 - wisp(c).hp;
    const kills = n0 - enemies(c).length;
    let v = -hurt * 100 + kills * 12;
    if (r.outcome === 'lost') v -= 10000;
    else if (r.outcome === 'won') v += 1000;
    else if (ply >= 2) v += quick(c) * 0.6;
    const p = wisp(c);
    let near = 0;
    for (const e of enemies(c)) near += Math.max(0, 4 - Math.abs(e.x - p.x) - Math.abs(e.y - p.y));
    v -= near * 0.5;
    v += Math.random() * 0.01;
    if (!best || v > best.v) best = { a, v };
  }
  return best.a;
}
