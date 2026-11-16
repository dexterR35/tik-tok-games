// TURBOSTRADA / HIGHWAY TURBO – runner 3D pentru TikTok LIVE (Three.js)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RULES, activateGame, setCommonRule } from './rules.js';
import * as MX from './math.js';
import { GAMES, MODES } from './games/index.js';
import { TEAM_COLORS } from './games/common.js';
import { setLang, t } from './i18n.js';
import { Sound } from './sound.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const SIM = params.has('sim');
const LOWFX = params.has('lowfx');
const snd = new Sound(RULES.SOUND.VOLUME);
const SOUND_ON = RULES.SOUND.ENABLED && params.get('sound') !== '0';
let paused = false;
// fereastra deschisa prin tunel (alt PC) = doar privire; pe acest PC = fereastra care conduce jocul
// ?preview = copie doar pentru privit (panou / previzualizare): nu trimite nimic si nu ia locul ferestrei de joc
// ?key = pagina pusa ca sursa "Link" in LIVE Studio prin tunel (https): e fereastra de joc adevarata, nu spectator
const LIVE_KEY = params.get('key') || '';
const SPECTATOR = (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !LIVE_KEY) || params.has('preview');
// ghidul cu butoanele TikTok apare DOAR in previzualizare (?preview&tiktok), niciodata in imaginea trimisa in live: TikTok le pune singur
if (params.has('tiktok') && params.has('preview')) document.body.classList.add('tt');
// ?live = sursa "Link" din TikTok LIVE Studio (1080x1920): fara mesaje pentru tine pe ecran (sunet, status)
const LIVE_SRC = params.has('live');
if (LIVE_SRC) document.body.classList.add('livesrc');
const WIN_ID = Math.random().toString(36).slice(2);
let standby = false, forceStart = false, pendingRound = null;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONT = '"Lilita One", "Segoe UI", Arial, sans-serif';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let LANG = params.get('lang') || RULES.LANGUAGE;
setLang(LANG);
const urlMode = MODES.includes(params.get('mode')) ? params.get('mode') : null;
// JOCUL ACTIV: GAME = pasii jocului (games/<joc>.js), G = setarile lui (blocul din rules.js). RULES = regulile comune + ce suprascrie jocul.
let MODE = urlMode || (MODES.includes(RULES.MODE) ? RULES.MODE : 'classic');
let GAME = GAMES[MODE], G = activateGame(MODE);
let roundT = 300; // durata cursei curente (fiecare joc o calculeaza: GAME.roundSeconds)
const ROUND = () => roundT;
const tapCost = d => MX.tapCost(RULES, d), rocketThreshold = l => MX.rocketThreshold(RULES, l), rocketMeters = l => MX.rocketMeters(RULES, l);

// ================================================================ pista
const LANES = RULES.LANES;
const LANE_W = 2.4;
const ROAD_W = LANES * LANE_W;
const SHOULDER = 1.2;
const EDGE = ROAD_W / 2 + SHOULDER;
const OPP_X = -11, OPP_W = 8;
const laneX = l => (l - (LANES - 1) / 2) * LANE_W;
const SEG = 26;
const CHUNK = 40, NCH = 7;
const JUMP_T = 0.62, JUMP_H = 1.5, SLIDE_T = 0.7;
// OBSTACOLE si MONEDE pe metru, pe o banda. Acelasi calcul pentru TOTI alergatorii (desenati sau nu), ca nimeni sa nu fie avantajat de camera.
// OBST_PER_M se masoara din generatorul de traseu la fiecare start (measureTrack), deci tine cont si de santier.
let OBST_PER_M = 2 / LANES / SEG;
const COINS_PER_M = 1.7 / LANES / SEG;
// ⚡ ENERGIE: scade in timp, creste cu tap-uri. Energie mica = evita mai greu obstacolele si alearga putin mai incet.
const F = RULES.FOCUS;
const dodgeOf = p => MX.dodgeOf(RULES, p.focus);
const focusSpeed = p => MX.focusSpeed(RULES, p.focus);
let FINISH = 3000;

// ================================================================ renderer + post-procesare
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOWFX ? 1 : Math.min(devicePixelRatio, 1.5));
// calitate automata: scade efectele daca FPS-ul e mic (?quality=0..4 o fixeaza)
const BLOOM = params.get('bloom') === '1' && !LOWFX; // implicit FARA bloom: imagine clara, fara blur
const Q = { level: 0, maxVisible: RULES.MAX_VISIBLE, shadows: !LOWFX, bloom: BLOOM, maxFloats: 10, packVisible: RULES.PACK_VISIBLE, fixed: params.has('quality') };
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
let FOG = new THREE.Color(0xe0687c);
scene.fog = new THREE.Fog(FOG, 140, 380); // ceata doar departe: aproape totul e clar
const camera = new THREE.PerspectiveCamera(64, 9 / 16, 0.1, 900);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (BLOOM) composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.25, 0.2, 0.97));
composer.addPass(new OutputPass());
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  camera.aspect = w / h; viewShiftNow = null; applyViewShift(0);
}
// imaginea 3D e mutata in sus (cursa, lobby) sau putin in jos (podium), ca personajele sa nu stea sub comentariile / butoanele TikTok
let viewShiftNow = null;
function applyViewShift(dt) {
  const S = RULES.TIKTOK_SAFE ? RULES.TIKTOK_SAFE_SHIFT : null;
  const want = !S ? 0 : typeof S === 'number' ? S : (S[phase] ?? 0);
  const cur = viewShiftNow === null || !dt ? want : viewShiftNow + (want - viewShiftNow) * Math.min(1, dt * 3);
  if (cur === viewShiftNow) return;
  viewShiftNow = Math.abs(cur - want) < 0.001 ? want : cur;
  const w = stage.clientWidth, h = stage.clientHeight;
  if (viewShiftNow) camera.setViewOffset(w, h, 0, h * viewShiftNow, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function makeCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function canvasTex(w, h, draw, repeat) {
  const tx = new THREE.CanvasTexture(makeCanvas(w, h, draw));
  tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (repeat) tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return tx;
}
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const glow = (color, intensity = 2.5) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const cone = new THREE.ConeGeometry(1, 1, 10);
function addMesh(parent, geo, m, x, y, z, sx = 1, sy = 1, sz = 1, shadow = true) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
  o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
}

// ================================================================ cer, soare, oras in fundal
// ---- ZI / NOAPTE dupa ora de pe PC (sau ?time=14 pentru test). Presetari: noapte, rasarit, zi, apus
const DAY = {
  night:  { sky: ['#03060f', '#071026', '#0d1a38', '#15264a', '#1a2c52'], stars: 1,   fog: 0x16233f, hemi: [0x8fa6d8, 0x2a2a38, 1.15], key: [0xb8c8ff, 1.1], rim: [0x6f8cff, 0.35], sunY: -40, sunCol: [255, 240, 220], lights: 1,   windows: 0.9,  exposure: 1.05 },
  dawn:   { sky: ['#1a2448', '#3d3f74', '#9a6a8a', '#f2b48a', '#f6d2b4'], stars: 0.3, fog: 0xe8c9b4, hemi: [0xd8ccff, 0x6a5a50, 1.15], key: [0xffd2a8, 2.0], rim: [0xffa8c0, 0.3], sunY: 14,  sunCol: [255, 214, 160], lights: 0.6, windows: 0.5,  exposure: 1.0 },
  day:    { sky: ['#2a78e0', '#4a92ea', '#78b2f2', '#a9d0f7', '#cfe5fa'], stars: 0,   fog: 0xcfe5fa, hemi: [0xeaf4ff, 0x7d8a6a, 1.35], key: [0xfff2dc, 3.0], rim: [0xdfeaff, 0.25], sunY: 150, sunCol: [255, 250, 235], lights: 0,   windows: 0,    exposure: 1.0 },
  sunset: { sky: ['#0d1430', '#26285a', '#6a3f72', '#d6766a', '#f0a070'], stars: 0.4, fog: 0xd99a7c, hemi: [0xc0b0ff, 0x4a3a40, 1.15], key: [0xffb88a, 2.3], rim: [0xff8aa0, 0.35], sunY: 26,  sunCol: [255, 200, 130], lights: 1,   windows: 0.75, exposure: 1.0 },
};
// ora -> amestec intre doua presetari (ore locale): 5-7 rasarit, 7-17 zi, 17-20 apus, 20-5 noapte
function dayMix(h) {
  const seg = (a, b, from, to) => ({ a, b, k: (h - from) / (to - from) });
  if (h < 5) return seg('night', 'night', 0, 5);
  if (h < 6) return seg('night', 'dawn', 5, 6);
  if (h < 7.5) return seg('dawn', 'day', 6, 7.5);
  if (h < 17) return seg('day', 'day', 7.5, 17);
  if (h < 18.5) return seg('day', 'sunset', 17, 18.5);
  if (h < 20) return seg('sunset', 'night', 18.5, 20);
  return seg('night', 'night', 20, 24);
}
const lerpHex = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
const skyCanvas = document.createElement('canvas'); skyCanvas.width = 64; skyCanvas.height = 1024;
const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
const starsTex = canvasTex(512, 1024, (g, w, h) => { for (let i = 0; i < 260; i++) { const y = Math.random() * h * 0.2; g.fillStyle = `rgba(255,255,255,${(1 - y / (h * 0.2)) * Math.random()})`; g.fillRect(Math.random() * w, y, 1.5, 1.5); } });
const stars = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), new THREE.MeshBasicMaterial({ map: starsTex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
stars.renderOrder = -3; scene.add(stars);
let dayState = null;
function paintSky(A, B, k) {
  const g = skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 1024);
  [0, 0.13, 0.22, 0.29, 0.33].forEach((stop, i) => gr.addColorStop(stop, '#' + lerpHex(A.sky[i], B.sky[i], k).getHexString()));
  gr.addColorStop(1, '#' + lerpHex(A.sky[4], B.sky[4], k).getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 64, 1024); skyTex.needsUpdate = true;
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: canvasTex(256, 256, (g) => {
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, 'rgba(255,248,225,1)'); r.addColorStop(0.3, 'rgba(255,236,190,1)'); r.addColorStop(0.34, 'rgba(255,220,160,.25)'); r.addColorStop(0.6, 'rgba(255,210,150,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  }), fog: false, depthWrite: false, transparent: true,
}));
sunSprite.scale.set(120, 120, 1); sunSprite.renderOrder = -2; scene.add(sunSprite);
function skylineDraw(night) { return (g, w, h) => {
  const rr = mulberry32(7);
  // dealuri departe + cartiere joase (case 2-6 etaje), fara zgarie-nori
  g.fillStyle = night ? '#101a33' : '#9fb3c9';
  g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 16) g.lineTo(x, h - 120 - Math.sin(x / 190) * 35 - Math.sin(x / 67) * 12); g.lineTo(w, h); g.fill();
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < w) {
      const bw = 26 + rr() * 50, bh = (layer ? 26 : 50) + rr() * (layer ? 40 : 70);
      g.fillStyle = night ? (layer ? '#18233f' : '#22304f') : (layer ? '#8799b0' : '#73869e');
      g.fillRect(x, h - bh, bw, bh);
      if (rr() < 0.35) { g.beginPath(); g.moveTo(x - 2, h - bh); g.lineTo(x + bw / 2, h - bh - 14); g.lineTo(x + bw + 2, h - bh); g.fill(); }
      for (let wy = h - bh + 7; wy < h - 6; wy += 11) for (let wx = x + 5; wx < x + bw - 5; wx += 9) {
        if (night) { if (rr() < 0.16) { g.fillStyle = 'rgba(255,205,130,.85)'; g.fillRect(wx, wy, 3, 4); } }
        else { g.fillStyle = 'rgba(40,60,90,.35)'; g.fillRect(wx, wy, 3, 4); }
      }
      x += bw + 2 + rr() * 10;
    }
  }
}; }
const skyGeo = new THREE.CylinderGeometry(420, 420, 100, 64, 1, true);
const skylines = [true, false].map(night => {
  const tx = canvasTex(2048, 512, skylineDraw(night)); tx.wrapS = THREE.RepeatWrapping; tx.repeat.x = 4;
  const m = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: tx, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, opacity: night ? 1 : 0 }));
  m.renderOrder = night ? -1 : -1.5; scene.add(m); return m;
});
const skyline = skylines[0];

const hemi = new THREE.HemisphereLight(0x9a8cff, 0x40243a, 1.1); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffb59a, 2.3);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -22, right: 22, top: 40, bottom: -22, near: 1, far: 160 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xff4fa0, 0.6); scene.add(rim, rim.target);

// ================================================================ sosele + teren
const TILE = 20, ROAD_LEN = 460;
function asphalt(g, w, h, base) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 14000; i++) { const v = 30 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v + 10},.55)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}
const roadTex = canvasTex(512, 512, (g, w, h) => {
  asphalt(g, w, h, '#24232c');
  const px = w / (EDGE * 2);
  g.fillStyle = '#1b1a22'; g.fillRect(0, 0, SHOULDER * px, h); g.fillRect(w - SHOULDER * px, 0, SHOULDER * px, h);
  g.fillStyle = '#f2f2f2'; g.fillRect(SHOULDER * px - 4, 0, 7, h); g.fillRect(w - SHOULDER * px - 3, 0, 7, h);
  for (let l = 1; l < LANES; l++) { const x = (SHOULDER + l * LANE_W) * px; g.fillRect(x - 3, 0, 6, h * 0.4); }
  g.fillStyle = 'rgba(0,0,0,.22)';
  for (let l = 0; l < LANES; l++) { const x = (SHOULDER + l * LANE_W + LANE_W / 2) * px; g.fillRect(x - 24, 0, 10, h); g.fillRect(x + 14, 0, 10, h); }
}, true);
roadTex.repeat.set(1, ROAD_LEN / TILE);
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.55, metalness: 0.15 });
const road = new THREE.Mesh(new THREE.PlaneGeometry(EDGE * 2, ROAD_LEN), roadMat);
road.rotation.x = -Math.PI / 2; road.receiveShadow = true; scene.add(road);
const oppTex = canvasTex(256, 512, (g, w, h) => { asphalt(g, w, h, '#24232c'); g.fillStyle = '#f2f2f2'; g.fillRect(8, 0, 5, h); g.fillRect(w - 13, 0, 5, h); g.fillRect(w / 2 - 3, 0, 5, h * 0.4); }, true);
oppTex.repeat.set(1, ROAD_LEN / TILE);
const oppMat = new THREE.MeshStandardMaterial({ map: oppTex, roughness: 0.6 });
const oppRoad = new THREE.Mesh(new THREE.PlaneGeometry(OPP_W, ROAD_LEN), oppMat);
oppRoad.rotation.x = -Math.PI / 2; oppRoad.position.x = OPP_X; oppRoad.receiveShadow = true; scene.add(oppRoad);
const groundTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3d4a35'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { g.fillStyle = Math.random() < .5 ? 'rgba(40,60,35,.7)' : 'rgba(80,95,60,.5)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); } }, true);
groundTex.repeat.set(40, 40);
const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), groundMat);
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
const walkTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#6d6676'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(30,25,40,.45)'; g.lineWidth = 3; for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, true);
walkTex.repeat.set(3, ROAD_LEN / 8);
const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9 });
const walks = [[EDGE + 0.9 + 4.5, 9], [OPP_X - OPP_W / 2 - 4, 8]].map(([x, w]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROAD_LEN), walkMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, 0); m.receiveShadow = true; scene.add(m); return m; });
const followers = [];
function longPiece(m, x, y, w, h) { const o = new THREE.Mesh(box, m); o.scale.set(w, h, ROAD_LEN); o.position.set(x, y, 0); o.receiveShadow = true; scene.add(o); followers.push(o); return o; }
const railMat = mat(0xcfd6e0, { metalness: 0.7, roughness: 0.3 });
longPiece(railMat, EDGE + 0.25, 0.72, 0.1, 0.3);
longPiece(glow(0x2ee6ff, 1.2), EDGE + 0.25, 0.9, 0.06, 0.05);
longPiece(mat(0x9a93a2, { roughness: 0.95 }), -EDGE - 0.6, 0.45, 0.55, 0.9);
longPiece(glow(0xff2d78, 1.2), -EDGE - 0.6, 0.93, 0.08, 0.06);
longPiece(glow(0x2ee6ff, 1.2), EDGE - 0.02, 0.012, 0.08, 0.01);
longPiece(glow(0xff2d78, 1.2), -EDGE + 0.02, 0.012, 0.08, 0.01);

// ================================================================ decor reciclat
const postMat = mat(0x6a6f7a, { metalness: 0.6, roughness: 0.4 });
const lampHead = glow(0xffe6b8, 1.6);
const neonMats = [];
const poolTex = canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,214,150,.55)'); r.addColorStop(0.55, 'rgba(255,200,130,.22)'); r.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
const beamMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); // pata de lumina pe asfalt (fara con de ceata)
const dayMats = { windows: [], neon: [] }; // materiale ajustate dupa ora
const blinkRed = glow(0xff2030, 4);
const trunkMat = mat(0x4a3020), leafMats = [mat(0x2f7a4a, { flatShading: true }), mat(0x3f8f3f, { flatShading: true }), mat(0x2a6b5a, { flatShading: true })];
const leafGeo = new THREE.IcosahedronGeometry(1, 0);
const beamGeo = new THREE.PlaneGeometry(9, 9); beamGeo.rotateX(-Math.PI / 2);
// ---- cartiere mici: fatade pe etaje (parter cu magazin + etaje cu ferestre), acoperis plat cu atic
const FACADES = [
  { wall: '#c8b8a0', trim: '#efe6d8', frame: '#5a4a3a', glass: '#3f5a74', shop: '#b5482f' },  // tencuiala bej
  { wall: '#a8553e', trim: '#e2d2c0', frame: '#3a2a22', glass: '#3a5470', shop: '#2f6f5a' },  // caramida
  { wall: '#8fa3b5', trim: '#e8eef4', frame: '#2f3c4a', glass: '#34506e', shop: '#c9852a' },  // gri-albastru
  { wall: '#d9c27a', trim: '#f6efd8', frame: '#5b4a24', glass: '#40607a', shop: '#3d5aa8' },  // galben pal
  { wall: '#7d8a74', trim: '#e6eadf', frame: '#2e3a2a', glass: '#3a5a6e', shop: '#a8325a' },  // verde salvie
  { wall: '#e0dcd4', trim: '#ffffff', frame: '#444a52', glass: '#38566f', shop: '#d0682a' },  // alb
];
const FLOOR_PX = 64, FAC_W = 160, roofMats = {};
const roofMat = mat(0x4a4d55, { roughness: 0.95 });
const roofTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#5a5d66'; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } g.strokeStyle = '#8a8d96'; g.lineWidth = 6; g.strokeRect(0, 0, w, h); });
const roofTopMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95 });
function facadeMat(fi, floors, seed) {
  const F = FACADES[fi], rr = mulberry32(seed), H = floors * FLOOR_PX, wins = [];
  const cols = 4, cw = FAC_W / cols;
  for (let f = 1; f < floors; f++) for (let c = 0; c < cols; c++) wins.push({ x: c * cw + 9, y: H - (f + 1) * FLOOR_PX + 16, w: cw - 18, h: 34, lit: rr() < 0.28, warm: rr() });
  const shopLit = rr() < 0.85;
  const draw = (em) => (g, w, h) => {
    g.fillStyle = em ? '#000' : F.wall; g.fillRect(0, 0, w, h);
    if (!em) {
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${rr() * 0.05})`; g.fillRect(rr() * w, rr() * h, 3, 2); }
      g.fillStyle = F.trim; for (let f = 1; f < floors; f++) g.fillRect(0, h - f * FLOOR_PX - 3, w, 4);   // brau intre etaje
      g.fillRect(0, 0, w, 7);                                                                              // cornisa
    }
    for (const W of wins) {
      if (!em) { g.fillStyle = F.trim; g.fillRect(W.x - 3, W.y + W.h, W.w + 6, 4); g.fillStyle = F.frame; g.fillRect(W.x - 2, W.y - 2, W.w + 4, W.h + 4); }
      if (em) { if (W.lit) { g.fillStyle = W.warm < 0.8 ? '#ffcf8a' : '#e8f0ff'; g.fillRect(W.x, W.y, W.w, W.h); } }
      else { const gr = g.createLinearGradient(0, W.y, 0, W.y + W.h); gr.addColorStop(0, F.glass); gr.addColorStop(1, '#1d2a3a'); g.fillStyle = gr; g.fillRect(W.x, W.y, W.w, W.h); g.fillStyle = F.frame; g.fillRect(W.x + W.w / 2 - 1, W.y, 2, W.h); }
    }
    // parter: vitrina + copertina
    const sy = h - FLOOR_PX;
    if (!em) { g.fillStyle = F.shop; g.fillRect(0, sy + 4, w, 12); g.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 0; x < w; x += 16) g.fillRect(x, sy + 4, 8, 12); g.fillStyle = F.frame; g.fillRect(6, sy + 18, w - 12, FLOOR_PX - 18); }
    g.fillStyle = em ? (shopLit ? '#ffe2b0' : '#000') : '#2a3a4c'; g.fillRect(10, sy + 22, w - 56, FLOOR_PX - 26);
    if (!em) { g.fillStyle = '#3b2f26'; g.fillRect(w - 40, sy + 22, 28, FLOOR_PX - 22); }
  };
  const map = canvasTex(FAC_W, H, draw(false)), em = canvasTex(FAC_W, H, draw(true));
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
  dayMats.windows.push(m); return [m, m, roofTopMat, roofTopMat, m, m];
}
const FLOORS = [2, 3, 3, 4, 4, 5];
const buildingSets = FLOORS.map((f, i) => facadeMat(i % FACADES.length, f, i * 77 + 3));
const buildingSets2 = FLOORS.map((f, i) => facadeMat((i + 3) % FACADES.length, f, i * 131 + 9));
const allBuildings = [...buildingSets, ...buildingSets2];
const buildingMats = allBuildings.map(a => a[0]); // (kit) fatadele
const parapetMat = mat(0xd8d2c8, { roughness: 0.9 });
function neonTex(text, color) {
  return canvasTex(512, 200, (g, w, h) => {
    g.fillStyle = '#121a2e'; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; g.strokeRect(22, 22, w - 44, h - 44);
    g.font = `76px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#0a0f1c'; g.strokeText(text, w / 2, h / 2 + 4, w - 70);
    g.fillStyle = '#fff'; g.fillText(text, w / 2, h / 2 + 4, w - 70);
  });
}
const NEON = ['#ff2d78', '#2ee6ff', '#ffd23f', '#a46bff', '#7cff6b'];
let billboardTexts = [], billboardMats = [], streamer = '';
const chunks = [];
function buildBillboards() {
  billboardTexts = [...(streamer ? ['@' + streamer] : []), ...t('billboards')];
  billboardMats.forEach(m => { m.map.dispose(); m.dispose(); });
  billboardMats = billboardTexts.map((s, i) => { const tx = neonTex(s, NEON[i % NEON.length]); return new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 }); });
  for (const c of chunks) c.board.material = billboardMats[Math.abs(c.k) % billboardMats.length];
}
const signMat = (text, bg) => { const tx = canvasTex(512, 160, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#fff'; g.font = `64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4, w - 40); }); return new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 0.5 }); };
const distSignCache = new Map();
function distSign(m) { if (!distSignCache.has(m)) distSignCache.set(m, signMat(`🏁 ${m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m'}`, '#0b6e3a')); return distSignCache.get(m); }

function lamp(g, x, armDir) {
  addMesh(g, cyl, postMat, x, 4.5, 0, 0.1, 9, 0.1);
  for (const d of armDir) {
    addMesh(g, box, postMat, x + d * 1.3, 8.9, 0, 2.6, 0.1, 0.1, false);
    addMesh(g, box, lampHead, x + d * 2.5, 8.8, 0, 0.9, 0.12, 0.4, false);
    const b = new THREE.Mesh(beamGeo, beamMat); b.position.set(x + d * 2.5, 0.03, 0); b.renderOrder = 1; g.add(b);
  }
}
function makeChunk() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) addMesh(g, box, postMat, EDGE + 0.25, 0.4, -i * 5, 0.12, 0.8, 0.12, false);
  lamp(g, -EDGE - 0.6, [1, -1]);
  const lampR = new THREE.Group(); lamp(lampR, EDGE + 0.9, [-1]); lampR.position.z = -20; g.add(lampR);
  const buildings = [];
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(box, allBuildings[0]); b.castShadow = true; b.receiveShadow = true;
    const roof = new THREE.Mesh(box, parapetMat), ant = new THREE.Mesh(box, roofMat); // roof = atic, ant = casa scarii / clima
    g.add(b, roof, ant); buildings.push({ b, roof, ant, s, i });
  }
  const trees = [];
  for (const [s, n] of [[1, 3], [-1, 2]]) for (let i = 0; i < n; i++) {
    const tr = new THREE.Group();
    addMesh(tr, cyl, trunkMat, 0, 0.9, 0, 0.14, 1.8, 0.14);
    addMesh(tr, leafGeo, leafMats[i % 3], 0, 2.5, 0, 1.3, 1.5, 1.3);
    addMesh(tr, leafGeo, leafMats[(i + 1) % 3], 0.3, 3.4, 0.1, 0.8, 0.9, 0.8);
    g.add(tr); trees.push({ t: tr, s, i });
  }
  const bb = new THREE.Group();
  addMesh(bb, cyl, postMat, -1.6, 3.2, 0, 0.12, 6.4, 0.12); addMesh(bb, cyl, postMat, 1.6, 3.2, 0, 0.12, 6.4, 0.12);
  const board = addMesh(bb, new THREE.PlaneGeometry(1, 1), roofMat, 0, 7.6, 0.08, 6, 2.35, 1, false);
  addMesh(bb, box, mat(0x14101f), 0, 7.6, -0.02, 6.3, 2.6, 0.12, false);
  bb.rotation.y = -0.55; g.add(bb);
  const gantry = new THREE.Group();
  for (const s of [-1, 1]) addMesh(gantry, box, postMat, s * (EDGE + 0.5), 5.9, 0, 0.35, 11.8, 0.35);
  addMesh(gantry, box, postMat, 0, 11.7, 0, (EDGE + 0.5) * 2, 0.35, 0.35);
  const sign = addMesh(gantry, new THREE.PlaneGeometry(1, 1), roofMat, 0, 10.6, 0.25, 6.5, 2, 1, false);
  g.add(gantry);
  const bridge = new THREE.Group();
  addMesh(bridge, box, mat(0x7d7488), 0, 12.6, 0, 80, 1.3, 7);
  addMesh(bridge, box, glow(0x2ee6ff, 1), 0, 11.9, -3.52, 80, 0.12, 0.05, false);
  addMesh(bridge, box, glow(0xff2d78, 1), 0, 11.9, 3.52, 80, 0.12, 0.05, false);
  for (const x of [EDGE + 2, -EDGE - 0.6, OPP_X - OPP_W / 2 - 1]) addMesh(bridge, box, mat(0x6d6578), x, 6, 0, 1.2, 12, 4.5);
  g.add(bridge);
  // tunel (vizibil doar in evenimentul 'tunnel'): arcada lunga cu lumini pe tavan
  const tunnel = new THREE.Group();
  addMesh(tunnel, box, mat(0x3b3550, { roughness: 0.9 }), 0, 9, -CHUNK / 2, (EDGE + 1.2) * 2, 1.2, CHUNK, false);
  for (const sx of [-1, 1]) addMesh(tunnel, box, mat(0x3b3550, { roughness: 0.9 }), sx * (EDGE + 1.2), 4.5, -CHUNK / 2, 0.6, 9, CHUNK, false);
  for (let i = 0; i < 5; i++) addMesh(tunnel, box, glow(0xfff1c0, 3.5), 0, 8.35, -i * 8 - 4, 1.6, 0.1, 0.4, false);
  g.add(tunnel);
  scene.add(g);
  return { g, buildings, trees, bb, board, gantry, sign, bridge, tunnel, k: 0 };
}
for (let i = 0; i < NCH; i++) chunks.push(makeChunk());
function dressChunk(c) {
  const r = mulberry32(c.k * 9176 + 13);
  c.g.position.z = -c.k * CHUNK;
  for (const B of c.buildings) {
    const bi = (r() * allBuildings.length) | 0, floors = FLOORS[bi % FLOORS.length], h = floors * 3.3;
    const w = 9 + r() * 3, d = 9.2;                       // case lipite (bloc de cartier), cu o strada laterala la fiecare 40 m
    const x = B.s > 0 ? EDGE + 10.5 + w / 2 : OPP_X - OPP_W / 2 - 8.5 - w / 2, z = -B.i * 9.4 - 5.5;
    B.b.material = allBuildings[bi];
    B.b.position.set(x, h / 2, z); B.b.scale.set(w, h, d);
    B.roof.position.set(x, h + 0.25, z); B.roof.scale.set(w + 0.3, 0.5, d + 0.3); B.roof.visible = r() < 0.7;
    B.ant.position.set(x + (r() - 0.5) * w * 0.4, h + 0.8, z + (r() - 0.5) * 3); B.ant.scale.set(1.6 + r(), 1.4, 1.6 + r()); B.ant.visible = r() < 0.6;
  }
  for (const T of c.trees) { const x = T.s > 0 ? EDGE + 3 + r() * 5 : OPP_X - OPP_W / 2 - 2 - r() * 4; T.t.position.set(x, 0, -T.i * 13 - r() * 8); const sc = 0.8 + r() * 0.6; T.t.scale.set(sc, sc, sc); T.t.rotation.y = r() * 6; }
  c.bb.visible = c.k % 3 === 1; c.bb.position.set(EDGE + 6.5, 0, -28);
  if (billboardMats.length) c.board.material = billboardMats[Math.abs(c.k) % billboardMats.length];
  // portal cu distanta pana la sosire (din 200 in 200 m)
  const gz = c.k * CHUNK + 12, left = Math.round((FINISH - gz) / 100) * 100;
  c.gantry.visible = GAME.hasFinish && c.k % 5 === 3 && left > 50; c.gantry.position.z = -12;
  if (c.gantry.visible) c.sign.material = distSign(left);
  c.bridge.visible = c.k % 9 === 6 && routeEvent !== 'tunnel'; c.bridge.position.z = -18;
  c.tunnel.visible = routeEvent === 'tunnel' && (c.k % 7 === 2 || c.k % 7 === 3);
  if (c.tunnel.visible) { c.gantry.visible = false; c.bb.visible = false; }
}
function resetChunks(cd) { const k0 = Math.floor(cd / CHUNK) - 1; chunks.forEach((c, i) => { c.k = k0 + i; dressChunk(c); }); }

