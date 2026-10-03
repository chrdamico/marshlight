const PAL = {
  k: '#1b1421',
  f: '#f0b48a',
  F: '#c07a5a',
  w: '#8b5a34',
  W: '#4e3220',
  m: '#d8dce6',
  M: '#8a90a0',
  y: '#e8c860',
  Y: '#b08a38',
  b: '#b0683e',
  B: '#7a4428',
  g: '#5a9a52',
  G: '#33603a',
  h: '#a87a50',
  H: '#694830',
  e: '#ffe27a',
  p: '#8a5cc4',
  P: '#56368a',
  c: '#7af0a8',
  C: '#3cae74',
  a: '#c4ccdc',
  A: '#76809a',
  r: '#d84a4a',
  i: '#efe8da',
  I: '#a9a294',
  o: '#f2c440',
  O: '#b8862a',
  v: '#4a3a70',
  V: '#2a2046',
  n: '#9ad488',
  l: '#fff2b0',
  s: '#e7e0c8',
};

const ART = {
  fork: [
    '................',
    '...........m.m..',
    '...........m.m..',
    '....yyy....mmm..',
    '...yyyyy....w...',
    '..YYYYYYY...w...',
    '....ffkf....w...',
    '....ffff....w...',
    '...BbbbbB..fw...',
    '..BbbbbbbbbfW...',
    '..bbbbbbB...w...',
    '..BbbbbbB...w...',
    '...bbbbb....w...',
    '...WW.WW....w...',
    '...WW.WW....W...',
    '................',
  ],
  bow: [
    '................',
    '................',
    '.....GGG........',
    '....GgggG.......',
    '...GgggggG......',
    '...GgffkgG......',
    '...GgffffG......',
    '....GgggG...W...',
    '...GgggggG...W..',
    '..GgggggggwwwmW.',
    '..GgggggggffW...',
    '...gggggggG.....',
    '...GgggggG......',
    '....WW.WW.......',
    '....WW.WW.......',
    '................',
  ],
  hound: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '...........HH...',
    '..........HhhH..',
    '..........hhehh.',
    '.H........hhhhHk',
    '..H.hhhhhhhhH...',
    '...hhhhhhhhhH...',
    '...hhhhhhhhh....',
    '...hH.....hH....',
    '...h......h.....',
    '..HH.....HH.....',
    '................',
  ],
  flask: [
    '................',
    '......P.........',
    '.....PpP........',
    '....PpppP.......',
    '...PpppppP......',
    '...PpffkpP......',
    '....pffffp......',
    '....PpppP...m...',
    '...PpppppP.ccc..',
    '..PpppppppfcCc..',
    '..PppppppPccc...',
    '..PpppppppP.....',
    '..PpppppppP.....',
    '..PPPPPPPPP.....',
    '....WW.WW.......',
    '................',
  ],
  knight: [
    '................',
    '....rr..........',
    '...rrrr.........',
    '....AAAA........',
    '...AaaaaA.......',
    '...AakkaA.......',
    '...AaaaaA....m..',
    '....AAAA....m...',
    '..AaaaaaaA.m....',
    '.AaaaaaaaaMM....',
    '.AaAaaaaaAAM....',
    '.Aa.aaaaaA......',
    '....aaaaa.......',
    '....AA.AA.......',
    '....AA.AA.......',
    '................',
  ],
  priest: [
    '................',
    '............o...',
    '...........ooo..',
    '.....III...olo..',
    '....IiiiI..ooo..',
    '....iffkI...w...',
    '....iffff...w...',
    '...IiiiiI...w...',
    '..IiiiiiiI..w...',
    '..IiiooiiiffW...',
    '..Iiioooii..w...',
    '..Iiiooiii..w...',
    '..IiiiiiiI..w...',
    '..IIIIIIII..w...',
    '....kk.kk...W...',
    '................',
  ],
  witch: [
    '......V.........',
    '.....VvV........',
    '....VvvvV.......',
    '..VVVVVVVVV.....',
    '....nnkn........',
    '....nnnn........',
    '...VvvvvV.......',
    '..VvvvvvvV......',
    '..vvvvvvvvnn....',
    'yyyyvvvvvwwwwwww',
    'YyyyVvvvV.......',
    '.yy..VVV........',
    '................',
    '................',
    '................',
    '................',
  ],
};

const cache = new Map();

function build(name, flip, tint) {
  const rows = ART[name];
  const n = 16;
  const pad = 1;
  const c = document.createElement('canvas');
  c.width = n + pad * 2;
  c.height = n + pad * 2;
  const g = c.getContext('2d');
  const solid = (x, y) => y >= 0 && y < n && x >= 0 && x < n && rows[y][flip ? n - 1 - x : x] !== '.';
  g.fillStyle = tint || 'rgba(8,6,14,0.9)';
  for (let y = -1; y <= n; y++) {
    for (let x = -1; x <= n; x++) {
      if (solid(x, y)) continue;
      if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) g.fillRect(x + pad, y + pad, 1, 1);
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const ch = rows[y][flip ? n - 1 - x : x];
      if (ch === '.') continue;
      g.fillStyle = tint || PAL[ch];
      g.fillRect(x + pad, y + pad, 1, 1);
    }
  }
  return c;
}

