// TIMBER RIDGE — renderer, HUD, effects, audio, host controls and TikTok LIVE events.
import { Sim } from './sim.js';
import { PALETTES, buildLayers, buildClouds, buildSky, TILE, rgba } from './art.js';
import { JEEP } from './physics.js';
import { GIFT_TIERS, ACTIONS, ACTION_IDS, DEFAULT_GIFT_MAP, UPGRADES, UPGRADE_IDS, upgradeCost, effectiveTaps, clamp, steadyPower, FLOW } from './rules.js';
import { mulberry32 } from './terrain.js';

const W = 1080, H = 1920, AX = W * 0.42, AY = H * 0.56;
const SAVE_KEY = 'timber-ridge-2d-save-v1';
const params = new URLSearchParams(location.search);
const broadcast = params.has('broadcast');
const rangeKey = 'timber-ridge-restored-view-range-v1';
let viewRange = Math.min(26, Math.max(11, Number(localStorage.getItem(rangeKey)) || 18.6));
document.body.classList.toggle('broadcast', broadcast);

const cv = document.getElementById('game');
cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');

let save = {};
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { save = {}; }
const sim = new Sim(save);
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(sim.serialize())); } catch {} };
setInterval(persist, 3000);

/* ---------------- world look ---------------- */
let pal, layers, clouds, sky, worldKey = '';
function ensureWorld() {
  const key = sim.cfg.biome.id + ':' + sim.level;
  if (key === worldKey) return;
  worldKey = key;
  pal = PALETTES[sim.cfg.biome.id];
  layers = buildLayers(pal, sim.cfg.seed, H);
  clouds = buildClouds(pal, sim.cfg.seed);
  sky = buildSky(pal, W, H);
  ambient.length = 0;
}

const cam = { x: 0, y: 1, ppm: 58, shake: 0, sx: 0, sy: 0 };
const sx = x => (x - cam.x) * cam.ppm + AX + cam.sx;
const sy = y => (cam.y - y) * cam.ppm + AY + cam.sy;
const hash = n => { n = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d); n ^= n >>> 15; return ((n >>> 0) % 100000) / 100000; };

/* ---------------- particles ---------------- */
const parts = [], ambient = [], floaters = [];
function puff(x, y, vx, vy, life, size, color, kind = 'dust', grav = -0.4) {
  if (parts.length > 900) parts.shift();
  parts.push({ x, y, vx, vy, life, max: life, size, color, kind, grav, rot: Math.random() * 6 });
}
function burst(x, y, n, color, speed = 4, kind = 'dust', size = 0.25) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI, s = speed * (0.4 + Math.random());
    puff(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.6 + Math.random() * 0.8, size * (0.6 + Math.random()), color, kind, kind === 'dust' ? -0.5 : 9);
  }
}
function floatText(text, x, y, color = '#fff', size = 46) { floaters.push({ text, x, y, color, size, t: 0 }); }

/* ---------------- messages / feed ---------------- */
let banner = null;            // big centre message
const feed = [];              // recent viewer actions
const giftPops = [];          // large gift banners
const avatars = new Map();
function avatar(url) {
  if (!url) return null;
  let img = avatars.get(url);
  if (!img) {
    img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = url; avatars.set(url, img);
    if (avatars.size > 300) avatars.delete(avatars.keys().next().value);
  }
  return img.complete && img.naturalWidth ? img : null;
}
function say(title, sub = '', color = '#ffffff', dur = 2.4) { banner = { title, sub, color, t: 0, dur }; }
function pushFeed(icon, user, text, color, av) { feed.unshift({ icon, user: String(user || '').slice(0, 18), text, color, av, t: 0 }); feed.length = Math.min(feed.length, 6); }

/* ---------------- audio ---------------- */
const audio = { on: false, ctx: null };
function audioInit() {
  if (audio.ctx) return;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const master = ac.createGain(); master.gain.value = 0.0; master.connect(ac.destination);
  const filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 600; filt.connect(master);
  const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 50;
  const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 25;
  const g2 = ac.createGain(); g2.gain.value = 0.5;
  o1.connect(filt); o2.connect(g2); g2.connect(filt); o1.start(); o2.start();
  Object.assign(audio, { ctx: ac, master, filt, o1, o2 });
}
function blip(freq, dur = 0.12, type = 'sine', vol = 0.18) {
  if (!audio.on || !audio.ctx) return;
  const ac = audio.ctx, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, ac.currentTime); o.frequency.exponentialRampToValueAtTime(freq * 1.6, ac.currentTime + dur);
  g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
function setSound(on) {
  audio.on = on; if (on) { audioInit(); audio.ctx.resume(); }
  if (audio.master) audio.master.gain.value = on ? 0.09 : 0;
  const b = document.getElementById('soundBtn'); if (b) b.textContent = on ? 'SOUND ON' : 'SOUND OFF';
}
function audioTick() {
  if (!audio.on || !audio.ctx) return;
  const j = sim.jeep, rpm = Math.abs(j.wheels[0].omega) * 0.46;
  const thr = sim.state === 'drive' && sim.fuel > 0 ? 0.35 + 0.65 * sim.tapPower : 0;
  const f = 38 + rpm * 5.5 + thr * 25 + (sim.effects.nitro > 0 ? 30 : 0);
  audio.o1.frequency.setTargetAtTime(f, audio.ctx.currentTime, 0.05);
  audio.o2.frequency.setTargetAtTime(f / 2, audio.ctx.currentTime, 0.05);
  audio.filt.frequency.setTargetAtTime(300 + thr * 900 + rpm * 30, audio.ctx.currentTime, 0.05);
}

/* ---------------- sim events → effects ---------------- */
let finishInfo = null, countPulse = 0, goT = 0;
function handleSimEvents() {
  for (const e of sim.events) {
    const j = sim.jeep;
    switch (e.type) {
      case 'level': finishInfo = null; break;
      case 'checkpoint': say('CHECKPOINT', `${e.x} m`, '#7dff9a', 1.6); burst(e.x, sim.terrain.height(e.x) + 1, 30, '#ffe066', 6, 'confetti', 0.12); blip(880); break;
      case 'pickup':
        if (e.kind === 'coin') { floatText(`+${sim.cfg.coinValue}`, e.x, e.y + 0.4, '#ffd84a', 40); burst(e.x, e.y, 6, '#fff4a0', 3, 'spark', 0.08); blip(1320, 0.08); }
        else { floatText('FUEL +45%', e.x, e.y + 0.6, '#ff6b5a', 48); burst(e.x, e.y, 14, '#ff8a6a', 4, 'spark', 0.1); blip(500, 0.2, 'triangle'); }
        break;
      case 'land': cam.shake = Math.min(1, cam.shake + e.power * 0.05); for (const w of j.wheels) if (w.grounded) burst(w.cx, w.cy, Math.min(26, 6 + e.power * 2), rgba(pal.dust, 0.7), 3, 'dust', 0.35); break;
      case 'crash': cam.shake = 1.4; say('CRASH!', 'Respawning at the checkpoint…', '#ff5a5a', 2.2); burst(e.x, e.y, 40, '#d9d9d9', 7, 'spark', 0.12); burst(e.x, e.y, 20, rgba(pal.dust, 0.8), 4, 'dust', 0.5); blip(90, 0.5, 'sawtooth', 0.3); break;
      case 'respawn': if (e.rescue) say('RESCUE SHIELD', 'The crowd has your back!', '#7fe7ff', 2); break;
      case 'empty': say('OUT OF FUEL', 'FOLLOW or send a gift to refuel!', '#ff9a3c', 3); break;
      case 'refuel': say('EMERGENCY FUEL', 'Back to the checkpoint', '#ffb347', 2); break;
      case 'finish': finishInfo = e; for (let i = 0; i < 4; i++) burst(j.x + i * 2, j.y + 2, 40, ['#ff4f8b', '#ffd84a', '#38e8ff', '#7dff5a'][i], 9, 'confetti', 0.14); blip(660, 0.4, 'triangle'); break;
      case 'autoupgrade': pushFeed('🔧', 'GARAGE', e.bought.map(b => UPGRADES[b].name).join(' + '), '#ffd84a'); break;
      case 'upgrade': pushFeed('🔧', 'GARAGE', `${UPGRADES[e.id].name} LV ${e.level}`, '#ffd84a'); break;
      case 'gift': {
        const a = ACTIONS[e.action], big = e.action !== 'nitro' || e.count >= 5;
        const label = `${a.label}${e.count > 1 ? ' ×' + e.count : ''}`;
        pushFeed(a.icon, e.user, e.banked ? `${label} · SAVED FOR GO` : label, a.color, e.avatar);
        if (big) giftPops.unshift({ user: e.user, av: e.avatar, label: `${e.name ? e.name + ' → ' : ''}${label}`, color: a.color, t: 0, tier: e.action === 'monster' ? 3 : 1, banked: e.banked });
        giftPops.length = Math.min(giftPops.length, 3);
        burst(j.x, j.y + 1, e.action === 'monster' ? 46 : 18, a.color, e.action === 'monster' ? 9 : 6, 'spark', 0.1);
        floatText(`+${e.wallet}`, j.x, j.y + 2.8, '#ffd84a', 44);
        blip(e.action === 'monster' ? 1000 : 600, 0.25, 'square', 0.12);
        if (e.action === 'monster') cam.shake = 1;
        break;
      }
      case 'bank': say('GIFT BOOSTS RELEASED!', `${e.gifts} saved gift${e.gifts > 1 ? 's' : ''} fire now`, '#ffd84a', 2.2); burst(j.x, j.y + 1, 50, '#ffd84a', 8, 'confetti', 0.12); break;
      case 'count': countPulse = 1; blip(520, 0.15, 'square', 0.15); break;
      case 'go': goT = 1.1; blip(1040, 0.35, 'square', 0.2); break;
      case 'crowdpush': say('THE CROWD PUSHES!', 'Free power + grip — keep tapping!', '#7dff5a', 2.4); break;
      case 'crowdlift': say('CROWD LIFT!', 'Carried over the obstacle', '#38e8ff', 2.2); burst(j.x, j.y, 30, '#38e8ff', 6, 'confetti', 0.12); break;
      case 'fantap': break;
      case 'follow': pushFeed('➕', e.user, 'FOLLOW · FUEL +12%', '#ff6b5a', e.avatar); break;
      case 'share': pushFeed('↗', e.user, 'SHARE · GRIP +6s', '#7dff5a', e.avatar); break;
      case 'jump': pushFeed(e.mega ? '🚀' : '⤴', e.user || 'CROWD', e.mega ? 'MEGA JUMP!' : 'JUMP!', '#38e8ff'); burst(j.x, j.y - 0.5, 16, rgba(pal.dust, 0.7), 4, 'dust', 0.35); break;
    }
  }
  sim.events.length = 0;
}

