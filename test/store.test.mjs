import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');

const { mergeInto, normalize, db, exportCode, importCode, resetAll } = await import('../public/js/store.js');

test('a newer run in another tab wins, an older one does not', () => {
  const t = normalize({ slots: { main: { run: { depth: 3 }, at: 100 } } });
  mergeInto(t, normalize({ slots: { main: { run: { depth: 2 }, at: 50 } } }));
  assert.equal(t.slots.main.run.depth, 3);
  mergeInto(t, normalize({ slots: { main: { run: { depth: 5 }, at: 200 } } }));
  assert.equal(t.slots.main.run.depth, 5);
});

test('records and solved trials only grow', () => {
  const t = normalize({ best: { hour: 4, score: 900, at: 10 }, trials: { a: { stars: 1, at: 10 } } });
  mergeInto(t, normalize({ best: { hour: 2, score: 1500, at: 20 }, trials: { b: { stars: 1, at: 20 } } }));
  assert.equal(t.best.hour, 4);
  assert.equal(t.best.score, 1500);
  assert.deepEqual(Object.keys(t.trials).sort(), ['a', 'b']);
});

test('the first daily result is kept', () => {
  const t = normalize({ daily: { d: { first: { score: 300, at: 5 }, bestScore: 300, at: 5 } } });
  mergeInto(t, normalize({ daily: { d: { first: { score: 900, at: 9 }, bestScore: 900, at: 9 } } }));
  assert.equal(t.daily.d.first.score, 300);
  assert.equal(t.daily.d.bestScore, 900);
});

test('an erase is not undone by an old tab', () => {
  const t = normalize({ resetAt: 1000, settings: { sound: false } });
  mergeInto(t, normalize({ best: { hour: 9, at: 500 }, trials: { a: { stars: 1, at: 500 } }, slots: { main: { run: { depth: 4 }, at: 500 } } }));
  assert.equal(t.best.hour, 0);
  assert.equal(Object.keys(t.trials).length, 0);
  assert.equal(t.slots.main, undefined);
  const old = normalize({ trials: { a: { stars: 1, at: 50 } } });
  mergeInto(old, normalize({ resetAt: 1000 }));
  assert.equal(Object.keys(old.trials).length, 0);
  assert.equal(old.settings.sound, true);
});

test('a backup code restores progress and never removes any', () => {
  db.trials.a = { stars: 2, at: 10 };
  db.best.hour = 6;
  db.best.at = 10;
  const code = exportCode();
  assert.match(code, /^MARSH1:/);
  resetAll();
  assert.equal(Object.keys(db.trials).length, 0);
  db.trials.b = { stars: 1, at: Date.now() };
  const added = importCode(`here: ${code}`);
  assert.equal(added, 1);
  assert.deepEqual(Object.keys(db.trials).sort(), ['a', 'b']);
  assert.equal(db.best.hour, 6);
  const stored = JSON.parse(mem.get('marshlight:v1'));
  assert.equal(stored.trials.a.stars, 2);
  assert.equal(JSON.parse(mem.get('marshlight:v1:bak')).trials.a.stars, 2);
  assert.throws(() => importCode('nonsense'));
});
