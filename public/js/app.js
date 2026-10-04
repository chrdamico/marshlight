import { db, persist, saveRun, loadRun, touchBest, touchSettings, markSeen, resetAll, onExternalChange } from './store.js';
import { sfx, buzz, ambient } from './sound.js';
import { BoardView } from './render.js';
import { actions, sameAction, preview, wisp, enemies, unitAt, clone, step, isEnemy } from './engine.js';
import { newRun, playTurn, chooseBoon, BOONS, HOURS, HOUR_NAMES, MOONS } from './run.js';
import { THEMES } from './gen.js';
import { TRIALS, CHAPTERS, loadTrial } from './trials.js';
import { sprite } from './sprites.js';
import { initPWA, canPrompt, promptInstall, isStandalone, isIOS } from './pwa.js';
import { solve } from './solver.js';

const $app = document.getElementById('app');
const $sheets = document.getElementById('sheet-root');

export const INFO = {
  wisp: ['You, the wisp', 'Drift to a cell next to you, or swap places with the first thing in any of the 8 lines. You float over bog.'],
  fork: ['Peasant', 'Strikes the cell next to him. Walks one cell each turn.'],
  bow: ['Hunter', 'Shoots along a line. The bolt hits the first thing in its way. Reloads after each shot.'],
  hound: ['Hound', 'Runs two cells each turn. Charges in a line until it hits something. If it charges into bog, it sinks.'],
  flask: ['Alchemist', 'Throws a flask at your cell. It bursts in a plus shape. Brews a new flask after each throw.'],
  knight: ['Knight', 'Two hearts. Swings at the cell in front of him and the two cells beside it. In bog, his armour sinks him at once.'],
  priest: ['Priest', 'Sends holy light along a whole line. It goes through everyone. Prays after each beam.'],
  witch: ['Witch', 'Flies, so bog cannot sink her. Strikes a diagonal cell. Moves two cells.'],
  finder: ['The Witchfinder', 'Three hearts. Moves two cells and swings at three. When he falls, the rest flee. He sinks like any man.'],
  gas: ['Marsh gas', 'Bursts when something hits it and hurts all 8 cells around it. You can swap with it.'],
};

const KIND_ORDER = ['fork', 'bow', 'hound', 'flask', 'knight', 'priest', 'witch', 'finder', 'gas'];
const CHAPTER_KIND = [null, 'bow', 'hound', 'flask', 'knight', 'priest', 'witch', null];

const ICONS = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  heart: '<svg viewBox="0 0 32 32"><path d="M16 27C8 21 4 16.5 4 11.5 4 8 6.7 5.5 10 5.5c2.4 0 4.6 1.4 6 3.5 1.4-2.1 3.6-3.5 6-3.5 3.3 0 6 2.5 6 6 0 5-4 9.5-12 15.5z" fill="#ff8f7f"/></svg>',
  dew: '<svg viewBox="0 0 32 32"><path d="M16 4C12 11 8 15 8 20a8 8 0 0016 0c0-5-4-9-8-16z" fill="#8fe7ff"/><circle cx="13" cy="20" r="2.4" fill="#fff" opacity=".8"/></svg>',
  drift: '<svg viewBox="0 0 32 32" fill="none" stroke="#a6f2ff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="2.5" fill="#a6f2ff"/><path d="M11 11L6 6M21 11l5-5M11 21l-5 5M21 21l5 5M6 11V6h5M26 11V6h-5M6 21v5h5M26 21v5h-5"/></svg>',
  reach: '<svg viewBox="0 0 32 32" fill="none" stroke="#a6f2ff" stroke-width="2.6" stroke-linecap="round"><path d="M4 16h24M22 10l6 6-6 6"/><circle cx="12" cy="16" r="3" fill="#a6f2ff"/><circle cx="20" cy="16" r="3" fill="none"/></svg>',
  breath: '<svg viewBox="0 0 32 32" fill="none" stroke="#a6f2ff" stroke-width="2.4"><circle cx="11" cy="20" r="5"/><circle cx="21" cy="12" r="4"/><circle cx="22" cy="23" r="2.5"/></svg>',
  veil: '<svg viewBox="0 0 32 32" fill="none" stroke="#cfe0ff" stroke-width="2.4" stroke-linecap="round"><path d="M5 11c4-3 8 3 12 0s7-3 10 0M5 17c4-3 8 3 12 0s7-3 10 0M5 23c4-3 8 3 12 0s7-3 10 0"/></svg>',
  gust: '<svg viewBox="0 0 32 32" fill="none" stroke="#e2f6ff" stroke-width="2.6" stroke-linecap="round"><path d="M4 12h15a4 4 0 10-4-4M4 18h20a4 4 0 11-4 4M4 24h9"/></svg>',
  mire: '<svg viewBox="0 0 32 32" fill="none" stroke="#6fc3d4" stroke-width="2.6" stroke-linecap="round"><path d="M4 14c3-3 5 3 8 0s5-3 8 0 5 3 8 0M4 21c3-3 5 3 8 0s5-3 8 0 5 3 8 0"/></svg>',
  gas: '<svg viewBox="0 0 32 32"><circle cx="12" cy="19" r="6" fill="#b6f08e" opacity=".75"/><circle cx="20" cy="13" r="5" fill="#d8ff9e" opacity=".8"/><circle cx="21" cy="22" r="3.5" fill="#9ee07a" opacity=".8"/></svg>',
  wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12h-2"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5"/></svg>',
  hint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0012 3z"/></svg>',
};

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

let toastT = 0;
function toast(msg, ms = 2200, action) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('act', !!action);
  if (action) t.append(el('button', { onclick: action.run }, action.label));
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