/* ---------------- drawing: background ---------------- */
function drawBackground(t) {
  ctx.drawImage(sky, 0, 0);
  // sun rays
  if (pal.rays) {
    const [px, py] = [pal.sunPos[0] * W, pal.sunPos[1] * H];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = 1.6 + i * 0.22 + Math.sin(t * 0.2 + i) * 0.03 + (pal.sunPos[0] < 0.5 ? -0.9 : 0);
      const g = ctx.createLinearGradient(px, py, px + Math.cos(a) * 1500, py + Math.sin(a) * 1500);
      g.addColorStop(0, rgba(pal.sunGlow, 0.12)); g.addColorStop(1, rgba(pal.sunGlow, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a - 0.05) * 1600, py + Math.sin(a - 0.05) * 1600); ctx.lineTo(px + Math.cos(a + 0.05) * 1600, py + Math.sin(a + 0.05) * 1600); ctx.fill();
    }
    ctx.restore();
  }
  // clouds
  for (let i = 0; i < clouds.length; i++) {
    const span = W + 700;
    const x = ((i * 430 - cam.x * cam.ppm * 0.02 - t * (8 + i * 3)) % span + span) % span - 520;
    ctx.globalAlpha = 0.85; ctx.drawImage(clouds[i], x, 80 + i * 95 + Math.sin(i * 3) * 40, 560 * (0.8 + (i % 3) * 0.2), 320 * (0.8 + (i % 3) * 0.2)); ctx.globalAlpha = 1;
  }
  // birds
  if (!pal.moon) {
    ctx.strokeStyle = 'rgba(30,30,40,0.6)'; ctx.lineWidth = 3;
    const bx = ((t * 60) % (W + 600)) - 300;
    for (let k = 0; k < 5; k++) {
      const x = bx + k * 46 - (k % 2) * 20, y = 420 + k * 18 + Math.sin(t * 2 + k) * 8, f = Math.sin(t * 10 + k) * 8;
      ctx.beginPath(); ctx.moveTo(x - 14, y - f); ctx.quadraticCurveTo(x - 6, y - 6, x, y); ctx.quadraticCurveTo(x + 6, y - 6, x + 14, y - f); ctx.stroke();
    }
  }
  // parallax layers (vertical parallax follows the camera height a little)
  for (const L of layers) {
    const off = ((cam.x * cam.ppm * L.f) % TILE + TILE) % TILE;
    const y = clamp(cam.y * cam.ppm * L.vy, -420, 420) + (L.f > 0.5 ? 40 : 0);
    for (let x = -off; x < W; x += TILE) ctx.drawImage(L.img, x, y);
  }
  // valley fog
  const fg = ctx.createLinearGradient(0, H * 0.45, 0, H * 0.75);
  fg.addColorStop(0, rgba(pal.fog, 0)); fg.addColorStop(0.6, rgba(pal.fog, pal.fogA * 0.5)); fg.addColorStop(1, rgba(pal.fog, 0));
  ctx.fillStyle = fg; ctx.fillRect(0, H * 0.45, W, H * 0.3);
}

/* ---------------- drawing: terrain ---------------- */
function surfacePath(x0, x1, step, depth = 0) {
  const tr = sim.terrain;
  ctx.beginPath();
  for (let x = x0; x <= x1 + step; x += step) {
    const px = sx(x), py = sy(tr.height(x) - depth);
    if (x === x0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
}

function drawTerrain(t) {
  const tr = sim.terrain, ppm = cam.ppm;
  const x0 = cam.x - (AX + 40) / ppm, x1 = cam.x + (W - AX + 40) / ppm, step = 6 / ppm;
  // dirt body
  surfacePath(x0, x1, step);
  ctx.lineTo(W + 50, H + 50); ctx.lineTo(-50, H + 50); ctx.closePath();
  const top = sy(tr.height(cam.x) + 4);
  const dg = ctx.createLinearGradient(0, top, 0, top + 14 * ppm);
  dg.addColorStop(0, pal.dirt[0]); dg.addColorStop(0.35, pal.dirt[1]); dg.addColorStop(1, pal.dirt[2]);
  ctx.fillStyle = dg; ctx.fill();
  // strata following the surface
  ctx.save(); ctx.clip();
  for (const [d, w, a] of [[0.55, 0.5, 0.18], [1.5, 0.35, 0.14], [2.8, 0.6, 0.12], [4.6, 0.4, 0.1]]) {
    surfacePath(x0, x1, step * 2, d);
    ctx.strokeStyle = `rgba(0,0,0,${a})`; ctx.lineWidth = w * ppm; ctx.stroke();
  }
  // stones, roots and soil streaks (they scroll with the ground, so speed is easy to see)
  for (let cx = Math.floor(x0 * 2) / 2; cx < x1; cx += 0.5) {
    const id = Math.round(cx * 2);
    for (let k = 0; k < 3; k++) {
      const hsh = hash(id * 7 + k * 131 + 9);
      if (hsh > 0.7) continue;
      const px = cx + hash(id * 13 + k) * 0.5, d = 0.35 + hash(id * 17 + k * 3) * 4;
      const rx = (0.05 + hash(id + k * 5) * 0.13) * ppm, y = sy(tr.ground(px) - d);
      ctx.fillStyle = hsh < 0.25 ? 'rgba(255,240,220,0.16)' : 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx(px), y, rx, rx * 0.65, hsh * 3, 0, Math.PI * 2); ctx.fill();
      if (hsh < 0.1) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(sx(px) - rx * 0.25, y - rx * 0.2, rx * 0.35, rx * 0.2, 0, 0, 7); ctx.fill(); }
    }
    if (hash(id * 3 + 77) < 0.12) {   // roots
      const px = cx, y = sy(tr.ground(px) - 0.3);
      ctx.strokeStyle = 'rgba(40,22,10,0.45)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx(px), y); ctx.quadraticCurveTo(sx(px + 0.3), y + 0.4 * ppm, sx(px + 0.6), y + 0.3 * ppm); ctx.stroke();
    }
  }
  ctx.restore();
  // grass / snow cap
  surfacePath(x0, x1, step);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.grassDark; ctx.lineWidth = 0.42 * ppm; ctx.stroke();
  ctx.save(); ctx.translate(0, -0.06 * ppm); surfacePath(x0, x1, step); ctx.strokeStyle = pal.grass; ctx.lineWidth = 0.28 * ppm; ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(0, -0.17 * ppm); surfacePath(x0, x1, step); ctx.strokeStyle = pal.grassHi; ctx.lineWidth = 0.06 * ppm; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.restore();
  // grass tufts and flowers
  if (!pal.snowGround) {
    for (let gx = Math.floor(x0 / 0.22) * 0.22; gx < x1; gx += 0.22) {
      const id = Math.round(gx / 0.22), r = hash(id * 3 + 1);
      if (r > 0.85) continue;
      const bx = sx(gx), by = sy(tr.height(gx)) + 2;
      const hgt = (0.14 + r * 0.22) * ppm, sway = Math.sin(t * 2 + gx) * 0.05 * ppm;
      ctx.fillStyle = r < 0.25 ? pal.grassHi : pal.grass;
      ctx.beginPath(); ctx.moveTo(bx - 4, by); ctx.lineTo(bx - 7 + sway, by - hgt * 0.8); ctx.lineTo(bx, by - 1); ctx.lineTo(bx + sway, by - hgt); ctx.lineTo(bx + 3, by - 1); ctx.lineTo(bx + 8 + sway, by - hgt * 0.7); ctx.lineTo(bx + 5, by); ctx.fill();
      if (r < 0.06 && pal.flowers.length) { ctx.fillStyle = pal.flowers[id % pal.flowers.length]; ctx.beginPath(); ctx.arc(bx + sway, by - hgt, 5, 0, 7); ctx.fill(); }
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let gx = Math.floor(x0); gx < x1; gx += 0.5) { const r = hash(Math.round(gx * 2)); if (r < 0.3) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + gx * 5); ctx.fillRect(sx(gx), sy(tr.height(gx)) - 6, 3, 3); } }
    ctx.globalAlpha = 1;
  }
  // obstacles
  // small stones lying on the track
  for (let gx = Math.floor(x0 / 0.9) * 0.9; gx < x1; gx += 0.9) {
    const id = Math.round(gx / 0.9), r = hash(id * 11 + 5);
    if (r > 0.45 || tr.zoneAt(gx)) continue;
    const px = gx + r, rr = (0.05 + r * 0.12) * ppm, y = sy(tr.height(px));
    ctx.fillStyle = pal.rock[1]; ctx.beginPath(); ctx.ellipse(sx(px), y - rr * 0.35, rr, rr * 0.6, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = pal.rock[0]; ctx.beginPath(); ctx.ellipse(sx(px) - rr * 0.3, y - rr * 0.55, rr * 0.4, rr * 0.25, 0, 0, 7); ctx.fill();
  }
  for (const z of tr.zones) if (z.x1 > x0 && z.x0 < x1) drawZone(z, t);
  for (const st of tr.steps) if (st.x > x0 - 3 && st.x < x1 + 3) drawLedge(st);
  for (const o of tr.obstacles) {
    if (o.x < x0 - 3 || o.x > x1 + 3) continue;
    if (o.type === 'log') drawLog(o); else drawRock(o);
  }
}