// porti START + SOSIRE
const checker = canvasTex(256, 32, (g, w, h) => { for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#111' : '#fff'; g.fillRect(x, y, 16, 16); } });
function makeGate(color, hex) {
  const gate = new THREE.Group();
  const m = mat(hex, { emissive: hex, emissiveIntensity: 0.15, roughness: 0.5 });
  for (const s of [-1, 1]) addMesh(gate, box, m, s * (EDGE + 0.4), 5.5, 0, 0.5, 11, 0.5);
  const sign = addMesh(gate, new THREE.PlaneGeometry(1, 1), roofMat, 0, 10.2, 0.3, EDGE * 2 + 0.8, 2.4, 1, false);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 1.4), new THREE.MeshStandardMaterial({ map: checker }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.02; gate.add(line);
  scene.add(gate);
  gate.userData = { sign, color };
  return gate;
}
function setGateText(gate, text) { const tx = neonTex(text, gate.userData.color); gate.userData.sign.material = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.6 }); }
const startGate = makeGate('#ff2d78', 0xff2d78);
const finishGate = makeGate('#ffd23f', 0xffb020);
function applyLanguage() {
  setLang(LANG);
  document.documentElement.lang = LANG;
  $('#hw').textContent = t('hw');
  try { renderHowto(); } catch {} // la pornire jocul (GAME) poate sa nu fie inca ales; applyMode il deseneaza oricum
  $('#winT').textContent = t('winners');
  $('#hTop').textContent = '📊 ' + t('topRound');
  $('#hChamp').textContent = '👑 ' + t('champions');
  $('#lost').textContent = t('lost'); $('#sndHint').textContent = t('clickSound');
  setGateText(startGate, `🏁 ${t('start')} 🏁`);
  setGateText(finishGate, `🏆 ${t('finish')} 🏆`);
  buildBillboards();
}

// ================================================================ masini
const CAR_COLORS = [0xe63946, 0x1d4ed8, 0xf4f4f5, 0xfacc15, 0x16a34a, 0x0f172a, 0xf97316, 0x9333ea, 0x06b6d4];
const carMats = CAR_COLORS.map(c => mat(c, { metalness: 0.55, roughness: 0.3 }));
const glassMat = mat(0x1a2235, { metalness: 0.6, roughness: 0.1 });
const tireMat = mat(0x111114, { roughness: 0.9 });
const tailMat = glow(0xff1a2a, 3), headMat = glow(0xfff4d6, 5), hazardMat = glow(0xff8a00, 4);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16); wheelGeo.rotateZ(Math.PI / 2);
function buildCar(isTraffic) {
  const g = new THREE.Group();
  const body = addMesh(g, box, carMats[0], 0, 0.62, -2, 1.85, 0.62, 4.1);
  const cab = addMesh(g, box, carMats[0], 0, 1.17, -2.25, 1.6, 0.52, 2.1);
  addMesh(g, box, glassMat, 0, 1.17, -2.25, 1.64, 0.4, 2.0, false);
  addMesh(g, box, mat(0x18181b), 0, 0.4, 0.02, 1.9, 0.22, 0.12, false);
  for (const [x, z] of [[-0.88, -0.75], [0.88, -0.75], [-0.88, -3.25], [0.88, -3.25]]) addMesh(g, wheelGeo, tireMat, x, 0.36, z);
  for (const s of [-1, 1]) { addMesh(g, box, tailMat, s * 0.7, 0.75, 0.01, 0.38, 0.13, 0.05, false); addMesh(g, box, headMat, s * 0.65, 0.7, -4.06, 0.36, 0.14, 0.05, false); }
  if (!isTraffic) {
    for (const s of [-1, 1]) addMesh(g, box, hazardMat, s * 0.92, 0.75, -0.15, 0.06, 0.12, 0.25, false);
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.05, 3), glow(0xff2030, 2)); tri.rotation.x = Math.PI / 2; tri.rotation.y = Math.PI; tri.position.set(0, 0.32, 2.2); g.add(tri);
  }
  g.userData = { body, cab };
  return g;
}
const traffic = [];
for (let i = 0; i < 9; i++) {
  const c = buildCar(true); c.rotation.y = Math.PI;
  const cm = pick(carMats); c.userData.body.material = cm; c.userData.cab.material = cm;
  c.userData.v = rand(26, 38); c.position.set(OPP_X + (i % 2 ? 1.9 : -1.9), 0, -rand(20, 300));
  scene.add(c); traffic.push(c);
}

// ================================================================ obstacole + monede (acelasi traseu pentru toti)
let roundSeed = (Math.random() * 1e9) | 0;
const segCache = new Map();
function getSeg(s) {
  let seg = segCache.get(s);
  if (seg) return seg;
  seg = { obs: [], coins: [] };
  if (s >= 2 && (s + 1) * SEG < FINISH - 15) {
    const r = mulberry32(roundSeed ^ (s * 104729));
    const lanes = [...Array(LANES).keys()].sort(() => r() - 0.5);
    const count = 1 + Math.floor(r() * Math.min(3, LANES - 1));
    for (let i = 0; i < count; i++) {
      const x = r(), type = x < 0.32 ? 'car' : x < 0.6 ? 'jump' : x < 0.82 ? 'slide' : 'cones';
      seg.obs.push({ id: s * 10 + i, d: s * SEG + 6 + r() * (SEG - 12), lane: lanes[i], type, broken: false, color: (r() * 1e6) | 0 });
    }
    // santier: bariera pe toata latimea (toti trebuie sa sara) la fiecare ROADWORKS_EVERY segmente
    if (routeEvent === 'roadworks' && s % RULES.ROADWORKS_EVERY === 4) { seg.obs = seg.obs.filter(o => o.type !== 'car'); for (let l = 0; l < LANES; l++) seg.obs.push({ id: s * 10 + 5 + l, d: s * SEG + 1, lane: l, type: 'wall', broken: false, color: 0 }); }
    const free = lanes.slice(count);
    if (free.length) { const lane = free[(r() * free.length) | 0], d0 = s * SEG + 2 + r() * 8; for (let k = 0; k < 6; k++) seg.coins.push({ d: d0 + k * 2.2, lane, taken: false }); }
  }
  segCache.set(s, seg);
  return seg;
}
function pruneSegs(minD) { const s0 = Math.floor(minD / SEG) - 2; for (const k of segCache.keys()) if (k < s0 && !segMeshes.has(k)) segCache.delete(k); }

const stripeTex = (a, b) => canvasTex(256, 64, (g, w, h) => { for (let x = -h; x < w + h; x += 32) { g.fillStyle = ((x / 32) & 1) ? a : b; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 32 - h, h); g.lineTo(x - h, h); g.fill(); } });
const redStripe = stripeTex('#ffffff', '#e8202a'), yelStripe = stripeTex('#111111', '#ffcc00');
const barrierMat = new THREE.MeshStandardMaterial({ map: redStripe, emissiveMap: redStripe, emissive: 0xffffff, emissiveIntensity: 0.25 });
const yellowMat = new THREE.MeshStandardMaterial({ map: yelStripe, emissiveMap: yelStripe, emissive: 0xffffff, emissiveIntensity: 0.3 });
const coneMat = mat(0xff5a00, { emissive: 0x401000 }), bandMat = glow(0xffffff, 0.9), blinkAmber = glow(0xffa000, 4);
const lightGeo = new THREE.SphereGeometry(0.09, 8, 6);
const builders = {
  jump() { const g = new THREE.Group(), w = LANE_W * 0.9; addMesh(g, box, barrierMat, 0, 0.64, 0, w, 0.42, 0.14); for (const s of [-1, 1]) { addMesh(g, box, postMat, s * w * 0.45, 0.33, 0, 0.1, 0.66, 0.1); addMesh(g, lightGeo, blinkAmber, s * w * 0.45, 0.95, 0, 1, 1, 1, false); } return g; },
  cones() { const g = new THREE.Group(); for (let i = -1; i <= 1; i++) { addMesh(g, cone, coneMat, i * 0.72, 0.38, 0, 0.27, 0.76, 0.27); addMesh(g, cyl, bandMat, i * 0.72, 0.44, 0, 0.17, 0.09, 0.17, false); addMesh(g, box, mat(0x222222), i * 0.72, 0.02, 0, 0.55, 0.04, 0.55, false); } return g; },
  slide() { const g = new THREE.Group(), w = LANE_W * 0.96; for (const s of [-1, 1]) addMesh(g, box, postMat, s * w * 0.48, 0.85, 0, 0.13, 1.7, 0.13); addMesh(g, box, yellowMat, 0, 1.42, 0, w, 0.38, 0.16); for (const s of [-1, 0, 1]) addMesh(g, lightGeo, blinkAmber, s * w * 0.3, 1.66, 0, 1, 1, 1, false); return g; },
  car: () => buildCar(false),
  wall() { const g = new THREE.Group(), w = LANE_W; addMesh(g, box, yellowMat, 0, 0.6, 0, w, 0.5, 0.2); addMesh(g, box, mat(0x222222), 0, 0.18, 0, w, 0.36, 0.2); addMesh(g, lightGeo, blinkAmber, 0, 0.95, 0, 1, 1, 1, false); return g; },
};
const pools = { jump: [], cones: [], slide: [], car: [], wall: [] };
function acquire(type) { const m = pools[type].pop() || builders[type](); m.visible = true; if (!m.parent) scene.add(m); return m; }
function release(type, m) { m.visible = false; pools[type].push(m); }
const segMeshes = new Map();
let obstaclesHidden = false;
function updateObstacleMeshes(cd) {
  const s0 = Math.floor((cd - 8) / SEG), s1 = Math.floor((cd + 200) / SEG);
  for (const [s, arr] of segMeshes) if (s < s0 || s > s1) { arr.forEach(({ o, m }) => { release(o.type, m); o.mesh = null; }); segMeshes.delete(s); }
  for (let s = s0; s <= s1; s++) {
    if (segMeshes.has(s)) continue;
    segMeshes.set(s, getSeg(s).obs.map(o => {
      const m = acquire(o.type);
      m.position.set(laneX(o.lane), 0, -o.d); m.rotation.set(0, 0, 0);
      if (o.type === 'car') { const cm = carMats[o.color % carMats.length]; m.userData.body.material = cm; m.userData.cab.material = cm; m.position.z = -o.d + 0.3; }
      m.visible = !o.broken && !obstaclesHidden; o.mesh = m;
      return { o, m };
    }));
  }
}
function setObstaclesHidden(h) { obstaclesHidden = h; for (const [, arr] of segMeshes) arr.forEach(({ o, m }) => m.visible = !h && !o.broken); }
function clearObstacles() { for (const [, arr] of segMeshes) arr.forEach(({ o, m }) => release(o.type, m)); segMeshes.clear(); segCache.clear(); }

const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 24); coinGeo.rotateX(Math.PI / 2);
const coins = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.9, roughness: 0.25, emissive: 0xb07000, emissiveIntensity: 0.9 }), 200);
coins.castShadow = true; coins.frustumCulled = false; scene.add(coins);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function updateCoins(cd) {
  let n = 0;
  if (!obstaclesHidden) {
    const s0 = Math.floor((cd - 4) / SEG), s1 = Math.floor((cd + 150) / SEG);
    _q.setFromEuler(_e.set(0, time * 3, 0));
    for (let s = s0; s <= s1 && n < 200; s++) for (const c of getSeg(s).coins) {
      if (c.taken || n >= 200) continue;
      _v.set(laneX(c.lane), 0.9 + Math.sin(time * 4 + c.d) * 0.12, -c.d);
      coins.setMatrixAt(n++, _m4.compose(_v, _q, _s));
    }
  }
  coins.count = n; coins.instanceMatrix.needsUpdate = true;
}

// ================================================================ personaje (robot animat CC0)
let ROBOT = null;
async function loadRobot() {
  if (RULES.CHARACTER !== 'robot') return; // 'simple' = toti sunt aceeasi figurina simpla (vezi rules.js)
  try {
    const gltf = await new GLTFLoader().loadAsync('/models/robot.glb');
    const b = new THREE.Box3().setFromObject(gltf.scene);
    const clips = {}; for (const c of gltf.animations) clips[c.name] = c;
    ROBOT = { scene: gltf.scene, scale: 1.75 / (b.max.y - b.min.y), clips };
  } catch (e) { console.warn('model robot indisponibil', e); }
}
const COLORS = [0xff3b5c, 0x2ec4ff, 0xffd23f, 0x7cff6b, 0xb46bff, 0xff8a3d, 0x00e5c0, 0xff5fd2, 0xf5f5f5, 0x3d5afe, 0xe11d48, 0x22c55e, 0xfb923c, 0x14b8a6];
const ACCENTS = [0x2a2f3a, 0xe8edf3, 0x1e293b, 0x4b5563, 0xfafafa];
const starGeo = new THREE.OctahedronGeometry(0.1);
const starMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const shieldMat = new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
const fireRingMat = new THREE.MeshBasicMaterial({ color: 0xff7a1f, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const ringMat = new THREE.MeshBasicMaterial({ color: 0x5bff8a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const trailMat = new THREE.MeshBasicMaterial({ color: 0x7cf3ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const rocketTrailMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const jetMat = mat(0xb8c0cc, { metalness: 0.85, roughness: 0.25 });
const shieldGeo = new THREE.SphereGeometry(1.2, 24, 16);
const ringGeo = new THREE.TorusGeometry(0.42, 0.05, 8, 24); ringGeo.rotateX(Math.PI / 2);
const trailGeo = new THREE.PlaneGeometry(0.9, 5); trailGeo.rotateX(-Math.PI / 2); trailGeo.translate(0, 0.05, 2.6);

function makeView() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const v = { root, body, player: null, cur: null, actions: null, mixer: null, mats: {} };
  if (ROBOT) {
    const model = SkeletonUtils.clone(ROBOT.scene);
    model.scale.setScalar(ROBOT.scale); model.rotation.y = Math.PI;
    const main = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }), grey = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.35 });
    v.meshes = [];
    model.traverse(o => { if (!o.isMesh) return; v.meshes.push(o); o.castShadow = true; o.frustumCulled = false; if (o.material.name === 'Main') o.material = main; else if (o.material.name === 'Grey') o.material = grey; });
    body.add(model);
    v.mats = { main, grey };
    v.mixer = new THREE.AnimationMixer(model); v.actions = {};
    for (const n in ROBOT.clips) v.actions[n] = v.mixer.clipAction(ROBOT.clips[n]);
    for (const n of ['Jump', 'Death']) { v.actions[n].setLoop(THREE.LoopOnce, 1); v.actions[n].clampWhenFinished = true; }
  } else {
    // FIGURINA SIMPLA: aceeasi forma ca plutonul (corp + cap + picioare), in culoarea jucatorului; poza si numele stau deasupra
    const main = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.15 }), grey = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 12), main); torso.position.y = 0.8; torso.castShadow = true; body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), main); head.position.y = 1.5; head.castShadow = true; body.add(head);
    const limb = (geo, m, x, y, len) => { const g = new THREE.Group(); g.position.set(x, y, 0); const o = new THREE.Mesh(geo, m); o.position.y = -len; o.castShadow = true; g.add(o); body.add(g); return g; };
    v.legL = limb(new THREE.BoxGeometry(0.2, 0.28, 0.3), grey, -0.12, 0.42, 0.28); v.legR = limb(new THREE.BoxGeometry(0.2, 0.28, 0.3), grey, 0.12, 0.42, 0.28);
    v.armL = limb(new THREE.CapsuleGeometry(0.08, 0.3, 3, 8), main, -0.36, 1.08, 0.2); v.armR = limb(new THREE.CapsuleGeometry(0.08, 0.3, 3, 8), main, 0.36, 1.08, 0.2);
    v.mats = { main, grey };
  }
  v.jet = new THREE.Group(); v.flames = [];
  for (const x of [-0.14, 0.14]) {
    addMesh(v.jet, cyl, jetMat, x, 1.25, 0.32, 0.11, 0.6, 0.11);
    const f = new THREE.Mesh(cone, flameMat); f.position.set(x, 0.8, 0.32); f.rotation.x = Math.PI; f.scale.set(0.12, 0.5, 0.12); v.jet.add(f); v.flames.push(f);
  }
  body.add(v.jet);
  v.shield = new THREE.Mesh(shieldGeo, shieldMat); v.shield.position.y = 1; root.add(v.shield);
  v.rings = [-0.15, 0.15].map(x => { const r = new THREE.Mesh(ringGeo, ringMat); r.position.set(x, 0.08, 0); root.add(r); return r; });
  v.trail = new THREE.Mesh(trailGeo, trailMat); root.add(v.trail);
  v.crown = new THREE.Group(); v.crown.visible = false; v.crown.position.y = 2.02;
  addMesh(v.crown, new THREE.CylinderGeometry(0.2, 0.17, 0.14, 8), mat(0xffd23f, { metalness: 1, roughness: 0.2, emissive: 0x7a5000 }), 0, 0, 0);
  for (let i = 0; i < 5; i++) addMesh(v.crown, cone, mat(0xffd23f, { metalness: 1, roughness: 0.2 }), Math.cos(i * 1.257) * 0.17, 0.12, Math.sin(i * 1.257) * 0.17, 0.05, 0.12, 0.05, false);
  body.add(v.crown);
  v.stars = new THREE.Group(); v.stars.position.y = 2.15;
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(starGeo, starMat); s.position.set(Math.cos(i * 2.1) * 0.32, 0, Math.sin(i * 2.1) * 0.32); v.stars.add(s); }
  root.add(v.stars);
  v.badgeCanvas = document.createElement('canvas'); v.badgeCanvas.width = 256; v.badgeCanvas.height = 300;
  v.badgeTex = new THREE.CanvasTexture(v.badgeCanvas); v.badgeTex.colorSpace = THREE.SRGBColorSpace;
  v.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: v.badgeTex, depthWrite: false, depthTest: false, color: 0xe6e6e6 }));
  v.badge.scale.set(1.3, 1.52, 1); v.badge.position.y = 2.75; v.badge.renderOrder = 10; root.add(v.badge);
  scene.add(root);
  return v;
}
function applySkin(v, p) {
  const m = v.mats.main, g = v.mats.grey;
  m.metalness = 0.2; m.roughness = 0.4; if (m.emissive) m.emissiveIntensity = 0.12;
  v.crown.visible = false; v.skinFlame = false;
  if (!p.skin) return;
  if (p.skin === 'gold') { m.color.setHex(0xffc23d); m.metalness = 1; m.roughness = 0.25; g.color.setHex(0x3a2a00); if (m.emissive) { m.emissive.setHex(0xffa000); m.emissiveIntensity = 0.3; } }
  if (p.skin === 'crown') { v.crown.visible = true; if (m.emissive) { m.emissive.setHex(0xffd23f); m.emissiveIntensity = 0.25; } }
  if (p.skin === 'flame') { v.skinFlame = true; m.color.setHex(0xff4b1f); if (m.emissive) { m.emissive.setHex(0xff3000); m.emissiveIntensity = 0.5; } }
}
function play(v, name, { fade = 0.18, ts = 1, restart = false } = {}) {
  if (!v.actions || !v.actions[name]) return;
  const a = v.actions[name]; a.timeScale = ts;
  if (v.cur === name && !restart) return;
  a.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (v.cur && v.cur !== name) v.actions[v.cur].fadeOut(fade);
  v.cur = name;
}
const views = [], freeViews = [];
let assignCount = 0;
function assignView(p) {
  assignCount++;
  const v = freeViews.pop() || makeView();
  v.player = p; p.view = v; v.root.visible = true; v.cur = null; v.jumpSeq = p.jumpSeq; v.badgeKey = '';
  if (v.actions) for (const n in v.actions) v.actions[n].stop();
  v.mats.main.color.setHex(p.look.main); if (v.mats.main.emissive) { v.mats.main.emissive.setHex(p.look.main); v.mats.main.emissiveIntensity = 0.12; }
  v.mats.grey.color.setHex(p.look.accent);
  applySkin(v, p);
  if (phase === 'race' && elapsed > 3) p.vo = 0;
  v.root.position.set(p.x, p.y, -(p.d + p.vo));
  drawBadge(v);
  views.push(v);
}
function releaseView(v) { if (v.player) v.player.view = null; v.player = null; v.root.visible = false; views.splice(views.indexOf(v), 1); freeViews.push(v); }

