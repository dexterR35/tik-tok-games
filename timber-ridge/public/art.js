// Procedural art: biome palettes, tree sprites and seamless parallax layers (all generated, no image files).
import { mulberry32 } from './terrain.js';

export const PALETTES = {
  forest: {
    sky: ['#2f86d0', '#7cc2ee', '#d9f1ff'], sun: '#fff8d6', sunGlow: [255, 244, 200], sunPos: [0.56, 0.235], moon: false,
    cloud: 'rgba(255,255,255,0.9)', mtn: ['#9cc0dc', '#7aa3bf'], snowCaps: true,
    hills: ['#5f9a86', '#3f7c5c', '#2a5f3e'], trees: [['#4c8a74', '#5f9c84'], ['#2f7048', '#3f8a55', '#256139'], ['#1e5230', '#2a6a3c', '#17432a']],
    kinds: ['pine', 'round', 'pine', 'birch'], fog: [214, 236, 246], fogA: 0.42,
    grass: '#4fae35', grassHi: '#a6e86a', grassDark: '#2f7a25', dirt: ['#86593a', '#5a3a22', '#2b190c'], rock: ['#a3a7ab', '#6c7075', '#44474b'], moss: '#5f9a3a',
    dust: [138, 106, 69], ambient: 'leaf', ambientColors: ['#6cbf3f', '#9ad35a', '#4d9a32'], flowers: ['#ffffff', '#ffd84a', '#ff7aa8'], grade: null, rays: true,
  },
  sunset: {
    sky: ['#2b1f5c', '#c4577c', '#ffbf72'], sun: '#ffe1a0', sunGlow: [255, 170, 90], sunPos: [0.56, 0.34], moon: false,
    cloud: 'rgba(255,190,170,0.85)', mtn: ['#9a6585', '#714667'], snowCaps: false,
    hills: ['#6b4466', '#4b3050', '#2f1f38'], trees: [['#5d3c5f', '#6b4769'], ['#3d2847', '#4a3154', '#2e1f38'], ['#241830', '#2e1f3a', '#1a1124']],
    kinds: ['pine', 'pine', 'pine', 'round'], fog: [244, 160, 140], fogA: 0.4,
    grass: '#6f9a34', grassHi: '#e3d46a', grassDark: '#41661f', dirt: ['#7a4a2e', '#4e2c1a', '#25120a'], rock: ['#9b8a8f', '#6a5a62', '#3f3238'], moss: '#7a8a34',
    dust: [150, 105, 80], ambient: 'leaf', ambientColors: ['#f2a65a', '#e56f4f', '#ffd27a'], flowers: ['#ffd27a', '#ff8a5a'], grade: 'rgba(255,120,60,0.08)', rays: true,
  },
  autumn: {
    sky: ['#3d8fcc', '#9fd0ec', '#fff0d2'], sun: '#fff3c4', sunGlow: [255, 226, 160], sunPos: [0.5, 0.24], moon: false,
    cloud: 'rgba(255,250,240,0.92)', mtn: ['#b3bfca', '#8f9ea8'], snowCaps: true,
    hills: ['#b98a4a', '#9a5a30', '#6a351f'], trees: [['#c98a46', '#d9a456'], ['#c0532c', '#e07a2e', '#9e3c22'], ['#7e2f1c', '#a6421f', '#5e2414']],
    kinds: ['round', 'round', 'pine', 'birch'], fog: [250, 232, 200], fogA: 0.38,
    grass: '#a39a36', grassHi: '#f0cf62', grassDark: '#6f6a22', dirt: ['#86532e', '#5a341c', '#2b170b'], rock: ['#a59f98', '#76706a', '#4a4540'], moss: '#9a8a34',
    dust: [150, 110, 70], ambient: 'leaf', ambientColors: ['#e5782b', '#f4b63a', '#c8432a', '#a9561f'], flowers: ['#f4b63a', '#c8432a'], grade: 'rgba(255,170,60,0.06)', rays: true,
  },
  night: {
    sky: ['#03071a', '#0c1c46', '#26407a'], sun: '#f2f5ff', sunGlow: [160, 190, 255], sunPos: [0.54, 0.235], moon: true,
    cloud: 'rgba(70,90,140,0.55)', mtn: ['#1e2d55', '#172446'], snowCaps: false,
    hills: ['#14244a', '#0e1b3a', '#0a142c'], trees: [['#132447', '#192d55'], ['#0d1a36', '#12224a', '#0a142b'], ['#070f22', '#0b1730', '#050a18']],
    kinds: ['pine', 'pine', 'round', 'pine'], fog: [60, 90, 150], fogA: 0.35,
    grass: '#3d8a55', grassHi: '#9fe0b0', grassDark: '#1d4d33', dirt: ['#4a3426', '#2c1d13', '#120b06'], rock: ['#5b6478', '#3b4256', '#22273a'], moss: '#2f6a40',
    dust: [90, 80, 70], ambient: 'firefly', ambientColors: ['#e8ff8a', '#bfff6a'], flowers: ['#bcd4ff'], grade: 'rgba(20,40,110,0.18)', rays: false, dark: 0.32,
  },
  snow: {
    sky: ['#4f8fc8', '#a9cdea', '#eaf4ff'], sun: '#ffffff', sunGlow: [230, 245, 255], sunPos: [0.58, 0.24], moon: false,
    cloud: 'rgba(255,255,255,0.95)', mtn: ['#d4e3f0', '#aac2d8'], snowCaps: true,
    hills: ['#c4d6e6', '#9cb6cc', '#6e8aa2'], trees: [['#5d7c86', '#6f8e98'], ['#2d4f52', '#3a6264', '#21403f'], ['#1b3536', '#234446', '#132728']],
    kinds: ['pine', 'pine', 'pine', 'pine'], fog: [232, 242, 252], fogA: 0.48, snowTrees: true,
    grass: '#f2f8ff', grassHi: '#ffffff', grassDark: '#c6d8ea', dirt: ['#8492a2', '#56616f', '#2c333d'], rock: ['#b9c2cc', '#7d8792', '#4b535c'], moss: '#ffffff',
    dust: [240, 246, 255], ambient: 'snow', ambientColors: ['#ffffff'], flowers: [], grade: 'rgba(160,200,255,0.06)', rays: false, snowGround: true,
  },
};

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export { rgba };

function canvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return [c, c.getContext('2d')];
}

/* ---------- tree sprites ---------- */
function pine(ctx, x, y, h, cols, rand, snow) {
  const w = h * (0.34 + rand() * 0.08);
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(x - h * 0.025, y - h * 0.16, h * 0.05, h * 0.18);
  const tiers = 5 + Math.floor(rand() * 2);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const ty = y - h * 0.12 - t * h * 0.82;
    const tw = w * (1 - t * 0.78);
    const th = h * 0.28;
    // shadow side / lit side
    ctx.fillStyle = cols[2] || cols[0];
    ctx.beginPath(); ctx.moveTo(x, ty - th); ctx.lineTo(x + tw / 2, ty); ctx.quadraticCurveTo(x, ty + th * 0.12, x - tw / 2, ty); ctx.closePath(); ctx.fill();
    ctx.fillStyle = cols[1] || cols[0];
    ctx.beginPath(); ctx.moveTo(x, ty - th); ctx.lineTo(x - tw / 2, ty); ctx.quadraticCurveTo(x - tw * 0.2, ty + th * 0.08, x - tw * 0.05, ty + th * 0.02); ctx.closePath(); ctx.fill();
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.moveTo(x, ty - th); ctx.lineTo(x + tw * 0.28, ty - th * 0.45); ctx.quadraticCurveTo(x, ty - th * 0.3, x - tw * 0.3, ty - th * 0.42); ctx.closePath(); ctx.fill();
    }
  }
}

function round(ctx, x, y, h, cols, rand) {
  ctx.fillStyle = '#4a3020';
  ctx.beginPath(); ctx.moveTo(x - h * 0.04, y); ctx.lineTo(x - h * 0.02, y - h * 0.55); ctx.lineTo(x + h * 0.02, y - h * 0.55); ctx.lineTo(x + h * 0.045, y); ctx.fill();
  ctx.strokeStyle = '#4a3020'; ctx.lineWidth = h * 0.022;
  ctx.beginPath(); ctx.moveTo(x, y - h * 0.38); ctx.lineTo(x + h * 0.14, y - h * 0.56); ctx.moveTo(x, y - h * 0.32); ctx.lineTo(x - h * 0.12, y - h * 0.5); ctx.stroke();
  const blobs = 14;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < blobs; i++) {
      const ang = rand() * Math.PI * 2, rr = rand() * h * 0.24;
      const bx = x + Math.cos(ang) * rr * 1.1 + (pass === 2 ? -h * 0.05 : pass === 0 ? h * 0.04 : 0);
      const by = y - h * 0.66 + Math.sin(ang) * rr * 0.9 - (pass === 2 ? h * 0.05 : 0);
      ctx.fillStyle = cols[[0, 2, 1][pass] % cols.length];
      ctx.beginPath(); ctx.arc(bx, by, h * (0.1 + rand() * 0.08) * (pass === 2 ? 0.7 : 1), 0, Math.PI * 2); ctx.fill();
    }
  }
}