// 80° rock ledge / cliff: a layered stone face covering the step
function drawLedge(st) {
  const tr = sim.terrain, ppm = cam.ppm, rnd = mulberry32(st.seed);
  const up = st.H > 0, top = up ? st.x + st.w : st.x, bot = up ? st.x : st.x + st.w;
  const yTop = tr.ground(top + (up ? 0.02 : -0.02)), yBot = tr.ground(bot);
  const hi = Math.max(yTop, yBot), lo = Math.min(yTop, yBot);
  const l = st.x - (up ? 0.25 : 0.6), r = st.x + st.w + (up ? 0.6 : 0.25);
  ctx.beginPath();
  ctx.moveTo(sx(l), sy(lo - 0.35));
  const n = 9;
  for (let i = 0; i <= n; i++) { const x = l + ((r - l) * i) / n; ctx.lineTo(sx(x), sy(Math.max(tr.ground(x) + (i % 2 ? 0.05 : -0.02), lo - 0.3))); }
  ctx.lineTo(sx(r), sy(lo - 0.35)); ctx.closePath();
  const g = ctx.createLinearGradient(sx(l), sy(hi), sx(r), sy(lo));
  g.addColorStop(0, pal.rock[0]); g.addColorStop(0.5, pal.rock[1]); g.addColorStop(1, pal.rock[2]);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3; ctx.stroke();
  // strata cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
  const layers = Math.max(1, Math.round((hi - lo) / 0.22));
  for (let k = 1; k <= layers; k++) {
    const y = lo + ((hi - lo) * k) / (layers + 1);
    ctx.beginPath(); ctx.moveTo(sx(l + 0.1 + rnd() * 0.2), sy(y)); ctx.lineTo(sx(r - 0.1 - rnd() * 0.2), sy(y + (rnd() - 0.5) * 0.06)); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(sx(up ? top - 0.05 : l), sy(hi) - 3, Math.abs(r - l) * ppm * 0.5, 4);
  if (!pal.snowGround) { ctx.fillStyle = pal.moss; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(sx(up ? top + 0.25 : l + 0.3), sy(hi) - 2, 0.35 * ppm, 0.07 * ppm, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(sx(up ? top + 0.2 : l + 0.25), sy(hi) - 2, 0.4 * ppm, 0.08 * ppm, 0, 0, 7); ctx.fill(); }
}

// traps: mud pit (glossy brown with bubbles) or ice sheet
function drawZone(z, t) {
  const tr = sim.terrain, ppm = cam.ppm;
  const a = Math.max(z.x0, cam.x - AX / ppm - 2), b = Math.min(z.x1, cam.x + (W - AX) / ppm + 2);
  ctx.beginPath();
  for (let x = a; x <= b; x += 0.25) { const p = [sx(x), sy(tr.ground(x) + 0.03)]; x === a ? ctx.moveTo(...p) : ctx.lineTo(...p); }
  for (let x = b; x >= a; x -= 0.25) ctx.lineTo(sx(x), sy(tr.ground(x) - 0.35));
  ctx.closePath();
  if (z.type === 'mud') {
    ctx.fillStyle = '#4a3020'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.lineWidth = 4;
    ctx.beginPath(); for (let x = a; x <= b; x += 0.25) { const p = [sx(x), sy(tr.ground(x) + 0.02)]; x === a ? ctx.moveTo(...p) : ctx.lineTo(...p); } ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const bx = z.x0 + ((k * 1.7 + t * 0.2) % (z.x1 - z.x0)), ph = (t * 1.3 + k) % 1;
      if (bx < a || bx > b) continue;
      ctx.strokeStyle = `rgba(120,90,60,${1 - ph})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(bx), sy(tr.ground(bx)) - 3, 4 + ph * 10, Math.PI, 0); ctx.stroke();
    }
    if (z.x0 > a - 1) text('MUD', sx(z.x0 + 1.2), sy(tr.ground(z.x0 + 1.2) + 0.9), 24, '#d9a066', 'center');
  } else {
    const g = ctx.createLinearGradient(0, sy(tr.ground(a) + 0.05), 0, sy(tr.ground(a) - 0.35));
    g.addColorStop(0, 'rgba(220,245,255,0.95)'); g.addColorStop(1, 'rgba(140,200,240,0.8)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
    for (let x = Math.ceil(a); x < b; x += 1.3) { ctx.beginPath(); ctx.moveTo(sx(x), sy(tr.ground(x)) + 2); ctx.lineTo(sx(x + 0.4), sy(tr.ground(x + 0.4)) + 2); ctx.stroke(); }
    if (z.x0 > a - 1) text('ICE', sx(z.x0 + 1.2), sy(tr.ground(z.x0 + 1.2) + 0.9), 24, '#bfe9ff', 'center');
  }
}

function drawRock(o) {
  const tr = sim.terrain, rnd = mulberry32(o.seed), ppm = cam.ppm;
  const pts = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n, x = o.x + u * o.w * 1.02;
    const jit = i === 0 || i === n ? 0 : (rnd() - 0.5) * 0.08;
    pts.push([sx(x), sy(tr.base(x) + Math.max(0, Math.cos(u * Math.PI / 2) ** 1.4 * o.h + jit))]);
  }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] + 10);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.lineTo(pts[n][0], pts[n][1] + 10); ctx.closePath();
  const g = ctx.createLinearGradient(sx(o.x - o.w), sy(tr.base(o.x) + o.h), sx(o.x + o.w * 0.6), sy(tr.base(o.x)));
  g.addColorStop(0, pal.rock[0]); g.addColorStop(0.55, pal.rock[1]); g.addColorStop(1, pal.rock[2]);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.stroke();
  // cracks + moss/snow
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx(o.x - o.w * 0.2), sy(tr.base(o.x) + o.h * 0.8)); ctx.lineTo(sx(o.x), sy(tr.base(o.x) + o.h * 0.45)); ctx.lineTo(sx(o.x + o.w * 0.1), sy(tr.base(o.x) + o.h * 0.2)); ctx.stroke();
  ctx.fillStyle = pal.moss; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.ellipse(sx(o.x - o.w * 0.15), sy(tr.base(o.x) + o.h * 0.97), o.w * 0.45 * ppm, 0.07 * ppm, -0.08, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawLog(o) {
  const tr = sim.terrain, ppm = cam.ppm, cx = sx(o.x), cy = sy(tr.base(o.x) + o.r * 0.98), r = o.r * ppm;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, sy(tr.base(o.x)) + 2, r * 1.3, r * 0.25, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#4a2e1a'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r * 0.85);
  g.addColorStop(0, '#e9c48a'); g.addColorStop(1, '#b98552');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 0.84, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(110,65,30,0.55)'; ctx.lineWidth = 2;
  for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.arc(cx + k, cy, r * 0.2 * k, 0, 7); ctx.stroke(); }
  ctx.strokeStyle = '#2e1b0e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  if (pal.snowGround) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.9, r * 0.8, r * 0.25, 0, Math.PI, 0); ctx.fill(); }
}

function drawPickups(t) {
  const tr = sim.terrain, ppm = cam.ppm;
  const x0 = cam.x - AX / ppm - 2, x1 = cam.x + (W - AX) / ppm + 2;
  for (const p of tr.pickups) {
    if (p.taken || p.x < x0) continue;
    if (p.x > x1) break;
    const bob = Math.sin(t * 3 + p.x) * 0.08;
    const px = sx(p.x), py = sy(p.y + bob);
    if (p.type === 'coin') {
      const sc = Math.abs(Math.cos(t * 3 + p.x * 0.7)), r = 0.28 * ppm;
      ctx.save(); ctx.translate(px, py); ctx.scale(Math.max(0.15, sc), 1);
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
      g.addColorStop(0, '#fff7b0'); g.addColorStop(0.5, '#ffcf2e'); g.addColorStop(1, '#c98a0a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#a86e05'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#b97a06'; ctx.font = `900 ${r * 1.1}px Arial Black, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', 0, 1);
      ctx.restore();
    } else {
      const s = 0.42 * ppm;
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.sin(t * 2) * 0.08);
      ctx.shadowColor = 'rgba(255,80,60,0.8)'; ctx.shadowBlur = 25;
      ctx.fillStyle = '#d8261f'; roundRect(-s * 0.7, -s, s * 1.4, s * 2, s * 0.25); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff5246'; roundRect(-s * 0.6, -s * 0.9, s * 0.5, s * 1.8, s * 0.15); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(-s * 0.3, -s * 1.3, s * 0.6, s * 0.35);
      ctx.fillStyle = '#ffd84a'; ctx.font = `900 ${s * 0.9}px Arial Black, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('F', 0, s * 0.1);
      ctx.restore();
    }
  }
}

// roadside posts every 10 m and distance signs every 50 m — they rush past the jeep
function drawRoadside() {
  const tr = sim.terrain, ppm = cam.ppm;
  const x0 = cam.x - (AX + 60) / ppm, x1 = cam.x + (W - AX + 60) / ppm;
  for (let x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) {
    if (x <= 0 || x >= tr.finish || tr.checkpoints.includes(x)) continue;
    const gx = x + 0.6, by = sy(tr.height(gx)) + 6, px = sx(gx), h = 1.1 * ppm;
    if (x % 50 === 0) {
      ctx.fillStyle = '#5a3b22'; ctx.fillRect(px - 5, by - h * 1.5, 10, h * 1.5);
      ctx.fillStyle = '#f2e2b8'; roundRect(px - 0.62 * ppm, by - h * 1.5 - 0.5 * ppm, 1.24 * ppm, 0.5 * ppm, 8); ctx.fill();
      ctx.strokeStyle = '#5a3b22'; ctx.lineWidth = 4; ctx.stroke();
      text(`${x} m`, px, by - h * 1.5 - 0.25 * ppm, 0.3 * ppm, '#3a2410', 'center', 900, false);
    } else {
      ctx.fillStyle = '#ece6da'; ctx.fillRect(px - 6, by - h, 12, h);
      ctx.fillStyle = '#e33'; ctx.fillRect(px - 6, by - h, 12, h * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 2, by - h, 4, h);
    }
  }
}

function drawMarkers(t) {
  const tr = sim.terrain, ppm = cam.ppm;
  const vis = x => x > cam.x - AX / ppm - 3 && x < cam.x + (W - AX) / ppm + 5;
  for (const c of tr.checkpoints) {
    if (!vis(c)) continue;
    const bx = sx(c), by = sy(tr.height(c)), top = by - 3.2 * ppm, passed = sim.checkpoint >= c;
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, top); ctx.stroke();
    ctx.fillStyle = passed ? '#3fe07a' : '#ff9f1a';
    ctx.beginPath(); ctx.moveTo(bx, top);
    for (let i = 0; i <= 10; i++) ctx.lineTo(bx + i * 0.12 * ppm, top + Math.sin(t * 6 + i * 0.7) * 6 * (i / 10));
    for (let i = 10; i >= 0; i--) ctx.lineTo(bx + i * 0.12 * ppm, top + 0.7 * ppm + Math.sin(t * 6 + i * 0.7) * 6 * (i / 10));
    ctx.fill();
    text(`${c} m`, bx + 0.6 * ppm, top + 0.36 * ppm, 30, '#fff', 'center');
  }
  const f = tr.finish;
  if (vis(f) || vis(f + 4)) {
    const by = sy(tr.height(f)), h = 5 * ppm, l = sx(f - 1.6), r = sx(f + 1.6);
    for (const px of [l, r]) { ctx.fillStyle = '#333'; ctx.fillRect(px - 9, by - h, 18, h); ctx.fillStyle = '#ffd84a'; ctx.fillRect(px - 9, by - h, 18, 24); }
    const bh = 0.9 * ppm, cells = 16, cw = (r - l) / cells;
    for (let i = 0; i < cells; i++) for (let k = 0; k < 2; k++) { ctx.fillStyle = (i + k) % 2 ? '#111' : '#fff'; ctx.fillRect(l + i * cw, by - h + k * bh / 2, cw + 1, bh / 2); }
    text('FINISH', (l + r) / 2, by - h - 34, 64, '#ffd84a', 'center');
  }
}

/* ---------------- drawing: jeep ---------------- */
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// Mud-terrain tyre with chevron lugs and a beadlock rim, drawn in screen space.
function drawTire(wh, glowColor, gripOn) {
  const R = JEEP.wheelRadius * cam.ppm, px = sx(wh.x), py = sy(wh.y);
  ctx.save(); ctx.translate(px, py);
  // contact shadow
  if (wh.grounded) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, R * 0.98, R * 0.9, R * 0.12, 0, 0, 7); ctx.fill(); }
  ctx.rotate(-wh.rot);
  if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = 34; }
  ctx.fillStyle = '#17171a'; ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  // chevron lugs
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, off = i % 2 ? 0.05 : -0.05, wA = 0.105;
    ctx.save(); ctx.rotate(a + off);
    ctx.fillStyle = '#232327';
    ctx.beginPath(); ctx.moveTo(R * 0.8, -R * wA * 0.9); ctx.lineTo(R * 1.0, -R * wA * 0.7); ctx.lineTo(R * 1.0, R * wA * 0.7); ctx.lineTo(R * 0.8, R * wA * 0.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(R * 0.96, -R * wA * 0.7, R * 0.04, R * wA * 1.4);
    ctx.restore();
  }
  // sidewall
  ctx.strokeStyle = gripOn ? '#7dff5a' : '#2c2c31'; ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.arc(0, 0, R * 0.74, 0, 7); ctx.stroke();
  ctx.fillStyle = '#1d1d21'; ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = R * 0.035;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, R * 0.66, i * Math.PI / 2 + 0.25, i * Math.PI / 2 + 1.1); ctx.stroke(); }
  // beadlock rim
  ctx.fillStyle = '#2d3036'; ctx.beginPath(); ctx.arc(0, 0, R * 0.56, 0, 7); ctx.fill();
  ctx.fillStyle = '#c8ccd2';
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.025, 0, 7); ctx.fill(); }
  const g = ctx.createRadialGradient(-R * 0.12, -R * 0.12, R * 0.05, 0, 0, R * 0.46);
  g.addColorStop(0, '#9aa1aa'); g.addColorStop(1, '#4b5058');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 0.45, 0, 7); ctx.fill();
  ctx.fillStyle = '#16181c';
  for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate((i / 8) * Math.PI * 2); roundRect(R * 0.17, -R * 0.045, R * 0.22, R * 0.09, R * 0.04); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = '#ff3d3d'; ctx.beginPath(); ctx.arc(0, 0, R * 0.12, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8eaee'; ctx.beginPath(); ctx.arc(0, 0, R * 0.06, 0, 7); ctx.fill();
  ctx.restore();
  // spin blur
  if (Math.abs(wh.omega) > 14) {
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = R * 0.12;
    ctx.beginPath(); ctx.arc(px, py, R * 0.88, 0, 7); ctx.stroke();
  }
}

function coil(x1, y1, x2, y2, w, turns, color, lw) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y1);
  for (let i = 1; i <= turns * 2; i++) { const t = i / (turns * 2), s = i % 2 ? w : -w; ctx.lineTo(x1 + dx * t + nx * s, y1 + dy * t + ny * s); }
  ctx.lineTo(x2, y2); ctx.stroke();
}

function drawJeep(t) {
  const j = sim.jeep, ppm = cam.ppm, night = !!pal.dark;
  const monster = sim.effects.power > 0 && sim.effects.shield > 0;
  ctx.save();
  ctx.translate(sx(j.x), sy(j.y)); ctx.scale(ppm, -ppm); ctx.rotate(j.a);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // headlight beams
  if (night) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(2.3, 0.4, 12, 0.4);
    g.addColorStop(0, 'rgba(255,240,180,0.5)'); g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(2.3, 0.5); ctx.lineTo(12, 2.2); ctx.lineTo(12, -2.0); ctx.lineTo(2.3, 0.3); ctx.fill();
    const g2 = ctx.createLinearGradient(0.2, 1.7, 14, 1.2);
    g2.addColorStop(0, 'rgba(220,240,255,0.35)'); g2.addColorStop(1, 'rgba(220,240,255,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(0.3, 1.75); ctx.lineTo(14, 3.6); ctx.lineTo(14, -1); ctx.lineTo(0.3, 1.62); ctx.fill();
    ctx.restore();
  }
  // shield bubble / power aura
  if (sim.effects.shield > 0) {
    const p = 0.5 + 0.5 * Math.sin(t * 8);
    const g = ctx.createRadialGradient(0, 0.1, 1.6, 0, 0.1, 3.2);
    g.addColorStop(0, 'rgba(120,230,255,0)'); g.addColorStop(0.8, `rgba(120,230,255,${0.12 + p * 0.15})`); g.addColorStop(1, 'rgba(180,250,255,0.6)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0.1, 3.2, 0, 7); ctx.fill();
  }
  if (sim.effects.power > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -0.3, 0.6, 0, -0.3, 3.0);
    g.addColorStop(0, 'rgba(255,140,40,0.35)'); g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -0.3, 3.2, 2.0, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  // wheel centres in the chassis frame
  const wl = j.wheels.map(w => j.toLocal(w.x, w.y));
  // chassis frame rail + trailing arms + coilovers
  ctx.strokeStyle = '#1c1e22'; ctx.lineWidth = 0.16;
  ctx.beginPath(); ctx.moveTo(-2.1, -0.3); ctx.lineTo(2.15, -0.3); ctx.stroke();
  wl.forEach(([wx, wy], i) => {
    const [ax, ay] = JEEP.attach[i];
    ctx.strokeStyle = '#3a3e45'; ctx.lineWidth = 0.13;
    ctx.beginPath(); ctx.moveTo(i ? 0.35 : -0.35, -0.42); ctx.lineTo(wx, wy); ctx.stroke();       // trailing arm
    ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.moveTo(i ? 0.25 : -0.25, -0.2); ctx.lineTo(wx, wy + 0.1); ctx.stroke();  // upper link
    // coilover: silver shock body + bright spring
    const tx = ax, ty = ay + 0.12;
    ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 0.13; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + (wx - tx) * 0.55, ty + (wy - ty) * 0.55); ctx.stroke();
    ctx.strokeStyle = '#6b717b'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(wx, wy); ctx.stroke();
    coil(tx, ty - 0.05, tx + (wx - tx) * 0.82, ty + (wy - ty) * 0.82, 0.12, 7, monster ? '#ff3d6e' : '#ffcc1a', 0.05);
  });
  // spare tyre on the tailgate
  ctx.fillStyle = '#16161a'; ctx.beginPath(); ctx.arc(-2.48, 0.42, 0.5, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2b2b30'; ctx.lineWidth = 0.09; ctx.beginPath(); ctx.arc(-2.48, 0.42, 0.42, 0, 7); ctx.stroke();
  ctx.fillStyle = '#4b5058'; ctx.beginPath(); ctx.arc(-2.48, 0.42, 0.25, 0, 7); ctx.fill();
  // antenna + flag
  const sw = Math.sin(t * 7) * 0.08 - clamp(j.vx * 0.015, -0.25, 0.3);
  ctx.strokeStyle = '#222'; ctx.lineWidth = 0.03;
  ctx.beginPath(); ctx.moveTo(-2.0, 0.75); ctx.quadraticCurveTo(-2.05 + sw, 2.0, -2.15 + sw * 2, 2.85); ctx.stroke();
  ctx.fillStyle = '#ff3d6e'; ctx.beginPath(); ctx.moveTo(-2.15 + sw * 2, 2.85); ctx.lineTo(-2.7 + sw * 2, 2.68 + Math.sin(t * 9) * 0.06); ctx.lineTo(-2.14 + sw * 2, 2.55); ctx.fill();
  // roll cage
  ctx.strokeStyle = '#25282e'; ctx.lineWidth = 0.12;
  ctx.beginPath(); ctx.moveTo(-1.95, 0.72); ctx.lineTo(-1.75, 1.72); ctx.lineTo(0.32, 1.64); ctx.moveTo(-0.95, 0.72); ctx.lineTo(-0.82, 1.68); ctx.moveTo(-1.75, 1.72); ctx.lineTo(-0.95, 0.72); ctx.stroke();
  // roof rack + jerry can
  ctx.fillStyle = '#1c1e22'; ctx.fillRect(-1.8, 1.72, 2.1, 0.08);
  ctx.fillStyle = '#c62a22'; roundRect(-1.6, 1.8, 0.55, 0.38, 0.06); ctx.fill();
  ctx.fillStyle = '#2f6b3a'; roundRect(-0.95, 1.8, 0.75, 0.3, 0.06); ctx.fill();
  // LED light bar
  ctx.fillStyle = '#111'; roundRect(-0.6, 1.64, 0.98, 0.14, 0.05); ctx.fill();
  for (let k = 0; k < 5; k++) { ctx.fillStyle = night ? '#fff7c8' : '#e3e8ee'; ctx.beginPath(); ctx.arc(-0.5 + k * 0.2, 1.71, 0.045, 0, 7); ctx.fill(); }
  // driver
  const bob = Math.sin(t * 9) * 0.015 * Math.min(1, j.speed / 6);
  ctx.fillStyle = '#2a64c9'; roundRect(-0.85, 0.66 + bob, 0.48, 0.6, 0.12); ctx.fill();
  ctx.strokeStyle = '#2a64c9'; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(-0.5, 1.12 + bob); ctx.lineTo(-0.1, 0.98); ctx.lineTo(0.05, 1.02); ctx.stroke();
  ctx.fillStyle = '#f1c29c'; ctx.beginPath(); ctx.arc(-0.62, 1.42 + bob, 0.19, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.arc(-0.63, 1.46 + bob, 0.21, Math.PI * 0.02, Math.PI * 1.05); ctx.fill();
  ctx.fillStyle = '#ff3d6e'; ctx.fillRect(-0.83, 1.5 + bob, 0.4, 0.06);
  ctx.fillStyle = '#1c2a3a'; roundRect(-0.52, 1.36 + bob, 0.14, 0.1, 0.03); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(-0.05, 0.82); ctx.lineTo(0.12, 1.1); ctx.stroke();
  // body tub
  const body = [[-2.25, -0.15], [-2.28, 0.74], [-1.0, 0.74], [-0.86, 0.66], [0.55, 0.7], [2.1, 0.62], [2.32, 0.4], [2.34, -0.05], [2.25, -0.15]];
  ctx.beginPath(); body.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  const bg = ctx.createLinearGradient(0, 0.74, 0, -0.15);
  bg.addColorStop(0, monster ? '#ff7a9a' : '#ff8a3d'); bg.addColorStop(0.5, monster ? '#d81b50' : '#e8501f'); bg.addColorStop(1, monster ? '#6e0a26' : '#7a220a');
  ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = '#2a0e04'; ctx.lineWidth = 0.04; ctx.stroke();
  // hood stripe, door, panel lines
  ctx.fillStyle = '#16171a'; ctx.beginPath(); ctx.moveTo(0.6, 0.7); ctx.lineTo(2.08, 0.62); ctx.lineTo(2.1, 0.52); ctx.lineTo(0.62, 0.58); ctx.fill();
  ctx.strokeStyle = 'rgba(40,10,0,0.55)'; ctx.lineWidth = 0.03; ctx.strokeRect(-0.95, 0.0, 1.3, 0.62);
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0.12, 0.42, 0.16, 0.04);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-0.3, 0.3, 0.22, 0, 7); ctx.fill();
  ctx.save(); ctx.scale(1, -1); ctx.fillStyle = '#16171a'; ctx.font = '900 0.3px "Arial Black", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(sim.level % 100), -0.3, -0.29); ctx.restore();
  // mud splatter
  ctx.fillStyle = 'rgba(70,45,25,0.55)';
  for (let k = 0; k < 14; k++) { const mx = -2.2 + k * 0.33 + hash(k) * 0.1, my = -0.1 + hash(k + 50) * 0.28; ctx.beginPath(); ctx.arc(mx, my, 0.04 + hash(k + 9) * 0.07, 0, 7); ctx.fill(); }
  // fender flares
  ctx.fillStyle = '#1b1c20';
  for (const cx of [-1.48, 1.52]) { ctx.beginPath(); ctx.moveTo(cx - 1.0, -0.17); ctx.lineTo(cx - 0.72, 0.2); ctx.lineTo(cx + 0.72, 0.2); ctx.lineTo(cx + 1.0, -0.17); ctx.closePath(); ctx.fill(); }
  // rock slider, bumpers, winch, tow hook
  ctx.fillStyle = '#2a2c31'; roundRect(-0.5, -0.28, 1.0, 0.12, 0.05); ctx.fill();
  roundRect(2.15, -0.25, 0.32, 0.5, 0.06); ctx.fill();
  ctx.fillStyle = '#4b5058'; ctx.fillRect(2.2, -0.08, 0.22, 0.16);
  ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(2.5, -0.18, 0.07, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a2c31'; roundRect(-2.42, -0.22, 0.26, 0.36, 0.05); ctx.fill();
  // grille + headlight + taillight
  ctx.fillStyle = '#1a1a1a'; for (let k = 0; k < 4; k++) ctx.fillRect(2.3, 0.0 + k * 0.09, 0.06, 0.05);
  ctx.fillStyle = night ? '#fffbe0' : '#fff3a8'; ctx.beginPath(); ctx.arc(2.24, 0.46, 0.1, 0, 7); ctx.fill();
  if (night) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const lg = ctx.createRadialGradient(2.26, 0.46, 0, 2.26, 0.46, 0.7); lg.addColorStop(0, 'rgba(255,240,180,0.8)'); lg.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(2.26, 0.46, 0.7, 0, 7); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = '#ff2a2a'; ctx.fillRect(-2.32, 0.46, 0.07, 0.16);
  // snorkel
  ctx.strokeStyle = '#141518'; ctx.lineWidth = 0.1;
  ctx.beginPath(); ctx.moveTo(1.3, 0.62); ctx.lineTo(0.62, 0.74); ctx.lineTo(0.44, 1.48); ctx.stroke();
  ctx.fillStyle = '#141518'; roundRect(0.3, 1.44, 0.3, 0.14, 0.04); ctx.fill();
  // windshield
  ctx.fillStyle = 'rgba(170,220,255,0.42)'; ctx.beginPath(); ctx.moveTo(0.56, 0.72); ctx.lineTo(0.36, 1.58); ctx.lineTo(0.26, 1.58); ctx.lineTo(0.44, 0.72); ctx.fill();
  ctx.strokeStyle = '#25282e'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(0.58, 0.7); ctx.lineTo(0.34, 1.64); ctx.stroke();
  // exhaust + nitro flame
  ctx.fillStyle = '#6c7078'; ctx.fillRect(-2.5, 0.05, 0.28, 0.08);
  if (sim.effects.nitro > 0 && sim.state === 'drive' && sim.fuel > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const len = 1.1 + Math.random() * 0.7;
    const fg = ctx.createLinearGradient(-2.5, 0, -2.5 - len, 0);
    fg.addColorStop(0, 'rgba(255,255,255,0.95)'); fg.addColorStop(0.25, 'rgba(120,230,255,0.9)'); fg.addColorStop(0.7, 'rgba(90,90,255,0.6)'); fg.addColorStop(1, 'rgba(160,60,255,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-2.48, 0.15); ctx.quadraticCurveTo(-2.5 - len * 0.5, 0.32, -2.5 - len, 0.08); ctx.quadraticCurveTo(-2.5 - len * 0.5, -0.14, -2.48, 0.02); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // tyres last (outer side of the truck)
  const glow = sim.effects.power > 0 ? 'rgba(255,120,30,0.9)' : null;
  for (const w of j.wheels) drawTire(w, glow, sim.effects.grip > 0);
}

const speedLines = [];
function drawSpeedLines(dt) {
  const v = Math.max(0, sim.jeep.vx), k = clamp((v - 7) / 12, 0, 1);
  if (k > 0 && speedLines.length < 26 && Math.random() < k * 0.9) speedLines.push({ x: W + 40, y: H * 0.18 + Math.random() * H * 0.55, len: 80 + Math.random() * 220, sp: 2200 + Math.random() * 1400 });
  ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.3 * k})`; ctx.lineWidth = 3;
  for (let i = speedLines.length - 1; i >= 0; i--) {
    const l = speedLines[i]; l.x -= l.sp * dt * (0.4 + k);
    if (l.x + l.len < -20) { speedLines.splice(i, 1); continue; }
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x + l.len, l.y); ctx.stroke();
  }
}

/* ---------------- fans: tappers' avatars running behind the jeep ---------------- */
const fanDraw = new Map();
const FAN_COLORS = ['#38e8ff', '#7dff5a', '#ffb02e', '#ff7aa8', '#c78bff', '#ffd84a', '#5ad1ff'];
function drawFans(t, dt) {
  const j = sim.jeep, tr = sim.terrain, ppm = cam.ppm;
  // stable order (first to join runs closest), so the line doesn't reshuffle on every tap
  const list = sim.activeFans(6).sort((a, b) => a.first - b.first);
  const king = list.reduce((m, f) => (f.taps > (m?.taps || 0) ? f : m), null);
  const alive = new Set();
  list.forEach((f, i) => {
    alive.add(f.name);
    let d = fanDraw.get(f.name);
    const tx = j.x - 3.5 - i * 1.45;
    if (!d) { d = { x: tx - 2, y: tr.height(tx - 2), vy: 0, phase: Math.random() * 6, pulse: 0, color: FAN_COLORS[hash(f.name.length * 31 + f.name.charCodeAt(0)) * FAN_COLORS.length | 0], taps: f.taps }; fanDraw.set(f.name, d); }
    if (f.taps > d.taps) { d.pulse = 1; d.taps = f.taps; }
    const nx = d.x + (tx - d.x) * (1 - Math.exp(-dt * 5));
    d.phase += Math.abs(nx - d.x) * 3.2 + dt * 2;
    d.x = nx;
    const g = tr.height(d.x);
    // little hop when the ground jumps (ledges), otherwise stick to the ground
    if (g > d.y + 0.05) { d.vy = Math.max(d.vy, 4); }
    d.vy -= 14 * dt; d.y += d.vy * dt;
    if (d.y < g) { d.y = g; d.vy = 0; }
    d.pulse = Math.max(0, d.pulse - dt * 2.5);
    const px = sx(d.x), py = sy(d.y), s = ppm / 40;
    const run = Math.sin(d.phase), headR = (19 + d.pulse * 7) * s;
    // legs
    ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = 7 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py - 30 * s); ctx.lineTo(px + run * 13 * s, py - 4 * s); ctx.moveTo(px, py - 30 * s); ctx.lineTo(px - run * 13 * s, py - 4 * s); ctx.stroke();
    // body
    ctx.fillStyle = d.color; roundRect(px - 11 * s, py - 56 * s, 22 * s, 30 * s, 9 * s); ctx.fill();
    // arms (cheer when tapping)
    ctx.strokeStyle = d.color; ctx.lineWidth = 6 * s;
    const up = d.pulse > 0.2 ? -26 : -6;
    ctx.beginPath(); ctx.moveTo(px - 9 * s, py - 50 * s); ctx.lineTo(px - 20 * s, py + (up - 34 - run * 6) * s); ctx.moveTo(px + 9 * s, py - 50 * s); ctx.lineTo(px + 20 * s, py + (up - 34 + run * 6) * s); ctx.stroke();
    // avatar head
    const hy = py - 56 * s - headR + 4 * s;
    avatarCircle(avatar(f.avatar), px, hy, headR, f.name, d.color);
    if (f.gifted) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, hy, headR + 3, 0, 7); ctx.stroke(); }
    const crown = f === king && f.taps > 3;
    if (crown) text('👑', px, hy - headR - 10 * s, 22 * s, '#fff', 'center', 400, false);
    text(f.name.slice(0, 8), px, hy - headR - (crown ? 30 : 12) * s - (i % 2) * 18 * s, 15 * s, '#fff', 'center', 800);
    if (d.pulse > 0.9) floatText('❤', d.x, d.y + 2.2, '#ff5a8a', 34);
  });
  for (const k of fanDraw.keys()) if (!alive.has(k)) fanDraw.delete(k);
}