// ================================================================ avatare (incarcate doar cand e nevoie)
const initialsCache = new Map();
function initialsAvatar(name, color) {
  const k = name + color;
  if (!initialsCache.has(k)) {
    if (initialsCache.size > 3000) initialsCache.delete(initialsCache.keys().next().value);
    initialsCache.set(k, makeCanvas(96, 96, (g) => {
      const gr = g.createLinearGradient(0, 0, 96, 96); gr.addColorStop(0, '#' + color.toString(16).padStart(6, '0')); gr.addColorStop(1, '#1b1450');
      g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
      g.fillStyle = '#fff'; g.font = `46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name.replace(/[^\p{L}\p{N}]/gu, ' ').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?', 48, 52);
    }).toDataURL());
  }
  return initialsCache.get(k);
}
const avatarSrc = p => p._src || (p._src = p.avatarUrl ? '/avatar?u=' + encodeURIComponent(p.avatarUrl) : initialsAvatar(p.name, p.look.main));
function avatarImg(p) {
  if (!p.img) {
    const img = new Image(); p.img = img;
    img.onload = () => { if (p.view) drawBadge(p.view); };
    img.onerror = () => { if (p.avatarUrl) { p.avatarUrl = ''; p._src = null; p.img = null; avatarImg(p); } };
    img.src = avatarSrc(p);
  }
  return p.img;
}
const RANK_COL = ['#ffd23f', '#e3e9f0', '#f0a066'];
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawBadge(v) {
  const p = v.player; if (!p) return;
  const top3 = p.rank <= 3 && phase !== 'lobby' ? p.rank : 0;
  const img = avatarImg(p), ok = img.complete && img.naturalWidth > 0;
  const key = `${top3}|${ok}|${p.name}|${p.bib}|${p.look.main}`;
  if (key === v.badgeKey) return;
  v.badgeKey = key;
  const g = v.badgeCanvas.getContext('2d');
  g.clearRect(0, 0, 256, 300);
  const ring = top3 ? RANK_COL[top3 - 1] : '#' + p.look.main.toString(16).padStart(6, '0');
  g.save(); g.shadowColor = top3 ? ring : 'rgba(0,0,0,.7)'; g.shadowBlur = top3 ? 26 : 12;
  g.beginPath(); g.arc(128, 116, 96, 0, Math.PI * 2); g.fillStyle = ring; g.fill(); g.restore();
  g.beginPath(); g.arc(128, 116, 88, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  g.save(); g.beginPath(); g.arc(128, 116, 82, 0, Math.PI * 2); g.clip();
  if (ok) g.drawImage(img, 46, 34, 164, 164); else { g.fillStyle = '#333'; g.fillRect(0, 0, 256, 256); }
  g.restore();
  if (top3) {
    g.beginPath(); g.arc(210, 42, 36, 0, Math.PI * 2); g.fillStyle = ring; g.fill(); g.lineWidth = 6; g.strokeStyle = '#1a1030'; g.stroke();
    g.fillStyle = '#1a1030'; g.font = `46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(top3, 210, 46);
    if (top3 === 1) { g.font = '54px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; g.fillText('👑', 128, 24); }
  }
  const nm0 = (p.bib ? '#' + p.bib + ' ' : '') + p.name;
  const name = nm0.length > 14 ? nm0.slice(0, 13) + '…' : nm0;
  g.font = `40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = Math.min(252, g.measureText(name).width + 38);
  g.fillStyle = top3 ? ring : 'rgba(15,10,35,.9)'; roundRect(g, 128 - tw / 2, 226, tw, 58, 29); g.fill();
  g.fillStyle = top3 ? '#1a1030' : '#fff'; g.fillText(name, 128, 257, 236);
  v.badgeTex.needsUpdate = true;
}

// ================================================================ jucatori
const players = new Map();   // alergatorii din joc (doar oameni activi; vezi "MULTIME" in rules.js)
const viewers = new Map();   // toti cei care au interactionat: nume, poza, echipa aleasa, bilet (date putine, usor de tinut minte)
const waiting = [];          // tribuna: spectatori care asteapta un loc cand pista e plina
let ranked = [], unfinished = [], finishCount = 0, joinSeq = 0, rankGone = false;
const rankNew = [];
let lobbyDirty = true, lobbyList = [];
let phase = 'lobby', phaseT = G.LOBBY_SECONDS, round = 1, time = 0, elapsed = 0, endTimer = -1;
let idleD = 0, idleFocus = F.START; // "linia celor care nu fac nimic": unde e acum cineva care a pornit la start si nu a dat niciun tap
let focusD = 0, camD = 0, levelEvent = null, shake = 0;
const LOBBY_ANIMS = ['Idle', 'Wave', 'Dance', 'Idle', 'Yes', 'ThumbsUp'];
const recent = new Map(); // id -> timp ultima activitate (pentru camera)
const short = n => n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

function freshStats(p) {
  Object.assign(p, { d: 0, vo: 0, y: 0, speed: 0, stumble: 0, jumpT: 0, slideT: 0, plan: null, meteorAt: undefined,
    tapAcc: 0, dashes: 0, tapBank: 0, coinsRound: 0, rocketLvl: 0, rocketBank: 0, picked: 0, finished: false, finishOrder: 0, finishTime: 0, earned: 0,
    out: false, outAt: 0, reviveCoins: 0, graceUntil: 0, coinAcc: 0, focus: F.START, focusLock: 0, trip: null, tripD: 0, virtUntil: 0, streak: 0, lastTapAt: 0, fire: false, boosted: false,
    fans: null, fanTaps: 0, topFan: null, rivalId: null, overtakes: 0, active: false, shares: 0, carryCoins: 0, handled: null });
  p.pu.shoes = 0; p.pu.shield = 0;
}
function getViewer(user) {
  let v = viewers.get(user.id);
  if (!v) {
    if (viewers.size >= RULES.VIEWER_MEMORY) viewers.delete(viewers.keys().next().value);
    v = { id: user.id, name: user.name || user.id, avatarUrl: user.avatar || '', look: { main: pick(COLORS) }, ticket: 0, carry: 0, team: null, waiting: false, followed: false };
    viewers.set(user.id, v);
  }
  if (user.avatar && !v.avatarUrl) v.avatarUrl = user.avatar;
  return v;
}
// ---- locuri pe pista: cand e plin, un om nou ia locul unuia care nu a facut nimic runda asta (acela e oricum pe "linia inactivilor")
let evictPool = [], evictPoolAt = -1e9, fullToastAt = 0, waitingN = 0;
function freeSeat() {
  if (players.size < G.MAX_RACERS) return true;
  if (GAME.id === 'challenge') return false; // concurentii cu bilet nu pierd locul
  const now = performance.now();
  if (!evictPool.length && now - evictPoolAt > 2000) {
    evictPoolAt = now;
    for (const p of players.values()) if (!p.active && !p.view && !p.finished && !p.carryCoins && !p.skin && now - p.lastActive > 20000) evictPool.push(p);
    evictPool.sort((a, b) => b.lastActive - a.lastActive); // pop() il scoate pe cel mai vechi
  }
  while (evictPool.length) { const w = evictPool.pop(); if (players.get(w.id) === w && !w.active && !w.view) { removePlayer(w); return true; } }
  return false;
}
function waitFor(vw) {
  if (GAME.id === 'challenge') return;
  if (!vw.waiting) { vw.waiting = true; waiting.push(vw); waitingN++; }
  const now = performance.now();
  if (now - fullToastAt > 6000) { fullToastAt = now; toast(vw, `<b>${esc(vw.name)}</b><small>${t('trackFull')}</small>`); }
}
function admitWaiting() {
  let i = 0;
  for (; i < waiting.length; i++) { const vw = waiting[i]; if (vw.waiting && !enterViewer(vw, { silent: true })) break; } // se opreste cand nu mai sunt locuri
  waiting.splice(0, i);
}
// un spectator devine alergator (daca e loc)
function enterViewer(vw, opts = {}) {
  let p = players.get(vw.id);
  if (p) return p;
  if (!freeSeat()) { waitFor(vw); return null; }
  const lane = (Math.random() * LANES) | 0;
  p = { id: vw.id, name: vw.name, avatarUrl: vw.avatarUrl || '', img: null, x: laneX(lane), targetLane: lane, yaw: Math.PI, pu: { shoes: 0, shield: 0 },
    offset: rand(-0.3, 0.3), wanderT: rand(2, 6), lastActive: performance.now(), rank: 1e9, view: null, floatCD: 0, jumpSeq: 0,
    lobbyAnim: pick(LOBBY_ANIMS), phase: Math.random() * 6, look: { main: vw.look.main, accent: pick(ACCENTS) }, join: joinSeq++ };
  freshStats(p);
  if (phase === 'race') {
    // intra in timpul cursei: implicit pe "linia inactivilor" (ca si cum ar fi fost la start si nu ar fi dat tap) – corect pentru toti
    const tail = unfinished.length ? unfinished[unfinished.length - 1].d : 0;
    p.d = RULES.LATE_JOIN === 'start' ? 0 : RULES.LATE_JOIN === 'pack' ? Math.max(0, tail - rand(3, 10)) : Math.max(0, idleD - rand(0, 12));
    p.yaw = 0;
  } else p.d = -40;
  players.set(p.id, p); rankNew.push(p); lobbyDirty = true;
  if (vw.waiting) { vw.waiting = false; waitingN--; }
  if (GAME.onJoin) GAME.onJoin(api, p, vw);
  if (!opts.keepCarry && vw.carry > 0) { const c = vw.carry; vw.carry = 0; if (phase === 'podium') p.carryCoins = c; else addCoins(p, c); } // gift-uri trimise cat nu avea loc
  if (!opts.silent && !GAME.joinToasts) joinQueue.push(p);
  return p;
}
function removePlayer(p) { if (p.view) releaseView(p.view); if (GAME.onLeave) GAME.onLeave(api, p); players.delete(p.id); recent.delete(p.id); p.gone = true; rankGone = true; lobbyDirty = true; }

// ---------------- matematica boost-urilor (formulele sunt in math.js)
const sprintOn = () => phase === 'race' && phaseT <= RULES.FINAL_SPRINT_SECONDS;
function addTaps(p, n) {
  p.focus = Math.min(1, p.focus + n * F.PER_TAP);
  if (phase !== 'race') return 0; // in lobby si pe podium tap-urile doar incarca energia: toti pleaca de la 0 m (lungimea traseului e calculata doar pe cursa)
  p.active = true;
  // serii: tap-uri fara pauza mai mare de STREAK.GAP secunde
  // seria se masoara pe ceasul JOCULUI (secunde), nu pe ceasul calculatorului: daca jocul merge mai greu (FPS mic), regula ramane aceeasi
  const S = RULES.STREAK;
  p.streak = time - (p.lastTapAt || -1e9) < S.GAP ? p.streak + n : n; p.lastTapAt = time;
  if (p.streak >= S.FIRE_AT && !p.fire) { p.fire = true; floatText(p, t('streakFire', { n: S.FIRE_AT }), '#ff8a1f', 12); snd.streak(); }
  if (p.streak >= S.BOOST_AT && !p.boosted) { p.boosted = true; p.tapBank += S.BOOST_METERS; p.earned += S.BOOST_METERS; floatText(p, t('streakBoost', { n: S.BOOST_AT, m: S.BOOST_METERS }), '#7cff6b', 20); snd.whoosh(); }
  fanWallPing(p);
  if (sprintOn()) n *= RULES.FINAL_SPRINT_MULT;
  p.tapAcc += n;
  let gained = 0;
  for (let guard = 0; guard < 400; guard++) {
    const cost = tapCost(p.dashes);
    if (p.tapAcc < cost) break;
    p.tapAcc -= cost; p.dashes++; gained += RULES.TAP_METERS;
  }
  if (gained) { p.tapBank += gained; p.earned += gained; }
  return gained;
}
function addCoins(p, coinsN) {
  const before = p.rocketLvl;
  p.active = true;
  p.focus = Math.min(1, p.focus + F.GIFT_REFILL);
  p.focusLock = (p.focusLock || 0) + MX.giftLockSeconds(RULES, coinsN); // energie plina inca 2 s / moneda (vezi rules.js)
  p.coinsRound += coinsN;
  let meters = 0;
  while (p.coinsRound >= rocketThreshold(p.rocketLvl + 1)) { p.rocketLvl++; meters += rocketMeters(p.rocketLvl); }
  p.rocketBank += meters; p.earned += meters;
  return { meters, levels: p.rocketLvl - before };
}
// gift primit cand nu poate fi folosit (pe podium, dupa sosire, eliminat in finala): se pastreaza pentru runda urmatoare
function keepForNextRound(p, coins) { p.carryCoins = (p.carryCoins || 0) + coins; toast(p, `<b>${esc(p.name)}</b><small>${t('giftNext')}</small>`, true); }
function applyGift(p, ev) {
  const c = Math.max(0, ev.coins || 0);
  if (c && (!biggestGift || c > biggestGift.coins)) biggestGift = { id: p.id, coins: c };
  const gname = esc(ev.giftName || 'Gift') + ((ev.repeat || 1) > 1 ? ' x' + ev.repeat : '');
  if (c) {
    const r = addCoins(p, c);
    if (r.meters) {
      snd.rocket(); snd.gift(r.meters >= 20);
      floatText(p, `🚀 +${r.meters} m`, '#ffb020', 30);
      toast(p, `<b>${esc(p.name)}</b><small>${t('giftRocket', { gift: gname, m: r.meters, lvl: p.rocketLvl })}</small>`, true);
      if (r.meters >= 20 || r.levels >= 2) banner(p, t('sent', { gift: gname }), t('rocket', { m: r.meters }));
      queueGiftCam(p, r.meters >= 20);
    } else if (ev.final !== false) {
      toast(p, `<b>${esc(p.name)}</b><small>${t('giftWait', { gift: gname, need: rocketThreshold(p.rocketLvl + 1) - p.coinsRound, lvl: p.rocketLvl + 1 })}</small>`, true);
    }
  }
  if (ev.final) {
    const total = Math.max(1, ev.total || c);
    if (total >= RULES.SHIELD_MIN_COINS) { p.pu.shield = Math.max(p.pu.shield, RULES.SHIELD_SECONDS); floatText(p, '🛡️ ' + t('shield'), '#38e1ff'); snd.shield(); }
    if (!c) snd.ding();
    if (total >= RULES.SURPRISE_MIN_COINS && phase === 'race') startLevelEvent(p, gname);
  }
}

// ---------------- evenimente: partea comuna. Ce e specific unui joc sta in games/<joc>.js (onViewerEvent, canJoin, onJoin, onPlayerEvent)
const finiteIn = (v, lo, hi, fallback) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback; };
function handleEvent(ev) {
  if (!ev || !ev.type) return;
  if (ev.type === 'batch') { for (const e of ev.events || []) handleEvent(e); return; }
  if (ev.type === 'status') {
    $('#status').textContent = ev.text;
    $('#lost').classList.toggle('show', !!ev.lost);
    if (ev.username && ev.username !== streamer) { streamer = ev.username; buildBillboards(); }
    if (ev.language && !params.get('lang') && ev.language !== LANG) { LANG = ev.language; applyLanguage(); }
    // jocul din config.json se aplica o singura data, la pornire (altfel ar anula alegerea facuta din panou la fiecare reconectare)
    if (!modeFromServer) { modeFromServer = true; if (ev.mode && (!urlMode || ev.lockMode) && MODES.includes(ev.mode) && ev.mode !== MODE) { if (phase === 'lobby' && !players.size) switchModeNow(ev.mode); else pendingMode = ev.mode; } }
    // un live = un joc: cu "lockMode" jocul nu se mai poate schimba (nici din panou, nici cu !mode)
    modeLocked = !!ev.lockMode && MODES.includes(ev.mode);
    if (modeLocked && ev.mode !== MODE && ev.mode !== pendingMode) { if (phase === 'lobby' && !players.size) switchModeNow(ev.mode); else pendingMode = ev.mode; }
    liveName = ev.liveName || ''; setTitle();
    return;
  }
  if (ev.type === 'control') { handleControl(ev); return; }
  if (ev.type === 'boards') { boards = ev; return; }
  if (!ev.user || ev.user.id == null || ev.user.id === '') return;
  // INTRAREA SE CURATA O SINGURA DATA, AICI: numere finite si limitate, texte chiar texte. Restul jocului se poate baza pe asta.
  // (un numar stricat - ex. Infinity monede - bloca pagina intr-o bucla; un "count" gresit strica energia jucatorului)
  ev = { ...ev, user: { ...ev.user, id: String(ev.user.id).slice(0, 64), name: String(ev.user.name ?? ev.user.id).slice(0, 24) || '?', avatar: typeof ev.user.avatar === 'string' ? ev.user.avatar.slice(0, 1000) : '' },
    text: ev.text == null ? '' : String(ev.text).slice(0, 200), giftName: ev.giftName == null ? '' : String(ev.giftName).slice(0, 40),
    count: finiteIn(ev.count, 1, 10000, 1), coins: finiteIn(ev.coins, 0, 1e7, 0), total: finiteIn(ev.total, 0, 1e9, 0), repeat: finiteIn(ev.repeat, 1, 1e6, 1) };
  if (ev.type === 'chat' && ev.admin && RULES.COMMANDS && /^!/.test(ev.text || '')) { runCommand(ev.text.trim()); return; }
  const vw = getViewer(ev.user), now = performance.now();
  if (GAME.onViewerEvent && GAME.onViewerEvent(api, vw, ev)) return;
  let p = players.get(vw.id);
  if (!p) {
    // nu poate intra acum (finala Eliminarii, pista plina): gift-ul lui se pastreaza si se aplica atunci cand intra
    const giftC = ev.type === 'gift' ? Math.max(0, ev.coins || 0) : 0;
    if (GAME.canJoin && !GAME.canJoin(api, vw, ev)) { if (giftC) vw.carry += giftC; return; }
    p = enterViewer(vw);
    if (!p) { if (giftC) vw.carry += giftC; return; }
  } else if (ev.user.avatar && !p.avatarUrl) { p.avatarUrl = ev.user.avatar; p._src = null; p.img = null; if (p.view) { p.view.badgeKey = ''; drawBadge(p.view); } }
  p.lastActive = now;
  if (GAME.onPlayerEvent && GAME.onPlayerEvent(api, p, vw, ev)) return;
  if (ev.type !== 'chat') recent.set(p.id, now);
  const coins = ev.type === 'gift' ? Math.max(0, ev.coins || 0) : 0;
  if (phase === 'podium' || (p.finished && phase === 'race')) { if (coins) keepForNextRound(p, coins); else if (ev.type === 'like') addTaps(p, 1); return; }
  switch (ev.type) {
    case 'like': { const g = addTaps(p, clamp(ev.count || 1, 1, RULES.MAX_TAPS_PER_EVENT)); if (g) { floatText(p, `+${g} m`, '#ffe14d', g * 3); if (p.view) snd.tap(); } break; }
    case 'follow':
      if (vw.followed) break; // o singura data pe live
      vw.followed = true; p.active = true;
      p.tapBank += RULES.FOLLOW_METERS; p.earned += RULES.FOLLOW_METERS; p.pu.shoes = Math.max(p.pu.shoes, 3); toast(p, `<b>${esc(p.name)}</b><small>${t('follow', { m: RULES.FOLLOW_METERS })}</small>`); floatText(p, `👟 +${RULES.FOLLOW_METERS} m`, '#7cff6b'); break;
    case 'share':
      if (p.shares >= RULES.SHARE_MAX_PER_ROUND) break; // fara spam de share
      p.shares++; p.active = true;
      p.tapBank += RULES.SHARE_METERS; p.earned += RULES.SHARE_METERS; toast(p, `<b>${esc(p.name)}</b><small>${t('share', { m: RULES.SHARE_METERS })}</small>`); floatText(p, `🔁 +${RULES.SHARE_METERS} m`, '#7cff6b'); break;
    case 'gift': applyGift(p, ev); break;
  }
}


// ================================================================ CELE 4 JOCURI (regulile si pasii fiecaruia sunt in games/*.js)
let modeLocked = false, liveName = '';
const setTitle = () => { document.title = `TURBOSTRADA – ${t('modes')[MODE] || MODE}${liveName ? ' – ' + liveName : ''}`; }; // titlul ferestrei: in LIVE Studio alegi usor fereastra potrivita
let pendingMode = null, modeFromServer = false, sprintAnnounced = false, leaderId = null, leadChangeCD = 0, routeEvent = 'none', boards = null, biggestGift = null;
const fillTip = s => { s = s.replace('{tap}', RULES.TAP_COST_START).replace('{ticket}', RULES.CHALLENGE.TICKET_COINS); return GAME.fill ? GAME.fill(s) : s; };
setInterval(() => { if (GAME.joinToasts) GAME.joinToasts(api); }, 1600);

// ---- schimbare de lider (anuntata, cu pauza de 3 s intre anunturi)
function checkLeadChange() {
  const L = unfinished[0] || ranked[0];
  if (!L) return;
  if (leaderId === null) { leaderId = L.id; return; }
  if (L.id !== leaderId && leadChangeCD <= 0 && L.d > 20) {
    leaderId = L.id; leadChangeCD = 3; snd.lead();
    toast(L, `<b>${esc(L.name)}</b><small>${t('leadChange')}</small>`, true); floatText(L, '👑 #1', '#ffd23f', 20);
    if (phaseT <= 60) focusOn(L, 2.5);
  } else if (L.id !== leaderId && leadChangeCD <= 0) leaderId = L.id;
}
// ---- cati metri ii lipsesc ca sa ajunga la sosire la timp, daca de acum NU mai da tap
// (distanta ramasa - metrii deja castigati dar neconsumati - cat mai alearga singur, cu energia care scade si cu impiedicari)
function metersShort(p) { return Math.max(0, (FINISH - p.d) - p.tapBank - p.rocketBank - MX.idleDistance(RULES, Math.max(0, phaseT), p.focus, OBST_PER_M, COINS_PER_M, p.focusLock || 0)); }

// ---- ce ofera motorul unui joc
const api = {
  players, viewers, snd, esc, short, $,
  get phase() { return phase; }, get phaseT() { return phaseT; }, set phaseT(v) { phaseT = v; },
  get elapsed() { return elapsed; }, get roundT() { return roundT; }, get round() { return round; }, get time() { return time; },
  get ranked() { return ranked; }, get unfinished() { return unfinished; }, get finishCount() { return finishCount; }, get FINISH() { return FINISH; },
  get obstPerM() { return OBST_PER_M; }, get coinsPerM() { return COINS_PER_M; }, get idleD() { return idleD; },
  now: () => performance.now(), racers: () => players.size,
  toast, banner, floatText, focusOn, rankAll, addTaps, addCoins, applyGift, removePlayer, metersShort, sprintOn, keepForNextRound,
  enter: enterViewer, fmtM: m => fmtM(m), fillTip: s => fillTip(s),
  endIn(sec) { if (endTimer < 0) endTimer = sec; },
  shake(v) { shake = Math.max(shake, v); },
  ticker(html) { $('#ticker').innerHTML = `<span class="t">${html}</span>`; },
  fansOf(p) { return p.fans || (p.fans = new Set()); },
  markActive(p) { recent.set(p.id, performance.now()); },
  knockOut(p) { if (p.view) { burst(p.x, 1, -p.d, 0xff3047, 3, 0.5); releaseView(p.view); } },
  setLook(p, main, accent) { if (!p.look0) p.look0 = { ...p.look }; p.look.main = main; p.look.accent = accent; paintView(p); },
  restoreLook(p) { if (p.look0) { p.look = { ...p.look0 }; p.look0 = null; paintView(p); } },
};
function paintView(p) { const v = p.view; if (!v) return; v.mats.main.color.setHex(p.look.main); v.mats.main.emissive?.setHex(p.look.main); v.mats.grey.color.setHex(p.look.accent); v.badgeKey = ''; applySkin(v, p); }

// ---- HUD per joc
// bannerul "cum se joaca" pentru jocul curent, in limba curenta
function renderHowto() {
  const h = t('howto_' + MODE), arr = Array.isArray(h) ? h : t('howto_classic');
  ['#howA', '#howB', '#howC'].forEach((id, i) => { const el = $(id); if (el) { el.textContent = arr[i] ? fillTip(arr[i]) : ''; el.style.fontSize = ''; } });
  requestAnimationFrame(fitHowto);
}
// textul trebuie sa incapa intreg (orice limba): micsoram litera pana incape, fara "..."
function fitHowto() {
  for (const id of ['#howA', '#howB', '#howC']) {
    const el = $(id); if (!el || !el.textContent) continue;
    let fs = parseFloat(getComputedStyle(el).fontSize), guard = 0;
    while (el.scrollWidth > el.clientWidth + 1 && fs > 9 && guard++ < 40) { fs *= 0.95; el.style.fontSize = fs + 'px'; }
  }
}
addEventListener('resize', () => renderHowto());
document.fonts?.ready.then(() => { try { renderHowto(); } catch {} }); // fontul se incarca dupa: re-masuram
function applyMode() {
  renderHowto();
  document.body.dataset.mode = MODE; document.body.dataset.finish = GAME.hasFinish ? '1' : '0'; setTitle();
  for (const v of views) v.badgeKey = '';
  lobbyDirty = true;
  showTip();
}
function updateModeHud() {
  const mi = $('#modeInfo'), chip = GAME.chip(api);
  $('#roundInfo').style.display = chip ? 'none' : '';
  mi.style.display = chip ? '' : 'none';
  if (chip) { mi.textContent = chip.text; mi.classList.toggle('danger', !!chip.danger); }
  if (GAME.hud) GAME.hud(api);
}

// ---- comenzi din chat (streamer / moderatori): !mode X, !end, !pause, !resume, !lang xx, !round N, !next
function runCommand(text) {
  $('#lost').textContent = t('lost'); $('#sndHint').textContent = t('clickSound');
  const [cmd, arg] = text.slice(1).toLowerCase().split(/\s+/);
  let ok = true;
  if (cmd === 'mode' && modeLocked) ok = false; // live cu joc fix
  else if (cmd === 'mode' && MODES.includes(arg)) { if (arg === MODE) pendingMode = null; else if (phase === 'lobby') switchModeNow(arg); else pendingMode = arg; }
  else if (cmd === 'end' && phase === 'race') phaseT = 0;
  else if (cmd === 'next' && phase === 'podium') phaseT = 0;
  else if (cmd === 'pause') paused = true;
  else if (cmd === 'resume') paused = false;
  else if (cmd === 'lang' && arg) { LANG = arg; applyLanguage(); }
  else if (cmd === 'round' && Number(arg) >= 30 && 'ROUND_SECONDS' in G) { G.ROUND_SECONDS = Math.min(1800, Number(arg)); if (phase === 'lobby') computeFinish(); } // durata jocului curent (Eliminarea isi calculeaza singura durata)
  else if (cmd === 'mute') snd.setMuted(true);
  else if (cmd === 'unmute') snd.setMuted(false);
  else ok = false;
  if (ok) { $('#ticker').innerHTML = `<span class="t">${t('cmdOk', { c: esc(text) })}</span>`; snd.ding(); }
}

// ---- schimbarea jocului: cel vechi isi strange lucrurile (leave), cel nou isi pregateste pista (enter)
function setMode(m) {
  if (GAME.leave) GAME.leave(api);
  MODE = m; GAME = GAMES[m]; G = activateGame(m); pendingMode = null;
  if (GAME.enter) GAME.enter(api);
  applyMode();
}
function switchModeNow(m) { setMode(m); computeFinish(); phaseT = G.LOBBY_SECONDS; }
// ---- EVENIMENTE DE TRASEU (unul pe runda): ploaie, tuneluri, santier
const rainGeo = new THREE.BoxGeometry(0.02, 0.6, 0.02);
const rain = new THREE.InstancedMesh(rainGeo, new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55 }), 400);
rain.frustumCulled = false; rain.visible = false; scene.add(rain);
const drops = Array.from({ length: 400 }, () => ({ x: rand(-30, 30), y: rand(0, 30), z: rand(-120, 10) }));
function startRouteEvent() {
  routeEvent = pick(RULES.ROUTE_EVENTS);
  rain.visible = routeEvent === 'rain';
  if (routeEvent !== 'none') { $('#ticker').innerHTML = `<span class="t">${t(routeEvent)}</span>`; $('#routeInfo').textContent = t(routeEvent).split(' ')[0]; $('#routeInfo').style.display = ''; }
  else $('#routeInfo').style.display = 'none';
  for (const c of chunks) dressChunk(c);
}
function endRouteEvent() { routeEvent = 'none'; rain.visible = false; $('#routeInfo').style.display = 'none'; for (const c of chunks) dressChunk(c); }
function updateRain(dt) {
  if (!rain.visible) return;
  const cz = camera.position.z;
  drops.forEach((d, i) => { d.y -= 28 * dt; if (d.y < 0) { d.y = rand(20, 30); d.x = rand(-30, 30); d.z = rand(-120, 10); } _v.set(camera.position.x + d.x, d.y, cz + d.z); rain.setMatrixAt(i, _m4.compose(_v, _q.identity(), _s)); });
  rain.instanceMatrix.needsUpdate = true;
}

// ================================================================ surprize de nivel
const EVENTS = { meteor: 7, ice: 6, storm: 4 };
function startLevelEvent(p, gname, forced) {
  const type = forced || pick(Object.keys(EVENTS));
  levelEvent = { type, t: EVENTS[type], gifter: p.id };
  banner(p, `${t('sent', { gift: gname })} • ${t('triggered')}`, t(type));
  if (type === 'meteor') for (const q of players.values()) if (q.id !== p.id && !q.finished) q.meteorAt = rand(0.3, EVENTS.meteor - 1);
  if (type === 'ice') for (const m of [roadMat, oppMat, groundMat, walkMat]) m.color.setHex(0xcfeeff);
  if (type === 'storm') scene.fog.color.setHex(0x6a4c8a);
  shake = 0.7;
}
function endLevelEvent() {
  for (const m of [roadMat, oppMat, groundMat, walkMat]) m.color.setHex(0xffffff);
  scene.fog.color.copy(FOG);
  for (const q of players.values()) q.meteorAt = undefined;
  levelEvent = null;
}

// ================================================================ efecte
const fx = [];
const burstGeo = new THREE.SphereGeometry(1, 16, 10);
function burst(x, y, z, color, size = 1.5, life = 0.5) {
  const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(x, y, z); scene.add(m);
  fx.push({ m, t: 0, life, upd(k) { m.scale.setScalar(0.2 + k * size); m.material.opacity = 0.9 * (1 - k); } });
}
function debris(o) {
  const color = o.type === 'car' ? CAR_COLORS[o.color % CAR_COLORS.length] : o.type === 'slide' || o.type === 'wall' ? 0xffcc00 : o.type === 'cones' ? 0xff5a00 : 0xe8202a;
  const x = laneX(o.lane), z = -o.d, m0 = mat(color, { metalness: 0.4 });
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(box, m0); m.scale.setScalar(rand(0.15, 0.45)); m.position.set(x + rand(-0.6, 0.6), rand(0.3, 1.2), z);
    const v = new THREE.Vector3(rand(-7, 7), rand(5, 11), rand(-12, -3)), w = new THREE.Vector3(rand(-9, 9), rand(-9, 9), 0);
    scene.add(m);
    fx.push({ m, keep: true, t: 0, life: 1.2, upd(k, dt) { v.y -= 24 * dt; m.position.addScaledVector(v, dt); m.rotation.x += w.x * dt; m.rotation.y += w.y * dt; if (m.position.y < 0.1) { m.position.y = 0.1; v.y *= -0.3; v.x *= 0.7; } } });
  }
  burst(x, 1, z, 0xffffff, 2.6, 0.35); shake = Math.max(shake, 0.2);
}
const textCanvasPool = [];
let floatAlive = 0;
function floatText(p, text, color, amount = 1) {
  if (!p.view || phase === 'podium') return;
  const now = performance.now();
  if (now - p.floatCD < 220) return;
  if (floatAlive >= Q.maxFloats) return;
  p.floatCD = now;
  const c = textCanvasPool.pop() || Object.assign(document.createElement('canvas'), { width: 320, height: 96 });
  const g = c.getContext('2d'); g.clearRect(0, 0, 320, 96);
  g.font = `60px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = 'rgba(20,8,40,.9)'; g.strokeText(text, 160, 52, 300); g.fillStyle = color; g.fillText(text, 160, 52, 300);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthWrite: false, depthTest: false, transparent: true }));
  const sc = 1 + Math.min(amount, 30) / 30;
  s.scale.set(1.9 * sc, 0.57 * sc, 1); s.renderOrder = 20;
  const bx = p.x + rand(-0.4, 0.4), by = p.y + 3.7;
  scene.add(s);
  floatAlive++;
  fx.push({ m: s, t: 0, life: 1.1, upd(k) { s.position.set(bx, by + k * 1.8, -p.d); s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; }, done() { tx.dispose(); textCanvasPool.push(c); floatAlive--; } });
}
const meteorGeo = new THREE.IcosahedronGeometry(0.8, 1), meteorMat = glow(0xff5a1f, 3);
function meteorStrike(tx, tz) {
  const m = new THREE.Mesh(meteorGeo, meteorMat);
  const trail = new THREE.Mesh(cone, flameMat); trail.scale.set(0.7, 4, 0.7); trail.position.y = 2; m.add(trail);
  const from = new THREE.Vector3(tx + rand(-10, 10), 45, tz - 35), to = new THREE.Vector3(tx, 0.6, tz);
  trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
  scene.add(m);
  fx.push({ m, keep: true, t: 0, life: 0.65, upd(k) { m.position.lerpVectors(from, to, k); }, done() { burst(tx, 1, tz, 0xff7a00, 4, 0.6); shake = Math.max(shake, 0.3); snd.meteor(); } });
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt; const k = Math.min(1, f.t / f.life);
    f.upd(k, dt);
    if (k >= 1) { scene.remove(f.m); if (f.done) f.done(); if (!f.keep && f.m.material) f.m.material.dispose(); fx.splice(i, 1); }
  }
}
const speedLines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 60);
speedLines.frustumCulled = false; scene.add(speedLines);
const lines = Array.from({ length: 60 }, () => { const a = rand(0, Math.PI * 2), r = rand(3, 9); return { x: Math.cos(a) * r, y: 3 + Math.sin(a) * r * 0.7, z: rand(-60, 0) }; });
function updateSpeedLines(dt, intensity) {
  speedLines.material.opacity += (intensity * 0.5 - speedLines.material.opacity) * Math.min(1, dt * 4);
  speedLines.visible = speedLines.material.opacity > 0.02;
  if (!speedLines.visible) return;
  lines.forEach((l, i) => { l.z += dt * 90; if (l.z > 5) l.z = rand(-70, -30); _v.set(camera.position.x + l.x, l.y, camera.position.z - 4 + l.z); speedLines.setMatrixAt(i, _m4.compose(_v, _q.identity(), _s)); });
  speedLines.instanceMatrix.needsUpdate = true;
}

