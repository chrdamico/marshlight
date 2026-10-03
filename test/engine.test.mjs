import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTrial } from '../public/js/trials.js';
import { actions, step, preview, wisp, enemies, clone, unitAt, terr, BOG } from '../public/js/engine.js';
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

test('after a swap the wisp must rest one turn', () => {
  const s = board(['f.....', '......', '..@...', '......', '.....f']);
  step(s, act(s, 'swap', 0, 0));
  assert.equal(actions(s).filter((a) => a.type === 'swap').length, 0);
  step(s, { type: 'wait' });
  assert.ok(actions(s).some((a) => a.type === 'swap'));
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