/* ---------------- particles: update + draw ---------------- */
function spawnDriving(dt) {
  const j = sim.jeep, tr = sim.terrain;
  j.wheels.forEach(w => {
    if (!w.grounded) return;
    const spd = Math.abs(w.omega * JEEP.wheelRadius), slip = Math.abs(w.slip), zone = tr.zoneAt(w.cx);
    const rate = (Math.abs(j.vx) * 1.2 + slip * 9) * (zone ? 1.6 : 1);
    let n = rate * dt;
    while (n > 0) {
      if (Math.random() < n) {
        if (zone && zone.type === 'mud') puff(w.cx - 0.3, w.cy + 0.15, -2 - Math.random() * 3 - slip * 0.5, 2 + Math.random() * 3, 0.9, 0.09 + Math.random() * 0.08, '#4a3020', 'chunk', 9);
        else if (zone) puff(w.cx - 0.3, w.cy + 0.1, -1.5 - Math.random() * 2, 1 + Math.random() * 2, 0.5, 0.06, '#eaffff', 'spark', 6);
        else if (pal.snowGround) puff(w.cx - 0.3, w.cy + 0.1, -1.4 - Math.random() * 2, 1 + Math.random() * 1.8, 0.8, 0.22, 'rgba(255,255,255,0.8)', 'dust', -0.1);
        else {
          puff(w.cx - 0.3, w.cy + 0.1, -1.3 - Math.random() * 2 - slip * 0.4, 0.8 + Math.random() * 1.6, 0.7 + Math.random() * 0.6, 0.2 + Math.random() * 0.22, rgba(pal.dust, 0.55), 'dust', -0.2);
          if (slip > 2.5 && Math.random() < 0.4) puff(w.cx - 0.3, w.cy + 0.15, -2 - Math.random() * 2, 2 + Math.random() * 2.5, 0.8, 0.06 + Math.random() * 0.05, pal.dirt[0], 'chunk', 9);
        }
      }
      n--;
    }
  });
  if (sim.state === 'drive' && sim.fuel > 0 && Math.random() < dt * (5 + sim.tapPower * 16)) {
    const [ex, ey] = j.toWorld(-2.55, 0.09);
    if (sim.effects.nitro > 0) puff(ex, ey, -3 + Math.random(), (Math.random() - 0.5), 0.3, 0.06, '#9ef0ff', 'spark', 0);
    else puff(ex, ey, -0.8, 0.6, 1.0, 0.14, sim.tapPower > 0.6 ? 'rgba(60,60,60,0.45)' : 'rgba(130,130,130,0.35)', 'dust', -0.6);
  }
}
function drawParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.2; p.rot += dt * 6;
    const a = p.life / p.max, px = sx(p.x), py = sy(p.y);
    if (p.kind === 'chunk') { ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(px, py, p.size * cam.ppm, 0, 7); ctx.fill(); }
    else if (p.kind === 'dust') { ctx.globalAlpha = a * 0.8; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(px, py, p.size * cam.ppm * (1.6 - a * 0.6), 0, 7); ctx.fill(); }
    else if (p.kind === 'spark') { ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = p.size * cam.ppm * 0.4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - p.vx * 4, py + p.vy * 4); ctx.stroke(); }
    else { ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.save(); ctx.translate(px, py); ctx.rotate(p.rot); ctx.fillRect(-p.size * cam.ppm / 2, -p.size * cam.ppm / 4, p.size * cam.ppm, p.size * cam.ppm / 2); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt; if (f.t > 1.4) { floaters.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - f.t / 1.4; text(f.text, sx(f.x), sy(f.y + f.t * 1.2), f.size, f.color, 'center'); ctx.globalAlpha = 1;
  }
}
function drawAmbient(t, dt) {
  const kind = pal.ambient;
  if (!kind) return;
  const want = kind === 'snow' ? 90 : 40;
  while (ambient.length < want) ambient.push({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random(), ph: Math.random() * 7, c: pal.ambientColors[Math.floor(Math.random() * pal.ambientColors.length)] });
  const v = sim.jeep.vx * cam.ppm;
  for (const a of ambient) {
    if (kind === 'snow') { a.y += (60 + a.s * 80) * dt; a.x += (Math.sin(t + a.ph) * 30 - v * 0.6 * a.s) * dt; }
    else if (kind === 'firefly') { a.x += (Math.sin(t * 0.7 + a.ph) * 30 - v * 0.3 * a.s) * dt; a.y += Math.cos(t * 0.9 + a.ph) * 20 * dt; }
    if (a.y > H + 20) { a.y = -20; a.x = Math.random() * W; }
    if (a.x < -30) a.x += W + 60; if (a.x > W + 30) a.x -= W + 60;
    if (kind === 'firefly' && a.y < H * 0.3) a.y = H * 0.75;
    ctx.fillStyle = a.c;
    if (kind === 'snow') { ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(a.x, a.y, 3 + a.s * 3, 0, 7); ctx.fill(); }
    else if (kind === 'firefly') { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + a.ph); ctx.shadowColor = a.c; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
  }
  ctx.globalAlpha = 1;
}

