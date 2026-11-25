// THE LAST CITY — renderer, HUD, effects, audio, host controls and TikTok LIVE events.
import { Sim, SLOTS, TURRET_SLOTS, CAPTAIN_POS } from './sim.js';
import { AssetAtlas } from './assets.js';
import { buildKingdomScene, CITY_BUILDINGS } from './kingdom-art.js';
import { Camera } from './camera.js';
import { AnimationAtlas, walkFrame, archerFrame } from './animation.js';
import { PALETTES, buildScene, zombieSprites, persp, roundRect, rgba, TORCHES, WINDMILL, SPRITE_RES, W, H } from './art.js';
import {
  WORLD, ACTIONS, ACTION_IDS, GIFT_TIERS, DEFAULT_GIFT_MAP, UPGRADES, UPGRADE_IDS, upgradeCost, effectiveTaps, clamp,
  steadyPower, fireMultFor, survivorLevel, weaponFor, scoreFor, FLOW, TURRET, METEOR, CAPTAIN, LIGHTING,
} from './rules.js';

const SAVE_KEY = 'last-city-save-v1';
const params = new URLSearchParams(location.search);
document.body.classList.toggle('broadcast', params.has('broadcast'));

const cv = document.getElementById('game');
cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');

let save = {};
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { save = {}; }
const sim = new Sim(save);
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(sim.serialize())); } catch {} };
setInterval(persist, 3000);

/* ---------------- world look ---------------- */
const SPR = zombieSprites();
const atlas = new AssetAtlas();
const animations = new AnimationAtlas();
animations.load();
atlas.load().then(() => { nightKey = ''; });
let pal, scene, nightKey = '', decals, dctx;
function ensureWorld() {
  const key = sim.cfg.night.id;
  if (key !== nightKey) {
    nightKey = key;
    pal = PALETTES[key];
    scene = atlas.ready ? buildKingdomScene(pal, atlas) : buildScene(pal, 77 + sim.cfg.night.id.length * 13);
  }
  if (!decals) { decals = document.createElement('canvas'); decals.width = W; decals.height = WORLD.wallY + 20; dctx = decals.getContext('2d'); }
}
function clearDecals() { if (dctx) dctx.clearRect(0, 0, decals.width, decals.height); }
function splat(x, y, r, color, n = 5) {
  if (!dctx || y > WORLD.wallY) return;
  dctx.fillStyle = color;
  for (let i = 0; i < n; i++) { dctx.beginPath(); dctx.ellipse(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r * 0.5, r * (0.2 + Math.random() * 0.4), r * (0.1 + Math.random() * 0.2), 0, 0, 7); dctx.fill(); }
}

const cam = { shake: 0, sx: 0, sy: 0 };
const camera = new Camera();
let flash = 0, flashColor = '255,255,255', lightning = 0;

/* ---------------- particles ---------------- */
const parts = [], corpses = [], floaters = [], dragons = [];
function puff(x, y, vx, vy, life, size, color, kind = 'spark', grav = 0) {
  if (parts.length > 1400) parts.splice(0, 100);
  parts.push({ x, y, vx, vy, life, max: life, size, color, kind, grav, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 });
}
function burst(x, y, n, color, speed = 300, kind = 'spark', size = 6, grav = 600) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
    puff(x, y, Math.cos(a) * s, Math.sin(a) * s * 0.7 - speed * 0.3, 0.5 + Math.random() * 0.7, size * (0.6 + Math.random() * 0.8), color, kind, grav);
  }
}
function explosion(x, y, r, big = false) {
  for (let i = 0; i < (big ? 26 : 12); i++) { const a = Math.random() * 7, s = Math.random() * r * 2.2; puff(x, y, Math.cos(a) * s, Math.sin(a) * s * 0.6, 0.35 + Math.random() * 0.35, r * 0.35 * (0.6 + Math.random()), Math.random() < 0.5 ? '255,170,60' : '255,90,30', 'fire', -60); }
  for (let i = 0; i < (big ? 16 : 7); i++) { const a = Math.random() * 7, s = Math.random() * r * 0.9; puff(x, y - 10, Math.cos(a) * s, Math.sin(a) * s * 0.5 - 50, 1 + Math.random() * 0.8, r * 0.3 * (0.6 + Math.random()), '60,55,60', 'smoke', -30); }
  burst(x, y, big ? 18 : 8, pal.dirt[1], r * 3, 'chip', 5, 900);
  splat(x, y, r * 0.7, 'rgba(20,14,10,0.35)', 3);
}
function floatText(text, x, y, color = '#fff', size = 40) { floaters.push({ text, x, y, color, size, t: 0 }); if (floaters.length > 40) floaters.shift(); }

/* ---------------- messages / feed ---------------- */
let banner = null;
const feed = [], giftPops = [];
const avatars = new Map();
function avatar(url) {
  if (!url) return null;
  let img = avatars.get(url);
  if (!img) {
    img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = url; avatars.set(url, img);
    if (avatars.size > 400) avatars.delete(avatars.keys().next().value);
  }
  return img.complete && img.naturalWidth ? img : null;
}
function say(title, sub = '', color = '#ffffff', dur = 2.4) { banner = { title, sub, color, t: 0, dur }; }
function pushFeed(icon, user, text, color, av) { feed.unshift({ icon, user: String(user || '').slice(0, 16), text, color, av, t: 0 }); feed.length = Math.min(feed.length, 6); }
let joinFeedT = 0, joinedSince = 0;

/* ---------------- audio ---------------- */
const audio = { on: false, ctx: null, noise: null };
function audioInit() {
  if (audio.ctx) return;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
  Object.assign(audio, { ctx: ac, noise: buf, master });
}
function blip(freq, dur = 0.12, type = 'sine', vol = 0.12, slide = 1.6) {
  if (!audio.on || !audio.ctx) return;
  const ac = audio.ctx, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, ac.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), ac.currentTime + dur);
  g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g); g.connect(audio.master); o.start(); o.stop(ac.currentTime + dur);
}
function noise(dur = 0.4, freq = 600, vol = 0.3) {
  if (!audio.on || !audio.ctx) return;
  const ac = audio.ctx, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = audio.noise; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(audio.master); s.start(); s.stop(ac.currentTime + dur);
}
let twangBudget = 0;
function setSound(on) {
  audio.on = on; if (on) { audioInit(); audio.ctx.resume(); }
  const b = document.getElementById('soundBtn'); if (b) b.textContent = on ? 'SOUND ON' : 'SOUND OFF';
}

