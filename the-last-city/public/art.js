// THE LAST CITY — procedural art. Every picture is drawn in code: no image files to download.
// buildScene() pre-renders the static world in two layers:
//   A = sky, forest and the killing field (behind the zombies)
//   B = wall walk, towers and the city (in front of the zombies at the wall)
// zombieSprites() pre-renders every zombie pose once, so a 130-zombie horde stays smooth.
import { mulberry32 } from './sim.js';
import { WORLD } from './rules.js';

export const W = 1080, H = 1920;

export const PALETTES = {
  night: { sky: ['#050a1c', '#12234a', '#2a4a7c'], moon: '#f2f6ff', moonGlow: '150,190,255', stars: 1, mount: ['#0d1834', '#15244a'], forest: ['#0a171b', '#0f2327', '#15302f'], grass: ['#132c1b', '#21492a', '#2e6534'], dirt: ['#3f3224', '#5f4a32'], stone: ['#9aa3b6', '#737c91', '#4d5468', '#353a4a'], roof: ['#3159cc', '#1f3a92'], wood: '#6b4426', light: '255,186,90', tint: 'rgba(8,16,50,0.16)', weather: null },
  dusk: { sky: ['#14050c', '#5e1820', '#d0542c'], moon: '#ffd0a0', moonGlow: '255,140,90', stars: 0.25, mount: ['#2a0e18', '#3e1620'], forest: ['#170a0e', '#221016', '#2e161c'], grass: ['#2a2617', '#433b20', '#585328'], dirt: ['#553622', '#764f30'], stone: ['#a8968f', '#827270', '#5e5052', '#40363a'], roof: ['#3a52b4', '#26357a'], wood: '#6b4426', light: '255,160,70', tint: 'rgba(90,10,10,0.12)', weather: 'embers' },
  fog: { sky: ['#06120d', '#143627', '#2d6849'], moon: '#dcffe4', moonGlow: '140,255,170', stars: 0.5, mount: ['#0c2018', '#123024'], forest: ['#07130e', '#0c1d16', '#11281d'], grass: ['#142e1f', '#1f452a', '#2b5a33'], dirt: ['#393626', '#524c36'], stone: ['#8b9894', '#6b7875', '#4b5654', '#343d3c'], roof: ['#2d5ab4', '#1e3c80'], wood: '#5a3e26', light: '200,255,140', tint: 'rgba(20,70,30,0.14)', weather: 'fog' },
  storm: { sky: ['#04030c', '#171533', '#363163'], moon: '#d8d2ff', moonGlow: '170,150,255', stars: 0.15, mount: ['#100e2a', '#1a1840'], forest: ['#09091a', '#0e0f24', '#141630'], grass: ['#172626', '#223a35', '#2b4b41'], dirt: ['#363030', '#4d4542'], stone: ['#9095ab', '#6c7088', '#4c5066', '#343748'], roof: ['#3551c4', '#22358a'], wood: '#5a3e26', light: '255,200,120', tint: 'rgba(20,10,55,0.2)', weather: 'rain' },
  winter: { sky: ['#0a1426', '#23406c', '#5a80b4'], moon: '#ffffff', moonGlow: '200,225,255', stars: 0.8, mount: ['#9fb4d0', '#c4d4ea'], forest: ['#18283a', '#203648', '#2b465c'], grass: ['#a9bfd6', '#c8d9ea', '#e6f0fa'], dirt: ['#8592a4', '#a3b0c0'], stone: ['#a3adc2', '#808aa0', '#5f677d', '#424859'], roof: ['#3a62d0', '#2848a0'], wood: '#6b4426', light: '255,200,120', tint: 'rgba(40,60,110,0.1)', weather: 'snow', snow: true },
};

export const rgba = (rgb, a) => `rgba(${rgb},${a})`;
export function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

/** Perspective scale: zombies far up the field are small, those at the wall are big. */
export function persp(y) {
  if (y <= WORLD.wallY) return 0.52 + 0.58 * Math.min(1, Math.max(0, (y - WORLD.spawnY) / (WORLD.wallY - WORLD.spawnY)));
  return 1.1 + (y - WORLD.wallY) / 1400;
}

/* ================= world ================= */
function pine(c, x, y, h, col, hi) {
  const w = h * 0.42;
  c.fillStyle = '#2a1a10'; c.fillRect(x - h * 0.03, y - h * 0.12, h * 0.06, h * 0.14);
  for (let i = 0; i < 3; i++) {
    const ty = y - h * 0.1 - i * h * 0.27, tw = w * (1 - i * 0.24);
    c.fillStyle = col; c.beginPath(); c.moveTo(x - tw, ty); c.lineTo(x, ty - h * 0.42); c.lineTo(x + tw, ty); c.closePath(); c.fill();
    if (hi) { c.fillStyle = hi; c.beginPath(); c.moveTo(x, ty - h * 0.42); c.lineTo(x + tw, ty); c.lineTo(x + tw * 0.3, ty); c.closePath(); c.fill(); }
  }
}

