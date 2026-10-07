import { intentCells, enemies, terr, unitAt, BOG, ROCK } from '../public/js/engine.js';
const CH = { wisp: '@', fork: 'f', bow: 'b', hound: 'h', flask: 'a', knight: 'k', priest: 'p', witch: 'w', finder: 'x', gas: 'o' };
export function draw(s) {
  const threat = new Set();
  for (const e of enemies(s)) for (const [x, y] of intentCells(s, e)) threat.add(y * s.w + x);
  const rows = [];
  for (let y = 0; y < s.h; y++) {
    let r = '';
    for (let x = 0; x < s.w; x++) {
      const u = unitAt(s, x, y);
      const t = terr(s, x, y);
      let c = u ? CH[u.k] : t === BOG ? '~' : t === ROCK ? '#' : '.';
      if (u && u.it) c = c.toUpperCase();
      if (u && t === BOG) c += '~';
      else c += ' ';
      r += (threat.has(y * s.w + x) ? '[' : ' ') + c + (threat.has(y * s.w + x) ? ']' : ' ');
    }
    rows.push(r);
  }
  return rows.join('\n');
}