/* ---------------- sim events → effects ---------------- */
let clearInfo = null, fallenInfo = null, countPulse = 0, goT = 0, breachT = 0;
function handleSimEvents() {
  for (const e of sim.events) {
    switch (e.type) {
      case 'wave': clearInfo = null; fallenInfo = null; clearDecals(); break;
      case 'count': countPulse = 1; blip(440, 0.15, 'square', 0.1, 1); break;
      case 'go': goT = 1.2; blip(880, 0.4, 'square', 0.14, 1.5); noise(0.5, 300, 0.25); break;
      case 'join':
        joinedSince++;
        if (sim.time - joinFeedT > 0.5) { joinFeedT = sim.time; pushFeed('🛡', e.user, joinedSince > 1 ? `+${joinedSince} JOINED THE CITY` : 'JOINED THE CITY', '#9fd0ff', e.avatar); joinedSince = 0; }
        break;
      case 'kill': {
        const big = e.kind === 'brute' || e.kind === 'boss';
        const z = { x: e.x, y: e.y, kind: e.kind, k: persp(e.y), t: 0, dir: Math.random() < 0.5 ? -1 : 1, v: e.kind === 'boss' ? 0 : Math.floor(Math.random() * 3) };
        corpses.push(z); if (corpses.length > 60) corpses.shift();
        burst(e.x, e.y - 30 * persp(e.y) * e.size, big ? 26 : 9, '120,220,60', big ? 380 : 240, 'goo', big ? 9 : 6, 900);
        splat(e.x, e.y, 26 * persp(e.y) * e.size, 'rgba(70,140,30,0.28)', big ? 6 : 3);
        if (big) floatText(`+${e.kind === 'boss' ? 60 : 4}`, e.x, e.y - 90 * e.size * persp(e.y), '#ffd84a', e.kind === 'boss' ? 64 : 40);
        if (e.kind === 'boss') { say('BOSS DOWN!', e.owner ? `Final blow: ${e.owner}` : 'The city roars!', '#ffd84a', 2.6); cam.shake = 1.2; noise(0.9, 200, 0.5); }
        break;
      }
      case 'boom': explosion(e.x, e.y, e.r * 0.6); cam.shake = Math.min(1, cam.shake + 0.12); noise(0.35, 500, 0.18); break;
      case 'meteor': explosion(e.x, e.y, METEOR.radius, true); cam.shake = Math.min(1.6, cam.shake + 0.6); flash = Math.max(flash, 0.25); flashColor = '255,160,60'; noise(0.9, 250, 0.45); break;
      case 'meteorcall': blip(200, 0.8, 'sawtooth', 0.08, 0.3); break;
      case 'nuke':
        flash = 1; flashColor = '255,200,120'; cam.shake = 2; dragons.push({ t: 0 });
        for (let i = 0; i < 160; i++) puff(Math.random() * W, 300 + Math.random() * 850, (Math.random() - 0.5) * 120, -80 - Math.random() * 200, 1 + Math.random(), 20 + Math.random() * 30, Math.random() < 0.5 ? '255,140,40' : '255,70,30', 'fire', -40);
        say('DRAGON FIRE!', 'The sky burns the horde', '#ff6a3d', 2.6); noise(1.8, 400, 0.6);
        break;
      case 'freeze': for (let i = 0; i < 60; i++) puff(Math.random() * W, 300 + Math.random() * 850, 0, 30, 1.2 + Math.random(), 4 + Math.random() * 5, '200,240,255', 'ice', 0); blip(1600, 0.5, 'sine', 0.08, 0.5); break;
      case 'breach': breachT = 3; say('THE WALL IS BREACHED!', 'Repair it! Comment "repair" or send a gift', '#ff4a4a', 3.2); cam.shake = 1.5; noise(1.2, 300, 0.6); for (let i = 0; i < 30; i++) burst(400 + Math.random() * 280, WORLD.wallY, 2, pal.stone[1], 500, 'chip', 9, 900); break;
      case 'repair':
        if (e.amount >= 0.05) { floatText(`+${Math.round(e.amount * 100)}% WALL`, 540, WORLD.wallY + 40, '#7dff5a', 44); for (let i = 0; i < 24; i++) puff(80 + Math.random() * 920, WORLD.wallY + Math.random() * 40, 0, -90, 0.9, 6, '125,255,90', 'spark', 0); blip(700, 0.2, 'triangle', 0.1, 1.3); }
        else burst(200 + Math.random() * 680, WORLD.wallY + 10, 6, '125,255,90', 120, 'spark', 4, 0);
        if (sim.wallHp > 0 && breachT > 0) breachT = 0;
        break;
      case 'shield': blip(500, 0.4, 'sine', 0.08, 2); break;
      case 'wallup': say('WALL REBUILT!', 'Hold the line!', '#7dff5a', 2.2); breachT = 0; break;
      case 'turret': {
        const p = TURRET_SLOTS[e.slot];
        floatText(e.built ? 'TURRET BUILT!' : `TURRET LV ${e.level}`, p.x, p.y - 70, '#ffb02e', 36);
        for (let i = 0; i < 18; i++) puff(p.x, p.y, (Math.random() - 0.5) * 200, -Math.random() * 200, 0.8, 14, '180,170,160', 'smoke', -20);
        blip(300, 0.25, 'square', 0.1, 2);
        break;
      }
      case 'corehit': cam.shake = Math.min(1, cam.shake + 0.3); flash = Math.max(flash, 0.12); flashColor = '255,40,40'; break;
      case 'boss': say('A BOSS APPROACHES!', 'Focus fire! Send meteors!', '#ff5a3d', 2.6); blip(80, 1.2, 'sawtooth', 0.2, 0.7); break;
      case 'clear': clearInfo = { ...e, t: 0 }; for (let i = 0; i < 6; i++) burst(200 + i * 140, 800, 30, ['255,79,139', '255,216,74', '56,232,255', '125,255,90'][i % 4], 600, 'confetti', 9, 500); blip(660, 0.5, 'triangle', 0.14, 1.5); break;
      case 'fallen': fallenInfo = { ...e, t: 0 }; flash = 0.8; flashColor = '255,30,30'; cam.shake = 2; noise(2, 150, 0.6); break;
      case 'autoupgrade': pushFeed('🔧', 'ARMORY', e.bought.map(b => UPGRADES[b].name).join(' + '), '#ffd84a'); break;
      case 'recruit': pushFeed('🪖', 'GARRISON', e.added ? `+${e.added} SOLDIER · ${e.total} GUARDS` : 'GARRISON FULL · SHIELD ADDED', '#89ccff'); break;
      case 'upgrade': pushFeed('🔧', 'ARMORY', `${UPGRADES[e.id].name} LV ${e.level}`, '#ffd84a'); break;
      case 'gift': {
        const a = ACTIONS[e.action];
        const label = `${a.label}${e.count > 1 ? ' ×' + e.count : ''}`;
        pushFeed(a.icon, e.user, e.banked ? `${label} · AT GO` : label, a.color, e.avatar);
        if (e.action !== 'rapid' || e.count >= 5) giftPops.unshift({ user: e.user, av: e.avatar, label: `${e.name ? e.name + ' → ' : ''}${label}`, color: a.color, icon: a.icon, t: 0, big: e.action === 'doomsday', banked: e.banked });
        giftPops.length = Math.min(giftPops.length, 3);
        blip(e.action === 'doomsday' ? 1000 : 640, 0.25, 'square', 0.1);
        break;
      }
      case 'bank': say('SAVED GIFTS FIRE NOW!', `${e.gifts} gift${e.gifts > 1 ? 's' : ''} join the fight`, '#ffd84a', 2.4); break;
      case 'follow': pushFeed('➕', e.user, 'FOLLOW · WALL +8%', '#7dff5a', e.avatar); break;
      case 'share': pushFeed('↗', e.user, 'SHARE · RAPID FIRE +6s', '#38e8ff', e.avatar); break;
    }
  }
  sim.events.length = 0;
}