/* ---------------- HUD ---------------- */
function text(str, x, y, size, color, align = 'left', weight = 900, stroke = true) {
  ctx.font = `${weight} ${size}px "Arial Black", Impact, "Segoe UI", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size * 0.16); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function panel(x, y, w, h, r = 22, a = 0.55) { ctx.fillStyle = `rgba(8,12,20,${a})`; roundRect(x, y, w, h, r); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.stroke(); }
function coinIcon(x, y, r) { const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r); g.addColorStop(0, '#fff7b0'); g.addColorStop(0.6, '#ffc61a'); g.addColorStop(1, '#b07a05'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
function avatarCircle(img, x, y, r, fallback, color = '#555') {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.closePath();
  if (img) { ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else { ctx.fillStyle = color; ctx.fill(); text((fallback || '?').slice(0, 1).toUpperCase(), x, y + 2, r, '#fff', 'center', 900, false); }
  ctx.restore(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
}
const fmt = n => Math.floor(n).toLocaleString('en-US');

function drawHUD(t, dt) {
  const j = sim.jeep, tr = sim.terrain;
  // top: level + coins
  const tg = ctx.createLinearGradient(0, 0, 0, 300); tg.addColorStop(0, 'rgba(0,0,0,0.55)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 300);
  panel(36, 34, 300, 92, 24, 0.6);
  text(`LEVEL ${sim.level}`, 60, 66, 40, '#ffe680');
  text(sim.cfg.biome.name, 60, 106, 22, '#cfe8ff', 'left', 800, false);
  panel(W - 336, 34, 300, 92, 24, 0.6);
  coinIcon(W - 296, 80, 24);
  text(fmt(sim.coins), W - 260, 82, 44, '#ffd84a');
  text('TIMBER RIDGE', W / 2, 80, 34, '#ffffff', 'center');
  // progress bar
  const bx = 50, by = 158, bw = W - 100, bh = 30;
  panel(bx - 8, by - 8, bw + 16, bh + 16, 22, 0.55);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(bx, by, bw, bh, 15); ctx.fill();
  const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0); pg.addColorStop(0, '#7dff5a'); pg.addColorStop(1, '#ffd84a');
  ctx.fillStyle = pg; roundRect(bx, by, Math.max(30, bw * sim.progress), bh, 15); ctx.fill();
  for (const c of tr.checkpoints) { const cx = bx + bw * (c / tr.finish); ctx.fillStyle = sim.checkpoint >= c ? '#1d6b2e' : 'rgba(255,255,255,0.7)'; ctx.fillRect(cx - 2, by + 4, 4, bh - 8); }
  text('🏁', bx + bw - 4, by + bh / 2, 30, '#fff', 'center', 400, false);
  const jx = bx + bw * sim.progress;
  ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.arc(jx, by + bh / 2, 20, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
  text(`${fmt(Math.max(0, j.x))} / ${fmt(tr.finish)} m`, W / 2, by + bh + 34, 30, '#ffffff', 'center');
  // effect chips
  const effs = [['nitro', 'NITRO', '#38e8ff', 20], ['grip', 'GRIP', '#7dff5a', 45], ['power', 'POWER', '#ffb02e', 45], ['shield', 'SHIELD', '#ff3d6e', 30]].filter(e => sim.effects[e[0]] > 0);
  let ex = W / 2 - (effs.length * 190 - 14) / 2;
  for (const [k, label, color, cap] of effs) {
    panel(ex, 250, 176, 56, 18, 0.65);
    ctx.fillStyle = color; roundRect(ex + 8, 290, 160 * Math.min(1, sim.effects[k] / Math.min(cap, 15)), 8, 4); ctx.fill();
    text(`${label} ${sim.effects[k].toFixed(1)}s`, ex + 88, 270, 24, color, 'center');
    ex += 190;
  }

  // leaderboard (right)
  const lb = sim.leaderboard(5);
  if (lb.length) {
    const lx = W - 356, ly = 330;
    panel(lx, ly, 320, 64 + lb.length * 66, 24, 0.55);
    text('TOP CREW', lx + 160, ly + 34, 28, '#ffe680', 'center');
    lb.forEach((p, i) => {
      const y = ly + 92 + i * 66;
      avatarCircle(avatar(p.avatar), lx + 46, y, 24, p.name, ['#ffb800', '#c0c0c0', '#cd7f32', '#557', '#557'][i]);
      text(p.name.slice(0, 11), lx + 82, y - 10, 22, '#fff', 'left', 800);
      text(`${fmt(p.score)} pts`, lx + 82, y + 16, 19, '#9fe6ff', 'left', 800, false);
      text(`#${i + 1}`, lx + 296, y, 26, i === 0 ? '#ffd84a' : '#ddd', 'right');
    });
  }
  // event feed (left)
  feed.forEach((f, i) => {
    f.t += dt / 6;
    const y = 340 + i * 74, a = clamp(1.6 - f.t * 1.6 + 1, 0, 1);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    panel(36, y, 400, 62, 31, 0.6);
    avatarCircle(avatar(f.av), 68, y + 31, 24, f.user, f.color);
    text(f.user, 104, y + 20, 21, '#fff', 'left', 800);
    text(`${f.icon} ${f.text}`, 104, y + 44, 20, f.color, 'left', 800, false);
    ctx.globalAlpha = 1;
  });
  for (let i = feed.length - 1; i >= 0; i--) if (feed[i].t > 1.6) feed.splice(i, 1);

  // co-pilot tag over the jeep
  if (sim.copilot && sim.time - sim.copilot.t < 60) {
    const px = sx(j.x - 0.4), py = sy(j.y + 2.7);
    ctx.globalAlpha = 0.95; panel(px - 150, py - 32, 300, 60, 30, 0.7);
    avatarCircle(avatar(sim.copilot.avatar), px - 118, py - 2, 22, sim.copilot.name, '#ff3d6e');
    text('CO-PILOT', px - 86, py - 14, 16, '#ff9ab8', 'left', 800, false);
    text(sim.copilot.name.slice(0, 13), px - 86, py + 10, 22, '#fff', 'left', 900);
    ctx.globalAlpha = 1;
  }

  // gift banners
  giftPops.forEach((g, i) => {
    g.t += dt;
    const life = g.tier >= 3 ? 4 : 2.6;
    if (g.t > life) return;
    const sIn = Math.min(1, g.t * 5), a = Math.min(1, (life - g.t) * 3);
    const y = 560 + i * 120;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, y); ctx.scale(0.7 + 0.3 * sIn, 0.7 + 0.3 * sIn);
    const gg = ctx.createLinearGradient(-330, 0, 330, 0); gg.addColorStop(0, 'rgba(0,0,0,0.75)'); gg.addColorStop(0.5, g.color); gg.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = gg; roundRect(-340, -50, 680, 100, 50); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore(); ctx.save(); ctx.globalAlpha = a;
    avatarCircle(avatar(g.av), W / 2 - 280, y, 38, g.user, g.color);
    text(String(g.user).slice(0, 16), W / 2 - 225, y - 20, 28, '#fff', 'left');
    text(g.label.slice(0, 30), W / 2 - 225, y + 20, 28, '#fff', 'left');
    if (g.banked) text('SAVED FOR GO', W / 2 + 320, y - 30, 20, '#ffd84a', 'right');
    ctx.restore();
  });
  for (let i = giftPops.length - 1; i >= 0; i--) if (giftPops[i].t > 4.2) giftPops.splice(i, 1);

  // big centre banner
  if (banner) {
    banner.t += dt;
    const k = banner.t / banner.dur;
    if (k >= 1) banner = null;
    else {
      const pop = Math.min(1, banner.t * 6), out = Math.min(1, (1 - k) * 5), s = 0.6 + 0.4 * pop + Math.sin(banner.t * 10) * 0.01;
      ctx.save(); ctx.globalAlpha = out; ctx.translate(W / 2, H * 0.32); ctx.scale(s, s);
      text(banner.title, 0, 0, 96, banner.color, 'center');
      if (banner.sub) text(banner.sub, 0, 82, 36, '#ffffff', 'center', 800);
      ctx.restore();
    }
  }

  // bottom dashboard
  const top = H - 470;
  const bg = ctx.createLinearGradient(0, top - 60, 0, H); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(0.25, 'rgba(0,0,0,0.6)'); bg.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = bg; ctx.fillRect(0, top - 60, W, H - top + 60);
  // speedometer
  const kmh = Math.max(0, j.vx * 3.6);
  gauge(170, top + 110, 100, kmh / 120, '#38e8ff', `${Math.round(kmh)}`, 'KM/H');
  // fuel
  const fuelK = sim.fuel / sim.stats.tank;
  gauge(W - 170, top + 110, 100, fuelK, fuelK < 0.2 ? (Math.sin(t * 10) > 0 ? '#ff3b3b' : '#ffb02e') : '#ff6b5a', `${Math.round(fuelK * 100)}%`, 'FUEL');
  // crowd power
  const cpx = 320, cpw = W - 640, cpy = top + 40;
  text('CROWD POWER', W / 2, cpy, 30, '#ffffff', 'center');
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(cpx, cpy + 30, cpw, 44, 22); ctx.fill();
  const cg = ctx.createLinearGradient(cpx, 0, cpx + cpw, 0); cg.addColorStop(0, '#ff3d6e'); cg.addColorStop(0.5, '#ffb02e'); cg.addColorStop(1, '#7dff5a');
  ctx.fillStyle = cg; roundRect(cpx, cpy + 30, Math.max(44, cpw * sim.tapPower), 44, 22); ctx.fill();
  text(`${Math.round(sim.tapPower * 100)}%`, W / 2, cpy + 53, 30, '#fff', 'center');
  const pulse = 1 + Math.sin(t * 9) * 0.06 * (sim.tapPower < 0.3 ? 1 : 0.3);
  ctx.save(); ctx.translate(W / 2, cpy + 128); ctx.scale(pulse, pulse);
  text(sim.locked ? '⏳ GET READY TO TAP!' : sim.tapPower < 0.04 ? '❤ TAP TAP — THE JEEP WAITS FOR YOU! ❤' : sim.tapPower < 0.3 ? '❤ TAP FASTER! ❤' : '❤ KEEP TAPPING! ❤', 0, 0, 32, '#ff7aa8', 'center'); ctx.restore();
  // gift menu (host's list first, then coin tiers)
  const rows = sim.giftMap.slice(0, 4);
  const tiles = rows.length ? rows.map(r => ({ icon: ACTIONS[r.action].icon, title: r.name, sub: ACTIONS[r.action].label, color: ACTIONS[r.action].color }))
    : GIFT_TIERS.map(g => ({ icon: ACTIONS[g.action].icon, title: g.label, sub: `${g.range} coins`, color: g.color }));
  const gy = top + 236, gw = (W - 80 - (tiles.length - 1) * 14) / tiles.length;
  tiles.forEach((g, i) => {
    const x = 40 + i * (gw + 14);
    panel(x, gy, gw, 128, 20, 0.6);
    ctx.fillStyle = g.color; roundRect(x, gy, gw, 10, 5); ctx.fill();
    text(g.icon, x + gw / 2, gy + 40, 34, '#fff', 'center', 400, false);
    text(g.title.slice(0, 13), x + gw / 2, gy + 78, 22, '#fff', 'center');
    text(g.sub, x + gw / 2, gy + 106, 18, g.color, 'center', 800, false);
  });
  text('❤ TAP = GAS   💬 "jump" = HOP   ➕ FOLLOW = FUEL   ↗ SHARE = GRIP', W / 2, H - 82, 23, '#e8f4ff', 'center', 800);
  text('Other gifts by coins: 1+ NITRO · 10+ TRACTION · 100+ POWER · 1000+ MONSTER', W / 2, H - 42, 19, '#9fb4cc', 'center', 700, false);
  // night grade handled in frame; state hint
  if (sim.state === 'empty') text(`REFUEL IN ${Math.max(0, 6 - sim.stateT).toFixed(0)}s — or FOLLOW / GIFT!`, W / 2, H * 0.42, 40, '#ffb347', 'center');
}

