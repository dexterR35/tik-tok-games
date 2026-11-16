import * as THREE from 'three';
import { COLS, ROWS } from './engine.js';
import { clamp01, smooth, sampleDrop } from './motion.js';

const PALETTE = [0xf43878, 0xff8835, 0xffca35, 0x42d999, 0x31bff5, 0xa669f0];
const position = i => ({ x: (i % COLS - 3) * 1.25, y: (3.5 - Math.floor(i / COLS)) * 1.05 });
const ease = t => 1 - Math.pow(1 - t, 3);
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
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 6, 9); this.scene.add(key);
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
    this.makeEffects();
    this.makeGrid(); this.lastPhase = -1; this.snapshot = null; this.received = 0;
    this.clearSet = new Set(); this.dropMap = new Map(); this.phaseAge = 0; this.shake = 0;
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
    this.targets = Array.from({ length: 2 }, () => { const mesh = new THREE.Mesh(new THREE.TorusGeometry(.52,.022,5,40), this.haloMat); mesh.visible = false; this.scene.add(mesh); return mesh; });
    this.comet = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(.15,10,8), new THREE.MeshBasicMaterial({ color: 0xfff4cf, toneMapped: false }));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.1), material.clone()); glow.material.color.set(0xff8e55);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.13,1.35,6), new THREE.MeshBasicMaterial({ color: 0xffb46d, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending })); tail.position.y = .65;
    this.comet.add(head,glow,tail); this.comet.visible = false; this.scene.add(this.comet);
  }
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
  }
  resize() {
    const r = this.container.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setPixelRatio(this.ratio); this.renderer.setSize(w, h, false);
    const aspect = w / h; this.camera.left = -4.55 * aspect; this.camera.right = 4.55 * aspect; this.camera.updateProjectionMatrix();
  }
  visual(tile) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(tile.special === 'prism' ? this.prismGeometry : this.geometries[tile.color], tile.special === 'prism' ? this.prismMaterial : this.materials[tile.color]);
    group.add(core);
    let halo = null;
    if (tile.special === 'row' || tile.special === 'column') {
      for (const offset of [-.12, .12]) { const line = new THREE.Mesh(this.lineGeo, this.lineMat); line.position.set(0, offset, .31); if (tile.special === 'column') { line.rotation.z = Math.PI / 2; line.position.set(offset, 0, .31); } group.add(line); }
    }
    if (tile.special === 'nova') { const ring = new THREE.Mesh(this.novaGeo, this.lineMat); ring.position.z = .35; group.add(ring); }
    if (tile.special) { halo = new THREE.Mesh(this.haloGeo, this.haloMat); halo.position.z = .04; if (tile.special === 'prism') halo.rotation.x = .65; group.add(halo); }
    this.scene.add(group); return { group, core, halo, signature: `${tile.color}:${tile.special}`, index: 0 };
  }
  update(s) {
    const now = performance.now(), samePhase = this.snapshot?.phase.id === s.phase.id;
    const predicted = this.phaseAge + (this.snapshot?.paused ? 0 : (now - this.received) / 1000);
    this.phaseAge = Math.max((s.now - s.phase.start) / 1000, samePhase ? predicted : 0);
    this.snapshot = s; this.received = now;
    const liveIds = new Set();
    s.board.forEach((tile, i) => {
      if (!tile) return; liveIds.add(tile.id);
      let item = this.items.get(tile.id), signature = `${tile.color}:${tile.special}`;
      if (item?.signature !== signature) { if (item) this.scene.remove(item.group); item = this.visual(tile); this.items.set(tile.id, item); }
      item.index = i;
    });
    for (const [id, item] of this.items) if (!liveIds.has(id)) { this.scene.remove(item.group); this.items.delete(id); }
    if (s.phase.id !== this.lastPhase) {
      this.lastPhase = s.phase.id;
      this.clearSet = new Set(s.phase.type === 'explode' ? s.phase.clear : []);
      this.dropMap = new Map((s.phase.drops || []).map(d => [d.id,d]));
      if (s.phase.type === 'explode') {
        this.shake = this.reduced ? 0 : Math.min(.075, .018 + s.phase.clear.length * .001);
        const count = this.reduced ? 1 : s.phase.clear.length > 30 ? 9 : 15;
        for (const i of s.phase.clear) { const p = position(i); this.burst(p.x, p.y, PALETTE[s.board[i]?.color] || 0xd8a2ff, count); }
        for (const i of s.phase.activated.slice(0, 6)) {
          const p = position(i), special = s.board[i]?.special;
          this.ring(p.x,p.y,special === 'nova' ? 0xffb671 : 0xbeffdf);
          if (special === 'row') this.beam(-4.6,p.y,4.6,p.y,0xffedba);
          else if (special === 'column') this.beam(p.x,-4.4,p.x,4.4,0xffedba);
          else if (special === 'prism') for (const j of s.phase.clear.filter((_,n) => n % Math.max(1,Math.floor(s.phase.clear.length/9)) === 0).slice(0,9)) { const target = position(j); this.beam(p.x,p.y,target.x,target.y,PALETTE[s.board[j]?.color] || 0xdbb5ff,.09); }
        }
      }
      if (s.phase.type === 'power') { const p = position(s.phase.index); this.ring(p.x, p.y); }
      if (s.phase.type === 'winner') this.confetti();
    }
  }
  burst(x, y, color, count) {
    for (let n = 0; n < count; n++) {
      const p = this.particles[this.particleCursor++ % this.particles.length], angle = Math.random() * Math.PI * 2, speed = .8 + Math.random() * 2.8;
      Object.assign(p, { x, y, z: .5, vx: Math.cos(angle) * speed * 1.5, vy: Math.sin(angle) * speed * 1.5 + .5, vz: Math.random() * 1.3, life: .3 + Math.random() * .38, color, size: .65 + Math.random() * 1.5, spark: n % 3 === 0 });
    }
  }
  confetti() { if (this.reduced) return; for (let i = 0; i < 12; i++) this.burst((Math.random() - .5) * 8, 3 + Math.random() * 2, PALETTE[i % 6], 12); }
  ring(x, y, color = 0xb8ffdf) { if (this.reduced) return; const r = this.rings.find(r => r.life <= 0) || this.rings[0]; r.life = r.max; r.mesh.position.set(x, y, .6); r.mesh.material.color.set(color); r.mesh.visible = true; }
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
    this.burst(x,y,0xffa6e9,5);
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
    const s = this.snapshot; this.flashes.count = 0; this.comet.visible = false; for (const target of this.targets) target.visible = false;
    if (s) {
      const phase = s.phase, age = this.phaseAge + (s.paused ? 0 : (time - this.received) / 1000), progress = clamp01(age / (phase.duration / 1000 || 1));
      const clear = this.clearSet, drops = this.dropMap;
      if (phase.type === 'swap' || phase.type === 'power') {
        const indices = phase.type === 'swap' ? [phase.a,phase.b] : [phase.index];
        indices.forEach((index,n) => { const target = this.targets[n], p = position(index); target.position.set(p.x,p.y,.42); target.scale.setScalar(1+Math.sin(progress*Math.PI)*.12); target.visible = true; });
      }
      if (phase.type === 'power' && phase.power === 'meteor' && !this.reduced) {
        const p = position(phase.index), t = smooth(progress); this.comet.position.set(THREE.MathUtils.lerp(4.5,p.x,t)+Math.sin(t*Math.PI)*.7,THREE.MathUtils.lerp(5.8,p.y,t),1.2);
        this.comet.rotation.z = -Math.atan2(4.5-p.x,5.8-p.y); this.comet.visible = true;
      }
      if (phase.type === 'explode' && !this.reduced) {
        const glow = Math.pow(Math.max(0,1-progress),2);
        this.flashes.material.opacity = glow * .6;
        phase.clear.forEach((index,n) => { const p = position(index); this.dummy.position.set(p.x,p.y,.5); this.dummy.rotation.set(0,0,0); this.dummy.scale.setScalar(1.1+progress*.8); this.dummy.updateMatrix(); this.flashes.setMatrixAt(n,this.dummy.matrix); this.flashes.setColorAt(n,this.color.set(PALETTE[s.board[index]?.color] || 0xd8a2ff)); });
        this.flashes.count = phase.clear.length; this.flashes.instanceMatrix.needsUpdate = true; if (this.flashes.instanceColor) this.flashes.instanceColor.needsUpdate = true;
      }
      for (const [id, item] of this.items) {
        const { group, core, halo, index } = item, p = position(index);
        let x = p.x, y = p.y, z = .02, scale = 1, scaleX = 1, scaleY = 1, rz = 0;
        if (phase.type === 'swap' && (index === phase.a || index === phase.b)) {
          const target = position(index === phase.a ? phase.b : phase.a), t = ease(progress);
          x += (target.x - x) * t; y += (target.y - y) * t; z += Math.sin(progress * Math.PI) * .5;
        }
        if (phase.type === 'fall' && drops.has(id)) {
          const drop = drops.get(id), motion = sampleDrop(drop,age*1000), fromY = (3.5-drop.from)*1.05;
          y = THREE.MathUtils.lerp(fromY,p.y,motion.progress)+motion.offset; scaleX = motion.scaleX; scaleY = motion.scaleY;
        }
        if (clear.has(index)) { const pop = clamp01((progress-.12)/.75); scale = progress < .12 ? 1+progress*1.7 : Math.max(.001,1.2*(1-ease(pop))); scaleX = 1+.15*Math.sin(progress*Math.PI); rz = progress*.5*(index%2?1:-1); z += progress*.55; }
        if (phase.type === 'power' && index === phase.index) { scale = 1 + Math.sin(progress * Math.PI) * .45; z += .6; rz = Math.sin(progress * Math.PI) * .6; }
        if (phase.type === 'shuffle') { scale = .7 + .3 * Math.abs(Math.cos(progress * Math.PI)); rz = Math.sin(progress * Math.PI) * .2; }
        group.position.set(x, y, z); group.scale.set(scale*scaleX,scale*scaleY,scale); group.rotation.z = rz;
        if (!this.reduced && !s.paused) { core.rotation.y = -.17 + Math.sin(time * .0009 + id) * .1; core.rotation.x = .14 + Math.sin(time * .0011 + id * .7) * .06; if (halo) halo.rotation.z = time * .001 + id; }
      }
    }
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
    for (const r of this.rings) { if (r.life <= 0) { r.mesh.visible = false; continue; } r.life -= dt; const t = 1 - r.life / r.max; r.mesh.scale.setScalar(1 + t * 10); r.mesh.material.opacity = Math.max(0, (1 - t) * .7); }
    this.shake *= Math.exp(-dt*24); this.camera.position.x = this.reduced ? 0 : Math.sin(time*.065)*this.shake; this.camera.position.y = this.reduced ? 0 : Math.cos(time*.07)*this.shake*.65;
    if (!this.lost) this.renderer.render(this.scene, this.camera);
    this.onFrame?.(time, this.fps, this.ratio, this.renderer.info.render.calls);
  }
}
