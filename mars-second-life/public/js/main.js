import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld } from './world.js';
import { loadCast, Crowd, Overlay, CHAT_ICONS } from './people.js';
import { Director } from './director.js';
import { LOCATIONS, locationById, locationForGift, DEFAULT_GIFT_MAP, giftHype, shotSeconds } from '../rules.js';

const qs = new URLSearchParams(location.search);
const BROADCAST = qs.has('broadcast');
const FIXED = qs.has('fixed');
const QUALITY = qs.get('q') === 'high' ? 'high' : 'low';
if (BROADCAST) document.body.classList.add('broadcast');
const $ = id => document.getElementById(id);

// ── Renderer ──
const canvas = $('game');
const W = QUALITY === 'low' ? 540 : 1080, H = QUALITY === 'low' ? 960 : 1920;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY === 'high', powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = QUALITY === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 3000);
const composer = QUALITY === 'high' ? new EffectComposer(renderer) : null;
composer?.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.6, 0.5, 1.6);
composer?.addPass(bloom);
composer?.addPass(new OutputPass());

const world = buildWorld(scene, renderer, { quality: QUALITY });
const overlay = new Overlay($('tags'), scene);
let crowd, director;
let giftMap = DEFAULT_GIFT_MAP;

// ── HUD ──
function renderLegend() {
  const el = $('legend'); el.innerHTML = '';
  LOCATIONS.forEach((L, i) => {
    const g = giftMap.find(x => x.loc === L.id);
    const row = document.createElement('div'); row.className = 'lg'; row.style.setProperty('--c', L.color);
    row.innerHTML = `<span class="n">${i + 1}</span><span>${g ? escapeHtml(g.name) : 'Gift'} → <b>${L.icon} ${L.short}</b></span>`;
    el.appendChild(row);
  });
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
let placeTimer = 0;
function showPlace(id) {
  if (!id || id === 'plaza') { const el = $('place'); el.textContent = '🪐 COLONY PLAZA'; el.style.setProperty('--c', '#ff9a3c'); el.style.opacity = 1; clearTimeout(placeTimer); placeTimer = setTimeout(() => el.style.opacity = 0, 4000); return; }
  const L = locationById(id), el = $('place');
  el.textContent = `${L.icon} ${L.name.toUpperCase()}`; el.style.setProperty('--c', L.color); el.style.opacity = 1;
  clearTimeout(placeTimer); placeTimer = setTimeout(() => el.style.opacity = 0, 4500);
}
function showBanner(s) {
  const b = $('banner'), L = locationById(s.person.place);
  b.style.setProperty('--c', s.hype >= 2 ? '#ffd34a' : L.color);
  const av = b.querySelector('.av'); av.innerHTML = '';
  if (s.person.avatar) { const i = new Image(); i.referrerPolicy = 'no-referrer'; i.src = s.person.avatar; av.appendChild(i); }
  else { av.textContent = s.person.name.slice(0, 2).toUpperCase(); av.style.background = `hsl(${[...s.person.name].reduce((a, c) => a + c.codePointAt(0), 0) % 360},70%,45%)`; }
  b.querySelector('.who').textContent = s.person.name;
  b.querySelector('.what').textContent = s.banner || '';
  b.querySelector('.where').textContent = `${s.arrive ? 'arrived at' : 'is at'} ${L.icon} ${L.name}`;
  b.classList.add('show'); $('hud').classList.add('focus');
}
function hideBanner() { $('banner').classList.remove('show'); $('hud').classList.remove('focus'); }
function toast(text) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  const box = $('toast'); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), 3300);
}