// ================================================================ podium 3D + confetti
const podium = new THREE.Group(); podium.visible = false; scene.add(podium);
const PODIUM = [{ r: 1, x: 0, h: 1.7, c: 0xffd23f }, { r: 2, x: -2.5, h: 1.2, c: 0xdfe7f1 }, { r: 3, x: 2.5, h: 0.85, c: 0xf0a066 }];
for (const P of PODIUM) {
  const num = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#' + P.c.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h - 26, w, 26); g.fillStyle = '#2a1640'; g.font = `170px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(P.r, w / 2, h / 2 + 10); });
  const side = mat(P.c, { metalness: 0.6, roughness: 0.3 }), front = new THREE.MeshStandardMaterial({ map: num, metalness: 0.4, roughness: 0.35 });
  const b = new THREE.Mesh(box, [side, side, side, side, side, front]);
  b.scale.set(2.3, P.h, 2.3); b.position.set(P.x, P.h / 2 + 0.2, 0); b.castShadow = b.receiveShadow = true; podium.add(b);
}
addMesh(podium, new THREE.CylinderGeometry(6.5, 6.8, 0.2, 48), mat(0x1a1030, { metalness: 0.5, roughness: 0.4 }), 0, 0.1, 0);
const podRing1 = addMesh(podium, new THREE.TorusGeometry(6.6, 0.07, 8, 64), glow(0xff2d78, 4), 0, 0.22, 0, 1, 1, 1, false); podRing1.rotation.x = Math.PI / 2;
const podRing2 = addMesh(podium, new THREE.TorusGeometry(5.4, 0.05, 8, 64), glow(0x2ee6ff, 4), 0, 0.22, 0, 1, 1, 1, false); podRing2.rotation.x = Math.PI / 2;
for (const x of [-3.5, 0, 3.5]) { const b = new THREE.Mesh(new THREE.ConeGeometry(2.4, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: x ? 0xff6ad5 : 0xfff0a0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false })); b.position.set(x, 7, 0.5); podium.add(b); }
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 0.24), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 320);
confetti.frustumCulled = false; podium.add(confetti);
const conf = Array.from({ length: 320 }, (_, i) => { confetti.setColorAt(i, new THREE.Color().setHSL(Math.random(), 0.9, 0.6)); return { p: new THREE.Vector3(rand(-7, 7), rand(2, 16), rand(-4, 4)), v: rand(1.2, 2.6), r: new THREE.Euler(rand(0, 6), rand(0, 6), 0), s: rand(2, 7) }; });
function updateConfetti(dt) {
  conf.forEach((c, i) => { c.p.y -= c.v * dt; c.p.x += Math.sin(time * 2 + i) * dt * 0.6; c.r.x += c.s * dt; c.r.y += c.s * 0.7 * dt; if (c.p.y < 0.2) c.p.set(rand(-7, 7), rand(12, 16), rand(-4, 4)); confetti.setMatrixAt(i, _m4.compose(c.p, _q.setFromEuler(c.r), _s)); });
  confetti.instanceMatrix.needsUpdate = true;
}
let podiumD = 0, podiumTop = [];

// ================================================================ AI + fizica
function findAhead(d, lane, look) {
  let best = null;
  for (let s = Math.floor(d / SEG); s <= Math.floor((d + look) / SEG); s++) for (const o of getSeg(s).obs) {
    if (o.broken || o.lane !== lane || o.d <= d + 0.3 || o.d - d > look) continue;
    if (!best || o.d < best.d) best = o;
  }
  return best;
}
function laneBlocked(lane, d0, d1) {
  if (lane < 0 || lane >= LANES) return true;
  for (let s = Math.floor(d0 / SEG); s <= Math.floor(d1 / SEG); s++) for (const o of getSeg(s).obs) if (!o.broken && o.lane === lane && o.type === 'car' && o.d > d0 - 4 && o.d < d1) return true;
  return false;
}
function think(p, dt) {
  // decizia (evita / nu evita) se ia O SINGURA DATA pentru fiecare obstacol, cu sansa data de energie (aceeasi ca la cei nedesenati).
  // Daca evita: masina = schimba banda (doar pe una libera), bariera / conuri = sare, bara de sus = se lasa jos. La timp.
  const dec = p.handled || (p.handled = new Map());
  const look = 6 + p.speed * 1.1;
  const o = findAhead(p.d, p.targetLane, look);
  let busy = false;
  if (o) {
    // NU se mai trage la sorti aici: impiedicarile vin din aceeasi formula pentru toti (vezi tripCheck). Animatia doar le arata:
    // obstacolul ales pentru impiedicare nu e evitat, toate celelalte sunt evitate.
    const ok = p.trip !== o.id;
    if (dec.size > 300) dec.clear();
    const dist = o.d - p.d;
    busy = dist < 14;
    if (ok && p.pu.shield <= 0) { // cu scut trece prin obstacol si il sparge
      if (o.type === 'car') {
        const opts = [p.targetLane - 1, p.targetLane + 1].sort(() => Math.random() - 0.5).filter(l => laneFree(l, p.d - 1, o.d + 5));
        if (opts.length) p.targetLane = opts[0];
        else if (dist <= p.speed * JUMP_T * 0.5 + 0.4 && p.jumpT <= 0) { p.jumpT = JUMP_T; p.jumpBig = true; p.jumpSeq++; dec.set(o.id, true); } // nicio banda libera: sare peste masina
      }
      else if ((o.type === 'jump' || o.type === 'cones' || o.type === 'wall') && dist <= p.speed * JUMP_T * 0.5 + 0.3 && p.jumpT <= 0) { p.jumpT = JUMP_T; p.jumpBig = false; p.jumpSeq++; p.slideT = 0; }
      else if (o.type === 'slide' && dist <= p.speed * 0.25 + 0.6 && p.slideT <= 0) { p.slideT = SLIDE_T; }
    }
  }
  // plimbare intre benzi: doar cand drumul e liber si noua banda e libera (fara niciun obstacol in fata)
  p.wanderT -= dt;
  if (p.wanderT <= 0 && !busy && !p.trip && p.jumpT <= 0 && p.slideT <= 0) { p.wanderT = rand(2.5, 7); const nl = p.targetLane + (Math.random() < 0.5 ? -1 : 1); if (laneFree(nl, p.d - 1, p.d + 22)) p.targetLane = nl; }
}
// banda fara NICIUN obstacol intre d0 si d1
function laneFree(lane, d0, d1) {
  if (lane < 0 || lane >= LANES) return false;
  for (let s = Math.floor(d0 / SEG); s <= Math.floor(d1 / SEG); s++) for (const o of getSeg(s).obs) if (!o.broken && o.lane === lane && o.d > d0 - 2 && o.d < d1) return false;
  return true;
}
// obstacolul cel mai apropiat (in fata sau tocmai depasit) pe o banda – pentru animatia plutonului
function obsNear(d, lane) {
  let best = null, bd = 1e9;
  for (let s = Math.floor((d - 5) / SEG); s <= Math.floor((d + 7) / SEG); s++) for (const o of getSeg(s).obs) {
    if (o.broken || o.lane !== lane) continue;
    const dd = o.d - d; if (dd < -5 || dd > 7) continue;
    if (Math.abs(dd) < Math.abs(bd)) { best = o; bd = dd; }
  }
  return best ? { o: best, dd: bd } : null;
}
function collide(p, prev) {
  const flying = p.rocketBank > 0.3;
  for (let s = Math.floor(prev / SEG); s <= Math.floor(p.d / SEG); s++) {
    const seg = getSeg(s);
    for (const c of seg.coins) {
      if (c.taken || !(prev < c.d && p.d >= c.d) || Math.abs(p.x - laneX(c.lane)) > 0.95 || p.y > 2.4) continue;
      c.taken = true; // doar vizual: metrii din monede se dau la fel pentru toti, statistic (vezi updateRunner)
      if (p.view) { burst(laneX(c.lane), 0.9, -c.d, 0xffd23f, 0.9, 0.25); if (cam.target === p || Math.random() < 0.3) snd.coin(); }
    }
    for (const o of seg.obs) {
      if (o.broken || !(prev < o.d && p.d >= o.d) || Math.abs(p.x - laneX(o.lane)) > 1.05) continue;
      // CORECTITUDINE: impiedicarea NU depinde de cat de bine a reusit animatia (saritura, schimbarea benzii), ci doar de decizia
      // luata cu sansa dodgeOf(energie) – exact ca la alergatorii nedesenati. Asa cei din cadru (lideri, gifteri) nu sunt dezavantajati.
      // Ca la cei nedesenati: in zbor (racheta) sau deja impiedicat nu se mai impiedica.
      if (o.id === p.trip) { p.trip = null; stumble(p, false); return; } // impiedicarea programata se intampla chiar aici
      if (!flying && p.pu.shield > 0) { o.broken = true; if (o.mesh) o.mesh.visible = false; if (p.view) debris(o); }
      // orice alt obstacol: trece (evitat), chiar daca animatia n-a iesit perfect
    }
  }
}
// extend=false: impiedicarea vine dintr-o tragere deja facuta (fereastra ei e deja numarata in tripCheck)
function stumble(p, extend = true) { if (extend) p.virtUntil = Math.max(p.virtUntil || 0, elapsed + RULES.STUMBLE_SECONDS); p.stumble = RULES.STUMBLE_SECONDS; p.jumpT = 0; p.slideT = 0; p.plan = null; p.streak = 0; p.fire = false; if (p.view) { burst(p.x, 1, -p.d, 0xffffff, 1.2, 0.3); snd.bonk(); } }