// Level card + gift menu, 3-2-1 countdown, GO, finish summary
function drawFlow(t, dt) {
  const st = sim.state;
  if (st === 'intro' || st === 'countdown') {
    const fade = st === 'intro' ? Math.min(1, sim.stateT * 4) : Math.max(0, 1 - sim.stateT * 2.5);
    if (fade > 0) {
      ctx.save(); ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      const rows = sim.giftMap.slice(0, 7), ph = 250 + rows.length * 62 + 70;
      const y0 = 330;
      panel(110, y0, W - 220, ph, 36, 0.82);
      text(`LEVEL ${sim.level}`, W / 2, y0 + 70, 84, '#ffe680', 'center');
      text(`${sim.cfg.biome.name} · ${fmt(sim.cfg.length)} m`, W / 2, y0 + 140, 34, '#cfe8ff', 'center', 800);
      text('🎁 GIFT MENU', W / 2, y0 + 205, 34, '#ffffff', 'center');
      rows.forEach((r, i) => {
        const a = ACTIONS[r.action], y = y0 + 262 + i * 62;
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(160, y - 26, W - 320, 52, 26); ctx.fill();
        text(a.icon, 200, y, 30, '#fff', 'center', 400, false);
        text(r.name.slice(0, 18), 240, y, 28, '#fff', 'left', 800);
        text(a.label, W - 190, y, 26, a.color, 'right');
      });
      text('Other gifts: by coin value', W / 2, y0 + ph - 38, 22, '#9fb4cc', 'center', 700, false);
      ctx.restore();
    }
  }
  if (st === 'countdown') {
    const n = sim.countdown, k = sim.stateT % 1, s = 1.5 - Math.min(1, k * 3) * 0.5;
    ctx.save(); ctx.translate(W / 2, H * 0.36); ctx.scale(s, s); ctx.globalAlpha = 1 - Math.max(0, k - 0.75) * 4;
    ctx.strokeStyle = ['#7dff5a', '#ffb02e', '#ff3d6e'][n - 1]; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(0, 0, 150, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); ctx.stroke();
    text(String(n), 0, 8, 220, '#ffffff', 'center');
    ctx.restore();
  }
  if (sim.locked && sim.bank.gifts) {
    panel(W / 2 - 250, H * 0.36 + 190, 500, 64, 32, 0.75);
    text(`🎁 ${sim.bank.gifts} gift boost${sim.bank.gifts > 1 ? 's' : ''} ready for GO`, W / 2, H * 0.36 + 222, 28, '#ffd84a', 'center');
  }
  if (goT > 0) {
    goT -= dt;
    ctx.save(); ctx.translate(W / 2, H * 0.36); const s = 1 + (1.1 - goT) * 0.6; ctx.scale(s, s); ctx.globalAlpha = Math.min(1, goT * 2);
    text('GO!', 0, 0, 200, '#7dff5a', 'center'); ctx.restore();
  }
  if (st === 'finish' && finishInfo) {
    const k = Math.min(1, sim.stateT * 3), left = Math.max(0, FLOW.finish - sim.stateT);
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
    const y0 = 420;
    panel(120, y0, W - 240, 520, 36, 0.85);
    text('🏁 LEVEL COMPLETE', W / 2, y0 + 70, 60, '#7dff5a', 'center');
    const m = Math.floor(finishInfo.time / 60), sec = Math.floor(finishInfo.time % 60);
    text(`TIME  ${m}:${String(sec).padStart(2, '0')}`, W / 2, y0 + 150, 40, '#fff', 'center');
    coinIcon(W / 2 - 150, y0 + 220, 22); text(`+${fmt(finishInfo.levelCoins)} coins`, W / 2 - 115, y0 + 222, 40, '#ffd84a', 'left');
    if (finishInfo.mvp) {
      const p = sim.players.get(finishInfo.mvp);
      text('MVP TAPPER', W / 2, y0 + 300, 26, '#ff9ab8', 'center', 800);
      avatarCircle(avatar(p?.avatar), W / 2 - 150, y0 + 362, 38, finishInfo.mvp, '#ff3d6e');
      text(finishInfo.mvp.slice(0, 16), W / 2 - 96, y0 + 364, 38, '#fff', 'left');
    }
    text(`NEXT LEVEL IN ${Math.ceil(left)}…`, W / 2, y0 + 450, 34, '#9fe6ff', 'center');
    text('Gifts now are saved for the next start ✓', W / 2, y0 + 494, 22, '#c8d6e6', 'center', 700, false);
    ctx.restore();
  }
}