// ── Events from TikTok (via local bridge) ──
let lastJoin = 0;
function onGift(e) {
  const user = String(e.user || 'VIEWER'), coins = Math.max(1, e.coins | 0 || 1), count = Math.max(1, e.count | 0 || 1);
  const loc = e.loc || locationForGift(e.name, coins, giftMap);
  const { person, arrived, moved } = crowd.bringViewer(user, e.avatar, loc);
  const hype = giftHype(coins, count);
  person.giftTotal = (person.giftTotal || 0) + coins * count;
  if (hype >= 2 || person.giftTotal >= 1000) overlay.setGold(person, true);
  const sec = shotSeconds(coins, count, director.queue.length);
  const banner = `sent ${e.name || 'a gift'}${count > 1 ? ` ×${count}` : ''}`;
  director.enqueue({ type: 'face', person, sec, arrive: arrived || moved, banner, hype });
  setTimeout(() => {
    world.hearts(person.headPos().add(new THREE.Vector3(0, 0.3, 0)), pick(['❤️', '💖', '✨', '🌹', '💫']), Math.min(12, 4 + count));
    if (hype >= 1) world.fireworks(person.pos.clone(), hype >= 2 ? 10 : 5);
    if (hype >= 2) world.flyover(person.pos.clone());
  }, arrived || moved ? 1500 : 300);
}
function onComment(e) {
  const p = crowd.viewer(e.user);
  if (p) { crowd.say(p, e.text || '💬', 5.5); p.lastActive = performance.now(); return; }
  const now = performance.now();
  if (now - lastJoin < 1500) return;
  lastJoin = now;
  const { person } = crowd.bringViewer(e.user, e.avatar, 'plaza');
  setTimeout(() => crowd.say(person, e.text || '👋', 5), 900);
}
function onFollow(e) {
  const { person } = crowd.bringViewer(e.user, e.avatar, crowd.viewer(e.user)?.place || 'plaza');
  setTimeout(() => { world.hearts(person.headPos(), '➕', 5); crowd.say(person, '👋 followed!', 3.5); }, 900);
  toast(`➕ ${e.user} followed — welcome to Mars!`);
}
function onShare(e) { const p = crowd.viewer(e.user); if (p) world.hearts(p.headPos(), '🚀', 4); toast(`🚀 ${e.user} shared the colony`); }
function onLike(e) {
  for (const [name, , avatar] of e.users || []) {
    const p = crowd.viewer(name);
    if (p) { if (Math.random() < 0.5) world.hearts(p.headPos().add(new THREE.Vector3(0, 0.3, 0)), '❤️', 2); if (avatar && !p.avatar) { p.avatar = avatar; overlay.attach(p); } }
  }
}
function handle(ev) {
  if (!crowd) { pending.push(ev); return; }
  const t = ev.type === 'command' ? ev.cmd : ev.type;
  if (t === 'gift') onGift(ev);
  else if (t === 'comment') onComment(ev);
  else if (t === 'follow') onFollow(ev);
  else if (t === 'share') onShare(ev);
  else if (t === 'like') { if (ev.users) onLike(ev); else { const p = ev.user && crowd.viewer(ev.user); if (p) world.hearts(p.headPos(), '❤️', 3); } }
  else if (t === 'time') world.setDayTime(ev.value);
  else if (t === 'reset') { for (const p of [...crowd.people]) if (p.isViewer) crowd.remove(p); }
}
const pending = [];

const es = new EventSource('/api/events');
es.onmessage = m => {
  let d; try { d = JSON.parse(m.data); } catch { return; }
  if (d.type === 'batch') d.events.forEach(handle);
  else if (d.type === 'status') setStatus(d);
  else if (d.type === 'audience') $('viewers').textContent = d.viewers ? `${d.viewers.toLocaleString()} watching` : '';
  else if (d.type === 'giftmap') { giftMap = d.map; renderLegend(); renderGiftSetup(); }
};
fetch('/api/gift-map').then(r => r.json()).then(d => { giftMap = d.map; renderLegend(); renderGiftSetup(); }).catch(() => renderLegend());
renderLegend();

// ── Boot ──
let t = 0;
(async () => {
  try {
    const cast = await loadCast('assets/models/', k => { $('loading').querySelector('i').style.width = `${Math.round(k * 80)}%`; });
    crowd = new Crowd(scene, world, cast, overlay);
    const npcs = QUALITY === 'low' ? 16 : 24;
    const districts = Object.keys(world.places);
    for (let i = 0; i < npcs; i++) crowd.spawnNPC(districts[i % districts.length]);
    crowd.maxPeople = QUALITY === 'low' ? 24 : 32;
    director = new Director(camera, world, crowd, { banner: showBanner, bannerOff: hideBanner, place: showPlace });
    $('loading').querySelector('i').style.width = '100%';
    setTimeout(() => $('loading').remove(), 300);
    pending.splice(0).forEach(handle);
    window.__mars = { world, crowd, director, camera, scene, handle };
  } catch (err) {
    console.error(err);
    $('loading').innerHTML = `<div style="padding:20px">Could not load the colonists.<br><span class="muted">${escapeHtml(err.message)}</span></div>`;
  }
})();

