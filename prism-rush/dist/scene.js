import * as THREE from 'three';
import { COLS, ROWS } from './engine.js';
import { clamp01, smooth, sampleDrop, dropTiming } from './motion.js';
import { avatarCanvas } from './avatars.js';

const PALETTE = [0xf43878, 0xff8835, 0xffca35, 0x42d999, 0x31bff5, 0xa669f0];
const position = i => ({ x: (i % COLS - 3) * 1.25, y: (3.5 - Math.floor(i / COLS)) * 1.05 });
const ease = t => 1 - Math.pow(1 - t, 3);
// Overshoot-and-settle curve for swaps (classic cartoon follow-through).
const easeOutBack = (t, k = 1.55) => { const u = t - 1; return 1 + (k + 1) * u * u * u + k * u * u; };
const rand = (a, b) => a + Math.random() * (b - a);
function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function polygon(points) { const s = new THREE.Shape(); points.forEach((p, i) => i ? s.lineTo(...p) : s.moveTo(...p)); s.closePath(); return s; }
function extrude(shape, depth = .25, bevel = .055) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, steps: 1, curveSegments: 12 });
  g.translate(0, 0, -depth / 2); return g;
}
function gemGeometries() {
  const heart = new THREE.Shape();
  heart.moveTo(0, -.43); heart.bezierCurveTo(-.1, -.28, -.48, -.04, -.48, .21); heart.bezierCurveTo(-.48, .53, -.12, .56, 0, .3); heart.bezierCurveTo(.12, .56, .48, .53, .48, .21); heart.bezierCurveTo(.48, -.04, .1, -.28, 0, -.43);
  const star = Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? .24 : .51; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const diamond = new THREE.OctahedronGeometry(.59); diamond.scale(.82, 1, .55);
  const purple = new THREE.DodecahedronGeometry(.48, 0); purple.scale(1, 1.02, .7);
  const orange = extrude(roundedRect(.67, .67, .12), .38, .09); orange.rotateZ(Math.PI / 4);
  const emerald = extrude(polygon([[-.25,-.38],[.25,-.38],[.4,-.2],[.4,.2],[.25,.38],[-.25,.38],[-.4,.2],[-.4,-.2]]), .32, .075);
  const geometries = [extrude(heart, .3, .07), orange, extrude(polygon(star), .3, .055), emerald, diamond, purple];
  // Vertex tints sharpen the cut edges without extra meshes or draw calls.
  for (const geo of geometries) {
    const vertex = geo.getAttribute('position'), normal = geo.getAttribute('normal'), colors = [];
    for (let i = 0; i < vertex.count; i++) {
      const shade = normal.getZ(i) > .75 ? 1 : .65 + .16 * Math.max(0, normal.getY(i));
      colors.push(shade, shade, shade);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  return geometries;
}

export class ReactorScene {
  constructor(container, onFrame) {
    this.container = container; this.onFrame = onFrame;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-5, 5, 4.55, -4.55, .1, 100);
    this.camera.position.set(0, 0, 18); this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0xffecff, .95));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 6, 9); this.scene.add(key); this.keyLight = key;
    const fill = new THREE.DirectionalLight(0x9ebfff, .7); fill.position.set(5, -2, 5); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffa4f8, .6); rim.position.set(-4, -4, 3); this.scene.add(rim);
    const studio = document.createElement('canvas'); studio.width = 512; studio.height = 256;
    const ctx = studio.getContext('2d'); ctx.fillStyle = '#454052'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#fff7e9'; ctx.fillRect(70, 45, 105, 22); ctx.fillStyle = '#d6e6ff'; ctx.fillRect(330, 80, 55, 90);
    ctx.fillStyle = '#b5a2cb'; ctx.fillRect(0, 190, 512, 60);
    const env = new THREE.CanvasTexture(studio); env.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer); this.environment = pmrem.fromEquirectangular(env);
    this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .55; env.dispose(); pmrem.dispose();
    this.geometries = gemGeometries();
    this.materials = PALETTE.map(color => new THREE.MeshPhysicalMaterial({ color, vertexColors: true, roughness: .19, metalness: .12, clearcoat: 1, clearcoatRoughness: .12, emissive: color, emissiveIntensity: .02 }));
    this.prismGeometry = new THREE.IcosahedronGeometry(.47, 0);
    const pc = [], attr = this.prismGeometry.getAttribute('position');
    for (let i = 0; i < attr.count; i++) { const c = new THREE.Color().setHSL((Math.floor(i / 3) * .137) % 1, .8, .68); pc.push(c.r, c.g, c.b); }
    this.prismGeometry.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
    this.prismMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: .15, roughness: .23, clearcoat: 1 });
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0xfff7dc, transparent: true, opacity: .85 });
    this.haloMat = new THREE.MeshBasicMaterial({ color: 0xd2ffe4, transparent: true, opacity: .72 });
    this.lineGeo = new THREE.BoxGeometry(.72, .065, .04); this.haloGeo = new THREE.TorusGeometry(.5, .018, 5, 40);
    this.novaGeo = new THREE.TorusGeometry(.22, .045, 6, 16);
    this.items = new Map(); this.particles = Array.from({ length: 640 }, () => ({ life: 0 })); this.particleCursor = 0;
    this.particleMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.045, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 640);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.particleMesh.frustumCulled = false; this.scene.add(this.particleMesh);
    this.dummy = new THREE.Object3D(); this.color = new THREE.Color(); this.white = new THREE.Color(0xffffff);
    this.rings = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(.42, .46, 48), new THREE.MeshBasicMaterial({ color: 0xb8ffdf, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); m.visible = false; this.scene.add(m); return { mesh: m, life: 0, max: .45 }; });
    this.makeEffects(); this.makeHQ();
    this.makeGrid(); this.lastPhase = -1; this.snapshot = null; this.received = 0;
    this.clearSet = new Set(); this.dropMap = new Map(); this.swapMap = new Map(); this.phaseAge = 0; this.shake = 0;
    this.ratio = Math.min(devicePixelRatio || 1, 1.5); this.lowFrames = 0; this.frameCount = 0; this.frameTime = performance.now(); this.previousTime = this.frameTime; this.fps = 60;
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; document.getElementById('error-cover').hidden = false; });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.lost = false; document.getElementById('error-cover').hidden = true; this.resize(); });
    requestAnimationFrame(t => this.frame(t));
  }
  makeEffects() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba(255,255,255,1)'); gradient.addColorStop(.18,'rgba(255,255,255,.9)'); gradient.addColorStop(.5,'rgba(255,255,255,.25)'); gradient.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64);
    this.glowTexture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: this.glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.flashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1), material.clone(), 56); this.flashes.count = 0; this.flashes.frustumCulled = false; this.scene.add(this.flashes);
    this.trails = new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1), material.clone(), 640); this.trails.count = 0; this.trails.frustumCulled = false; this.scene.add(this.trails);
    this.beams = Array.from({ length: 14 }, () => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1), material.clone()); mesh.visible = false; this.scene.add(mesh); return { mesh, life: 0, max: .32 }; });
    this.targets = Array.from({ length: 10 }, () => { const mesh = new THREE.Mesh(new THREE.TorusGeometry(.52,.022,5,40), this.haloMat); mesh.visible = false; this.scene.add(mesh); return mesh; });
    const headGeo = new THREE.SphereGeometry(.15,10,8), headMat = new THREE.MeshBasicMaterial({ color: 0xfff4cf, toneMapped: false }), glowMat = material.clone(); glowMat.color.set(0xff8e55);
    const tailGeo = new THREE.ConeGeometry(.13,1.35,6), tailMat = new THREE.MeshBasicMaterial({ color: 0xffb46d, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending });
    this.comets = Array.from({ length: 3 }, () => {
      const comet = new THREE.Group(), tail = new THREE.Mesh(tailGeo, tailMat); tail.position.y = .65;
      comet.add(new THREE.Mesh(headGeo, headMat), new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.1), glowMat), tail); comet.visible = false; this.scene.add(comet); return comet;
    });
  }
  // HQ effects layer: star sparkles, 3D crystal shards, confetti ribbons and
  // idle twinkles. Each is one instanced draw call with a fixed pool.
  makeHQ() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), r = g.createRadialGradient(64,64,0,64,64,64);
    r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(.12,'rgba(255,255,255,.85)'); r.addColorStop(.35,'rgba(255,255,255,.18)'); r.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0,0,128,128); g.fillStyle = '#fff';
    for (const [w, h] of [[7, 62], [62, 7]]) { g.beginPath(); g.moveTo(64 - w, 64); g.quadraticCurveTo(64, 64, 64, 64 - h); g.quadraticCurveTo(64, 64, 64 + w, 64); g.quadraticCurveTo(64, 64, 64, 64 + h); g.quadraticCurveTo(64, 64, 64 - w, 64); g.fill(); }
    this.starTexture = new THREE.CanvasTexture(c);
    const starMat = new THREE.MeshBasicMaterial({ map: this.starTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const pool = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, this.white); this.scene.add(m); return m; };
    this.sparkMesh = pool(new THREE.PlaneGeometry(1,1), starMat, 480); this.sparks = Array.from({ length: 480 }, () => ({ life: 0 })); this.sparkCursor = 0;
    const shardGeo = new THREE.TetrahedronGeometry(.16, 0); shardGeo.scale(1, 1.5, .55);
    this.shardMesh = pool(shardGeo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .16, metalness: .1, clearcoat: 1, emissive: 0x3a3a3a, emissiveIntensity: 1 }), 420); this.shards = Array.from({ length: 420 }, () => ({ life: 0 })); this.shardCursor = 0;
    this.confettiMesh = pool(new THREE.PlaneGeometry(.17,.08), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }), 260); this.confettiBits = Array.from({ length: 260 }, () => ({ life: 0 })); this.confettiCursor = 0;
    this.twinkles = Array.from({ length: 4 }, () => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1), starMat); mesh.visible = false; this.scene.add(mesh); return { mesh, life: 0, max: .6 }; });
    this.nextTwinkle = 0; this.nextCometSpark = 0;
  }
  spark(x, y, color, { speed = 2.4, size = .55, life = .6, z = .7, up = .6, gravity = 2 } = {}) {
    const p = this.sparks[this.sparkCursor++ % this.sparks.length], a = Math.random() * Math.PI * 2, v = speed * rand(.35, 1);
    Object.assign(p, { x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v + up, life: life * rand(.7, 1.2), size: size * rand(.6, 1.3), color, rot: Math.random() * 3, spin: rand(-6, 6), gravity }); p.max = p.life;
  }
  shatter(x, y, color, count) {
    for (let n = 0; n < count; n++) {
      const p = this.shards[this.shardCursor++ % this.shards.length], a = (n / count) * Math.PI * 2 + rand(-.3, .3), v = rand(2.2, 4.6);
      Object.assign(p, { x: x + Math.cos(a) * .15, y: y + Math.sin(a) * .15, z: .55, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1.6, vz: rand(.5, 2.5), rx: Math.random() * 6, ry: Math.random() * 6, sx: rand(-12, 12), sy: rand(-12, 12), life: rand(.5, .75), size: rand(.95, 1.55), color, delay: .05 }); p.max = p.life;
    }
  }
  dust(x, y) { if (this.reduced) return; for (let n = 0; n < 2; n++) this.spark(x + rand(-.3, .3), y, 0xd9c8ff, { speed: .9, size: .32, life: .35, up: .2, gravity: 0, z: .3 }); }
  makeGrid() {
    const plateGeo = extrude(roundedRect(1.13, .95, .12), .09, .015);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, metalness: .05 });
    const plates = new THREE.InstancedMesh(plateGeo, plateMat, COLS * ROWS);
    const shade = new THREE.Color();
    for (let i = 0; i < COLS * ROWS; i++) { const p = position(i); this.dummy.position.set(p.x, p.y, -.38); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); plates.setMatrixAt(i, this.dummy.matrix); plates.setColorAt(i, shade.set(i % 2 ? '#30243f' : '#352947')); }
    this.scene.add(plates);
    const shadow = new THREE.InstancedMesh(new THREE.CircleGeometry(.4, 20), new THREE.MeshBasicMaterial({ color: 0x090213, transparent: true, opacity: .3, depthWrite: false }), COLS * ROWS);
    for (let i = 0; i < COLS * ROWS; i++) { const p = position(i); this.dummy.position.set(p.x + .03, p.y - .1, -.3); this.dummy.scale.set(1.1, .85, 1); this.dummy.updateMatrix(); shadow.setMatrixAt(i, this.dummy.matrix); }
    this.scene.add(shadow);
    // Ice (jelly-style cell layers). One instanced draw call; thicker and
    // brighter per layer. Lives between the plate and the gem.
    this.iceMesh = new THREE.InstancedMesh(extrude(roundedRect(1.08, .9, .14), .06, .03), new THREE.MeshPhysicalMaterial({ color: 0x9fdcff, roughness: .12, metalness: 0, transparent: true, opacity: .78, clearcoat: 1, emissive: 0x2f8fe0, emissiveIntensity: .55, depthWrite: false }), COLS * ROWS);
    this.iceMesh.count = 0; this.iceMesh.frustumCulled = false; this.scene.add(this.iceMesh);
    this.iceFrost = new THREE.InstancedMesh(new THREE.RingGeometry(.36, .41, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, depthWrite: false }), COLS * ROWS);
    this.iceFrost.count = 0; this.iceFrost.frustumCulled = false; this.scene.add(this.iceFrost);
    this.iceSignature = '';
  }
  updateIce(ice = []) {
    const signature = ice.join('');
    if (signature === this.iceSignature) return; this.iceSignature = signature;
    let n = 0, f = 0; const tint = new THREE.Color();
    ice.forEach((layers, i) => {
      if (!layers) return; const p = position(i);
      this.dummy.position.set(p.x, p.y, -.31); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(1, 1, 1 + layers * .6); this.dummy.updateMatrix();
      this.iceMesh.setMatrixAt(n, this.dummy.matrix); this.iceMesh.setColorAt(n, tint.set(layers >= 3 ? 0x5fb0ff : layers === 2 ? 0x8fd0ff : 0xc8eeff)); n++;
      for (let k = 0; k < Math.min(layers, 3); k++) { this.dummy.position.set(p.x, p.y, -.2 + k * .01); this.dummy.rotation.set(0, 0, k * .5 + i); this.dummy.scale.setScalar(1 - k * .28); this.dummy.updateMatrix(); this.iceFrost.setMatrixAt(f++, this.dummy.matrix); }
    });
    this.iceMesh.count = n; this.iceFrost.count = f;
    this.iceMesh.instanceMatrix.needsUpdate = true; if (this.iceMesh.instanceColor) this.iceMesh.instanceColor.needsUpdate = true; this.iceFrost.instanceMatrix.needsUpdate = true;
  }
  resize() {
    const r = this.container.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setPixelRatio(this.ratio); this.renderer.setSize(w, h, false);
    const aspect = w / h; this.camera.left = -4.55 * aspect; this.camera.right = 4.55 * aspect; this.camera.updateProjectionMatrix();
  }
  // Joker piece: the gifter's photo on a gold coin. One texture per gifter,
  // refreshed when the photo finishes loading.
  jokerTexture(owner) {
    this.jokerTextures ||= new Map();
    const person = this.snapshot?.people?.[owner] || {};
    let entry = this.jokerTextures.get(owner);
    if (entry && !entry.photo && person.photo) { entry.texture.dispose(); entry.material.dispose(); entry = null; }
    if (!entry) {
      const a = avatarCanvas(owner, person, 128), texture = new THREE.CanvasTexture(a.canvas);
      texture.colorSpace = THREE.SRGBColorSpace; a.listeners.add(() => { texture.needsUpdate = true; });
      entry = { texture, photo: !!person.photo, material: new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }) };
      this.jokerTextures.set(owner, entry);
      if (this.jokerTextures.size > 80) { const [key, old] = this.jokerTextures.entries().next().value; old.texture.dispose(); old.material.dispose(); this.jokerTextures.delete(key); }
    }
    return entry.material;
  }
  jokerVisual(tile) {
    const group = new THREE.Group(), core = new THREE.Group();
    this.coinGeo ||= new THREE.CylinderGeometry(.53, .53, .16, 40);
    this.coinMat ||= new THREE.MeshPhysicalMaterial({ color: 0xffc94a, metalness: .85, roughness: .25, clearcoat: 1, emissive: 0x6b3a00, emissiveIntensity: .25 });
    this.faceGeo ||= new THREE.CircleGeometry(.49, 40);
    const coin = new THREE.Mesh(this.coinGeo, this.coinMat); coin.rotation.x = Math.PI / 2;
    const face = new THREE.Mesh(this.faceGeo, this.jokerTexture(tile.joker)); face.position.z = .085;
    core.add(coin, face); group.add(core);
    const halo = new THREE.Mesh(this.haloGeo, this.jokerHalo ||= new THREE.MeshBasicMaterial({ color: 0xffd25e, transparent: true, opacity: .85 })); halo.position.z = .1; halo.scale.setScalar(1.05); group.add(halo);
    this.scene.add(group); return { group, core, halo, signature: `J:${tile.joker}`, index: 0, joker: true };
  }
  visual(tile) {
    if (tile.joker) return this.jokerVisual(tile);
    const group = new THREE.Group();
    const core = new THREE.Mesh(tile.special === 'prism' ? this.prismGeometry : this.geometries[tile.color], tile.special === 'prism' ? this.prismMaterial : this.materials[tile.color]);
    group.add(core);
    let halo = null;
    if (tile.special === 'row' || tile.special === 'column') {
      for (const offset of [-.12, .12]) { const line = new THREE.Mesh(this.lineGeo, this.lineMat); line.position.set(0, offset, .31); if (tile.special === 'column') { line.rotation.z = Math.PI / 2; line.position.set(offset, 0, .31); } group.add(line); }
    }
    if (tile.special === 'nova') { const ring = new THREE.Mesh(this.novaGeo, this.lineMat); ring.position.z = .35; group.add(ring); }
    if (tile.special) { halo = new THREE.Mesh(this.haloGeo, this.haloMat); halo.position.z = .04; if (tile.special === 'prism') halo.rotation.x = .65; group.add(halo); }
    this.scene.add(group); return { group, core, halo, signature: `${tile.color}:${tile.special}`, index: 0, special: tile.special };
  }
  update(s) {
    const now = performance.now(), samePhase = this.snapshot?.phase.id === s.phase.id;
    const predicted = this.phaseAge + (this.snapshot?.paused ? 0 : (now - this.received) / 1000);
    this.phaseAge = Math.max((s.now - s.phase.start) / 1000, samePhase ? predicted : 0);
    this.snapshot = s; this.received = now; this.updateIce(s.ice);
    const liveIds = new Set();
    s.board.forEach((tile, i) => {
      if (!tile) return; liveIds.add(tile.id);
      let item = this.items.get(tile.id), signature = tile.joker ? `J:${tile.joker}` : `${tile.color}:${tile.special}`;
      if (item?.signature !== signature) { if (item) this.scene.remove(item.group); item = this.visual(tile); this.items.set(tile.id, item); }
      item.index = i;
    });
    for (const [id, item] of this.items) if (!liveIds.has(id)) { this.scene.remove(item.group); this.items.delete(id); }
    if (s.phase.id !== this.lastPhase) {
      this.lastPhase = s.phase.id;
      this.clearSet = new Set(s.phase.type === 'explode' ? s.phase.clear : []);
      this.dropMap = new Map((s.phase.drops || []).map(d => [d.id,d]));
      this.swapMap = new Map((s.phase.swaps || (s.phase.type === 'swap' ? [{ a: s.phase.a, b: s.phase.b }] : [])).flatMap(({ a, b }) => [[a, b], [b, a]]));
      if (s.phase.type === 'explode') {
        this.shake = this.reduced ? 0 : Math.min(.075, .018 + s.phase.clear.length * .001);
        const count = this.reduced ? 1 : s.phase.clear.length > 30 ? 9 : 15;
        const many = s.phase.clear.length > 30; let cx = 0, cy = 0;
        for (const i of s.phase.clear) {
          const p = position(i), joker = s.board[i]?.joker, color = joker ? 0xffd25e : PALETTE[s.board[i]?.color] || 0xd8a2ff; cx += p.x; cy += p.y;
          this.burst(p.x, p.y, color, joker ? count : Math.ceil(count / 2));
          if (!this.reduced) { this.shatter(p.x, p.y, color, many ? 3 : 6); for (let n = 0; n < (many ? 2 : 4); n++) this.spark(p.x, p.y, color); }
          if (joker) { this.ring(p.x, p.y, 0xffd25e); if (!this.reduced) for (let n = 0; n < 10; n++) this.spark(p.x, p.y, 0xffe08a, { speed: 3.4, size: .8 }); }
        }
        // One soft shockwave from the centre of a normal match.
        if (s.phase.clear.length && s.phase.clear.length <= 12) this.ring(cx / s.phase.clear.length, cy / s.phase.clear.length, PALETTE[s.board[s.phase.clear[0]]?.color] || 0xb8ffdf, 3.2);
        for (const i of s.phase.iceHit || []) { const p = position(i); this.burst(p.x, p.y, 0xdff6ff, this.reduced ? 1 : 10); }
        for (const i of s.phase.activated.slice(0, 10)) {
          const p = position(i), special = s.board[i]?.special;
          this.ring(p.x,p.y,special === 'nova' ? 0xffb671 : 0xbeffdf);
          if (special === 'row') this.beam(-4.6,p.y,4.6,p.y,0xffedba);
          else if (special === 'column') this.beam(p.x,-4.4,p.x,4.4,0xffedba);
          else if (special === 'prism') for (const j of s.phase.clear.filter((_,n) => n % Math.max(1,Math.floor(s.phase.clear.length/9)) === 0).slice(0,9)) { const target = position(j); this.beam(p.x,p.y,target.x,target.y,PALETTE[s.board[j]?.color] || 0xdbb5ff,.09); }
        }
      }
      if (s.phase.type === 'power' || s.phase.type === 'finale') for (const i of s.phase.indices || [s.phase.index]) { const p = position(i); this.ring(p.x, p.y, s.phase.type === 'finale' ? 0xffe39a : 0xb8ffdf); }
      if (s.phase.type === 'levelComplete') this.confetti();
    }
  }
  burst(x, y, color, count) {
    for (let n = 0; n < count; n++) {
      const p = this.particles[this.particleCursor++ % this.particles.length], angle = Math.random() * Math.PI * 2, speed = .8 + Math.random() * 2.8;
      Object.assign(p, { x, y, z: .5, vx: Math.cos(angle) * speed * 1.5, vy: Math.sin(angle) * speed * 1.5 + .5, vz: Math.random() * 1.3, life: .3 + Math.random() * .38, color, size: .65 + Math.random() * 1.5, spark: n % 3 === 0 });
    }
  }
  confetti() {
    if (this.reduced) return;
    for (let i = 0; i < 6; i++) this.burst((Math.random() - .5) * 8, 3 + Math.random() * 2, PALETTE[i % 6], 8);
    // Ribbon confetti: flutters and tumbles down over the board.
    for (let n = 0; n < 220; n++) { const p = this.confettiBits[this.confettiCursor++ % this.confettiBits.length]; Object.assign(p, { x: rand(-5.5, 5.5), y: rand(4.6, 7.5), z: rand(.8, 1.6), vx: rand(-.6, .6), vy: rand(-1.4, -.4), rot: Math.random() * 6, spin: rand(-5, 5), flip: Math.random() * 6, flipSpeed: rand(6, 13), sway: Math.random() * 6, life: rand(2.6, 4.2), color: PALETTE[n % 6] }); }
    for (let n = 0; n < 40; n++) this.spark(rand(-4.5, 4.5), rand(-3, 4), PALETTE[n % 6], { speed: 1, size: .7, life: 1.1, up: .4, gravity: .4 });
  }
  ring(x, y, color = 0xb8ffdf, grow = 10) { if (this.reduced) return; const r = this.rings.find(r => r.life <= 0) || this.rings[0]; r.life = r.max; r.grow = grow; r.mesh.position.set(x, y, .6); r.mesh.material.color.set(color); r.mesh.visible = true; }
  beam(x1,y1,x2,y2,color,width=.23) {
    if (this.reduced) return;
    const beam = this.beams.find(b => b.life <= 0) || this.beams[0]; beam.life = beam.max;
    beam.mesh.position.set((x1+x2)/2,(y1+y2)/2,.65); beam.mesh.scale.set(Math.hypot(x2-x1,y2-y1)+.2,width,1); beam.mesh.rotation.z = Math.atan2(y2-y1,x2-x1); beam.mesh.material.color.set(color); beam.mesh.visible = true;
  }
  tap(clientX,clientY) {
    if (this.reduced) return;
    const r = this.container.getBoundingClientRect();
    const x = clientX === undefined ? 0 : this.camera.left + (clientX-r.left)/r.width*(this.camera.right-this.camera.left);
    const y = clientY === undefined ? -3.8 : this.camera.top - (clientY-r.top)/r.height*(this.camera.top-this.camera.bottom);
    this.burst(x,y,0xffa6e9,4); this.spark(x,y,0xffd1f3,{ speed: 1.6, size: .5, life: .45 }); this.spark(x,y,0xffffff,{ speed: 1.2, size: .35, life: .4 });
  }
  // Idle life: gem twinkles, shimmering special lines, slowly moving key light.
  updateAmbient(time, s) {
    this.keyLight.position.x = -3 + Math.sin(time * .00035) * 2.2; this.keyLight.position.y = 6 + Math.cos(time * .00027) * 1.2;
    this.lineMat.opacity = .72 + .22 * Math.sin(time * .006);
    const quiet = s.phase.type === 'idle' || s.phase.type === 'wait' || s.phase.type === 'pending' || s.phase.type === 'fall';
    if (quiet && time > this.nextTwinkle && this.items.size) {
      this.nextTwinkle = time + rand(260, 620);
      const list = [...this.items.values()], item = list[Math.floor(Math.random() * list.length)], tw = this.twinkles.find(t => t.life <= 0);
      if (tw && item) { const p = position(item.index); tw.life = tw.max; tw.mesh.position.set(p.x - .2 + rand(-.05, .08), p.y + .2 + rand(-.05, .05), .62); tw.mesh.visible = true; }
    }
    for (const comet of this.comets) if (comet.visible && time > this.nextCometSpark) { this.spark(comet.position.x, comet.position.y, 0xffc27a, { speed: .8, size: .6, life: .5, up: .3 }); }
    if (time > this.nextCometSpark) this.nextCometSpark = time + 30;
  }
  updateHQ(dt) {
    for (const t of this.twinkles) { if (t.life <= 0) { t.mesh.visible = false; continue; } t.life -= dt; const u = 1 - t.life / t.max, k = Math.sin(u * Math.PI); t.mesh.scale.setScalar(.05 + .62 * k); t.mesh.rotation.z = u * 1.4; }
    let n = 0;
    for (const p of this.sparks) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) continue;
      const drag = Math.exp(-dt * 2.6); p.vx *= drag; p.vy = p.vy * drag - p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      const u = 1 - p.life / p.max, k = p.size * Math.sqrt(Math.sin(Math.min(1, u * 1.15) * Math.PI)) + .001;
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(0, 0, p.rot); this.dummy.scale.set(k, k, 1); this.dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(n, this.dummy.matrix); this.sparkMesh.setColorAt(n, this.color.set(p.color).lerp(this.white, .35)); n++;
    }
    this.sparkMesh.count = n; if (n) { this.sparkMesh.instanceMatrix.needsUpdate = true; this.sparkMesh.instanceColor.needsUpdate = true; }
    n = 0;
    for (const p of this.shards) {
      if (p.life <= 0) continue; if (p.delay > 0) { p.delay -= dt; continue; } p.life -= dt; if (p.life <= 0) continue;
      p.vy -= dt * 9; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.sx * dt; p.ry += p.sy * dt;
      const k = p.size * Math.min(1, p.life / p.max * 2.2);
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(p.rx, p.ry, 0); this.dummy.scale.setScalar(k); this.dummy.updateMatrix();
      this.shardMesh.setMatrixAt(n, this.dummy.matrix); this.shardMesh.setColorAt(n, this.color.set(p.color)); n++;
    }
    this.shardMesh.count = n; if (n) { this.shardMesh.instanceMatrix.needsUpdate = true; this.shardMesh.instanceColor.needsUpdate = true; }
    n = 0;
    for (const p of this.confettiBits) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) continue;
      p.vy = Math.max(-1.7, p.vy - dt * 2.4); p.sway += dt * 3; p.x += (p.vx + Math.sin(p.sway) * .55) * dt; p.y += p.vy * dt; p.rot += p.spin * dt; p.flip += p.flipSpeed * dt;
      const fade = Math.min(1, p.life * 2);
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(0, p.flip, p.rot); this.dummy.scale.set(fade, fade, 1); this.dummy.updateMatrix();
      this.confettiMesh.setMatrixAt(n, this.dummy.matrix); this.confettiMesh.setColorAt(n, this.color.set(p.color).multiplyScalar(.75 + .25 * Math.abs(Math.cos(p.flip)))); n++;
    }
    this.confettiMesh.count = n; if (n) { this.confettiMesh.instanceMatrix.needsUpdate = true; this.confettiMesh.instanceColor.needsUpdate = true; }
  }
  frame(time) {
    requestAnimationFrame(t => this.frame(t));
    const dt = Math.min(.05, Math.max(0, (time - this.previousTime) / 1000)); this.previousTime = time;
    this.frameCount++;
    if (time - this.frameTime >= 1200) {
      this.fps = Math.round(this.frameCount * 1000 / (time - this.frameTime)); this.frameCount = 0; this.frameTime = time;
      if (document.visibilityState === 'visible' && this.fps < 49) this.lowFrames++; else this.lowFrames = 0;
      if (this.lowFrames >= 3 && this.ratio > .7) { this.ratio = Math.max(.7, this.ratio - .2); this.resize(); this.lowFrames = 0; }
    }
    const s = this.snapshot; this.flashes.count = 0; for (const comet of this.comets) comet.visible = false; for (const target of this.targets) target.visible = false;
    if (s) {
      const phase = s.phase, age = this.phaseAge + (s.paused ? 0 : (time - this.received) / 1000), progress = clamp01(age / (phase.duration / 1000 || 1));
      const clear = this.clearSet, drops = this.dropMap;
      if (phase.type === 'swap' || phase.type === 'power' || phase.type === 'finale') {
        const indices = phase.type === 'swap' ? [...this.swapMap.keys()] : phase.indices || [phase.index];
        indices.slice(0, this.targets.length).forEach((index,n) => { const target = this.targets[n], p = position(index); target.position.set(p.x,p.y,.42); target.scale.setScalar(1+Math.sin(progress*Math.PI)*.12); target.visible = true; });
      }
      if (phase.type === 'power' && phase.power === 'meteor' && !this.reduced) {
        (phase.indices || [phase.index]).forEach((index, n) => {
          const comet = this.comets[n]; if (!comet) return;
          const p = position(index), t = smooth(clamp01(progress * 1.15 - n * .07)), sx = 4.5 - n * 2.6;
          comet.position.set(THREE.MathUtils.lerp(sx,p.x,t)+Math.sin(t*Math.PI)*.7,THREE.MathUtils.lerp(5.8,p.y,t),1.2);
          comet.rotation.z = -Math.atan2(sx-p.x,5.8-p.y); comet.visible = t < 1;
        });
      }
      if (phase.type === 'explode' && !this.reduced) {
        const glow = Math.pow(Math.max(0,1-progress),2);
        this.flashes.material.opacity = glow * .6;
        phase.clear.forEach((index,n) => { const p = position(index); this.dummy.position.set(p.x,p.y,.5); this.dummy.rotation.set(0,0,0); this.dummy.scale.setScalar(1.1+progress*.8); this.dummy.updateMatrix(); this.flashes.setMatrixAt(n,this.dummy.matrix); this.flashes.setColorAt(n,this.color.set(PALETTE[s.board[index]?.color] || 0xd8a2ff).lerp(this.white,Math.max(0,1-progress*3.5)*.7)); });
        this.flashes.count = phase.clear.length; this.flashes.instanceMatrix.needsUpdate = true; if (this.flashes.instanceColor) this.flashes.instanceColor.needsUpdate = true;
      }
      for (const [id, item] of this.items) {
        const { group, core, halo, index } = item, p = position(index);
        let x = p.x, y = p.y, z = .02, scale = 1, scaleX = 1, scaleY = 1, rz = 0;
        let busy = false;
        if (phase.type === 'swap' && this.swapMap.has(index)) {
          // Anticipation (pull back + squash), travel with overshoot, stretch along the move.
          busy = true; const other = this.swapMap.get(index), target = position(other), dx = target.x - x, dy = target.y - y, ant = .16;
          if (progress < ant) { const a = Math.sin(progress / ant * Math.PI); x -= dx * .07 * a; y -= dy * .07 * a; scaleX = scaleY = 1 - .08 * a; }
          else {
            const u = clamp01((progress - ant) / (1 - ant)), t = easeOutBack(u), st = Math.sin(u * Math.PI);
            x += dx * t; y += dy * t; z += st * (index < other ? .6 : -.18);
            if (Math.abs(dx) > Math.abs(dy)) { scaleX = 1 + .2 * st; scaleY = 1 - .1 * st; } else { scaleY = 1 + .2 * st; scaleX = 1 - .1 * st; }
          }
        }
        if (phase.type === 'fall' && drops.has(id)) {
          busy = true; const drop = drops.get(id), elapsed = age*1000*(phase.speed || 1), motion = sampleDrop(drop,elapsed), fromY = (3.5-drop.from)*1.05;
          y = THREE.MathUtils.lerp(fromY,p.y,motion.progress)+motion.offset; scaleX = motion.scaleX; scaleY = motion.scaleY;
          // Stretch with speed while falling, squash on landing (spring in motion.js), puff of dust.
          const timing = dropTiming(drop), raw = clamp01((elapsed - timing.delay) / timing.travel);
          if (!motion.landed && raw > 0) { const v = 4 * raw * (1 - raw); scaleY *= 1 + .14 * v; scaleX *= 1 - .07 * v; }
          if (motion.landed && item.dustPhase !== phase.id) { item.dustPhase = phase.id; if (drop.to - drop.from >= 2) this.dust(p.x, p.y - .45); }
        }
        if (clear.has(index)) {
          // Swell and shiver, then spin-implode while the shards fly out.
          busy = true;
          if (progress < .18) { const a = progress / .18; scale = 1 + .28 * Math.sin(a * Math.PI / 2); rz = Math.sin(a * Math.PI * 4) * .07 * (1 - a); }
          else { const u = clamp01((progress - .18) / .62); scale = Math.max(.001, 1.28 * (1 - ease(u))); rz = u * 1.8 * (index % 2 ? 1 : -1); }
          z += progress * .5;
        }
        if (phase.type === 'power' && index === phase.index) { scale = 1 + Math.sin(progress * Math.PI) * .45; z += .6; rz = Math.sin(progress * Math.PI) * .6; }
        if (phase.type === 'shuffle') { scale = .7 + .3 * Math.abs(Math.cos(progress * Math.PI)); rz = Math.sin(progress * Math.PI) * .2; }
        if (phase.type === 'levelIntro') { const t = clamp01((age - .15 - (index % COLS) * .05 - Math.floor(index / COLS) * .035) / .45); scale = Math.max(.001, ease(t)); y += (1 - ease(t)) * 1.4; rz = (1 - t) * .8; }
        if (phase.type === 'finale' && index !== undefined && phase.indices?.includes(index)) { scale = 1 + Math.sin(progress * Math.PI) * .35; z += .5; }
        if (!busy && !this.reduced && !s.paused && phase.type !== 'levelIntro' && phase.type !== 'shuffle') {
          // Breathing wave across the board (procedural idle animation).
          const wave = Math.sin(time * .0021 - (index % COLS + Math.floor(index / COLS)) * .55);
          y += wave * .022; scaleX *= 1 + wave * .016; scaleY *= 1 - wave * .012;
        }
        group.position.set(x, y, z); group.scale.set(scale*scaleX,scale*scaleY,scale); group.rotation.z = rz;
        if (!this.reduced && !s.paused) {
          core.rotation.y = -.17 + Math.sin(time * .0009 + id) * .1; core.rotation.x = .14 + Math.sin(time * .0011 + id * .7) * .06;
          if (item.special === 'prism') core.rotation.y = time * .0016 + id;
          if (item.joker) { const cycle = (time * .00019 + id * .37) % 1; if (cycle < .12) core.rotation.y = smooth(cycle / .12) * Math.PI * 2; }
          if (halo) { halo.rotation.z = time * .001 + id; halo.scale.setScalar((item.joker ? 1.05 : 1) * (1 + .06 * Math.sin(time * .005 + id))); }
        }
      }
    }
    if (s && !this.reduced && !s.paused) this.updateAmbient(time, s);
    this.updateHQ(dt);
    let visible = 0, sparks = 0;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt; p.vy -= dt * 6; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const scale = Math.max(.001, p.size * Math.min(1, p.life * 4));
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.scale.set(scale*.7,scale,scale*.6); this.dummy.rotation.set(p.life*4,p.life*6,p.life*3); this.dummy.updateMatrix(); this.particleMesh.setMatrixAt(visible,this.dummy.matrix); this.particleMesh.setColorAt(visible,this.color.set(p.color)); visible++;
      if (p.spark && !this.reduced) { this.dummy.scale.set(.055*scale,.34*scale,1); this.dummy.rotation.set(0,0,-Math.atan2(p.vx,p.vy)); this.dummy.updateMatrix(); this.trails.setMatrixAt(sparks,this.dummy.matrix); this.trails.setColorAt(sparks,this.color.set(p.color).lerp(this.white,.4)); sparks++; }
    }
    this.particleMesh.count = visible;
    if (visible) { this.particleMesh.instanceMatrix.needsUpdate = true; if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true; }
    this.trails.count = sparks; if (sparks) { this.trails.instanceMatrix.needsUpdate = true; this.trails.instanceColor.needsUpdate = true; }
    for (const b of this.beams) { if (b.life<=0) { b.mesh.visible=false; continue; } b.life-=dt; b.mesh.material.opacity=Math.max(0,b.life/b.max)*.95; }
    for (const r of this.rings) { if (r.life <= 0) { r.mesh.visible = false; continue; } r.life -= dt; const t = 1 - r.life / r.max; r.mesh.scale.setScalar(1 + ease(t) * (r.grow || 10)); r.mesh.material.opacity = Math.max(0, (1 - t) * .7); }
    this.shake *= Math.exp(-dt*24); this.camera.position.x = this.reduced ? 0 : Math.sin(time*.065)*this.shake; this.camera.position.y = this.reduced ? 0 : Math.cos(time*.07)*this.shake*.65;
    if (!this.lost) this.renderer.render(this.scene, this.camera);
    this.onFrame?.(time, this.fps, this.ratio, this.renderer.info.render.calls);
  }
}
