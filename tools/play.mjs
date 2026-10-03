import { loadTrial } from '../public/js/trials.js';
import { step, actions } from '../public/js/engine.js';
import { draw } from './draw.mjs';
const map = process.argv[2].split('/');
const seq = (process.argv[3] || '').split(' ').filter(Boolean);
const s = loadTrial({ map });
console.log(draw(s));
for (const m of seq) {
  const [type, xy] = m.split(':');
  const [x, y] = xy ? xy.split(',').map(Number) : [];
  const a = actions(s).find((q) => q.type === type && (x == null || (q.x === x && q.y === y)));
  if (!a) { console.log('illegal', m, actions(s).map((q) => q.type + (q.x != null ? `:${q.x},${q.y}` : '')).join(' ')); break; }
  const r = step(s, a);
  console.log(`\n${m}: ${r.ev.filter((e) => !['move', 'aim'].includes(e.t)).map((e) => e.t).join(' ')} ${r.outcome || ''}`);
  console.log(draw(s));
}