function sheet(build, { center = false, dismiss = true, onClose } = {}) {
  const back = el('div', { class: `backdrop${center ? ' center' : ''}` });
  const box = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  back.append(box);
  const close = () => {
    back.remove();
    onClose?.();
  };
  if (dismiss) back.addEventListener('pointerdown', (e) => e.target === back && close());
  build(box, close);
  $sheets.append(back);
  return close;
}

function closeSheets() {
  $sheets.innerHTML = '';
}

function unitIcon(k, px = 48) {
  const c = el('canvas', { width: px, height: px });
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (k === 'wisp') {
    const r = px * 0.2;
    const cx = px / 2;
    const cy = px * 0.58;
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, px * 0.5);
    halo.addColorStop(0, 'rgba(170,240,255,0.6)');
    halo.addColorStop(1, 'rgba(170,240,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, px, px);
    g.beginPath();
    g.moveTo(cx - r, cy);
    g.arc(cx, cy, r, Math.PI, 0, true);
    g.quadraticCurveTo(cx + r, cy - r * 1.2, cx, cy - r * 2.1);
    g.quadraticCurveTo(cx - r, cy - r * 1.1, cx - r, cy);
    g.fillStyle = '#d8f8ff';
    g.fill();
    g.fillStyle = '#123040';
    g.fillRect(cx - r * 0.5, cy - r * 0.15, r * 0.25, r * 0.45);
    g.fillRect(cx + r * 0.25, cy - r * 0.15, r * 0.25, r * 0.45);
  } else if (k === 'gas') {
    for (const [x, y, r] of [
      [0.4, 0.58, 0.17],
      [0.6, 0.6, 0.15],
      [0.5, 0.42, 0.19],
    ]) {
      g.fillStyle = 'rgba(170,240,120,0.7)';
      g.beginPath();
      g.arc(x * px, y * px, r * px, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    const img = sprite(k);
    if (img) g.drawImage(img, 0, 0, px, px);
  }
  return c;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function heartsRow(hp, mhp) {
  const row = el('div', { class: 'hearts', 'aria-label': `${hp} of ${mhp} hearts` });
  for (let i = 0; i < mhp; i++) row.append(el('i', { class: `heart${i < hp ? '' : ' off'}` }));
  return row;
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

/* ------------------------------------------------------------------ */

let current = null;

function go(screen, ...args) {
  if (screen !== Home && !history.state?.inner) history.pushState({ inner: true }, '');
  if (current?.destroy) current.destroy();
  closeSheets();
  $app.innerHTML = '';
  document.body.classList.toggle('playing', screen !== Home);
  ambient(screen === Play);
  current = screen(...args) || null;
}

function trialsDone() {
  return TRIALS.filter((t) => db.trials[t.id]).length;
}

function tutorialDone() {
  return TRIALS.filter((t) => t.chapter === 0).every((t) => db.trials[t.id]);
}

function Home() {
  const main = loadRun('main');
  const dkey = today();
  const dslot = db.slots.daily?.run;
  if (dslot && !dslot.over && dslot.daily !== dkey) finishRun(dslot, 'daily', true);
  const dRunning = dslot && !dslot.over && dslot.daily === dkey ? dslot : null;
  const dRes = db.daily[dkey];
  const moonMax = Math.min(5, db.best.dawns > 0 ? db.best.moon || 1 : 1);
  let moon = Math.min(moonMax, db.settings.moon || 1);

  const scr = el('section', { class: 'screen home' });
  scr.append(
    el('div', { class: 'wisp-hero', 'aria-hidden': 'true' }, el('div', { class: 'flame' }), el('div', { class: 'eyes' }, el('i'), el('i'))),
    el('h1', { class: 'title' }, 'Marshlight'),
    el('p', { class: 'subtitle' }, 'You are a will-o’-the-wisp. You cannot fight. The hunters can.'),
  );
  const menu = el('div', { class: 'menu' });
  const learnFirst = !tutorialDone() && !main && !db.best.runs;
  if (learnFirst) {
    menu.append(el('button', { class: 'btn primary stack', onclick: () => go(Play, { mode: 'trial', id: TRIALS[0].id }) }, 'Learn to play', el('small', {}, 'Six short lessons')));
  }
  if (main) {
    menu.append(
      el('button', { class: 'btn primary stack', onclick: () => go(Play, { mode: 'run', slot: 'main' }) }, `Continue the night`, el('small', {}, `${HOUR_NAMES[main.depth - 1]} · ${main.hp} of ${main.mhp} hearts · ${fmt(main.score)} lights`)),
    );
  }
  const newNight = () => {
    const start = () => {
      db.settings.moon = moon;
      touchSettings();
      const run = newRun({ moon });
      saveRun('main', run);
      go(Play, { mode: 'run', slot: 'main' });
    };
    if (main) {
      sheet(
        (box, close) => {
          box.append(
            el('h2', {}, 'Begin a new night?'),
            el('p', {}, `Your night at ${HOUR_NAMES[main.depth - 1]} ends, and its lights count as final.`),
            el(
              'div',
              { class: 'btns' },
              el(
                'button',
                {
                  class: 'btn warm',
                  onclick: () => {
                    close();
                    finishRun(main, 'main', true);
                    start();
                  },
                },
                'Yes, a new night',
              ),
              el('button', { class: 'btn', onclick: close }, 'Keep my night'),
            ),
          );
        },
        { center: true },
      );
    } else start();
  };
  menu.append(
    el(
      'button',
      { class: `btn ${learnFirst || main ? '' : 'primary'} stack`, onclick: newNight },
      'New night',
      el('small', {}, moonMax > 1 ? `${MOONS[moon].name} · tap the moon to change` : 'Survive from 9 PM until dawn'),
    ),
  );
  if (moonMax > 1) {
    const mbtn = el('button', { class: 'btn small ghost' }, `☾ ${MOONS[moon].name}: ${MOONS[moon].text}`);
    mbtn.addEventListener('click', () => {
      moon = (moon % moonMax) + 1;
      db.settings.moon = moon;
      touchSettings();
      go(Home);
    });
    menu.append(mbtn);
  }
  let dailyLabel = 'Same night for everyone today';
  if (dRunning) dailyLabel = `In progress · ${HOUR_NAMES[dRunning.depth - 1]}`;
  else if (dRes?.first) dailyLabel = `${dRes.first.won ? 'Dawn' : 'Caught at ' + HOUR_NAMES[dRes.first.hour - 1]} · ${fmt(dRes.first.score)} lights`;
  menu.append(
    el(
      'button',
      {
        class: 'btn stack',
        onclick: () => {
          if (!dRunning) saveRun('daily', newRun({ seed: `daily:${dkey}`, daily: dkey }));
          go(Play, { mode: 'run', slot: 'daily' });
        },
      },
      "Tonight's hunt",
      el('small', {}, dailyLabel),
    ),
  );
  menu.append(el('button', { class: 'btn stack', onclick: () => go(TrialList) }, 'Trials', el('small', {}, `${trialsDone()} of ${TRIALS.length} puzzles solved`)));
  const row = el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => almanac() }, 'Almanac'), el('button', { class: 'btn small', onclick: () => settings() }, 'Settings'));
  menu.append(row);
  if (!isStandalone() && (canPrompt() || isIOS())) {
    menu.append(
      el(
        'button',
        {
          class: 'btn small ghost',
          onclick: async () => {
            if (canPrompt()) {
              const ok = await promptInstall();
              if (ok) toast('Installed. It works offline.');
            } else toast('Tap Share, then “Add to Home Screen”.', 4000);
          },
        },
        'Install for offline play',
      ),
    );
  }
  scr.append(menu);
  const b = db.best;
  if (b.runs) {
    scr.append(
      el(
        'div',
        { class: 'records', html: `Best night: <b>${b.hour >= 10 ? 'Dawn' : HOUR_NAMES[Math.max(0, b.hour - 1)]}</b> · <b>${fmt(b.score)}</b> lights<br>${b.dawns} dawn${b.dawns === 1 ? '' : 's'} · ${fmt(b.kills)} hunters felled · ${fmt(b.drowned)} in the bog` },
      ),
    );
  }
  $app.append(scr);
}

/* ------------------------------------------------------------------ */

function finishRun(run, slot, abandoned = false) {
  if (abandoned && !run.over) run.over = 'abandoned';
  if (!run.recorded) record(run);
  saveRun(slot, run);
  persist(true);
}

function record(run) {
  run.recorded = true;
  const b = db.best;
  b.runs++;
  b.kills += run.kills;
  b.drowned += run.drowned;
  const hour = run.over === 'won' ? 10 : run.depth;
  b.hour = Math.max(b.hour, hour);
  b.score = Math.max(b.score, run.score);
  if (run.over === 'won') {
    b.dawns++;
    b.moon = Math.max(b.moon || 1, Math.min(5, run.moon + 1));
  }
  touchBest();
  if (run.daily) {
    const d = (db.daily[run.daily] = db.daily[run.daily] || {});
    if (!d.first) d.first = { score: run.score, hour, won: run.over === 'won', at: Date.now(), marks: hourMarks(run), kills: run.kills, drowned: run.drowned };
    d.bestScore = Math.max(d.bestScore || 0, run.score);
    d.bestHour = Math.max(d.bestHour || 0, hour);
    d.won = d.won || run.over === 'won';
    d.at = Date.now();
  }
}

/* ------------------------------------------------------------------ */

function Play(opts) {
  const isTrial = opts.mode === 'trial';
  let run = null;
  let trial = null;
  let tdef = null;
  let history = [];
  if (isTrial) {
    tdef = TRIALS.find((t) => t.id === opts.id) || TRIALS[0];
    trial = { s: loadTrial(tdef), turns: 0, failed: null };
    for (const u of trial.s.u) if (u.k !== 'wisp') markSeen(`kind:${u.k}`);
  } else {
    run = loadRun(opts.slot);
    if (!run) return go(Home);
  }
  const S = () => (isTrial ? trial.s : run.state);

  const scr = el('section', { class: 'screen game' });
  const hourEl = el('div', { class: 'h' });
  const subEl = el('small');
  const heartsEl = el('div');
  const scoreEl = el('div', { class: 'score' });
  const hud = el(
    'header',
    { class: 'hud' },
    el('button', { class: 'icon-btn', 'aria-label': 'Menu', html: ICONS.menu, onclick: () => pause() }),
    el('div', { class: 'clock' }, hourEl, subEl),
    el('div', { class: 'stat-r' }, heartsEl, scoreEl),
  );
  const stage = el('div', { class: 'stage' });
  const canvas = el('canvas', { 'aria-label': 'Marsh board' });
  stage.append(canvas);
  const infoIcon = el('div');
  const infoT = el('div', { class: 't' });
  const infoD = el('div', { class: 'd' });
  const info = el('div', { class: 'info' }, infoIcon, el('div', { class: 'txt' }, infoT, infoD));
  const bar = el('div', { class: 'actions' });
  scr.append(hud, stage, info, bar);
  $app.append(scr);

  const view = new BoardView(canvas);
  if (location.search.includes('debug')) Object.assign(window, { __view: view, __S: S });
  view.sfx = (n) => sfx(n);
  let sel = null;
  let mode = null;
  let alive = true;

  const fit = () => {
    const r = stage.getBoundingClientRect();
    view.layout(r.width, r.height - 12);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);

  function setInfo(kind, title, html) {
    infoIcon.innerHTML = '';
    if (kind) infoIcon.append(unitIcon(kind, 40));
    infoT.textContent = title;
    infoD.innerHTML = html;
  }

  function idleInfo() {
    const s = S();
    const p = wisp(s);
    if (isTrial && trial.turns === 0) {
      if (tdef.text) return setInfo('wisp', tdef.name, tdef.text);
      const intro = tdef.n === 1 && CHAPTER_KIND[tdef.chapter];
      const goal = `Clear the marsh in <b>${tdef.turns} turn${tdef.turns === 1 ? '' : 's'}</b> without a hit.`;
      if (intro) return setInfo(intro, INFO[intro][0], `${INFO[intro][1]} ${goal}`);
      return setInfo('wisp', tdef.name, goal);
    }
    if (isTrial && trial.failed) return setInfo('wisp', trial.failed, 'Tap <b>Undo</b> or <b>Restart</b>.');
    if (mode === 'mire') return setInfo(null, 'Mire', 'Tap an empty cell next to you to turn it into bog.');
    const threatened = view.intents(s).some(({ cells }) => cells.some(([x, y]) => x === p.x && y === p.y));
    if (p.cd > 0)
      return setInfo('wisp', threatened ? 'Out of breath, and in danger' : 'Catching your breath', `You swapped last turn, so you can only <b>drift</b> or <b>wait</b>.${threatened ? ' Your cell is red: drift to a safe cell.' : ''}`);
    if (threatened) return setInfo('wisp', 'You are in danger', 'Red cells will be hit after your move. Drift away, or swap so a hunter takes your place.');
    setInfo('wisp', 'Your move', 'Drift to a cell next to you, or swap with something in a straight line. Tap any hunter to see what it does.');
  }

  function hud_() {
    const s = S();
    const p = wisp(s);
    if (isTrial) {
      hourEl.textContent = tdef.name;
      subEl.textContent = `Trial ${tdef.label} · turn ${Math.min(trial.turns + 1, tdef.turns)} of ${tdef.turns}`;
      heartsEl.replaceChildren();
      scoreEl.textContent = '';
    } else {
      hourEl.textContent = HOUR_NAMES[run.depth - 1];
      subEl.textContent = `${run.daily ? "Tonight's hunt · " : ''}Hour ${run.depth} of ${HOURS} · ${THEMES[s.theme]?.name || 'Marsh'} · ${enemies(s).length} left`;
      heartsEl.replaceChildren(heartsRow(p.hp, p.mhp || run.mhp));
      scoreEl.textContent = `${fmt(run.score)} lights`;
    }
    buildBar();
  }

  function buildBar() {
    bar.innerHTML = '';
    const s = S();
    bar.append(el('button', { class: 'btn', onclick: () => tapAction({ type: 'wait' }), html: `${ICONS.wait.replace('<svg', '<svg width="20" height="20"')} Wait` }));
    if (!isTrial) {
      const ch = s.charges || {};
      if (run.boons.gust) bar.append(el('button', { class: 'btn', disabled: !ch.gust, onclick: () => tapAction({ type: 'gust' }), html: `${ICONS.gust.replace('<svg', '<svg width="22" height="22"')} Gust` }));
      if (run.boons.mire)
        bar.append(
          el('button', {
            class: `btn${mode === 'mire' ? ' primary' : ''}`,
            disabled: !ch.mire,
            onclick: () => {
              mode = mode === 'mire' ? null : 'mire';
              sel = null;
              refresh();
            },
            html: `${ICONS.mire.replace('<svg', '<svg width="22" height="22"')} Mire`,
          }),
        );
    } else {
      bar.append(el('button', { class: 'btn', disabled: !history.length, onclick: undo, html: `${ICONS.undo.replace('<svg', '<svg width="20" height="20"')} Undo` }));
      bar.append(el('button', { class: 'btn', onclick: restart, html: `${ICONS.restart.replace('<svg', '<svg width="20" height="20"')} Restart` }));
    }
  }

  function refresh() {
    const s = S();
    const acts = trial?.failed ? [] : actions(s);
    const steps = acts.filter((a) => a.type === 'step').map((a) => [a.x, a.y]);
    const swaps = acts.filter((a) => a.type === 'swap').map((a) => [a.x, a.y]);
    const mires = acts.filter((a) => a.type === 'mire').map((a) => [a.x, a.y]);
    const o = {};
    if (db.settings.hints || mode === 'mire') {
      o.steps = mode === 'mire' ? mires : steps;
      o.swaps = mode === 'mire' ? [] : swaps;
    }
    if (sel) {
      o.sel = sel.cell;
      o.preview = sel.pv;
    }
    view.setOverlay(o);
    if (!sel) idleInfo();
    hud_();
  }

  function describe(a, pv) {
    const s = S();
    const parts = [];
    const names = pv.dies.map((id) => s.u.find((u) => u.id === id)?.k);
    const sunk = pv.state.u.filter((u) => pv.dies.includes(u.id) && u.hp <= 0).length;
    if (names.length === 1) parts.push(`The <b>${INFO[names[0]][0]}</b> ${sunk ? 'sinks' : 'falls'}.`);
    else if (names.length > 1) parts.push(`<b>${names.length} hunters fall.</b>`);
    for (const id of pv.hurtE) parts.push(`The ${INFO[s.u.find((u) => u.id === id).k][0]} is wounded.`);
    if (pv.hurt > 0) parts.push(`<span class="bad">You get hit (−${pv.hurt}).</span>`);
    else parts.push('<span class="good">You stay safe.</span>');
    if (a.type === 'swap') parts.push('Then you rest a turn.');
    parts.push(db.settings.confirm ? 'Tap again to confirm.' : '');
    return parts.join(' ');
  }

  function titleFor(a) {
    const s = S();
    if (a.type === 'step') return 'Drift here';
    if (a.type === 'wait') return 'Wait';
    if (a.type === 'gust') return 'Gust';
    if (a.type === 'mire') return 'Mire';
    const u = s.u.find((q) => q.id === a.id);
    return `Swap with the ${INFO[u.k][0]}`;
  }

  function locked() {
    if (view.busy || !alive) return true;
    if (isTrial) return !!trial.failed || enemies(trial.s).length === 0;
    return !!(run.offers || run.over);
  }

  function tapAction(a, previewOnly = false) {
    if (locked()) return;
    const legal = actions(S()).find((b) => b.type === a.type && b.x === a.x && b.y === a.y && (a.id == null || b.id === a.id));
    if (!legal) return;
    const cell = a.x != null ? [a.x, a.y] : [wisp(S()).x, wisp(S()).y];
    if (!previewOnly && (!db.settings.confirm || (sel && sameAction(sel.a, legal)))) {
      commit(legal);
      return;
    }
    const pv = preview(S(), legal);
    sel = { a: legal, cell, pv };
    sfx('select');
    const k = legal.type === 'swap' ? S().u.find((u) => u.id === legal.id).k : 'wisp';
    refresh();
    setInfo(k, titleFor(legal), describe(legal, pv));
  }

  function onTap(cell) {
    if (locked()) return;
    const s = S();
    const [x, y] = cell;
    const p = wisp(s);
    if (mode === 'mire') {
      if (actions(s).some((a) => a.type === 'mire' && a.x === x && a.y === y)) tapAction({ type: 'mire', x, y });
      else {
        mode = null;
        sel = null;
        refresh();
      }
      return;
    }
    if (p.x === x && p.y === y) return tapAction({ type: 'wait' });
    const acts = actions(s);
    const sw = acts.find((a) => a.type === 'swap' && a.x === x && a.y === y);
    if (sw) return tapAction(sw);
    const st = acts.find((a) => a.type === 'step' && a.x === x && a.y === y);
    if (st) return tapAction(st);
    const u = unitAt(s, x, y);
    sel = null;
    refresh();
    if (u) {
      const [n, d] = INFO[u.k];
      let extra = '';
      if (u.rest && !u.it) extra = ' <b>Resting this turn.</b>';
      if (isEnemy(u) && u.hp > 1) extra += ` <b>${u.hp} hearts left.</b>`;
      if (p.cd === 0 && !sw) extra += ' Not in a clear line from you.';
      setInfo(u.k, n, d + extra);
      view.setOverlay({ ...view.overlay, focus: [x, y] });
      sfx('tap');
    }
  }

  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
    view.poke();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > 24) return;
    const cell = view.cellAt(e.clientX, e.clientY);
    if (cell) onTap(cell);
  });

  async function commit(a) {
    sel = null;
    mode = null;
    view.setOverlay({});
    const s = S();
    let res;
    if (isTrial) {
      history.push(clone(trial));
      res = step(s, a);
      trial.turns++;
    } else {
      res = playTurn(run, a);
      if (run.over) finishRun(run, opts.slot);
      else saveRun(opts.slot, run);
    }
    const killsNow = res.ev.filter((e) => (e.t === 'die' || e.t === 'sink') && e.id !== 0).length;
    const final = clone(S());
    buildBar();
    setInfo(null, '', '');
    await view.play(res.ev, final, {
      haptics: db.settings.haptics,
      afterAttacks: async () => {
        if (killsNow >= 2) {
          sfx('combo', killsNow);
          const p = wisp(final);
          view.popup(p.x, p.y - 0.4, killsNow === 2 ? 'Double!' : killsNow === 3 ? 'Triple!' : `${killsNow}× combo!`, '#ffe08a');
          buzz([15, 40, 15]);
        }
        if (!isTrial && res.pts) {
          const p = wisp(final);
          view.popup(p.x, p.y - (killsNow >= 2 ? 0.05 : 0.4), `+${res.pts}`, '#ffd08a');
          scoreEl.textContent = `${fmt(run.score)} lights`;
          scoreEl.classList.remove('bump');
          void scoreEl.offsetWidth;
          scoreEl.classList.add('bump');
        }
      },
    });
    if (!alive) return;
    if (isTrial) return afterTrialTurn(res);
    afterRunTurn(res);
  }

  function banner(text, small) {
    const b = el('div', { class: 'banner' }, text, small ? el('small', {}, small) : null);
    stage.append(b);
    setTimeout(() => b.remove(), 1900);
  }

  function afterRunTurn(res) {
    if (res.hurt > 0) buzz([30, 30, 30]);
    if (run.over === 'lost') {
      sfx('lost');
      view.snuff(wisp(run.state).id).then(() => setTimeout(() => endSheet(), 300));
      refresh();
      return;
    }
    if (res.outcome === 'won') {
      sfx('clear');
      const done = run.over === 'won';
      banner(done ? 'Dawn' : `${HOUR_NAMES[run.depth - 1]} is over`, res.flawless ? `Unseen! +${res.clearBonus}` : `+${res.clearBonus}`);
      refresh();
      if (done) {
        setTimeout(() => {
          sfx('dawn');
          endSheet();
        }, 1500);
      } else setTimeout(() => boonSheet(), 1500);
      return;
    }
    refresh();
  }

  function boonSheet() {
    if (!alive) return;
    sheet(
      (box, close) => {
        const heal = run.moon >= 3 || run.hp >= run.mhp ? '' : ' You also heal one heart.';
        box.append(el('h2', {}, `${HOUR_NAMES[run.depth]} approaches`), el('p', { class: 'lead' }, `Choose a gift of the marsh.${heal}`));
        const cards = el('div', { class: 'cards' });
        for (const id of run.offers || []) {
          const B = BOONS[id];
          cards.append(
            el(
              'button',
              {
                class: 'card',
                onclick: () => {
                  close();
                  sfx('boon');
                  chooseBoon(run, id);
                  saveRun(opts.slot, run);
                  nextHour();
                },
              },
              el('div', { class: 'ico', html: ICONS[B.icon] }),
              el('div', {}, el('div', { class: 'nm' }, B.name), el('div', { class: 'ds' }, B.text)),
            ),
          );
        }
        box.append(cards);
      },
      { dismiss: false },
    );
  }

  function nextHour() {
    view.setState(run.state, run.depth * 7919 + (run.seed.length || 1));
    fit();
    view.fadeIn();
    sel = null;
    refresh();
    banner(HOUR_NAMES[run.depth - 1], run.depth === HOURS ? 'The Witchfinder comes' : THEMES[run.state.theme]?.name || `Hour ${run.depth} of ${HOURS}`);
    introduceKinds();
  }

  function introduceKinds() {
    const s = S();
    const fresh = [...new Set(s.u.map((u) => u.k))].filter((k) => k !== 'wisp' && !db.seen[`kind:${k}`]);
    if (!fresh.length) return;
    const k = fresh[0];
    markSeen(`kind:${k}`);
    setTimeout(() => {
      if (!alive) return;
      sheet(
        (box, close) => {
          const [n, d] = INFO[k];
          box.append(
            el('h3', {}, k === 'gas' ? 'Something in the marsh' : k === 'finder' ? 'The last hour' : 'A new hunter'),
            el('div', { class: 'beast' }, unitIcon(k, 48), el('div', {}, el('div', { class: 'nm' }, n), el('div', { class: 'ds' }, d))),
            el('div', { class: 'btns' }, el('button', { class: 'btn primary', onclick: close }, 'Got it')),
          );
        },
        { center: true, onClose: () => fresh.length > 1 && introduceKinds() },
      );
    }, 900);
  }

  function endSheet() {
    if (!alive) return;
    const won = run.over === 'won';
    const killed = run.kills;
    sheet(
      (box, close) => {
        box.append(
          el('h2', {}, won ? 'Dawn breaks' : `Caught at ${HOUR_NAMES[run.depth - 1]}`),
          el('p', { class: 'lead' }, won ? 'The hunters trudge home, muddy and ashamed. The marsh is quiet again.' : 'The lantern light closes in. The marsh will wait for another night.'),
          el(
            'div',
            { class: 'stats' },
            el('div', {}, el('b', {}, fmt(run.score)), el('span', {}, 'Lights')),
            el('div', {}, el('b', {}, String(killed)), el('span', {}, 'Felled')),
            el('div', {}, el('b', {}, String(run.drowned)), el('span', {}, 'In the bog')),
          ),
        );
        if (run.hourLog.length) box.append(el('p', { class: 'marks', title: 'Each hour: sparkle = no hits, candle = one hit, flame = more' }, hourMarks(run)));
        if (won && run.moon < 5) box.append(el('p', {}, `A brighter moon rises: ${MOONS[Math.min(5, run.moon + 1)].name} is open on the home screen.`));
        const btns = el('div', { class: 'btns' });
        if (run.daily) {
          btns.append(
            el(
              'button',
              {
                class: 'btn',
                onclick: async () => {
                  const text = shareText(run.daily, db.daily[run.daily]?.first);
                  try {
                    if (navigator.share) await navigator.share({ text });
                    else {
                      await navigator.clipboard.writeText(text);
                      toast('Copied.');
                    }
                  } catch {}
                },
              },
              'Share result',
            ),
          );
        } else {
          btns.append(
            el(
              'button',
              {
                class: 'btn primary',
                onclick: () => {
                  close();
                  const r = newRun({ moon: run.moon });
                  saveRun('main', r);
                  go(Play, { mode: 'run', slot: 'main' });
                },
              },
              'Another night',
            ),
          );
        }
        btns.append(
          el(
            'button',
            {
              class: 'btn',
              onclick: () => {
                close();
                go(Home);
              },
            },
            'Home',
          ),
        );
        box.append(btns);
      },
      { dismiss: false },
    );
  }

  function afterTrialTurn(res) {
    const s = trial.s;
    const p = wisp(s);
    if (res.ev.some((e) => e.t === 'hurt')) {
      trial.failed = 'You were hit';
      sfx('lost');
    } else if (enemies(s).length === 0) {
      const first = !db.trials[tdef.id];
      db.trials[tdef.id] = { stars: 1, at: Date.now() };
      persist();
      sfx('clear');
      banner('Solved', first ? null : null);
      setTimeout(() => trialDone(first), 1100);
    } else if (trial.turns >= tdef.turns) {
      trial.failed = `Out of turns`;
      sfx('lost');
    }
    void p;
    refresh();
  }

  function trialDone() {
    if (!alive) return;
    const idx = TRIALS.indexOf(tdef);
    const next = TRIALS[idx + 1];
    sheet(
      (box, close) => {
        box.append(el('h2', {}, 'Solved'), el('p', { class: 'lead' }, tdef.after || 'The marsh is quiet.'));
        const btns = el('div', { class: 'btns' });
        if (next)
          btns.append(
            el(
              'button',
              {
                class: 'btn primary',
                onclick: () => {
                  close();
                  go(Play, { mode: 'trial', id: next.id });
                },
              },
              next.chapter !== tdef.chapter ? `Next: ${CHAPTERS[next.chapter].name}` : 'Next trial',
            ),
          );
        if (tdef.chapter === 0 && (!next || next.chapter !== 0)) {
          btns.prepend(
            el(
              'button',
              {
                class: 'btn warm',
                onclick: () => {
                  close();
                  const main = loadRun('main');
                  if (!main) saveRun('main', newRun({}));
                  go(Play, { mode: 'run', slot: 'main' });
                },
              },
              'Start your first night',
            ),
          );
        }
        btns.append(
          el(
            'button',
            {
              class: 'btn',
              onclick: () => {
                close();
                go(TrialList);
              },
            },
            'All trials',
          ),
        );
        box.append(btns);
      },
      { dismiss: false },
    );
  }

  const solved = () => isTrial && enemies(trial.s).length === 0;

  function undo() {
    if (view.busy || !history.length || solved()) return;
    trial = history.pop();
    view.setState(trial.s, 11);
    fit();
    sel = null;
    refresh();
  }

  function restart() {
    if (view.busy || solved()) return;
    history = [];
    trial = { s: loadTrial(tdef), turns: 0, failed: null };
    view.setState(trial.s, 11);
    fit();
    sel = null;
    refresh();
  }

  function hint() {
    const sol = trial.failed ? null : solve(trial.s, tdef.turns - trial.turns);
    if (!sol) {
      toast('No way out from here. Undo or restart.');
      return;
    }
    sel = null;
    tapAction(sol[0], true);
  }

  function pause() {
    sheet((box, close) => {
      box.append(el('h2', {}, isTrial ? `Trial ${tdef.label}` : HOUR_NAMES[run.depth - 1]));
      const btns = el('div', { class: 'btns' });
      btns.append(el('button', { class: 'btn primary', onclick: close }, 'Resume'));
      if (isTrial)
        btns.append(
          el(
            'button',
            {
              class: 'btn',
              onclick: () => {
                close();
                hint();
              },
            },
            'Show me a move',
          ),
        );
      btns.append(
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              close();
              almanac();
            },
          },
          'How to play',
        ),
      );
      btns.append(
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              close();
              settings(() => refresh());
            },
          },
          'Settings',
        ),
      );
      if (!isTrial)
        btns.append(
          el(
            'button',
            {
              class: 'btn danger',
              onclick: () => {
                close();
                sheet(
                  (b2, c2) => {
                    b2.append(
                      el('h2', {}, 'Give up this night?'),
                      el('p', {}, 'Your lights so far count as final.'),
                      el(
                        'div',
                        { class: 'btns' },
                        el(
                          'button',
                          {
                            class: 'btn warm',
                            onclick: () => {
                              c2();
                              finishRun(run, opts.slot, true);
                              go(Home);
                            },
                          },
                          'Give up',
                        ),
                        el('button', { class: 'btn', onclick: c2 }, 'Keep going'),
                      ),
                    );
                  },
                  { center: true },
                );
              },
            },
            'Give up this night',
          ),
        );
      btns.append(
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              close();
              go(isTrial ? TrialList : Home);
            },
          },
          isTrial ? 'All trials' : 'Home (saves the night)',
        ),
      );
      box.append(btns);
    });
  }

  const onExt = () => {
    if (isTrial || view.busy) return;
    const r = loadRun(opts.slot);
    if (!r || r.seed !== run.seed || r.started !== run.started) return go(Home);
    if (r.turns > run.turns || (r.turns === run.turns && !!r.offers !== !!run.offers)) {
      run = r;
      sel = null;
      mode = null;
      view.setState(run.state, run.depth * 7919 + (run.seed.length || 1));
      fit();
      refresh();
    }
  };
  const offExt = onExternalChange(onExt);

  const onKey = (e) => {
    if ($sheets.children.length || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const s = S();
    const p = wisp(s);
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    if (dirs[e.key]) {
      e.preventDefault();
      const [dx, dy] = dirs[e.key];
      onTap([p.x + dx, p.y + dy]);
    } else if (e.key === ' ' || e.key === '.') {
      e.preventDefault();
      tapAction({ type: 'wait' });
    } else if (e.key === 'Escape') {
      sel = null;
      mode = null;
      refresh();
    } else if (e.key === 'Enter' && sel && !locked()) {
      commit(sel.a);
    } else if (e.key === 'z' && isTrial) undo();
  };
  window.addEventListener('keydown', onKey);

  view.setState(S(), isTrial ? 11 : run.depth * 7919 + (run.seed.length || 1));
  fit();
  requestAnimationFrame(fit);
  refresh();
  if (!isTrial) {
    if (run.offers) setTimeout(boonSheet, 200);
    else if (run.over) setTimeout(endSheet, 200);
    else introduceKinds();
  }

  return {
    destroy() {
      alive = false;
      view.stop();
      offExt();
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
    },
  };
}