let frames = 0;
function step(dt) {
  t += dt;
  if (crowd) { crowd.update(dt, t, camera); director.update(dt, t); }
  world.update(dt, t, camera);
}
// test hook: advance the simulation without drawing
window.__advance = sec => { for (let i = 0; i < sec * 30; i++) step(1 / 30); };
let lastFrame = 0, overlayDt = 0, slowFrames = 0, samples = 0;
function frame(now = 0) {
  requestAnimationFrame(frame);
  if (document.hidden) { lastFrame = now; return; }
  const elapsed = now - lastFrame;
  if (elapsed < 1000 / 30) return;
  lastFrame = now - elapsed % (1000 / 30);
  const dt = FIXED ? 1 / 30 : Math.min(0.08, elapsed / 1000);
  step(dt);
  // Sustained overload lowers internal resolution; never queues catch-up work.
  samples++; if (elapsed > 55) slowFrames++;
  if (samples >= 120) {
    if (slowFrames > 50 && renderer.domElement.width > 360) {
      const width = Math.max(360, Math.round(renderer.domElement.width * 0.8 / 18) * 18);
      renderer.setSize(width, width * 16 / 9, false); composer?.setSize(width, width * 16 / 9);
    }
    samples = 0; slowFrames = 0;
  }
  if (composer) { bloom.strength = 0.32 + world.env.night * 0.18; composer.render(); }
  else renderer.render(scene, camera);
  overlayDt += dt;
  if (crowd && overlayDt >= 0.066) { overlay.update(camera, t, director.focusId); overlayDt = 0; }
  if (++frames === 3) window.ready = true;
}
frame();

// ── Host panel ──
function setStatus(s) {
  const el = $('status'); el.textContent = s.message || ''; el.className = s.connected ? 'ok' : '';
  $('connect').textContent = s.connected || s.connecting ? 'DISCONNECT' : 'CONNECT';
  if (s.username && !$('user').value) $('user').value = s.username;
  window.__status = s;
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json()).catch(() => ({}));
const cmd = body => post('/api/command', body);
$('connect').onclick = async () => {
  const s = window.__status || {};
  if (s.connected || s.connecting) setStatus(await post('/api/disconnect'));
  else setStatus(await post('/api/connect', { username: $('user').value }));
};
const FAKE = ['luna.star', 'andrei_99', 'mara.ro', 'cosmin_x', 'ioana.sky', 'red_rover', 'elena.mars', 'vlad_tv', 'sara.nova', 'alex.orbit', 'bianca_b', 'radu.rx', 'nightowl', 'dani.live', 'mihai007', 'cris.tal', 'astro.ana', 'teo_gamer', 'roxy.r', 'stefan.s'];
const pick = a => a[Math.floor(Math.random() * a.length)];
let lastTest = null;
const testName = () => ($('tname').value.trim() || `${pick(FAKE)}${Math.random() < 0.5 ? Math.floor(Math.random() * 90 + 10) : ''}`).slice(0, 24);
function testGift(loc, coins = 1, name) {
  lastTest = { user: testName(), loc, coins, name: name || giftMap.find(g => g.loc === loc)?.name || 'Gift' };
  cmd({ cmd: 'gift', ...lastTest });
}
const lb = $('locbtns');
LOCATIONS.forEach((L, i) => { const b = document.createElement('button'); b.innerHTML = `${L.icon}<br>${i + 1} ${L.short}`; b.onclick = () => testGift(L.id, [1, 5, 15, 40, 100][i]); lb.appendChild(b); });
$('big').onclick = () => testGift(pick(LOCATIONS).id, 1000, 'Galaxy');
$('again').onclick = () => { if (lastTest) cmd({ cmd: 'gift', ...lastTest, loc: lastTest.loc }); else testGift('park'); };
$('follow').onclick = () => cmd({ cmd: 'follow', user: testName() });
$('like').onclick = () => { const p = crowd?.people.find(x => x.isViewer); cmd({ cmd: 'like', user: p?.user || testName(), count: 5 }); };
const sendComment = () => { const text = $('ctext').value.trim() || pick(['Hello from Earth! 🌍', 'This colony is amazing', 'Who wants coffee? ☕', 'Salut din România! 🇷🇴', 'Let\'s go to the studio 🎧', 'I live on Mars now 😂']); cmd({ cmd: 'comment', user: lastTest?.user || testName(), text }); $('ctext').value = ''; };
$('csend').onclick = sendComment; $('ctext').onkeydown = e => { if (e.key === 'Enter') sendComment(); e.stopPropagation(); };
document.querySelectorAll('[data-time]').forEach(b => b.onclick = () => cmd({ cmd: 'time', value: Number(b.dataset.time) }));
$('freeze').onchange = e => world.setDaySpeed(e.target.checked ? 0 : 1 / 480);
const toggleBroadcast = () => document.body.classList.toggle('broadcast');
$('bview').onclick = toggleBroadcast;
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= '5') { const i = Number(e.key) - 1; testGift(LOCATIONS[i].id, [1, 5, 15, 40, 100][i]); }
  else if (e.key === 'b' || e.key === 'B') $('big').click();
  else if (e.key === 'c' || e.key === 'C') sendComment();
  else if (e.key === 'h' || e.key === 'H') toggleBroadcast();
});