function gauge(x, y, r, k, color, value, label) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 20; ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * clamp(k, 0, 1)); ctx.stroke();
  ctx.lineCap = 'butt';
  text(value, x, y - 4, 54, '#fff', 'center');
  text(label, x, y + 46, 22, color, 'center', 800, false);
}

/* ---------------- frame ---------------- */
let last = performance.now(), simT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; simT += dt;
  demoCrowd(dt);
  sim.update(dt);
  ensureWorld();
  handleSimEvents();
  const j = sim.jeep;
  // camera
  const ahead = [3, 7, 11].reduce((s, d) => s + sim.terrain.height(j.x + d), 0) / 3;
  // soft camera: the jeep visibly surges forward on screen when it accelerates, then the view catches up
  const tx = j.x + clamp(j.vx * 0.3, -1, 4), ty = j.y * 0.7 + ahead * 0.3 + 0.6;
  const k = 1 - Math.exp(-dt * 1.8);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * (1 - Math.exp(-dt * 3));
  if (Math.abs(cam.x - j.x) > 30) { cam.x = tx; cam.y = ty; }
  cam.ppm += (58 * 18.6 / viewRange - clamp(j.speed, 0, 26) * 0.45 - cam.ppm) * (1 - Math.exp(-dt * 1.5));
  cam.shake = Math.max(0, cam.shake - dt * 2.2);
  cam.sx = (Math.random() - 0.5) * cam.shake * 26; cam.sy = (Math.random() - 0.5) * cam.shake * 26;

  drawBackground(simT);
  if (pal.dark) { ctx.fillStyle = `rgba(0,5,25,${pal.dark})`; ctx.fillRect(0, 0, W, H); }
  drawMarkers(simT);
  drawTerrain(simT);
  drawRoadside();
  drawPickups(simT);
  spawnDriving(dt);
  drawFans(simT, dt);
  drawJeep(simT);
  drawSpeedLines(dt);
  drawParts(dt);
  if (pal.dark) { ctx.fillStyle = 'rgba(0,5,25,0.12)'; ctx.fillRect(0, 0, W, H); }
  drawAmbient(simT, dt);
  if (pal.grade) { ctx.fillStyle = pal.grade; ctx.fillRect(0, 0, W, H); }
  const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.35, W / 2, H * 0.5, H * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  drawHUD(simT, dt);
  drawFlow(simT, dt);
  audioTick();
  if (!document.body.classList.contains('broadcast')) updatePanel();
  requestAnimationFrame(frame);
}