function hourMarks(run) {
  return run.hourLog.map((h) => (h.hurt === 0 ? '✨' : h.hurt === 1 ? '🕯️' : '🔥')).join(' ');
}

function shareText(day, f) {
  if (!f) return `Marshlight · ${day}`;
  const end = f.won ? 'Survived until dawn' : `Caught at ${HOUR_NAMES[f.hour - 1]}`;
  return `Marshlight · ${day}\n${end} · ${fmt(f.score)} lights\n${(f.marks || '').replace(/ /g, '')}\n${f.kills ?? '?'} hunters felled, ${f.drowned ?? '?'} in the bog`;
}

/* ------------------------------------------------------------------ */

function TrialList() {
  const scr = el('section', { class: 'screen list-screen' });
  scr.append(el('div', { class: 'list-head' }, el('button', { class: 'icon-btn', 'aria-label': 'Back', html: ICONS.back, onclick: () => go(Home) }), el('h1', {}, 'Trials')));
  const body = el('div', { class: 'list-body' });
  body.append(el('p', { class: 'subtitle', style: 'margin:0;max-width:none;text-align:left' }, 'Clear the marsh in the given number of turns. No hits allowed. Undo freely.'));
  CHAPTERS.forEach((ch, ci) => {
    const list = TRIALS.filter((t) => t.chapter === ci);
    if (!list.length) return;
    const done = list.filter((t) => db.trials[t.id]).length;
    const prevDone = ci === 0 || TRIALS.filter((t) => t.chapter === ci - 1).filter((t) => db.trials[t.id]).length >= Math.ceil(TRIALS.filter((t) => t.chapter === ci - 1).length / 2);
    const open = prevDone || db.settings.unlockAll;
    const sec = el('div', { class: 'chapter' }, el('h2', {}, ch.name), el('p', {}, `${open ? ch.text : 'Solve half of the chapter before this one to open it.'} · ${done}/${list.length}`));
    const tiles = el('div', { class: 'tiles' });
    for (const t of list) {
      const solved = !!db.trials[t.id];
      tiles.append(
        el(
          'button',
          {
            class: `tile${solved ? ' done' : ''}${open ? '' : ' locked'}`,
            disabled: !open,
            'aria-label': `Trial ${t.label}${solved ? ', solved' : ''}`,
            onclick: () => go(Play, { mode: 'trial', id: t.id }),
          },
          t.label.split('-')[1],
          el('small', {}, `${t.turns} turn${t.turns === 1 ? '' : 's'}`),
        ),
      );
    }
    sec.append(tiles);
    body.append(sec);
  });
  scr.append(body);
  $app.append(scr);
}