/* ---------------- drawing helpers ---------------- */
function text(str, x, y, size, color, align = 'left', weight = 900, stroke = true) {
  ctx.font = `${weight} ${size}px "Arial Black", "Segoe UI", Impact, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size * 0.16); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function fitText(str, max, size) { ctx.font = `900 ${size}px "Arial Black", "Segoe UI", sans-serif`; while (size > 14 && ctx.measureText(str).width > max) { size -= 2; ctx.font = `900 ${size}px "Arial Black", "Segoe UI", sans-serif`; } return size; }
function panel(x, y, w, h, r = 22, a = 0.6) { ctx.fillStyle = `rgba(8,12,22,${a})`; roundRect(ctx, x, y, w, h, r); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 2; ctx.stroke(); }
function avatarCircle(img, x, y, r, fallback, ring = null) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.closePath();
  if (img) { ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else { const h = [...String(fallback || '?')].reduce((s, ch) => s + ch.charCodeAt(0), 0); ctx.fillStyle = `hsl(${h * 37 % 360},55%,45%)`; ctx.fill(); ctx.font = `900 ${r * 1.1}px "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(String(fallback || '?').trim().charAt(0).toUpperCase() || '?', x, y + 1); }
  ctx.restore();
  if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = Math.max(2, r * 0.18); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); }
}
const fmt = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString('en-US'));
function bar(x, y, w, h, k, col, back = 'rgba(0,0,0,0.5)') {
  ctx.fillStyle = back; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  if (k > 0) { ctx.fillStyle = col; roundRect(ctx, x, y, Math.max(h, w * clamp(k, 0, 1)), h, h / 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(ctx, x + 3, y + 2, Math.max(0, w * clamp(k, 0, 1) - 6), h * 0.35, h / 4); ctx.fill();
}

/* ---------------- world drawing ---------------- */
function drawZombie(z, t) {
  const k = persp(z.y), fade = clamp((z.y - WORLD.spawnY + 60) / 70, 0, 1);
  const frozen = sim.effects.freeze > 0;
  const attacking = z.state === 'attack' || z.state === 'core';
  const frame = frozen ? 0 : Math.floor(z.phase * (attacking ? 0.7 : 1)) % 4;
  const set = z.hit > 0 && z.hp > 0 ? SPR.hit[z.kind][frame] : frozen ? SPR.ice[z.kind][frame] : SPR.normal[z.kind][z.kind === 'boss' ? 0 : z.id % 3][frame];
  const sc = k / SPRITE_RES;
  const bob = attacking && !frozen && z.strike > 0 ? (z.strike / 0.2) * 3 * k : 0;
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(z.x, z.y, 22 * k * z.size, 7 * k * z.size, 0, 0, 7); ctx.fill();
  if (atlas.ready) {
    const frame = frozen ? 0 : attacking ? z.strike > 0 ? 5 : 0 : walkFrame(z.kind, z.distance, z.id % 8);
    if (animations.ready) animations.draw(ctx, z.kind, frame, z.x, z.y, 57 * z.size * k, !!z.facing);
    else atlas.draw(ctx, z.kind, z.x, z.y, 57 * z.size * k, { flip: !!z.facing });
    if (frozen) { ctx.fillStyle = '#99e3ff44'; ctx.beginPath(); ctx.ellipse(z.x, z.y - 25 * k * z.size, 30 * k * z.size, 42 * k * z.size, 0, 0, 7); ctx.fill(); }
    if (z.hit > 0 && z.hp > 0) { ctx.strokeStyle = '#ffe69d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(z.x, z.y - 26 * k * z.size, 18 * k * z.size, 0, Math.PI * 1.3); ctx.stroke(); }
  } else ctx.drawImage(set.c, z.x - set.fx * sc, z.y - set.fy * sc + bob, set.w * sc, set.h * sc);
  ctx.globalAlpha = 1;
  if (z.kind === 'brute' || z.kind === 'boss' || (z.hp < z.max && z.hit > -1 && z.max > 60)) {
    const sprite = atlas.ready && atlas.sprites.get(z.kind);
    const spriteHeight = sprite ? 57 * z.size * sprite.h / sprite.w + 14 : z.kind === 'boss' ? 300 : 120 * z.size;
    const bw = (z.kind === 'boss' ? 150 : 60) * k, by = z.y - spriteHeight * k;
    bar(z.x - bw / 2, by, bw, z.kind === 'boss' ? 14 : 8, z.hp / z.max, z.kind === 'boss' ? '#ff3d4a' : '#ff8a3a');
    if (z.kind === 'boss') text('BOSS', z.x, by - 16, 22, '#ffb0a0', 'center');
  }
}

function drawCorpses(dt, inCity) {
  for (const c of corpses) {
    if ((c.y > WORLD.wallY) !== inCity) continue;
    c.t += dt;
    const set = SPR.normal[c.kind][c.v][0], sc = c.k / SPRITE_RES;
    const a = clamp(1 - (c.t - 0.6) / 0.6, 0, 1); if (a <= 0) continue;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(c.x, c.y);
    ctx.rotate(c.dir * Math.min(1.45, c.t * 5)); ctx.scale(1, 1 - Math.min(0.3, c.t * 0.4));
    if (atlas.ready) atlas.draw(ctx, c.kind, 0, 0, 57 * ({ walker: 1, runner: 0.85, brute: 1.45, boss: 2.6 }[c.kind]) * c.k);
    else ctx.drawImage(set.c, -set.fx * sc, -set.fy * sc, set.w * sc, set.h * sc); ctx.restore();
  }
  if (!inCity) for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].t > 1.3) corpses.splice(i, 1);
}

function drawSurvivor(s, pos, level, t, isTop) {
  const x = pos.x, y = pos.y, k = 1.0;
  const w = weaponFor(level), cap = !!s.captain;
  const sc = cap ? 1.25 : 1;
  if (atlas.ready) {
    ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.ellipse(x, y, 22 * sc, 7, 0, 0, 7); ctx.fill();
    if (animations.ready) animations.draw(ctx, 'archer', archerFrame(s.animStage, s.animT || 0), x, y, 58 * sc, Math.cos(s.aim) > 0);
    else atlas.draw(ctx, 'archer', x, y, 58 * sc, { flip: Math.cos(s.aim) < 0 });
    if (cap) crown(x, y - 84, 10);
    else if (!s.guard) { avatarCircle(avatar(s.avatar), x, y - 80, 13, s.name, s.gifted ? '#ffd34a' : '#bed1ed'); if (isTop) crown(x, y - 100, 9); }
    text(cap ? 'CAPTAIN' : s.guard ? s.name : `★${level} ${s.name.slice(0, 9)}`, x, y + 12, 14, s.gifted || cap ? '#ffd34a' : '#e4edff', 'center', 800);
    return;
  }
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, 20 * sc, 6 * sc, 0, 0, 7); ctx.fill();
  const bounce = s.flash > 0 ? -2 : Math.sin(t * 3 + x) * 1;
  // cape / body (seen from behind, facing the horde)
  ctx.fillStyle = s.gifted ? '#d8a22a' : cap ? '#b02a3a' : '#2a49a8';
  ctx.beginPath(); ctx.moveTo(x - 15 * sc, y - 36 * sc + bounce); ctx.lineTo(x + 15 * sc, y - 36 * sc + bounce); ctx.lineTo(x + 18 * sc, y - 4 * sc); ctx.lineTo(x - 18 * sc, y - 4 * sc); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 4 * sc, y - 34 * sc + bounce, 10 * sc, 30 * sc);
  ctx.fillStyle = '#e8b53a'; ctx.fillRect(x - 15 * sc, y - 12 * sc, 30 * sc, 4 * sc);
  // weapon, aimed up at the target
  const aim = s.aim ?? -Math.PI / 2;
  ctx.save(); ctx.translate(x, y - 34 * sc + bounce); ctx.rotate(aim + Math.PI / 2);
  if (w.id === 'bow') {
    ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -10, 20, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-16, -21); ctx.lineTo(0, s.flash > 0 ? -6 : 0); ctx.lineTo(16, -21); ctx.stroke();
  } else if (w.id === 'crossbow') {
    ctx.fillStyle = '#6b4426'; ctx.fillRect(-3, -34, 6, 30); ctx.strokeStyle = '#9aa0aa'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-16, -28); ctx.quadraticCurveTo(0, -36, 16, -28); ctx.stroke();
  } else {
    const len = w.id === 'cannon' ? 34 : 42, wid = w.id === 'cannon' ? 11 : 6;
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(-4, -10, 8, 14);
    ctx.fillStyle = w.id === 'cannon' ? '#c8902a' : '#4a4a55'; roundRect(ctx, -wid / 2, -len, wid, len, 3); ctx.fill();
  }
  if (s.flash > 0 && w.id !== 'bow' && w.id !== 'crossbow') {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -46, 0, 0, -46, 26); g.addColorStop(0, 'rgba(255,230,140,1)'); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -46, 26, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  // head = the viewer's TikTok avatar
  const hy = y - 46 * sc + bounce, r = 15 * sc;
  if (s.adren > 0) { ctx.fillStyle = 'rgba(255,90,140,0.35)'; ctx.beginPath(); ctx.arc(x, hy, r + 7, 0, 7); ctx.fill(); }
  if (cap) {
    ctx.fillStyle = '#c0c6d2'; ctx.beginPath(); ctx.arc(x, hy, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#8890a0'; ctx.fillRect(x - r, hy - 2, r * 2, 5);
    ctx.fillStyle = '#ff3d5a'; ctx.beginPath(); ctx.ellipse(x, hy - r - 6, 6, 12, 0, 0, 7); ctx.fill();
  } else avatarCircle(avatar(s.avatar), x, hy, r, s.name, s.gifted ? '#ffd34a' : 'rgba(255,255,255,0.85)');
  if (isTop) crown(x, hy - r - 6, 11);
  // name + level
  const name = cap ? CAPTAIN.name : s.name.slice(0, 9);
  ctx.font = '800 14px "Segoe UI", sans-serif'; const nw = ctx.measureText(name).width + 34;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(ctx, x - nw / 2, y + 2, nw, 20, 10); ctx.fill();
  ctx.fillStyle = level >= 9 ? '#ff7ad9' : level >= 6 ? '#ffb02e' : level >= 3 ? '#7fd0ff' : '#cfe0ff';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`★${level}`, x - nw / 2 + 5, y + 12);
  ctx.fillStyle = '#fff'; ctx.fillText(name, x - nw / 2 + 30, y + 12);
}
function crown(x, y, s) {
  ctx.fillStyle = '#ffd34a'; ctx.beginPath();
  ctx.moveTo(x - s, y + s * 0.5); ctx.lineTo(x - s, y - s * 0.4); ctx.lineTo(x - s * 0.5, y); ctx.lineTo(x, y - s * 0.7); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x + s, y - s * 0.4); ctx.lineTo(x + s, y + s * 0.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a06a10'; ctx.lineWidth = 2; ctx.stroke();
}

