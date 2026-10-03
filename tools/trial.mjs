import { TRIALS, loadTrial } from '../public/js/trials.js';
import { solve, solutions } from '../public/js/solver.js';
import { draw } from './draw.mjs';

const only = process.argv[2];
for (const t of TRIALS) {
  if (only && t.id !== only) continue;
  const s = loadTrial(t);
  const t0 = Date.now();
  let min = null;
  for (let n = 1; n <= t.turns; n++) if (solve(s, n)) { min = n; break; }
  const sols = solutions(s, t.turns, 200);
  console.log(`${t.id} ${t.name}: turns ${t.turns} min ${min} solutions ${sols.length} (${Date.now() - t0}ms)`);
  if (only || !min || min < t.turns) {
    console.log(draw(s));
    for (const so of sols.slice(0, 6)) console.log('  ', so.map((a) => a.type + (a.x != null ? `(${a.x},${a.y})` : '')).join(' -> '));
  }
}