/* ------------------------------------------------------------------ */

function almanac() {
  sheet((box, close) => {
    box.append(
      el('h2', {}, 'Almanac'),
      el('p', { class: 'lead' }, 'Notes on surviving a night in the marsh.'),
      el('h3', {}, 'Rules'),
      el(
        'ol',
        { class: 'rules' },
        el('li', { html: '<b>You cannot attack.</b> Hunters can. Make them hurt each other.' }),
        el('li', { html: '<b>Red cells</b> show where each hunter strikes after your move. All attacks land at the same time.' }),
        el('li', { html: 'Each turn, <b>drift</b> one cell (up, down, left, right), or <b>swap</b> places with the first thing in any of the 8 straight lines.' }),
        el('li', { html: 'A swapped hunter <b>keeps aiming the same way</b>. Put him where the others strike, or turn his attack onto them.' }),
        el('li', { html: 'You <b>float over bog</b>. Hunters do not. Swap a hunter onto bog and he sinks.' }),
        el('li', { html: 'After a swap you <b>rest one turn</b>: you can only drift or wait.' }),
        el('li', { html: '<b>Marsh gas</b> bursts when hit and hurts all 8 cells around it.' }),
        el('li', { html: 'When <b>one hunter</b> is left, he runs away and the hour ends.' }),
        el('li', { html: 'Survive <b>nine hours</b>, from 9 PM until dawn. Between hours, choose a gift.' }),
      ),
      el('h3', {}, 'Tips'),
      el('p', { html: 'Tap a cell once to see what will happen. Tap it again to do it. Skulls show who falls. A red number shows the hits you take.' }),
      el('p', { html: 'Two hunters who aim at you from opposite sides are a gift: swap with one, and they strike each other.' }),
      el('h3', {}, 'Who walks the marsh'),
    );
    const list = el('div', { class: 'bestiary' });
    for (const k of KIND_ORDER) {
      const known = db.seen[`kind:${k}`] || k === 'fork' || k === 'gas';
      const [n, d] = INFO[k];
      list.append(el('div', { class: `beast${known ? '' : ' unknown'}` }, unitIcon(k, 48), el('div', {}, el('div', { class: 'nm' }, known ? n : '???'), el('div', { class: 'ds' }, known ? d : 'Not met yet.'))));
    }
    box.append(list, el('div', { class: 'btns' }, el('button', { class: 'btn primary', onclick: close }, 'Close')));
  });
}