function drawTurret(tu, t) {
  const p = TURRET_SLOTS[tu.slot];
  if (!tu.level) {
    if (sim.locked || sim.state === 'fight') { ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 3); ctx.strokeStyle = '#ffb02e'; ctx.setLineDash([6, 6]); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - 12, 24, 0, 7); ctx.stroke(); ctx.setLineDash([]); text('+', p.x, p.y - 12, 28, '#ffb02e', 'center'); ctx.globalAlpha = 1; }
    return;
  }
  if (atlas.ready) {
    atlas.draw(ctx, 'cannon', p.x, p.y, 76 + tu.level * 2, { flip: Math.cos(tu.aim) > 0, bob: tu.flash > 0 ? 4 : 0 });
    for (let i = 0; i < tu.level; i++) { ctx.fillStyle = '#ffd34a'; ctx.beginPath(); ctx.arc(p.x - (tu.level - 1) * 6 + i * 12, p.y + 14, 4, 0, 7); ctx.fill(); }
    if (tu.flash > 0) { ctx.fillStyle = '#ffe69877'; ctx.beginPath(); ctx.arc(p.x, p.y - 54, 5, 0, 7); ctx.fill(); }
    return;
  }
  ctx.fillStyle = '#5a3a20'; roundRect(ctx, p.x - 26, p.y - 16, 52, 24, 6); ctx.fill();
  ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.arc(p.x - 16, p.y + 6, 9, 0, 7); ctx.arc(p.x + 16, p.y + 6, 9, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(p.x, p.y - 14); ctx.rotate(tu.aim + Math.PI / 2);
  const recoil = tu.flash > 0 ? 6 : 0;
  const g = ctx.createLinearGradient(-12, 0, 12, 0); g.addColorStop(0, '#6a4a1a'); g.addColorStop(0.5, '#d8a23a'); g.addColorStop(1, '#6a4a1a');
  ctx.fillStyle = g; roundRect(ctx, -11 - tu.level, -52 + recoil, 22 + tu.level * 2, 54, 8); ctx.fill();
  ctx.fillStyle = '#2a1a0a'; ctx.beginPath(); ctx.arc(0, -50 + recoil, 7, 0, 7); ctx.fill();
  if (tu.flash > 0) { ctx.globalCompositeOperation = 'lighter'; const f = ctx.createRadialGradient(0, -62, 0, 0, -62, 34); f.addColorStop(0, 'rgba(255,230,150,1)'); f.addColorStop(1, 'rgba(255,100,20,0)'); ctx.fillStyle = f; ctx.beginPath(); ctx.arc(0, -62, 34, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
  for (let i = 0; i < tu.level; i++) { ctx.fillStyle = '#ffd34a'; ctx.beginPath(); ctx.arc(p.x - (tu.level - 1) * 7 + i * 14, p.y + 22, 4.5, 0, 7); ctx.fill(); }
}

function drawShots() {
  for (const p of sim.shots) {
    const a = Math.atan2(p.vy, p.vx);
    const arc = p.kind === 'ball' ? Math.sin(clamp(p.age / p.flight, 0, 1) * Math.PI) * 70 : 0;
    ctx.save(); ctx.translate(p.x, p.y - arc); ctx.rotate(a);
    const rapid = sim.effects.rapid > 0;
    if (p.kind === 'bow' || p.kind === 'crossbow') {
      const L = p.kind === 'bow' ? 30 : 22;
      ctx.strokeStyle = rapid ? 'rgba(120,240,255,0.5)' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-L - 18, 0); ctx.lineTo(-L, 0); ctx.stroke();
      ctx.strokeStyle = '#d8c09a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = rapid ? '#7ff0ff' : '#e8eef8'; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-5, -4); ctx.lineTo(-5, 4); ctx.fill();
      ctx.fillStyle = '#ff5a6a'; ctx.fillRect(-L, -3, 6, 6);
    } else if (p.kind === 'ball') {
      ctx.fillStyle = 'rgba(255,160,60,0.35)'; ctx.beginPath(); ctx.ellipse(-16, 0, 20, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#20201f'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-3, -3, 3, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,210,120,0.75)'; ctx.lineWidth = p.kind === 'cannon' ? 6 : 3; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(0, 0, p.kind === 'cannon' ? 6 : 3.5, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}

function drawMeteors() {
  for (const m of sim.meteors) {
    const k = clamp(m.t / METEOR.delay, 0, 1.6);
    const x = m.x + 380 * k, y = m.y - 1100 * k;
    // target marker
    ctx.strokeStyle = `rgba(255,90,40,${0.4 + 0.4 * Math.sin(m.t * 20)})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(m.x, m.y, METEOR.radius * 0.8, METEOR.radius * 0.3, 0, 0, 7); ctx.stroke();
    if (k > 1.5) continue;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const tx = x + 30 * i, ty = y - 85 * i; ctx.fillStyle = `rgba(255,${140 - i * 15},40,${0.5 - i * 0.07})`; ctx.beginPath(); ctx.arc(tx, ty, 30 - i * 3, 0, 7); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#3a2a20'; ctx.beginPath(); ctx.arc(x, y, 20, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(x - 5, y + 5, 10, 0, 7); ctx.fill();
  }
}

function drawDragons(dt) {
  for (const d of dragons) {
    d.t += dt;
    const x = -300 + d.t * 900, y = 520 + Math.sin(d.t * 3) * 40, wing = Math.sin(d.t * 12) * 40;
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#2a0e14';
    ctx.beginPath(); ctx.ellipse(0, 0, 110, 26, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(90, -10); ctx.lineTo(160, -30); ctx.lineTo(150, 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-100, 0); ctx.lineTo(-220, 20); ctx.lineTo(-100, 14); ctx.fill();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-90, s * (110 + wing)); ctx.lineTo(10, s * (70 + wing * 0.5)); ctx.lineTo(50, 0); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#ff5a2a'; ctx.beginPath(); ctx.arc(140, -18, 5, 0, 7); ctx.fill();
    ctx.restore();
    if (Math.random() < 0.9) puff(x + 150, y + 10, 200 + Math.random() * 200, 300 + Math.random() * 300, 0.8, 30, Math.random() < 0.5 ? '255,140,40' : '255,80,30', 'fire', 200);
  }
  for (let i = dragons.length - 1; i >= 0; i--) if (dragons[i].t > 2.2) dragons.splice(i, 1);
}

function drawParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    const k = p.life / p.max;
    if (p.kind === 'fire') { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${p.color},${k * 0.7})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.3 - k * 0.5), 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    else if (p.kind === 'smoke') { ctx.fillStyle = `rgba(${p.color},${k * 0.45})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - k), 0, 7); ctx.fill(); }
    else if (p.kind === 'confetti') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = `rgba(${p.color},${Math.min(1, k * 2)})`; ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); ctx.restore(); }
    else if (p.kind === 'chip') { ctx.fillStyle = typeof p.color === 'string' && p.color[0] === '#' ? p.color : `rgba(${p.color},1)`; ctx.globalAlpha = Math.min(1, k * 2); ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); ctx.globalAlpha = 1; }
    else if (p.kind === 'ice') { ctx.fillStyle = `rgba(${p.color},${k})`; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -1, p.size * 2, 2); ctx.fillRect(-1, -p.size, 2, p.size * 2); ctx.restore(); }
    else { ctx.fillStyle = `rgba(${p.color},${Math.min(1, k * 1.5)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, 7); ctx.fill(); }
  }
}

const weather = [];
function drawWeather(t, dt) {
  const kind = pal.weather;
  if (kind === 'snow' || kind === 'rain' || kind === 'embers') {
    const want = kind === 'rain' ? 140 : kind === 'snow' ? 110 : 50;
    while (weather.length < want) weather.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() });
    for (const p of weather) {
      if (kind === 'rain') { p.y += (1400 + p.s * 600) * dt; p.x -= 200 * dt; ctx.strokeStyle = 'rgba(180,200,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 8, p.y - 34); ctx.stroke(); }
      else if (kind === 'snow') { p.y += (60 + p.s * 80) * dt; p.x += Math.sin(t + p.s * 10) * 30 * dt; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(p.x, p.y, 2 + p.s * 3, 0, 7); ctx.fill(); }
      else { p.y -= (40 + p.s * 60) * dt; p.x += Math.sin(t * 2 + p.s * 10) * 40 * dt; ctx.fillStyle = `rgba(255,${120 + p.s * 100 | 0},40,${0.5 + 0.5 * Math.sin(t * 6 + p.s * 20)})`; ctx.fillRect(p.x, p.y, 3, 3); }
      if (p.y > H) { p.y = -10; p.x = Math.random() * W; } if (p.y < -20) { p.y = H; p.x = Math.random() * W; } if (p.x < -20) p.x = W;
    }
    // Rain has no flashing full-screen lightning.
  } else weather.length = 0;
  if (kind === 'fog') {
    for (let i = 0; i < 4; i++) {
      const y = 420 + i * 190, x = ((t * (14 + i * 6) + i * 300) % (W + 600)) - 300;
      const g = ctx.createRadialGradient(x, y, 10, x, y, 360); g.addColorStop(0, 'rgba(150,230,170,0.13)'); g.addColorStop(1, 'rgba(150,230,170,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 360, y - 360, 720, 720);
    }
  }
}

function drawLights(t) {
  for (const [x, y] of TORCHES) {
    const radius = LIGHTING.radius;
    const g = ctx.createRadialGradient(x, y, 2, x, y, radius); g.addColorStop(0, rgba(pal.light, LIGHTING.opacity)); g.addColorStop(1, rgba(pal.light, 0));
    ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = '#e8c97e'; ctx.beginPath(); ctx.ellipse(x, y - 5, 3, 5, 0, 0, 7); ctx.fill();
  }
  for (const [x, y] of TORCHES) { ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x - 4, y, 8, 18); }
}

function drawWindmill(t) {
  const { x, y } = WINDMILL;
  ctx.save(); ctx.translate(x, y - 10); ctx.rotate(t * 0.6);
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = '#6b4426'; ctx.fillRect(-3, 0, 6, 80); ctx.fillStyle = '#e8dcc0'; ctx.fillRect(3, 18, 16, 60); ctx.strokeStyle = '#6b4426'; ctx.lineWidth = 1.5; ctx.strokeRect(3, 18, 16, 60); }
  ctx.restore(); ctx.fillStyle = '#4a2e18'; ctx.beginPath(); ctx.arc(x, y - 10, 7, 0, 7); ctx.fill();
}

function drawWallState(t) {
  const max = sim.stats.wallHp, k = sim.wallHp / max, wy = WORLD.wallY;
  // cracks grow as the wall takes damage
  const cracks = Math.floor((1 - k) * 22);
  ctx.strokeStyle = 'rgba(20,14,12,0.75)'; ctx.lineWidth = 3;
  for (let i = 0; i < cracks; i++) {
    const x = (i * 137 + 61) % 1040 + 20;
    ctx.beginPath(); ctx.moveTo(x, wy - 46); ctx.lineTo(x + 8, wy - 30); ctx.lineTo(x - 4, wy - 18); ctx.lineTo(x + 10, wy); ctx.stroke();
  }
  if (sim.breached) {
    // smashed gate area
    ctx.fillStyle = pal.stone[3]; ctx.fillRect(380, wy - 56, 320, 70);
    for (let i = 0; i < 22; i++) { const x = 390 + (i * 53) % 300, y = wy - 40 + (i * 29) % 50; ctx.fillStyle = i % 2 ? pal.stone[1] : pal.stone[2]; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26, y - 8); ctx.lineTo(x + 34, y + 12); ctx.lineTo(x + 6, y + 16); ctx.closePath(); ctx.fill(); }
    if (Math.random() < 0.5) puff(400 + Math.random() * 280, wy - 20, (Math.random() - 0.5) * 40, -60, 0.8, 14, '255,120,40', 'fire', -30);
    if (Math.random() < 0.2) puff(400 + Math.random() * 280, wy - 40, 0, -50, 2, 22, '50,45,50', 'smoke', -10);
  }
  if (sim.shield > 0) {
    const a = clamp(sim.shield / max, 0.15, 1);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, wy - 120, 0, wy - 20);
    g.addColorStop(0, 'rgba(90,170,255,0)'); g.addColorStop(1, `rgba(90,170,255,${0.06 + 0.04 * a})`);
    ctx.fillStyle = g; ctx.fillRect(0, wy - 120, W, 100);
    ctx.strokeStyle = `rgba(160,210,255,${0.18 * a})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, wy - 60); ctx.lineTo(W, wy - 60); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