// viteza = baza (la fel pentru toti) + "banca" de metri din tap-uri/gift-uri, consumata rapid
function runnerSpeed(p, dt) {
  const flying = p.rocketBank > 0.3;
  let extra = 0;
  // din banca se scot EXACT metrii care exista: cand banca se goleste in mijlocul pasului, nu se mai da un pas intreg (inainte: metri "din nimic", ~8 m / cursa pentru cine da tap des)
  if (p.rocketBank > 0 && dt > 0) { const take = Math.min(p.rocketBank, Math.min(RULES.ROCKET_SPEED, 8 + p.rocketBank) * dt); p.rocketBank -= take; extra += take / dt; }
  if (p.tapBank > 0 && dt > 0) { const take = Math.min(p.tapBank, Math.min(RULES.TAP_BURST_SPEED, 1.5 + p.tapBank * 1.2) * dt); p.tapBank -= take; extra += take / dt; }
  let base = RULES.BASE_SPEED * focusSpeed(p);
  if (levelEvent && levelEvent.gifter !== p.id) { if (levelEvent.type === 'ice') base *= 0.7; if (levelEvent.type === 'storm') base *= 0.5; }
  if (p.stumble > 0 && !flying) base = RULES.STUMBLE_SPEED;
  p.baseSp = base; // doar alergarea proprie (fara metrii din banca de tap-uri / racheta)
  return base + extra;
}
function updateRunner(p, dt, detailed, decay) {
  if (p.finished || p.out) { p.speed = 0; return; }
  const pu = p.pu; if (pu.shoes > 0) pu.shoes -= dt; if (pu.shield > 0) pu.shield -= dt;
  if (p.focusLock > 0) { p.focusLock -= dt; p.focus = 1; } else p.focus *= decay; // gift = energie plina un timp
  const sp = runnerSpeed(p, dt);
  if (p.stumble > 0) p.stumble -= dt; // dupa viteza: impiedicarea tine exact STUMBLE_SECONDS (ca in formula avgSpeed), nu cu un pas mai putin
  p.speed = sp; // aceeasi viteza pentru toti, desenati sau nu (inainte cei desenati aveau o intarziere de ~0,2 s la rachete / impiedicari => ajungeau mai tarziu la sosire)
  const flying = p.rocketBank > 0.3;
  if (p.meteorAt !== undefined) { p.meteorAt -= dt; if (p.meteorAt <= 0) { p.meteorAt = undefined; if (p.view) meteorStrike(p.x, -p.d - p.speed * 0.65); if (p.pu.shield <= 0 && !flying) { if (p.view) setTimeout(() => stumble(p), 600); else stumble(p); } } }
  const prev = p.d;
  // obstacolele si monedele de pe pista se socotesc doar pe metrii ALERGATI (nu si pe cei din banca de tap-uri / racheta, care sunt "garantati"),
  // exact ca in formulele din math.js (avgSpeed x timp x (1 + monede pe metru)) => traseul calculat si jocul se potrivesc
  const runM = p.baseSp * dt;
  if (detailed) {
    if (!flying && p.stumble <= 0) think(p, dt);
    const lat = 7 + p.speed * 0.25, tx = laneX(p.targetLane) + p.offset;
    p.x += clamp(tx - p.x, -lat * dt, lat * dt);
    if (flying) p.y += (3.3 + Math.sin(time * 3 + p.phase) * 0.3 - p.y) * Math.min(1, dt * 4);
    else if (p.jumpT > 0) { p.jumpT -= dt; const k = 1 - Math.max(0, p.jumpT) / JUMP_T; p.y = 4 * (p.jumpBig ? 2.1 : JUMP_H) * k * (1 - k); if (p.jumpT <= 0) { p.y = 0; p.jumpBig = false; } }
    else p.y += (0 - p.y) * Math.min(1, dt * 6);
    if (p.slideT > 0) p.slideT -= dt;
    p.d += p.speed * dt;
    collide(p, prev);
    tripCheck(p, runM, flying, true);
  } else {
    // alergator nedesenat: aceeasi viteza, impiedicari aproximate statistic
    p.y = flying ? 3.3 : 0; p.jumpT = 0; p.slideT = 0;
    p.d += p.speed * dt;
    tripCheck(p, runM, flying, false);
  }
  // monedele de pe pista: aceeasi medie pentru toti (cei desenati le si "culeg" vizual)
  if (!flying) { p.coinAcc += runM * COINS_PER_M; while (p.coinAcc >= 1) { p.coinAcc--; p.picked++; p.tapBank += RULES.COIN_METERS; p.earned += RULES.COIN_METERS; } }
  if (GAME.hasFinish && p.d >= FINISH && !p.crossing) { p.crossing = true; p.crossAt = elapsed - (p.d - FINISH) / Math.max(0.1, p.speed); crossers.push(p); }
}
// IMPIEDICARILE – aceeasi matematica pentru TOTI (desenati sau nu): la fiecare metru, sansa = obstacole pe metru pe banda x (1 - sansa de a evita).
// Exact formula din math.js (avgSpeed), deci si lungimea traseului si "cat iti lipseste" se potrivesc cu ce se intampla in joc.
// Dupa o impiedicare, urmatoarele STUMBLE_SECONDS nu se mai trage (asa e si in formula). In zbor (racheta) sau cu scut: nu se impiedica.
// Pentru cei desenati, impiedicarea e "legata" de obstacolul din fata (daca e unul aproape), ca sa se vada natural; altfel se impiedica pe loc.
function tripCheck(p, runM, flying, detailed) {
  if (p.trip && (!detailed || flying || p.d > p.tripD + 0.6)) { p.trip = null; stumble(p, false); } // obstacolul a fost ratat / a iesit din cadru: tot se impiedica
  if (flying || p.pu.shield > 0 || elapsed < p.virtUntil) return;
  if (Math.random() >= runM * OBST_PER_M * (1 - dodgeOf(p))) return;
  p.virtUntil = elapsed + RULES.STUMBLE_SECONDS;
  if (detailed) {
    if (p.trip) stumble(p, false); // una mai veche inca neconsumata (rar): se consuma acum
    const o = findAhead(p.d, p.targetLane, 4 + p.speed * 1.2);
    if (o) { p.trip = o.id; p.tripD = o.d; return; }
  }
  p.trip = null; stumble(p, false);
}
// cei care au trecut linia in acest pas, in ordinea EXACTA a trecerii (momentul interpolat in interiorul pasului); egalitate perfecta -> la sorti
const crossers = [];
function settleCrossers() {
  if (!crossers.length) return;
  crossers.sort((a, b) => (a.crossAt - b.crossAt) || ((a.tie || 0) - (b.tie || 0)));
  for (const p of crossers) { p.crossing = false; if (!p.finished && players.has(p.id)) finishRunner(p); }
  crossers.length = 0;
}
function finishRunner(p) {
  p.finished = true; p.crossing = false; p.finishOrder = ++finishCount; p.finishTime = elapsed;
  p.d = FINISH + 4 + Math.min(finishCount, 12) * 1.2; p.rocketBank = 0; p.tapBank = 0; p.y = 0; p.x = laneX((finishCount - 1) % LANES);
  p.targetLane = (finishCount - 1) % LANES; p.podAnim = 'Dance';
  if (finishCount <= 3) { banner(p, '', t('finished', { n: finishCount })); focusOn(p, 3.5); }
  if (GAME.onFinish) GAME.onFinish(api, p); // fiecare joc decide cand se incheie cursa
}

// ================================================================ animatie
function animateView(v, dt) {
  const p = v.player, racing = phase === 'race' && !p.finished;
  const flying = racing && p.rocketBank > 0.3;
  const wantYaw = phase === 'lobby' || (phase === 'race' && p.finished) ? Math.PI : 0;
  p.yaw += (wantYaw - p.yaw) * Math.min(1, dt * 5);
  if (p.vo) { p.vo *= Math.exp(-dt * 2.2); if (Math.abs(p.vo) < 0.02) p.vo = 0; } // plecarea de la start: vizual porneste din randul lui, logic toti pleaca de la 0
  v.root.position.set(p.x, p.y, -(p.d + p.vo)); v.root.rotation.y = p.yaw;
  const b = v.body; b.rotation.set(0, 0, 0); b.position.set(0, 0, 0);
  if (racing) b.rotation.y = clamp((laneX(p.targetLane) + p.offset - p.x) * -0.25, -0.5, 0.5);
  if (flying) { b.rotation.x = -1.25; b.position.set(0, 0.5, 0.9); }
  else if (racing && p.stumble > 0) b.rotation.z = Math.sin(time * 16) * 0.3;
  else if (racing && p.slideT > 0) { b.rotation.x = 1.15; b.position.set(0, 0.15, -0.2); }
  else if (racing) b.rotation.x = -0.08 - Math.min(p.speed, 40) * 0.004;
  if (v.mixer) {
    if (phase === 'podium' || (phase === 'race' && p.finished)) play(v, p.podAnim || 'Dance');
    else if (phase === 'lobby') play(v, p.lobbyAnim);
    else if (flying) { play(v, 'Jump', { ts: 0 }); v.actions.Jump.time = 0.32; }
    else if (p.stumble > 0) play(v, 'No', { ts: 1.6 });
    else if (p.jumpT > 0) { if (v.jumpSeq !== p.jumpSeq) { v.jumpSeq = p.jumpSeq; play(v, 'Jump', { fade: 0.08, ts: 0.71 / JUMP_T, restart: true }); } }
    else if (p.focus < F.TIRED_BELOW && p.tapBank <= 0) play(v, 'Walking', { fade: 0.25, ts: clamp(p.speed / 2.2, 1.6, 4) });
    else play(v, 'Running', { fade: 0.15, ts: clamp(0.8 + p.speed / 14, 0.9, 2.6) });
    v.mixer.update(dt);
  } else if (v.legL) {
    // animatie fara schelet: alergare, mers obosit, salut in lobby, dans pe podium
    const tired = racing && p.focus < F.TIRED_BELOW && p.tapBank <= 0;
    p.phase += dt * (racing ? (tired ? 4 : 6 + Math.min(p.speed, 30) * 0.4) : 3);
    const s = racing && !flying && p.stumble <= 0 ? Math.sin(p.phase) : 0, amp = tired ? 0.45 : 1;
    v.legL.rotation.set(s * 0.9 * amp, 0, 0); v.legR.rotation.set(-s * 0.9 * amp, 0, 0);
    v.armL.rotation.set(-s * 0.9 * amp, 0, 0.1); v.armR.rotation.set(s * 0.9 * amp, 0, -0.1);
    if (racing && !flying) b.position.y += Math.abs(Math.sin(p.phase)) * (tired ? 0.04 : 0.1);
    if (flying) { v.armL.rotation.set(-3, 0, 0.2); v.armR.rotation.set(-3, 0, -0.2); }
    else if (racing && p.stumble > 0) { v.armL.rotation.z = 1.2 + Math.sin(time * 14) * 0.5; v.armR.rotation.z = -1.2 - Math.sin(time * 14) * 0.5; }
    else if (phase === 'lobby') { const w = p.lobbyAnim === 'Wave' || p.lobbyAnim === 'Yes' || p.lobbyAnim === 'ThumbsUp'; if (w) v.armR.rotation.set(0, 0, -2.6 + Math.sin(time * 7 + p.phase) * 0.35); b.position.y = Math.abs(Math.sin(time * 3 + p.phase)) * (p.lobbyAnim === 'Dance' ? 0.15 : 0.03); }
    else if (!racing) { b.position.y = Math.abs(Math.sin(time * 6 + p.phase)) * 0.25; v.armL.rotation.set(0, 0, 2.6 + Math.sin(time * 9) * 0.3); v.armR.rotation.set(0, 0, -2.6 - Math.sin(time * 9) * 0.3); } // podium / dupa sosire: sare de bucurie
  }
  v.jet.visible = flying;
  if (flying) for (const f of v.flames) f.scale.set(0.12, 0.4 + Math.random() * 0.4, 0.12);
  v.shield.visible = racing && p.pu.shield > 0;
  if (v.shield.visible) { v.shield.rotation.y += dt * 2; v.shield.scale.setScalar(1 + Math.sin(time * 8) * 0.03); }
  const tapping = racing && (p.tapBank > 0.2 || p.pu.shoes > 0);
  v.rings.forEach((r, i) => { r.visible = tapping && !flying; if (r.visible) r.scale.setScalar(1 + Math.sin(time * 20 + i) * 0.15); });
  const onFire = racing && (p.streak >= RULES.STREAK.FIRE_AT || v.skinFlame) && time - p.lastTapAt < 3 + (v.skinFlame ? 1e9 : 0);
  v.rings.forEach(r => r.material = onFire ? fireRingMat : ringMat); if (onFire) v.rings.forEach(r => r.visible = true);
  v.trail.visible = racing && (tapping || flying || onFire);
  if (v.trail.visible) { v.trail.material = flying || onFire ? rocketTrailMat : trailMat; v.trail.position.y = flying ? -p.y + 0.05 : 0; v.trail.scale.set(1, 1, 0.5 + Math.min(p.speed, 40) / 20); }
  v.stars.visible = racing && p.stumble > 0;
  if (v.stars.visible) v.stars.rotation.y += dt * 8;
  v.badge.position.y = flying ? 2.2 : (racing && p.slideT > 0 ? 1.8 : 2.75);
  const cd = camera.position.distanceTo(v.root.position), bs = clamp((cd - 4) / 10, 0.35, 1);
  v.badge.scale.set(1.3 * bs, 1.52 * bs, 1);
  v.badge.material.opacity = clamp((cd - 3) / 4, 0, 1);
  drawBadge(v);
}

// ================================================================ vizibilitate (doar cei de langa camera sunt desenati)
let visTimer = 0;
function updateVisibility() {
  const max = Q.maxVisible;
  if (phase === 'podium') {
    const want = new Set(podiumTop);
    for (const v of [...views]) if (!want.has(v.player)) releaseView(v);
    for (const p of want) if (!p.view) assignView(p);
    return;
  }
  // stabil: cine e deja desenat ramane cat timp e in cadru; se schimba doar cand iese din cadru sau trebuie loc pentru cineva important
  const wide = cam.mode === 'pack' || cam.mode === 'crowd';
  const lo = camD - 3, hi = camD + (wide ? 150 : 110);
  const inRange = p => !p.out && p.d > lo && p.d < hi;
  for (const v of [...views]) if (!inRange(v.player) && v.player !== cam.target) releaseView(v);
  const now = performance.now(), must = [];
  if (cam.target && players.has(cam.target.id) && !cam.target.view) must.push(cam.target);
  for (const p of ranked.slice(0, 3)) if (inRange(p) && !p.view) must.push(p);
  for (const [id, tm] of recent) { if (must.length >= 6) break; const p = players.get(id); if (p && !p.view && inRange(p) && now - tm < 4000 && !must.includes(p)) must.push(p); }
  // face loc pentru cei importanti, scotand pe cei mai departe de centru si inactivi
  const fd = wide ? focusD + 10 : focusD;
  const score = p => Math.abs(p.d - fd) - (now - (recent.get(p.id) || 0) < 8000 ? 40 : 0) - (p.rank <= 3 ? 80 : 0) - (p === cam.target ? 1000 : 0);
  while (views.length + must.length > max) {
    let worst = null, ws = -1e9;
    for (const v of views) { const sc = score(v.player); if (sc > ws && v.player !== cam.target) { ws = sc; worst = v; } }
    if (!worst) break; releaseView(worst);
  }
  for (const p of must) assignView(p);
  if (views.length < max) {
    // cei mai buni "need" candidati dintr-o singura trecere (fara sa sortam mii de oameni la fiecare 0.2 s)
    const need = max - views.length, best = [];
    for (const p of players.values()) {
      if (p.view || !inRange(p)) continue;
      const sc = score(p);
      if (best.length === need && sc >= best[need - 1].sc) continue;
      let i = best.length < need ? best.length : need - 1;
      while (i > 0 && best[i - 1].sc > sc) { best[i] = best[i - 1]; i--; }
      best[i] = { p, sc };
    }
    for (const b of best) assignView(b.p);
  }
  // umbre doar pentru cei mai apropiati de camera
  const byDist = [...views].sort((a, b) => Math.abs(a.player.d - focusD) - Math.abs(b.player.d - focusD));
  byDist.forEach((v, i) => setShadow(v, Q.shadows && i < 8));
}
function setShadow(v, on) { if (v.shadowOn === on) return; v.shadowOn = on; for (const m of v.meshes || []) m.castShadow = on; }

// ================================================================ plutonul: siluete simple pentru alergatorii fara robot desenat
// (cu 10.000 de oameni se vad 24 de roboti cu poza + pana la PACK_VISIBLE siluete in culoarea fiecaruia, intr-un singur apel de desenare)
const PACK_MAX = Math.max(0, RULES.PACK_VISIBLE | 0);
const packGeo = (() => {
  const body = new THREE.CapsuleGeometry(0.3, 0.5, 3, 8); body.translate(0, 0.8, 0);
  const head = new THREE.SphereGeometry(0.27, 10, 8); head.translate(0, 1.5, 0);
  const feet = new THREE.BoxGeometry(0.44, 0.28, 0.32); feet.translate(0, 0.15, 0);
  return mergeGeometries([body, head, feet]);
})();
const pack = new THREE.InstancedMesh(packGeo, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 }), Math.max(1, PACK_MAX));
// cu CHARACTER 'robot', plutonul e facut din acelasi robot (inghetat intr-o poza de alergare / de asteptare), in culoarea fiecaruia
let packRunGeo = null, packIdleGeo = null;
function bakeRobot(clip, t) {
  const model = SkeletonUtils.clone(ROBOT.scene);
  model.scale.setScalar(ROBOT.scale); model.rotation.y = Math.PI;
  const mixer = new THREE.AnimationMixer(model); mixer.clipAction(ROBOT.clips[clip]).play(); mixer.setTime(t);
  model.updateMatrixWorld(true);
  const parts = [], v = new THREE.Vector3();
  model.traverse(o => {
    if (!o.isMesh) return;
    const src = o.geometry, pos = src.attributes.position, n = pos.count;
    const out = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const m = o.material.name, c = m === 'Main' ? 1 : m === 'Grey' ? 0.32 : 0.7; // partea "Main" ia culoarea jucatorului, restul e inchis
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      out.set([v.x, v.y, v.z], i * 3); col.set([c, c, c], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (src.index) g.setIndex(src.index.clone());
    parts.push(g.index ? g.toNonIndexed() : g);
  });
  const g = mergeGeometries(parts); g.computeVertexNormals();
  return g;
}
function buildRobotPack() {
  if (!ROBOT) return;
  try { packRunGeo = bakeRobot('Running', 0.2); packIdleGeo = bakeRobot('Idle', 0.5); pack.material.vertexColors = true; pack.material.needsUpdate = true; pack.geometry = packRunGeo; }
  catch (e) { console.warn('pluton robot indisponibil', e); packRunGeo = packIdleGeo = null; }
}
pack.frustumCulled = false; pack.count = 0; scene.add(pack);
const _pc = new THREE.Color(), _pq = new THREE.Quaternion(), _pe = new THREE.Euler(), _pv = new THREE.Vector3(), _s2 = new THREE.Vector3(1, 1, 1);
const packList = []; let lobbyPack = [], packTimer = 0;
const packX = p => clamp(laneX(p.targetLane) + (((p.join * 0.6180339) % 1) - 0.5) * 1.6, -ROAD_W / 2 + 0.4, ROAD_W / 2 - 0.4);
// in lobby multimea sta in randuri in spatele robotilor (ca la o poza de grup)
const LOBBY_COLS = 6;
// camera din lobby sta in spatele startului: cei cu poza sunt aproape de ea, multimea sta dupa linia de start (mai departe), ca sa nu-i acopere
const lobbySpot = i => ({ x: ((i % 8) - 3.5) * (ROAD_W / 8) + (((i * 0.37) % 1) - 0.5) * 0.5, d: 1.2 + Math.floor(i / 8) * 1.35 + ((i * 0.73) % 1) * 0.5 });
function firstBelow(arr, d) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].d >= d) lo = m + 1; else hi = m; } return lo; } // arr sortat descrescator dupa d
function pickPack() {
  packList.length = 0;
  const max = Math.min(PACK_MAX, Q.packVisible);
  if (!max || phase === 'podium') return;
  if (phase === 'lobby') { for (let i = lobbyPack.length - 1, k = 0; i >= 0 && k < max; i--, k++) { const p = lobbyPack[i]; if (!p.gone) { p.packI = k; packList.push(p); } } return; }
  // cursa: cei din cadru care nu au robot. Daca sunt prea multi, se arata unul din "pas" (acelasi mereu, ca sa nu palpaie)
  // doar in fata jucatorului urmarit: siluetele nu acopera niciodata robotii din prim-plan
  const near = cam.mode === 'pack' || cam.mode === 'crowd' ? camD + 8 : focusD + 3.5;
  const i0 = firstBelow(unfinished, camD + 160), i1 = firstBelow(unfinished, near), n = i1 - i0;
  const stride = Math.max(1, Math.ceil(n / max));
  for (let i = i0; i < i1 && packList.length < max; i++) { const p = unfinished[i]; if (!p.view && p.join % stride === 0) { if (elapsed > 3) p.vo = 0; packList.push(p); } }
}
function updatePack(dt) {
  packTimer -= dt; if (packTimer <= 0) { packTimer = 0.25; pickPack(); }
  let n = 0;
  const lobby = phase === 'lobby', k = Math.exp(-dt * 2.2);
  if (packRunGeo) { const want = lobby ? packIdleGeo : packRunGeo; if (pack.geometry !== want) pack.geometry = want; }
  for (const p of packList) {
    if (p.view || p.out || p.gone || p.finished) continue;
    if (lobby) { const s = lobbySpot(p.packI); _pv.set(s.x, 0, -s.d); _pe.set(0, Math.PI, 0); }
    else {
      if (p.vo) { p.vo *= k; if (Math.abs(p.vo) < 0.02) p.vo = 0; }
      const flying = p.rocketBank > 0.3, d = p.d + p.vo;
      let x = packX(p), y = flying ? 3 : Math.abs(Math.sin(time * 9 + p.phase)) * 0.14, tilt = flying ? -1.1 : p.stumble > 0 ? 0.45 : -0.16, sq = 1;
      // nu trec prin obstacole: sar peste bariere / conuri, se apleaca sub bara, ocolesc masinile
      const nb = !flying && p.stumble <= 0 && !p.vo ? obsNear(d, p.targetLane) : null;
      if (nb) {
        const t = nb.o.type, dd = nb.dd;
        if ((t === 'jump' || t === 'cones' || t === 'wall') && dd > -1.3 && dd < 1.6) { const k = (dd + 1.3) / 2.9; y = 4 * 1.3 * k * (1 - k); tilt = -0.35; }
        else if (t === 'slide' && dd > -1.2 && dd < 1.4) { sq = 0.55; tilt = 0.5; }
        else if (t === 'car' && dd > -4.5 && dd < 6.5) { const side = p.targetLane < LANES - 1 ? 1 : -1, k = dd > 3 ? (6.5 - dd) / 3.5 : dd < -2 ? (dd + 4.5) / 2.5 : 1; x += side * LANE_W * 0.85 * Math.max(0, Math.min(1, k)); }
      }
      _pv.set(x, y, -d);
      _pe.set(tilt, 0, p.stumble > 0 ? Math.sin(time * 16 + p.phase) * 0.3 : 0);
      _s2.set(1, sq, 1);
    }
    pack.setMatrixAt(n, _m4.compose(_pv, _pq.setFromEuler(_pe), lobby ? _s : _s2)); pack.setColorAt(n, _pc.setHex(p.look.main)); n++;
  }
  pack.count = n; pack.visible = n > 0;
  if (n) { pack.instanceMatrix.needsUpdate = true; if (pack.instanceColor) pack.instanceColor.needsUpdate = true; }
}
// ---- linia rosie (Eliminare): cine e in spatele ei iese la urmatoarea taiere
const dangerMesh = new THREE.Mesh(new THREE.PlaneGeometry(EDGE * 2, 1.2), new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.7, depthWrite: false }));
dangerMesh.rotation.x = -Math.PI / 2; dangerMesh.position.y = 0.04; dangerMesh.visible = false; dangerMesh.renderOrder = 2; scene.add(dangerMesh);
let dangerD = 0;
function updateDangerLine(dt) {
  const d = GAME.dangerLine ? GAME.dangerLine(api) : 0;
  if (!d || phase !== 'race') { dangerMesh.visible = false; dangerD = 0; return; }
  dangerD = dangerD ? dangerD + RULES.BASE_SPEED * F.SPEED_MIN * dt : d; // inainteaza odata cu plutonul, apoi se corecteaza lin spre pozitia calculata
  dangerD += (d - dangerD) * Math.min(1, dt * 3);
  dangerMesh.visible = true; dangerMesh.position.z = -dangerD; dangerMesh.material.opacity = 0.5 + Math.sin(time * 6) * 0.2;
}
// ---- taietura de montaj: cand camera trebuie sa sara departe, face un "cut" scurt in loc sa zboare peste tot traseul
const cutEl = document.createElement('div');
cutEl.style.cssText = 'position:absolute;inset:0;background:#05030f;opacity:0;pointer-events:none';
stage.appendChild(cutEl);
function camCut() { cutEl.style.transition = 'none'; cutEl.style.opacity = '0.9'; void cutEl.offsetWidth; cutEl.style.transition = 'opacity .4s ease-out'; cutEl.style.opacity = '0'; }