/* ---------------- crowd input (LIVE + demo) ---------------- */
let viewers = 0, audienceMode = 'auto', demo = { on: false, rate: 6, acc: 0 };
const demoNames = ['forest_fox', 'jeep_queen', 'mudking', 'ana.drive', 'vlad4x4', 'trail_bro', 'mihai.rr', 'offroad_ely'];
function viewerCount() { return audienceMode === 'auto' ? viewers : Number(audienceMode) || 0; }
function demoCrowd(dt) {
  if (!demo.on) return;
  demo.acc += demo.rate * dt;
  const n = Math.floor(demo.acc); demo.acc -= n;
  if (n) sim.tap(n, demoNames[Math.floor(Math.random() * demoNames.length)]);
}

function applyLive(ev) {
  const avatarUrl = ev.avatar || null;
  switch (ev.type) {
    case 'like': {
      const total = effectiveTaps(ev.count, viewerCount());
      // each listed tapper gets exactly their fraction of the raw likes; the rest goes to the crowd
      const users = Array.isArray(ev.users) ? ev.users : [];
      const raw = Math.max(1, Number(ev.count) || 1);
      let used = 0;
      for (const [name, c, av] of users) { const share = (total * Math.min(c, raw)) / raw; if (used + share > total + 1e-9) break; used += share; sim.tap(share, name, av); }
      if (total - used > 1e-6) sim.tap(total - used);
      break;
    }
    case 'gift': sim.gift({ coins: ev.coins, count: ev.count, user: ev.user, avatar: avatarUrl, name: ev.name }); break;
    case 'follow': sim.follow(ev.user, avatarUrl); break;
    case 'share': sim.share(ev.user, avatarUrl); break;
    case 'comment': sim.comment(ev.user, ev.text, avatarUrl); break;
    case 'command': runCommand(ev); break;
  }
}

// Host commands (from the panel or the keyboard). Relayed through the server so every open game view stays in step.
function runCommand(c) {
  switch (c.cmd) {
    case 'tap': sim.tap(c.count || 1, c.user || 'HOST'); break;
    case 'gift': c.name ? sim.gift({ name: c.name, coins: 1, count: 1, user: c.user || 'TEST GIFT' }) : sim.gift({ coins: GIFT_TIERS[clamp(c.tier | 0, 0, 3)].min, count: 1, user: c.user || 'TEST GIFT', name: '' }); break;
    case 'follow': sim.follow(c.user || 'new_follower'); break;
    case 'share': sim.share(c.user || 'sharer'); break;
    case 'jump': sim.comment(c.user || 'HOST', 'jump'); break;
    case 'buy': sim.buy(c.id); persist(); break;
    case 'auto': sim.autoUpgrade = !!c.value; persist(); break;
    case 'level': { const n = clamp(c.level | 0, 1, sim.best); sim.startLevel(n); persist(); break; }
    case 'respawn': sim.respawn(); break;
    case 'reset': localStorage.removeItem(SAVE_KEY); location.reload(); break;
  }
}
let serverOk = false;
async function command(c) {
  if (serverOk) {
    try { const r = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); if (r.ok) return; } catch {}
  }
  runCommand(c);
}

/* ---------------- SSE bridge ---------------- */
let status = { connected: false, message: 'Demo mode — no LIVE bridge.' };
function connectEvents() {
  if (location.protocol === 'file:') return;
  const es = new EventSource('/api/events');
  es.onopen = () => { serverOk = true; };
  es.onmessage = m => {
    let d; try { d = JSON.parse(m.data); } catch { return; }
    if (d.type === 'status') { status = d; viewers = d.viewers || viewers; }
    else if (d.type === 'audience') viewers = d.viewers;
    else if (d.type === 'batch') d.events.forEach(applyLive);
    else if (d.type === 'giftmap') { sim.setGiftMap(d.map); renderGiftSetup(); }
  };
  es.onerror = () => { serverOk = false; };
}
connectEvents();
async function loadGiftMap() {
  if (location.protocol === 'file:') return;
  try { const r = await fetch('/api/gift-map'); if (r.ok) { sim.setGiftMap((await r.json()).map); renderGiftSetup(); } } catch {}
}
loadGiftMap();

/* ---------------- keyboard ---------------- */
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) command({ cmd: 'tap' }); }
  else if (/^Digit[1-4]$/.test(e.code)) command({ cmd: 'gift', tier: Number(e.code.slice(5)) - 1 });
  else if (e.code === 'KeyJ') command({ cmd: 'jump' });
  else if (e.code === 'KeyF') command({ cmd: 'follow' });
  else if (e.code === 'KeyS') command({ cmd: 'share' });
  else if (e.code === 'KeyR') command({ cmd: 'respawn' });
  else if (e.code === 'KeyM') setSound(!audio.on);
  else if (e.code === 'KeyH' || e.code === 'Escape') { document.body.classList.toggle('broadcast'); }
});
cv.addEventListener('pointerdown', () => command({ cmd: 'tap' }));

/* ---------------- host panel ---------------- */
const $ = id => document.getElementById(id);
let giftDraft = null;
function renderGiftSetup() {
  const box = document.getElementById('gifts'); if (!box) return;
  if (document.activeElement && box.contains(document.activeElement)) return;
  giftDraft = sim.giftMap.map(r => ({ ...r }));
  box.innerHTML = '';
  giftDraft.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'gift';
    row.innerHTML = `<input type="text" value="${r.name.replace(/"/g, '&quot;')}" maxlength="40"><select>${ACTION_IDS.map(a => `<option value="${a}"${a === r.action ? ' selected' : ''}>${ACTIONS[a].icon} ${ACTIONS[a].label}</option>`).join('')}</select><button title="Test this gift">▶</button><button title="Remove">✕</button>`;
    const [inp, sel, test, del] = row.querySelectorAll('input,select,button');
    inp.oninput = () => { giftDraft[i].name = inp.value; };
    sel.onchange = () => { giftDraft[i].action = sel.value; };
    test.onclick = () => command({ cmd: 'gift', name: giftDraft[i].name });
    del.onclick = () => { giftDraft.splice(i, 1); saveGiftMap(); };
    box.appendChild(row);
  });
}
async function saveGiftMap() {
  const map = giftDraft.filter(r => r.name.trim());
  sim.setGiftMap(map);
  try { await fetch('/api/gift-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ map }) }); } catch {}
  document.activeElement?.blur?.(); renderGiftSetup();
}

function buildPanel() {
  $('addGift').onclick = () => { giftDraft.push({ name: 'New gift', action: 'nitro' }); sim.setGiftMap(giftDraft); renderGiftSetup(); };
  $('saveGifts').onclick = saveGiftMap;
  $('resetGifts').onclick = () => { giftDraft = DEFAULT_GIFT_MAP.map(r => ({ ...r })); saveGiftMap(); };
  renderGiftSetup();
  const garage = $('garage');
  for (const id of UPGRADE_IDS) {
    const row = document.createElement('div'); row.className = 'up';
    row.innerHTML = `<div><b>${UPGRADES[id].name}</b> <span id="lv-${id}"></span><small>${UPGRADES[id].info}</small></div><button id="buy-${id}">BUY</button>`;
    garage.appendChild(row);
    row.querySelector('button').onclick = () => command({ cmd: 'buy', id });
  }
  document.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => command({ cmd: b.dataset.cmd, tier: Number(b.dataset.tier || 0) }));
  $('auto').onchange = e => command({ cmd: 'auto', value: e.target.checked });
  $('demo').onchange = e => { demo.on = e.target.checked; };
  $('rate').oninput = e => { demo.rate = Number(e.target.value); $('rateVal').textContent = `${demo.rate}/s → ${Math.round(steadyPower(demo.rate) * 100)}% power`; };
  $('rate').oninput({ target: $('rate') });
  $('audience').onchange = e => { audienceMode = e.target.value; };
  $('soundBtn').onclick = () => setSound(!audio.on);
  $('prevLvl').onclick = () => command({ cmd: 'level', level: sim.level - 1 });
  $('nextLvl').onclick = () => command({ cmd: 'level', level: sim.level + 1 });
  $('restart').onclick = () => command({ cmd: 'level', level: sim.level });
  $('reset').onclick = () => { if (confirm('Erase coins, upgrades and leaderboard?')) command({ cmd: 'reset' }); };
  $('broadcastBtn').onclick = () => document.body.classList.add('broadcast');
  $('connect').onclick = async () => {
    if (status.connected || status.connecting) { await fetch('/api/disconnect', { method: 'POST' }).catch(() => {}); return; }
    const username = $('user').value.trim();
    localStorage.setItem('timber-ridge-user', username);
    try { const r = await fetch('/api/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) }); status = await r.json(); } catch { status = { message: 'The local bridge is not running. Start START-TIMBER-RIDGE-2D.bat.' }; }
  };
  $('user').value = localStorage.getItem('timber-ridge-user') || '';
  $('auto').checked = sim.autoUpgrade;
}
let panelT = 0;
function updatePanel() {
  if ((panelT = (panelT + 1) % 10)) return;
  $('status').textContent = status.message || '';
  $('status').className = status.connected ? 'ok' : '';
  $('connect').textContent = status.connected || status.connecting ? 'DISCONNECT' : 'CONNECT';
  $('viewers').textContent = `Viewers: ${fmt(viewers)} · like divisor ×${(Math.max(1, viewerCount() * 0.03)).toFixed(1)}`;
  $('wallet').textContent = fmt(sim.coins);
  $('lvl').textContent = `Level ${sim.level} (best ${sim.best})`;
  for (const id of UPGRADE_IDS) {
    const lv = sim.upgrades[id] || 0, cost = upgradeCost(id, lv);
    $(`lv-${id}`).textContent = `LV ${lv}/${UPGRADES[id].max}`;
    const b = $(`buy-${id}`); b.textContent = Number.isFinite(cost) ? fmt(cost) : 'MAX'; b.disabled = !(cost <= sim.coins);
  }
  $('session').textContent = `Session: ${fmt(sim.session.taps)} taps · ${fmt(sim.session.gifts)} gifts · ${fmt(sim.session.coinsGifted)} coins`;
}
buildPanel();
const viewInput = document.getElementById('viewRange'), viewLabel = document.getElementById('viewRangeValue');
function updateRange(value) {
  viewRange = Math.min(26, Math.max(11, Number(value) || 18.6)); viewInput.value = viewRange;
  viewLabel.textContent = Math.abs(viewRange - 18.6) < 0.1 ? 'Standard camera range' : `${viewRange.toFixed(1)} m visible · ${viewRange < 18.6 ? 'closer' : 'wider'}`;
}
updateRange(viewRange);
viewInput.oninput = () => { updateRange(viewInput.value); localStorage.setItem(rangeKey, viewRange); };
addEventListener('storage', e => { if (e.key === rangeKey) updateRange(e.newValue); });
document.body.classList.add('ready');
requestAnimationFrame(t => { last = t; frame(t); });
window.__sim = sim;
