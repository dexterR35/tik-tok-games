import * as THREE from 'three';

// Procedural textures drawn on canvases, so the game ships with no image files.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function marsGround() {
  const c = canvas(1024, 1024), g = c.getContext('2d'), r = rng(7);
  g.fillStyle = '#9c4a2a'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) {
    const x = r() * 1024, y = r() * 1024, s = 6 + r() * 70, l = 28 + r() * 22, a = 0.05 + r() * 0.08;
    g.fillStyle = `hsla(${14 + r() * 14},${45 + r() * 20}%,${l}%,${a})`;
    g.beginPath(); g.ellipse(x, y, s, s * (0.4 + r() * 0.6), r() * 3, 0, 7); g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const x = r() * 1024, y = r() * 1024, s = 0.6 + r() * 2.4;
    g.fillStyle = r() < 0.5 ? `rgba(40,16,8,${0.25 + r() * 0.4})` : `rgba(230,150,100,${0.15 + r() * 0.3})`;
    g.fillRect(x, y, s, s);
  }
  return tex(c, { repeat: [90, 90] });
}

export function plazaTiles() {
  const c = canvas(512, 512), g = c.getContext('2d'), r = rng(11);
  g.fillStyle = '#d9cfc4'; g.fillRect(0, 0, 512, 512);
  const n = 8, s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const l = 78 + r() * 10;
    g.fillStyle = `hsl(${24 + r() * 10},${10 + r() * 8}%,${l}%)`;
    g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
  }
  g.strokeStyle = 'rgba(80,60,50,.35)'; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke(); }
  return tex(c, { repeat: [6, 6] });
}

export function grass() {
  const c = canvas(512, 512), g = c.getContext('2d'), r = rng(5);
  g.fillStyle = '#3f7d34'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const x = r() * 512, y = r() * 512, h = 3 + r() * 7;
    g.strokeStyle = `hsl(${90 + r() * 35},${40 + r() * 25}%,${22 + r() * 26}%)`; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - h); g.stroke();
  }
  return tex(c, { repeat: [10, 10] });
}

export function wood() {
  const c = canvas(256, 256), g = c.getContext('2d'), r = rng(3);
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = `hsl(${24 + r() * 8},${35 + r() * 10}%,${34 + r() * 10}%)`; g.fillRect(0, y, 256, 31);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(30,15,5,${0.08 + r() * 0.12})`; g.beginPath(); const yy = y + r() * 31; g.moveTo(0, yy); g.bezierCurveTo(80, yy + r() * 4, 170, yy - r() * 4, 256, yy); g.stroke(); }
  }
  return tex(c, { repeat: [4, 4] });
}

// Night-time facade: a grid of lit windows. Emissive map for the skyline.
export function windows(seed, cool = false) {
  const c = canvas(256, 512), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512);
  const cols = 8, rows = 32, w = 256 / cols, h = 512 / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (r() < 0.58) continue;
    const warm = cool ? r() < 0.25 : r() < 0.75;
    const l = 45 + r() * 40;
    g.fillStyle = warm ? `hsl(${32 + r() * 15},90%,${l}%)` : `hsl(${185 + r() * 25},80%,${l}%)`;
    g.fillRect(x * w + 3, y * h + 3, w - 6, h - 5);
  }
  return tex(c);
}

export function facade(seed) {
  const c = canvas(256, 512), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#8b939c'; g.fillRect(0, 0, 256, 512);
  const cols = 8, rows = 32, w = 256 / cols, h = 512 / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    g.fillStyle = `hsl(210,${12 + r() * 10}%,${14 + r() * 14}%)`;
    g.fillRect(x * w + 3, y * h + 3, w - 6, h - 5);
  }
  return tex(c);
}

export function marsGlobe() {
  const c = canvas(1024, 512), g = c.getContext('2d'), r = rng(21);
  g.fillStyle = '#c1663b'; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 500; i++) {
    const x = r() * 1024, y = 60 + r() * 392, s = 10 + r() * 90;
    g.fillStyle = r() < 0.55 ? `rgba(90,35,20,${0.15 + r() * 0.25})` : `rgba(230,150,95,${0.1 + r() * 0.2})`;
    g.beginPath(); g.ellipse(x, y, s, s * 0.5, r() * 3, 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(60,20,12,.5)'; g.fillRect(250, 240, 380, 14); // Valles Marineris
  g.fillStyle = '#f4ede6'; g.fillRect(0, 0, 1024, 26); g.fillRect(0, 490, 1024, 22);
  return tex(c, { repeat: [1, 1] });
}

export function textSign(text, { w = 1024, h = 192, color = '#ff6a3d', font = '900 110px "Arial Black", Impact, sans-serif', glow = 28, bg = null } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = glow; g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 4);
  g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(text, w / 2, h / 2 + 4);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function stainedGlass(seed) {
  const c = canvas(256, 512), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#111'; g.fillRect(0, 0, 256, 512);
  const hues = [210, 265, 330, 45, 180, 15];
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `hsl(${hues[Math.floor(r() * hues.length)]},85%,${45 + r() * 20}%)`;
    g.beginPath(); const x = r() * 256, y = r() * 512; g.moveTo(x, y);
    for (let k = 0; k < 3; k++) g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 160);
    g.fill();
  }
  g.strokeStyle = '#1a1410'; g.lineWidth = 6;
  for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(r() * 256, r() * 512); g.lineTo(r() * 256, r() * 512); g.stroke(); }
  g.lineWidth = 14; g.strokeRect(0, 0, 256, 512);
  g.beginPath(); g.moveTo(0, 120); g.quadraticCurveTo(128, -40, 256, 120); g.stroke();
  const t = tex(c); return t;
}

export function roseWindow() {
  const c = canvas(512, 512), g = c.getContext('2d');
  g.translate(256, 256);
  const hues = [215, 280, 330, 45, 190];
  for (let ring = 5; ring >= 1; ring--) {
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `hsl(${hues[(i + ring) % hues.length]},85%,${48 + ring * 4}%)`;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, ring * 48, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#140f0c'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, ring * 48, 0, 7); g.stroke();
  }
  for (let i = 0; i < 16; i++) { g.rotate(Math.PI / 8); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 245); g.stroke(); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function padMarkings() {
  const c = canvas(1024, 1024), g = c.getContext('2d');
  g.fillStyle = '#3a3d42'; g.fillRect(0, 0, 1024, 1024);
  const r = rng(9);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.04})`; g.fillRect(r() * 1024, r() * 1024, 3, 3); }
  g.strokeStyle = '#f2c230'; g.lineWidth = 26; g.beginPath(); g.arc(512, 512, 380, 0, 7); g.stroke();
  g.lineWidth = 10; g.setLineDash([40, 30]); g.beginPath(); g.arc(512, 512, 450, 0, 7); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#f4f4f4'; g.font = '900 420px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', 512, 530);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function stripes(a = '#ffffff', b = '#d2452c', n = 8) {
  const c = canvas(256, 64), g = c.getContext('2d');
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * 256) / n, 0, 256 / n + 1, 64); }
  return tex(c);
}

export function heartSprite(emoji = '❤️') {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.font = '96px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Live canvas (LED wall / dance floor). Call draw(t) then mark needsUpdate.
export function liveCanvas(w, h, draw) {
  const c = canvas(w, h), g = c.getContext('2d'), t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { texture: t, update(time) { draw(g, w, h, time); t.needsUpdate = true; } };
}
