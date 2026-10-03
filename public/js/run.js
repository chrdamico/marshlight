import { mulberry32, hashString, shuffle } from './rng.js';
import { makeFloor, pickTheme } from './gen.js';
import { step, wisp, enemies, clone } from './engine.js';

export const HOURS = 9;
export const HOUR_NAMES = ['9 PM', '10 PM', '11 PM', 'Midnight', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', 'Dawn'];

export const BOONS = {
  heartwood: { name: 'Heartwood', text: 'One more heart. Heal one.', icon: 'heart', max: 2 },
  dew: { name: 'Moon Dew', text: 'Heal all your hearts.', icon: 'dew', max: 9 },
  drift: { name: 'Drift', text: 'You can drift diagonally too.', icon: 'drift', max: 1 },
  reach: { name: 'Long Reach', text: 'Swap with the first or the second thing in a line.', icon: 'reach', max: 1 },
  breath: { name: 'Bog Breath', text: 'When a hunter sinks, you can swap again at once.', icon: 'breath', max: 1 },
  veil: { name: 'Mist Veil', text: 'Each hour, the first hit on you does nothing.', icon: 'veil', max: 1 },
  gust: { name: 'Gust', text: 'Once each hour: push everything next to you one cell away.', icon: 'gust', max: 1 },
  mire: { name: 'Mire', text: 'Once each hour: turn an empty cell next to you into bog.', icon: 'mire', max: 1 },
  kindling: { name: 'Kindling', text: 'Each hour starts with two more gas bubbles.', icon: 'gas', max: 2 },
};

export const MOONS = [
  null,
  { name: 'New Moon', text: 'The usual night.' },
  { name: 'Crescent', text: 'Bigger hunting parties.' },
  { name: 'Half Moon', text: 'Bigger parties. No healing between hours.' },
  { name: 'Gibbous', text: 'As above, and you rest two turns after a swap.' },
  { name: 'Full Moon', text: 'As above, and no hunter needs to reload.' },
];

function moonMult(moon) {
  return moon >= 2 ? 2 : 1.6;
}

function moonRules(moon) {
  const r = {};
  if (moon >= 4) r.swapCd = 2;
  if (moon >= 5) r.noReload = ['bow', 'hound', 'flask', 'priest'];
  return r;
}

export function newRun({ seed = String(Date.now()), daily = null, moon = 1, rules = null } = {}) {
  const run = {
    v: 1,
    seed,
    daily,
    moon,
    depth: 1,
    score: 0,
    hp: 3,
    mhp: 3,
    boons: {},
    offers: null,
    over: null,
    turns: 0,
    kills: 0,
    drowned: 0,
    best: 0,
    started: Date.now(),
    hourLog: [],
    rules,
  };
  startFloor(run);
  return run;
}

export function floorRng(run, salt = '') {
  return mulberry32(hashString(`${run.seed}:${run.depth}:${salt}`));
}

export function startFloor(run) {
  const rng = floorRng(run);
  const b = run.boons;
  const final = run.depth === HOURS;
  const theme = pickTheme(rng, run.depth, final);
  const s = makeFloor(rng, run.depth, { hp: run.hp, mhp: run.mhp, mult: moonMult(run.moon), extraGas: (b.kindling || 0) * 2, theme, boss: final });
  s.rules = { ...moonRules(run.moon), ...(run.rules || {}) };
  if (b.drift) s.rules.step = 8;
  if (b.reach) s.rules.reach = true;
  if (b.breath) s.rules.bogBreath = true;
  s.charges = { gust: b.gust ? 1 : 0, mire: b.mire ? 1 : 0 };
  s.veil = b.veil ? 1 : 0;
  run.state = s;
  run.floorStart = { score: run.score, hp: run.hp };
  run.turnScore = 0;
  run.lastKills = 0;
}

export function turnPoints(kills, drowned) {
  return kills * kills * 10 + drowned * 5;
}

export function playTurn(run, action) {
  const s = run.state;
  const before = enemies(s).length;
  const hpBefore = wisp(s).hp;
  const res = step(s, action);
  const fled = res.ev.some((e) => e.t === 'flee') ? 1 : 0;
  const kills = Math.max(0, before - enemies(s).length - fled);
  const drowned = res.ev.filter((e) => e.t === 'sink').length;
  const pts = kills ? turnPoints(kills, drowned) : 0;
  run.score += pts;
  run.kills += kills;
  run.drowned += drowned;
  run.turns++;
  run.lastKills = kills;
  run.hp = wisp(s).hp;
  const out = { ...res, kills, pts, hurt: hpBefore - wisp(s).hp };
  if (res.outcome === 'lost') {
    run.over = 'lost';
    run.hourLog.push({ depth: run.depth, turns: s.turn, hurt: s.stats.hurt, kills: s.stats.kills });
  } else if (res.outcome === 'won') {
    const flawless = s.stats.hurt === 0;
    const bonus = 20 * run.depth + (flawless ? 15 * run.depth : 0);
    run.score += bonus;
    out.clearBonus = bonus;
    out.flawless = flawless;
    run.hourLog.push({ depth: run.depth, turns: s.turn, hurt: s.stats.hurt, kills: s.stats.kills });
    if (run.depth >= HOURS) {
      const dawn = 100 + 50 * run.hp;
      run.score += dawn;
      out.dawnBonus = dawn;
      run.over = 'won';
    } else {
      run.offers = offerBoons(run);
    }
  }
  return out;
}

export function offerBoons(run) {
  const rng = floorRng(run, 'boons');
  const pool = Object.keys(BOONS).filter((k) => {
    const have = run.boons[k] || 0;
    if (have >= BOONS[k].max) return false;
    if (k === 'dew' && run.hp >= run.mhp) return false;
    return true;
  });
  const picks = shuffle(pool.slice(), rng).slice(0, 3);
  if (run.hp < run.mhp && !picks.includes('dew') && !picks.includes('heartwood') && run.hp <= 1) picks[2] = 'dew';
  return picks;
}

export function healBetween(run) {
  return run.moon >= 3 ? 0 : 1;
}

export function chooseBoon(run, id) {
  if (id && BOONS[id]) {
    run.boons[id] = (run.boons[id] || 0) + 1;
    if (id === 'heartwood') {
      run.mhp += 1;
      run.hp += 1;
    }
    if (id === 'dew') run.hp = run.mhp;
  }
  run.offers = null;
  run.hp = Math.min(run.mhp, run.hp + healBetween(run));
  run.depth++;
  startFloor(run);
}

export function snapshot(run) {
  return clone(run);
}
