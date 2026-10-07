import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTrial } from '../public/js/trials.js';
import { actions, step, preview, wisp, enemies, clone, unitAt, terr, breath, addUnit, BOG } from '../public/js/engine.js';
import { makeFloor } from '../public/js/gen.js';
import { mulberry32 } from '../public/js/rng.js';

const board = (map, extra = {}) => loadTrial({ map, ...extra });
const act = (s, type, x, y) => {
  const a = actions(s).find((q) => q.type === type && (x == null || (q.x === x && q.y === y)));
  assert.ok(a, `no legal ${type} ${x},${y}`);
  return a;
};

test('a hunter swapped onto bog sinks', () => {
  const s = board(['.....', '..f..', '.....', '.~&~.', '.~~~.']);
  const r = step(s, act(s, 'swap', 2, 1));
  assert.equal(enemies(s).length, 0);
  assert.ok(r.ev.some((e) => e.t === 'sink'));
});

test('two flanking peasants strike each other after a swap', () => {
  const s = board(['.....', '.....', '.f@f.', '.....', '.....']);
  step(s, act(s, 'swap', 1, 2));
  assert.equal(enemies(s).length, 0);
  assert.equal(wisp(s).hp, 3);
});

test('a bolt hits the first thing in line', () => {
  const s = board(['b..@..b']);
  step(s, act(s, 'swap', 0, 0));
  assert.equal(enemies(s).length, 0);
});

test('gas bursts and hurts its 8 neighbours', () => {
  const s = board(['......', '..f...', '.f@f..', '......', '....o.', '......']);
  const r = step(s, act(s, 'swap', 4, 4));
  assert.ok(r.ev.some((e) => e.t === 'boom'));
  assert.equal(enemies(s).length, 0);
});

test('a hound that charges into bog sinks', () => {
  const s = board(['.......', 'h..@~..', '.......']);
  assert.equal(enemies(s)[0].it.type, 'charge');
  step(s, act(s, 'step', 3, 0));
  assert.equal(enemies(s).length, 0);
});

test('a knight survives one hit', () => {
  const s = board(['.....', '.k@f.', '.....']);
  step(s, act(s, 'swap', 3, 1));
  const k = enemies(s).find((e) => e.k === 'knight');
  assert.ok(k);
  assert.equal(k.hp, 1);
});

test('a witch does not sink', () => {
  const s = board(['.....', '.....', '.~&~.', '..w..', '.....']);
  const w = enemies(s)[0];
  step(s, act(s, 'swap', w.x, w.y));
  assert.equal(enemies(s).length, 1);
  assert.equal(terr(s, 2, 2), BOG);
});

test('a swap uses the breath, a turn without a swap gives it back', () => {
  const s = board(['o....', '.....', '..@..', '....#', '...#f']);
  assert.equal(breath(s), 1);
  step(s, act(s, 'swap', 0, 0));
  assert.equal(breath(s), 0);
  assert.equal(actions(s).filter((a) => a.type === 'swap').length, 0);
  step(s, { type: 'wait' });
  assert.equal(breath(s), 1);
  assert.ok(actions(s).some((a) => a.type === 'swap'));
});

test('a swap that sinks a hunter keeps the breath, a crossfire kill does not', () => {
  const bog = board(['.....', '..f..', '.....', '.~&~.', '.~~~.']);
  assert.equal(preview(bog, act(bog, 'swap', 2, 1)).breath, 1);
  step(bog, act(bog, 'swap', 2, 1));
  assert.equal(breath(bog), 1);
  const fire = board(['.....', '.....', '.f@f.', '.....', '.....']);
  assert.equal(preview(fire, act(fire, 'swap', 1, 2)).breath, 0);
});

test('hunters hunt as a pack: when the wisp is covered, the next one guards a cell next to it', () => {
  const s = board(['.....', '..f..', '..@.f', '.....']);
  const far = enemies(s).find((e) => e.x === 4);
  assert.equal(far.it.type, 'strike');
  assert.equal(far.it.d, 6);
});

test('the alchemist throws onto empty ground, never onto a unit', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = makeFloor(mulberry32(seed), 4 + (seed % 5));
    for (let t = 0; t < 10; t++) {
      for (const e of enemies(s)) if (e.it?.type === 'throw') assert.equal(unitAt(s, e.it.x, e.it.y), undefined);
      const acts = actions(s);
      if (step(s, acts[t % acts.length]).outcome) break;
    }
  }
});