// simulated audience (runs in the host panel only; events go through the bridge to every view)
let simAcc = 0;
setInterval(() => {
  if (document.hidden || BROADCAST || !crowd || !$('sim').checked) return;
  simAcc += Number($('simrate').value);
  if (simAcc < 20) return; simAcc = 0;
  const viewers = crowd?.people.filter(p => p.isViewer) || [];
  const simUser = viewers.length >= 10 ? pick(viewers).user : pick(FAKE.slice(0, 10));
  const roll = Math.random();
  if (roll < 0.35) { const L = pick(LOCATIONS); cmd({ cmd: 'gift', user: simUser, loc: L.id, coins: 1, name: giftMap.find(g => g.loc === L.id)?.name || 'Rose', count: Math.random() < 0.2 ? 5 : 1 }); }
  else if (roll < 0.8) cmd({ cmd: 'comment', user: simUser, text: pick(['hi!! 👋', 'so cool', 'what is this game 😍', 'I want to go to the café', 'Mars 🔥', 'salut', 'gift for the studio!', 'look at the sky', pick(CHAT_ICONS)]) });
  else if (viewers.length) cmd({ cmd: 'like', user: pick(viewers).user, count: 3 });
}, 1000);

// gift setup editor
function renderGiftSetup() {
  const box = $('gifts'); if (!box) return; box.innerHTML = '';
  giftMap.forEach((g, i) => box.appendChild(giftRow(g, i)));
}
function giftRow(g, i) {
  const row = document.createElement('div'); row.className = 'gift';
  const name = document.createElement('input'); name.type = 'text'; name.value = g.name; name.placeholder = 'Gift name';
  const sel = document.createElement('select');
  LOCATIONS.forEach(L => { const o = document.createElement('option'); o.value = L.id; o.textContent = `${L.icon} ${L.name}`; if (L.id === g.loc) o.selected = true; sel.appendChild(o); });
  const test = document.createElement('button'); test.textContent = '▶'; test.title = 'Test this gift';
  test.onclick = () => testGift(sel.value, 1, name.value || 'Gift');
  const del = document.createElement('button'); del.textContent = '✕'; del.onclick = () => row.remove();
  row.append(name, sel, test, del); return row;
}
$('addgift').onclick = () => $('gifts').appendChild(giftRow({ name: '', loc: 'park' }));
$('savegifts').onclick = async () => {
  const map = [...$('gifts').children].map(r => ({ name: r.querySelector('input').value, loc: r.querySelector('select').value }));
  const d = await post('/api/gift-map', { map }); if (d.map) { giftMap = d.map; renderLegend(); renderGiftSetup(); toast('Gift list saved'); }
};
fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => {});