function crown(c, x, y, s, col = '#ffc93a') {
  c.fillStyle = col; c.beginPath();
  c.moveTo(x - s, y + s * 0.6); c.lineTo(x - s, y - s * 0.3); c.lineTo(x - s * 0.5, y + s * 0.1); c.lineTo(x, y - s * 0.6);
  c.lineTo(x + s * 0.5, y + s * 0.1); c.lineTo(x + s, y - s * 0.3); c.lineTo(x + s, y + s * 0.6); c.closePath(); c.fill();
}

function banner(c, x, y, w, h, col, crownCol) {
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x + w / 2, y + h - w * 0.35); c.lineTo(x, y + h); c.closePath(); c.fill();
  c.strokeStyle = '#e8b53a'; c.lineWidth = 3; c.stroke();
  crown(c, x + w / 2, y + h * 0.42, w * 0.28, crownCol);
}

function stoneBlocks(c, x, y, w, h, base, rnd, bw = 44, bh = 22) {
  c.fillStyle = base; c.fillRect(x, y, w, h);
  for (let row = 0, yy = y; yy < y + h; row++, yy += bh) {
    for (let xx = x - (row % 2) * bw / 2; xx < x + w; xx += bw) {
      const f = (rnd() - 0.5) * 0.16;
      c.fillStyle = shade(base, f);
      c.fillRect(Math.max(x, xx) + 1, yy + 1, Math.min(bw - 2, x + w - Math.max(x, xx) - 1), Math.min(bh - 2, y + h - yy - 1));
    }
  }
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let yy = y; yy < y + h; yy += bh) c.fillRect(x, yy, w, 1.5);
}

function coneTower(c, pal, x, y, w, h, roofH, rnd) {
  // body
  const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, pal.stone[2]); g.addColorStop(0.4, pal.stone[0]); g.addColorStop(1, pal.stone[3]);
  c.fillStyle = g; c.fillRect(x - w / 2, y, w, h);
  c.fillStyle = 'rgba(0,0,0,0.15)'; for (let yy = y + 14; yy < y + h; yy += 18) c.fillRect(x - w / 2, yy, w, 2);
  // gold ring + roof
  c.fillStyle = '#e8b53a'; c.fillRect(x - w / 2 - 6, y - 8, w + 12, 10);
  const rg = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  rg.addColorStop(0, shade(pal.roof[0], 0.15)); rg.addColorStop(0.5, pal.roof[0]); rg.addColorStop(1, pal.roof[1]);
  c.fillStyle = rg; c.beginPath(); c.moveTo(x - w / 2 - 10, y - 6); c.lineTo(x, y - roofH); c.lineTo(x + w / 2 + 10, y - 6); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2;
  for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x, y - roofH); c.lineTo(x + i * (w / 5 + 2), y - 6); c.stroke(); }
  c.fillStyle = '#ffd34a'; c.beginPath(); c.moveTo(x - 6, y - roofH + 4); c.lineTo(x, y - roofH - 18); c.lineTo(x + 6, y - roofH + 4); c.fill();
  // window
  c.fillStyle = rgba(pal.light, 0.95); roundRect(c, x - 7, y + h * 0.3, 14, 22, 7); c.fill();
}

function house(c, pal, x, y, w, h, rnd) {
  // timber house, seen from the street
  c.fillStyle = '#d8c7a4'; c.fillRect(x, y, w, h);
  c.fillStyle = pal.wood; c.fillRect(x, y, w, 5); c.fillRect(x, y + h - 5, w, 5); c.fillRect(x, y, 5, h); c.fillRect(x + w - 5, y, 5, h); c.fillRect(x + w / 2 - 2, y, 4, h);
  c.fillStyle = shade(pal.roof[0], -0.1); c.beginPath(); c.moveTo(x - 12, y + 4); c.lineTo(x + w / 2, y - h * 0.75); c.lineTo(x + w + 12, y + 4); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.moveTo(x - 12, y + 4); c.lineTo(x + w / 2, y - h * 0.75); c.lineTo(x + w / 2, y + 4); c.closePath(); c.fill();
  for (let i = 0; i < 2; i++) {
    const lit = rnd() < 0.75;
    c.fillStyle = lit ? rgba(pal.light, 0.95) : '#2a2a38';
    c.fillRect(x + 10 + i * (w / 2), y + h * 0.25, w / 2 - 22, h * 0.32);
    c.fillStyle = pal.wood; c.fillRect(x + 10 + i * (w / 2) + (w / 2 - 22) / 2 - 1.5, y + h * 0.25, 3, h * 0.32);
  }
  c.fillStyle = '#4a2e18'; roundRect(c, x + w / 2 - 12, y + h - 34, 24, 34, 10); c.fill();
}

