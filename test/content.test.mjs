import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIALS, CHAPTERS, loadTrial } from '../public/js/trials.js';
import { solve } from '../public/js/solver.js';
import { actions, step, enemies, wisp } from '../public/js/engine.js';
import { newRun, playTurn, chooseBoon, HOURS, BOONS } from '../public/js/run.js';
import { botMove } from '../public/js/bot.js';

test('every trial can be solved in its turn limit', () => {
  for (const t of TRIALS) {
    const s = loadTrial(t);
    assert.ok(solve(s, t.turns), `${t.id} has no solution`);
    if (t.turns > 1) assert.equal(solve(s, t.turns - 1), null, `${t.id} is solvable in fewer turns`);
  }
});

test('stored trial solutions work', () => {
  for (const t of TRIALS.filter((q) => q.sol)) {
    const s = loadTrial(t);
    for (const [type, x, y] of t.sol) {
      const a = actions(s).find((q) => q.type === type && (x == null || (q.x === x && q.y === y)));
      assert.ok(a, `${t.id}: ${type} ${x},${y} is not legal`);
      const hp = wisp(s).hp;
      step(s, a);
      assert.equal(wisp(s).hp, hp, `${t.id}: wisp hit`);
    }
    assert.equal(enemies(s).length, 0, `${t.id}: hunters left`);
  }
});

test('trial ids are unique and chapters exist', () => {
  const ids = new Set(TRIALS.map((t) => t.id));
  assert.equal(ids.size, TRIALS.length);
  for (const t of TRIALS) assert.ok(CHAPTERS[t.chapter], t.id);
});

test('a bot can play whole nights without errors', () => {
  for (let i = 0; i < 4; i++) {
    const run = newRun({ seed: `test-${i}`, moon: 1 + (i % 3) });
    let guard = 0;
    while (!run.over && guard++ < 600) {
      if (run.offers) {
        chooseBoon(run, run.offers[i % run.offers.length]);
        continue;
      }
      playTurn(run, botMove(run.state, 1));
    }
    assert.ok(run.over || guard >= 600);
    assert.ok(run.depth >= 1 && run.depth <= HOURS);
    for (const k of Object.keys(run.boons)) assert.ok(BOONS[k]);
  }
});

test('a daily night is the same for everyone', () => {
  const a = newRun({ seed: 'daily:2026-10-03', daily: '2026-10-03' });
  const b = newRun({ seed: 'daily:2026-10-03', daily: '2026-10-03' });
  assert.deepEqual(a.state, b.state);
});
