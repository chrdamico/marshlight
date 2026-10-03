import { sprite, terrainCanvas } from './sprites.js';
import { intentCells, DIRS, BOG, KINDS, isEnemy } from './engine.js';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;
const ATTACKS = new Set(['strike', 'shoot', 'beam', 'charge', 'throw']);

const LIGHT = {
  wisp: { r: 2.6, col: [140, 230, 255] },
  gas: { r: 1.0, col: [150, 255, 120] },
  priest: { r: 2.0, col: [255, 214, 120] },
  default: { r: 1.5, col: [255, 170, 90] },
};

export class BoardView {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.lg = this.light.getContext('2d');
    this.units = new Map();
    this.fx = [];
    this.parts = [];
    this.tweens = [];
    this.overlay = {};
    this.state = null;
    this.cell = 48;
    this.dpr = 1;
    this.shake = 0;
    this.busy = false;
    this.showIntents = true;
    this.raf = 0;
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sfx = () => {};
    this.frame = this.frame.bind(this);
    this.onVis = () => this.kick();
    document.addEventListener('visibilitychange', this.onVis);
  }

  stop() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.idleT);
    document.removeEventListener('visibilitychange', this.onVis);
    for (const tw of this.tweens) tw.resolve();
    this.tweens = [];
  }

  setState(s, seed = 0) {
    this.state = s;
    if (this.seed !== seed || !this.terrain || this.terrainFor !== s.t.join('')) {
      this.terrain = terrainCanvas(s, seed);
      this.seed = seed;
      this.terrainFor = s.t.join('');
    }
    this.units.clear();
    for (const u of s.u) this.units.set(u.id, this.toView(u));
    this.fx = [];
    this.parts = [];
    this.showIntents = true;
    this.kick();
  }

  toView(u, prev) {
    return {
      id: u.id,
      k: u.k,
      x: u.x,
      y: u.y,
      hp: u.hp,
      mhp: u.mhp || KINDS[u.k].hp,
      cd: u.cd,
      it: u.it,
      flip: prev ? prev.flip : u.x > (this.state ? this.state.w / 2 : 3),
      alpha: u.hp > 0 || u.k === 'wisp' ? 1 : 0.55,
      dy: 0,
      ox: 0,
      oy: 0,
      flash: 0,
      sink: u.hp > 0 ? 0 : 0.35,
      phase: (u.id * 0.37) % 1,
    };
  }

  sync(s) {
    if (this.terrainFor !== s.t.join('')) {
      this.terrain = terrainCanvas(s, this.seed);
      this.terrainFor = s.t.join('');
    }
    this.state = s;
    const seen = new Set();
    for (const u of s.u) {
      seen.add(u.id);
      const v = this.units.get(u.id);
      if (!v) {
        this.units.set(u.id, this.toView(u));
        continue;
      }
      Object.assign(v, { x: u.x, y: u.y, hp: u.hp, cd: u.cd, it: u.it, mhp: u.mhp || v.mhp, alpha: 1, dy: 0, ox: 0, oy: 0, sink: 0 });
      if (u.it) v.flip = this.faceLeft(u, v.flip);
    }
    for (const id of [...this.units.keys()]) if (!seen.has(id)) this.units.delete(id);
    this.kick();
  }

  faceLeft(u, cur) {
    if (u.it && u.it.d != null) {
      const dx = DIRS[u.it.d][0];
      return dx < 0 ? true : dx > 0 ? false : cur;
    }
    if (u.it && u.it.x != null) return u.it.x < u.x ? true : u.it.x > u.x ? false : cur;
    return cur;
  }

  layout(cssW, cssH) {
    if (!this.state) return;
    const s = this.state;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    const cellCss = Math.min(cssW / s.w, cssH / s.h, 76);
    let cell = this.dpr >= 2 ? Math.floor(cellCss * this.dpr) : Math.floor((cellCss * this.dpr) / 16) * 16;
    if (cell < 16) cell = Math.max(8, Math.floor(cellCss * this.dpr));
    this.cell = cell;
    if (this.c.width !== s.w * cell || this.c.height !== s.h * cell) {
      this.c.width = s.w * cell;
      this.c.height = s.h * cell;
      this.light.width = this.c.width;
      this.light.height = this.c.height;
    }
    this.c.style.width = `${(s.w * cell) / this.dpr}px`;
    this.c.style.height = `${(s.h * cell) / this.dpr}px`;
    this.draw(performance.now());
    this.kick();
  }

  cellAt(clientX, clientY) {
    if (!this.state) return null;
    const r = this.c.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * this.state.w);
    const y = Math.floor(((clientY - r.top) / r.height) * this.state.h);
    if (x < 0 || y < 0 || x >= this.state.w || y >= this.state.h) return null;
    return [x, y];
  }

  setOverlay(o) {
    this.overlay = o || {};
    this.kick();
  }

  kick() {
    if (!this.dead && !this.raf && document.visibilityState !== 'hidden') this.raf = requestAnimationFrame(this.frame);
  }

  tween(dur, fn) {
    if (this.reduce) dur = Math.min(dur, 90);
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now(), dur, fn, resolve });
      this.kick();
    });
  }

  wait(ms) {
    return this.tween(ms, () => {});
  }

  burst(x, y, n, col, speed = 2.4, life = 600, size = 0.06) {
    if (this.reduce) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * speed;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, life, born: performance.now(), col, size: size * (0.6 + Math.random() * 0.8) });
    }
    this.kick();
  }

  popup(x, y, text, col = '#fff') {
    const born = performance.now();
    this.fx.push({
      until: born + 1100,
      draw: (g, now) => {
        const t = (now - born) / 1100;
        const C = this.cell;
        g.save();
        g.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        g.font = `800 ${Math.round(C * 0.3)}px Nunito, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.lineWidth = C * 0.07;
        g.strokeStyle = 'rgba(10,8,20,0.85)';
        g.fillStyle = col;
        const py = (y + 0.2 - easeOut(Math.min(1, t * 1.6)) * 0.55) * C;
        g.strokeText(text, (x + 0.5) * C, py);
        g.fillText(text, (x + 0.5) * C, py);
        g.restore();
      },
    });
    this.kick();
  }

  frame(now) {
    this.raf = 0;
    this.now = now;
    for (const tw of [...this.tweens]) {
      const t = Math.min(1, (now - tw.start) / tw.dur);
      tw.fn(t);
      if (t >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.resolve();
      }
    }
    this.fx = this.fx.filter((f) => f.until > now);
    this.parts = this.parts.filter((p) => now - p.born < p.life);
    this.draw(now);
    const active = this.tweens.length || this.fx.length || this.parts.length || this.shake > 0.01;
    if (document.visibilityState === 'hidden') return;
    if (active) this.raf = requestAnimationFrame(this.frame);
    else if (!this.reduce) {
      clearTimeout(this.idleT);
      this.idleT = setTimeout(() => this.kick(), 90);
    }
  }

  draw(now) {
    const s = this.state;
    if (!s || !this.terrain) return;
    const g = this.g;
    const C = this.cell;
    const W = this.c.width;
    const H = this.c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    if (this.shake > 0.01) {
      g.translate((Math.random() - 0.5) * this.shake * C * 0.12, (Math.random() - 0.5) * this.shake * C * 0.12);
      this.shake *= 0.86;
    }
    g.imageSmoothingEnabled = false;
    g.drawImage(this.terrain, 0, 0, s.w * C, s.h * C);
    this.drawWater(g, now);
    this.drawGrid(g);
    const o = this.overlay;
    const view = o.preview ? o.preview.state : s;
    const viewUnits = o.preview ? o.preview.state.u.map((u) => ({ ...this.toView(u, this.units.get(u.id)), flip: this.faceLeft(u, this.units.get(u.id)?.flip ?? false) })) : [...this.units.values()];
    this.drawLights(g, viewUnits, now);
    if (this.showIntents) this.drawThreatTiles(g, view, now);
    this.drawHints(g, now);
    const sorted = viewUnits.slice().sort((a, b) => a.y - b.y || (a.k === 'wisp') - (b.k === 'wisp'));
    for (const v of sorted) this.drawShadow(g, v, now);
    for (const v of sorted) this.drawUnit(g, v, now, o.preview);
    this.drawGlows(g, viewUnits, now);
    if (this.showIntents) this.drawIntentMarks(g, view, now);
    for (const f of this.fx) f.draw(g, now);
    this.drawParticles(g, now);
    this.drawPreviewMarks(g, now);
  }

  drawWater(g, now) {
    const s = this.state;
    const C = this.cell;
    const k = C / 16;
    if (this.reduce) return;
    g.fillStyle = 'rgba(120,200,220,0.22)';
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        if (s.t[y * s.w + x] !== BOG) continue;
        for (let i = 0; i < 3; i++) {
          const ph = (now / 2600 + ((x * 7 + y * 13 + i * 5) % 11) / 11) % 1;
          const px = (x * 16 + ((x * 5 + y * 3 + i * 6) % 13) + 1) * k;
          const py = (y * 16 + 2 + ((i * 5 + x + y * 2) % 12)) * k;
          const a = Math.sin(ph * Math.PI);
          g.globalAlpha = a * 0.9;
          g.fillRect(px + ph * 3 * k, py, k * 2, k);
        }
      }
    }
    g.globalAlpha = 1;
  }

  drawGrid(g) {
    const s = this.state;
    const C = this.cell;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    const t = Math.max(1, Math.round(C / 48));
    for (let x = 1; x < s.w; x++) g.fillRect(x * C - (t >> 1), 0, t, s.h * C);
    for (let y = 1; y < s.h; y++) g.fillRect(0, y * C - (t >> 1), s.w * C, t);
  }

  lightsOf(units) {
    const out = [];
    for (const v of units) {
      if (v.alpha <= 0.02) continue;
      const L = LIGHT[v.k] || LIGHT.default;
      let r = L.r;
      if (v.k === 'wisp' && v.cd > 0) r *= 0.8;
      out.push({ x: v.x + 0.5 + v.ox, y: v.y + 0.45 + v.oy, r, col: L.col, a: v.alpha, k: v.k });
    }
    return out;
  }

  drawLights(g, units, now) {
    const C = this.cell;
    const lg = this.lg;
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, this.light.width, this.light.height);
    lg.fillStyle = 'rgba(3,5,16,0.52)';
    lg.fillRect(0, 0, this.light.width, this.light.height);
    lg.globalCompositeOperation = 'destination-out';
    const s = this.state;
    lg.fillStyle = 'rgba(0,0,0,0.42)';
    for (let i = 0; i < s.t.length; i++) if (s.t[i] === BOG) lg.fillRect((i % s.w) * C, Math.floor(i / s.w) * C, C, C);
    for (const L of this.lightsOf(units)) {
      const flick = L.k === 'wisp' ? 1 + Math.sin(now / 240) * 0.04 : 1 + Math.sin(now / 130 + L.x * 3) * 0.03;
      const r = L.r * C * flick;
      const grd = lg.createRadialGradient(L.x * C, L.y * C, 0, L.x * C, L.y * C, r);
      grd.addColorStop(0, `rgba(0,0,0,${0.95 * L.a})`);
      grd.addColorStop(0.55, `rgba(0,0,0,${0.55 * L.a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = grd;
      lg.fillRect(L.x * C - r, L.y * C - r, r * 2, r * 2);
    }
    g.drawImage(this.light, 0, 0);
  }

  drawGlows(g, units, now) {
    const C = this.cell;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const L of this.lightsOf(units)) {
      const r = L.r * C * 0.75;
      const [cr, cg, cb] = L.col;
      const a = (L.k === 'wisp' ? 0.2 : 0.09) * L.a * (1 + Math.sin(now / 300 + L.x) * 0.15);
      const grd = g.createRadialGradient(L.x * C, L.y * C, 0, L.x * C, L.y * C, r);
      grd.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
      grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = grd;
      g.fillRect(L.x * C - r, L.y * C - r, r * 2, r * 2);
    }
    g.restore();
  }

  intents(s) {
    const out = [];
    for (const e of s.u) {
      if (!isEnemy(e) || !e.it || e.hp <= 0) continue;
      out.push({ e, it: e.it, cells: intentCells(s, e) });
    }
    return out;
  }

  drawThreatTiles(g, s, now) {
    const C = this.cell;
    const count = new Map();
    for (const { cells } of this.intents(s)) for (const [x, y] of cells) count.set(y * s.w + x, (count.get(y * s.w + x) || 0) + 1);
    const pulse = 0.5 + Math.sin(now / 220) * 0.5;
    const wp = s.u.find((u) => u.k === 'wisp');
    for (const [i, n] of count) {
      const x = i % s.w;
      const y = Math.floor(i / s.w);
      const onWisp = wp && wp.x === x && wp.y === y;
      g.fillStyle = `rgba(255,72,48,${Math.min(0.5, 0.2 + n * 0.08) + (onWisp ? pulse * 0.15 : 0)})`;
      g.fillRect(x * C, y * C, C, C);
      g.strokeStyle = 'rgba(255,120,90,0.55)';
      g.lineWidth = Math.max(1, C / 32);
      const m = C * 0.08;
      const l = C * 0.22;
      g.beginPath();
      for (const [cx, cy, sx, sy] of [
        [x * C + m, y * C + m, 1, 1],
        [(x + 1) * C - m, y * C + m, -1, 1],
        [x * C + m, (y + 1) * C - m, 1, -1],
        [(x + 1) * C - m, (y + 1) * C - m, -1, -1],
      ]) {
        g.moveTo(cx + sx * l, cy);
        g.lineTo(cx, cy);
        g.lineTo(cx, cy + sy * l);
      }
      g.stroke();
    }
  }

  drawIntentMarks(g, s, now) {
    const C = this.cell;
    const dash = (now / 40) % (C * 0.3);
    for (const { e, it, cells } of this.intents(s)) {
      const ex = (e.x + 0.5) * C;
      const ey = (e.y + 0.5) * C;
      g.save();
      g.lineCap = 'round';
      if (it.type === 'shoot' || it.type === 'beam' || it.type === 'charge') {
        const last = cells[cells.length - 1];
        if (!last) {
          g.restore();
          continue;
        }
        const [dx, dy] = DIRS[it.d];
        const tx = (last[0] + 0.5) * C;
        const ty = (last[1] + 0.5) * C;
        const col = it.type === 'beam' ? '255,226,140' : it.type === 'charge' ? '255,140,90' : '255,110,80';
        g.strokeStyle = `rgba(${col},0.85)`;
        g.lineWidth = Math.max(2, C * (it.type === 'beam' ? 0.07 : 0.045));
        g.setLineDash(it.type === 'charge' ? [C * 0.12, C * 0.18] : it.type === 'shoot' ? [C * 0.2, C * 0.1] : []);
        g.lineDashOffset = -dash;
        g.beginPath();
        g.moveTo(ex + dx * C * 0.35, ey + dy * C * 0.35);
        g.lineTo(tx - dx * C * 0.12, ty - dy * C * 0.12);
        g.stroke();
        g.setLineDash([]);
        this.arrowHead(g, tx + dx * C * 0.08, ty + dy * C * 0.08, dx, dy, C * 0.17, `rgba(${col},0.95)`);
      } else if (it.type === 'strike' || it.type === 'cleave') {
        const [dx, dy] = DIRS[it.d];
        this.arrowHead(g, ex + dx * C * 0.5, ey + dy * C * 0.5, dx, dy, C * 0.16, 'rgba(255,110,80,0.95)');
        g.strokeStyle = 'rgba(255,200,180,0.8)';
        g.lineWidth = Math.max(2, C * 0.05);
        const a = Math.atan2(dy, dx);
        for (const [cx, cy] of cells) {
          const tx = (cx + 0.5) * C;
          const ty = (cy + 0.5) * C;
          g.beginPath();
          g.arc(tx, ty, C * 0.26, a - 2.1, a - 1.0);
          g.stroke();
          g.beginPath();
          g.arc(tx, ty, C * 0.26, a + 1.0, a + 2.1);
          g.stroke();
        }
      } else if (it.type === 'throw') {
        const tx = (it.x + 0.5) * C;
        const ty = (it.y + 0.5) * C;
        g.strokeStyle = 'rgba(200,150,255,0.7)';
        g.lineWidth = Math.max(1.5, C * 0.035);
        g.setLineDash([C * 0.08, C * 0.1]);
        g.lineDashOffset = -dash;
        g.beginPath();
        g.moveTo(ex, ey - C * 0.3);
        g.quadraticCurveTo((ex + tx) / 2, Math.min(ey, ty) - C * 1.2, tx, ty);
        g.stroke();
        g.setLineDash([]);
        g.strokeStyle = 'rgba(220,170,255,0.95)';
        g.lineWidth = Math.max(2, C * 0.05);
        g.beginPath();
        g.arc(tx, ty, C * 0.22, 0, Math.PI * 2);
        g.moveTo(tx - C * 0.34, ty);
        g.lineTo(tx - C * 0.12, ty);
        g.moveTo(tx + C * 0.12, ty);
        g.lineTo(tx + C * 0.34, ty);
        g.moveTo(tx, ty - C * 0.34);
        g.lineTo(tx, ty - C * 0.12);
        g.moveTo(tx, ty + C * 0.12);
        g.lineTo(tx, ty + C * 0.34);
        g.stroke();
      }
      g.restore();
    }
  }

  arrowHead(g, x, y, dx, dy, size, col) {
    const a = Math.atan2(dy, dx);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
    g.lineTo(x + Math.cos(a + 2.5) * size, y + Math.sin(a + 2.5) * size);
    g.lineTo(x + Math.cos(a - 2.5) * size, y + Math.sin(a - 2.5) * size);
    g.closePath();
    g.fill();
  }

  drawHints(g, now) {
    const o = this.overlay;
    const C = this.cell;
    if (o.preview) return;
    g.save();
    for (const [x, y] of o.steps || []) {
      g.fillStyle = 'rgba(170,240,255,0.5)';
      g.beginPath();
      g.arc((x + 0.5) * C, (y + 0.5) * C, C * 0.07, 0, Math.PI * 2);
      g.fill();
    }
    const pulse = 0.6 + Math.sin(now / 400) * 0.25;
    for (const [x, y] of o.swaps || []) {
      g.strokeStyle = `rgba(150,235,255,${0.55 * pulse})`;
      g.lineWidth = Math.max(1.5, C * 0.035);
      g.setLineDash([C * 0.09, C * 0.07]);
      g.lineDashOffset = -now / 60;
      g.beginPath();
      g.arc((x + 0.5) * C, (y + 0.55) * C, C * 0.44, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  drawPreviewMarks(g, now) {
    const o = this.overlay;
    const C = this.cell;
    if (o.sel) {
      const [x, y] = o.sel;
      g.save();
      g.strokeStyle = 'rgba(200,250,255,0.95)';
      g.lineWidth = Math.max(2, C * 0.05);
      g.setLineDash([C * 0.14, C * 0.08]);
      g.lineDashOffset = -now / 50;
      g.strokeRect(x * C + C * 0.06, y * C + C * 0.06, C * 0.88, C * 0.88);
      g.restore();
    }
    if (o.focus) {
      const [x, y] = o.focus;
      g.save();
      g.strokeStyle = 'rgba(255,230,170,0.9)';
      g.lineWidth = Math.max(2, C * 0.04);
      g.strokeRect(x * C + C * 0.05, y * C + C * 0.05, C * 0.9, C * 0.9);
      g.restore();
    }
    if (!o.preview) return;
    const ps = o.preview.state;
    for (const id of o.preview.dies) {
      const u = ps.u.find((q) => q.id === id);
      if (!u) continue;
      this.skull(g, (u.x + 0.5) * C, (u.y + 0.2) * C, C * 0.2, now);
    }
    for (const id of o.preview.hurtE || []) {
      const u = ps.u.find((q) => q.id === id);
      if (u) this.crack(g, (u.x + 0.5) * C, (u.y + 0.2) * C, C * 0.16);
    }
    const w = ps.u.find((u) => u.k === 'wisp');
    if (w && o.preview.hurt > 0) {
      const x = (w.x + 0.5) * C;
      const y = (w.y + 0.12) * C;
      g.save();
      g.font = `900 ${Math.round(C * 0.32)}px Nunito, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = C * 0.07;
      g.strokeStyle = 'rgba(30,0,0,0.9)';
      g.fillStyle = '#ff6a5a';
      const t = `−${o.preview.hurt}`;
      g.strokeText(t, x, y);
      g.fillText(t, x, y);
      g.restore();
    }
  }

  skull(g, x, y, r, now) {
    g.save();
    const b = 1 + Math.sin(now / 160) * 0.06;
    g.translate(x, y);
    g.scale(b, b);
    g.fillStyle = 'rgba(15,10,20,0.85)';
    g.beginPath();
    g.arc(0, 0, r * 1.25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f4efe6';
    g.beginPath();
    g.arc(0, -r * 0.12, r * 0.78, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-r * 0.45, r * 0.3, r * 0.9, r * 0.45);
    g.fillStyle = '#20141e';
    g.beginPath();
    g.arc(-r * 0.3, -r * 0.1, r * 0.2, 0, Math.PI * 2);
    g.arc(r * 0.3, -r * 0.1, r * 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-r * 0.05, r * 0.38, r * 0.1, r * 0.35);
    g.restore();
  }

  crack(g, x, y, r) {
    g.save();
    g.fillStyle = 'rgba(15,10,20,0.85)';
    g.beginPath();
    g.arc(x, y, r * 1.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffb27a';
    g.lineWidth = r * 0.3;
    g.beginPath();
    g.moveTo(x - r * 0.6, y - r * 0.5);
    g.lineTo(x, y);
    g.lineTo(x - r * 0.2, y + r * 0.6);
    g.moveTo(x, y);
    g.lineTo(x + r * 0.6, y - r * 0.2);
    g.stroke();
    g.restore();
  }

  drawShadow(g, v, now) {
    if (v.alpha <= 0.02 || v.sink > 0) return;
    const C = this.cell;
    const fly = v.k === 'wisp' || v.k === 'witch';
    const s = this.state;
    const onBog = s.t[Math.round(v.y) * s.w + Math.round(v.x)] === BOG;
    g.fillStyle = `rgba(0,0,0,${(fly ? 0.22 : 0.35) * v.alpha})`;
    g.beginPath();
    g.ellipse((v.x + 0.5 + v.ox) * C, (v.y + 0.86 + v.oy) * C, C * (fly ? 0.22 : 0.3), C * (onBog ? 0.06 : 0.09), 0, 0, Math.PI * 2);
    g.fill();
  }

  drawUnit(g, v, now, ghost) {
    if (v.alpha <= 0.01) return;
    const C = this.cell;
    const cx = (v.x + 0.5 + v.ox) * C;
    const cy = (v.y + 0.5 + v.oy) * C;
    g.save();
    g.globalAlpha = v.alpha;
    if (v.sink > 0) {
      g.beginPath();
      g.rect(v.x * C - C, (v.y + 0.82) * C - C * 2, C * 3, C * 2);
      g.clip();
    }
    if (v.k === 'wisp') this.drawWisp(g, cx, cy, v, now);
    else if (v.k === 'gas') this.drawGas(g, cx, cy, v, now);
    else this.drawSprite(g, cx, cy, v, now);
    g.restore();
  }

  drawSprite(g, cx, cy, v, now) {
    const C = this.cell;
    const k = C / 16;
    const bobAmp = v.k === 'witch' ? 1.5 : 0.5;
    const bob = Math.round(Math.sin((now / 1000 + v.phase) * Math.PI * (v.k === 'witch' ? 1.2 : 1.6)) * bobAmp) * k;
    const hover = v.k === 'witch' ? -2 * k : 0;
    const sinkOff = v.sink * C * 0.8;
    const img = sprite(v.k, v.flip);
    const x = Math.round(cx - 9 * k);
    const y = Math.round(cy - 9 * k + bob + hover + v.dy * C + sinkOff - k);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, x, y, 18 * k, 18 * k);
    if (v.flash > 0) {
      g.globalAlpha = v.alpha * v.flash;
      g.drawImage(sprite(v.k, v.flip, '#ffffff'), x, y, 18 * k, 18 * k);
      g.globalAlpha = v.alpha;
    }
    if (v.mhp > 1) {
      for (let i = 0; i < v.mhp; i++) {
        g.fillStyle = i < v.hp ? '#ff7a6a' : 'rgba(40,30,40,0.9)';
        g.strokeStyle = 'rgba(10,6,12,0.9)';
        g.lineWidth = k * 0.6;
        const px = cx + (i - (v.mhp - 1) / 2) * k * 4;
        g.beginPath();
        g.arc(px, cy + C * 0.42, k * 1.4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
    if (v.cd > 0 && v.alpha > 0.5 && !v.it) this.restIcon(g, cx + C * 0.3, cy - C * 0.36, k, now);
  }

  restIcon(g, x, y, k, now) {
    g.save();
    g.globalAlpha *= 0.75 + Math.sin(now / 300) * 0.2;
    g.fillStyle = 'rgba(15,10,25,0.8)';
    g.beginPath();
    g.arc(x, y, k * 3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#cfd8ff';
    g.lineWidth = k * 0.8;
    g.beginPath();
    g.arc(x, y, k * 1.9, 0, Math.PI * 2);
    g.moveTo(x, y);
    g.lineTo(x, y - k * 1.3);
    g.moveTo(x, y);
    g.lineTo(x + k, y + k * 0.4);
    g.stroke();
    g.restore();
  }

  drawWisp(g, cx, cy, v, now) {
    const C = this.cell;
    const tired = v.cd > 0;
    const r = C * (tired ? 0.17 : 0.2);
    const bob = Math.sin(now / 520 + 1) * C * 0.04;
    const y = cy + bob - C * 0.05 + v.dy * C;
    const halo = g.createRadialGradient(cx, y, 0, cx, y, C * 0.55);
    halo.addColorStop(0, `rgba(170,240,255,${tired ? 0.35 : 0.55})`);
    halo.addColorStop(1, 'rgba(170,240,255,0)');
    g.fillStyle = halo;
    g.fillRect(cx - C * 0.6, y - C * 0.6, C * 1.2, C * 1.2);
    const tip = Math.sin(now / 180) * r * 0.35;
    const tip2 = Math.sin(now / 230 + 2) * r * 0.2;
    g.beginPath();
    g.moveTo(-r + cx, y);
    g.arc(cx, y, r, Math.PI, 0, true);
    g.quadraticCurveTo(cx + r * 0.95, y - r * 1.2, cx + tip, y - r * (2.1 + tip2 / r));
    g.quadraticCurveTo(cx - r * 0.95, y - r * 1.1, cx - r, y);
    const body = g.createRadialGradient(cx, y + r * 0.2, r * 0.1, cx, y - r * 0.4, r * 2);
    if (v.flash > 0) {
      body.addColorStop(0, '#fff');
      body.addColorStop(1, '#ff6a6a');
    } else {
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.45, tired ? '#9fd8ea' : '#bff4ff');
      body.addColorStop(1, tired ? 'rgba(80,160,200,0.6)' : 'rgba(90,200,255,0.7)');
    }
    g.fillStyle = body;
    g.fill();
    const blink = (now / 1000 + 0.3) % 4 < 0.12;
    g.fillStyle = '#123040';
    const ex = r * 0.38;
    const eh = blink || tired ? r * 0.08 : r * 0.24;
    const look = this.overlay.look || 0;
    g.beginPath();
    g.ellipse(cx - ex + look * r * 0.15, y + r * 0.05, r * 0.12, eh, 0, 0, Math.PI * 2);
    g.ellipse(cx + ex + look * r * 0.15, y + r * 0.05, r * 0.12, eh, 0, 0, Math.PI * 2);
    g.fill();
    if (v.hp != null && v.mhp) {
      for (let i = 0; i < v.mhp; i++) {
        const px = cx + (i - (v.mhp - 1) / 2) * C * 0.11;
        g.fillStyle = i < v.hp ? 'rgba(190,245,255,0.95)' : 'rgba(60,80,100,0.6)';
        g.beginPath();
        g.arc(px, cy + C * 0.4, C * 0.035, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  drawGas(g, cx, cy, v, now) {
    const C = this.cell;
    const t = now / 1000 + v.phase * 6;
    const blobs = [
      [-0.12, 0.08, 0.17],
      [0.12, 0.1, 0.15],
      [0.0, -0.1, 0.19],
    ];
    for (const [bx, by, br] of blobs) {
      const x = cx + bx * C + Math.sin(t * 1.3 + bx * 9) * C * 0.02;
      const y = cy + by * C + Math.cos(t * 1.1 + by * 7) * C * 0.025 + v.dy * C;
      const r = br * C * (1 + Math.sin(t * 2 + br * 20) * 0.05);
      const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      grd.addColorStop(0, 'rgba(230,255,190,0.85)');
      grd.addColorStop(0.5, 'rgba(150,230,110,0.5)');
      grd.addColorStop(1, 'rgba(90,170,70,0.35)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(210,255,170,0.6)';
      g.lineWidth = Math.max(1, C * 0.02);
      g.stroke();
    }
    if (v.flash > 0) {
      g.fillStyle = `rgba(255,255,220,${v.flash})`;
      g.beginPath();
      g.arc(cx, cy, C * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }

  drawParticles(g, now) {
    const C = this.cell;
    for (const p of this.parts) {
      const t = (now - p.born) / p.life;
      const age = (now - p.born) / 1000;
      const x = (p.x + p.vx * age * 0.5) * C;
      const y = (p.y + p.vy * age * 0.5 + age * age * 0.6) * C;
      g.globalAlpha = Math.max(0, 1 - t);
      g.fillStyle = p.col;
      const sz = p.size * C * (1 - t * 0.5);
      g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;
  }

  async play(ev, final, opts = {}) {
    this.busy = true;
    this.showIntents = false;
    this.overlay = {};
    const C = this.cell;
    const U = (id) => this.units.get(id);
    let i = 0;
    const A = [];
    while (i < ev.length && !ATTACKS.has(ev[i].t) && ev[i].t !== 'flee' && !(ev[i].t === 'move' && ev[i].id !== 0 && !ev[i].push) && ev[i].t !== 'aim' && ev[i].t !== 'hit') A.push(ev[i++]);
    const pushes = A.filter((e) => e.t === 'move' && e.push);
    for (const e of A) {
      if (e.t === 'move' && e.push) continue;
      if (e.t === 'gust') {
        this.sfx('gust');
        this.gustAnim(e.at);
        await Promise.all(
          pushes.map((m) => {
            const v = U(m.id);
            const [fx, fy] = m.path[0];
            const [tx, ty] = m.path[1];
            return this.tween(200, (t) => {
              const q = easeOut(t);
              v.x = lerp(fx, tx, q);
              v.y = lerp(fy, ty, q);
            });
          }),
        );
      } else if (e.t === 'mire') {
        this.sfx('mire');
        const [mx, my] = e.at;
        this.burst(mx + 0.5, my + 0.6, 14, '#5fa3b0', 1.4, 600);
        await this.wait(160);
        this.sync({ ...this.state, t: final.t });
      } else if (e.t === 'move') {
        const v = U(e.id);
        const [fx, fy] = e.path[0];
        const [tx, ty] = e.path[e.path.length - 1];
        if (tx !== fx) v.flip = tx < fx;
        this.sfx('drift');
        await this.tween(140, (t) => {
          const q = ease(t);
          v.x = lerp(fx, tx, q);
          v.y = lerp(fy, ty, q);
        });
      } else if (e.t === 'swap') {
        const a = U(e.a);
        const b = U(e.b);
        this.sfx('swap');
        const [ax, ay] = e.pa;
        const [bx, by] = e.pb;
        this.trail(ax, ay, bx, by);
        this.burst(ax + 0.5, ay + 0.5, 10, '#bff4ff', 1.6, 500);
        this.burst(bx + 0.5, by + 0.5, 10, '#bff4ff', 1.6, 500);
        await this.tween(110, (t) => {
          a.alpha = 1 - t;
          b.alpha = 1 - t;
        });
        a.x = bx;
        a.y = by;
        b.x = ax;
        b.y = ay;
        if (bx !== ax) b.flip = !b.flip;
        await this.tween(150, (t) => {
          a.alpha = t;
          b.alpha = t;
        });
      } else if (e.t === 'sink') {
        await this.sinkAnim(U(e.id), e.x, e.y);
        if (opts.onKill) opts.onKill(e);
      }
    }
    const B = [];
    while (i < ev.length && (ATTACKS.has(ev[i].t) || ev[i].t === 'hit')) B.push(ev[i++]);
    if (B.length) {
      const runs = [];
      for (const e of B) {
        const v = U(e.id);
        if (!v) continue;
        if (e.t === 'strike') runs.push(this.strikeAnim(v, e.at, e.cells));
        else if (e.t === 'shoot') runs.push(this.shootAnim(e.from, e.to));
        else if (e.t === 'beam') runs.push(this.beamAnim(v, e.cells));
        else if (e.t === 'throw') runs.push(this.throwAnim(e.from, e.at, e.cells));
        else if (e.t === 'charge') runs.push(this.chargeAnim(v, e));
      }
      this.sfx(B.some((e) => e.t === 'beam') ? 'beam' : B.some((e) => e.t === 'throw') ? 'throw' : 'strike');
      await Promise.all(runs);
    }
    const hitIds = new Set(B.filter((e) => e.t === 'hit').map((e) => e.id));
    const rest = [];
    while (i < ev.length && ev[i].t !== 'flee' && !(ev[i].t === 'move' && !ev[i].fast) && ev[i].t !== 'aim') rest.push(ev[i++]);
    for (const e of rest) if (e.t === 'hit') hitIds.add(e.id);
    const flashes = [];
    for (const id of hitIds) {
      const v = U(id);
      if (!v || v.k === 'gas') continue;
      flashes.push(this.tween(260, (t) => (v.flash = 1 - t)));
    }
    if (flashes.length) this.sfx('hit');
    for (const e of rest) {
      if (e.t === 'boom') {
        const v = U(e.id);
        this.sfx('boom');
        this.shake = 1;
        if (v) v.alpha = 0;
        this.boomAnim(e.at);
        if (navigator.vibrate && opts.haptics) navigator.vibrate(30);
        await this.wait(170);
      } else if (e.t === 'hurt') {
        const v = U(e.id);
        this.shake = 1.2;
        this.sfx('hurt');
        if (navigator.vibrate && opts.haptics) navigator.vibrate([40, 30, 40]);
        if (v) {
          this.burst(v.x + 0.5, v.y + 0.5, 14, '#ff8a7a', 2.2, 600);
          this.popup(v.x, v.y, `−${e.n}`, '#ff8a7a');
        }
      }
    }
    await Promise.all(flashes);
    const deaths = [];
    for (const e of rest) {
      if (e.t === 'die') {
        deaths.push(this.dieAnim(U(e.id)));
        if (opts.onKill) opts.onKill(e);
      } else if (e.t === 'sink') {
        deaths.push(this.sinkAnim(U(e.id), e.x, e.y));
        if (opts.onKill) opts.onKill(e);
      } else if (e.t === 'pop') {
        const v = U(e.id);
        if (v) v.alpha = 0;
      }
    }
    if (deaths.length) {
      this.sfx(rest.some((e) => e.t === 'sink') ? 'sink' : 'die');
      await Promise.all(deaths);
    }
    for (const e of rest) if (e.t === 'die' || e.t === 'sink' || e.t === 'pop') this.units.delete(e.id);
    if (opts.afterAttacks) await opts.afterAttacks();
    const moves = [];
    for (; i < ev.length; i++) {
      const e = ev[i];
      if (e.t === 'flee') {
        await this.fleeAnim(U(e.id));
        this.units.delete(e.id);
        if (opts.onFlee) opts.onFlee(e);
      } else if (e.t === 'move' && !e.fast) {
        moves.push(e);
      }
    }
    if (moves.length) {
      const segs = Math.max(...moves.map((m) => m.path.length - 1));
      await this.tween(150 * segs + 40, (t) => {
        for (const m of moves) {
          const v = U(m.id);
          if (!v) continue;
          const n = m.path.length - 1;
          const f = Math.min(1, (t * segs) / n);
          const p = ease(f) * n;
          const k = Math.min(n - 1, Math.floor(p));
          const r = p - k;
          const [ax, ay] = m.path[k];
          const [bx, by] = m.path[k + 1];
          v.x = lerp(ax, bx, r);
          v.y = lerp(ay, by, r);
          if (bx !== ax) v.flip = bx < ax;
          v.dy = -Math.abs(Math.sin(p * Math.PI)) * 0.06;
        }
      });
    }
    this.sync(final);
    this.showIntents = true;
    if (ev.some((e) => e.t === 'aim')) this.sfx('aim');
    this.busy = false;
    this.kick();
  }

  trail(ax, ay, bx, by) {
    const born = performance.now();
    const C = this.cell;
    this.fx.push({
      until: born + 420,
      draw: (g, now) => {
        const t = (now - born) / 420;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = `rgba(160,240,255,${0.8 * (1 - t)})`;
        g.lineWidth = C * 0.12 * (1 - t);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo((ax + 0.5) * C, (ay + 0.5) * C);
        const mx = (ax + bx + 1) / 2 + (by - ay) * 0.12;
        const my = (ay + by + 1) / 2 - (bx - ax) * 0.12;
        g.quadraticCurveTo(mx * C, my * C, (bx + 0.5) * C, (by + 0.5) * C);
        g.stroke();
        g.restore();
      },
    });
  }

  strikeAnim(v, at, cells) {
    const [tx, ty] = at;
    const dx = tx - v.x;
    const dy = ty - v.y;
    const C = this.cell;
    const born = performance.now();
    const wide = cells && cells.length > 1;
    this.fx.push({
      until: born + 320,
      draw: (g, now) => {
        const t = Math.min(1, (now - born) / 320);
        if (t < 0.3) return;
        const q = (t - 0.3) / 0.7;
        const a = Math.atan2(dy, dx);
        g.save();
        g.strokeStyle = `rgba(255,240,220,${1 - q})`;
        g.lineWidth = C * 0.08 * (1 - q * 0.6);
        g.lineCap = 'round';
        g.beginPath();
        if (wide) g.arc((v.x + 0.5) * C, (v.y + 0.5) * C, C * 1.05, a - 1.1 + q * 0.3, a + 1.1 + q * 0.3);
        else g.arc((tx + 0.5) * C - dx * C * 0.15, (ty + 0.5) * C - dy * C * 0.15, C * 0.35, a - 1.2 + q * 0.6, a + 0.4 + q * 0.8);
        g.stroke();
        g.restore();
      },
    });
    return this.tween(300, (t) => {
      const p = t < 0.35 ? easeOut(t / 0.35) : 1 - ease((t - 0.35) / 0.65);
      v.ox = dx * 0.32 * p;
      v.oy = dy * 0.32 * p;
    });
  }

  shootAnim(from, to) {
    const C = this.cell;
    const [fx, fy] = from;
    const [tx, ty] = to;
    const born = performance.now();
    const dur = 120 + Math.hypot(tx - fx, ty - fy) * 45;
    const ang = Math.atan2(ty - fy, tx - fx);
    this.fx.push({
      until: born + dur + 60,
      draw: (g, now) => {
        const t = Math.min(1, (now - born) / dur);
        const x = (lerp(fx, tx, t) + 0.5) * C;
        const y = (lerp(fy, ty, t) + 0.5) * C;
        g.save();
        g.translate(x, y);
        g.rotate(ang);
        g.strokeStyle = 'rgba(255,200,150,0.5)';
        g.lineWidth = C * 0.05;
        g.beginPath();
        g.moveTo(-C * 0.6, 0);
        g.lineTo(0, 0);
        g.stroke();
        g.fillStyle = '#f6e6c8';
        g.fillRect(-C * 0.25, -C * 0.025, C * 0.3, C * 0.05);
        g.fillStyle = '#d8dce6';
        g.beginPath();
        g.moveTo(C * 0.12, -C * 0.06);
        g.lineTo(C * 0.2, 0);
        g.lineTo(C * 0.12, C * 0.06);
        g.fill();
        g.restore();
      },
    });
    return this.wait(dur);
  }

  beamAnim(v, cells) {
    const C = this.cell;
    const born = performance.now();
    const last = cells[cells.length - 1];
    if (!last) return this.wait(200);
    this.fx.push({
      until: born + 480,
      draw: (g, now) => {
        const t = (now - born) / 480;
        const a = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';
        for (const [w, al] of [
          [0.42, 0.25],
          [0.2, 0.5],
          [0.07, 1],
        ]) {
          g.strokeStyle = `rgba(255,230,150,${al * a})`;
          g.lineWidth = C * w;
          g.beginPath();
          g.moveTo((v.x + 0.5) * C, (v.y + 0.5) * C);
          g.lineTo((last[0] + 0.5) * C, (last[1] + 0.5) * C);
          g.stroke();
        }
        g.restore();
      },
    });
    return this.wait(320);
  }

  throwAnim(from, at, cells) {
    const C = this.cell;
    const [fx, fy] = from;
    const [tx, ty] = at;
    const born = performance.now();
    const dur = 340;
    this.fx.push({
      until: born + dur,
      draw: (g, now) => {
        const t = Math.min(1, (now - born) / dur);
        const x = (lerp(fx, tx, t) + 0.5) * C;
        const y = (lerp(fy, ty, t) + 0.5 - Math.sin(t * Math.PI) * 1.2) * C;
        g.save();
        g.translate(x, y);
        g.rotate(t * 8);
        g.fillStyle = '#7af0a8';
        g.fillRect(-C * 0.08, -C * 0.06, C * 0.16, C * 0.14);
        g.fillStyle = '#d8dce6';
        g.fillRect(-C * 0.04, -C * 0.12, C * 0.08, C * 0.07);
        g.restore();
      },
    });
    return this.wait(dur).then(() => {
      this.shake = 0.6;
      this.sfx('boom');
      const b2 = performance.now();
      this.fx.push({
        until: b2 + 420,
        draw: (g, now) => {
          const t = (now - b2) / 420;
          g.save();
          g.globalCompositeOperation = 'lighter';
          for (const [x, y] of cells) {
            g.fillStyle = `rgba(190,120,255,${0.55 * (1 - t)})`;
            g.fillRect(x * C + C * 0.08 * t, y * C + C * 0.08 * t, C * (1 - 0.16 * t), C * (1 - 0.16 * t));
          }
          g.restore();
        },
      });
      for (const [x, y] of cells) this.burst(x + 0.5, y + 0.5, 5, '#c79cff', 1.8, 450);
      return this.wait(200);
    });
  }

  chargeAnim(v, e) {
    const [fx, fy] = e.from;
    const [tx, ty] = e.to;
    const hit = e.hitAt;
    if (tx !== fx) v.flip = tx < fx;
    const dist = Math.abs(tx - fx) + Math.abs(ty - fy);
    const dur = 110 + dist * 55;
    return this.tween(dur, (t) => {
      const q = ease(t);
      v.x = lerp(fx, tx, q);
      v.y = lerp(fy, ty, q);
      if (hit && t > 0.75) {
        const b = Math.sin(((t - 0.75) / 0.25) * Math.PI) * 0.25;
        v.ox = Math.sign(hit[0] - tx) * b;
        v.oy = Math.sign(hit[1] - ty) * b;
      }
    }).then(() => {
      v.ox = 0;
      v.oy = 0;
      if (dist > 0) this.burst(tx + 0.5, ty + 0.8, 6, '#8a7a5a', 1.2, 400);
    });
  }

  gustAnim([x, y]) {
    const C = this.cell;
    const born = performance.now();
    this.fx.push({
      until: born + 500,
      draw: (g, now) => {
        const t = (now - born) / 500;
        g.save();
        g.strokeStyle = `rgba(200,245,255,${0.8 * (1 - t)})`;
        g.lineWidth = C * 0.06 * (1 - t);
        g.beginPath();
        g.arc((x + 0.5) * C, (y + 0.5) * C, C * (0.4 + easeOut(t) * 1.3), 0, Math.PI * 2);
        g.stroke();
        g.restore();
      },
    });
  }

  boomAnim([x, y]) {
    const C = this.cell;
    const born = performance.now();
    this.fx.push({
      until: born + 520,
      draw: (g, now) => {
        const t = (now - born) / 520;
        g.save();
        g.globalCompositeOperation = 'lighter';
        const r = C * (0.3 + easeOut(t) * 1.3);
        const grd = g.createRadialGradient((x + 0.5) * C, (y + 0.5) * C, 0, (x + 0.5) * C, (y + 0.5) * C, r);
        grd.addColorStop(0, `rgba(255,255,200,${0.9 * (1 - t)})`);
        grd.addColorStop(0.5, `rgba(170,255,120,${0.6 * (1 - t)})`);
        grd.addColorStop(1, 'rgba(90,200,80,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc((x + 0.5) * C, (y + 0.5) * C, r, 0, Math.PI * 2);
        g.fill();
        g.restore();
      },
    });
    this.burst(x + 0.5, y + 0.5, 22, '#d6ff9a', 3, 700, 0.07);
  }

  dieAnim(v) {
    if (!v) return Promise.resolve();
    this.burst(v.x + 0.5, v.y + 0.5, 14, '#e8e0f0', 1.6, 700, 0.08);
    return this.tween(380, (t) => {
      v.alpha = 1 - t;
      v.dy = -t * 0.3;
    });
  }

  sinkAnim(v, x, y) {
    if (!v) return Promise.resolve();
    const C = this.cell;
    const born = performance.now();
    this.fx.push({
      until: born + 900,
      draw: (g, now) => {
        const t = (now - born) / 900;
        g.save();
        g.strokeStyle = `rgba(160,220,235,${0.7 * (1 - t)})`;
        g.lineWidth = Math.max(1, C * 0.03);
        for (const k of [0, 0.25]) {
          const q = Math.max(0, t - k);
          g.beginPath();
          g.ellipse((x + 0.5) * C, (y + 0.78) * C, C * (0.15 + q * 0.6), C * (0.05 + q * 0.18), 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      },
    });
    this.burst(x + 0.5, y + 0.75, 8, '#a8e4f0', 1.2, 700, 0.06);
    return this.tween(520, (t) => {
      v.sink = ease(t);
      v.alpha = 1 - t * 0.4;
    }).then(() => {
      v.alpha = 0;
    });
  }

  fleeAnim(v) {
    if (!v) return Promise.resolve();
    const s = this.state;
    const dl = v.x + 1;
    const dr = s.w - v.x;
    const du = v.y + 1;
    const dd = s.h - v.y;
    const m = Math.min(dl, dr, du, dd);
    const [dx, dy] = m === dl ? [-1, 0] : m === dr ? [1, 0] : m === du ? [0, -1] : [0, 1];
    if (dx) v.flip = dx < 0;
    this.popup(v.x, v.y, 'fled!', '#ffe6a0');
    this.sfx('flee');
    const x0 = v.x;
    const y0 = v.y;
    return this.tween(520 + m * 60, (t) => {
      v.x = x0 + dx * (m + 0.5) * ease(t);
      v.y = y0 + dy * (m + 0.5) * ease(t);
      v.dy = -Math.abs(Math.sin(t * 14)) * 0.06;
      v.alpha = 1 - Math.max(0, (t - 0.6) / 0.4);
    });
  }
}
