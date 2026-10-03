import { db } from './store.js';

let ctx = null;
let master = null;
const lastAt = {};

function audio() {
  if (!db.settings.sound) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.06, slide = 0, attack = 0.01 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

let noiseBuf = null;
function noise({ at = 0, dur = 0.25, gain = 0.08, freq = 900, q = 0.8, type = 'lowpass', sweep = 0 } = {}) {
  const a = audio();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.6, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + at;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

const SFX = {
  tap: () => tone(1200, { dur: 0.04, gain: 0.025 }),
  select: () => tone(880, { dur: 0.06, gain: 0.03, type: 'triangle' }),
  drift: () => noise({ dur: 0.18, gain: 0.025, freq: 1400, type: 'bandpass', q: 1.2, sweep: 0.6 }),
  swap: () => {
    tone(660, { dur: 0.22, gain: 0.05, slide: 1.5 });
    tone(990, { at: 0.06, dur: 0.25, gain: 0.04, slide: 0.67 });
    noise({ dur: 0.3, gain: 0.02, freq: 3000, type: 'highpass' });
  },
  strike: () => noise({ dur: 0.12, gain: 0.07, freq: 2600, type: 'bandpass', q: 2, sweep: 0.4 }),
  beam: () => {
    tone(440, { dur: 0.45, gain: 0.045, type: 'sawtooth', slide: 1.01 });
    tone(880, { dur: 0.45, gain: 0.03 });
  },
  throw: () => noise({ dur: 0.2, gain: 0.03, freq: 900, type: 'bandpass', sweep: 2 }),
  hit: () => tone(140, { dur: 0.14, gain: 0.09, type: 'triangle', slide: 0.6 }),
  boom: () => {
    noise({ dur: 0.5, gain: 0.14, freq: 700, sweep: 0.15 });
    tone(90, { dur: 0.35, gain: 0.1, slide: 0.5 });
  },
  die: () => tone(392, { dur: 0.3, gain: 0.04, type: 'triangle', slide: 0.5 }),
  sink: () => {
    tone(300, { dur: 0.35, gain: 0.07, slide: 0.35 });
    tone(520, { at: 0.12, dur: 0.12, gain: 0.03, slide: 0.6 });
    tone(620, { at: 0.24, dur: 0.1, gain: 0.025, slide: 0.6 });
  },
  hurt: () => {
    tone(220, { dur: 0.25, gain: 0.08, type: 'square', slide: 0.5 });
    noise({ dur: 0.2, gain: 0.06, freq: 500 });
  },
  aim: () => tone(1568, { dur: 0.05, gain: 0.012, type: 'triangle' }),
  flee: () => [784, 698, 587].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.1, gain: 0.03, type: 'triangle' })),
  gust: () => noise({ dur: 0.45, gain: 0.08, freq: 600, type: 'bandpass', sweep: 3 }),
  mire: () => tone(160, { dur: 0.4, gain: 0.07, slide: 0.6 }),
  veil: () => tone(1046, { dur: 0.4, gain: 0.04, slide: 0.5 }),
  combo: (n = 2) => PENTA.slice(0, Math.min(PENTA.length, n + 2)).forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.18, gain: 0.04 })),
  clear: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.11, dur: 0.5, gain: 0.05 })),
  dawn: () => [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, { at: i * 0.16, dur: 0.9, gain: 0.05 })),
  lost: () => [392, 349.23, 311.13, 261.63].forEach((f, i) => tone(f, { at: i * 0.22, dur: 0.5, gain: 0.05, type: 'triangle' })),
  boon: () => [659.25, 987.77, 1318.5].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.3, gain: 0.04 })),
};

export function sfx(name, arg) {
  const now = performance.now();
  if (now - (lastAt[name] || 0) < 40) return;
  lastAt[name] = now;
  try {
    SFX[name]?.(arg);
  } catch {}
}

export function buzz(pattern = 10) {
  if (!db.settings.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
