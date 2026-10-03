import { newRun, startFloor } from '../public/js/run.js';
import { step, wisp } from '../public/js/engine.js';
import { botMove } from '../public/js/bot.js';
import { draw } from './draw.mjs';

const seed = process.argv[2] || 'show';
const depth = +(process.argv[3] || 3);
const turns = +(process.argv[4] || 8);
const run = newRun({ seed });
run.depth = depth;
startFloor(run);
const s = run.state;
console.log(draw(s));
for (let i = 0; i < turns; i++) {
  const a = botMove(s, 2);
  const r = step(s, a);
  console.log(`\nturn ${s.turn}: ${a.type}${a.x != null ? ` ${a.x},${a.y}` : ''} hp ${wisp(s).hp} ${r.outcome || ''}`);
  console.log(r.ev.filter((e) => !['move', 'aim'].includes(e.t)).map((e) => e.t + (e.id != null ? `:${e.id}` : '')).join(' '));
  console.log(draw(s));
  if (r.outcome) break;
}