/* ---------------- HUD ---------------- */
function drawHUD(t, dt) {
  const st = sim.stats;
  // top panel
  panel(24, 22, W - 48, 210, 26, 0.62);
  text('THE LAST CITY', 50, 62, 34, '#ffd34a');
  text(`WAVE ${sim.wave}`, 50, 112, 56, '#ffffff');
  text(sim.cfg.night.name, 52, 156, 22, '#9fb8e8', 'left', 800);
  // horde counter
  const rem = sim.remaining, total = sim.queue.length;
  text(`🧟 ${rem}`, W - 50, 66, 40, '#b4ff6a', 'right');
  text('ZOMBIES LEFT', W - 50, 104, 18, '#9fb8a0', 'right', 800);
  if (sim.cfg.boss) text(`☠ BOSS ×${sim.cfg.boss}`, W - 50, 134, 20, '#ff7a6a', 'right');
  text(`🪙 ${fmt(sim.coins)}`, W - 50, 168, 26, '#ffd84a', 'right');
  // wall + city bars
  const wk = sim.wallHp / st.wallHp;
  text('🧱 WALL', 340, 62, 22, '#e8eefc', 'left', 900);
  bar(470, 48, 360, 28, wk, wk > 0.5 ? '#7dbf5a' : wk > 0.25 ? '#ffb02e' : '#ff4a4a');
  if (sim.shield > 0) { ctx.fillStyle = 'rgba(90,170,255,0.75)'; roundRect(ctx, 470, 48, Math.max(20, 360 * clamp(sim.shield / st.wallHp, 0, 1)), 12, 6); ctx.fill(); }
  text(sim.breached ? 'BREACHED!' : `${Math.round(wk * 100)}%`, 650, 63, 18, sim.breached ? '#ff6a6a' : '#fff', 'center');
  const ck = sim.coreHp / st.coreHp;
  text('🏰 CITY', 340, 106, 22, '#e8eefc', 'left', 900);
  bar(470, 92, 360, 28, ck, ck > 0.5 ? '#5ab0ff' : '#ff4a4a');
  text(`${Math.round(ck * 100)}%`, 650, 107, 18, '#fff', 'center');
  // firepower (crowd taps)
  const fp = fireMultFor(sim.tapPower) * (sim.effects.rapid > 0 ? 2 : 1);
  text('❤ FIREPOWER', 340, 150, 22, '#ff7aa8', 'left', 900);
  bar(530, 136, 300, 28, clamp(sim.tapPower, 0, 1), sim.effects.rapid > 0 ? '#38e8ff' : '#ff4f8b');
  text(`×${fp.toFixed(1)}`, 680, 151, 18, '#fff', 'center');
  // survivors
  const onWall = sim.squad.filter(Boolean).length;
  text(`👥 ${onWall} VIEWERS ON WALL · ${sim.garrison.length + 1} GARRISON`, 340, 200, 21, '#cfe0ff', 'left', 800);
  // effect chips
  const chips = [];
  if (sim.effects.rapid > 0) chips.push(['🏹 RAPID', sim.effects.rapid, '#38e8ff']);
  if (sim.effects.freeze > 0) chips.push(['❄ FROZEN', sim.effects.freeze, '#9fe8ff']);
  if (sim.shield > 0) chips.push(['🛡 SHIELD', null, '#7fb8ff', `${Math.round(sim.shield)} HP`]);
  if (sim.bank.gifts) chips.push(['🎁 SAVED', null, '#ffd84a', `${sim.bank.gifts} AT GO`]);
  chips.forEach((c, i) => {
    const x = 24 + i * 260, y = 246;
    panel(x, y, 248, 46, 23, 0.6);
    text(c[0], x + 16, y + 24, 20, c[2]);
    text(c[1] != null ? `${Math.ceil(c[1])}s` : c[3], x + 232, y + 24, 20, '#fff', 'right');
  });

  // leaderboard
  const lb = sim.activeLeaderboard(5);
  if (lb.length) {
    const x = W - 330, y = 310;
    panel(x, y, 306, 50 + lb.length * 52, 22, 0.55);
    text('TOP DEFENDERS', x + 153, y + 26, 22, '#ffd34a', 'center');
    lb.forEach((p, i) => {
      const yy = y + 70 + i * 52;
      avatarCircle(avatar(p.avatar), x + 36, yy, 19, p.name, i === 0 ? '#ffd34a' : 'rgba(255,255,255,0.5)');
      if (i === 0) crown(x + 36, yy - 24, 9);
      const sz = fitText(p.name, 140, 20);
      text(p.name, x + 66, yy - 8, sz, '#fff', 'left', 800);
      text(`★${p.level} · ${p.kills || 0} kills`, x + 66, yy + 13, 15, '#9fb8e8', 'left', 700, false);
      text(fmt(p.score), x + 292, yy, 20, '#ffd84a', 'right');
    });
  }
  // feed
  feed.forEach((f, i) => {
    f.t += dt;
    const a = clamp(1 - (f.t - 7) / 1, 0, 1); if (a <= 0) return;
    const y = 330 + i * 60;
    ctx.globalAlpha = a;
    panel(24, y, 400, 52, 26, 0.55);
    avatarCircle(avatar(f.av), 52, y + 26, 19, f.user, f.color);
    text(f.icon, 84, y + 26, 24, f.color, 'left', 400, false);
    const sz = fitText(f.user, 110, 18); text(f.user, 118, y + 17, sz, '#fff', 'left', 800);
    const s2 = fitText(f.text, 290, 17); text(f.text, 118, y + 37, s2, f.color, 'left', 800);
    ctx.globalAlpha = 1;
  });
  // gift pops
  giftPops.forEach((g, i) => {
    g.t += dt;
    const a = clamp(Math.min(g.t * 5, 1 - (g.t - 3) / 0.5), 0, 1); if (a <= 0) return;
    const y = 720 + i * 96, w = 760, x = (W - w) / 2, s = 1 + (g.t < 0.2 ? (0.2 - g.t) * 2 : 0);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, y + 40); ctx.scale(s, s); ctx.translate(-W / 2, -(y + 40));
    ctx.fillStyle = 'rgba(8,12,22,0.75)'; roundRect(ctx, x, y, w, 82, 41); ctx.fill();
    ctx.strokeStyle = g.color; ctx.lineWidth = g.big ? 6 : 4; ctx.stroke();
    avatarCircle(avatar(g.av), x + 42, y + 41, 31, g.user, g.color);
    text(g.icon, x + 100, y + 42, 38, '#fff', 'left', 400, false);
    const s1 = fitText(g.user, 520, 26); text(g.user, x + 150, y + 26, s1, '#fff');
    const s2 = fitText(g.label + (g.banked ? ' · AT GO' : ''), 580, 26); text(g.label + (g.banked ? ' · AT GO' : ''), x + 150, y + 58, s2, g.color);
    ctx.restore();
  });
  for (let i = giftPops.length - 1; i >= 0; i--) if (giftPops[i].t > 3.6) giftPops.splice(i, 1);
  // banner
  if (banner) {
    banner.t += dt;
    const a = clamp(Math.min(banner.t * 6, (banner.dur - banner.t) * 3), 0, 1);
    if (a <= 0) banner = null;
    else {
      ctx.globalAlpha = a;
      const s = 1 + Math.max(0, 0.15 - banner.t) * 3;
      ctx.save(); ctx.translate(W / 2, 600); ctx.scale(s, s);
      const sz = fitText(banner.title, 980, 76);
      text(banner.title, 0, 0, sz, banner.color, 'center');
      if (banner.sub) text(banner.sub, 0, 64, fitText(banner.sub, 960, 32), '#ffffff', 'center', 800);
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  // floaters
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt;
    if (f.t > 1.3) { floaters.splice(i, 1); continue; }
    ctx.globalAlpha = clamp(1.3 - f.t, 0, 1);
    text(f.text, f.x, f.y - f.t * 70, f.size, f.color, 'center');
    ctx.globalAlpha = 1;
  }
}