// ================================================================ camera "regizor"
let camFlyX = 0, camFlyY = 0;
const cam = { mode: 'pack', t: RULES.CAMERA_PACK_SECONDS, target: null, h: 8.5, back: 12, ahead: 22, forced: false };
const CAM_MODES = { pack: { h: 14, back: 19, ahead: 34 }, focus: { h: 4.6, back: 7.5, ahead: 14 }, leader: { h: 8, back: 11.5, ahead: 22 }, crowd: { h: 17, back: 24, ahead: 42 }, fly: { h: 3.4, back: 6.2, ahead: 11 } }; // fly = prim-plan pe cine zboara cu racheta
function focusOn(p, sec) {
  if (phase !== 'race' || !p) return;
  if (cam.forced && cam.t > 1.2 && cam.target !== p) return;
  cam.mode = 'focus'; cam.target = p; cam.t = sec; cam.forced = true;
}
// ---- CAMERA GIFT: fiecare racheta primeste un prim-plan centrat. Mai multi gift-uri deodata = coada (rachetele mari sar in fata).
const giftCam = { q: [], cur: null, t: 0 };
function queueGiftCam(p, big) {
  if (phase !== 'race' || !RULES.CAMERA_GIFT || p.finished || p.out) return;
  const i = giftCam.q.findIndex(e => e.p === p); if (i >= 0) giftCam.q.splice(i, 1);
  if (giftCam.cur === p) { giftCam.t = Math.min(giftCam.t, 1); return; } // deja in prim-plan: mai sta
  const e = { p, at: performance.now() };
  if (big) giftCam.q.unshift(e); else giftCam.q.push(e);
  if (giftCam.q.length > 12) giftCam.q.length = 12;
}
function tickGiftCam(dt) {
  const g = giftCam;
  if (phase !== 'race') { g.q.length = 0; g.cur = null; return; }
  if (g.cur) {
    g.t += dt; const p = g.cur, flying = p.rocketBank > 0.3;
    // ramane cat zboara (min 2.2 s, max 6 s); cand asteapta si altii, maxim 3.5 s fiecare
    if (!players.has(p.id) || p.finished || p.out || g.t > 6 || (!flying && g.t > 2.2) || (g.q.length && g.t > 3.5)) g.cur = null;
  }
  if (!g.cur) {
    const now = performance.now();
    while (g.q.length) { const { p, at } = g.q.shift(); if (now - at > 12000 || !players.has(p.id) || p.finished || p.out) continue; g.cur = p; g.t = 0; p.shownAt = now; break; }
  }
  if (g.cur) { cam.mode = 'fly'; cam.target = g.cur; cam.forced = true; cam.t = 1; }
  else if (cam.mode === 'fly') nextCamMode();
}
function pickFocus() {
  // cineva activ recent (tap / gift) care nu a fost aratat de curand
  const now = performance.now(); let best = null, bestT = 0;
  for (const [id, tm] of recent) {
    const p = players.get(id);
    if (!p || p.finished || now - tm > 15000) { if (now - tm > 60000) recent.delete(id); continue; }
    if (p.shownAt && now - p.shownAt < 25000) continue;
    if (tm > bestT) { best = p; bestT = tm; }
  }
  if (!best && unfinished.length) best = pick(unfinished.slice(0, 40));
  return best;
}
function nextCamMode() {
  cam.forced = false;
  if (cam.mode === 'pack') { const p = pickFocus(); if (p) { cam.mode = 'focus'; cam.target = p; cam.t = RULES.CAMERA_FOCUS_SECONDS; p.shownAt = performance.now(); return; } }
  if (cam.mode === 'focus') { cam.mode = 'leader'; cam.target = null; cam.t = RULES.CAMERA_LEADER_SECONDS; return; }
  // din cand in cand: prim-plan pe un jucator ALES LA INTAMPLARE (oricine din cursa), ca fiecare sa aiba sansa sa apara
  if ((cam.mode === 'leader' || cam.mode === 'crowd') && unfinished.length > 1 && Math.random() < RULES.CAMERA_RANDOM_CHANCE) {
    const p = unfinished[(Math.random() * unfinished.length) | 0];
    cam.mode = 'focus'; cam.target = p; cam.t = RULES.CAMERA_FOCUS_SECONDS; p.shownAt = performance.now(); return;
  }
  // cu multi jucatori: un cadru larg cu MULTIMEA (mijlocul plutonului), ca sa se vada cati sunt, nu doar primii
  if (cam.mode === 'leader' && RULES.CAMERA_CROWD_SECONDS > 0 && unfinished.length >= RULES.CAMERA_CROWD_MIN) {
    const mid = unfinished[unfinished.length >> 1];
    if (unfinished[0].d - mid.d > 100) { cam.mode = 'crowd'; cam.target = null; cam.t = RULES.CAMERA_CROWD_SECONDS; return; }
  }
  cam.mode = 'pack'; cam.target = null; cam.t = RULES.CAMERA_PACK_SECONDS;
}

// ================================================================ HUD
const feedEl = $('#feed');
// zidul fanilor: pozele celor care au dat tap in ultimele 10 s
const fanWall = new Map();
function fanWallPing(p) { if (phase !== 'race') return; fanWall.set(p.id, { p, at: performance.now() }); }
function updateFanWall() {
  const now = performance.now(), el = $('#fanwall');
  for (const [id, f] of fanWall) if (now - f.at > 10000 || !players.has(id)) fanWall.delete(id);
  const list = [...fanWall.values()].sort((a, b) => b.at - a.at).slice(0, 3); // 7 incap intre ticker si butoanele TikTok din dreapta-jos
  const seen = new Set();
  list.forEach((f, i) => {
    seen.add(f.p.id);
    let d = el.querySelector(`[data-id="${CSS.escape(f.p.id)}"]`);
    if (!d) { d = document.createElement('div'); d.className = 'fan'; d.dataset.id = f.p.id; d.innerHTML = `<img class="av"><span></span>`; el.appendChild(d); }
    const img = d.querySelector('img'), src = avatarSrc(f.p); if (img.getAttribute('src') !== src) img.src = src;
    d.querySelector('span').textContent = f.p.streak >= RULES.STREAK.FIRE_AT ? '🔥' : '👆';
    d.style.transform = `translateY(${i * 4.2}cqh)`; d.style.opacity = 1 - (now - f.at) / 12000;
  });
  for (const d of [...el.children]) if (!seen.has(d.dataset.id)) d.remove();
}
// harta cursei: toti jucatorii ca densitate pe 48 de casute
const mapCanvas = document.createElement('canvas'); mapCanvas.width = 480; mapCanvas.height = 40;
mapCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:999px;pointer-events:none';
let mapTimer = 0;
function updateMap() {
  if (!mapCanvas.parentNode) $('#track .road').appendChild(mapCanvas);
  if (++mapTimer % 3) return; // ~0.6 s
  const g = mapCanvas.getContext('2d'); g.clearRect(0, 0, 480, 40);
  if (phase === 'lobby' || !players.size) return;
  const buckets = new Array(48).fill(0), TR = trackLen();
  for (const p of players.values()) if (!p.out) buckets[Math.min(47, Math.max(0, Math.floor(p.d / TR * 48)))]++;
  const dl = GAME.dangerLine ? GAME.dangerLine(api) : 0; // Eliminare: linia rosie pe harta
  if (dl > 0) { g.fillStyle = '#ff2030'; g.fillRect(24 + clamp(dl / TR, 0, 1) * 48 * 8.9 - 2, 0, 4, 40); }
  let mx = 1; for (const n of buckets) if (n > mx) mx = n;
  buckets.forEach((n, i) => { if (!n) return; const h = 4 + 30 * Math.sqrt(n / mx); g.fillStyle = `rgba(124,243,255,${0.25 + 0.6 * n / mx})`; g.fillRect(24 + i * 8.9, 40 - h, 7, h); });
}
function rivalLine(p) {
  const r = p.rivalId && players.get(p.rivalId);
  let s = r && !r.finished ? `<br>⚔️ ${t('rival')}: <b>${esc(r.name)}</b> +${Math.max(1, Math.round(r.d - p.d))} m` : '';
  if (GAME.extraLines) s += GAME.extraLines(api, p);
  return s;
}
// rivalul = cel imediat in fata; depasirile sunt anuntate (cu pauza)
let overtakeCD = 0;
function checkOvertakes() {
  if (overtakeCD > 0) return;
  for (let i = 1; i < Math.min(unfinished.length, 60); i++) {
    const p = unfinished[i - 1], prevRival = p.rivalId;
    if (prevRival && prevRival !== unfinished[i - 2]?.id && players.has(prevRival)) {
      const r = players.get(prevRival);
      if (!r.finished && !r.out && r.d < p.d && recent.has(p.id)) {
        p.overtakes++; overtakeCD = 2.5;
        toast(p, `<b>${esc(p.name)}</b><small>${t('overtook')} <b>${esc(r.name)}</b> ⚔️</small>`); floatText(p, '⚔️ +1', '#ff8a1f');
        if (p.view) snd.whoosh();
        break;
      }
    }
  }
  for (let i = 0; i < unfinished.length; i++) unfinished[i].rivalId = i > 0 ? unfinished[i - 1].id : null;
}
function toast(p, html, gift) {
  const d = document.createElement('div');
  d.className = 'toast panel' + (gift ? ' gift' : '');
  d.innerHTML = `<img class="av" src="${avatarSrc(p)}"><div>${html}</div>`;
  feedEl.prepend(d);
  while (feedEl.children.length > 2) feedEl.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 4500); setTimeout(() => d.remove(), 4900);
}
const joinQueue = [];
setInterval(() => {
  if (!joinQueue.length) return;
  const last = joinQueue[joinQueue.length - 1];
  if (joinQueue.length === 1) toast(last, `<b>${esc(last.name)}</b><small>${t('joined')}</small>`);
  else toast(last, `<b>${t('joinedMany', { n: joinQueue.length })}</b><small>${esc(last.name)}…</small>`);
  joinQueue.length = 0;
}, 1500);
let bannerTimer = 0;
function banner(p, l1, l2) {
  $('#banner').innerHTML = `<div class="bcard"><img src="${avatarSrc(p)}"><div><div class="l1"><b>${esc(p.name)}</b> ${l1}</div><div class="l2">${l2}</div></div></div>`;
  $('#banner').classList.add('show'); bannerTimer = 4;
}
let tipI = 0;
function showTip() { const tips = GAME.tips(); tipI = (tipI + 1) % tips.length; $('#ticker').innerHTML = `<span class="t">${fillTip(tips[tipI])}</span>`; }
setInterval(showTip, 3200);