function settings(after) {
  sheet(
    (box, close) => {
      box.append(el('h2', {}, 'Settings'));
      const opt = (key, label, sub) => {
        const sw = el('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!db.settings[key]), 'aria-label': label });
        sw.addEventListener('click', () => {
          db.settings[key] = !db.settings[key];
          sw.setAttribute('aria-checked', String(!!db.settings[key]));
          touchSettings();
          if (key === 'sound' && db.settings.sound) sfx('select');
        });
        return el('div', { class: 'toggle' }, el('div', { class: 'l' }, label, sub ? el('small', {}, sub) : null), sw);
      };
      box.append(
        opt('confirm', 'Tap twice to move', 'First tap shows what happens. Good for bumpy flights.'),
        opt('hints', 'Show possible moves', 'Dots for drifts, rings for swaps.'),
        opt('sound', 'Sound'),
        opt('ambient', 'Night sounds', 'Quiet crickets and frogs while you play.'),
        opt('haptics', 'Vibration'),
        opt('unlockAll', 'Open all trials'),
      );
      box.append(
        el(
          'div',
          { class: 'btns' },
          el('button', { class: 'btn primary', onclick: close }, 'Done'),
          el(
            'button',
            {
              class: 'btn small ghost danger',
              onclick: () => {
                sheet(
                  (b2, c2) => {
                    b2.append(
                      el('h2', {}, 'Erase all progress?'),
                      el('p', {}, 'Nights, records and solved trials are deleted. Settings stay.'),
                      el(
                        'div',
                        { class: 'btns' },
                        el(
                          'button',
                          {
                            class: 'btn warm',
                            onclick: () => {
                              resetAll();
                              closeSheets();
                              go(Home);
                            },
                          },
                          'Erase',
                        ),
                        el('button', { class: 'btn', onclick: c2 }, 'Cancel'),
                      ),
                    );
                  },
                  { center: true },
                );
              },
            },
            'Erase progress',
          ),
        ),
      );
    },
    { onClose: after },
  );
}

/* ------------------------------------------------------------------ */

window.addEventListener('popstate', () => go(Home));

initPWA({ onUpdate: () => toast('Marshlight was updated.', 12000, { label: 'Reload', run: () => location.reload() }) });
document.fonts?.ready.then(() => current?.refresh?.());
go(Home);
