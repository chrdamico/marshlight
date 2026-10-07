import { mulberry32, hashString, shuffle } from './rng.js';
import { makeFloor, pickTheme } from './gen.js';
import { step, wisp, enemies, clone, RULES } from './engine.js';

export const HOURS = 9;
export const HOUR_NAMES = ['9 PM', '10 PM', '11 PM', 'Midnight', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', 'Dawn'];

export const BOONS = {
  heartwood: { name: 'Heartwood', text: 'One more heart. Heal one.', icon: 'heart', max: 2 },
  dew: { name: 'Moon Dew', text: 'Heal all your hearts.', icon: 'dew', max: 9 },
  lungs: { name: 'Deep Lungs', text: 'Hold one more breath.', icon: 'breath', max: 1 },
  reach: { name: 'Long Reach', text: 'Swap with the first or the second thing in a line.', icon: 'reach', max: 1 },
  second: { name: 'Second Wind', text: 'When a hit lands on you, all your breath comes back.', icon: 'wind', max: 1 },
  veil: { name: 'Mist Veil', text: 'Each hour, the first hit on you does nothing.', icon: 'veil', max: 1 },
  gust: { name: 'Gust', text: 'Once each hour: push everything next to you one cell away.', icon: 'gust', max: 1 },
  mire: { name: 'Mire', text: 'Once each hour: turn an empty cell next to you into bog.', icon: 'mire', max: 1 },
  lure: { name: 'Lure', text: 'Once each hour: call a hunter in a line. He walks to your light until something stops him, or the bog takes him.', icon: 'lure', max: 1 },
  kindling: { name: 'Kindling', text: 'Each hour starts with two more gas bubbles.', icon: 'gas', max: 2 },
};

export const MOONS = [
  null,
  { name: 'New Moon', text: 'The usual night.' },
  { name: 'Crescent', text: 'Bigger hunting parties.' },
  { name: 'Half Moon', text: 'Bigger parties. No healing between hours.' },
  { name: 'Gibbous', text: 'As above. Help comes sooner, and the bog gives no breath back.' },
  { name: 'Full Moon', text: 'As above, and no hunter needs to reload.' },
];

function moonMult(moon) {
  return moon >= 2 ? 2.4 : 2;
}

function moonRules(moon) {
  const r = {};
  if (moon >= 4) Object.assign(r, { help: 3, refund: false });
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

function floorRules(run) {
  const b = run.boons;
  const r = { ...moonRules(run.moon), ...(run.rules || {}) };
  if (b.lungs) r.breath = (r.breath ?? RULES.breath) + 1;
  if (b.second) r.secondWind = true;
  if (b.reach) r.reach = true;
  return r;
}

const OLD_BOONS = { drift: 'lungs', breath: 'second' };

export function upgradeRun(run) {
  if (!run) return run;
  let changed = false;
  for (const [old, now] of Object.entries(OLD_BOONS)) {
    if (!run.boons[old]) continue;
    delete run.boons[old];
    run.boons[now] = 1;
    changed = true;
  }
  if (run.offers) run.offers = run.offers.map((k) => OLD_BOONS[k] || k);
  const s = run.state;
  if (s && (changed || !s.rules || s.rules.swapCd != null || s.rules.step != null || s.rules.bogBreath != null)) {
    s.rules = floorRules(run);
    if (run.boons.lure && s.charges && s.charges.lure == null) s.charges.lure = 0;
    const p = s.u.find((u) => u.k === 'wisp');
    if (p) delete p.cd;
  }
  return run;
}

export function startFloor(run) {
  const rng = floorRng(run);
  const b = run.boons;
  const final = run.depth === HOURS;
  const theme = pickTheme(rng, run.depth, final);
  const s = makeFloor(rng, run.depth, { hp: run.hp, mhp: run.mhp, mult: moonMult(run.moon), extraGas: (b.kindling || 0) * 2, theme, boss: final });
  s.rules = floorRules(run);
  s.charges = { gust: b.gust ? 1 : 0, mire: b.mire ? 1 : 0, lure: b.lure ? 1 : 0 };
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
  if (run.offers || run.over) throw new Error('the hour is over');
  const s = run.state;
  const before = enemies(s).length;
  const hpBefore = wisp(s).hp;
  const res = step(s, action);
  const fled = res.ev.filter((e) => e.t === 'flee').length;
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
