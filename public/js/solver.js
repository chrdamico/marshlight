import { actions, clone, step, enemies, wisp } from './engine.js';

function key(s) {
  let k = s.t.join('');
  for (const u of s.u) k += `|${u.id},${u.x},${u.y},${u.hp},${u.cd},${u.it ? u.it.type + (u.it.d ?? '') + (u.it.x ?? '') + (u.it.y ?? '') : '-'}`;
  return k;
}

function search(s, d, seen, collect, limit) {
  let found = null;
  for (const a of actions(s)) {
    const c = clone(s);
    const hp = wisp(c).hp;
    step(c, a);
    if (wisp(c).hp < hp) continue;
    if (enemies(c).length === 0) {
      if (!collect) return [a];
      collect.push([a]);
      if (collect.length >= limit) return null;
      continue;
    }
    if (d <= 1) continue;
    const k = `${d}:${key(c)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (collect) {
      const sub = [];
      search(c, d - 1, seen, sub, limit - collect.length);
      for (const r of sub) collect.push([a, ...r]);
      if (collect.length >= limit) return null;
    } else {
      found = search(c, d - 1, seen, null, 0);
      if (found) return [a, ...found];
    }
  }
  return null;
}

export function solve(s, n) {
  for (let d = 1; d <= n; d++) {
    const r = search(s, d, new Set(), null, 0);
    if (r) return r;
  }
  return null;
}

export function solutions(s, n, limit = 50) {
  const out = [];
  search(s, n, new Set(), out, limit);
  return out;
}
