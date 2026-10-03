import { newRun, playTurn, chooseBoon, HOURS } from '../public/js/run.js';
import { botMove } from '../public/js/bot.js';

const runs = +(process.argv[2] || 40);
const ply = +(process.argv[3] || 2);
const moon = +(process.argv[4] || 1);
const rules = JSON.parse(process.argv[5] || '{}');

const deaths = new Array(HOURS + 2).fill(0);
const turns = new Array(HOURS + 2).fill(0);
const hurt = new Array(HOURS + 2).fill(0);
const entered = new Array(HOURS + 2).fill(0);
let wins = 0;
let score = 0;
let stalls = 0;
const t0 = Date.now();
for (let r = 0; r < runs; r++) {
  const run = newRun({ seed: `sim-${moon}-${r}`, moon, rules });
  let depth = 0;
  let floorTurns = 0;
  while (!run.over) {
    if (run.depth !== depth) {
      depth = run.depth;
      entered[depth]++;
      floorTurns = 0;
    }
    if (run.offers) {
      chooseBoon(run, run.offers[r % run.offers.length]);
      continue;
    }
    const hp = run.hp;
    playTurn(run, botMove(run.state, ply));
    turns[depth]++;
    hurt[depth] += Math.max(0, hp - run.hp);
    if (++floorTurns > 80) {
      stalls++;
      run.over = 'stall';
    }
  }
  if (run.over === 'won') wins++;
  else if (run.over === 'lost') deaths[run.depth]++;
  score += run.score;
}
console.log(`moon ${moon}  runs ${runs}  ply ${ply}  ${((Date.now() - t0) / 1000).toFixed(1)}s  wins ${wins} (${((100 * wins) / runs).toFixed(0)}%)  stalls ${stalls}  avg score ${(score / runs).toFixed(0)}`);
for (let d = 1; d <= HOURS; d++) {
  if (!entered[d]) break;
  console.log(`hour ${d}  entered ${String(entered[d]).padStart(3)}  died ${String(deaths[d]).padStart(3)}  turns ${(turns[d] / entered[d]).toFixed(1).padStart(5)}  hurt ${(hurt[d] / entered[d]).toFixed(2)}`);
}