function birch(ctx, x, y, h, cols, rand) {
  ctx.fillStyle = '#ece8df';
  ctx.fillRect(x - h * 0.02, y - h * 0.8, h * 0.04, h * 0.8);
  ctx.fillStyle = '#2b2b2b';
  for (let i = 0; i < 9; i++) ctx.fillRect(x - h * 0.02 + (rand() < 0.5 ? 0 : h * 0.02), y - rand() * h * 0.78, h * 0.02, h * 0.008);
  for (let i = 0; i < 16; i++) {
    const ang = rand() * Math.PI * 2, rr = rand() * h * 0.18;
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath(); ctx.ellipse(x + Math.cos(ang) * rr, y - h * 0.78 + Math.sin(ang) * rr * 1.3, h * 0.09, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawTree(ctx, kind, x, y, h, cols, rand, snow) {
  if (kind === 'round') round(ctx, x, y, h, cols, rand);
  else if (kind === 'birch') birch(ctx, x, y, h, cols, rand);
  else pine(ctx, x, y, h, cols, rand, snow);
}

/* ---------- seamless layers ---------- */
export const TILE = 2048;

// periodic ridge: integer frequencies → wraps seamlessly over TILE
function ridge(rand, octaves) {
  const terms = octaves.map(([k, a]) => ({ k, a, p: rand() * Math.PI * 2 }));
  return x => terms.reduce((s, t) => s + t.a * Math.sin((x / TILE) * Math.PI * 2 * t.k + t.p), 0);
}

/**
 * Builds the parallax layers for a palette. Each layer: { img, f (parallax), y (screen y of its top), h }.
 * `H` = canvas height. Layer images are TILE wide and taller than the screen to allow vertical parallax.
 */
export function buildLayers(pal, seed, H) {
  const rand = mulberry32(seed);
  const layers = [];
  const LH = H + 700;

  // far mountains
  {
    const [c, g] = canvas(TILE, LH);
    for (let m = 0; m < 2; m++) {
      const base = 760 + m * 150;
      const f = ridge(rand, m ? [[3, 60], [7, 40], [13, 16], [29, 6]] : [[2, 120], [5, 70], [11, 30], [23, 12], [41, 5]]);
      const top = x => base - Math.abs(f(x)) * (m ? 0.9 : 1.05) - (m ? 30 : 70);
      g.beginPath(); g.moveTo(0, LH);
      for (let x = 0; x <= TILE; x += 4) g.lineTo(x, top(x));
      g.lineTo(TILE, LH); g.closePath();
      const grd = g.createLinearGradient(0, base - 320, 0, base + 300);
      grd.addColorStop(0, pal.mtn[m]); grd.addColorStop(1, rgba(pal.fog, 1));
      g.fillStyle = grd; g.fill();
      if (pal.snowCaps && m === 0) {
        g.save(); g.clip();
        const sg = g.createLinearGradient(0, base - 300, 0, base - 200);
        sg.addColorStop(0, 'rgba(255,255,255,0.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sg; g.fillRect(0, 0, TILE, base - 190);
        g.restore();
      }
      // light side shading
      g.save(); g.globalAlpha = 0.18; g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      g.beginPath(); for (let x = 0; x <= TILE; x += 4) g.lineTo(x, top(x) + 2); g.stroke(); g.restore();
    }
    layers.push({ img: c, f: 0.04, top: 0, vy: 0.04 });
  }

  // three forest bands: far → near
  const bands = [
    { f: 0.14, base: 1010, amp: 40, count: 120, size: [90, 150], haze: 0.62, idx: 0 },
    { f: 0.3, base: 1110, amp: 55, count: 70, size: [170, 280], haze: 0.34, idx: 1 },
    { f: 0.55, base: 1250, amp: 70, count: 26, size: [360, 620], haze: 0.1, idx: 2 },
  ];
  for (const b of bands) {
    const [c, g] = canvas(TILE, LH);
    const f = ridge(rand, [[2, b.amp], [5, b.amp * 0.5], [9, b.amp * 0.25]]);
    const ground = x => b.base + f(x);
    const cols = pal.trees[b.idx];
    const trees = [];
    for (let i = 0; i < b.count; i++) trees.push({ x: rand() * TILE, h: b.size[0] + rand() * (b.size[1] - b.size[0]), k: pal.kinds[Math.floor(rand() * pal.kinds.length)], s: (rand() * 1e9) | 0 });
    trees.sort((p, q) => p.h - q.h);
    for (const t of trees) {
      for (const dx of [-TILE, 0, TILE]) {
        const x = t.x + dx;
        if (x < -t.h || x > TILE + t.h) continue;
        drawTree(g, t.k, x, ground(t.x) + 18, t.h, cols, mulberry32(t.s), pal.snowTrees);
      }
    }
    // forest floor
    g.beginPath(); g.moveTo(0, LH);
    for (let x = 0; x <= TILE; x += 6) g.lineTo(x, ground(x));
    g.lineTo(TILE, LH); g.closePath();
    g.fillStyle = pal.hills[b.idx]; g.fill();
    // atmospheric haze
    g.globalCompositeOperation = 'source-atop';
    const hz = g.createLinearGradient(0, b.base - b.size[1], 0, b.base + 220);
    hz.addColorStop(0, rgba(pal.fog, b.haze * 0.75)); hz.addColorStop(1, rgba(pal.fog, b.haze));
    g.fillStyle = hz; g.fillRect(0, 0, TILE, LH);
    g.globalCompositeOperation = 'source-over';
    layers.push({ img: c, f: b.f, top: 0, vy: b.f * 0.5 });
  }
  return layers;
}

export function buildClouds(pal, seed) {
  const rand = mulberry32(seed ^ 0x9e37);
  const out = [];
  for (let i = 0; i < 5; i++) {
    const [c, g] = canvas(560, 320);
    for (let k = 0; k < 14; k++) {
      const x = 110 + rand() * 340, y = 190 + (rand() - 0.5) * 50 - Math.sin(((x - 110) / 340) * Math.PI) * 40;
      const r = 36 + rand() * 46;
      const grd = g.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      grd.addColorStop(0, pal.cloud); grd.addColorStop(1, pal.cloud.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    out.push(c);
  }
  return out;
}

export function buildSky(pal, W, H) {
  const [c, g] = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H * 0.62);
  grd.addColorStop(0, pal.sky[0]); grd.addColorStop(0.55, pal.sky[1]); grd.addColorStop(1, pal.sky[2]);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (pal.moon) {
    const rand = mulberry32(77);
    for (let i = 0; i < 260; i++) {
      const a = rand();
      g.fillStyle = `rgba(255,255,255,${0.25 + a * 0.75})`;
      g.fillRect(rand() * W, rand() * H * 0.55, a > 0.9 ? 3 : 2, a > 0.9 ? 3 : 2);
    }
  }
  const [sx, sy] = [pal.sunPos[0] * W, pal.sunPos[1] * H];
  const glow = g.createRadialGradient(sx, sy, 10, sx, sy, pal.moon ? 380 : 620);
  glow.addColorStop(0, rgba(pal.sunGlow, pal.moon ? 0.45 : 0.85)); glow.addColorStop(0.25, rgba(pal.sunGlow, 0.3)); glow.addColorStop(1, rgba(pal.sunGlow, 0));
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.fillStyle = pal.sun; g.beginPath(); g.arc(sx, sy, pal.moon ? 70 : 88, 0, Math.PI * 2); g.fill();
  if (pal.moon) {
    g.fillStyle = 'rgba(180,190,215,0.5)';
    for (const [dx, dy, r] of [[-20, -15, 14], [18, 10, 10], [-5, 25, 8], [25, -25, 6]]) { g.beginPath(); g.arc(sx + dx, sy + dy, r, 0, Math.PI * 2); g.fill(); }
  }
  return c;
}
