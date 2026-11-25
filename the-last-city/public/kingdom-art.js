import { WORLD } from './rules.js';
import { mulberry32 } from './sim.js';
const { W, H, wallY } = WORLD;
const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
export const CITY_BUILDINGS = [
  { id: 'cottage', x: 235, y: 1490, width: 210 },
  { id: 'barracks', x: 850, y: 1480, width: 225 },
  { id: 'castle', x: 540, y: 1650, width: 360 },
  { id: 'pines', x: 105, y: 1660, width: 175 },
  { id: 'cottage', x: 235, y: 1820, width: 170 },
  { id: 'windmill', x: 920, y: 1820, width: 210 },
];

function ground(c, y0, y1, snow, rng, city = false) {
  c.save(); c.beginPath(); c.rect(0, y0, W, y1 - y0); c.clip();
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, snow ? '#a4bacb' : city ? '#486c38' : '#293e31');
  g.addColorStop(1, snow ? '#d3e4ec' : city ? '#6b8645' : '#536d3c'); c.fillStyle = g; c.fillRect(0, y0, W, y1 - y0);
  for (let row = 0, y = y0; y < y1 + 45; row++, y += 35) for (let x = -90 + row % 2 * 70; x < W + 90; x += 140) {
    c.fillStyle = `rgba(${rng() < 0.5 ? '210,227,154' : '10,30,30'},${0.02 + rng() * 0.035})`;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 70, y + 35); c.lineTo(x, y + 70); c.lineTo(x - 70, y + 35); c.fill();
  }
  for (let i = 0; i < 1000; i++) {
    const x = rng() * W, y = y0 + rng() * (y1 - y0);
    c.fillStyle = rng() > 0.5 ? '#b1ba7155' : '#183b3355'; c.fillRect(x, y, 1 + rng() * 3, 1 + rng() * 3);
  }
  c.restore();
}
function road(c, points, width) {
  c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = '#2c3329'; c.lineWidth = width + 12; c.stroke(); c.strokeStyle = '#8b7957'; c.lineWidth = width; c.stroke();
  c.strokeStyle = '#aa967344'; c.lineWidth = width * 0.68; c.stroke();
}
export function buildKingdomScene(pal, atlas) {
  const A = layer(), B = layer(), a = A.getContext('2d'), b = B.getContext('2d'), rng = mulberry32(729);
  const sky = a.createLinearGradient(0, 0, 0, 450); sky.addColorStop(0, pal.sky[0]); sky.addColorStop(1, pal.sky[2]); a.fillStyle = sky; a.fillRect(0, 0, W, H);
  for (let i = 0; i < 80; i++) { a.fillStyle = `rgba(225,239,255,${rng() * 0.6})`; a.fillRect(rng() * W, rng() * 340, 2, 2); }
  const glow = a.createRadialGradient(770, 295, 5, 770, 295, 150); glow.addColorStop(0, '#d7e9ff66'); glow.addColorStop(1, '#afccff00'); a.fillStyle = glow; a.fillRect(600, 125, 340, 340);
  a.fillStyle = pal.moon; a.beginPath(); a.arc(770, 295, 42, 0, Math.PI * 2); a.fill();
  ground(a, 400, H, pal.snow, rng);
  road(a, [[540, 385], [415, 580], [600, 810], [540, wallY]], 155);
  const forest = [];
  for (let i = 0; i < 32; i++) forest.push({ x: -20 + i * 36, y: 410 + rng() * 100, w: 120 + rng() * 70 });
  for (let i = 0; i < 14; i++) forest.push({ x: i % 2 ? 1060 : 20, y: 550 + Math.floor(i / 2) * 82, w: 95 + rng() * 45 });
  forest.sort((x, y) => x.y - y.y).forEach(p => atlas.draw(a, 'pines', p.x, p.y, p.w));
  ground(b, wallY + 100, H, pal.snow, rng, true);
  road(b, [[540, wallY + 130], [540, H]], 130);
  road(b, [[160, 1570], [540, 1690], [905, 1650]], 50);
  road(b, [[210, 1440], [540, 1540], [850, 1440]], 45);
  // Farm rows, stockpile and courtyard stones remain crisp under the transparent sprites.
  for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
    const x = 748 + col * 22 + row * 9, y = 1580 + row * 16;
    b.fillStyle = '#584832'; b.fillRect(x - 6, y, 16, 6); b.strokeStyle = '#d2b653'; b.lineWidth = 3; b.beginPath(); b.moveTo(x, y); b.lineTo(x + 1, y - 12); b.stroke();
  }
  b.fillStyle = '#696b61'; b.fillRect(470, 1650, 140, 65);
  for (let i = 0; i < 5; i++) { b.fillStyle = i % 2 ? '#9e7847' : '#795334'; b.fillRect(165 + i * 5, 1555 - i * 7, 65, 9); }
  // Wall: a deep walkway and readable front edge, with matching atlas bastions.
  b.fillStyle = '#3c4651'; b.fillRect(0, wallY + 20, W, 100);
  b.fillStyle = '#89919a'; b.fillRect(0, wallY - 5, W, 64);
  for (let row = 0; row < 3; row++) for (let x = -40 + row % 2 * 30; x < W; x += 60) { b.strokeStyle = '#65707b'; b.lineWidth = 2; b.strokeRect(x, wallY + row * 20, 60, 20); }
  b.fillStyle = '#b3b6ae'; b.fillRect(0, wallY - 14, W, 10);
  for (let x = 5; x < W; x += 52) { b.fillStyle = '#a3a9a8'; b.fillRect(x, wallY - 36, 34, 26); b.fillStyle = '#c1c4b8'; b.fillRect(x, wallY - 40, 34, 7); }
  for (const x of [60, 236, 452, 628, 844, 1020]) atlas.draw(b, 'tower', x, wallY + 104, x === 452 || x === 628 ? 118 : 98);
  b.fillStyle = '#322c23'; b.fillRect(506, wallY + 58, 68, 65); b.fillStyle = '#67472b'; b.fillRect(512, wallY + 60, 56, 63);
  for (let x = 519; x < 565; x += 11) { b.fillStyle = '#b3954e'; b.fillRect(x, wallY + 62, 3, 60); }
  return { A, B };
}
