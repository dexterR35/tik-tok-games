import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { raceDefinition } from './model.js';
import { carDefinition } from './model.js';

const TAU = Math.PI * 2;
export class GarageScene {
  constructor(element) {
    this.element = element; this.wheels = []; this.roadMarks = []; this.mode = 'garage'; this.autoRotate = false; this.hoodOpen = false;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#191d1e'); this.scene.fog = new THREE.Fog('#191d1e', 16, 42);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .88;
    element.append(this.renderer.domElement); this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D project car. Drag to orbit, scroll to zoom.');
    this.camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
    this.camera.position.set(-7.8, 4.3, 8.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.target.set(0, .75, 0);
    this.controls.enableDamping = true; this.controls.dampingFactor = .065; this.controls.enablePan = false;
    this.controls.minDistance = 5.7; this.controls.maxDistance = 15; this.controls.maxPolarAngle = Math.PI / 2 - .045;
    const pmrem = new THREE.PMREMGenerator(this.renderer); const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, .045).texture; this.scene.environment = this.environment; this.scene.environmentIntensity = .6;
    room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xdce5ea, 0x33312b, .85));
    this.key = new THREE.DirectionalLight(0xf4f5e8, 2.8); this.key.position.set(-3, 8, 4); this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048); Object.assign(this.key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 }); this.key.shadow.bias = -.0005; this.key.shadow.normalBias = .02; this.scene.add(this.key);
    const fill = new THREE.DirectionalLight(0xb2d6e7, 1.5); fill.position.set(4, 3, -4); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xd4eda0, .8); rim.position.set(3, 2, 5); this.scene.add(rim);
    this.garageBackground = this.scene.background; this.glow = this.radialTexture(); this.sky = this.skyTexture(); this.scroll = []; this.streaks = [];
    this.environmentGroup = new THREE.Group(); this.scene.add(this.environmentGroup); this.makeGarage();
    this.road = new THREE.Group(); this.scene.add(this.road); this.makeRoad(); this.road.visible = false;
    // Bloom makes headlights, street lamps and neon actually glow. ?fx=0 turns it off, ?fx=1 keeps it on;
    // otherwise it switches itself off if the computer cannot hold ~30 frames per second with it.
    const fx = new URLSearchParams(location.search).get('fx'); this.fxLocked = fx === '1'; this.slowFrames = 0;
    if (fx !== '0') try {
      this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .2, .5, 2.2) /* strength, radius, threshold: only real light sources (HDR > 1.25) glow, never the paint */; this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    } catch (error) { this.composer = null; }
    this.aim = new THREE.Vector3(); this.eye = new THREE.Vector3();
    this.timer = new THREE.Timer(); this.timer.connect(document); this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(element); this.resize();
    this.renderer.setAnimationLoop(() => this.animate());
    this.ready = this.loadAssets();
  }
  async loadAssets() {
    const loader = new GLTFLoader();
    const results = await Promise.allSettled(['workshop', 'coachwork', 'parts', 'coachwork-v2'].map(name => loader.loadAsync(new URL(`./assets/${name}.glb`, import.meta.url).href)));
    if (results[0].status === 'fulfilled') {
      const imported = results[0].value.scene; imported.updateMatrixWorld(true);
      const grouped = new Map();
      imported.traverse(obj => {
        if (!obj.isMesh) return;
        const source = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone(); source.applyMatrix4(obj.matrixWorld);
        for (const name of Object.keys(source.attributes)) if (!['position', 'normal'].includes(name)) source.deleteAttribute(name);
        const key = obj.material.uuid; if (!grouped.has(key)) grouped.set(key, { material: obj.material, geometries: [] }); grouped.get(key).geometries.push(source);
      });
      const model = new THREE.Group();
      for (const { material, geometries } of grouped.values()) {
        if (material.name === 'Machined steel') { material.metalness = .35; material.roughness = .68; material.color.multiplyScalar(.75); }
        const geometry = mergeGeometries(geometries); if (geometry) { const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; model.add(mesh); } geometries.forEach(g => g.dispose());
      }
      this.scene.remove(this.environmentGroup); this.environmentGroup.traverse(o => { o.geometry?.dispose(); if (o.material) o.material.dispose(); });
      this.environmentGroup = model; this.scene.add(model);
      new THREE.TextureLoader().load(new URL('./assets/nightshift-art.png', import.meta.url).href, texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const poster = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.33), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); poster.position.set(-2.4, 2.5, -6.81); model.add(poster);
      });
    }
    if (results[1].status === 'fulfilled') this.coachwork = results[1].value.scene.getObjectByName('body_shell');
    if (results[2].status === 'fulfilled') this.partsLibrary = results[2].value.scene;
    if (results[3].status === 'fulfilled') { this.modernPanels = results[3].value.scene; this.coachwork = this.modernPanels.getObjectByName('body_shell'); }
    this.assetsLoaded = results.filter(r => r.status === 'fulfilled').length;
    if (this.project) this.setProject(this.project);
  }
  attachPart(id, parent, position, scale, rotation = 0) {
    const source = this.partsLibrary?.getObjectByName(`part_${id}`); if (!source) return;
    const object = source.clone(true); object.position.set(...position); object.scale.setScalar(scale); object.rotation.y = rotation;
    object.traverse(o => { if (o.material) { o.material = o.material.clone(); o.castShadow = true; } }); parent.add(object); return object;
  }
  setStation(station) {
    this.station = station; this.renderer.toneMappingExposure = station === 'paint' ? 1.06 : .88;
    if (station === 'dyno') this.setView('rear'); else if (station === 'paint') this.setView('hero');
  }
  radialTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64); gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.25, 'rgba(255,255,255,.55)'); gradient.addColorStop(.6, 'rgba(255,255,255,.12)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  skyTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 256; const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256); gradient.addColorStop(0, '#04060c'); gradient.addColorStop(.45, '#0c1424'); gradient.addColorStop(.72, '#1d2440'); gradient.addColorStop(.9, '#4a3552'); gradient.addColorStop(1, '#8a5a4e');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 4, 256); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  halo(parent, position, color, size, opacity = .9) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })); sprite.position.set(...position); sprite.scale.setScalar(size); parent.add(sprite); return sprite;
  }
  material(color, metalness = 0, roughness = .5) { return new THREE.MeshStandardMaterial({ color, metalness, roughness }); }
  box(parent, size, position, material, radius = .02) {
    const geometry = radius ? new RoundedBoxGeometry(...size, 2, radius) : new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  cylinder(parent, radius, height, position, material, segments = 64) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  line(parent, points, material, radius = .016) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, radius, 6, false), material); parent.add(mesh); return mesh;
  }
  polygon(parent, vertices, material) {
    const geo = new THREE.BufferGeometry(); const positions = [];
    for (let i = 1; i < vertices.length - 1; i++) positions.push(...vertices[0], ...vertices[i], ...vertices[i + 1]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  makeGarage() {
    const g = this.environmentGroup, concrete = this.material('#1c201f', .05, .83), edge = this.material('#111718', .25, .5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), concrete); floor.rotation.x = -Math.PI / 2; floor.position.y = -.07; floor.receiveShadow = true; g.add(floor);
    const grid = new THREE.GridHelper(60, 30, '#3d4140', '#343837'); grid.position.y = -.064; g.add(grid);
    this.cylinder(g, 3.95, .12, [0, -.025, 0], edge, 128);
    this.cylinder(g, 3.88, .02, [0, .042, 0], this.material('#242a28', .28, .55), 128);
    const glow = new THREE.MeshBasicMaterial({ color: '#b6d255' });
    for (const angle of [-.19, Math.PI - .19]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(3.9, .013, 5, 100, 1.1), glow); arc.rotation.x = Math.PI / 2; arc.rotation.z = angle; arc.position.y = .058; g.add(arc);
    }
    const stripeMat = this.material('#828778', .1, .65);
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * TAU;
      const marker = this.box(g, [.014, .007, i % 4 ? .09 : .22], [Math.sin(angle) * 3.65, .06, Math.cos(angle) * 3.65], stripeMat, 0); marker.rotation.y = angle;
    }
    this.box(g, [28, 7, .2], [0, 3.4, -8], this.material('#202627', .2, .75));
    for (let x = -12; x <= 12; x += 4) {
      this.box(g, [.08, 7, .16], [x, 3.4, -7.85], this.material('#37403f', .3, .6));
      this.box(g, [2.9, .04, .06], [x + 1.8, 3.7, -7.7], this.material('#b9ccca', .1, .2));
    }
    this.box(g, [2, .9, .7], [5.8, .4, -4.4], this.material('#252e2e', .4, .4));
    for (let i = 0; i < 4; i++) this.box(g, [1.8, .012, .01], [5.8, .2 + i * .17, -4.04], this.material('#65706a', .5, .5));
    for (let i = 0; i < 3; i++) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(.41, .14, 10, 36), this.material('#141819', .05, .9)); tire.rotation.x = Math.PI / 2; tire.position.set(-5.1, .15 + i * .26, -3.7); g.add(tire);
    }
  }
  makeRoad() {
    // slightly wet asphalt: it picks up the lamps and the car lights
    const road = new THREE.Mesh(new THREE.PlaneGeometry(220, 11), this.material('#1a1f23', .3, .5)); road.rotation.x = -Math.PI / 2; road.position.y = .02; road.receiveShadow = true; this.road.add(road);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 90), this.material('#0c1012', 0, .95)); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.02, -32); this.road.add(ground);
    const white = this.material('#d9dccf', 0, .6);
    for (let i = 0; i < 25; i++) for (const z of [-3.4, 0, 3.4]) this.roadMarks.push(this.box(this.road, [2.1, .012, .075], [-50 + i * 4, .035, z], white, 0));
    for (const z of [-4.8, 4.8]) {
      this.box(this.road, [220, .06, .08], [0, .04, z], new THREE.MeshBasicMaterial({ color: '#b6d255' }), 0);
      this.box(this.road, [220, .55, .14], [0, .26, z * 1.1], this.material('#485355', .7, .4), 0);
    }
    // street lamps on the far side, their light pools on the road (cheap: glow textures, no real lights)
    const pole = this.material('#2a3134', .6, .5), head = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2b0').multiplyScalar(4) });
    const pool = new THREE.MeshBasicMaterial({ map: this.glow, color: '#ffbf73', transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const lamp = new THREE.Group(); lamp.position.set(-54 + i * 12, 0, -6.1); this.road.add(lamp); this.scroll.push({ object: lamp, span: 108, factor: 1 });
      this.box(lamp, [.13, 5.4, .13], [0, 2.7, 0], pole, 0); this.box(lamp, [.1, .1, 1.7], [0, 5.35, .8], pole, 0); this.box(lamp, [.55, .07, .32], [0, 5.28, 1.6], head, 0);
      this.halo(lamp, [0, 5.2, 1.6], '#ffd49a', 2.4, .85);
      const light = new THREE.Mesh(new THREE.PlaneGeometry(11, 9), pool); light.rotation.x = -Math.PI / 2; light.position.set(0, .05, 4.2); lamp.add(light);
    }
    // a city in the distance, drifting past more slowly than the road (parallax = depth)
    const windows = document.createElement('canvas'); windows.width = 64; windows.height = 128; const wctx = windows.getContext('2d'); wctx.fillStyle = '#0a0e13'; wctx.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 124; y += 8) for (let x = 4; x < 60; x += 8) { const lit = Math.random(); if (lit > .62) { wctx.fillStyle = lit > .93 ? '#9fd8ff' : lit > .8 ? '#ffe3a1' : '#c9a25c'; wctx.fillRect(x, y, 4, 5); } }
    const windowTexture = new THREE.CanvasTexture(windows); windowTexture.colorSpace = THREE.SRGBColorSpace; windowTexture.wrapS = windowTexture.wrapT = THREE.RepeatWrapping; windowTexture.magFilter = THREE.NearestFilter;
    for (let i = 0; i < 30; i++) {
      const w = 4 + Math.random() * 5, h = 5 + Math.random() * 15, map = windowTexture.clone(); map.repeat.set(Math.max(1, Math.round(w / 3.5)), Math.max(1, Math.round(h / 7))); map.needsUpdate = true;
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, 5), new THREE.MeshBasicMaterial({ map, color: '#9aa4b0' })); building.position.set(-100 + i * 6.7 + Math.random() * 2, h / 2 - .1, -17 - Math.random() * 14);
      this.road.add(building); this.scroll.push({ object: building, span: 201, factor: .28 });
    }
    // speed streaks: only appear at speed, brighter under nitrous or audience power
    this.streakMaterial = new THREE.MeshBasicMaterial({ color: '#cfe9ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 34; i++) {
      const streak = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 5, .014, .014), this.streakMaterial); streak.position.set(-50 + Math.random() * 100, .25 + Math.random() * 3.4, -7 + Math.random() * 14);
      this.road.add(streak); this.scroll.push({ object: streak, span: 100, factor: 1.9 });
    }
    // finish: checkered line on the road and a lit gantry above it
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64; const ctx = canvas.getContext('2d');
    for (let row = 0; row < 2; row++) for (let column = 0; column < 16; column++) { ctx.fillStyle = (row + column) % 2 ? '#101811' : '#e5eddd'; ctx.fillRect(column * 16, row * 32, 16, 32); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.finishLine = new THREE.Group(); this.finishLine.visible = false; this.road.add(this.finishLine);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(.8, 10.5), new THREE.MeshBasicMaterial({ map: texture })); line.rotation.x = -Math.PI / 2; line.position.y = .05; this.finishLine.add(line);
    for (const z of [-5.6, 5.6]) this.box(this.finishLine, [.22, 5.6, .22], [0, 2.8, z], pole, 0);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(11.4, .9), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })); banner.rotation.y = Math.PI / 2; banner.position.set(0, 5.2, 0); this.finishLine.add(banner);
    for (const z of [-5.6, 5.6]) this.halo(this.finishLine, [0, 5.7, z], '#c6f565', 2.2, .9);
  }
  disposeCar() {
    this.clearRival();
    if (!this.car) return;
    this.scene.remove(this.car);
    const geometries = new Set(), materials = new Set();
    this.car.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
  setProject(project) {
    this.disposeCar(); this.project = project; this.wheels = [];
    const p = project.parts, def = carDefinition(project), supercar = def.shape === 1, muscle = def.shape === 2;
    this.car = new THREE.Group(); this.scene.add(this.car);
    this.body = new THREE.Group(); this.body.position.y = -[0, .055, .09, .12][p.suspension] - (project.tune?.stance || 0) / 1000; this.car.add(this.body);
    const body = this.body, paint = new THREE.MeshPhysicalMaterial({ color: project.color, metalness: p.paint === 2 ? .72 : .38, roughness: p.paint === 0 || p.paint === 3 ? .4 : .22, clearcoat: p.paint ? 1 : .6, clearcoatRoughness: p.paint === 0 || p.paint === 3 ? .22 : .08, envMapIntensity: 1.3 });
    paint.name = 'car-paint'; this.body.name = 'body-root';
    const black = this.material('#11181b', .3, .42), rubber = this.material('#141718', .02, .82), chrome = this.material('#c5c9c5', .9, .19), carbon = this.material('#242b2d', .65, .34);
    const panelPaint = paint.clone(); panelPaint.side = THREE.DoubleSide;
    const glass = new THREE.MeshPhysicalMaterial({ color: '#233740', metalness: .45, roughness: .12, clearcoat: 1, side: THREE.DoubleSide });
    const glowWhite = new THREE.MeshStandardMaterial({ color: '#e4eff3', emissive: '#c8e6f3', emissiveIntensity: 2.6 });
    const glowRed = new THREE.MeshStandardMaterial({ color: '#d34736', emissive: '#d82b19', emissiveIntensity: 4 });
    const wheelbase = muscle ? 1.63 : 1.57, width = supercar ? 1.07 : 1, roofHeight = muscle ? 1.76 : supercar ? 1.52 : 1.7;
    const shape = new THREE.Shape();
    shape.moveTo(-2.64, .43); shape.lineTo(-wheelbase - .55, .43); shape.absarc(-wheelbase, .44, .55, Math.PI, 0, true);
    shape.lineTo(wheelbase - .55, .44); shape.absarc(wheelbase, .44, .55, Math.PI, 0, true);
    shape.lineTo(2.58, .43); shape.lineTo(2.62, .86); shape.quadraticCurveTo(2.58, 1.07, 2.35, 1.08);
    shape.lineTo(1.38, 1.12); shape.lineTo(-.95, 1.13); shape.lineTo(-2.42, 1.04); shape.quadraticCurveTo(-2.65, 1.02, -2.64, .82); shape.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: width * 1.94, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .055, bevelThickness: .035, curveSegments: 30 }); bodyGeo.translate(0, 0, -width * .97);
    if (this.coachwork) { bodyGeo.dispose(); const shell = this.coachwork.clone(); shell.material = paint; shell.scale.z = width; shell.castShadow = true; shell.receiveShadow = true; body.add(shell); }
    else { const shell = new THREE.Mesh(bodyGeo, paint); shell.castShadow = true; shell.receiveShadow = true; body.add(shell); }
    // Nose, rear bumper and the structural sill follow the body, including its ride height.
    this.box(body, [.22, .23, 1.97 * width], [-2.61, .48, 0], paint, .095);
    this.box(body, [.22, .25, 1.99 * width], [2.6, .5, 0], paint, .09);
    this.box(body, [.04, .24, 1.34], [-2.74, .56, 0], black);
    for (const z of [-.43, -.22, 0, .22, .43]) this.box(body, [.055, .19, .017], [-2.77, .56, z], chrome, 0);
    for (const sign of [-1, 1]) {
      this.box(body, [.045, .16, .62], [-2.7, .91, sign * .65], black, .012);
      this.box(body, [.05, .055, .52], [-2.732, .94, sign * .65], glowWhite, .009);
      this.box(body, [.048, .029, .5], [-2.735, .872, sign * .65], glowWhite, .005);
      this.box(body, [.05, .11, .7], [2.74, .91, sign * .59], black, .014);
      if (muscle) {
        for (let i = 0; i < 3; i++) this.box(body, [.057, .08, .12], [2.775, .91, sign * (.35 + i * .19)], glowRed, .006);
      } else this.box(body, [.058, .05, .61], [2.775, .91, sign * .59], glowRed, .005);
      this.box(body, [.35, .018, .045], [.55, 1.075, sign * 1.015 * width], chrome, .007);
      this.line(body, [[-.85, 1.1, sign * 1.025 * width], [-.85, .6, sign * 1.025 * width], [.85, .6, sign * 1.025 * width], [1.04, 1.1, sign * 1.025 * width]], carbon, .006);
      this.box(body, [3.1, .07, .075], [0, .4, sign * 1.02 * width], black);
      this.box(body, [.12, .05, .25], [-.7, 1.23, sign * 1.03 * width], black);
      this.box(body, [.32, .14, .18], [-.72, 1.28, sign * 1.16 * width], paint, .055);
      const exhaust = this.cylinder(body, .085, .22, [2.78, .38, sign * .67], chrome, 24); exhaust.rotation.z = Math.PI / 2;
      const opening = this.cylinder(body, .066, .012, [2.9, .38, sign * .67], black, 24); opening.rotation.z = Math.PI / 2;
    }
    this.box(body, [.045, .14, .44], [2.765, .63, 0], this.material('#c8cabb', .15, .5));
    this.box(body, [.052, .05, .31], [2.793, .63, 0], black, .003);
    // Bonnet is hinged at the windscreen; the engine is modeled beneath it.
    this.hood = new THREE.Group(); this.hood.name = 'hood-pivot'; this.hood.position.set(-.84, 1.145, 0); body.add(this.hood);
    if (this.modernPanels) { const panel = this.modernPanels.getObjectByName('hood_surface').clone(); panel.material = p.paint === 3 ? carbon.clone() : panelPaint; panel.material.side = THREE.DoubleSide; panel.position.set(.84, -1.145, 0); panel.scale.z = width; panel.castShadow = true; this.hood.add(panel); }
    else this.box(this.hood, [1.58, .045, 1.77 * width], [-.83, .017, 0], p.paint === 3 ? carbon : paint, .03);
    for (const sign of [-1, 1]) for (let i = 0; i < (p.turbo ? 4 : 0); i++) this.box(this.hood, [.19, .01, .028], [-.63 + i * .11, .045, sign * .55], black, .002);
    this.engine = new THREE.Group(); this.engine.position.set(-1.55, 1.13, 0); body.add(this.engine);
    this.box(this.engine, [1.24, .06, 1.48], [0, 0, 0], black);
    this.box(this.engine, [.8, .15, .52], [0, .11, 0], this.material('#989d97', .8, .32));
    this.box(this.engine, [.65, .035, .34], [0, .21, 0], this.material('#aa4635', .5, .4));
    for (let i = 0; i < 5; i++) this.box(this.engine, [.012, .04, .26], [-.25 + i * .125, .231, 0], chrome, .002);
    if (p.turbo) {
      const turbo = new THREE.Mesh(new THREE.TorusGeometry(.16 + p.turbo * .018, .065, 12, 32), chrome); turbo.position.set(-.25, .15, .46); turbo.rotation.x = Math.PI / 2; this.engine.add(turbo);
      this.line(this.engine, [[-.3, .13, .45], [-.48, .16, .57], [-.5, .14, -.44]], chrome, .045);
      this.box(body, [.04, .2, 1.12], [-2.79, .56, 0], chrome, .005);
      for (let i = 0; i < 5; i++) this.box(body, [.045, .012, 1.1], [-2.816, .48 + i * .035, 0], carbon, 0);
    }
    this.engine.visible = this.hoodOpen;
    // Individual glass panels, painted roof and structural pillars.
    if (this.modernPanels && !muscle) {
      this.modernPanels.traverse(source => {
        if (!source.isMesh || source.name === 'body_shell' || source.name === 'hood_surface') return;
        const panel = source.clone(); panel.material = source.name.includes('glass') ? glass : panelPaint;
        panel.scale.z = width; panel.scale.y = supercar ? .91 : 1; panel.position.y = 1.17 * (1 - panel.scale.y); panel.castShadow = true; body.add(panel);
      });
    } else {
    const frontBase = supercar ? -1.2 : -.83, roofFront = supercar ? -.44 : -.29, roofBack = muscle ? .78 : .64, rearBase = supercar ? 1.45 : 1.37;
    const roofW = .76 * width, lowerW = .94 * width;
    this.polygon(body, [[frontBase, 1.17, -lowerW], [frontBase, 1.17, lowerW], [roofFront, roofHeight, roofW], [roofFront, roofHeight, -roofW]], glass);
    this.polygon(body, [[rearBase, 1.18, lowerW], [rearBase, 1.18, -lowerW], [roofBack, roofHeight, -roofW], [roofBack, roofHeight, roofW]], glass);
    this.box(body, [roofBack - roofFront + .12, .065, roofW * 2 + .06], [(roofBack + roofFront) / 2, roofHeight + .014, 0], paint, .035);
    for (const sign of [-1, 1]) {
      const points = [[frontBase + .1, 1.19, sign * lowerW], [roofFront + .02, roofHeight - .055, sign * roofW], [roofBack - .03, roofHeight - .055, sign * roofW], [rearBase - .12, 1.19, sign * lowerW]];
      this.polygon(body, points, glass);
      this.line(body, [points[0], points[1], points[2], points[3]], paint, .033);
      this.line(body, [points[0], points[3]], black, .022);
      this.line(body, [[.49, 1.19, sign * lowerW], [.43, roofHeight - .045, sign * roofW]], black, .026);
    }
    }
    if (muscle) this.box(this.hood, [.65, .12, .7], [-.65, .07, 0], carbon);
    // Forged rims, brake discs, calipers, tire shoulders, and visible tread rings.
    for (const x of [-wheelbase, wheelbase]) for (const sign of [-1, 1]) {
      const wheel = new THREE.Group(); wheel.position.set(x, .49, sign * width * 1.005); this.car.add(wheel); this.wheels.push(wheel);
      wheel.name = `wheel-${this.wheels.length - 1}`;
      const tire = new THREE.Mesh(new THREE.TorusGeometry(.347, .137, 16, 64), rubber); tire.scale.z = 1.25 + p.tires * .09; wheel.add(tire); tire.castShadow = true;
      wheel.rotation.x = sign * (project.tune?.camber || 0) * Math.PI / 180;
      const rimColor = [chrome, chrome, this.material('#9d8055', .8, .3), this.material('#343b3e', .8, .25)][p.wheels];
      const rimRadius = .285 + p.wheels * .015;
      const barrel = this.cylinder(wheel, rimRadius + .015, .23, [0, 0, 0], this.material('#525b5e', .85, .26), 48); barrel.rotation.x = Math.PI / 2;
      const disc = this.cylinder(wheel, rimRadius * .82, .035, [0, 0, sign * .063], this.material('#717b7e', .85, .4), 48); disc.rotation.x = Math.PI / 2;
      for (let ring = 0; ring < 2; ring++) {
        const bead = new THREE.Mesh(new THREE.TorusGeometry(rimRadius, .029, 10, 56), rimColor); bead.position.z = sign * (.175 - ring * .07); wheel.add(bead);
      }
      const hub = this.cylinder(wheel, .073, .12, [0, 0, sign * .15], rimColor, 20); hub.rotation.x = Math.PI / 2;
      const spokeCount = p.wheels === 2 ? 10 : p.wheels === 3 ? 7 : 5;
      for (let i = 0; i < spokeCount; i++) {
        const angle = i / spokeCount * TAU;
        const spoke = this.box(wheel, [p.wheels === 0 ? .074 : .039, rimRadius - .035, .047], [Math.sin(angle) * rimRadius * .49, Math.cos(angle) * rimRadius * .49, sign * .148], rimColor, .008); spoke.rotation.z = -angle;
      }
      this.box(this.car, [.09 + p.brakes * .012, .23 + p.brakes * .02, .045], [x + .2, .49, sign * (width * 1.005 + .08)], this.material(['#717b7e', '#e78a32', '#bd4837', '#bf9b43'][p.brakes], .5, .4));
      for (const offset of [-.095, .095]) {
        const tread = new THREE.Mesh(new THREE.TorusGeometry(.472, .004, 4, 48), this.material('#353b3a', .05, .8)); tread.position.z = offset; wheel.add(tread);
      }
    }
    if (p.aero) {
      const wide = 1.02 * width + p.aero * .025;
      this.box(body, [.8, .065, wide * 2 + .12], [-2.49, .33, 0], carbon, .02);
      for (const sign of [-1, 1]) {
        this.box(body, [2.25, .13, .16], [0, .33, sign * wide], carbon);
        if (p.aero >= 2) for (const x of [-wheelbase, wheelbase]) {
          const arch = new THREE.Mesh(new THREE.TorusGeometry(.57, .055, 8, 40, Math.PI), paint); arch.position.set(x, .44, sign * (width * .99 + .045)); body.add(arch);
          for (let j = 0; j < 5; j++) { const angle = (j + .5) / 5 * Math.PI; const bolt = new THREE.Mesh(new THREE.SphereGeometry(.012, 6, 6), chrome); bolt.position.set(x + Math.cos(angle) * .57, .44 + Math.sin(angle) * .57, sign * (width * 1.01 + .08)); body.add(bolt); }
        }
      }
      const wingHeight = p.aero === 1 ? 1.2 : p.aero === 2 ? 1.61 : 1.86;
      if (p.aero > 1) for (const z of [-.62, .62]) this.box(body, [.1, wingHeight - 1.07, .045], [2.12, (wingHeight + 1.07) / 2, z], carbon);
      this.box(body, [p.aero === 3 ? .51 : .34, .065, p.aero === 3 ? 2.47 : 2.1], [2.17, wingHeight, 0], p.aero === 1 ? paint : carbon, .016);
      if (p.aero === 3) for (const sign of [-1, 1]) this.box(body, [.56, .2, .027], [2.17, wingHeight + .015, sign * 1.235], carbon);
      for (const z of [-.65, -.32, 0, .32, .65]) this.box(body, [.5, .13, .03], [2.5, .32, z], carbon, .004);
    }
    if (p.nitrous) for (let i = 0; i < p.nitrous; i++) {
      const bottle = this.cylinder(body, .11, .38, [1.55, 1.25, -.3 + i * .25], this.material('#518ba7', .7, .26), 20); bottle.rotation.z = Math.PI / 2;
    }
    this.flames = new THREE.Group(); this.flames.name = 'boost-flames'; body.add(this.flames);
    const flameMat = new THREE.MeshBasicMaterial({ color: '#9be9ff', transparent: true, opacity: .85 });
    for (const sign of [-1, 1]) { const flame = new THREE.Mesh(new THREE.ConeGeometry(.09, .7, 10), flameMat); flame.rotation.z = -Math.PI / 2; flame.position.set(3.18, .38, sign * .67); this.flames.add(flame); }
    this.flames.visible = false;
    this.attachPart('turbo', this.engine, [-.25, .06, .43], .42 + p.turbo * .035)?.traverse(o => { o.visible = p.turbo > 0; });
    if (p.ecu) this.attachPart('ecu', this.engine, [.38, .06, -.43], .37);
    if (p.cooling) this.attachPart('cooling', body, [-2.63, .41, 0], .73, Math.PI / 2);
    if (p.transmission) this.attachPart('transmission', body, [-.7, .38, 0], .6);
    if (p.exhaust) this.attachPart('exhaust', body, [1.93, .19, .66], .7, 0);
    const lightColor = ['#dce7df', '#c1e5ff', '#ffb54e', '#c6f565'][p.lighting]; glowWhite.color.set(lightColor); glowWhite.emissive.set(lightColor);
    if (p.lighting >= 2) for (const sign of [-1, 1]) this.box(body, [3.5, .025, .03], [0, .31, sign * 1.02], new THREE.MeshBasicMaterial({ color: lightColor }), .005);
    // lights that read as lights: soft halos on the lamps, headlight beams on the road, underglow for the lighting kits
    for (const sign of [-1, 1]) { this.halo(body, [-2.8, .92, sign * .65], lightColor, .8, .6); this.halo(body, [2.82, .91, sign * .59], '#ff3a22', .7, .7); }
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.2), new THREE.MeshBasicMaterial({ map: this.glow, color: lightColor, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.rotation.x = -Math.PI / 2; beam.position.set(-6.4, .075, 0); beam.name = 'head-beams'; this.car.add(beam);
    if (p.lighting >= 2) {
      const under = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.4), new THREE.MeshBasicMaterial({ map: this.glow, color: lightColor, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
      under.rotation.x = -Math.PI / 2; under.position.set(0, .07, 0); this.car.add(under);
    }
  }
  clearRival() {
    if (this.rivalCar) { this.scene.remove(this.rivalCar); const materials = new Set(); this.rivalCar.traverse(o => { if (o.material) materials.add(o.material); }); materials.forEach(m => m.dispose()); }
    this.rivalCar = null; this.rivalWheels = []; this.rivalState = null;
  }
  setDuel(run, rival) {
    if (!run || !rival) { this.clearRival(); if (this.car) this.car.position.z = 0; this.controls.maxDistance = 15 * (this.frameScale || 1); this.setRun(null); return; }
    this.setRun({ ...run, finished: false }); this.run = run; this.rivalState = rival;
    if (!this.rivalCar) {
      this.rivalCar = this.car.clone(true); const clonedMaterials = new Map();
      this.rivalCar.traverse(o => { if (!o.material) return; if (!clonedMaterials.has(o.material)) { const material = o.material.clone(); if (material.name === 'car-paint') material.color.set(rival.color); clonedMaterials.set(o.material, material); } o.material = clonedMaterials.get(o.material); });
      this.rivalCar.position.set(0, 0, -1.65); this.scene.add(this.rivalCar);
      const hood = this.rivalCar.getObjectByName('hood-pivot'); if (hood) hood.rotation.z = 0;
      const flames = this.rivalCar.getObjectByName('boost-flames'); if (flames) flames.visible = false;
      this.rivalWheels = [0,1,2,3].map(i => this.rivalCar.getObjectByName(`wheel-${i}`)).filter(Boolean);
      this.car.position.z = 1.65;
      this.controls.maxDistance = 25 * (this.frameScale || 1);
      this.controls.target.set(-1.5, .8, 0); this.viewTarget = new THREE.Vector3(10, 6.3, 13).multiplyScalar(this.frameScale || 1);
      this.currentView = 'duel';
    }
  }
  interactCar(clientX, clientY) {
    if (!this.car) return null;
    const rect = this.renderer.domElement.getBoundingClientRect(), pointer = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(pointer, this.camera); const hit = ray.intersectObject(this.car, true)[0];
    if (!hit) return null; let object = hit.object;
    while (object && object !== this.car) { if (object.name === 'hood-pivot') return 'hood'; object = object.parent; }
    return 'rev';
  }
  setHood(open) { this.hoodOpen = open; if (this.engine) this.engine.visible = open; }
  setView(view) {
    const positions = { hero: [-7.8, 3.6, 8.8], front: [-9.5, 2.35, 5.5], rear: [8.4, 3, 7.5], engine: [-5.5, 5.7, 4.4], duel: [10, 6.3, 13] };
    this.currentView = view;
    this.viewTarget = new THREE.Vector3(...(positions[view] || positions.hero)).multiplyScalar(this.frameScale || 1);
    this.controls.target.set(view === 'engine' ? -1 : view === 'duel' ? -1.5 : 0, .75, 0);
    this.setHood(view === 'engine');
  }
  setRun(run) {
    this.run = run; const active = !!run && !run.finished;
    if (active && this.mode !== 'track') { this.mode = 'track'; this.environmentGroup.visible = false; this.road.visible = true; this.setHood(false); this.setView('rear'); this.autoRotate = false; this.scene.background = this.sky; this.scene.fog.color.set('#1b2034'); this.scene.fog.near = 34; this.scene.fog.far = 95; this.setGlow(.38, 1.25); }
    if (!active && this.mode === 'track') { this.mode = 'garage'; this.environmentGroup.visible = true; this.road.visible = false; this.setView('hero'); this.scene.background = this.garageBackground; this.scene.fog.color.set('#191d1e'); this.scene.fog.near = 16; this.scene.fog.far = 42; this.setGlow(.2, 2.2); }
  }
  // night road: lamps and car lights bloom; in the bright workshop only the lamps themselves do (the paint must stay crisp)
  setGlow(strength, threshold) { if (this.bloom) { this.bloom.strength = strength; this.bloom.threshold = threshold; } }
  resize() {
    const w = this.element.clientWidth, h = this.element.clientHeight; if (!w || !h) return;
    const previousAspect = this.camera.aspect; this.renderer.setSize(w, h, false); if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); } this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.frameScale = Math.max(1, Math.sqrt(1 / Math.max(.45, this.camera.aspect)));
    this.controls.maxDistance = 15 * this.frameScale; this.controls.enableZoom = w >= 680;
    this.renderer.domElement.style.touchAction = w < 680 ? 'pan-y' : 'none';
    if (Math.abs(previousAspect - this.camera.aspect) > .08) this.setView(this.currentView || 'hero');
    const hint = document.querySelector('.orbit-hint>span'); if (hint) hint.textContent = w < 680 ? 'DRAG SIDEWAYS TO ROTATE' : 'DRAG TO ROTATE · SCROLL TO ZOOM';
  }
  animate() {
    this.timer.update(); const dt = Math.min(this.timer.getDelta(), .05);
    if (this.viewTarget) { this.camera.position.lerp(this.viewTarget, dt * 5); if (this.camera.position.distanceTo(this.viewTarget) < .025) this.viewTarget = null; }
    this.controls.autoRotate = this.autoRotate && this.mode !== 'track'; this.controls.autoRotateSpeed = .6; this.controls.update();
    if (this.hood) this.hood.rotation.z = THREE.MathUtils.lerp(this.hood.rotation.z, this.hoodOpen ? -1.05 : 0, dt * 7);
    const speed = this.mode === 'track' ? this.run?.speed || 0 : this.dynoActive ? 28 : 0;
    for (const wheel of this.wheels) wheel.rotation.z += speed * dt / .48;
    if (this.rivalCar && this.rivalState) {
      const relative = THREE.MathUtils.clamp((this.run.distance - this.rivalState.distance) * .28, -7, 7);
      this.rivalCar.position.x = THREE.MathUtils.lerp(this.rivalCar.position.x, relative, Math.min(1, dt * 8));
      for (const wheel of this.rivalWheels) wheel.rotation.z += this.rivalState.speed * dt / .48;
    }
    if (this.rivalCar && this.currentView === 'duel') {
      // keep BOTH cars in frame: aim between them and pull back as the gap grows (before: the rival left the screen)
      const gap = this.rivalCar.position.x, scale = (this.frameScale || 1) * (1 + Math.abs(gap) * .05), ease = Math.min(1, dt * 3);
      this.controls.target.lerp(this.aim.set(gap / 2 - 1.2, -.3, 0), ease); this.camera.position.lerp(this.eye.set(10 * scale + gap / 2, 6.3 * scale, 13 * scale), ease); this.viewTarget = null;
    }
    if (this.finishLine) {
      const length = this.run ? raceDefinition(this.run.race).distance : 400;
      this.finishOffset = this.run?.finished ? (this.finishOffset || 0) + speed * dt : 0; // after the line the car keeps rolling and the line falls behind
      this.finishLine.visible = this.mode === 'track' && !!this.run && length - this.run.distance < 110 && this.finishOffset < 60; if (this.finishLine.visible) this.finishLine.position.x = -(length - this.run.distance) - 2.7 + this.finishOffset;
    }
    for (const mark of this.roadMarks) { mark.position.x += speed * dt; if (mark.position.x > 48) mark.position.x -= 100; }
    if (this.mode === 'track') {
      for (const item of this.scroll) { item.object.position.x += speed * dt * item.factor; if (item.object.position.x > item.span / 2) item.object.position.x -= item.span; }
      this.streakMaterial.opacity = THREE.MathUtils.lerp(this.streakMaterial.opacity, THREE.MathUtils.clamp((speed - 22) / 50, 0, .42) + (this.run?.boosting ? .25 : 0), Math.min(1, dt * 4));
    }
    if (this.body) this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, speed > 0 ? -.012 + Math.sin(this.timer.getElapsed() * 21) * .0015 : Math.sin(this.timer.getElapsed() * 30) * (this.revPulse || 0) * .025, dt * 7);
    const targetFov = this.mode === 'track' ? 38 + speed * .025 + (this.run?.boosting ? 3 : 0) : 36;
    if (Math.abs(this.camera.fov - targetFov) > .03) { this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 4); this.camera.updateProjectionMatrix(); }
    if (this.flames) { this.flames.visible = this.mode === 'track' && !!this.run?.boosting; this.flames.scale.x = .7 + Math.random() * .6; }
    if (this.composer) {
      this.composer.render();
      // protect weak computers: after ~3 s of slow frames the glow is switched off for good (unless forced with ?fx=1)
      if (!this.fxLocked) { this.slowFrames = dt > 1 / 28 ? this.slowFrames + dt : Math.max(0, this.slowFrames - dt * .5); if (this.slowFrames > 3) { this.composer.dispose(); this.composer = null; } }
    } else this.renderer.render(this.scene, this.camera);
  }
}
