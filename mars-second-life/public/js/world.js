import * as THREE from 'three';
import * as T from './textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// The colony: sky + day/night, terrain, skyline, maglev, traffic, and five places.
// Every place is built in a local frame whose +Z looks at the central plaza.
// ─────────────────────────────────────────────────────────────────────────────

const Y = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const PLACE_CENTERS = {
  plaza: [0, 0], park: [-34, -18], cafe: [34, -14], cathedral: [0, -46], studio: [-32, 26], skyport: [34, 30],
};

// Small value noise for terrain.
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, o = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * noise2(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < 175) return 0;
  const k = THREE.MathUtils.smoothstep(r, 175, 320);
  let h = (fbm(x * 0.012, z * 0.012) - 0.35) * 40 * k;
  h += Math.max(0, (r - 520)) * 0.18 * fbm(x * 0.004 + 3, z * 0.004 - 2, 4) * 2.2; // crater rim mountains
  return Math.max(-2, h);
}

const matCache = new Map();
function std(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!o.map && !o.emissiveMap && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
  if (!o.map && !o.emissiveMap) matCache.set(key, m);
  return m;
}
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(...s);
  m.castShadow = cast; m.receiveShadow = recv; return m;
}

// ── Sky ──────────────────────────────────────────────────────────────────────
const skyVert = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const skyFrag = `
uniform vec3 sunDir; uniform float day; uniform float dusk; uniform float time;
varying vec3 vDir;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float e = clamp(d.y, -0.2, 1.0);
  vec3 dayZ = vec3(0.47,0.29,0.19), dayH = vec3(0.93,0.66,0.45);
  vec3 nightZ = vec3(0.006,0.008,0.025), nightH = vec3(0.05,0.035,0.06);
  vec3 duskH = vec3(0.55,0.30,0.22);
  float t = pow(1.0 - max(e,0.0), 3.0);
  vec3 dayC = mix(dayZ, dayH, t);
  vec3 nightC = mix(nightZ, nightH, t);
  vec3 col = mix(nightC, dayC, day);
  col = mix(col, mix(col, duskH, t), dusk * 0.6);
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  // Mars sunsets are blue around the sun.
  vec3 halo = mix(vec3(1.0,0.78,0.55), vec3(0.45,0.66,1.0), dusk);
  col += halo * pow(sd, 10.0) * (0.35 + dusk * 0.9) * (day + dusk);
  col += halo * pow(sd, 120.0) * 1.2 * (day + dusk * 0.6);
  col += vec3(1.6,1.5,1.35) * smoothstep(0.99955, 0.99975, sd) * 6.0 * smoothstep(-0.08, 0.02, normalize(sunDir).y);
  // stars
  float night = 1.0 - clamp(day * 1.6 + dusk * 0.6, 0.0, 1.0);
  vec3 g = floor(d * 380.0);
  float s = h(g);
  float tw = 0.6 + 0.4 * sin(time * 2.0 + s * 60.0);
  col += vec3(0.9,0.95,1.0) * step(0.9975, s) * night * tw * smoothstep(0.0, 0.15, d.y) * 2.2;
  // milky band
  float band = exp(-pow(dot(d, normalize(vec3(0.3,0.5,-0.8))) * 4.0, 2.0));
  col += vec3(0.08,0.06,0.12) * band * night * smoothstep(0.0,0.3,d.y);
  if (d.y < 0.0) col = mix(col, dayH * day * 0.6 + nightH * (1.0 - day), clamp(-d.y * 6.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: V(0, 1, 0) }, day: { value: 1 }, dusk: { value: 0 }, time: { value: 0 } },
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

function makeMoon(radius, color, seed) {
  const g = new THREE.IcosahedronGeometry(radius, 4), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const n = fbm(v.x * 0.08 + seed, v.y * 0.08 + v.z * 0.05, 4);
    v.multiplyScalar(1 + (n - 0.5) * 0.35); v.y *= seed > 5 ? 0.8 : 0.9; p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, fog: false }));
}

// ── Vegetation ───────────────────────────────────────────────────────────────
function blobGeo(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 3), p = g.attributes.position, v = new THREE.Vector3();
  const cols = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 0.9 + seed, v.y * 0.9 + v.z * 0.7, 3);
    v.multiplyScalar(0.82 + n * 0.45); p.setXYZ(i, v.x, v.y, v.z);
    const l = 0.75 + n * 0.5 + v.y / r * 0.15; cols.push(l, l, l);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals(); return g;
}

function makeTree(kind, r) {
  const g = new THREE.Group();
  const bark = std('#5b3d28', { roughness: 0.95 });
  if (kind === 'palm') {
    const h = 6 + r() * 3, bend = (r() - 0.5) * 1.6;
    const curve = new THREE.QuadraticBezierCurve3(V(0, 0, 0), V(bend * 0.3, h * 0.5, 0), V(bend, h, 0));
    g.add(mesh(new THREE.TubeGeometry(curve, 12, 0.2, 8), std('#7a5a3e', { roughness: 0.9 })));
    for (let s = 0; s < 10; s++) {
      const t = s / 10; const ring = mesh(new THREE.TorusGeometry(0.21, 0.05, 5, 10), std('#4e3824'), { rx: Math.PI / 2 });
      ring.position.copy(curve.getPoint(t)); g.add(ring);
    }
    const top = curve.getPoint(1), leafMat = new THREE.MeshStandardMaterial({ color: '#3d8a3a', roughness: 0.7, side: THREE.DoubleSide });
    const n = 9 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const len = 3 + r() * 1.2, seg = 10, pos = [], idx = [];
      for (let j = 0; j <= seg; j++) {
        const t = j / seg, w = Math.sin(t * Math.PI) * 0.55 + 0.05, x = t * len, y = Math.sin(t * 2.2) * 0.9 - t * t * 1.8;
        pos.push(x, y, -w, x, y + 0.08, 0, x, y, w);
        if (j < seg) { const b = j * 3; idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const leaf = mesh(geo, leafMat); leaf.position.copy(top); leaf.rotation.set(0, (i / n) * Math.PI * 2 + r() * 0.3, (r() - 0.3) * 0.4); g.add(leaf);
    }
    return g;
  }
  if (kind === 'cone') {
    const h = 5 + r() * 3; g.add(mesh(new THREE.CylinderGeometry(0.12, 0.22, h * 0.4, 7), bark, { y: h * 0.2 }));
    const m = std('#2f6b3a', { roughness: 0.85, vertexColors: true });
    for (let i = 0; i < 4; i++) { const cg = new THREE.ConeGeometry(1.7 - i * 0.35, 2.2, 10); g.add(mesh(cg, m, { y: h * 0.35 + i * 1.1 })); }
    return g;
  }
  // round broadleaf, or glowing bio-tree
  const bio = kind === 'bio', h = 3 + r() * 1.5;
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.3, h, 8), bark, { y: h / 2 }));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.4, 5), bark, { y: h - 0.4, rz: (r() - 0.5) * 1.6, rx: (r() - 0.5) * 1.4 }));
  const leaf = bio
    ? new THREE.MeshStandardMaterial({ color: '#2a6f86', emissive: '#22d3ee', emissiveIntensity: 0.0, roughness: 0.6, vertexColors: true })
    : new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.27 + r() * 0.06, 0.45, 0.32), roughness: 0.85, vertexColors: true });
  if (bio) leaf.userData.nightGlow = 0.25;
  for (let i = 0; i < 5; i++) {
    const s = 1.1 + r() * 0.8;
    g.add(mesh(blobGeo(s, r() * 50), leaf, { x: (r() - 0.5) * 1.8, y: h + 0.4 + r() * 1.3, z: (r() - 0.5) * 1.8 }));
  }
  return g;
}

function bench(len = 2.2) {
  const g = new THREE.Group(), wd = std('#c9c3bb', { roughness: 0.4, metalness: 0.3 }), m = std('#2c2f36', { metalness: 0.7, roughness: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(len, 0.08, 0.55), wd, { y: 0.48 }));
  g.add(mesh(new THREE.BoxGeometry(len, 0.5, 0.07), wd, { y: 0.8, z: -0.26, rx: -0.12 }));
  for (const x of [-len / 2 + 0.15, len / 2 - 0.15]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.48, 0.5), m, { x, y: 0.24 }));
  return g;
}

function lamp(h = 4.2, color = '#ffd9a8') {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.1, h, 8), std('#2b2e35', { metalness: 0.8, roughness: 0.3 }), { y: h / 2 }));
  g.add(mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 24), std('#2b2e35', { metalness: 0.8, roughness: 0.3 }), { y: h, rx: Math.PI / 2 }));
  const bulb = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }); bulb.userData.nightGlow = 4;
  g.add(mesh(new THREE.SphereGeometry(0.2, 16, 12), bulb, { y: h - 0.05, cast: false }));
  return g;
}

// ── World ────────────────────────────────────────────────────────────────────
export function buildWorld(scene, renderer, { quality = 'high' } = {}) {
  const r = T.rng(2026);
  const updaters = [];
  const glowMats = new Set(); // materials whose emissive follows the night
  const obstacles = [];
  const places = {};

  // Lights
  const hemi = new THREE.HemisphereLight('#ffd7b0', '#6b2d18', 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0dc', 3);
  sun.castShadow = quality === 'high';
  const sm = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const moonLight = new THREE.DirectionalLight('#8fb2ff', 0.0); moonLight.position.set(-80, 120, 60); scene.add(moonLight);

  const sky = makeSky(); scene.add(sky);
  scene.fog = new THREE.Fog('#d9a273', 80, 650);

  const phobos = makeMoon(26, '#8a7766', 2), deimos = makeMoon(12, '#9b8a78', 9);
  scene.add(phobos, deimos);
  const earth = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#8fc8ff', fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  earth.scale.setScalar(9); earth.position.set(-500, 520, -900); scene.add(earth);

  // Terrain
  const groundTex = T.marsGround();
  const terr = new THREE.PlaneGeometry(2600, 2600, 260, 260); terr.rotateX(-Math.PI / 2);
  { const p = terr.attributes.position, cols = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = groundHeight(x, z); p.setY(i, h);
      const n = fbm(x * 0.02, z * 0.02, 3), l = 0.8 + n * 0.35 + Math.min(0.2, h * 0.004);
      cols.push(l, l * 0.97, l * 0.95);
    }
    terr.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); terr.computeVertexNormals(); }
  const ground = mesh(terr, new THREE.MeshStandardMaterial({ map: groundTex, vertexColors: true, roughness: 1, color: '#b97e66' }), { cast: false });
  scene.add(ground);

  // Scattered rocks
  { const rock = new THREE.DodecahedronGeometry(1, 1); const p = rock.attributes.position, v = V();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(0.8 + hash2(v.x * 3, v.z * 3 + v.y) * 0.4); p.setXYZ(i, v.x, v.y * 0.7, v.z); }
    rock.computeVertexNormals();
    const inst = new THREE.InstancedMesh(rock, new THREE.MeshStandardMaterial({ color: '#7a3b22', roughness: 1, flatShading: true }), 420);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(); let n = 0;
    for (let i = 0; i < 2000 && n < 420; i++) {
      const a = r() * Math.PI * 2, d = 58 + r() * 260, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Object.values(PLACE_CENTERS).some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 24)) continue;
      const k = 0.2 + Math.pow(r(), 3) * 2.6; s.set(k * (0.8 + r() * 0.5), k, k * (0.8 + r() * 0.5));
      q.setFromEuler(new THREE.Euler(r() * 0.4, r() * 6, r() * 0.4));
      m4.compose(V(x, groundHeight(x, z) + k * 0.25, z), q, s); inst.setMatrixAt(n++, m4);
    }
    inst.count = n; inst.castShadow = true; inst.receiveShadow = true; scene.add(inst); }

  // ── Skyline ──
  const winTex = [T.windows(3), T.windows(8, true), T.windows(15)];
  const facTex = [T.facade(4), T.facade(12)];
  const towerMats = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.MeshStandardMaterial({ map: facTex[i % 2], emissiveMap: winTex[i % 3], emissive: '#ffffff', emissiveIntensity: 0.15, metalness: 0.55, roughness: 0.32, color: ['#c9d2dc', '#a9b4c2', '#e8e2da', '#b8c4cc', '#d8cfc8', '#9eabb8'][i] });
    m.userData.nightGlow = 1.05; glowMats.add(m); towerMats.push(m);
  }
  const ringMat = new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: '#41e6ff', emissiveIntensity: 1.2 }); ringMat.userData.nightGlow = 1.6; glowMats.add(ringMat);
  const ringMat2 = new THREE.MeshStandardMaterial({ color: '#1a0b10', emissive: '#ff5a3c', emissiveIntensity: 1.2 }); ringMat2.userData.nightGlow = 1.6; glowMats.add(ringMat2);
  const redBlink = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  const blinkers = [];
  const towers = [];
  const skyline = new THREE.Group(); scene.add(skyline);
  for (let i = 0; i < 95; i++) {
    const a = (i / 95) * Math.PI * 2 + r() * 0.05, d = 82 + r() * 150 + (i % 3) * 18;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = 22 + Math.pow(r(), 1.6) * 110 + (d > 170 ? 25 : 0), w = 7 + r() * 9;
    const style = Math.floor(r() * 5), m = towerMats[Math.floor(r() * towerMats.length)];
    const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = r() * Math.PI;
    const set = (tex, rx, ry) => { const c = m.clone(); c.map = tex.map.clone(); c.emissiveMap = tex.emissiveMap.clone(); c.map.repeat.set(rx, ry); c.emissiveMap.repeat.set(rx, ry); c.map.needsUpdate = c.emissiveMap.needsUpdate = true; glowMats.add(c); return c; };
    if (style === 0 || style === 3) {
      const mm = set(m, Math.max(1, w / 8), h / 26);
      t.add(mesh(new THREE.BoxGeometry(w, h, w), mm, { y: h / 2 }));
      t.add(mesh(new THREE.BoxGeometry(w * 0.7, h * 0.18, w * 0.7), mm, { y: h + h * 0.09 }));
      if (style === 3) t.add(mesh(new THREE.BoxGeometry(w * 1.05, 0.6, w * 1.05), ringMat, { y: h * 0.62, cast: false }));
    } else if (style === 1) {
      const mm = set(m, Math.max(2, w / 4), h / 26);
      t.add(mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.55, h, 24), mm, { y: h / 2 }));
      for (let k = 1; k <= 3; k++) t.add(mesh(new THREE.TorusGeometry(w * 0.62, 0.25, 6, 40), k % 2 ? ringMat : ringMat2, { y: h * k * 0.24, rx: Math.PI / 2, cast: false }));
      t.add(mesh(new THREE.SphereGeometry(w * 0.45, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mm, { y: h }));
    } else if (style === 2) {
      const mm = set(m, 1, 0.6); const n = Math.max(5, Math.floor(h / 7));
      for (let k = 0; k < n; k++) t.add(mesh(new THREE.BoxGeometry(w * (1 - k * 0.025), h / n, w * (1 - k * 0.025)), mm, { y: (k + 0.5) * (h / n), ry: k * 0.09 }));
    } else {
      const mm = set(m, Math.max(2, w / 4), h / 26);
      t.add(mesh(new THREE.CylinderGeometry(w * 0.2, w * 0.5, h, 6), mm, { y: h / 2 }));
      t.add(mesh(new THREE.ConeGeometry(w * 0.2, h * 0.35, 6), std('#d7dde3', { metalness: 0.8, roughness: 0.2 }), { y: h + h * 0.17 }));
    }
    const tipH = style === 4 ? h * 1.35 : style === 1 ? h + w * 0.45 : h * 1.18;
    t.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 8, 5), std('#ccc', { metalness: 0.9 }), { y: tipH + 4, cast: false }));
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), redBlink); bl.position.y = tipH + 8.2; t.add(bl); blinkers.push({ m: bl, ph: r() * 6 });
    skyline.add(t); towers.push({ x, z, h, w });
  }
  // sky bridges between neighbouring towers
  const tubeMat = new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.55, emissive: '#5fd8ff', emissiveIntensity: 0.1 });
  tubeMat.userData.nightGlow = 0.6; glowMats.add(tubeMat);
  for (let i = 0; i < towers.length; i++) {
    const a = towers[i], b = towers[(i + 1) % towers.length];
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    if (dist > 45 || r() < 0.45) continue;
    const y = Math.min(a.h, b.h) * (0.45 + r() * 0.35);
    const tube = mesh(new THREE.CylinderGeometry(1.1, 1.1, dist, 12, 1, true), tubeMat, { cast: false });
    tube.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
    tube.quaternion.setFromUnitVectors(Y, V(b.x - a.x, 0, b.z - a.z).normalize()); skyline.add(tube);
  }
  // big habitat domes in the distance
  const domeGlass = new THREE.MeshPhysicalMaterial({ color: '#bfe3ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5 });
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2, d = 150 + r() * 90, rad = 22 + r() * 18, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(mesh(new THREE.SphereGeometry(rad, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeGlass, { cast: false }));
    const frame = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(rad * 1.002, 2)), new THREE.LineBasicMaterial({ color: '#e8f2ff', transparent: true, opacity: 0.35 }));
    frame.scale.y = 1; frame.position.y = 0; g.add(frame);
    for (let k = 0; k < 6; k++) { const hh = 6 + r() * rad * 0.6, mm = towerMats[k % towerMats.length]; g.add(mesh(new THREE.BoxGeometry(4, hh, 4), mm, { x: (r() - 0.5) * rad, z: (r() - 0.5) * rad, y: hh / 2 })); }
    g.add(mesh(new THREE.CylinderGeometry(rad * 1.02, rad * 1.04, 1.2, 48), ringMat, { y: 0.6, cast: false }));
    scene.add(g);
  }

  // ── Maglev ring ──
  const MAG_R = 66, MAG_H = 9;
  { const track = mesh(new THREE.TorusGeometry(MAG_R, 0.6, 8, 160), std('#d7dbe0', { metalness: 0.7, roughness: 0.25 }), { y: MAG_H, rx: Math.PI / 2 });
    scene.add(track);
    const rail = mesh(new THREE.TorusGeometry(MAG_R, 0.12, 6, 160), ringMat, { y: MAG_H + 0.65, rx: Math.PI / 2, cast: false }); scene.add(rail);
    for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; scene.add(mesh(new THREE.CylinderGeometry(0.4, 0.7, MAG_H, 8), std('#bfc4ca', { metalness: 0.6, roughness: 0.3 }), { x: Math.cos(a) * MAG_R, y: MAG_H / 2, z: Math.sin(a) * MAG_R })); } }
  const train = new THREE.Group(); scene.add(train);
  const carBody = new THREE.CapsuleGeometry(1.3, 7, 6, 16); carBody.rotateZ(Math.PI / 2);
  const carMat = std('#f4f6f8', { metalness: 0.4, roughness: 0.2 });
  const cars = [];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Group();
    c.add(mesh(carBody, carMat));
    c.add(mesh(new THREE.BoxGeometry(9.2, 0.35, 2.66), ringMat, { y: 0.1, cast: false }));
    c.add(mesh(new THREE.BoxGeometry(7.5, 0.7, 2.7), std('#18222e', { metalness: 0.9, roughness: 0.1 }), { y: 0.55, cast: false }));
    train.add(c); cars.push(c);
  }
  updaters.push((dt, t) => {
    const a0 = t * 0.11;
    cars.forEach((c, i) => { const a = a0 - i * 0.152; c.position.set(Math.cos(a) * MAG_R, MAG_H + 2.2, Math.sin(a) * MAG_R); c.rotation.y = -a; });
  });

  // ── Flying traffic ──
  const flyers = [];
  const flyMat = std('#e9edf2', { metalness: 0.6, roughness: 0.25 });
  const headMat = new THREE.MeshBasicMaterial({ color: '#bff3ff' }), tailMat = new THREE.MeshBasicMaterial({ color: '#ff3b3b' });
  const flyGeo = new THREE.CapsuleGeometry(0.7, 2.2, 4, 10); flyGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    g.add(mesh(flyGeo, flyMat, { s: [1, 0.6, 1] }));
    g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), headMat, { z: 1.7, cast: false }));
    g.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), tailMat, { z: -1.7, cast: false }));
    g.add(mesh(new THREE.BoxGeometry(3, 0.1, 0.8), flyMat, { z: -0.6 }));
    scene.add(g);
    flyers.push({ g, rad: 45 + r() * 170, h: 22 + r() * 60, sp: (0.04 + r() * 0.07) * (r() < 0.5 ? -1 : 1), ph: r() * 7, wob: r() * 4 });
  }
  updaters.push((dt, t) => {
    for (const f of flyers) {
      const a = f.ph + t * f.sp, x = Math.cos(a) * f.rad, z = Math.sin(a) * f.rad;
      f.g.position.set(x, f.h + Math.sin(t * 0.5 + f.wob) * 2, z);
      f.g.rotation.y = -a + (f.sp > 0 ? Math.PI : 0); f.g.rotation.z = 0.15 * Math.sign(f.sp);
    }
  });

  // ── Place helpers ──
  function place(id, build, radius) {
    const [cx, cz] = PLACE_CENTERS[id];
    const yaw = id === 'plaza' ? 0 : Math.atan2(-cx, -cz);
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = yaw; scene.add(g);
    const toW = (x, y, z) => V(x, y, z).applyAxisAngle(Y, yaw).add(V(cx, 0, cz));
    const P = { id, center: V(cx, 0, cz), yaw, group: g, toW, radius, spots: [], extra: {} };
    P.block = (x, z, rr) => { const w = toW(x, 0, z); obstacles.push({ x: w.x, z: w.z, r: rr }); };
    P.addSpots = list => { for (const [x, z] of list) P.spots.push(toW(x, 0, z)); };
    places[id] = P;
    build(g, P);
    P.gate = id === 'plaza' ? V(0, 0, 0) : toW(0, 0, radius - 1);
    P.wide = id === 'plaza'
      ? { pos: V(0, 13, 30), look: V(0, 3, 0) }
      : { pos: toW(0, 11, radius + 15), look: toW(0, 2.5, -radius * 0.25) };
    return P;
  }
  const pathMat = new THREE.MeshStandardMaterial({ map: T.plazaTiles(), roughness: 0.75, color: '#e6ddd2' });
  const edgeGlow = new THREE.MeshStandardMaterial({ color: '#06121a', emissive: '#4ee6ff', emissiveIntensity: 0.3 }); edgeGlow.userData.nightGlow = 0.9; glowMats.add(edgeGlow);
  function walkway(ax, az, bx, bz, w = 4) {
    const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
    const g = new THREE.Group(); g.position.set((ax + bx) / 2, 0, (az + bz) / 2); g.rotation.y = ang;
    const m = pathMat.clone(); m.map = pathMat.map.clone(); m.map.repeat.set(w / 4, len / 4); m.map.needsUpdate = true;
    g.add(mesh(new THREE.BoxGeometry(w, 0.06, len), m, { y: 0.03, cast: false }));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, len), edgeGlow, { x: s * (w / 2 + 0.05), y: 0.05, cast: false }));
    scene.add(g);
  }

  // ── PLAZA ──
  const holo = [];
  place('plaza', (g, P) => {
    const tiles = T.plazaTiles(); tiles.repeat.set(7, 7);
    g.add(mesh(new THREE.CylinderGeometry(15, 15.2, 0.12, 64), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.7, color: '#efe6dc' }), { y: 0.06, cast: false }));
    g.add(mesh(new THREE.TorusGeometry(15.1, 0.1, 6, 96), edgeGlow, { y: 0.13, rx: Math.PI / 2, cast: false }));
    // fountain + holo Mars
    g.add(mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.7, 48), std('#e9e4de', { roughness: 0.35 }), { y: 0.35 }));
    const water = new THREE.MeshPhysicalMaterial({ color: '#2a7f9e', roughness: 0.04, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.6 });
    g.add(mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.1, 48), water, { y: 0.66, cast: false }));
    g.add(mesh(new THREE.CylinderGeometry(0.9, 1.3, 2.2, 24), std('#d9d4ce', { roughness: 0.3, metalness: 0.2 }), { y: 1.1 }));
    const globe = mesh(new THREE.SphereGeometry(2.1, 48, 32), new THREE.MeshStandardMaterial({ map: T.marsGlobe(), roughness: 0.8, emissive: '#ff6a3a', emissiveIntensity: 0.12 }), { y: 5 });
    g.add(globe);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(2.35, 48, 32), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { c: { value: new THREE.Color('#4fe3ff') } },
      vertexShader: 'varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); v = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 n; varying vec3 v; void main(){ float f = pow(1.0-abs(dot(n,v)), 2.5); gl_FragColor = vec4(c*f*1.6, f); }',
    }));
    shell.position.y = 5; g.add(shell);
    const ring1 = mesh(new THREE.TorusGeometry(3.2, 0.05, 6, 96), new THREE.MeshBasicMaterial({ color: '#7cf0ff' }), { y: 5, rx: 1.2, cast: false });
    const ring2 = mesh(new THREE.TorusGeometry(3.6, 0.03, 6, 96), new THREE.MeshBasicMaterial({ color: '#ffb36b' }), { y: 5, rx: 1.9, cast: false });
    g.add(ring1, ring2);
    const beam = mesh(new THREE.CylinderGeometry(0.85, 1.2, 3.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#46dcff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), { y: 3.3, cast: false });
    g.add(beam);
    holo.push({ globe, ring1, ring2 });
    P.block(0, 0, 5.4);
    // benches, lamps, palms
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8, b = bench(2.4); b.position.set(Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5); b.rotation.y = -a - Math.PI / 2; g.add(b); P.block(Math.cos(a) * 9.5, Math.sin(a) * 9.5, 1.3);
      const l = lamp(); l.position.set(Math.cos(a + 0.39) * 13.6, 0, Math.sin(a + 0.39) * 13.6); g.add(l);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, x = Math.cos(a) * 12, z = Math.sin(a) * 12;
      g.add(mesh(new THREE.CylinderGeometry(1.1, 1.0, 0.6, 20), std('#e2dbd2', { roughness: 0.5 }), { x, y: 0.3, z }));
      const p = makeTree('palm', r); p.position.set(x, 0.5, z); p.rotation.y = r() * 6; g.add(p); P.block(x, z, 1.3);
    }
    const ring = []; for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, d = 6.5 + (i % 3) * 1.4; ring.push([Math.cos(a) * d, Math.sin(a) * d]); }
    P.addSpots(ring);
  }, 15);

  // ── PARK: Olympus Gardens (open glass canopy) ──
  const pondWater = new THREE.MeshPhysicalMaterial({ color: '#1f6f86', roughness: 0.03, metalness: 0.05, clearcoat: 1, envMapIntensity: 1.8 });
  place('park', (g, P) => {
    g.add(mesh(new THREE.CylinderGeometry(17, 17.3, 0.14, 64), new THREE.MeshStandardMaterial({ map: T.grass(), roughness: 0.95, color: '#8fbf7a' }), { y: 0.07, cast: false }));
    g.add(mesh(new THREE.TorusGeometry(17.15, 0.18, 8, 96), std('#e7e1d8'), { y: 0.14, rx: Math.PI / 2, cast: false }));
    // canopy ribs
    const ribMat = std('#f3f1ee', { metalness: 0.5, roughness: 0.25 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const curve = new THREE.CubicBezierCurve3(V(c * 17.5, 0, s * 17.5), V(c * 18.5, 9, s * 18.5), V(c * 9, 16, s * 9), V(0, 16.5, 0));
      g.add(mesh(new THREE.TubeGeometry(curve, 30, 0.16, 8), ribMat, { cast: true }));
      P.block(c * 17.5, s * 17.5, 0.5);
    }
    const hoop = mesh(new THREE.TorusGeometry(15.2, 0.14, 8, 96), ribMat, { y: 10.2, rx: Math.PI / 2 }); g.add(hoop);
    const glass = new THREE.MeshPhysicalMaterial({ color: '#d9f1ff', roughness: 0.02, metalness: 0.0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2 });
    const dome = mesh(new THREE.SphereGeometry(18, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), glass, { y: 0, s: [1, 0.92, 1], cast: false }); g.add(dome);
    // pond
    const pond = new THREE.Shape(); for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2, rr = 4.2 + Math.sin(a * 3) * 0.6 + Math.cos(a * 2) * 0.4; i ? pond.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : pond.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const pg = new THREE.ShapeGeometry(pond, 40); pg.rotateX(-Math.PI / 2);
    g.add(mesh(pg, pondWater, { x: 5, y: 0.17, z: -4, cast: false }));
    for (let i = 0; i < 34; i++) { const a = (i / 34) * Math.PI * 2, rr = 4.5 + Math.sin(a * 3) * 0.6 + Math.cos(a * 2) * 0.4; g.add(mesh(new THREE.DodecahedronGeometry(0.35 + r() * 0.2, 0), std('#8c8178', { roughness: 0.9, flatShading: true }), { x: 5 + Math.cos(a) * rr, y: 0.2, z: -4 + Math.sin(a) * rr, ry: r() * 3 })); }
    P.block(5, -4, 5.2);
    // trees, flowers, benches
    const treeSpots = [[-9, -6, 'round'], [-11, 4, 'bio'], [-4, 11, 'round'], [9, 9, 'palm'], [12, -2, 'cone'], [-2, -12, 'cone'], [-13, -2, 'palm'], [6, 13, 'bio'], [-7, -12, 'round'], [13, 6, 'round']];
    for (const [x, z, k] of treeSpots) { const t = makeTree(k, r); t.position.set(x, 0.14, z); t.rotation.y = r() * 6; g.add(t); P.block(x, z, k === 'palm' ? 0.6 : 1.1); }
    const flowerCols = ['#ff5d8f', '#ffd23f', '#ff8c42', '#b388ff', '#ffffff'];
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 900);
    const m4 = new THREE.Matrix4(); let fi = 0;
    for (const [bx, bz] of [[-6, 3], [2, 7], [-3, -6], [10, -9], [-12, 9]]) {
      g.add(mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.35, 24), std('#5a3a26', { roughness: 1 }), { x: bx, y: 0.3, z: bz, cast: false })); P.block(bx, bz, 2);
      for (let i = 0; i < 170 && fi < 900; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 1.7; m4.makeTranslation(bx + Math.cos(a) * d, 0.5 + r() * 0.15, bz + Math.sin(a) * d); fl.setMatrixAt(fi, m4); fl.setColorAt(fi, new THREE.Color(flowerCols[Math.floor(r() * flowerCols.length)])); fi++; }
    }
    fl.count = fi; g.add(fl);
    for (const [x, z, ry] of [[0, -2, 0], [-8, 8, 2.3], [8, 2, -1.6], [-14, -7, 1]]) { const b = bench(); b.position.set(x, 0.14, z); b.rotation.y = ry; g.add(b); P.block(x, z, 1.2); }
    for (const [x, z] of [[-15, 0], [15, 0], [0, 15], [0, -15], [10, 11], [-10, -11]]) { const l = lamp(3.6, '#c8f4ff'); l.position.set(x, 0, z); g.add(l); }
    const pts = []; for (let i = 0; i < 160; i++) { const a = r() * 6.28, d = 2 + Math.sqrt(r()) * 13; pts.push([Math.cos(a) * d, Math.sin(a) * d]); }
    P.addSpots(pts);
  }, 18);

  // ── CAFÉ: Red Planet Café ──
  place('cafe', (g, P) => {
    const deck = T.wood(); deck.repeat.set(5, 3);
    g.add(mesh(new THREE.BoxGeometry(20, 0.2, 13), new THREE.MeshStandardMaterial({ map: deck, roughness: 0.7 }), { y: 0.1, z: 1, cast: false }));
    // building
    const wall = std('#2a2c33', { metalness: 0.6, roughness: 0.35 }), white = std('#efebe6', { roughness: 0.4 });
    g.add(mesh(new THREE.BoxGeometry(20, 0.5, 9), white, { y: 6.2, z: -9.5 }));
    g.add(mesh(new THREE.BoxGeometry(20, 6, 0.4), wall, { y: 3, z: -13.8 }));
    for (const x of [-9.8, 9.8]) g.add(mesh(new THREE.BoxGeometry(0.4, 6, 9), wall, { x, y: 3, z: -9.5 }));
    g.add(mesh(new THREE.BoxGeometry(20, 0.2, 9), std('#3b2a22', { roughness: 0.8 }), { y: 0.1, z: -9.5, cast: false }));
    const glass = new THREE.MeshPhysicalMaterial({ color: '#ffe2c4', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.5 });
    g.add(mesh(new THREE.BoxGeometry(19.2, 5.6, 0.08), glass, { y: 3, z: -5.2, cast: false }));
    for (let x = -9.6; x <= 9.6; x += 3.2) g.add(mesh(new THREE.BoxGeometry(0.12, 5.8, 0.14), wall, { x, y: 3, z: -5.2 }));
    P.block(-7, -9, 3.2); P.block(0, -9, 3.2); P.block(7, -9, 3.2);
    // inside: counter, shelves, warm glow
    g.add(mesh(new THREE.BoxGeometry(10, 1.1, 1.2), std('#5b3424', { roughness: 0.5 }), { y: 0.65, z: -10 }));
    g.add(mesh(new THREE.BoxGeometry(10.4, 0.08, 1.4), std('#e8e2da', { roughness: 0.2, metalness: 0.2 }), { y: 1.24, z: -10 }));
    const warm = new THREE.MeshStandardMaterial({ color: '#2b1a10', emissive: '#ffb86b', emissiveIntensity: 0.6 }); warm.userData.nightGlow = 2.2; glowMats.add(warm);
    for (const y of [2.2, 3.4, 4.6]) g.add(mesh(new THREE.BoxGeometry(14, 0.08, 0.5), warm, { y, z: -13.4, cast: false }));
    for (let i = 0; i < 7; i++) g.add(mesh(new THREE.SphereGeometry(0.35, 16, 12), warm, { x: -7.5 + i * 2.5, y: 5.2, z: -8, cast: false }));
    const cafeLight = new THREE.PointLight('#ffb070', 0, 22, 1.6); cafeLight.position.copy(V(0, 4, -8)); g.add(cafeLight); P.extra.light = cafeLight;
    // sign
    const sign = new THREE.MeshBasicMaterial({ map: T.textSign('RED PLANET CAFÉ', { color: '#ff5a2e' }), transparent: true, toneMapped: false });
    g.add(mesh(new THREE.PlaneGeometry(12, 2.25), sign, { y: 7.6, z: -5.1, cast: false }));
    // awning
    const aw = T.stripes('#f6efe8', '#c7392a', 16); aw.repeat.set(3, 1);
    g.add(mesh(new THREE.BoxGeometry(20, 0.08, 2.6), new THREE.MeshStandardMaterial({ map: aw, roughness: 0.8 }), { y: 5.6, z: -4, rx: 0.25 }));
    // tables with parasols & string lights
    const tableTop = std('#f2efea', { roughness: 0.3, metalness: 0.1 }), steel = std('#2b2e35', { metalness: 0.8, roughness: 0.3 });
    const chairMat = std('#d24a2c', { roughness: 0.5 });
    const tables = [[-6, -1], [0, -1], [6, -1], [-6, 4.5], [0, 4.5], [6, 4.5]];
    tables.forEach(([x, z], i) => {
      g.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 28), tableTop, { x, y: 0.95, z }));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8), steel, { x, y: 0.55, z }));
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 16), steel, { x, y: 0.22, z }));
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + i, cx = x + Math.cos(a) * 1.15, cz = z + Math.sin(a) * 1.15;
        const ch = new THREE.Group(); ch.position.set(cx, 0.2, cz); ch.rotation.y = -a + Math.PI / 2;
        ch.add(mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), chairMat, { y: 0.45 }));
        ch.add(mesh(new THREE.BoxGeometry(0.45, 0.5, 0.05), chairMat, { y: 0.7, z: 0.22 }));
        for (const sx of [-0.18, 0.18]) for (const sz of [-0.18, 0.18]) ch.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 5), steel, { x: sx, y: 0.22, z: sz }));
        g.add(ch);
      }
      if (i % 2 === 0) {
        const pm = new THREE.MeshStandardMaterial({ map: T.stripes('#ffffff', i % 4 ? '#e0522f' : '#2f7fe0', 12), roughness: 0.8, side: THREE.DoubleSide });
        g.add(mesh(new THREE.ConeGeometry(1.9, 0.7, 12, 1, true), pm, { x, y: 2.7, z }));
        g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), steel, { x, y: 1.6, z }));
      }
      P.block(x, z, 1.25);
    });
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff2d0', emissive: '#ffcf7a', emissiveIntensity: 0.4 }); bulbMat.userData.nightGlow = 5; glowMats.add(bulbMat);
    for (const z of [-2.8, 7.4]) {
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 6), steel, { x: -9.8, y: 2.3, z }));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 6), steel, { x: 9.8, y: 2.3, z }));
      for (let i = 0; i <= 20; i++) { const x = -9.8 + (i / 20) * 19.6, sag = Math.sin((i / 20) * Math.PI) * 0.8; g.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), bulbMat, { x, y: 4.5 - sag, z, cast: false })); }
    }
    const pts = []; for (let i = 0; i < 90; i++) pts.push([(r() - 0.5) * 17, -3.5 + r() * 11]);
    for (const [x, z] of tables) for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.6; pts.push([x + Math.cos(a) * 1.6, z + Math.sin(a) * 1.6]); }
    P.addSpots(pts); P.extra.tables = tables.map(([x, z]) => P.toW(x, 0, z));
  }, 11);

  // ── CATHEDRAL OF STARS ──
  place('cathedral', (g, P) => {
    const stone = std('#eeebe6', { roughness: 0.45, metalness: 0.05 }), gold = std('#d8b25a', { metalness: 1, roughness: 0.25 });
    const L = 30, W = 7;
    g.add(mesh(new THREE.BoxGeometry(18, 0.5, L + 4), stone, { y: 0.25, z: -L / 2 + 1, cast: false }));
    for (let s = 0; s < 3; s++) g.add(mesh(new THREE.BoxGeometry(18 - s * 0.01, 0.17, 1.2), stone, { y: 0.085 + s * 0.17 - 0.17, z: 3.4 - s * 0.6 + 0.6, cast: false }));
    // forecourt
    const ft = T.plazaTiles(); ft.repeat.set(4, 2);
    g.add(mesh(new THREE.BoxGeometry(22, 0.08, 12), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.6, color: '#f3ece4' }), { y: 0.04, z: 9, cast: false }));
    // pillars + pointed rib arches
    const glassTexes = [T.stainedGlass(1), T.stainedGlass(2), T.stainedGlass(3), T.stainedGlass(4)];
    for (let i = 0; i <= 7; i++) {
      const z = -1 - i * 4;
      for (const sx of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.32, 0.42, 14, 12), stone, { x: sx * W, y: 7.5, z }));
        g.add(mesh(new THREE.BoxGeometry(1.1, 0.6, 1.1), stone, { x: sx * W, y: 0.8, z }));
        P.block(sx * W, z, 0.8);
      }
      const arch = new THREE.CatmullRomCurve3([V(-W, 14.2, 0), V(-W * 0.75, 18.5, 0), V(-W * 0.35, 21.2, 0), V(0, 22.6, 0), V(W * 0.35, 21.2, 0), V(W * 0.75, 18.5, 0), V(W, 14.2, 0)]);
      g.add(mesh(new THREE.TubeGeometry(arch, 40, 0.22, 8), stone, { z }));
      if (i < 7) for (const sx of [-1, 1]) {
        const gm = new THREE.MeshStandardMaterial({ map: glassTexes[(i + (sx > 0 ? 1 : 0)) % 4], emissiveMap: glassTexes[(i + (sx > 0 ? 1 : 0)) % 4], emissive: '#ffffff', emissiveIntensity: 0.6, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, roughness: 0.2 });
        gm.userData.nightGlow = 1.6; gm.userData.dayGlow = 0.6; glowMats.add(gm);
        g.add(mesh(new THREE.PlaneGeometry(3.4, 11), gm, { x: sx * W, y: 7.6, z: z - 2, ry: Math.PI / 2, cast: false }));
        P.block(sx * W, z - 2, 1.4);
      }
    }
    // glass roof
    const roofGlass = new THREE.MeshPhysicalMaterial({ color: '#cfe4ff', roughness: 0.04, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2 });
    for (const sx of [-1, 1]) { const rf = mesh(new THREE.PlaneGeometry(10.4, L), roofGlass, { x: sx * 3.6, y: 18.6, z: -L / 2 + 1, rx: -Math.PI / 2, ry: sx * 0.92, cast: false }); rf.rotation.order = 'YXZ'; rf.rotation.set(-Math.PI / 2, 0, 0); rf.rotateY(sx * -0.9); g.add(rf); }
    // apse + rose window at back
    const rose = new THREE.MeshStandardMaterial({ map: T.roseWindow(), emissiveMap: T.roseWindow(), emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.3, side: THREE.DoubleSide }); rose.userData.nightGlow = 2; rose.userData.dayGlow = 0.9; glowMats.add(rose);
    g.add(mesh(new THREE.BoxGeometry(W * 2 + 1, 15, 0.6), stone, { y: 7.5, z: -L + 0.5 }));
    g.add(mesh(new THREE.CircleGeometry(4.2, 64), rose, { y: 9.5, z: -L + 0.85, cast: false }));
    P.block(0, -L + 0.5, 1); P.block(-4, -L + 0.5, 1); P.block(4, -L + 0.5, 1);
    // facade: twin spires + front rose + gate
    for (const sx of [-1, 1]) {
      const x = sx * 8.6, sp = new THREE.Group(); sp.position.set(x, 0, 1.2);
      sp.add(mesh(new THREE.BoxGeometry(3.4, 20, 3.4), stone, { y: 10 }));
      for (let k = 0; k < 4; k++) sp.add(mesh(new THREE.BoxGeometry(0.5, 20.4, 0.5), stone, { x: (k % 2 ? 1 : -1) * 1.75, y: 10.2, z: (k < 2 ? 1 : -1) * 1.75 }));
      sp.add(mesh(new THREE.CylinderGeometry(1.5, 1.8, 7, 8), stone, { y: 23.5 }));
      sp.add(mesh(new THREE.ConeGeometry(1.6, 18, 8), stone, { y: 36 }));
      sp.add(mesh(new THREE.SphereGeometry(0.4, 16, 12), gold, { y: 45.3 }));
      const star = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd77a', emissiveIntensity: 1 }); star.userData.nightGlow = 6; glowMats.add(star);
      sp.add(mesh(new THREE.OctahedronGeometry(0.6), star, { y: 46.4, cast: false }));
      const slit = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#8fb7ff', emissiveIntensity: 0.5 }); slit.userData.nightGlow = 2; glowMats.add(slit);
      for (let k = 0; k < 4; k++) sp.add(mesh(new THREE.PlaneGeometry(0.6, 3), slit, { y: 6 + k * 4, z: 1.71, cast: false }));
      g.add(sp); P.block(x, 1.2, 2.6);
    }
    g.add(mesh(new THREE.CircleGeometry(3.4, 64), rose, { y: 16.8, z: 1.05, cast: false }));
    g.add(mesh(new THREE.TorusGeometry(3.5, 0.25, 8, 64), stone, { y: 16.8, z: 1.05 }));
    const gate = new THREE.CatmullRomCurve3([V(-3.2, 0.5, 0), V(-3.2, 7, 0), V(-2, 10.5, 0), V(0, 12.4, 0), V(2, 10.5, 0), V(3.2, 7, 0), V(3.2, 0.5, 0)]);
    g.add(mesh(new THREE.TubeGeometry(gate, 40, 0.35, 8), stone, { z: 1 }));
    g.add(mesh(new THREE.BoxGeometry(17, 2, 0.6), stone, { y: 14, z: 1 }));
    for (const sx of [-1, 1]) { g.add(mesh(new THREE.BoxGeometry(3.2, 14, 0.6), stone, { x: sx * 5.1, y: 7, z: 1 })); P.block(sx * 5.1, 1, 1.4); P.block(sx * 6, 1, 1.4); }
    // inside: carpet, pews, altar hologram
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.04, L - 3), std('#6b2a52', { roughness: 0.9 }), { y: 0.52, z: -L / 2, cast: false }));
    const pew = std('#7a5034', { roughness: 0.6 });
    for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) {
      const z = -5 - i * 2.6; g.add(mesh(new THREE.BoxGeometry(3.8, 0.12, 0.6), pew, { x: sx * 3.6, y: 0.95, z })); g.add(mesh(new THREE.BoxGeometry(3.8, 0.7, 0.1), pew, { x: sx * 3.6, y: 1.3, z: z - 0.3 }));
      g.add(mesh(new THREE.BoxGeometry(3.8, 0.45, 0.5), pew, { x: sx * 3.6, y: 0.72, z }));
      P.block(sx * 2.6, z, 0.7); P.block(sx * 4.6, z, 0.7);
    }
    g.add(mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.6, 32), stone, { y: 0.8, z: -L + 4.5 }));
    const starCore = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#a9c8ff', emissiveIntensity: 2.2 });
    const starObj = mesh(new THREE.IcosahedronGeometry(0.8, 0), starCore, { y: 4.2, z: -L + 4.5, cast: false }); g.add(starObj);
    const starHalo = mesh(new THREE.TorusGeometry(1.6, 0.04, 6, 64), new THREE.MeshBasicMaterial({ color: '#cfe0ff' }), { y: 4.2, z: -L + 4.5, cast: false }); g.add(starHalo);
    updaters.push((dt, t) => { starObj.rotation.y = t * 0.6; starObj.rotation.x = t * 0.3; starHalo.rotation.x = t * 0.4; starHalo.rotation.y = t * 0.7; });
    P.block(0, -L + 4.5, 3);
    const choir = new THREE.PointLight('#aac4ff', 0, 30, 1.5); choir.position.set(0, 8, -L / 2); g.add(choir); P.extra.light = choir;
    const pts = [];
    for (let i = 0; i < 60; i++) pts.push([(r() - 0.5) * 18, 5 + r() * 9]);
    for (let i = 0; i < 26; i++) pts.push([(r() - 0.5) * 2, -3 - r() * 20]);
    for (let i = 0; i < 12; i++) pts.push([(r() < 0.5 ? -1 : 1) * (5.6 + r() * 0.6), -4 - r() * 20]);
    P.addSpots(pts);
  }, 14);

  // ── NOVA STUDIO ──
  const led = T.liveCanvas(1024, 576, (c, w, h, t) => {
    const g = c; const hue = (t * 40) % 360;
    const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, `hsl(${hue},90%,18%)`); grd.addColorStop(1, `hsl(${(hue + 120) % 360},90%,12%)`);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const bars = 48;
    for (let i = 0; i < bars; i++) {
      const v = (Math.sin(t * 6 + i * 0.6) * 0.5 + 0.5) * (Math.sin(t * 2.3 + i * 0.21) * 0.35 + 0.65) * (0.6 + 0.4 * Math.sin(t * 11 + i));
      const bh = v * h * 0.55; g.fillStyle = `hsl(${(hue + i * 5) % 360},95%,60%)`;
      g.fillRect(i * (w / bars) + 3, h - bh - 40, w / bars - 6, bh);
    }
    g.font = '900 120px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#fff'; g.shadowBlur = 30; g.fillStyle = '#fff'; g.fillText('NOVA STUDIO', w / 2, h * 0.3 + Math.sin(t * 3) * 6); g.shadowBlur = 0;
    g.font = '700 46px "Segoe UI", sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText('LIVE FROM MARS • SECOND LIFE', w / 2, h * 0.5);
  });
  const floor = T.liveCanvas(256, 256, (g, w, h, t) => {
    const n = 8, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = Math.sin(t * 4 + x * 0.9 + y * 1.3) * Math.cos(t * 3 - x * 0.7 + y * 0.4);
      g.fillStyle = `hsl(${((x + y) * 30 + t * 80) % 360},95%,${12 + Math.max(0, v) * 50}%)`;
      g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  });
  const spotCones = [];
  place('studio', (g, P) => {
    const black = std('#15161b', { metalness: 0.5, roughness: 0.4 }), truss = std('#b9bec7', { metalness: 0.9, roughness: 0.25 });
    g.add(mesh(new THREE.BoxGeometry(22, 0.1, 22), std('#1b1c22', { roughness: 0.35, metalness: 0.4 }), { y: 0.05, z: -1, cast: false }));
    const fm = new THREE.MeshStandardMaterial({ map: floor.texture, emissiveMap: floor.texture, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.2 });
    g.add(mesh(new THREE.BoxGeometry(13, 0.12, 10), fm, { y: 0.12, z: 1.5, cast: false }));
    g.add(mesh(new THREE.BoxGeometry(18, 1.2, 6), black, { y: 0.6, z: -8 }));
    const lm = new THREE.MeshBasicMaterial({ map: led.texture, toneMapped: false });
    g.add(mesh(new THREE.BoxGeometry(17, 9.6, 0.5), black, { y: 6.4, z: -11 }));
    g.add(mesh(new THREE.PlaneGeometry(16.4, 9.2), lm, { y: 6.4, z: -10.74, cast: false }));
    P.block(-6, -8.5, 3.4); P.block(0, -8.5, 3.4); P.block(6, -8.5, 3.4);
    // DJ booth
    g.add(mesh(new THREE.BoxGeometry(3.4, 1.1, 1.2), std('#22242c', { metalness: 0.6, roughness: 0.3 }), { y: 1.75, z: -7 }));
    const djGlow = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ff3bd4', emissiveIntensity: 2.5 });
    g.add(mesh(new THREE.BoxGeometry(3.42, 0.08, 1.22), djGlow, { y: 1.4, z: -7, cast: false }));
    // truss
    for (const x of [-9, 9]) for (const z of [-10, 6]) g.add(mesh(new THREE.BoxGeometry(0.4, 11, 0.4), truss, { x, y: 5.5, z }));
    for (const z of [-10, 6]) g.add(mesh(new THREE.BoxGeometry(18.4, 0.4, 0.4), truss, { y: 11, z }));
    for (const x of [-9, 9]) g.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 16.4), truss, { x, y: 11, z: -2 }));
    for (const [x, z] of [[-9, -10], [9, -10], [-9, 6], [9, 6]]) P.block(x, z, 0.6);
    const cols = ['#ff3bd4', '#3bdcff', '#ffe23b', '#7a5cff', '#3bff8a', '#ff5a3b'];
    for (let i = 0; i < 6; i++) {
      const pivot = new THREE.Group(); pivot.position.set(-7.5 + i * 3, 10.7, -2 + (i % 2 ? 7.5 : -7.5) * 0.9);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 11, 32, 1, true), new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.position.y = -5.5; pivot.add(cone);
      pivot.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12), black, { cast: false }));
      g.add(pivot); spotCones.push({ pivot, ph: i * 1.1 });
    }
    // speakers + neon sign + recording pods
    for (const sx of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(1.6, 3.4, 1.4), black, { x: sx * 10.5, y: 1.7, z: -6 }));
      for (let k = 0; k < 2; k++) g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 24), std('#333'), { x: sx * 10.5, y: 1 + k * 1.4, z: -5.28, rx: Math.PI / 2 }));
      P.block(sx * 10.5, -6, 1.2);
      // glass podcast pod
      const pod = new THREE.Group(); pod.position.set(sx * 11, 0, 5); g.add(pod);
      pod.add(mesh(new THREE.BoxGeometry(3.6, 3, 3.6), new THREE.MeshPhysicalMaterial({ color: '#d6ecff', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }), { y: 1.6, cast: false }));
      pod.add(mesh(new THREE.BoxGeometry(3.8, 0.2, 3.8), black, { y: 3.15 }));
      const air = new THREE.MeshBasicMaterial({ map: T.textSign('ON AIR', { w: 512, h: 128, color: '#ff3355', font: '900 90px Arial Black, sans-serif' }), transparent: true, toneMapped: false });
      pod.add(mesh(new THREE.PlaneGeometry(2, 0.5), air, { y: 3.6, z: sx > 0 ? -1.91 : 1.91, ry: sx > 0 ? Math.PI : 0, cast: false }));
      pod.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.8, 20), std('#2d2f37'), { y: 0.5 }));
      pod.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), std('#999', { metalness: 1 }), { x: 0.3, y: 1.4 }));
      P.block(sx * 11, 5, 2.4);
    }
    const sign = new THREE.MeshBasicMaterial({ map: T.textSign('NOVA STUDIO', { color: '#ff3bd4' }), transparent: true, toneMapped: false });
    g.add(mesh(new THREE.PlaneGeometry(11, 2), sign, { y: 12.4, z: 6.1, ry: Math.PI, cast: false }));
    const stageLight = new THREE.PointLight('#ff4fd8', 6, 28, 1.6); stageLight.position.set(0, 7, 0); g.add(stageLight); P.extra.light = stageLight;
    const pts = []; for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) pts.push([-5.4 + x * 1.8 + (r() - 0.5) * 0.4, -2.5 + y * 1.8 + (r() - 0.5) * 0.4]);
    P.addSpots(pts); P.extra.dance = true;
  }, 13);

  // ── PHOBOS SKYPORT ──
  const ship = new THREE.Group();
  const thrusters = [];
  {
    const hull = std('#eef1f4', { metalness: 0.55, roughness: 0.22 }), dark = std('#2a2f38', { metalness: 0.8, roughness: 0.3 }), accent = std('#d9532f', { roughness: 0.4 });
    const prof = [[0, -7], [0.9, -6.6], [1.6, -5.6], [2.1, -3.8], [2.25, -1], [2.2, 2.5], [1.9, 5], [1.2, 6.6], [0.2, 7.3], [0, 7.3]].map(([x, y]) => new THREE.Vector2(x, y));
    const fus = mesh(new THREE.LatheGeometry(prof, 32), hull, { rx: Math.PI / 2 }); fus.scale.set(1, 1, 0.82); ship.add(fus);
    const canopy = mesh(new THREE.SphereGeometry(1.4, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2.4), std('#0c1522', { metalness: 1, roughness: 0.05 }), { y: 1.25, z: 4.4, s: [1, 0.55, 1.6] }); ship.add(canopy);
    const wing = new THREE.Shape(); wing.moveTo(0, 3); wing.lineTo(7.5, -2.5); wing.lineTo(7.5, -4); wing.lineTo(0, -4.5);
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.3, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08 });
    for (const sx of [-1, 1]) { const w = mesh(wg, hull, { rx: Math.PI / 2, y: -0.3 }); w.scale.x = sx; ship.add(w); ship.add(mesh(new THREE.BoxGeometry(0.4, 0.42, 3), accent, { x: sx * 7.4, y: -0.2, z: -3.2 })); }
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(2.8, -0.5); fin.lineTo(3.2, -3.2); fin.lineTo(0, -3.6);
    ship.add(mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.25, bevelEnabled: false }), hull, { y: 1.4, z: -3.2, rx: 0, ry: -Math.PI / 2 }));
    ship.add(mesh(new THREE.BoxGeometry(4.6, 0.3, 0.6), accent, { y: 0.2, z: 3, cast: false }));
    const glowMat = new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const sx of [-1.1, 0, 1.1]) {
      ship.add(mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.2, 20, 1, true), dark, { x: sx, y: sx ? -0.4 : 0.2, z: -7.2, rx: Math.PI / 2 }));
      const flame = mesh(new THREE.ConeGeometry(0.55, 4, 20, 1, true), glowMat, { x: sx, y: sx ? -0.4 : 0.2, z: -9.6, rx: -Math.PI / 2, cast: false }); ship.add(flame); thrusters.push(flame);
    }
    for (const [x, z] of [[-1.6, 3], [1.6, 3], [-3, -3], [3, -3]]) { ship.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.8, 8), dark, { x, y: -1.9, z })); ship.add(mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 16), dark, { x, y: -2.8, z })); }
    const vtol = new THREE.MeshBasicMaterial({ color: '#86e3ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [x, z] of [[-3, -2], [3, -2], [0, 4]]) { const f = mesh(new THREE.ConeGeometry(0.8, 4.5, 20, 1, true), vtol, { x, y: -3.4, z, cast: false }); ship.add(f); thrusters.push(f); }
    const nav = [['#ff2a2a', -7.5], ['#2aff6a', 7.5]];
    for (const [c, x] of nav) ship.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: c }), { x, y: -0.1, z: -3.6, cast: false }));
  }
  place('skyport', (g, P) => {
    const concrete = std('#5b5f66', { roughness: 0.9 });
    g.add(mesh(new THREE.BoxGeometry(30, 0.1, 30), concrete, { y: 0.05, z: -2, cast: false }));
    const pad = mesh(new THREE.CylinderGeometry(9.5, 9.8, 0.5, 6), new THREE.MeshStandardMaterial({ map: T.padMarkings(), roughness: 0.75 }), { y: 0.3, z: -6, cast: false });
    pad.material = [std('#3a3d42', { roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: T.padMarkings(), roughness: 0.75 }), std('#3a3d42')];
    g.add(pad); P.block(0, -6, 9.6);
    const padLight = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffb000', emissiveIntensity: 1 }); padLight.userData.nightGlow = 4; glowMats.add(padLight);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.25, 8), padLight, { x: Math.cos(a) * 9.9, y: 0.4, z: -6 + Math.sin(a) * 9.9, cast: false })); }
    ship.position.set(0, 3.45, -6); g.add(ship); P.extra.ship = ship;
    // tower
    const tw = new THREE.Group(); tw.position.set(-12, 0, -12); g.add(tw);
    tw.add(mesh(new THREE.CylinderGeometry(1.2, 1.8, 14, 16), std('#e9ecef', { metalness: 0.3, roughness: 0.35 }), { y: 7 }));
    tw.add(mesh(new THREE.CylinderGeometry(3.4, 2.2, 3, 16), new THREE.MeshPhysicalMaterial({ color: '#1a2a3a', metalness: 0.6, roughness: 0.05, emissive: '#57c9ff', emissiveIntensity: 0.3 }), { y: 15.5 }));
    tw.add(mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.4, 16), std('#e9ecef'), { y: 17.2 }));
    tw.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), std('#ccc', { metalness: 1 }), { y: 19.6 }));
    const beacon = mesh(new THREE.SphereGeometry(0.35, 10, 8), redBlink, { y: 22.2, cast: false }); tw.add(beacon); blinkers.push({ m: beacon, ph: 0 });
    P.block(-12, -12, 2.2);
    // crates, tanks, rover
    const crateCols = ['#c7552f', '#2f6fc7', '#d7d2c9', '#3d9b5a'];
    for (let i = 0; i < 9; i++) { const s = 1 + r() * 0.5; g.add(mesh(new THREE.BoxGeometry(s * 1.6, s, s), std(crateCols[i % 4], { roughness: 0.6, metalness: 0.3 }), { x: 11 + (i % 3) * 1.7, y: s / 2 + Math.floor(i / 6) * s, z: -14 + Math.floor(i / 3) * 1.4, ry: (r() - 0.5) * 0.3 })); }
    P.block(12.7, -12.6, 3.2);
    for (const z of [-4, 0]) { g.add(mesh(new THREE.CapsuleGeometry(1.2, 5, 6, 16), std('#e6e6e6', { metalness: 0.6, roughness: 0.25 }), { x: 14, y: 1.4, z, rz: Math.PI / 2 })); P.block(14, z, 1.5); P.block(16.5, z, 1.4); P.block(11.5, z, 1.4); }
    const rover = new THREE.Group(); rover.position.set(-12, 0, 2); rover.rotation.y = 0.6; g.add(rover);
    rover.add(mesh(new THREE.BoxGeometry(2.6, 1, 4.4), std('#f0eeea', { metalness: 0.3, roughness: 0.4 }), { y: 1.3 }));
    rover.add(mesh(new THREE.BoxGeometry(2.2, 0.8, 1.8), std('#1a2433', { metalness: 0.8, roughness: 0.05 }), { y: 2.1, z: 1 }));
    for (const x of [-1.4, 1.4]) for (const z of [-1.6, 0, 1.6]) rover.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 18), std('#222', { roughness: 0.9 }), { x, y: 0.55, z, rz: Math.PI / 2 }));
    rover.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), std('#ccc'), { x: 0.8, y: 2.6, z: -1.4 }));
    rover.add(mesh(new THREE.CircleGeometry(0.5, 20), std('#ddd', { side: THREE.DoubleSide }), { x: 0.8, y: 3.4, z: -1.4, rx: -0.6 }));
    P.block(-12, 2, 2.6);
    // viewing deck railing
    const rail = std('#cfd3d8', { metalness: 0.8, roughness: 0.25 });
    g.add(mesh(new THREE.BoxGeometry(22, 0.08, 0.08), rail, { y: 1.05, z: 4.2 }));
    for (let x = -11; x <= 11; x += 2.2) g.add(mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), rail, { x, y: 0.52, z: 4.2 }));
    const pts = []; for (let i = 0; i < 80; i++) pts.push([(r() - 0.5) * 22, 5 + r() * 7]);
    for (let i = 0; i < 26; i++) { const sx = r() < 0.5 ? -1 : 1; pts.push([sx * (11 + r() * 2), -10 + r() * 12]); }
    P.addSpots(pts);
  }, 15);
  // deck rail blocks people from walking onto the pad from the front
  { const P = places.skyport; for (let x = -10; x <= 10; x += 2.5) P.block(x, 4.2, 0.7); }

  // walkways from plaza to each place
  for (const id of ['park', 'cafe', 'cathedral', 'studio', 'skyport']) {
    const P = places[id], dir = P.center.clone().normalize();
    walkway(dir.x * 15, dir.z * 15, P.gate.x, P.gate.z, 4.2);
  }

  // remove spots that sit inside obstacles
  const free = (p, pad = 0.35) => obstacles.every(o => Math.hypot(p.x - o.x, p.z - o.z) > o.r + pad);
  for (const P of Object.values(places)) P.spots = P.spots.filter(p => free(p));

  // ── Ship cycle ──
  const shipHome = ship.position.clone();
  let shipOverride = 0;
  updaters.push((dt, t) => {
    const T0 = (t % 95);
    let y = 0, z = 0, pitch = 0, thrust = 0, hidden = false;
    if (T0 < 40) { thrust = 0; }
    else if (T0 < 48) { const k = (T0 - 40) / 8; y = k * k * 14; thrust = 0.8; }
    else if (T0 < 62) { const k = (T0 - 48) / 14; y = 14 + k * k * 170; z = -k * k * 260; pitch = -k * 0.5; thrust = 1; hidden = k > 0.98; }
    else if (T0 < 80) { hidden = true; }
    else if (T0 < 92) { const k = 1 - (T0 - 80) / 12; y = k * k * 60 + 0; z = -k * k * 120; pitch = 0; thrust = 0.7; }
    else { thrust = 0.2 * (1 - (T0 - 92) / 3); }
    ship.visible = !hidden;
    ship.position.set(shipHome.x, shipHome.y + y, shipHome.z + z); ship.rotation.x = pitch;
    for (const f of thrusters) { f.material.opacity = thrust * (0.55 + Math.random() * 0.25); f.scale.y = 0.7 + thrust * 0.5 + Math.random() * 0.15; }
  });

  // ── Hologram + studio + blinkers ──
  updaters.push((dt, t) => {
    for (const h of holo) { h.globe.rotation.y = t * 0.25; h.ring1.rotation.z = t * 0.4; h.ring2.rotation.z = -t * 0.3; }
    for (const s of spotCones) { s.pivot.rotation.z = Math.sin(t * 0.9 + s.ph) * 0.45; s.pivot.rotation.x = Math.cos(t * 0.7 + s.ph * 1.3) * 0.35; }
    for (const b of blinkers) b.m.visible = Math.sin(t * 3 + b.ph) > 0.3;
  });
  let ledAcc = 0;
  updaters.push((dt, t) => { ledAcc += dt; if (ledAcc > 0.08) { ledAcc = 0; led.update(t); floor.update(t); } });

  // ── Effects ──
  const fx = [];
  const beamMat = () => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { c: { value: new THREE.Color('#7fe7ff') }, k: { value: 1 }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float k; uniform float t; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * (0.55 + 0.45*sin(vUv.y*40.0 - t*12.0)); gl_FragColor = vec4(c * 1.8, a * k); }',
  });
  const sparkTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

  function beam(pos, color = '#7fe7ff', life = 1.9) {
    if (fx.length > 36) return;
    const g = new THREE.Group(); g.position.copy(pos);
    const m = beamMat(); m.uniforms.c.value.set(color);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 40, 32, 1, true), m); cyl.position.y = 20; g.add(cyl);
    const ringM = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 48), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
    const n = 90, geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, d = Math.random() * 0.9; p.set([Math.cos(a) * d, Math.random() * 2, Math.sin(a) * d], i * 3); v.push(0.5 + Math.random() * 3); }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.18, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); g.add(pts);
    const light = quality === 'high' ? new THREE.PointLight(color, 18, 12, 2) : { intensity: 0 };
    if (light.isLight) { light.position.y = 2; g.add(light); }
    scene.add(g);
    fx.push({ life, age: 0, update(dt) {
      this.age += dt; const k = this.age / life, fade = (k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.4) / 0.5)) * 0.8;
      m.uniforms.k.value = fade; m.uniforms.t.value = this.age; ring.scale.setScalar(1 + k * 5); ringM.opacity = (1 - k);
      const a = geo.attributes.position; for (let i = 0; i < n; i++) a.setY(i, (a.getY(i) + dt * v[i]) % 6); a.needsUpdate = true;
      pts.material.opacity = fade; light.intensity = 18 * fade;
    }, dispose() { scene.remove(g); geo.dispose(); cyl.geometry.dispose(); ring.geometry.dispose(); m.dispose(); ringM.dispose(); pts.material.dispose(); } });
  }

  function fireworks(center, bursts = 6) {
    if (fx.length > 24) return;
    bursts = Math.min(bursts, quality === 'low' ? 2 : 6);
    for (let b = 0; b < bursts; b++) {
      const delay = b * 0.45 + Math.random() * 0.3, n = 160;
      const origin = center.clone().add(V((Math.random() - 0.5) * 26, 24 + Math.random() * 16, (Math.random() - 0.5) * 26));
      const color = new THREE.Color().setHSL(Math.random(), 0.9, 0.62);
      const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), vel = [];
      for (let i = 0; i < n; i++) { const d = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(7 + Math.random() * 6); vel.push(d); p.set([origin.x, origin.y, origin.z], i * 3); }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const mat = new THREE.PointsMaterial({ color, size: 0.7, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
      const flash = quality === 'high' ? new THREE.PointLight(color, 0, 80, 1.5) : { intensity: 0 };
      if (flash.isLight) { flash.position.copy(origin); scene.add(flash); }
      fx.push({ life: delay + 2.6, age: 0, update(dt) {
        this.age += dt; const t = this.age - delay; if (t < 0) return;
        const a = geo.attributes.position;
        for (let i = 0; i < n; i++) { const v = vel[i]; v.y -= 6 * dt; v.multiplyScalar(1 - 1.2 * dt); a.setXYZ(i, a.getX(i) + v.x * dt, a.getY(i) + v.y * dt, a.getZ(i) + v.z * dt); }
        a.needsUpdate = true; mat.opacity = Math.max(0, 1 - t / 2.6); flash.intensity = Math.max(0, 800 * (1 - t * 3));
      }, dispose() { scene.remove(pts); if (flash.isLight) scene.remove(flash); geo.dispose(); mat.dispose(); } });
    }
  }

  function hearts(pos, emoji = '❤️', count = 6) {
    if (fx.length > 36) return;
    count = Math.min(count, quality === 'low' ? 3 : 8);
    const tex = T.heartSprite(emoji);
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.position.copy(pos).add(V((Math.random() - 0.5) * 0.8, Math.random() * 0.3, (Math.random() - 0.5) * 0.8)); s.scale.setScalar(0.001); scene.add(s);
      const vy = 0.6 + Math.random() * 0.6, d = i * 0.12;
      fx.push({ life: 2.2 + d, age: 0, update(dt) { this.age += dt; const t = this.age - d; if (t < 0) return; s.position.y += vy * dt; s.position.x += Math.sin(t * 5 + i) * 0.004; const k = Math.min(1, t * 4); s.scale.setScalar(0.35 * k); s.material.opacity = 1 - Math.max(0, (t - 1.2) / 1); }, dispose() { scene.remove(s); s.material.dispose(); } });
    }
  }

  // Big gift: a second ship sweeps low over the colony.
  const flyShip = ship.clone(); flyShip.visible = false; scene.add(flyShip);
  const flyThrust = []; flyShip.traverse(o => { if (o.isMesh && o.material?.blending === THREE.AdditiveBlending) { o.material = o.material.clone(); flyThrust.push(o); } });
  function flyover(target) {
    const from = target.clone().add(V(-160, 40, 90)), to = target.clone().add(V(160, 55, -90));
    flyShip.visible = true;
    fx.push({ life: 7, age: 0, update(dt) {
      this.age += dt; const k = this.age / 7, e = k;
      const p = from.clone().lerp(to, e); p.y += Math.sin(k * Math.PI) * -18; flyShip.position.copy(p);
      flyShip.lookAt(to.clone().add(V(0, -8, 0))); flyShip.rotateZ(Math.sin(k * Math.PI) * 0.35);
      for (const f of flyThrust) f.material.opacity = 0.75;
    }, dispose() { flyShip.visible = false; } });
  }

  // ── Day / night ──
  const env = { day: 1, night: 0 };
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const envSky = makeSky(); envSky.material = sky.material; envScene.add(envSky);
  let envTarget = null, envTimer = 99;
  const keys = {
    hemiSky: [new THREE.Color('#1b2340'), new THREE.Color('#ffc8a0'), new THREE.Color('#ffe2c6')],
    hemiGround: [new THREE.Color('#120a10'), new THREE.Color('#4a2216'), new THREE.Color('#7a3a22')],
    sun: [new THREE.Color('#ff9a5a'), new THREE.Color('#fff0dc')],
    fog: [new THREE.Color('#0c0b14'), new THREE.Color('#7a5c63'), new THREE.Color('#d9a273')],
  };
  const tmp = new THREE.Color();
  function applyDay(dayTime) {
    // dayTime 0..1 → 0.25 sunrise, 0.5 noon, 0.75 sunset
    const ang = (dayTime - 0.25) * Math.PI * 2;
    const sd = V(Math.cos(ang) * 0.8, Math.sin(ang), 0.45).normalize();
    const elev = sd.y;
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.3);
    const dusk = Math.max(0, 1 - Math.abs(elev - 0.03) / 0.22) * 0.95;
    env.day = day; env.night = 1 - day; env.sunDir = sd;
    sky.material.uniforms.sunDir.value.copy(sd); sky.material.uniforms.day.value = day; sky.material.uniforms.dusk.value = dusk;
    sun.intensity = 2.5 * THREE.MathUtils.smoothstep(elev, -0.05, 0.25);
    sun.color.copy(keys.sun[0]).lerp(keys.sun[1], THREE.MathUtils.smoothstep(elev, 0.02, 0.4));
    hemi.color.copy(keys.hemiSky[0]).lerp(day > 0.5 ? keys.hemiSky[2] : keys.hemiSky[1], day);
    hemi.groundColor.copy(keys.hemiGround[0]).lerp(keys.hemiGround[2], day);
    hemi.intensity = 0.55 + day * 0.3;
    moonLight.intensity = (1 - day) * 0.9;
    tmp.copy(keys.fog[0]).lerp(keys.fog[1], Math.min(1, day * 2)).lerp(keys.fog[2], Math.max(0, day * 2 - 1));
    scene.fog.color.copy(tmp);
    renderer.toneMappingExposure = 0.82 + (1 - day) * 0.3;
    for (const m of glowMats) {
      const n = m.userData.nightGlow ?? 1, d = m.userData.dayGlow ?? 0.08;
      m.emissiveIntensity = d + (n * 0.6 - d) * env.night;
    }
    for (const P of Object.values(places)) if (P.extra.light && P.id !== 'studio') P.extra.light.intensity = 25 * env.night + 2;
    for (const o of scene.children) { /* bio trees handled through glowMats */ }
  }
  // bio tree leaves glow at night
  scene.traverse(o => { if (o.isMesh && o.material?.userData?.nightGlow && !glowMats.has(o.material)) { o.material.userData.dayGlow = 0; glowMats.add(o.material); } });

  let dayTime = 0.38, daySpeed = 1 / 480; // one Mars day = 8 minutes
  const focus = V();
  function update(dt, t, camera) {
    dayTime = (dayTime + dt * daySpeed) % 1;
    applyDay(dayTime);
    sky.material.uniforms.time.value = t;
    sky.position.copy(camera.position);
    phobos.position.set(Math.cos(t * 0.01 + 1) * 900, 260 + Math.sin(t * 0.01) * 120, Math.sin(t * 0.01 + 1) * 900);
    deimos.position.set(Math.cos(-t * 0.004 + 4) * 1000, 380, Math.sin(-t * 0.004 + 4) * 1000);
    earth.material.opacity = env.night;
    sun.position.copy(focus).addScaledVector(env.sunDir.y > 0 ? env.sunDir : V(0.3, 1, 0.2).normalize(), 120);
    sun.target.position.copy(focus);
    for (const u of updaters) u(dt, t);
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.update(dt); if (f.age >= f.life) { f.dispose(); fx.splice(i, 1); } }
    envTimer += dt;
    if (!envTarget || (quality === 'high' && envTimer > 60)) { envTimer = 0; const old = envTarget; envTarget = pmrem.fromScene(envScene, 0, 1, 2000); scene.environment = envTarget.texture; old?.dispose(); }
  }

  return {
    places, obstacles, update, env,
    setFocus: v => focus.copy(v),
    setDayTime: v => { dayTime = ((v % 1) + 1) % 1; envTimer = 99; },
    getDayTime: () => dayTime,
    setDaySpeed: v => { daySpeed = v; },
    beam, fireworks, hearts, flyover,
  };
}