function giftMenu(y) {
  const rows = sim.giftMap.slice(0, 8);
  const h = 70 + rows.length * 48 + 64;
  panel(90, y, W - 180, h, 30, 0.82);
  text('🎁 GIFTS DEFEND THE CITY', W / 2, y + 38, 32, '#ffd34a', 'center');
  rows.forEach((r, i) => {
    const a = ACTIONS[r.action], yy = y + 92 + i * 48;
    const sz = fitText(r.name, 330, 28);
    text(r.name, 150, yy, sz, '#ffffff', 'left', 800);
    text('→', 520, yy, 28, '#9fb8e8', 'center');
    text(`${a.icon} ${a.label}`, 570, yy, fitText(`${a.icon} ${a.label}`, 400, 28), a.color);
  });
  const ty = y + 70 + rows.length * 48 + 28;
  text(`Other gifts by coins: ${GIFT_TIERS.map(g => `${g.range} ${ACTIONS[g.action].icon}`).join(' · ')}`, W / 2, ty, fitText('Other gifts by coins: 1–9 🏹 · 10–99 💣 · 100–999 ☄ · 1000+ 🐉', 820, 22), '#cfe0ff', 'center', 800);
  return y + h;
}

function drawFlow(t, dt) {
  const st = sim.state;
  if (st === 'intro' || st === 'countdown') {
    ctx.fillStyle = `rgba(0,0,0,${st === 'intro' ? 0.45 : 0.25})`; ctx.fillRect(0, 0, W, H);
    if (st === 'intro') {
      const s = clamp(sim.stateT * 4, 0, 1);
      ctx.globalAlpha = s;
      text(`WAVE ${sim.wave}`, W / 2, 380, 120, '#ffffff', 'center');
      text(sim.cfg.night.name, W / 2, 470, 44, '#ffd34a', 'center');
      text(`${sim.queue.length} ZOMBIES${sim.cfg.boss ? ` · ☠ BOSS ×${sim.cfg.boss}` : ''}`, W / 2, 530, 36, '#b4ff6a', 'center');
      if (sim.cfg.relief < 1) text(`The horde is ${Math.round((1 - sim.cfg.relief) * 100)}% weaker after the fall`, W / 2, 580, 26, '#9fe8ff', 'center', 800);
      const end = giftMenu(620);
      panel(90, end + 20, W - 180, 196, 30, 0.82);
      text('💬 Comment !join = become a defender', 130, end + 60, 27, '#ff7aa8', 'left', 800);
      text('💬 Comment "repair" = fix the wall', 130, end + 104, 27, '#7dff5a', 'left', 800);
      text('➕ Follow = +8% wall  ·  ↗ Share = rapid fire', 130, end + 148, 27, '#38e8ff', 'left', 800);
      text('Tap for firepower · gifts recruit, upgrade or repair', W / 2, end + 186, 22, '#cfe0ff', 'center', 800);
      ctx.globalAlpha = 1;
    } else {
      const n = sim.countdown, k = sim.stateT % 1;
      const s = 1 + (1 - k) * 0.6;
      ctx.save(); ctx.translate(W / 2, 760); ctx.scale(s, s); ctx.globalAlpha = 1 - k * 0.6;
      text(String(n), 0, 0, 260, n === 1 ? '#ff4a4a' : '#ffd34a', 'center');
      ctx.restore(); ctx.globalAlpha = 1;
      text('COMMENT !join · TAP FOR FIREPOWER', W / 2, 960, 40, '#ffffff', 'center');
    }
  }
  if (goT > 0) {
    goT -= dt;
    const s = 1 + (1.2 - goT) * 0.5;
    ctx.save(); ctx.globalAlpha = clamp(goT, 0, 1); ctx.translate(W / 2, 700); ctx.scale(s, s);
    text('DEFEND!', 0, 0, 170, '#ff4a4a', 'center'); ctx.restore(); ctx.globalAlpha = 1;
  }
  if (st === 'clear' && clearInfo) {
    clearInfo.t += dt;
    const a = clamp(clearInfo.t * 4, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, W, H);
    panel(90, 420, W - 180, 640, 34, 0.86);
    text(`WAVE ${clearInfo.wave} SURVIVED!`, W / 2, 500, fitText(`WAVE ${clearInfo.wave} SURVIVED!`, 840, 72), '#7dff5a', 'center');
    text(`⏱ ${clearInfo.time.toFixed(1)} s   ·   🪙 +${fmt(clearInfo.coins)}`, W / 2, 580, 36, '#ffd84a', 'center');
    if (clearInfo.mvp) {
      const p = sim.players.get(clearInfo.mvp.name);
      text('🏆 MVP — MOST KILLS', W / 2, 660, 30, '#ffd34a', 'center');
      avatarCircle(avatar(p?.avatar), W / 2, 760, 66, clearInfo.mvp.name, '#ffd34a'); crown(W / 2, 682, 22);
      text(clearInfo.mvp.name, W / 2, 860, fitText(clearInfo.mvp.name, 760, 50), '#ffffff', 'center');
      text(`${clearInfo.mvp.kills} zombies`, W / 2, 910, 30, '#b4ff6a', 'center');
    } else text('The captain and the turrets held the wall. Tap to join!', W / 2, 760, 32, '#cfe0ff', 'center');
    if (clearInfo.tapper) text(`❤ Top tapper: ${clearInfo.tapper.name} (${fmt(clearInfo.tapper.taps)})`, W / 2, 980, fitText(`❤ Top tapper: ${clearInfo.tapper.name} (${fmt(clearInfo.tapper.taps)})`, 820, 30), '#ff7aa8', 'center');
    text(`Next wave in ${Math.max(1, Math.ceil(FLOW.clear - sim.stateT))}…`, W / 2, 1030, 26, '#9fb8e8', 'center', 800);
    ctx.globalAlpha = 1;
  }
  if (st === 'fallen' && fallenInfo) {
    fallenInfo.t += dt;
    ctx.fillStyle = `rgba(60,0,0,${clamp(fallenInfo.t, 0, 0.6)})`; ctx.fillRect(0, 0, W, H);
    const a = clamp(fallenInfo.t * 2, 0, 1); ctx.globalAlpha = a;
    text('THE CITY HAS FALLEN', W / 2, 640, fitText('THE CITY HAS FALLEN', 980, 84), '#ff4a4a', 'center');
    text(`Survivors regroup at wave ${fallenInfo.back}`, W / 2, 740, 40, '#ffffff', 'center');
    text('Turrets lose 1 level · the horde will be weaker', W / 2, 800, 30, '#ffb0a0', 'center', 800);
    text('TAP, GIFT & REBUILD!', W / 2, 900, 56, '#ffd34a', 'center');
    ctx.globalAlpha = 1;
  }
}