export function buildScene(pal, seed) {
  const rnd = mulberry32(seed);
  /* ---------- layer A: sky + field ---------- */
  const A = canvas(W, H), a = A.getContext('2d');
  const sky = a.createLinearGradient(0, 0, 0, 360);
  sky.addColorStop(0, pal.sky[0]); sky.addColorStop(0.6, pal.sky[1]); sky.addColorStop(1, pal.sky[2]);
  a.fillStyle = sky; a.fillRect(0, 0, W, 380);
  for (let i = 0; i < 160 * pal.stars; i++) { a.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; const r = rnd() * 1.8 + 0.4; a.fillRect(rnd() * W, rnd() * 260, r, r); }
  // moon
  const mx = 880, my = 112;
  const mg = a.createRadialGradient(mx, my, 20, mx, my, 190); mg.addColorStop(0, rgba(pal.moonGlow, 0.5)); mg.addColorStop(1, rgba(pal.moonGlow, 0));
  a.fillStyle = mg; a.fillRect(mx - 200, my - 200, 400, 400);
  a.fillStyle = pal.moon; a.beginPath(); a.arc(mx, my, 50, 0, 7); a.fill();
  a.fillStyle = 'rgba(0,0,0,0.08)'; for (const [dx, dy, r] of [[-14, -8, 12], [16, 12, 9], [6, -22, 6], [-8, 20, 7]]) { a.beginPath(); a.arc(mx + dx, my + dy, r, 0, 7); a.fill(); }
  // mountains
  for (let l = 0; l < 2; l++) {
    a.fillStyle = pal.mount[l]; a.beginPath(); a.moveTo(0, 300);
    for (let x = 0; x <= W + 40; x += 40) a.lineTo(x, 190 + l * 40 + Math.sin(x * 0.006 + l * 2 + seed) * 40 + rnd() * 30);
    a.lineTo(W, 330); a.lineTo(0, 330); a.closePath(); a.fill();
  }
  // ground
  const gg = a.createLinearGradient(0, 290, 0, WORLD.wallY + 20);
  gg.addColorStop(0, pal.grass[0]); gg.addColorStop(0.5, pal.grass[1]); gg.addColorStop(1, pal.grass[2]);
  a.fillStyle = gg; a.fillRect(0, 290, W, WORLD.wallY - 260);
  for (let i = 0; i < 260; i++) {
    const y = 300 + rnd() * (WORLD.wallY - 300), k = 0.5 + (y - 300) / 1000;
    a.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.05)';
    a.beginPath(); a.ellipse(rnd() * W, y, (20 + rnd() * 60) * k, (6 + rnd() * 14) * k, 0, 0, 7); a.fill();
  }
  // grass tufts
  for (let i = 0; i < 420; i++) {
    const y = 300 + rnd() * (WORLD.wallY - 300), x = rnd() * W, k = 0.5 + (y - 300) / 900;
    a.strokeStyle = rnd() < 0.5 ? shade(pal.grass[2], 0.15) : shade(pal.grass[0], -0.1); a.lineWidth = 2 * k;
    for (let j = -1; j <= 1; j++) { a.beginPath(); a.moveTo(x + j * 3 * k, y); a.lineTo(x + j * 6 * k, y - 9 * k); a.stroke(); }
  }
  // road from the forest to the gate
  const road = a.createLinearGradient(0, 300, 0, WORLD.wallY);
  road.addColorStop(0, pal.dirt[0]); road.addColorStop(1, pal.dirt[1]);
  a.fillStyle = road; a.beginPath(); a.moveTo(505, 300); a.lineTo(575, 300); a.lineTo(690, WORLD.wallY + 10); a.lineTo(390, WORLD.wallY + 10); a.closePath(); a.fill();
  for (let i = 0; i < 260; i++) {
    const t = rnd(), y = 300 + t * (WORLD.wallY - 300), half = 35 + t * 115, k = 0.5 + t;
    a.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.08)';
    a.beginPath(); a.ellipse(540 + (rnd() - 0.5) * 2 * half, y, 7 * k, 4 * k, 0, 0, 7); a.fill();
  }
  // gravestones, rocks, dead trees and stakes
  for (let i = 0; i < 30; i++) {
    const y = 340 + rnd() * 700, side = rnd() < 0.5 ? -1 : 1, x = 540 + side * (170 + rnd() * 360), k = 0.55 + (y - 300) / 1100;
    const kind = rnd();
    if (kind < 0.35) { // gravestone
      a.fillStyle = 'rgba(0,0,0,0.3)'; a.beginPath(); a.ellipse(x, y, 18 * k, 6 * k, 0, 0, 7); a.fill();
      a.fillStyle = pal.stone[1]; roundRect(a, x - 13 * k, y - 34 * k, 26 * k, 34 * k, 12 * k); a.fill();
      a.fillStyle = pal.stone[3]; a.fillRect(x - 2 * k, y - 28 * k, 4 * k, 16 * k); a.fillRect(x - 7 * k, y - 23 * k, 14 * k, 4 * k);
    } else if (kind < 0.7) { // rock
      a.fillStyle = 'rgba(0,0,0,0.3)'; a.beginPath(); a.ellipse(x, y + 3 * k, 28 * k, 8 * k, 0, 0, 7); a.fill();
      a.fillStyle = pal.stone[2]; a.beginPath(); a.moveTo(x - 26 * k, y); a.lineTo(x - 16 * k, y - 22 * k); a.lineTo(x + 6 * k, y - 28 * k); a.lineTo(x + 26 * k, y - 8 * k); a.lineTo(x + 22 * k, y + 2 * k); a.closePath(); a.fill();
      a.fillStyle = pal.stone[0]; a.beginPath(); a.moveTo(x - 16 * k, y - 22 * k); a.lineTo(x + 6 * k, y - 28 * k); a.lineTo(x + 2 * k, y - 12 * k); a.closePath(); a.fill();
    } else { // dead tree
      a.strokeStyle = '#2b1d14'; a.lineCap = 'round'; a.lineWidth = 7 * k;
      a.beginPath(); a.moveTo(x, y); a.lineTo(x + 4 * k, y - 70 * k); a.stroke();
      a.lineWidth = 3.5 * k;
      for (let b = 0; b < 4; b++) { const by = y - (30 + b * 12) * k, d = (b % 2 ? 1 : -1); a.beginPath(); a.moveTo(x + 2 * k, by); a.lineTo(x + d * (22 + rnd() * 10) * k, by - 22 * k); a.stroke(); }
    }
  }
  // wooden stakes in front of the wall
  for (const [x0, x1] of [[90, 350], [730, 990]]) {
    for (let x = x0; x <= x1; x += 34) {
      const y = 1040 + Math.sin(x) * 6, k = 1.02;
      a.strokeStyle = '#5a3a20'; a.lineWidth = 7 * k; a.lineCap = 'round';
      a.beginPath(); a.moveTo(x - 14, y + 10); a.lineTo(x + 8, y - 30); a.stroke();
      a.beginPath(); a.moveTo(x + 14, y + 10); a.lineTo(x - 8, y - 30); a.stroke();
      a.fillStyle = '#c8b090'; a.beginPath(); a.arc(x + 8, y - 30, 3, 0, 7); a.arc(x - 8, y - 30, 3, 0, 7); a.fill();
    }
    a.strokeStyle = '#4a2e18'; a.lineWidth = 6; a.beginPath(); a.moveTo(x0 - 10, 1036); a.lineTo(x1 + 10, 1036); a.stroke();
  }
  // skull banner (the horde's)
  { const x = 860, y = 470; a.fillStyle = '#3a2a1a'; a.fillRect(x - 3, y - 120, 6, 120);
    a.fillStyle = '#5a2a3a'; a.fillRect(x + 3, y - 116, 58, 70); a.fillStyle = '#e8dcc8'; a.beginPath(); a.arc(x + 32, y - 88, 14, 0, 7); a.fill(); a.fillRect(x + 24, y - 80, 16, 12);
    a.fillStyle = '#2a1018'; a.beginPath(); a.arc(x + 27, y - 89, 4, 0, 7); a.arc(x + 37, y - 89, 4, 0, 7); a.fill(); }
  // forest edge where the horde appears
  for (let row = 0; row < 3; row++) {
    for (let x = -20; x < W + 40; x += 34 + row * 10) {
      const h = 70 + row * 30 + rnd() * 40, y = 250 + row * 26 + rnd() * 10;
      if (row === 2 && Math.abs(x - 540) < 70) continue;   // the road leaves the forest
      pine(a, x + rnd() * 16, y, h, pal.forest[row], row === 2 ? shade(pal.forest[2], 0.12) : null);
    }
  }
  const mist = a.createLinearGradient(0, 240, 0, 380);
  mist.addColorStop(0, rgba(pal.moonGlow, 0)); mist.addColorStop(0.6, rgba(pal.moonGlow, 0.13)); mist.addColorStop(1, rgba(pal.moonGlow, 0));
  a.fillStyle = mist; a.fillRect(0, 240, W, 140);
  // the bottom of A (behind the city) — plain ground, covered by layer B
  a.fillStyle = pal.stone[3]; a.fillRect(0, WORLD.wallY, W, H - WORLD.wallY);

  /* ---------- layer B: wall + city ---------- */
  const B = canvas(W, H), b = B.getContext('2d');
  const wy = WORLD.wallY;          // 1160
  // city ground
  const cg = b.createLinearGradient(0, wy + 180, 0, H);
  cg.addColorStop(0, shade(pal.stone[3], 0.05)); cg.addColorStop(1, shade(pal.stone[3], -0.35));
  b.fillStyle = cg; b.fillRect(0, wy + 170, W, H - wy - 170);
  for (let i = 0; i < 500; i++) { b.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.04})`; const x = rnd() * W, y = wy + 190 + rnd() * (H - wy - 190); roundRect(b, x, y, 22, 12, 5); b.fill(); }
  // houses (two rows) and the main street to the castle
  b.fillStyle = 'rgba(0,0,0,0.18)'; b.beginPath(); b.moveTo(470, wy + 185); b.lineTo(610, wy + 185); b.lineTo(660, H); b.lineTo(420, H); b.closePath(); b.fill();
  const rowY = [wy + 300, wy + 430];
  for (const ry of rowY) {
    for (let x = 14; x < W; x += 128) {
      if (x > 330 && x < 680) continue;
      house(b, pal, x + rnd() * 10, ry, 104, 86, rnd);
    }
  }
  // crates of gold
  for (const [x, y] of [[360, wy + 255], [690, wy + 262]]) {
    b.fillStyle = pal.wood; b.fillRect(x, y, 46, 30); b.strokeStyle = '#3a2410'; b.lineWidth = 3; b.strokeRect(x, y, 46, 30);
    b.fillStyle = '#ffcf3a'; for (let i = 0; i < 7; i++) { b.beginPath(); b.ellipse(x + 8 + (i % 4) * 10, y - 2 - Math.floor(i / 4) * 6, 7, 4, 0, 0, 7); b.fill(); }
  }
  // castle (the core)
  const cy = WORLD.coreY;
  stoneBlocks(b, 300, cy, 480, H - cy, pal.stone[1], rnd, 48, 26);
  const shadeG = b.createLinearGradient(0, cy, 0, H); shadeG.addColorStop(0, 'rgba(0,0,0,0)'); shadeG.addColorStop(1, 'rgba(0,0,0,0.45)');
  b.fillStyle = shadeG; b.fillRect(300, cy, 480, H - cy);
  for (let x = 300; x < 780; x += 40) { b.fillStyle = pal.stone[0]; b.fillRect(x, cy - 22, 26, 24); b.fillStyle = 'rgba(0,0,0,0.25)'; b.fillRect(x, cy - 2, 26, 4); }
  // castle gate
  b.fillStyle = '#20140c'; roundRect(b, 480, cy + 40, 120, 150, 60); b.fill();
  b.fillStyle = '#6b4426'; roundRect(b, 490, cy + 50, 100, 140, 50); b.fill();
  b.strokeStyle = '#3a2410'; b.lineWidth = 4; for (let x = 505; x < 590; x += 17) { b.beginPath(); b.moveTo(x, cy + 62); b.lineTo(x, cy + 190); b.stroke(); }
  b.strokeStyle = '#2a2a30'; b.lineWidth = 6; b.beginPath(); b.moveTo(490, cy + 100); b.lineTo(590, cy + 100); b.moveTo(490, cy + 150); b.lineTo(590, cy + 150); b.stroke();
  banner(b, 360, cy + 40, 70, 120, pal.roof[1], '#ffd34a'); banner(b, 650, cy + 40, 70, 120, pal.roof[1], '#ffd34a');
  coneTower(b, pal, 300, cy - 60, 90, 300, 150, rnd); coneTower(b, pal, 780, cy - 60, 90, 300, 150, rnd);
  coneTower(b, pal, 540, cy - 170, 120, 150, 190, rnd);
  // windmill body (blades drawn live)
  { const x = 960, y = wy + 470; b.fillStyle = '#d8c7a4'; b.beginPath(); b.moveTo(x - 40, y + 100); b.lineTo(x - 26, y); b.lineTo(x + 26, y); b.lineTo(x + 40, y + 100); b.closePath(); b.fill();
    b.fillStyle = pal.roof[0]; b.beginPath(); b.moveTo(x - 34, y + 4); b.lineTo(x, y - 40); b.lineTo(x + 34, y + 4); b.closePath(); b.fill(); }

  // wall: inner face (toward the city)
  const inner = wy + 112;
  stoneBlocks(b, 0, inner, W, 80, pal.stone[2], rnd, 46, 24);
  const ig = b.createLinearGradient(0, inner, 0, inner + 80); ig.addColorStop(0, 'rgba(0,0,0,0)'); ig.addColorStop(1, 'rgba(0,0,0,0.35)');
  b.fillStyle = ig; b.fillRect(0, inner, W, 80);
  // gate (seen from inside)
  b.fillStyle = '#1a120c'; roundRect(b, 492, inner + 8, 96, 90, 44); b.fill();
  b.fillStyle = '#7a4e2a'; roundRect(b, 500, inner + 14, 80, 84, 38); b.fill();
  b.strokeStyle = '#3a2410'; b.lineWidth = 3; for (let x = 512; x < 575; x += 14) { b.beginPath(); b.moveTo(x, inner + 22); b.lineTo(x, inner + 96); b.stroke(); }
  // walkway
  const walk = b.createLinearGradient(0, wy + 10, 0, inner);
  walk.addColorStop(0, shade(pal.stone[1], -0.05)); walk.addColorStop(1, shade(pal.stone[1], 0.08));
  b.fillStyle = walk; b.fillRect(0, wy + 8, W, inner - wy - 8);
  b.strokeStyle = 'rgba(0,0,0,0.16)'; b.lineWidth = 2;
  for (let x = 0; x < W; x += 60) { b.beginPath(); b.moveTo(x, wy + 10); b.lineTo(x, inner); b.stroke(); }
  b.beginPath(); b.moveTo(0, wy + 60); b.lineTo(W, wy + 60); b.stroke();
  b.fillStyle = shade(pal.stone[0], 0.05); b.fillRect(0, inner - 6, W, 8);
  // parapet (the zombie-facing edge): merlons, seen from behind
  b.fillStyle = pal.stone[2]; b.fillRect(0, wy - 12, W, 24);
  for (let x = 6; x < W; x += 64) {
    b.fillStyle = pal.stone[1]; b.fillRect(x, wy - 44, 42, 40);
    b.fillStyle = pal.stone[0]; b.fillRect(x, wy - 50, 42, 10);
    b.fillStyle = 'rgba(0,0,0,0.2)'; b.fillRect(x + 36, wy - 44, 6, 40);
  }
  b.fillStyle = 'rgba(0,0,0,0.25)'; b.fillRect(0, wy + 8, W, 6);
  // bastions and towers
  const bastion = (x, w, top) => {
    stoneBlocks(b, x - w / 2, top, w, inner + 60 - top, pal.stone[1], rnd, 40, 22);
    b.fillStyle = 'rgba(0,0,0,0.25)'; b.fillRect(x + w / 2 - 10, top, 10, inner + 60 - top);
    b.fillStyle = shade(pal.stone[0], 0.05); b.fillRect(x - w / 2 - 4, top - 6, w + 8, 34);
    for (let xx = x - w / 2; xx < x + w / 2 - 10; xx += 26) { b.fillStyle = pal.stone[0]; b.fillRect(xx, top - 24, 16, 20); b.fillStyle = 'rgba(0,0,0,0.2)'; b.fillRect(xx + 12, top - 24, 4, 20); }
  };
  bastion(60, 120, wy - 40); bastion(1020, 120, wy - 40);
  bastion(452, 96, wy - 52); bastion(628, 96, wy - 52);
  bastion(236, 84, wy - 26); bastion(844, 84, wy - 26);
  // gatehouse between the towers (captain's post)
  b.fillStyle = shade(pal.stone[0], -0.02); b.fillRect(500, wy - 34, 80, 60);
  for (let xx = 500; xx < 580; xx += 27) { b.fillStyle = pal.stone[0]; b.fillRect(xx, wy - 52, 18, 20); }
  banner(b, 425, wy + 40, 54, 86, pal.roof[0], '#ffd34a'); banner(b, 601, wy + 40, 54, 86, pal.roof[0], '#ffd34a');
  banner(b, 30, wy + 46, 60, 90, pal.roof[0], '#ffd34a'); banner(b, 990, wy + 46, 60, 90, pal.roof[0], '#ffd34a');

  // snow caps
  if (pal.snow) {
    b.fillStyle = 'rgba(240,248,255,0.9)';
    for (let x = 6; x < W; x += 64) roundRect(b, x - 2, wy - 54, 46, 10, 5), b.fill();
    a.fillStyle = 'rgba(240,248,255,0.5)';
  }
  return { A, B };
}

/** Torch positions (flames drawn live). */
export const TORCHES = [[150, WORLD.wallY + 128], [345, WORLD.wallY + 128], [735, WORLD.wallY + 128], [930, WORLD.wallY + 128], [470, WORLD.coreY + 30], [610, WORLD.coreY + 30]];
export const WINDMILL = { x: 960, y: WORLD.wallY + 470 };

/* ================= zombies ================= */
export const ZKINDS = ['walker', 'runner', 'brute', 'boss'];
const SHIRTS = [['#5a4a3a', '#7a6248'], ['#2e4a5a', '#3f6478'], ['#5a2e4a', '#784068']];
const SKIN = { walker: ['#8bc34a', '#6a9a30', '#4f7a22'], runner: ['#a4cf5a', '#7fae3a', '#5c8a28'], brute: ['#6f9e3a', '#557d2a', '#3c5e1c'], boss: ['#5f8a30', '#466a22', '#2e4a16'] };
export const SPRITE_RES = 1.25;   // pre-rendered at 125 % so near zombies stay crisp

function drawZombie(c, kind, variant, frame, cx, fy, s) {
  const skin = SKIN[kind], shirt = SHIRTS[variant % SHIRTS.length];
  const step = Math.sin(frame * Math.PI / 2);
  const wide = kind === 'brute' ? 1.5 : kind === 'boss' ? 1.6 : kind === 'runner' ? 0.85 : 1;
  const tall = kind === 'runner' ? 0.95 : 1;
  // legs
  c.fillStyle = kind === 'brute' || kind === 'boss' ? '#2a2430' : '#33302c';
  roundRect(c, cx - 11 * s * wide, fy - 22 * s - step * 3 * s, 9 * s * wide, 22 * s, 3 * s); c.fill();
  roundRect(c, cx + 2 * s * wide, fy - 22 * s + step * 3 * s, 9 * s * wide, 22 * s, 3 * s); c.fill();
  c.fillStyle = '#1e1a18'; roundRect(c, cx - 12 * s * wide, fy - 5 * s - step * 3 * s, 11 * s * wide, 6 * s, 2 * s); c.fill(); roundRect(c, cx + 1 * s * wide, fy - 5 * s + step * 3 * s, 11 * s * wide, 6 * s, 2 * s); c.fill();
  // torso
  const tw = 30 * s * wide, th = 30 * s * tall, ty = fy - 20 * s - th;
  c.fillStyle = kind === 'brute' || kind === 'boss' ? '#3a3448' : shirt[0];
  roundRect(c, cx - tw / 2, ty, tw, th, 8 * s); c.fill();
  c.fillStyle = kind === 'brute' || kind === 'boss' ? '#4c4560' : shirt[1];
  roundRect(c, cx - tw / 2 + 3 * s, ty + 3 * s, tw * 0.45, th - 8 * s, 6 * s); c.fill();
  // torn hem
  c.fillStyle = skin[1];
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(cx - tw / 2 + (i + 0.3) * tw / 3, ty + th); c.lineTo(cx - tw / 2 + (i + 0.5) * tw / 3, ty + th - 7 * s); c.lineTo(cx - tw / 2 + (i + 0.7) * tw / 3, ty + th); c.fill(); }
  if (kind === 'brute' || kind === 'boss') {
    // armour plates and spikes
    c.fillStyle = '#5c566e'; roundRect(c, cx - tw / 2 - 6 * s, ty - 2 * s, 16 * s, 14 * s, 5 * s); c.fill(); roundRect(c, cx + tw / 2 - 10 * s, ty - 2 * s, 16 * s, 14 * s, 5 * s); c.fill();
    c.fillStyle = '#d8d0c0';
    for (const d of [-1, 1]) { c.beginPath(); c.moveTo(cx + d * (tw / 2 - 2 * s), ty - 1 * s); c.lineTo(cx + d * (tw / 2 + 4 * s), ty - 12 * s); c.lineTo(cx + d * (tw / 2 + 6 * s), ty + 2 * s); c.fill(); }
    c.fillStyle = '#8a6a3a'; c.fillRect(cx - tw / 2, ty + th - 12 * s, tw, 5 * s);
  }
  // arms reaching for the wall (toward the viewer)
  const armUp = kind === 'runner' ? 4 : 0;
  for (const d of [-1, 1]) {
    const sw = d === -1 ? step : -step;
    const ax = cx + d * (tw / 2 + 1 * s), ay = ty + 6 * s;
    c.fillStyle = kind === 'brute' || kind === 'boss' ? '#3a3448' : shirt[0];
    roundRect(c, ax - 5 * s * wide, ay, 10 * s * wide, (20 + sw * 3 - armUp) * s, 4 * s); c.fill();
    c.fillStyle = skin[0];
    c.beginPath(); c.arc(ax, ay + (22 + sw * 3 - armUp) * s, 6 * s * wide, 0, 7); c.fill();
    c.fillStyle = skin[2];
    for (let f = -1; f <= 1; f++) c.fillRect(ax + f * 3 * s * wide - 1 * s, ay + (25 + sw * 3 - armUp) * s, 2.4 * s, 5 * s);
  }
  if (kind === 'boss') {
    // spiked club
    const bx = cx + tw / 2 + 8 * s, by = ty + 28 * s;
    c.save(); c.translate(bx, by); c.rotate(-0.5 + step * 0.15);
    c.fillStyle = '#5a3a20'; roundRect(c, -4 * s, -36 * s, 8 * s, 40 * s, 3 * s); c.fill();
    c.fillStyle = '#6e4a2a'; c.beginPath(); c.ellipse(0, -40 * s, 11 * s, 16 * s, 0, 0, 7); c.fill();
    c.fillStyle = '#ddd'; for (let i = 0; i < 6; i++) { const a = i * 1.05; c.beginPath(); c.moveTo(Math.cos(a) * 10 * s, -40 * s + Math.sin(a) * 14 * s); c.lineTo(Math.cos(a) * 17 * s, -40 * s + Math.sin(a) * 21 * s); c.lineTo(Math.cos(a + 0.3) * 10 * s, -40 * s + Math.sin(a + 0.3) * 14 * s); c.fill(); }
    c.restore();
  }
  // head
  const hw = (kind === 'brute' ? 34 : kind === 'boss' ? 38 : kind === 'runner' ? 30 : 34) * s, hh = (kind === 'runner' ? 28 : 31) * s;
  const hx = cx - hw / 2 + (kind === 'runner' ? step * 2 * s : 0), hy = ty - hh + 6 * s + (kind === 'runner' ? 5 * s : 0);
  c.fillStyle = skin[2]; roundRect(c, hx - 1 * s, hy + 2 * s, hw + 2 * s, hh, 10 * s); c.fill();
  c.fillStyle = skin[0]; roundRect(c, hx, hy, hw, hh, 10 * s); c.fill();
  c.fillStyle = skin[1]; roundRect(c, hx, hy + hh * 0.62, hw, hh * 0.38, 8 * s); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(c, hx + 3 * s, hy + 2 * s, hw * 0.5, hh * 0.3, 6 * s); c.fill();
  // eyes
  const eyeCol = kind === 'boss' ? ['255,70,40', '#ffd0b0'] : ['200,255,70', '#f4ffb0'];
  for (const d of [-1, 1]) {
    const ex = hx + hw / 2 + d * hw * 0.22, ey = hy + hh * 0.42;
    const g = c.createRadialGradient(ex, ey, 0, ex, ey, 9 * s);
    g.addColorStop(0, rgba(eyeCol[0], 0.95)); g.addColorStop(1, rgba(eyeCol[0], 0));
    c.fillStyle = g; c.beginPath(); c.arc(ex, ey, 9 * s, 0, 7); c.fill();
    c.fillStyle = '#1a2010'; c.beginPath(); c.arc(ex, ey, 4.6 * s, 0, 7); c.fill();
    c.fillStyle = eyeCol[1]; c.beginPath(); c.arc(ex, ey, 3.4 * s, 0, 7); c.fill();
    c.strokeStyle = skin[2]; c.lineWidth = 2.4 * s; c.beginPath(); c.moveTo(ex - d * 6 * s, ey - 7 * s); c.lineTo(ex + d * 5 * s, ey - 4 * s); c.stroke();
  }
  // mouth
  const mw = hw * 0.5, my = hy + hh * 0.66;
  c.fillStyle = '#2a0e0e'; roundRect(c, hx + hw / 2 - mw / 2, my, mw, 7 * s + (frame % 2) * 2 * s, 3 * s); c.fill();
  c.fillStyle = '#f0ead0'; for (let i = 0; i < 4; i++) c.fillRect(hx + hw / 2 - mw / 2 + 2 * s + i * (mw - 4 * s) / 4, my, 3 * s, 3 * s);
  // scars / hair
  c.strokeStyle = skin[2]; c.lineWidth = 1.6 * s; c.beginPath(); c.moveTo(hx + hw * 0.15, hy + hh * 0.18); c.lineTo(hx + hw * 0.3, hy + hh * 0.28); c.stroke();
  if (kind === 'walker' || kind === 'runner') { c.fillStyle = '#2a2a1e'; for (let i = 0; i < 4; i++) c.fillRect(hx + hw * (0.25 + i * 0.15), hy - 3 * s, 2.5 * s, 6 * s); }
  if (kind === 'brute' || kind === 'boss') {
    // horned helmet
    c.fillStyle = '#4a4458'; c.beginPath(); c.ellipse(hx + hw / 2, hy + 4 * s, hw * 0.56, hh * 0.38, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#5c566e'; c.fillRect(hx - 3 * s, hy + 2 * s, hw + 6 * s, 6 * s);
    c.fillStyle = '#e8dcc0';
    for (const d of [-1, 1]) { c.beginPath(); c.moveTo(hx + hw / 2 + d * hw * 0.35, hy - 2 * s); c.quadraticCurveTo(hx + hw / 2 + d * hw * 0.85, hy - 4 * s, hx + hw / 2 + d * hw * 0.75, hy - (kind === 'boss' ? 26 : 18) * s); c.lineTo(hx + hw / 2 + d * hw * 0.5, hy + 3 * s); c.fill(); }
  }
}

/** sprites[kind][variant][frame] = {c, w, h, fx, fy}; hit (white) and frozen (ice) variants per kind/frame. */
export function zombieSprites() {
  const out = { normal: {}, hit: {}, ice: {} };
  const SIZE = { walker: 1, runner: 0.85, brute: 1.45, boss: 2.6 };
  for (const kind of ZKINDS) {
    out.normal[kind] = []; out.hit[kind] = []; out.ice[kind] = [];
    const s = SIZE[kind] * SPRITE_RES, w = 100 * s, h = 110 * s, fx = w / 2, fy = h - 6 * s;
    for (let v = 0; v < 3; v++) {
      out.normal[kind][v] = [];
      for (let f = 0; f < 4; f++) {
        const cv = canvas(w, h), c = cv.getContext('2d');
        drawZombie(c, kind, v, f, fx, fy, s);
        out.normal[kind][v][f] = { c: cv, w, h, fx, fy };
      }
    }
    for (let f = 0; f < 4; f++) {
      for (const [mode, col] of [['hit', 'rgba(255,255,255,0.85)'], ['ice', 'rgba(150,220,255,0.6)']]) {
        const cv = canvas(w, h), c = cv.getContext('2d');
        drawZombie(c, kind, 0, f, fx, fy, s);
        c.globalCompositeOperation = 'source-atop'; c.fillStyle = col; c.fillRect(0, 0, w, h);
        out[mode][kind][f] = { c: cv, w, h, fx, fy };
      }
    }
  }
  return out;
}