export function sprite(name, flip = false, tint = null) {
  const key = name + (flip ? ':f' : '') + (tint ? ':' + tint : '');
  if (!cache.has(key)) cache.set(key, ART[name] ? build(name, flip, tint) : null);
  return cache.get(key);
}

export const SPRITE_PX = 18;

export function hasSprite(name) {
  return !!ART[name];
}

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function rnd(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function terrainCanvas(s, seed) {
  const T = 16;
  const c = document.createElement('canvas');
  c.width = s.w * T;
  c.height = s.h * T;
  const g = c.getContext('2d');
  const at = (x, y) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? -1 : s.t[y * s.w + x]);
  const px = (x, y, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const t = at(x, y);
      const r = rnd(hash(x, y, seed));
      const ox = x * T;
      const oy = y * T;
      if (t === 1) {
        g.fillStyle = (x + y) % 2 ? '#183a44' : '#1a3d47';
        g.fillRect(ox, oy, T, T);
        for (let i = 0; i < 9; i++) {
          const rx = ox + Math.floor(r() * 14);
          const ry = oy + 1 + Math.floor(r() * 14);
          g.fillStyle = r() < 0.5 ? '#14313a' : '#22505b';
          g.fillRect(rx, ry, 1 + Math.floor(r() * 3), 1);
        }
        for (let i = 0; i < 2; i++) {
          const rx = ox + 2 + Math.floor(r() * 10);
          const ry = oy + 3 + Math.floor(r() * 10);
          g.fillStyle = '#2d6672';
          g.fillRect(rx, ry, 3, 1);
          g.fillRect(rx + 1, ry - 1, 2, 1);
        }
        if (r() < 0.22) {
          const lx = ox + 3 + Math.floor(r() * 8);
          const ly = oy + 3 + Math.floor(r() * 8);
          g.fillStyle = '#2f5c36';
          g.fillRect(lx, ly, 4, 3);
          g.fillRect(lx + 1, ly - 1, 2, 5);
          px(lx + 2, ly + 1, '#13292f');
          if (r() < 0.4) px(lx + 1, ly + 1, '#e9b6d6');
        }
        const shore = '#2b2a1c';
        if (at(x, y - 1) === 0 || at(x, y - 1) === 2) for (let i = 0; i < T; i++) if (r() < 0.75) px(ox + i, oy, shore);
        if (at(x - 1, y) === 0 || at(x - 1, y) === 2) for (let i = 0; i < T; i++) if (r() < 0.6) px(ox, oy + i, shore);
        if (at(x + 1, y) === 0 || at(x + 1, y) === 2) for (let i = 0; i < T; i++) if (r() < 0.6) px(ox + T - 1, oy + i, shore);
        if (at(x, y + 1) === 0 || at(x, y + 1) === 2) for (let i = 0; i < T; i++) if (r() < 0.4) px(ox + i, oy + T - 1, '#1a2a22');
        if (at(x, y - 1) === 0 && r() < 0.6) {
          const rx = ox + 2 + Math.floor(r() * 10);
          for (let k = 0; k < 4; k++) px(rx, oy + 1 + k, '#4c6b3c');
          for (let k = 0; k < 3; k++) px(rx + 2, oy + 2 + k, '#5b7d45');
          px(rx, oy + 1, '#7a5a3a');
        }
      } else {
        g.fillStyle = (x + y) % 2 ? '#24331f' : '#263622';
        g.fillRect(ox, oy, T, T);
        for (let i = 0; i < 10; i++) px(ox + Math.floor(r() * T), oy + Math.floor(r() * T), r() < 0.5 ? '#1c2919' : '#2f4228');
        const tufts = 1 + Math.floor(r() * 3);
        for (let i = 0; i < tufts; i++) {
          const tx = ox + 1 + Math.floor(r() * 12);
          const ty = oy + 3 + Math.floor(r() * 11);
          px(tx, ty, '#3e5a30');
          px(tx + 2, ty, '#3e5a30');
          px(tx + 1, ty - 1, '#4d6e3a');
        }
        if (r() < 0.18) px(ox + 2 + Math.floor(r() * 12), oy + 2 + Math.floor(r() * 12), r() < 0.5 ? '#cdb8ec' : '#efe3a0');
        if (t === 2) {
          const bx = ox + 2;
          const by = oy + 3;
          const rock = [
            '....AAAA....',
            '..AAaaaaAA..',
            '.AaaaaaaaaA.',
            'AaammaaaaaaA',
            'AammaaaaaaaA',
            'AaaaaaaaaaMA',
            'AaaaaaaaaMMA',
            '.AaaaaaaMMA.',
            '..AAMMMMAA..',
            '...KKKKKK...',
          ];
          const rp = { A: '#3a3d48', a: '#666b78', m: '#8d93a0', M: '#4d515c', K: 'rgba(0,0,0,0.35)' };
          rock.forEach((row, ry) => [...row].forEach((ch, rx) => ch !== '.' && px(bx + rx, by + ry, rp[ch])));
          for (let i = 0; i < 5; i++) px(bx + 3 + Math.floor(r() * 6), by + 1 + Math.floor(r() * 2), '#4f7a3e');
        }
      }
    }
  }
  return c;
}