const fmt = s => { s = Math.max(0, Math.ceil(s)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };
const fmtM = m => (m = Math.max(0, m), m >= 1000) ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
const powerIcons = p => (p.rocketBank > 0.3 ? '🚀' : '') + (p.focusLock > 0 ? '⚡' : '') + (p.pu.shield > 0 ? '🛡️' : '') + (p.stumble > 0 ? '💫' : '');
const cardEls = new Map(), dotEls = new Map();
let lastCount = '';
function updateHud() {
  const tt = phase === 'race' ? phaseT : ROUND();
  $('#time').textContent = fmt(tt);
  $('#ring').style.strokeDashoffset = 276.5 * (1 - tt / ROUND());
  $('#timer').classList.toggle('warn', phase === 'race' && phaseT <= 30);
  $('#roundInfo').textContent = '🏁 ' + t('round', { n: round });
  if (phase === 'lobby') roundT = GAME.roundSeconds(api, players.size); // in lobby durata se poate schimba (Eliminare: depinde de cati sunt)
  $('#playersInfo').textContent = '🏃 ' + short(players.size) + (waitingN > 0 ? ` +${short(waitingN)} 👥` : ''); // 👥 = in tribuna, intra runda urmatoare

  // banda de jos: top 5 (in lobby: ultimii intrati)
  const lobby = phase === 'lobby';
  const top = lobby ? lobbyList.slice(-5).reverse() : ranked.slice(0, 5);
  $('#stripLabel').textContent = lobby ? '🏁' : '🏆';
  const h = $('#cards').clientHeight / 5, seen = new Set(); // coloana verticala in dreapta (in afara zonelor TikTok)
  top.forEach((p, i) => {
    seen.add(p.id);
    let el = cardEls.get(p.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'card panel';
      el.innerHTML = `<div class="ava"><img class="av"><span class="rk"></span><span class="pw"></span></div><div class="txt"><div class="nm"></div><div class="m"></div><div class="fb"><i></i></div></div>`;
      el.style.transform = `translateY(${5 * h}px)`; el.style.opacity = 0;
      $('#cards').appendChild(el); cardEls.set(p.id, el);
    }
    el.className = 'card panel' + (!lobby && i < 3 ? ' c' + (i + 1) : '') + (p.finished ? ' fin' : '');
    el.style.transform = `translateY(${i * h}px)`; el.style.opacity = 1;
    el.querySelector('.rk').textContent = lobby ? '✓' : i + 1;
    const img = el.querySelector('img'), src = avatarSrc(p); if (img.getAttribute('src') !== src) img.src = src;
    el.querySelector('.nm').textContent = GAME.nameTag(p) + p.name;
    el.querySelector('.pw').textContent = lobby ? '' : powerIcons(p);
    el.querySelector('.m').textContent = lobby ? '🏁' : p.out ? '💀' : p.finished ? `🏁 #${p.finishOrder}` : fmtM(p.d);
    const fb = el.querySelector('.fb i'); fb.style.width = `${Math.round(p.focus * 100)}%`; fb.className = p.focus < F.TIRED_BELOW ? 'low' : p.focus > 0.7 ? 'hi' : '';
  });
  for (const [id, el] of cardEls) if (!seen.has(id)) { el.remove(); cardEls.delete(id); }

  // mini-pista: pozitia reala fata de SOSIRE
  const tr = ranked.slice(0, 8), seenD = new Set(), TR = trackLen();
  tr.forEach((p, i) => {
    seenD.add(p.id);
    let el = dotEls.get(p.id);
    if (!el) { el = document.createElement('div'); el.className = 'dot'; $('#track').appendChild(el); dotEls.set(p.id, el); }
    el.className = 'dot' + (i < 3 && !lobby ? ' r' + (i + 1) : '');
    const src = avatarSrc(p); if (el.dataset.src !== src) { el.dataset.src = src; el.style.backgroundImage = `url("${src}")`; }
    el.style.left = `${lobby ? 5 + i * 2.5 : 5 + clamp(p.d / TR, 0, 1) * 88}%`;
  });
  for (const [id, el] of dotEls) if (!seenD.has(id)) { el.remove(); dotEls.delete(id); }

  updateModeHud();

  // card "camera pe jucator"
  const f = $('#focus');
  const fp = phase === 'race' && cam.mode === 'focus' ? cam.target : null;
  if (fp && players.has(fp.id)) {
    const need = tapCost(fp.dashes) - fp.tapAcc;
    // randurile depind de joc: Clasic / Challenge = cat mai e pana la sosire; Echipe = cat a adus echipei; Eliminare = fata de linia rosie
    const html = `<span class="cam">🎥</span><img class="av" src="${avatarSrc(fp)}"><div><div class="n">${esc(GAME.nameTag(fp) + fp.name)} <span>#${fp.rank}</span></div><div class="s">⚡ ${t('energy')} <span class="fbar"><i style="width:${Math.round(fp.focus * 100)}%" class="${fp.focus < F.TIRED_BELOW ? 'low' : ''}"></i></span> ${fp.focus < F.TIRED_BELOW ? t('tired') : ''}<br>${GAME.focusLines(api, fp)}<br>${t('nextTap', { n: Math.ceil(need) })} • ${t('nextRocket', { lvl: fp.rocketLvl + 1, c: rocketThreshold(fp.rocketLvl + 1) - fp.coinsRound })}${rivalLine(fp)}</div></div>`;
    if (f.dataset.h !== html) { f.dataset.h = html; f.innerHTML = html; }
    f.classList.add('show');
  } else f.classList.remove('show');

  // numaratoare / mesaje
  const c = $('#count');
  let txt = '', cls = '';
  if (lobby) {
    const need = GAME.need(api), lobbyMsg = GAME.lobbyMsg(api), s = Math.ceil(phaseT);
    if (need > 0 && !forceStart) { cls = 'msg'; txt = `<span class="pill panel">${lobbyMsg}${players.size ? '<br>' + t('waitMore', { n: need }) : ''}</span>`; }
    else if (phaseT > 3.2) { cls = 'msg'; txt = `<span class="pill panel">${GAME.lobbyCount ? GAME.lobbyCount(api, s) : lobbyMsg + `<br>⏱ <b>${s}s</b>`}</span>`; }
    else { cls = 'big'; txt = String(Math.max(1, s)); }
  } else if (phase === 'race' && elapsed < 1.3) { cls = 'big'; txt = t('go'); }
  if (cls === 'big' && cls + txt !== lastCount) { if (phase === 'lobby') snd.count(false); else snd.count(true); }
  if (cls + txt !== lastCount) { lastCount = cls + txt; c.innerHTML = txt; c.className = cls === 'msg' ? 'msg' : ''; if (cls === 'big') { void c.offsetWidth; c.classList.add('pop'); } }
}

// ================================================================ clasament + campioni
const trackLen = () => GAME.hasFinish ? FINISH : Math.max(RULES.BASE_SPEED * roundT * 1.1, (ranked[0] ? ranked[0].d : 0) * 1.03); // scara pentru harta de sus
// la egalitate perfecta decide un numar tras la sorti la fiecare cursa (p.tie), NU ordinea intrarii in joc (inainte: primii intrati castigau mult mai des)
const byKey = (a, b) => (b.sk - a.sk) || (b.d - a.d) || (b.earned - a.earned) || ((a.tie || 0) - (b.tie || 0));
function rankAll() {
  // lista ramane sortata intre apeluri (se adauga cei noi, se scot cei plecati) => sortarea e aproape gratis si la 10.000 de jucatori
  if (rankGone) { ranked = ranked.filter(p => !p.gone); rankGone = false; }
  if (rankNew.length) { for (const p of rankNew) if (!p.gone) ranked.push(p); rankNew.length = 0; }
  // ordinea: cei ajunsi la sosire (in ordinea sosirii), apoi dupa distanta, apoi cei eliminati (ultimul eliminat e mai sus)
  for (let i = 0; i < ranked.length; i++) { const p = ranked[i]; p.sk = p.out ? -1e9 + (p.outAt || 0) : p.finished ? 1e9 - p.finishOrder : p.d; }
  ranked.sort(byKey);
  unfinished.length = 0;
  for (let i = 0; i < ranked.length; i++) { const p = ranked[i]; p.rank = i + 1; if (!p.finished && !p.out) unfinished.push(p); }
  if (GAME.onRank) GAME.onRank(api);
}
let champs = { day: '', list: {} };
try { champs = JSON.parse(localStorage.getItem('turbo-champs') || '{}'); } catch {}
if (!champs || champs.day !== new Date().toDateString()) champs = { day: new Date().toDateString(), list: {} };
function saveChamps() { try { localStorage.setItem('turbo-champs', JSON.stringify(champs)); } catch {} }
function showPodium() {
  rankAll();
  const res = GAME.results(api); // fiecare joc isi alege castigatorii si titlul
  podiumTop = res.podium;
  $('#winT').textContent = res.title;
  $('#winT').style.fontSize = res.big ? '1.7em' : '';
  // skin-uri pentru castigator (pana la finalul live-ului) + statistici persistente (server)
  const W = podiumTop[0];
  if (W && RULES.SKINS) {
    const skin = GAME.skin || 'gold';
    if (W.skin !== skin) { W.skin = skin; if (W.view) applySkin(W.view, W); toast(W, `<b>${esc(W.name)}</b><small>${t(skin === 'crown' ? 'skinCrown' : skin === 'flame' ? 'skinFlame' : 'skinGold')}</small>`, true); }
  }
  // clasamentul rundei: intai podiumul jocului (la Echipe = cei mai buni din echipa castigatoare), apoi restul
  const inPod = new Set(podiumTop), order = [...podiumTop, ...ranked.filter(p => !inPod.has(p)).slice(0, 50)].slice(0, 50);
  // rezultatul rundei: daca legatura cu serverul e intrerupta chiar acum (server repornit), se trimite la reconectare - clasamentele nu pierd runda
  if (!SPECTATOR) { const msg = JSON.stringify({ type: 'round', mode: MODE, biggestGift, results: order.map((p, i) => ({ id: p.id, name: p.name, avatar: avatarSrc(p), rank: i + 1, meters: Math.round(Math.max(0, p.d)), coins: p.coinsRound, finished: p.finished })) }); if (ws && ws.readyState === 1) ws.send(msg); else pendingRound = msg; }
  podiumTop.forEach((p, i) => {
    const c = champs.list[p.id] || (champs.list[p.id] = { name: p.name, avatar: avatarSrc(p), pts: 0, wins: 0 });
    c.name = p.name; c.avatar = avatarSrc(p); c.pts += [5, 3, 1][i]; if (i === 0) c.wins++;
    p.podAnim = ['Dance', 'Wave', 'ThumbsUp'][i];
  });
  const cl = Object.entries(champs.list).sort((a, b) => b[1].pts - a[1].pts);
  champs.list = Object.fromEntries(cl.slice(0, 200)); saveChamps();
  $('#podSub').textContent = `${t('round', { n: round })} • ${t('runners', { n: players.size })}` + (res.sub ? ' • ' + res.sub : '');
  $('#roundTable').innerHTML = order.slice(0, 3).map((p, i) => `<div class="trow"><span class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span><img class="av" src="${avatarSrc(p)}"><span class="nm">${esc(GAME.nameTag(p) + p.name)}</span><span class="m">${p.finished ? '🏁' : MODE === 'teams' ? '+' + fmtM(p.earned) : fmtM(p.d)}</span></div>`).join('');
  // tabelul din dreapta alterneaza: campionii zilei / saptamana / luna / toti timpii
  const views2 = [['day', cl.slice(0, 5).map(([id, c]) => ({ id, name: c.name, avatar: c.avatar, v: c.pts, wins: c.wins }))]];
  if (boards) { if (boards.week?.length) views2.push(['week', boards.week]); if (boards.month?.length) views2.push(['month', boards.month]); if (boards.all?.length) views2.push(['allTime', boards.all]); }
  const [bk, rows] = views2[(round - 1) % views2.length];
  $('#hChamp').textContent = '👑 ' + (bk === 'day' ? t('champions') : t(bk));
  const titleIcons = tl => (tl || []).map(x => x === 'challenge' ? '🎟️' : x === 'hat' ? '🎩' : x === 'whale' ? '🐳' : '').join('');
  $('#champTable').innerHTML = rows.slice(0, 3).map((c, i) => `<div class="trow"><span class="rk">${i + 1}</span><img class="av" src="${c.avatar || initialsAvatar(c.name, 0x7b2ff7)}"><span class="nm">${esc(c.name)} ${titleIcons(boards?.titles?.[c.id])}</span><span class="m">${c.wins}🏆 ${c.v}p</span></div>`).join('') || '<div class="trow">–</div>';
  $('#pod').classList.add('show');
  for (const id of ['#strip', '#feed', '#track', '#chips', '#banner', '#top', '#focus', '#teamsBar', '#howto']) $(id).style.visibility = 'hidden';
  podiumD = Math.max(GAME.hasFinish ? FINISH : 0, ranked[0]?.d || 0) + 40;
  podium.position.set(0, 0, -podiumD); podium.visible = true;
  setObstaclesHidden(true);
  podiumTop.forEach((p, i) => { const P = PODIUM[i]; p.x = P.x; p.d = podiumD; p.y = P.h + 0.2; p.yaw = 0; p.pu.shield = 0; p.stumble = 0; p.slideT = 0; p.jumpT = 0; p.rocketBank = 0; p.tapBank = 0; });
  updateVisibility();
}
function hidePodium() {
  $('#pod').classList.remove('show');
  for (const id of ['#strip', '#feed', '#track', '#chips', '#banner', '#top', '#focus', '#teamsBar', '#howto']) $(id).style.visibility = '';
  podium.visible = false; setObstaclesHidden(false); podiumTop = [];
}

// ================================================================ faze
// lungimea traseului si durata: le calculeaza jocul activ (formulele sunt in math.js)
function computeFinish() {
  roundT = GAME.roundSeconds(api, players.size);
  FINISH = GAME.hasFinish ? GAME.finishLength(api, roundT, Math.max(1, players.size)) : 1e9; // Echipe / Eliminare: fara linie de sosire
  finishGate.visible = GAME.hasFinish; finishGate.position.z = GAME.hasFinish ? -FINISH : 1e6;
}
// masoara cate obstacole sunt pe metru pe o banda, pe traseul rundei (cu tot cu santier) => aceleasi sanse pentru cei desenati si cei nedesenati
function measureTrack() { FINISH = 1e9; segCache.clear(); let n = 0; const N = 80; for (let s = 2; s < 2 + N; s++) n += getSeg(s).obs.length; OBST_PER_M = n / (N * SEG * LANES); segCache.clear(); }
function startRace() {
  phase = 'race'; finishCount = 0; endTimer = -1; elapsed = 0;
  rankAll();
  startRouteEvent(); clearObstacles(); measureTrack();
  computeFinish(); phaseT = roundT; resetChunks(camD);
  cam.mode = 'pack'; cam.t = RULES.CAMERA_PACK_SECONDS; cam.target = null; cam.forced = false;
  // TOTI pleaca de la 0 (corect). Cei desenati pornesc vizual din randul lor si ajung din urma in ~1 s (vo = decalaj doar vizual).
  for (const p of players.values()) { p.vo = p.view ? p.d : 0; p.d = 0; p.speed = 0; p.handled = null; p.plan = null; p.trip = null; p.virtUntil = 0; p.tie = Math.random(); }
  for (const p of packList) if (p.packI != null) p.vo = lobbySpot(p.packI).d;
  idleD = 0; idleFocus = F.START;
  sprintAnnounced = false; leaderId = null; leadChangeCD = 3; biggestGift = null;
  if (GAME.onRaceStart) GAME.onRaceStart(api);
  snd.horn();
}
function flushBanks() {
  // metrii castigati dar neconsumati inca (banca) sunt garantati la final
  // cine ajunge la sosire doar cu banca: in ordinea distantei finale (cea mai mare = primul), egalitate -> la sorti
  const late = [];
  for (const p of [...unfinished]) { const b = p.tapBank + p.rocketBank; if (b > 0) { p.d += b; p.tapBank = 0; p.rocketBank = 0; if (GAME.hasFinish && p.d >= FINISH && !p.finished) late.push(p); } }
  late.sort((a, b) => (b.d - a.d) || ((a.tie || 0) - (b.tie || 0))).forEach(finishRunner);
  rankAll();
}
function endRace() { flushBanks(); snd.fanfare(); phase = 'podium'; phaseT = G.PODIUM_SECONDS; if (levelEvent) endLevelEvent(); showPodium(); }
function newRound() {
  round++; phase = 'lobby';
  hidePodium();
  roundSeed = (Math.random() * 1e9) | 0;
  clearObstacles();
  const now = performance.now();
  if (pendingMode) setMode(pendingMode);
  fanWall.clear(); endRouteEvent();
  for (const p of [...players.values()]) {
    if (now - p.lastActive > RULES.IDLE_KICK_MINUTES * 60 * 1000) { removePlayer(p); continue; }
    // si monedele strânse spre revenire (Eliminare) trec in runda noua
    const skin = p.skin, carry = (p.carryCoins || 0) + (p.reviveCoins || 0); freshStats(p); p.skin = skin; p.yaw = Math.PI; p.lobbyAnim = pick(LOBBY_ANIMS); p.d = -40;
    if (carry) addCoins(p, carry); // gift-uri primite pe podium / dupa sosire: racheta porneste la start
  }
  if (GAME.onNewRound) GAME.onNewRound(api);
  admitWaiting(); // cei din tribuna primesc locurile eliberate
  phaseT = G.LOBBY_SECONDS; forceStart = false;
  computeFinish(); focusD = 0; camD = 0; idleD = 0; resetChunks(-12); lobbyDirty = true; rankAll();
}
function layoutLobby() {
  // in lobby se vad cei mai noi 24 la linia de start (roboti cu poza); restul sunt siluete in spatele lor
  lobbyDirty = false;
  const all = [...players.values()];
  lobbyList = all.slice(-RULES.MAX_VISIBLE);
  const old = all.length - lobbyList.length;
  for (let i = 0; i < old; i++) all[i].d = -40;
  lobbyList.forEach((p, k) => { const row = Math.floor(k / LOBBY_COLS), col = k % LOBBY_COLS; p.targetLane = Math.min(LANES - 1, Math.floor(col * LANES / LOBBY_COLS)); p.x = (col - (LOBBY_COLS - 1) / 2) * (ROAD_W / LOBBY_COLS) + (row % 2 ? 0.4 : -0.4); p.d = -1.5 - row * 1.8; p.y = 0; p.vo = 0; });
  lobbyPack = all.slice(Math.max(0, old - PACK_MAX), old);
  packTimer = 0;
}

// ================================================================ zi / noapte
let dayTimer = 0, dayK = -1, dayNames = '', dayRoute = 'none';
let forcedTime = params.get('time');
function localHour() { const f = forcedTime; if (f !== null) return Number(f) % 24; const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
function updateDayNight(dt) {
  dayTimer -= dt; if (dayTimer > 0 && dayState && dayRoute === routeEvent) return; dayTimer = 20; dayRoute = routeEvent; dayNames = ''; // recalculeaza la 20 s sau cand se schimba vremea
  const { a, b, k } = dayMix(localHour());
  if (dayNames === a + b && Math.abs(k - dayK) < 0.01) return;
  dayNames = a + b; dayK = k;
  const A = DAY[a], B = DAY[b], L = (x, y) => x + (y - x) * k;
  paintSky(A, B, k);
  stars.material.opacity = L(A.stars, B.stars);
  FOG = lerpHex(A.fog, B.fog, k); if (!levelEvent) scene.fog.color.copy(FOG);
  hemi.color.copy(lerpHex(A.hemi[0], B.hemi[0], k)); hemi.groundColor.copy(lerpHex(A.hemi[1], B.hemi[1], k)); hemi.intensity = L(A.hemi[2], B.hemi[2]);
  const wet = routeEvent === 'rain' ? 0.55 : 1;
  key.color.copy(lerpHex(A.key[0], B.key[0], k)); key.intensity = L(A.key[1], B.key[1]) * wet;
  if (routeEvent === 'rain') { FOG = FOG.clone().lerp(new THREE.Color(0x6b7a8f), 0.6); if (!levelEvent) scene.fog.color.copy(FOG); }
  rim.color.copy(lerpHex(A.rim[0], B.rim[0], k)); rim.intensity = L(A.rim[1], B.rim[1]);
  renderer.toneMappingExposure = L(A.exposure, B.exposure);
  const lights = L(A.lights, B.lights);
  lampHead.emissiveIntensity = 0.3 + 1.6 * lights; beamMat.opacity = lights; beamMat.visible = lights > 0.02;
  for (const m of dayMats.windows) m.emissiveIntensity = L(A.windows, B.windows);
  sunSprite.material.color.setRGB(L(A.sunCol[0], B.sunCol[0]) / 255, L(A.sunCol[1], B.sunCol[1]) / 255, L(A.sunCol[2], B.sunCol[2]) / 255);
  sunSprite.material.opacity = L(A.sunY, B.sunY) < 0 ? 0 : 1;
  skylines[0].material.opacity = lights; skylines[1].material.opacity = 1;
  dayState = { sunY: L(A.sunY, B.sunY), lights };
}

// ================================================================ bucla principala
let last = performance.now(), rankTimer = 0, hudTimer = 0;
let fpsFrames = 0, fpsT = 0, fpsLow = 0, fpsHigh = 0, fpsNow = 60, workMs = 0, workSum = 0;
function setQuality(level) {
  Q.level = clamp(level, 0, 4);
  renderer.setPixelRatio(Q.level >= 1 || LOWFX ? 1 : Math.min(devicePixelRatio, 1.5)); resize();
  Q.bloom = BLOOM && Q.level < 2;
  Q.shadows = !LOWFX && Q.level < 3; renderer.shadowMap.enabled = Q.shadows; key.castShadow = Q.shadows;
  Q.maxVisible = Q.level >= 4 ? Math.min(12, RULES.MAX_VISIBLE) : Q.level >= 3 ? Math.min(18, RULES.MAX_VISIBLE) : RULES.MAX_VISIBLE;
  Q.maxFloats = Q.level >= 3 ? 5 : 10;
  Q.packVisible = Q.level >= 4 ? PACK_MAX >> 2 : Q.level >= 3 ? PACK_MAX >> 1 : PACK_MAX;
  for (const v of views) v.shadowOn = null;
  console.log('[calitate]', Q.level, 'fps', fpsNow);
}
if (Q.fixed) setTimeout(() => setQuality(+params.get('quality')), 0);
function trackFps(realDt) {
  fpsFrames++; fpsT += realDt;
  if (fpsT < 2) return;
  fpsNow = Math.round(fpsFrames / fpsT); workMs = workSum / fpsFrames; fpsFrames = 0; fpsT = 0; workSum = 0;
  if (Q.fixed || document.hidden) return;
  // FPS mic dar fiecare cadru se calculeaza repede (< 12 ms) = limita vine din afara (ex: LIVE Studio la 30 FPS), nu din placa video: calitatea ramane
  if (LIVE_SRC && fpsNow < 40 && workMs < 12) { fpsLow = 0; fpsHigh = 0; }
  else if (fpsNow < 40) { fpsHigh = 0; if (++fpsLow >= 2 && Q.level < 4) { fpsLow = 0; setQuality(Q.level + 1); } }
  else if (fpsNow >= 58) { fpsLow = 0; if (++fpsHigh >= 15 && Q.level > 0) { fpsHigh = 0; setQuality(Q.level - 1); } }
  else { fpsLow = 0; fpsHigh = 0; }
}
const TS = Number(params.get('ts')) || 1; // doar pentru teste
const camPos = new THREE.Vector3(0, 8.5, 12), camLook = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const w0 = performance.now(); try { frameBody(now); } finally { workSum += performance.now() - w0; }
}
function frameBody(now) {
  if (standby) { last = now; return; }
  trackFps(Math.min(0.25, (now - last) / 1000));
  const dt = paused ? 0 : Math.min(0.05, (now - last) / 1000) * TS; last = now; time += dt;
  $('#pauseInfo').style.display = paused ? '' : 'none';
  simulate(dt);
  render(dt);
}
// ---- LOGICA jocului (fara desen): lobby -> cursa -> podium. Separata de desen, ca sa poata fi testata rapid si cu 10.000 de jucatori.
function simulate(dt) {
  if (phase === 'lobby') {
    if (lobbyDirty) layoutLobby();
    // numaratoarea merge doar cand jocul are destui oameni (fiecare joc are regula lui: GAME.need)
    if (GAME.need(api) <= 0 || forceStart) phaseT -= dt; else phaseT = Math.max(phaseT, Math.min(G.LOBBY_SECONDS, 8));
    if (phaseT <= 0) { forceStart = false; startRace(); }
  }
  else if (phase === 'race') {
    phaseT -= dt; elapsed += dt;
    const decay = Math.pow(0.5, dt / F.HALF_LIFE); // energia scade la fel pentru toti
    idleFocus *= decay; idleD += MX.avgSpeed(RULES, idleFocus, OBST_PER_M) * dt * (1 + COINS_PER_M * RULES.COIN_METERS);
    for (const p of players.values()) updateRunner(p, dt, !!p.view, decay);
    settleCrossers();
    if (levelEvent) {
      levelEvent.t -= dt;
      if (levelEvent.type === 'storm') shake = Math.max(shake, 0.14);
      if (levelEvent.type === 'meteor' && Math.random() < dt * 3) meteorStrike(laneX((Math.random() * LANES) | 0), -(focusD + rand(8, 30)));
      if (levelEvent.t <= 0) endLevelEvent();
    }
    if (GAME.tick) GAME.tick(api, dt); // pasii proprii jocului (ex: taierile din Eliminare)
    if (!sprintAnnounced && sprintOn() && unfinished.length) { sprintAnnounced = true; banner(ranked[0], '', t('sprint')); shake = Math.max(shake, 0.3); snd.sprint(); }
    checkLeadChange();
    if (endTimer > 0) { endTimer -= dt; if (endTimer <= 0) phaseT = 0; }
    if (phaseT <= 0) endRace();
  } else if (phase === 'podium') {
    phaseT -= dt; $('#podNext').textContent = t('nextRace', { s: Math.ceil(phaseT) });
    updateConfetti(dt); podRing1.rotation.z += dt * 0.5; podRing2.rotation.z -= dt * 0.7;
    if (phaseT <= 0) newRound();
  }
  if (phase !== 'podium') { rankTimer -= dt; if (rankTimer <= 0) { rankTimer = players.size > 3000 ? 0.5 : 0.25; rankAll(); if (phase === 'race') checkOvertakes(); if (unfinished.length) pruneSegs(Math.min(camD, unfinished[unfinished.length - 1].d)); } }
  if (leadChangeCD > 0) leadChangeCD -= dt;
  if (overtakeCD > 0) overtakeCD -= dt;
}
// ---- DESENUL: camera, lumea care urmareste camera, roboti, HUD
function render(dt) {
  applyViewShift(dt);
  // ---- camera
  let fovT = 64, speedFx = 0;
  if (phase === 'podium') {
    const a = Math.sin(time * 0.35) * 0.45;
    camPos.set(Math.sin(a) * 14, 5.5, -podiumD - Math.cos(a) * 14); camLook.set(0, 1.0, -podiumD);
    camera.position.lerp(camPos, Math.min(1, dt * 3)); camera.lookAt(camLook);
    focusD = podiumD - 12; camD = focusD - 12;
  } else {
    let target = -6, tp = null, M = CAM_MODES.leader;
    if (phase === 'race') {
      tickGiftCam(dt);
      cam.t -= dt; if (cam.mode !== 'fly' && (cam.t <= 0 || (cam.target && (!players.has(cam.target.id) || cam.target.finished && cam.mode === 'focus' && cam.t < 2)))) nextCamMode();
      M = CAM_MODES[cam.mode];
      const field = unfinished.length ? unfinished : ranked;
      const directed = GAME.camera ? GAME.camera(api) : null; // un joc poate cere camera (ex: duelul final din Challenge)
      if (directed) { cam.mode = 'focus'; cam.forced = true; cam.target = directed; cam.t = 99; M = CAM_MODES.focus; }
      if ((cam.mode === 'focus' || cam.mode === 'fly') && cam.target) tp = cam.target;
      else if (cam.mode === 'leader') tp = field[0];
      else if (cam.mode === 'crowd' && field.length) tp = field[field.length >> 1];
      else if (field.length) tp = field[Math.min(field.length - 1, Math.floor(Math.min(12, field.length) / 2))];
      if (tp) target = tp.d - (cam.mode === 'pack' || cam.mode === 'crowd' ? 8 : 1);
    } else M = { h: 8.5, back: 12, ahead: 22 };
    cam.h += (M.h - cam.h) * Math.min(1, dt * 1.8); cam.back += (M.back - cam.back) * Math.min(1, dt * 1.8); cam.ahead += (M.ahead - cam.ahead) * Math.min(1, dt * 1.8);
    if (tp) focusD += tp.speed * dt;
    if (phase === 'race' && Math.abs(target - focusD) > 90) { focusD = target; camCut(); } // prea departe: taietura de montaj, nu zbor peste traseu
    else focusD += (target - focusD) * Math.min(1, dt * 2.5);
    camD = focusD - cam.back;
    if (tp) { speedFx = clamp((tp.speed - 14) / 25, 0, 1); fovT = 64 + speedFx * 12; }
    shake = Math.max(0, shake - dt * 0.8);
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    // prim-plan pe racheta: camera centrata exact pe cel care zboara si ridicata odata cu el
    const fly = cam.mode === 'fly' && tp;
    camFlyX += ((fly ? tp.x : cam.mode === 'focus' && tp ? tp.x * 0.6 : Math.sin(time * 0.5) * 0.3) - camFlyX) * Math.min(1, dt * 4);
    camFlyY += ((fly ? tp.y * 0.75 : 0) - camFlyY) * Math.min(1, dt * 3);
    const cx = camFlyX;
    camera.position.set(sx + cx, cam.h + camFlyY + sy, -camD);
    camera.lookAt(fly ? cx : cx * 0.8, 0.6 + camFlyY, -(focusD + cam.ahead));
  }
  camera.fov += (fovT - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();

  // ---- lume care urmareste camera
  const cz = camera.position.z;
  key.position.set(14, 32, cz + 18); key.target.position.set(0, 0, cz - 26);
  rim.position.set(-10, 12, cz - 60); rim.target.position.set(0, 0, cz - 20);
  updateDayNight(dt); sunSprite.position.set(-40, dayState ? dayState.sunY : 26, cz - 420);
  for (const sk of skylines) sk.position.set(camera.position.x, 38, cz);
  road.position.z = cz - ROAD_LEN / 2 + 30; roadTex.offset.y = ((-road.position.z / TILE) % 1 + 1) % 1;
  oppRoad.position.z = road.position.z; oppTex.offset.y = roadTex.offset.y;
  ground.position.z = cz - 300; groundTex.offset.y = ((-ground.position.z / 20) % 1 + 1) % 1;
  walks.forEach(w => w.position.z = road.position.z); walkTex.offset.y = ((-road.position.z / 8) % 1 + 1) % 1;
  for (const f of followers) f.position.z = road.position.z;
  for (const c of chunks) if (c.k * CHUNK < camD - CHUNK - 5) { c.k += NCH; dressChunk(c); }
  const minK = Math.min(...chunks.map(c => c.k));
  if (camD < minK * CHUNK - 10 || camD > (minK + NCH) * CHUNK) resetChunks(camD);
  updateObstacleMeshes(camD); updateCoins(camD);
  for (const tc of traffic) { tc.position.z += tc.userData.v * dt; if (tc.position.z > cz + 15 || tc.position.z < cz - 330) { tc.position.z = cz - rand(220, 320); tc.userData.v = rand(26, 38); } }
  hazardMat.emissiveIntensity = Math.sin(time * 9) > 0 ? 4 : 0.1;
  blinkAmber.emissiveIntensity = Math.sin(time * 7) > 0 ? 4 : 0.2;
  blinkRed.emissiveIntensity = Math.sin(time * 2.5) > 0.3 ? 1.5 : 0.1;

  visTimer -= dt; if (visTimer <= 0) { visTimer = 0.2; updateVisibility(); }
  updatePack(dt); updateDangerLine(dt);
  for (const v of views) animateView(v, dt);
  updateFx(dt); updateRain(dt);
  updateSpeedLines(dt, phase === 'race' ? speedFx : 0);
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('#banner').classList.remove('show'); }
  hudTimer -= dt; if (hudTimer <= 0) { hudTimer = 0.2; updateHud(); updateFanWall(); updateMap(); }
  const lead = unfinished[0] || ranked[0];
  snd.setEngine(lead ? clamp((lead.speed - 4) / 30, 0, 1) : 0, phase === 'race' && !paused);
  if (!Q.bloom) renderer.render(scene, camera); else composer.render();
}

// ================================================================ conexiune server
let ws = null;
// doar o fereastra de joc activa: cea mai noua o preia, celelalte trec in asteptare
// cere sa fie fereastra activa; serverul raspunde cu 'active' (cine a castigat). force = click pe ecranul "Fereastra inactiva"
function claimWindow(force) { if (SPECTATOR || !ws || ws.readyState !== 1) return; ws.send(JSON.stringify({ type: 'claim', id: WIN_ID, live: LIVE_SRC, force: !!force })); }
function setStandby(on) {
  standby = on;
  let o = $('#standby');
  if (!o) { o = document.createElement('div'); o.id = 'standby'; o.style.cssText = 'position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;text-align:center;background:rgba(5,3,15,.93);color:#fff;font:900 22px Nunito,sans-serif;padding:30px;cursor:pointer'; o.innerHTML = '⏸ Fereastră inactivă<br><small style="font-size:15px;opacity:.75">Jocul rulează în altă fereastră.<br>Click aici ca să-l muți în aceasta.</small>'; o.onclick = claimWindow; document.body.appendChild(o); }
  o.style.display = on ? 'flex' : 'none';
  if (on) snd.setEngine(0, false);
}
function connectWS() {
  if (location.protocol === 'file:') { $('#status').textContent = 'START.bat'; return; }
  $('#lost').classList.remove('show');
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  // la reconectare, o fereastra in asteptare NU fura jocul; doar cea activa (sau una noua) il cere
  ws.onopen = () => { if (LIVE_KEY) ws.send(JSON.stringify({ type: 'auth', liveKey: LIVE_KEY })); if (!standby) claimWindow(); if (pendingRound && !standby) { ws.send(pendingRound); pendingRound = null; } };
  ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.type === 'active') { if (!SPECTATOR) setStandby(m.id !== WIN_ID); return; } if (m.type === 'release') { if (!SPECTATOR && standby) setTimeout(() => claimWindow(), 100 + Math.random() * 300); return; } if (m.type === 'claim') return; if (m.type === 'hello' || m.type === 'auth' || m.type === 'state') return; handleEvent(m); } catch (err) { console.error(err); } };
  ws.onclose = () => { $('#status').textContent = '⚠ server…'; $('#lost').classList.add('show'); setTimeout(connectWS, 2000); };
}
function send(event) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'sim', event })); else handleEvent(event); }

// ================================================================ comenzi de la panoul de control (pagina /panel.html, prin server)
const FAKE = ['alina.m18', 'valentin.catalin', 'roxy_2004', 'Mirela', 'gigel_drift', 'ionut.bmw', 'andreea.dance', 'Bogdan_RO', 'cristi.gamer', 'maria_ioana', 'darius.tt', 'elena.sky', 'vlad.turbo', 'ana.maria', 'costel_bv', 'denisa.xo', 'florin.cj', 'teo_gaming', 'larisa.m', 'sebi.drifter', 'oana.bianca', 'mihai.tm', 'raluca.is', 'nicu_2009'];
const GIFTS = { 1: 'Rose', 10: 'Heart', 100: 'Sports Car', 500: 'Lion' };
let fakeIdx = 0;
const fakeUser = fresh => { const n = fresh || !ranked.length ? FAKE[fakeIdx % FAKE.length] + (fakeIdx++ >= FAKE.length ? '_' + fakeIdx : '') : pick(ranked.slice(0, 60)).name; return { id: n, name: n, avatar: '' }; };
function gift(v) { send({ type: 'gift', user: fakeUser(!ranked.length), giftName: GIFTS[v] || 'Gift', coins: v, total: v, repeat: 1, final: true }); }
function control(action, extra = {}) { const m = { type: 'control', action, ...extra }; if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else handleControl(m); }