/* ---------------- frame ---------------- */
let last = performance.now(), simT = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now; simT += dt;
  demoCrowd(dt);
  sim.update(dt);
  ensureWorld();
  handleSimEvents();
  cam.shake = Math.max(0, cam.shake - dt * 2.2);
  cam.sx = Math.sin(simT * 19) * Math.min(1, cam.shake) * LIGHTING.shakePixels;
  cam.sy = Math.sin(simT * 17) * Math.min(1, cam.shake) * LIGHTING.shakePixels * 0.5;

  camera.update(dt, sim);
  ctx.save(); camera.apply(ctx); ctx.translate(cam.sx, cam.sy);
  ctx.drawImage(scene.A, 0, 0);
  ctx.drawImage(decals, 0, 0);
  if (sim.effects.freeze > 0) { ctx.fillStyle = 'rgba(150,220,255,0.12)'; ctx.fillRect(0, 280, W, WORLD.wallY - 280); }
  // horde outside the wall (far ones first)
  const outside = [], inside = [];
  for (const z of sim.zombies) if (z.hp > 0) (z.state === 'breach' || z.state === 'core' ? inside : outside).push(z);
  outside.sort((a, b) => a.y - b.y); inside.sort((a, b) => a.y - b.y);
  drawCorpses(dt, false);
  for (const z of outside) drawZombie(z, simT);
  ctx.drawImage(scene.B, 0, 0);
  if (!atlas.ready) drawWindmill(simT);
  drawWallState(simT);
  // defenders
  const lbTop = sim.activeLeaderboard(1)[0]?.name;
  for (const tu of sim.turrets) drawTurret(tu, simT);
  drawSurvivor(sim.captain, CAPTAIN_POS, CAPTAIN.level, simT, false);
  for (const guard of sim.garrison) drawSurvivor(guard, guard.pos, 1, simT, false);
  const order = sim.squad.map((s, i) => [s, i]).filter(([s]) => s).sort((a, b) => SLOTS[a[1]].y - SLOTS[b[1]].y);
  for (const [s, i] of order) drawSurvivor(s, SLOTS[i], sim.levelOf(s.name), simT, s.name === lbTop);
  drawCorpses(dt, true);
  if (atlas.ready) {
    const nodes = CITY_BUILDINGS.map(b => ({ y: b.y, draw: () => atlas.draw(ctx, b.id, b.x, b.y, b.width) }));
    for (const w of sim.settlement.workers) nodes.push({ y: w.y, draw: () => {
      ctx.fillStyle = '#0004'; ctx.beginPath(); ctx.ellipse(w.x, w.y, 15, 5, 0, 0, 7); ctx.fill();
      const frame = Math.hypot(w.vx, w.vy) > 5 ? walkFrame('worker', w.distance, w.id) : 0;
      if (animations.ready) animations.draw(ctx, 'worker', frame, w.x, w.y, 37, w.vx < 0);
      else atlas.draw(ctx, 'worker', w.x, w.y, 37, { flip: w.vx < 0 });
      if (w.carrying) { ctx.fillStyle = w.site ? '#e8c451' : '#aa7543'; ctx.fillRect(w.x + 9, w.y - 27, 9, 8); }
    } });
    for (const z of inside) nodes.push({ y: z.y, draw: () => drawZombie(z, simT) });
    nodes.sort((a, b) => a.y - b.y).forEach(n => n.draw());
  } else for (const z of inside) drawZombie(z, simT);
  drawLights(simT);
  drawShots();
  drawMeteors();
  drawParts(dt);
  drawDragons(dt);
  drawWeather(simT, dt);
  ctx.restore();

  ctx.fillStyle = pal.tint; ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.32, W / 2, H * 0.5, H * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  breachT = Math.max(0, breachT - dt);
  if (sim.breached) { ctx.strokeStyle = '#b14b42'; ctx.lineWidth = 4; ctx.strokeRect(3, 3, W - 6, H - 6); }
  flash = 0; lightning = 0; // Combat effects stay local; ambient lighting remains steady.
  drawHUD(simT, dt);
  panel(24, 1764, W - 48, 112, 20, 0.76);
  text('COMMENT !join TO JOIN · TAP = FASTER FIRE', 50, 1792, 23, '#e7d49a');
  text(`WOOD ${sim.settlement.wood} · FOOD ${sim.settlement.food} · ${sim.garrison.length} GUARDS · ${sim.session.comments} COMMENTS`, 50, 1828, 23, '#d9e4e7', 'left', 700);
  text('Gifts: more soldiers · auto upgrades · repair · rapid fire', 50, 1860, 20, '#9fb6ae', 'left', 600, false);
  drawFlow(simT, dt);
  // occasional sounds
  twangBudget = Math.min(6, twangBudget + dt * 6);
  for (const s of [sim.captain, ...sim.squad]) if (s && s.flash > 0.11 && twangBudget >= 1) { twangBudget--; blip(900 + Math.random() * 300, 0.06, 'triangle', 0.04, 0.6); }
  if (sim.state === 'fight' && Math.random() < dt * 0.4 && sim.zombies.length) blip(70 + Math.random() * 40, 0.8, 'sawtooth', 0.05, 0.8);
  if (!document.body.classList.contains('broadcast')) updatePanel();
  requestAnimationFrame(frame);
}

/* ---------------- crowd input (LIVE + demo) ---------------- */
let viewers = 0, audienceMode = 'auto';
const demo = { on: false, rate: 6, people: 12, acc: 0, sendT: 0, batch: new Map() };
const demoNames = ['dark_ana', 'zombie_slayer', 'mihai.arrow', 'ioana_bow', 'vlad.tepes', 'night_watch', 'crisu99', 'andreea.k', 'bogdan_t', 'lord_byte', 'elena.r', 'ghost_rider', 'radu.archer', 'sweetbia', 'tavi_77', 'kingofwall', 'luna.mage', 'stefan_x', 'maria.rose', 'paul.hunter'];
function viewerCount() { return audienceMode === 'auto' ? viewers : Number(audienceMode) || 0; }
function demoCrowd(dt) {
  if (!demo.on) return;
  demo.acc += demo.rate * dt;
  let n = Math.floor(demo.acc); demo.acc -= n;
  while (n-- > 0) { const u = demoNames[Math.floor(Math.random() * Math.min(demoNames.length, demo.people))]; demo.batch.set(u, (demo.batch.get(u) || 0) + 1); }
  if ((demo.sendT -= dt) <= 0) {
    demo.sendT = 0.3;
    for (const [user, count] of demo.batch) {
      if (!sim.survivors.has(user)) command({ cmd: 'comment', user, text: '!join', source: 'demo' });
      command({ cmd: 'tap', user, count, source: 'demo' });
    }
    demo.batch.clear();
  }
}

function applyLive(ev) {
  const avatarUrl = ev.avatar || null;
  switch (ev.type) {
    case 'like': {
      const total = effectiveTaps(ev.count, viewerCount());
      const users = Array.isArray(ev.users) ? ev.users : [];
      const raw = Math.max(1, Number(ev.count) || 1);
      let used = 0;
      let rawUsed = 0;
      for (const [name, c, av] of users) { const amount = Math.min(c, raw - rawUsed), share = total * amount / raw; if (used + share > total + 1e-9) break; used += share; rawUsed += amount; sim.tap(share, name, av, amount); }
      if (total - used > 1e-6) sim.tap(total - used, null, null, raw - rawUsed);
      break;
    }
    case 'gift': sim.gift({ coins: ev.coins, count: ev.count, user: ev.user, avatar: avatarUrl, name: ev.name }); break;
    case 'follow': sim.follow(ev.user, avatarUrl); break;
    case 'share': sim.share(ev.user, avatarUrl); break;
    case 'comment': sim.comment(ev.user, ev.text, avatarUrl); break;
    case 'command': runCommand(ev); break;
  }
}