test('after quiet turns the hunters call for help, a lantern shows where', () => {
  const s = board(['.......', '.......', '...@...', '.......', '.......'], { rules: { help: 2 } });
  addUnit(s, 'fork', 0, 0);
  Object.assign(s, { helpPool: ['bow'], helpSeed: 7, calm: 0, party: 1 });
  step(s, { type: 'wait' });
  assert.equal(s.coming, undefined);
  step(s, { type: 'wait' });
  assert.equal(s.coming.k, 'bow');
  const r = step(s, { type: 'wait' });
  assert.ok(r.ev.some((e) => e.t === 'arrive'));
  assert.equal(enemies(s).filter((e) => e.k === 'bow').length, 1);
  assert.equal(s.coming, null);
});

test('lure pulls a hunter along the line, into bog he sinks', () => {
  const s = board(['.....', '..f..', '.~~~.', '.~&~.']);
  s.charges = { gust: 0, mire: 0, lure: 1 };
  const r = step(s, act(s, 'lure', 2, 1));
  assert.ok(r.ev.some((e) => e.t === 'sink'));
  assert.equal(enemies(s).length, 0);
  assert.equal(s.charges.lure, 0);
});

test('lure stops a hunter next to the wisp', () => {
  const s = board(['..b..', '.....', '.....', '..@..']);
  s.charges = { gust: 0, mire: 0, lure: 1 };
  const r = step(s, act(s, 'lure', 2, 0));
  const m = r.ev.find((e) => e.t === 'move' && e.push);
  assert.deepEqual(m.path.at(-1), [2, 2]);
  assert.equal(actions(s).filter((a) => a.type === 'lure').length, 0);
});

test('second wind refills breath after a hit', () => {
  const s = board(['.....', '.f@..', '.....'], { br: 0, rules: { secondWind: true, breath: 2 } });
  step(s, { type: 'wait' });
  assert.equal(wisp(s).hp, 2);
  assert.equal(breath(s), 2);
});

test('the last hunter flees when rout is on', () => {
  const s = board(['.....', '.f@f.', '.....', '....f'], { rules: { rout: true } });
  const r = step(s, act(s, 'swap', 1, 1));
  assert.ok(r.ev.some((e) => e.t === 'flee'));
  assert.equal(r.outcome, 'won');
});

test('mist veil ignores the first hit', () => {
  const s = board(['.....', '.f@..', '.....']);
  s.veil = 1;
  step(s, { type: 'wait' });
  assert.equal(wisp(s).hp, 3);
  assert.equal(s.veil, 0);
});

test('gust pushes neighbours, into bog they sink', () => {
  const s = board(['~....', '.f...', '..@..', '.....']);
  s.charges = { gust: 1, mire: 0 };
  step(s, { type: 'gust' });
  assert.equal(enemies(s).length, 0);
  assert.equal(s.charges.gust, 0);
});

test('mire turns an empty cell next to the wisp into bog', () => {
  const s = board(['.....', '..@..', '.....', 'f....']);
  s.charges = { gust: 0, mire: 1 };
  step(s, act(s, 'mire', 3, 1));
  assert.equal(terr(s, 3, 1), BOG);
});

test('preview predicts the attack phase exactly', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rng = mulberry32(seed);
    const s = makeFloor(rng, 1 + (seed % 9));
    for (let t = 0; t < 12; t++) {
      const acts = actions(s);
      for (const a of acts) {
        const pv = preview(s, a);
        const c = clone(s);
        c.rules = { ...(c.rules || {}), rout: false };
        const hp = wisp(c).hp;
        step(c, a);
        assert.equal(hp - wisp(c).hp, pv.hurt);
        const alive = new Set(enemies(c).map((e) => e.id));
        for (const id of pv.dies) assert.ok(!alive.has(id));
      }
      const r = step(s, acts[Math.floor(rng() * acts.length)]);
      if (r.outcome) break;
    }
  }
});

test('floors are deterministic for a seed', () => {
  const a = makeFloor(mulberry32(42), 5);
  const b = makeFloor(mulberry32(42), 5);
  assert.deepEqual(a, b);
});

test('no unit ever stands on a rock or shares a cell', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rng = mulberry32(seed * 7);
    const s = makeFloor(rng, 1 + (seed % 9));
    for (let t = 0; t < 20; t++) {
      const seen = new Set();
      for (const u of s.u) {
        if (u.hp <= 0) continue;
        const k = `${u.x},${u.y}`;
        assert.ok(!seen.has(k), `two units on ${k}`);
        seen.add(k);
        assert.notEqual(terr(s, u.x, u.y), 2);
        if (u.k !== 'wisp' && u.k !== 'gas' && u.k !== 'witch') assert.notEqual(terr(s, u.x, u.y), BOG);
      }
      const acts = actions(s);
      if (step(s, acts[Math.floor(rng() * acts.length)]).outcome) break;
    }
  }
  assert.ok(unitAt);
});