function handleControl(ev) {
  const a = ev.action;
  if (a === 'end' && phase === 'race') phaseT = 0;
  else if (a === 'start' && phase === 'lobby' && players.size) { forceStart = true; phaseT = 0; }
  else if (a === 'next' && phase !== 'lobby') phaseT = 0;
  else if (a === 'pause') paused = !!ev.on;
  else if (a === 'cmd' && ev.text) runCommand(ev.text);
  else if (a === 'time') { forcedTime = ev.value === '' || ev.value == null ? null : String(ev.value); dayTimer = 0; }
  else if (a === 'rules' && ev.rules) applyRules(ev.rules, true);
  else if (a === 'mute') snd.setMuted(!!ev.on);
}
// setari editabile din panou (salvate in browser)
// fiecare joc are setarile lui; cele comune sunt la final
const ruleOf = (blk, key, lo, hi, int) => [() => RULES[blk][key], v => { RULES[blk][key] = clamp(int ? Math.round(v) : v, lo, hi); }];
const RULE_MAP = {
  // 🏁 Clasic
  round:          ruleOf('CLASSIC', 'ROUND_SECONDS', 30, 1800),
  classicLobby:   ruleOf('CLASSIC', 'LOBBY_SECONDS', 5, 300),
  classicGoal:    ruleOf('CLASSIC', 'GOAL_TAPS_PER_SEC', 0.5, 30),
  // 🎟️ Challenge
  challengeRound: ruleOf('CHALLENGE', 'ROUND_SECONDS', 30, 1800),
  challengeLobby: ruleOf('CHALLENGE', 'LOBBY_SECONDS', 5, 300),
  challengeGoal:  ruleOf('CHALLENGE', 'GOAL_TAPS_PER_SEC', 0.5, 30),
  ticket:         ruleOf('CHALLENGE', 'TICKET_COINS', 1, 100000, true),
  challengeMax:   ruleOf('CHALLENGE', 'MAX_RACERS', 2, 500, true),
  // 🔴🔵 Echipe
  teamsRound:     ruleOf('TEAMS', 'ROUND_SECONDS', 30, 1800),
  teamsLobby:     ruleOf('TEAMS', 'LOBBY_SECONDS', 5, 300),
  teams:          [() => RULES.TEAMS.COUNT, v => { RULES.TEAMS.COUNT = clamp(Math.round(v), 2, 4); if (MODE === 'teams' && phase === 'lobby') { GAME.enter(api); applyMode(); } }],
  // 💀 Eliminare
  elimLobby:      ruleOf('ELIMINATION', 'LOBBY_SECONDS', 5, 300),
  elimFirst:      ruleOf('ELIMINATION', 'FIRST_AT', 10, 600),
  elimEvery:      ruleOf('ELIMINATION', 'EVERY', 10, 300),
  elimFinal:      ruleOf('ELIMINATION', 'FINAL_SECONDS', 0, 300),
  elimFinalists:  ruleOf('ELIMINATION', 'FINALISTS', 1, 10, true),
  elimRevive:     ruleOf('ELIMINATION', 'REVIVE_COINS', 1, 100000, true),
  // comune
  maxRacers:      [() => RULES.CLASSIC.MAX_RACERS, v => { v = clamp(Math.round(v), 10, 50000); RULES.CLASSIC.MAX_RACERS = RULES.TEAMS.MAX_RACERS = RULES.ELIMINATION.MAX_RACERS = v; }],
  tapCost:        [() => RULES.TAP_COST_START, v => setCommonRule('TAP_COST_START', clamp(Math.round(v), 1, 50))],
  focusHalf:      [() => RULES.FOCUS.HALF_LIFE, v => setCommonRule('FOCUS.HALF_LIFE', clamp(v, 2, 120))],
  volume:         [() => snd.vol, v => { snd.vol = clamp(v, 0, 1); if (!snd.muted) snd.setMuted(false); }],
};
// valorile din rules.js, tinute minte INAINTE de a aplica ce e salvat in browser
const RULE_DEFAULTS = Object.fromEntries(Object.keys(RULE_MAP).map(k => [k, RULE_MAP[k][0]()]));
function applyRules(obj, save) {
  for (const k in obj) if (RULE_MAP[k] && Number.isFinite(+obj[k])) RULE_MAP[k][1](+obj[k]);
  // se salveaza DOAR setarile schimbate de tine. Inainte se salvau toate, asa ca o singura modificare din panou (ex. volumul)
  // "ingheta" si durata rundelor in browser, iar valorile noi din rules.js nu mai ajungeau niciodata in joc.
  if (save) try { localStorage.setItem('turbo-rules', JSON.stringify({ _v: 2, ...Object.fromEntries(Object.keys(RULE_MAP).map(k => [k, RULE_MAP[k][0]()]).filter(([k, v]) => v !== RULE_DEFAULTS[k])) })); } catch {}
  if (phase === 'lobby') { computeFinish(); phaseT = Math.min(phaseT, G.LOBBY_SECONDS); } // in lobby se vede imediat (durata, lungimea traseului)
  showTip();
}
try {
  const saved = JSON.parse(localStorage.getItem('turbo-rules') || 'null');
  if (saved) {
    // salvare veche (fara versiune): continea TOATE valorile de atunci. Cele egale cu vechile valori implicite nu au fost alese de tine => se iau cele noi.
    if (!saved._v) { const OLD = { round: 300, challengeRound: 180, challengeLobby: 25, teamsRound: 240, teamsLobby: 25, elimFirst: 45, elimEvery: 30 }; for (const k in OLD) if (+saved[k] === OLD[k]) delete saved[k]; }
    applyRules(saved, false);
  }
} catch {}
// starea jocului, trimisa panoului
setInterval(() => {
  if (!ws || ws.readyState !== 1 || SPECTATOR || standby) return;
  ws.send(JSON.stringify({ type: 'state', state: {
    id: WIN_ID, ver: 4,
    need: Math.max(0, GAME.need(api)),
    mode: MODE, pendingMode, locked: modeLocked, liveName, phase, phaseT: Math.round(phaseT), roundT: Math.round(roundT), round, players: players.size, crowd: waitingN, viewers: viewers.size, bibSeq: GAMES.challenge.state.bibSeq, paused, lang: LANG, muted: snd.muted,
    fps: fpsNow, quality: Q.level, time: forcedTime, live: $('#status').textContent, names: ranked.slice(0, 60).map(p => p.name), finish: GAME.hasFinish ? FINISH : 0,
    top: ranked.slice(0, 5).map(p => ({ name: GAME.nameTag(p) + p.name, d: Math.round(p.d), fin: p.finished, out: p.out })),
    rules: Object.fromEntries(Object.keys(RULE_MAP).map(k => [k, RULE_MAP[k][0]()])),
  } }));
}, 700);
// doar pentru teste automate (nu apare pe ecran)
let autoOn = params.has('auto');
// cum intra un om de test in jocul curent (chat, culoarea echipei sau bilet)
const joinEvent = u => GAME.simJoin ? GAME.simJoin(api, u) : { type: 'chat', user: u, text: GAME.simText ? GAME.simText() : 'hai!' };
const simActions = {
  join5() { for (let i = 0; i < 5; i++) send(joinEvent(fakeUser(true))); },
  join500() { simActions.joinN(500); },
  joinN(n) { for (let i = 0; i < n; i++) handleEvent(joinEvent(fakeUser(true))); },
  ticket() { const C = RULES.CHALLENGE.TICKET_COINS; send({ type: 'gift', user: fakeUser(true), giftName: 'Rose', coins: C, total: C, repeat: C, final: true }); },
  fan() { const u = fakeUser(true); const b = 1 + ((Math.random() * Math.max(1, GAMES.challenge.state.bibSeq)) | 0); send({ type: 'chat', user: u, text: '#' + b }); for (let i = 0; i < 3; i++) send({ type: 'like', user: u, count: 15 }); },
  red() { send({ type: 'chat', user: fakeUser(true), text: 'rosu' }); }, blue() { send({ type: 'chat', user: fakeUser(true), text: 'albastru' }); },
  chat() { send({ type: 'chat', user: fakeUser(Math.random() < 0.5), text: 'go' }); }, tap() { send({ type: 'like', user: fakeUser(false), count: 15 }); },
  g1() { gift(1); }, g10() { gift(10); }, g100() { gift(100); }, g500() { gift(500); },
};
setInterval(() => {
  if (!autoOn || paused) return;
  const r = Math.random();
  if (MODE === 'challenge' && players.size < 10 && r < 0.12) simActions.ticket();
  else if (MODE === 'challenge' && r < 0.3) simActions.fan();
  else if (players.size < 30 && r < 0.2) MODE === 'teams' ? pick([simActions.red, simActions.blue])() : simActions.chat();
  else if (r < 0.9) send({ type: 'like', user: fakeUser(false), count: 1 + ((Math.random() * 12) | 0) });
  else if (r < 0.98) gift(Math.random() < 0.75 ? 1 : 10);
  else gift(Math.random() < 0.8 ? 100 : 500);
}, 400);
addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') { snd.setMuted(!snd.muted); $('#ticker').innerHTML = `<span class="t">${t(snd.muted ? 'mute' : 'unmute')}</span>`; } if (e.key === 'p' || e.key === 'P') control('pause', { on: !paused }); });
// sunetul porneste la primul click/tasta (regula browserului)
function armSound() { if (!SOUND_ON) return; snd.init(); snd.resume(); setTimeout(() => $('#sndHint').classList.toggle('show', !snd.active && !LIVE_SRC), 300); }
if (SOUND_ON) { for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, armSound); setTimeout(() => { snd.init(); snd.resume(); setTimeout(() => $('#sndHint').classList.toggle('show', !snd.active && !LIVE_SRC), 500); }, 800); }

// ================================================================ start
(async () => {
  resize();
  try { await Promise.race([Promise.all([document.fonts.load(`40px "Lilita One"`), document.fonts.load(`900 20px Nunito`), document.fonts.load(`40px "Lilita One"`, 'ĂȘȚ')]), new Promise(r => setTimeout(r, 2500))]); } catch {}
  await loadRobot(); buildRobotPack();
  applyLanguage(); if (GAME.enter) GAME.enter(api); applyMode();
  computeFinish(); phaseT = G.LOBBY_SECONDS; resetChunks(-12);
  connectWS();
  $('#loading').classList.add('hide');
  requestAnimationFrame(frame);
})();

// ================================================================ KIT DE ASSET-URI (folosit doar pentru export: window.__kitRun())
window.__kitRun = async () => {
  const W = 320, H = 320;
  const kr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  kr.setPixelRatio(1); kr.setSize(W, H); kr.setClearColor(0x000000, 0);
  kr.toneMapping = THREE.ACESFilmicToneMapping; kr.toneMappingExposure = 1.15;
  const ks = new THREE.Scene();
  ks.add(new THREE.HemisphereLight(0xffffff, 0x6b5a8a, 1.6));
  const kl = new THREE.DirectionalLight(0xffffff, 2.4); kl.position.set(4, 8, 6); ks.add(kl);
  const kl2 = new THREE.DirectionalLight(0xff8ad0, 0.8); kl2.position.set(-6, 3, -4); ks.add(kl2);
  const kc = new THREE.PerspectiveCamera(28, 1, 0.1, 500);
  const out = [];
  const shot = (obj, name, cat, { w = W, h = H, dir = [0.55, 0.38, 1], pad = 1.12, meta = {} } = {}) => {
    kr.setSize(w, h); kc.aspect = w / h; kc.updateProjectionMatrix();
    ks.add(obj); obj.updateMatrixWorld(true);
    // incadrare doar pe piesele vizibile si solide (fara efecte transparente: scut, dara, fascicule, flacari)
    const b = new THREE.Box3(), tmp = new THREE.Box3();
    obj.traverseVisible(o => { if (!o.isMesh || o.isInstancedMesh) return; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && m.transparent && m.blending === THREE.AdditiveBlending) return; if (o.isSkinnedMesh) { o.computeBoundingBox?.(); } tmp.setFromObject(o, true); b.union(tmp); });
    if (b.isEmpty()) b.setFromObject(obj);
    const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
    const r = Math.max(sz.y, sz.x / kc.aspect, sz.z * 0.7) * 0.5 * pad;
    const dist = r / Math.tan(THREE.MathUtils.degToRad(kc.fov / 2));
    const d = new THREE.Vector3(...dir).normalize();
    kc.position.copy(c).addScaledVector(d, dist + sz.z * 0.3); kc.lookAt(c);
    kr.render(ks, kc);
    out.push({ name, cat, w, h, data: kr.domElement.toDataURL('image/png'), ...meta });
    ks.remove(obj);
  };
  const canvasOut = (cv, name, cat, meta = {}) => out.push({ name, cat, w: cv.width, h: cv.height, data: cv.toDataURL('image/png'), ...meta });
  const prevPhase = phase; phase = 'race';
  const mkPlayer = (name, main, accent = 0x2a2f3a, extra = {}) => ({ id: name, name, look: { main, accent }, rank: 99, img: null, avatarUrl: '', pu: { shoes: 0, shield: 0 }, stumble: 0, jumpT: 0, slideT: 0, rocketBank: 0, tapBank: 0, streak: 0, lastTapAt: 0, d: 0, x: 0, y: 0, speed: 8, yaw: Math.PI, phase: 0, focus: 1, ...extra });
  const pose = (v, clip, t) => {
    if (!v.actions) return;
    for (const n in v.actions) v.actions[n].stop();
    const a = v.actions[clip]; a.reset(); a.play(); a.setEffectiveWeight(1); a.paused = false; a.time = t; v.mixer.update(0); a.paused = true;
  };
  const robot = (p, clip, t, setup) => {
    const v = makeView(); scene.remove(v.root); v.player = p;
    v.mats.main.color.setHex(p.look.main); if (v.mats.main.emissive) { v.mats.main.emissive.setHex(p.look.main); v.mats.main.emissiveIntensity = 0.12; }
    v.mats.grey.color.setHex(p.look.accent);
    applySkin(v, p);
    v.jet.visible = false; v.shield.visible = false; v.rings.forEach(r => r.visible = false); v.trail.visible = false; v.stars.visible = false; v.badge.visible = false;
    v.root.rotation.y = Math.PI; v.body.rotation.set(0, 0, 0); v.body.position.set(0, 0, 0);
    pose(v, clip, t);
    if (setup) setup(v);
    return v;
  };
  // ---- personaje: poze
  const POSES = [['idle', 'Idle', 0.5], ['run-1', 'Running', 0.1], ['run-2', 'Running', 0.35], ['walk-tired', 'Walking', 0.3], ['jump', 'Jump', 0.32], ['dance', 'Dance', 0.6], ['wave', 'Wave', 0.6], ['thumbs-up', 'ThumbsUp', 0.8], ['yes', 'Yes', 0.4], ['stumble', 'No', 0.5], ['death', 'Death', 1.2], ['sitting', 'Sitting', 1.0]];
  for (const [n, clip, tt] of POSES) { const v = robot(mkPlayer('robot', 0xff3b5c), clip, tt, n === 'stumble' ? vv => { vv.stars.visible = true; vv.body.rotation.z = 0.3; } : null); shot(v.root, n, 'poses', { w: 240, h: 320, dir: n.startsWith('run') || n === 'walk-tired' ? [0.9, 0.3, 0.6] : [0.3, 0.25, 1] }); }
  // poze speciale
  { const v = robot(mkPlayer('robot', 0xff3b5c), 'Jump', 0.32, vv => { vv.jet.visible = true; vv.flames.forEach(f => f.scale.set(0.12, 0.7, 0.12)); vv.body.rotation.x = -1.25; vv.body.position.set(0, 0.5, 0.9); }); v.root.rotation.y = Math.PI * 0.7; shot(v.root, 'fly-jetpack', 'poses', { w: 240, h: 320, dir: [1, 0.4, 0.3] }); }
  { const v = robot(mkPlayer('robot', 0xff3b5c), 'Running', 0.2, vv => { vv.body.rotation.x = 1.15; vv.body.position.set(0, 0.15, -0.2); }); v.root.rotation.y = Math.PI * 0.7; shot(v.root, 'slide', 'poses', { w: 240, h: 320, dir: [1, 0.4, 0.3] }); }
  { const v = robot(mkPlayer('robot', 0xff3b5c), 'Running', 0.1, vv => { vv.shield.visible = true; vv.shield.material = new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.22, depthWrite: false }); }); shot(v.root, 'shield', 'poses', { w: 240, h: 320, dir: [0.4, 0.3, 1] }); }
  { const v = robot(mkPlayer('robot', 0xff3b5c), 'Running', 0.1, vv => { vv.rings.forEach(r => { r.visible = true; r.material = ringMat; }); }); v.root.rotation.y = Math.PI * 0.8; shot(v.root, 'turbo-tap', 'poses', { w: 240, h: 320, dir: [0.8, 0.5, 0.6] }); }
  { const v = robot(mkPlayer('robot', 0xff3b5c), 'Running', 0.1, vv => { vv.rings.forEach(r => { r.visible = true; r.material = fireRingMat; }); }); v.root.rotation.y = Math.PI * 0.8; shot(v.root, 'streak-fire', 'poses', { w: 240, h: 320, dir: [0.8, 0.5, 0.6] }); }
  // ---- personaje: culori, echipe, skin-uri
  COLORS.forEach((c, i) => { const v = robot(mkPlayer('robot', c, ACCENTS[i % ACCENTS.length]), 'Idle', 0.5); shot(v.root, 'color-' + c.toString(16).padStart(6, '0'), 'colors', { w: 200, h: 280, dir: [0.3, 0.2, 1], meta: { hex: '#' + c.toString(16).padStart(6, '0') } }); });
  TEAM_COLORS.forEach((c, i) => { const v = robot(mkPlayer('robot', c, 0xf2f2f2), 'Wave', 0.5); shot(v.root, 'team-' + ['red', 'blue', 'green', 'yellow'][i], 'teams', { w: 200, h: 280, dir: [0.3, 0.2, 1], meta: { hex: TEAM_CSS[i] } }); });
  for (const [skin, clip, tt] of [['gold', 'Dance', 0.6], ['flame', 'Running', 0.15], ['crown', 'ThumbsUp', 0.8]]) {
    const v = robot(mkPlayer('robot', 0x2ec4ff, 0x2a2f3a, { skin }), clip, tt, skin === 'flame' ? vv => { vv.rings.forEach(r => { r.visible = true; r.material = fireRingMat; }); } : null);
    shot(v.root, 'skin-' + skin, 'skins', { w: 240, h: 320, dir: [0.35, 0.25, 1] });
  }
  // ---- insigne (avatar + nume deasupra robotului)
  const badge = async (p) => { const v = makeView(); scene.remove(v.root); v.player = p; const img = avatarImg(p); if (!img.complete) await new Promise(r => { img.onload = r; img.onerror = r; }); v.badgeKey = ''; drawBadge(v); return v.badgeCanvas; };
  for (const [n, rank, col, bib] of [['badge-rank-1', 1, 0xff3b5c], ['badge-rank-2', 2, 0x2ec4ff], ['badge-rank-3', 3, 0x7cff6b], ['badge-normal', 99, 0xb46bff], ['badge-challenge-bib', 99, 0xff8a3d, 7], ['badge-team-red', 99, 0xff3047], ['badge-team-blue', 99, 0x2e7bff]]) {
    canvasOut(await badge(mkPlayer(n.includes('bib') ? 'Mirela' : n.includes('team') ? 'Bogdan_RO' : rank <= 3 ? ['alina.m18', 'gigel_drift', 'roxy_2004'][rank - 1] : 'vlad.turbo', col, 0x2a2f3a, { rank, bib })), n, 'badges');
  }
  // ---- obstacole + obiecte
  for (const n of ['jump', 'cones', 'slide', 'wall']) shot(builders[n](), 'obstacle-' + n, 'obstacles', { dir: [0.6, 0.4, 1] });
  CAR_COLORS.forEach((c, i) => { const car = buildCar(false); car.userData.body.material = carMats[i]; car.userData.cab.material = carMats[i]; shot(car, 'car-broken-' + c.toString(16).padStart(6, '0'), 'cars', { w: 280, h: 220, dir: [0.9, 0.5, 0.7], meta: { hex: '#' + c.toString(16).padStart(6, '0') } }); });
  { const car = buildCar(true); car.userData.body.material = carMats[1]; car.userData.cab.material = carMats[1]; car.rotation.y = Math.PI; shot(car, 'car-traffic', 'cars', { w: 280, h: 220, dir: [0.9, 0.5, -0.7] }); }
  { const cm = new THREE.Mesh(coinGeo, coins.material); cm.rotation.y = 0.7; shot(cm, 'coin', 'items', { w: 160, h: 160, dir: [0.2, 0.25, 1] }); }
  { const m = new THREE.Mesh(meteorGeo, meteorMat); const tr = new THREE.Mesh(cone, flameMat); tr.scale.set(0.7, 4, 0.7); tr.position.y = 2; m.add(tr); m.rotation.z = -0.6; shot(m, 'meteor', 'items', { w: 200, h: 280 }); }
  { const g = new THREE.Group(); for (let i = 0; i < 5; i++) addMesh(g, cone, mat(0xffd23f, { metalness: 1, roughness: 0.2 }), Math.cos(i * 1.257) * 0.17, 0.12, Math.sin(i * 1.257) * 0.17, 0.05, 0.12, 0.05, false); addMesh(g, new THREE.CylinderGeometry(0.2, 0.17, 0.14, 8), mat(0xffd23f, { metalness: 1, roughness: 0.2, emissive: 0x7a5000 }), 0, 0, 0); shot(g, 'crown', 'items', { w: 160, h: 160, dir: [0.1, 0.35, 1] }); }
  // ---- decor
  const c0 = chunks[0];
  const cl = o => { const x = o.clone(true); x.position.set(0, 0, 0); x.rotation.set(0, 0, 0); x.traverse(k => k.visible = true); return x; };
  shot(cl(c0.trees[0].t), 'tree', 'scenery', { w: 200, h: 280 });
  { const g = new THREE.Group(); lamp(g, 0, [1, -1]); shot(g, 'street-lamp', 'scenery', { w: 240, h: 320, dir: [0.2, 0.2, 1] }); }
  { const bb = cl(c0.bb); bb.children.forEach(k => { if (k.geometry && k.geometry.type === 'PlaneGeometry') k.material = billboardMats[1]; }); shot(bb, 'billboard', 'scenery', { w: 320, h: 260, dir: [0.1, 0.1, 1] }); }
  { const g = cl(c0.gantry); g.children.forEach(k => { if (k.geometry && k.geometry.type === 'PlaneGeometry') k.material = distSign(1200); }); shot(g, 'distance-gantry', 'scenery', { w: 320, h: 300, dir: [0.1, 0.15, 1] }); }
  shot(cl(c0.bridge), 'bridge', 'scenery', { w: 480, h: 200, dir: [0.35, 0.3, 1], pad: 1.0 });
  shot(cl(c0.tunnel), 'tunnel', 'scenery', { w: 320, h: 260, dir: [0.7, 0.45, 1] });
  { const b = new THREE.Mesh(box, allBuildings[4]); b.scale.set(10, 13.2, 9.2); b.position.y = 6.6; const g = new THREE.Group(); g.add(b); const rf = new THREE.Mesh(box, parapetMat); rf.scale.set(10.3, 0.5, 9.5); rf.position.y = 13.45; g.add(rf); shot(g, 'building', 'scenery', { w: 200, h: 320, dir: [0.6, 0.2, 1] }); }
  shot(cl(startGate), 'gate-start', 'scenery', { w: 360, h: 300, dir: [0.15, 0.2, 1] });
  shot(cl(finishGate), 'gate-finish', 'scenery', { w: 360, h: 300, dir: [0.15, 0.2, 1] });
  { const pd = podium.clone(true); pd.position.set(0, 0, 0); pd.visible = true; pd.traverse(k => { k.visible = !(k.isInstancedMesh); }); shot(pd, 'podium', 'winners', { w: 480, h: 300, dir: [0, 0.35, 1], pad: 0.8 }); }
  // ---- podium cu castigatori
  { const g = new THREE.Group(); const pd = podium.clone(true); pd.visible = true; pd.traverse(k => { k.visible = !(k.isInstancedMesh); }); g.add(pd);
    [[0xffc23d, 'gold', 'Dance', 0.6, 0, 1.9], [0x2ec4ff, null, 'Wave', 0.6, -2.5, 1.4], [0x7cff6b, null, 'ThumbsUp', 0.8, 2.5, 1.05]].forEach(([c, skin, clip, tt, x, y]) => { const v = robot(mkPlayer('w', c, 0x2a2f3a, { skin }), clip, tt); v.root.position.set(x, y, 0); g.add(v.root); });
    shot(g, 'podium-winners', 'winners', { w: 560, h: 400, dir: [0, 0.22, 1], pad: 0.62 }); }
  // ---- texturi
  const tex = (t, n) => canvasOut(t.image, n, 'textures');
  tex(roadTex, 'road'); tex(oppTex, 'road-opposite'); tex(walkTex, 'sidewalk'); tex(groundTex, 'grass'); tex(checker, 'checker-line'); tex(redStripe, 'stripes-red'); tex(yelStripe, 'stripes-yellow');
  buildingMats.forEach((m, i) => tex(m.map, 'windows-' + (i + 1)));
  tex(skylines[0].material.map, 'skyline-night'); tex(skylines[1].material.map, 'skyline-day');
  billboardMats.forEach((m, i) => tex(m.map, 'billboard-' + (i + 1)));
  tex(startGate.userData.sign.material.map, 'sign-start'); tex(finishGate.userData.sign.material.map, 'sign-finish'); tex(distSign(800).map, 'sign-distance');
  // ---- texte plutitoare
  for (const [txt, col] of [['+3 m', '#ffe14d'], ['🚀 +156 m', '#ffb020'], ['👟 +3 m', '#7cff6b'], ['🛡️ SCUT!', '#38e1ff'], ['🔥 SERIE x10!', '#ff8a1f'], ['👑 #1', '#ffd23f'], ['📣 8 fani', '#7cff6b'], ['⚔️ +1', '#ff8a1f']]) {
    const c = Object.assign(document.createElement('canvas'), { width: 320, height: 96 }); const g = c.getContext('2d');
    g.font = `60px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(20,8,40,.9)'; g.strokeText(txt, 160, 52, 300); g.fillStyle = col; g.fillText(txt, 160, 52, 300);
    canvasOut(c, 'float-' + txt.replace(/[^\p{L}\p{N}+]+/gu, '-').replace(/^-|-$/g, '').toLowerCase(), 'floats', { text: txt, color: col });
  }
  phase = prevPhase; kr.dispose();
  return out;
};
window.__game = { players, handleEvent, views, camera, cam, get phase() { return phase; }, set phaseT(v) { phaseT = v; }, get focusD() { return focusD; }, get FINISH() { return FINISH; }, sim: simActions, get mode() { return MODE; }, get game() { return GAME; }, api, get ranked() { return ranked; }, get unfinished() { return unfinished; }, get idleD() { return idleD; }, get roundT() { return roundT; }, get elapsed() { return elapsed; }, get waiting() { return waiting; }, get waitingN() { return waitingN; }, get obstPerM() { return OBST_PER_M; }, viewers, pack, MX, fast(sec, step = 0.05) { for (let x = 0; x < sec; x += step) { time += step; simulate(step); } }, get phaseT() { return phaseT; }, get routeEvent() { return routeEvent; }, RULES, forceLevel: t => { if (ranked[0]) startLevelEvent(ranked[0], 'Lion', t); }, forceRoute: t => { RULES.ROUTE_EVENTS = [t]; }, get assigns() { return assignCount; }, get fps() { return fpsNow; }, Q, snd, runCommand, set paused(v) { paused = v; } };
