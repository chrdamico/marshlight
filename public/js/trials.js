import { GROUND, BOG, ROCK, addUnit, aimInPlace } from './engine.js';
import { emptyState } from './gen.js';
import { GENERATED } from './trials-data.js';

export const CHAPTERS = [
  { name: 'First Lights', text: 'Learn the ways of the wisp' },
  { name: 'Bolts in the Dark', text: 'Hunters shoot the first thing in line' },
  { name: 'The Hounds', text: 'Dogs charge until they hit something' },
  { name: 'Brews', text: 'Alchemists throw flasks that burst in a plus' },
  { name: 'Iron', text: 'Knights take two hits, or one bog' },
  { name: 'Holy Light', text: 'Priests burn a whole line' },
  { name: 'Witchery', text: 'Witches fly over the bog' },
  { name: 'Witching Hour', text: 'Everyone at once' },
];

const TUTORIAL = [
  {
    name: 'The Bog',
    turns: 1,
    text: 'You float over the bog. Hunters sink in it. <b>Tap the peasant</b> to see a swap, then <b>tap again</b> to do it.',
    after: 'Glug. One less pitchfork in the marsh.',
    map: ['.....', '..f..', '.....', '.~&~.', '.~~~.'],
  },
  {
    name: 'Crossfire',
    turns: 1,
    text: 'Red cells show where hunters strike after your move. Both peasants aim at you. <b>Swap with one of them.</b>',
    after: 'A swapped hunter keeps aiming the same way. They struck each other.',
    map: ['.....', '.....', '.f@f.', '.....', '.....'],
  },
  {
    name: 'Breath',
    turns: 2,
    text: 'A swap uses your <b>breath</b> (the bubble at the top). Drift or wait to get it back. But if the swap <b>sinks a hunter</b>, you keep it. Clear the marsh in <b>2 turns</b>.',
    after: 'The bog gives you breath. Sink a hunter, and you can swap again at once.',
    map: ['.....', '.....', '.fb.f', '.~.&.', '.~...', '.....'],
  },
  {
    name: 'Bolts',
    turns: 1,
    text: 'Hunters shoot along the dotted line. A bolt hits the <b>first thing</b> in its way.',
    after: 'Hunters are not careful about who stands in the way.',
    map: ['.......', '.......', 'b..@..b', '.......', '.......'],
  },
  {
    name: 'Marsh Gas',
    turns: 1,
    text: 'Marsh gas bursts when struck and hurts all 8 cells around it. You can <b>swap with the gas</b> too.',
    after: 'Boom. The marsh has its own weapons.',
    map: ['......', '..f...', '.f@f..', '......', '....o.', '......'],
  },
  {
    name: 'A Small Hunt',
    turns: 3,
    text: 'Use everything: bog, bolts and the hunters themselves. Clear the marsh in <b>3 turns</b> without a hit.',
    after: 'You are ready for a whole night. Good luck, little light.',
    map: ['.b.o.', '.f~..', '~&~..', '..b..', '.....', '.....'],
  },
];

const CH = { f: 'fork', b: 'bow', h: 'hound', a: 'flask', k: 'knight', p: 'priest', w: 'witch', W: 'witch', o: 'gas', O: 'gas' };

export function loadTrial(def) {
  const rows = def.map;
  const h = rows.length;
  const w = rows[0].length;
  const s = emptyState(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      s.t[y * w + x] = c === '~' || c === '&' || c === 'W' || c === 'O' ? BOG : c === '#' ? ROCK : GROUND;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (c === '@' || c === '&') addUnit(s, 'wisp', x, y, { hp: 3, mhp: 3, d: 0, ...(def.br != null ? { br: def.br } : {}) });
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (CH[c]) addUnit(s, CH[c], x, y, { d: 4 });
    }
  }
  for (const [x, y] of def.rest || []) {
    const u = s.u.find((q) => q.x === x && q.y === y);
    if (u) u.cd = 1;
  }
  s.rules = { rout: false, ...(def.rules || {}) };
  s.party = s.u.filter((u) => u.k !== 'wisp' && u.k !== 'gas').length;
  aimInPlace(s);
  return s;
}

export const TRIALS = [];
TUTORIAL.forEach((t, i) => TRIALS.push({ ...t, chapter: 0, id: `t0-${i + 1}`, label: `1-${i + 1}` }));
for (const t of GENERATED) TRIALS.push({ ...t, label: `${t.chapter + 1}-${t.n}`, id: `t${t.chapter}-${t.n}` });