// Host commands (panel, keyboard, simulated crowd). Relayed through the server so every open view stays in step.
function runCommand(c) {
  const user = c.user || 'HOST';
  if (['tap', 'gift', 'comment', 'follow', 'share', 'repair'].includes(c.cmd)) sim.participant(user, c.source === 'demo' ? 'demo' : 'test');
  switch (c.cmd) {
    case 'tap': sim.tap(c.count || 1, user); break;
    case 'gift': sim.gift({ name: c.name || '', action: c.action, coins: c.name || c.action ? 1 : GIFT_TIERS[clamp(c.tier | 0, 0, 3)].min, count: 1, user }); break;
    case 'comment': sim.comment(user, c.text || '!join'); break;
    case 'follow': sim.follow(user); break;
    case 'share': sim.share(user); break;
    case 'repair': sim.comment(user, 'repair'); break;
    case 'buy': sim.buy(c.id); persist(); break;
    case 'auto': sim.autoUpgrade = !!c.value; persist(); break;
    case 'wave': sim.setWave(c.wave); persist(); break;
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
    if (d.type === 'status') { status = d; viewers = Number(d.viewers) || 0; }
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
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) command({ cmd: 'tap' }); }
  else if (/^Digit[1-4]$/.test(e.code)) command({ cmd: 'gift', tier: Number(e.code.slice(5)) - 1 });
  else if (e.code === 'KeyR') command({ cmd: 'repair' });
  else if (e.code === 'KeyF') command({ cmd: 'follow' });
  else if (e.code === 'KeyS') command({ cmd: 'share' });
  else if (e.code === 'KeyM') setSound(!audio.on);
  else if (e.code === 'KeyH' || e.code === 'Escape') document.body.classList.toggle('broadcast');
});
cv.addEventListener('pointerdown', () => command({ cmd: 'tap' }));
cv.addEventListener('wheel', e => { e.preventDefault(); camera.manualZoom = clamp(camera.manualZoom - e.deltaY * 0.0003, 1, 1.18); }, { passive: false });

/* ---------------- host panel ---------------- */
const $ = id => document.getElementById(id);
let giftDraft = null;
function renderGiftSetup() {
  const box = $('gifts'); if (!box) return;
  if (document.activeElement && box.contains(document.activeElement)) return;
  giftDraft = sim.giftMap.map(r => ({ ...r }));
  box.innerHTML = '';
  giftDraft.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'gift';
    row.innerHTML = `<input type="text" value="${r.name.replace(/"/g, '&quot;')}" maxlength="40"><select>${ACTION_IDS.map(a => `<option value="${a}"${a === r.action ? ' selected' : ''}>${ACTIONS[a].icon} ${ACTIONS[a].label}</option>`).join('')}</select><button title="Test this gift">▶</button><button title="Remove">✕</button>`;
    const [inp, sel, test, del] = row.querySelectorAll('input,select,button');
    inp.oninput = () => { giftDraft[i].name = inp.value; };
    sel.onchange = () => { giftDraft[i].action = sel.value; };
    test.onclick = () => command({ cmd: 'gift', name: giftDraft[i].name, action: giftDraft[i].action });
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
  if (!$('gifts')) return;
  $('addGift').onclick = () => { giftDraft.push({ name: 'New gift', action: 'rapid' }); sim.setGiftMap(giftDraft); renderGiftSetup(); };
  $('saveGifts').onclick = saveGiftMap;
  $('resetGifts').onclick = () => { giftDraft = DEFAULT_GIFT_MAP.map(r => ({ ...r })); saveGiftMap(); };
  renderGiftSetup();
  const armory = $('armory');
  for (const id of UPGRADE_IDS) {
    const row = document.createElement('div'); row.className = 'up';
    row.innerHTML = `<div><b>${UPGRADES[id].name}</b> <span id="lv-${id}"></span><small>${UPGRADES[id].info}</small></div><button id="buy-${id}">BUY</button>`;
    armory.appendChild(row);
    row.querySelector('button').onclick = () => command({ cmd: 'buy', id });
  }
  document.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => command({ cmd: b.dataset.cmd, tier: Number(b.dataset.tier || 0), action: b.dataset.action }));
  $('sendComment').onclick = () => command({ cmd: 'comment', user: $('testUser').value.trim() || 'HOST', text: $('testComment').value.trim() || '!join' });
  $('testComment').onkeydown = e => { if (e.key === 'Enter') $('sendComment').click(); };
  $('rosterSearch').oninput = renderRoster;
  $('auto').onchange = e => command({ cmd: 'auto', value: e.target.checked });
  $('demo').onchange = e => { demo.on = e.target.checked; };
  const rateLabel = () => { $('rateVal').textContent = `${demo.rate} taps/s from ${demo.people} viewers → ×${fireMultFor(steadyPower(demo.rate)).toFixed(1)} firepower`; };
  $('rate').oninput = e => { demo.rate = Number(e.target.value); rateLabel(); };
  $('people').oninput = e => { demo.people = Number(e.target.value); rateLabel(); };
  rateLabel();
  $('audience').onchange = e => { audienceMode = e.target.value; };
  $('cameraMode').onchange = e => { camera.mode = e.target.value; };
  $('resetCamera').onclick = () => { camera.manualZoom = 1; camera.mode = 'auto'; $('cameraMode').value = 'auto'; };
  $('soundBtn').onclick = () => setSound(!audio.on);
  $('prevWave').onclick = () => command({ cmd: 'wave', wave: sim.wave - 1 });
  $('nextWave').onclick = () => command({ cmd: 'wave', wave: sim.wave + 1 });
  $('restart').onclick = () => command({ cmd: 'wave', wave: sim.wave });
  $('reset').onclick = () => { if (confirm('Erase coins, upgrades, turrets and the leaderboard?')) command({ cmd: 'reset' }); };
  $('broadcastBtn').onclick = () => document.body.classList.add('broadcast');
  $('connect').onclick = async () => {
    if (status.connected || status.connecting) { await fetch('/api/disconnect', { method: 'POST' }).catch(() => {}); return; }
    const username = $('user').value.trim();
    localStorage.setItem('last-city-user', username);
    try { const r = await fetch('/api/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) }); status = await r.json(); } catch { status = { message: 'The local bridge is not running. Start START-LAST-CITY.bat.' }; }
  };
  $('user').value = localStorage.getItem('last-city-user') || '';
  $('auto').checked = sim.autoUpgrade;
}
let panelT = 0;
let rosterTime = -1;
function renderRoster() {
  const all = sim.roster(), filter = $('rosterSearch').value.trim().toLowerCase();
  const active = all.filter(p => p.state === 'ON WALL' || p.state === 'QUEUED');
  const summary = ['live', 'demo', 'test'].map(source => `${all.filter(p => p.source === source).length} ${source.toUpperCase()}`).join(' · ');
  $('rosterSummary').textContent = `${summary} · ${active.length} active joined · ${sim.garrison.length + 1} NPC defenders`;
  $('activityTotals').textContent = `${fmt(sim.session.likes)} raw likes · ${fmt(sim.session.comments)} processed comments · ${fmt(sim.session.gifts)} gifts · ${fmt(sim.session.follows)} follows · ${fmt(sim.session.shares)} shares`;
  const rows = all.filter(p => !filter || p.name.toLowerCase().includes(filter)).slice(0, 200);
  const body = $('rosterBody'); body.replaceChildren();
  for (const p of rows) {
    const row = document.createElement('tr');
    for (const value of [p.name, p.source.toUpperCase(), p.state, p.comments, fmt(p.likes), p.gifts, p.kills]) {
      const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
    }
    body.appendChild(row);
  }
  $('rosterEmpty').hidden = rows.length > 0;
}
function updatePanel() {
  if (!$('status') || (panelT = (panelT + 1) % 10)) return;
  $('status').textContent = status.message || '';
  $('status').className = status.connected ? 'ok' : '';
  $('connect').textContent = status.connected || status.connecting ? 'DISCONNECT' : 'CONNECT';
  $('viewers').textContent = `Viewers: ${fmt(viewers)} · like divisor ×${(Math.max(1, viewerCount() * 0.03)).toFixed(1)}`;
  $('wallet').textContent = fmt(sim.coins);
  $('lvl').textContent = `Wave ${sim.wave} (best ${sim.best}) · horde ${sim.queue.length} · HP ×${sim.cfg.hpMult.toFixed(2)} · attack ×${sim.cfg.attackMult.toFixed(2)} · turrets ${sim.turrets.map(t => t.level).join('/')}`;
  for (const id of UPGRADE_IDS) {
    const lv = sim.upgrades[id] || 0, cost = upgradeCost(id, lv);
    $(`lv-${id}`).textContent = `LV ${lv}/${UPGRADES[id].max}`;
    const b = $(`buy-${id}`); b.textContent = Number.isFinite(cost) ? fmt(cost) : 'MAX'; b.disabled = !(cost <= sim.coins);
  }
  $('session').textContent = `Session: ${fmt(sim.session.taps)} effective firepower taps · ${fmt(sim.session.comments)} comments · ${fmt(sim.session.gifts)} gifts · ${fmt(sim.session.joined)} joined · ${fmt(sim.session.kills)} kills`;
  if (sim.time - rosterTime >= 0.75) { rosterTime = sim.time; renderRoster(); }
  $('assetsStatus').textContent = atlas.ready ? `16 assets · ${animations.ready ? '48 animation frames' : animations.error || 'loading cycles'} · ${sim.settlement.deliveries} deliveries` : atlas.error ? `Procedural art fallback: ${atlas.error}` : 'Loading kingdom sprites…';
}
buildPanel();
ensureWorld();
requestAnimationFrame(t => { last = t; frame(t); });
window.__sim = sim;
window.__atlas = atlas;
