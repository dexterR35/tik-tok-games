import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLDS, trackPoint, trackTangent, followPose, hazardActive } from './worlds.js';
import { EFFECTS } from './engine.js';

const TAU = Math.PI * 2;
const vec = p => new THREE.Vector3(p.x, p.y, p.z);
const smooth = (speed, dt) => 1 - Math.exp(-speed * dt);

export class WorldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 180);
    this.camera.position.set(16, 15, 24);
    this.lookAt = new THREE.Vector3(0, .5, 0);
    this.camera.lookAt(this.lookAt);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.enablePan = false;
    this.controls.minDistance = 9; this.controls.maxDistance = 48;
    this.controls.minPolarAngle = .25; this.controls.maxPolarAngle = 1.35;
    this.controls.enabled = false;
    this.cameraMode = 'follow'; this.mapView = false; this.selectedWorld = 0;
    this.geometryCache = new Map(); this.materialCache = new Map(); this.bursts = [];
    this.animations = []; this.effectGroups = new Map(); this.lastKey = ''; this.warpRemaining = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.temp = new THREE.Vector3();
    this.scene.add(new THREE.HemisphereLight(0xd8e7ff, 0x62435b, 2.6));
    const key = new THREE.DirectionalLight(0xffedda, 3.3);
    key.position.set(-9, 20, 12); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -22, right: 22, top: 15, bottom: -15, near: .5, far: 65 });
    key.shadow.normalBias = .045; key.shadow.bias = -.0002;
    this.scene.add(key);this.sun=key;
    const rim = new THREE.DirectionalLight(0x9b9bff, 2.2); rim.position.set(4, 7, -15); this.scene.add(rim);
    this.worldGroup = new THREE.Group(); this.mapGroup = new THREE.Group(); this.environment = new THREE.Group();
    this.scene.add(this.worldGroup, this.mapGroup, this.environment); this.mapGroup.visible = false;
    this.createSky(); this.createMap();
    this.robot = this.createRobot(); this.scene.add(this.robot.root);
    const start = trackPoint(65);
    this.lookAt.set(start.x + 1, 1.1, start.z);
    this.camera.position.copy(this.lookAt).add(new THREE.Vector3(8, 8.5, 13.5)); this.camera.lookAt(this.lookAt);
    this.controls.addEventListener('start', () => { if (!this.mapView) this.cameraMode = 'orbit'; });
    canvas.addEventListener('pointerup', event => this.pickWorld(event));
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); document.dispatchEvent(new CustomEvent('echo-renderer-lost')); });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
  }

  geometry(key, factory) {
    if (!this.geometryCache.has(key)) this.geometryCache.set(key, factory());
    return this.geometryCache.get(key);
  }
  material(color, options = {}) {
    const key = `${color}|${JSON.stringify(options)}`;
    if (!this.materialCache.has(key)) {
      this.materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: .08, ...options }));
    }
    return this.materialCache.get(key);
  }
  mesh(parent, geometry, color, position = [0, 0, 0], options = {}) {
    const m = new THREE.Mesh(geometry, color?.isMaterial ? color : this.material(color, options));
    m.position.set(...position); m.receiveShadow = true; parent.add(m); return m;
  }
  box(parent, w, h, d, color, position = [0, 0, 0], radius = .08, options = {}) {
    const key = `box:${w},${h},${d},${radius}`;
    return this.mesh(parent, this.geometry(key, () => radius ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d)), color, position, options);
  }
  sphere(parent, radius, color, position = [0, 0, 0], options = {}, detail = 16) {
    return this.mesh(parent, this.geometry(`sphere:${radius}:${detail}`, () => new THREE.SphereGeometry(radius, detail, 12)), color, position, options);
  }
  cylinder(parent, top, bottom, height, color, position = [0, 0, 0], sides = 12, options = {}) {
    return this.mesh(parent, this.geometry(`cyl:${top},${bottom},${height},${sides}`, () => new THREE.CylinderGeometry(top, bottom, height, sides)), color, position, options);
  }
  torus(parent, radius, tube, color, position = [0, 0, 0], options = {}) {
    return this.mesh(parent, this.geometry(`torus:${radius},${tube}`, () => new THREE.TorusGeometry(radius, tube, 8, 48)), color, position, options);
  }
  lightMaterial(color, intensity = 1.5, opacity = 1) {
    return this.material(color, { emissive: color, emissiveIntensity: intensity, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  }
  group(parent, position = [0, 0, 0]) { const g = new THREE.Group(); g.position.set(...position); parent.add(g); return g; }
  halo(parent, color, scale, position) {
    if (!this.haloTexture) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d'), gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,.55)'); gradient.addColorStop(.3, 'rgba(255,255,255,.15)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
      this.haloTexture = new THREE.CanvasTexture(c);
    }
    const mat = new THREE.SpriteMaterial({ map: this.haloTexture, color, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false });
    const sprite = new THREE.Sprite(mat); sprite.position.set(...position); sprite.scale.set(scale, scale, 1); parent.add(sprite); return sprite;
  }
  createSky() {
    const positions = new Float32Array(480 * 3);
    let seed = 79; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 480; i++) { positions[i * 3] = (random() - .5) * 120; positions[i * 3 + 1] = random() * 60 - 8; positions[i * 3 + 2] = (random() - .5) * 100 - 25; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#dde2ff', size: .075, transparent: true, opacity: .65, depthWrite: false })); this.environment.add(this.stars);
    this.moon = this.sphere(this.environment, 5, '#9c86bb', [-22, 12, -32], { roughness: 1 }, 32);
    const ring = this.torus(this.environment, 7.6, .06, '#c8b8e7', [-22, 12, -32], { transparent: true, opacity: .35 }); ring.rotation.set(1.12, -.3, .3);
    for (let i = 0; i < 18; i++) {
      const rock = this.mesh(this.environment, this.geometry('rock', () => new THREE.IcosahedronGeometry(1, 0)), '#4f546c', [Math.sin(i * 7) * 27, -5 - i % 4, Math.cos(i * 3) * 13 - 5]);
      rock.scale.setScalar(.3 + i % 4 * .22); rock.rotation.set(i, i * .3, i * .7);
    }
  }
  flora(parent, world, x, y, z, scale = 1, variant = 0) {
    const g = this.group(parent, [x, y, z]); g.scale.setScalar(scale);
    if (world.biome === 'garden') {
      if (variant % 3 === 0) {
        this.cylinder(g, .09, .13, .8, '#e2caa6', [0, .4, 0]);
        const cap = this.sphere(g, .57, variant % 2 ? '#ffba8f' : '#d48fbe', [0, .94, 0]); cap.scale.y = .48;
        for (let k = 0; k < 4; k++) this.sphere(g, .055, '#fff0c8', [Math.sin(k * 2) * .34, 1.15, Math.cos(k * 2) * .23]);
      } else {
        this.cylinder(g, .065, .11, .6, '#5a806b', [0, .25, 0], 6);
        for (let k = 0; k < 4; k++) { const leaf = this.sphere(g, .35, k % 2 ? '#a5d67b' : '#6ea477', [Math.sin(k * 2) * .2, .6 + k * .13, Math.cos(k * 2) * .2], {}, 8); leaf.scale.set(.7, 1.2, .65); leaf.rotation.z = Math.sin(k) * .5; }
      }
    } else if (world.biome === 'ice') {
      for (let k = 0; k < 3; k++) {
        const crystal = this.mesh(g, this.geometry('ice-crystal', () => new THREE.ConeGeometry(.3, 1.3, 5)), k % 2 ? '#c4b9f4' : '#9de9f4', [k * .23 - .23, .45, Math.sin(k) * .2], { roughness: .2, metalness: .25 });
        crystal.rotation.z = (k - 1) * -.25; crystal.scale.y = .6 + k * .3;
      }
    } else if (world.biome === 'lava') {
      this.cylinder(g, .3, .42, .45, '#534458', [0, .2, 0], 6);
      this.cylinder(g, .18, .22, .36, this.lightMaterial('#ffc48d', .8), [0, .5, 0], 6);
      const plume = this.sphere(g, .23, this.lightMaterial('#ff9c72', 1.2), [0, .8, 0]); plume.scale.y = 1.7;
    } else if (world.biome === 'cloud') {
      this.cylinder(g, .065, .12, 1.4, '#907d9f', [0, .6, 0], 7);
      for (let k = 0; k < 4; k++) this.sphere(g, .48, k % 2 ? '#eab8d8' : '#cfb0e5', [Math.sin(k * 2) * .3, 1.25 + k * .13, Math.cos(k * 2) * .25], {}, 10);
    } else {
      const gem = this.mesh(g, this.geometry('core-crystal', () => new THREE.OctahedronGeometry(.45)), this.lightMaterial(variant % 2 ? '#82edd8' : '#b89bff', .6), [0, .7, 0]);
      gem.scale.y = 1.5;
      const ring = this.torus(g, .5, .025, '#cfc1fc', [0, .7, 0]); ring.rotation.x = Math.PI / 2;
      this.cylinder(g, .35, .45, .25, '#645778', [0, .05, 0], 6);
    }
    return g;
  }
  portal(parent, world, x, small = false) {
    const point = trackPoint(x), g = this.group(parent, [point.x, point.y, point.z]);
    g.rotation.y = Math.PI / 2;
    const color = world.color;
    this.box(g, 3.1, .35, 1.9, '#b5a5bb', [0, -.12, 0], .15);
    const frame = this.torus(g, 1.33, .16, '#e5ddd9', [0, 1.55, 0]); frame.castShadow = true;
    this.torus(g, 1.31, .045, this.lightMaterial(color, 2), [0, 1.55, .17]);
    this.torus(g, 1.55, .025, this.lightMaterial(color, 1), [0, 1.55, .03]);
    const shader = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv;uniform float time;uniform vec3 tint;void main(){vec2 p=vUv-.5;float r=length(p);float a=atan(p.y,p.x);float swirl=.5+.5*sin(a*3.0-r*32.0+time*2.8);float edge=smoothstep(.0,.48,r);float alpha=(.14+swirl*.27+edge*.35)*(1.0-smoothstep(.46,.5,r));gl_FragColor=vec4(mix(tint,vec3(1.0),swirl*.35),alpha);}',
    });
    const disc = this.mesh(g, this.geometry('portal-disc', () => new THREE.CircleGeometry(1.25, 48)), shader, [0, 1.55, 0]);
    this.animations.push({ type: 'portal', mesh: disc });
    this.halo(g, color, 5, [0, 1.55, -.1]);
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * TAU;
      const stud = this.box(g, .18, .28, .24, '#9786a5', [Math.cos(angle) * 1.48, 1.55 + Math.sin(angle) * 1.48, 0], .035); stud.rotation.z = angle;
    }
    if (small) g.scale.setScalar(.6);
    return g;
  }
  island(from,to,world){
    const samples=Math.ceil((to-from)/75),top=[],rock=[],topIndices=[],rockIndices=[],neon=[];
    for(let i=0;i<=samples;i++){
      const x=from+(to-from)*i/samples,p=trackPoint(x),t=trackTangent(x),side={x:-t.z,z:t.x},width=2.65+Math.sin(x*.02)*.18;
      const left=[p.x-side.x*width,p.y-.3,p.z-side.z*width],right=[p.x+side.x*width,p.y-.3,p.z+side.z*width];top.push(...left,...right);
      rock.push(...left,...right,p.x-side.x*width*.65,p.y-2.2,p.z-side.z*width*.65,p.x+side.x*width*.65,p.y-2.2,p.z+side.z*width*.65);
      neon.push(new THREE.Vector3(p.x+side.x*width*.8,p.y-.9,p.z+side.z*width*.8));
      if(i<samples){const a=i*2,b=i*4;topIndices.push(a,a+1,a+2,a+1,a+3,a+2);rockIndices.push(b,b+4,b+2,b+4,b+6,b+2,b+1,b+3,b+5,b+5,b+3,b+7,b+2,b+6,b+3,b+6,b+7,b+3);}
    }
    rockIndices.push(0,2,1,1,2,3);const end=samples*4;rockIndices.push(end,end+1,end+2,end+1,end+3,end+2);
    for(const[positions,indices,color]of[[top,topIndices,world.ground],[rock,rockIndices,world.rock]]){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const mesh=this.mesh(this.worldGroup,geometry,color);mesh.userData.ownedGeometry=true;}
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(neon),new THREE.LineBasicMaterial({color:world.secondary,transparent:true,opacity:.65}));line.userData.ownedGeometry=true;line.userData.ownedMaterial=true;this.worldGroup.add(line);
  }
  buildWorld(game) {
    this.disposeTransient(this.worldGroup);
    this.worldGroup.clear(); this.animations = []; this.effectGroups.clear(); this.memories = []; this.hazardMeshes = [];this.checkpointMeshes=[];
    this.lastKey = `${game.levelIndex}:${game.route}`;
    const world = game.level;
    this.scene.background = new THREE.Color(world.background); this.scene.fog = new THREE.FogExp2(world.background, .012);
    this.moon.material = this.material(world.biome === 'lava' ? '#d09d9a' : world.biome === 'ice' ? '#bbd7e7' : '#9c86bb', { roughness: 1 });
    this.scene.add(this.robot.root);
    let start = 0;
    const sections = game.gaps.map(gap => { const range = [start, gap.from]; start = gap.to; return range; }); sections.push([start, game.goal+70]);
    for (const [index, [from, to]] of sections.entries()) {
      const center = trackPoint((from + to) / 2), length = (to - from) / 42;
      this.island(from,to,world);
      const segments = Math.ceil((to - from) / 38);
      for (let j = 0; j < segments; j++) {
        const a = from + (to - from) * j / segments, b = from + (to - from) * (j + 1) / segments, p = trackPoint((a + b) / 2);
        const tile = this.box(this.worldGroup, (b - a) / 42 + .025, .22, 2.4, world.path, [p.x, p.y - .08, p.z], .075);const tangent=trackTangent((a+b)/2);tile.rotation.y=-Math.atan2(tangent.z,tangent.x);
        tile.receiveShadow = true;
        if (j % 3 === 1) this.box(this.worldGroup, .27, .035, .08, this.lightMaterial(world.secondary, .6), [p.x, p.y + .045, p.z + .73], .015);
      }
      for (let j = 0; j < Math.ceil(length * 1.1); j++) {
        const x = from + 15 + ((j * 73 + index * 41) % Math.max(1, to - from - 30)), p = trackPoint(x);
        const tangent=trackTangent(x),side=j%2?-1:1;this.flora(this.worldGroup, world, p.x-tangent.z*side*1.95, p.y-.2, p.z+tangent.x*side*1.95, .65 + j % 3 * .17, j + index);
      }
      // Tiny guard posts make the dangerous edges legible.
      for (const edge of [from + 8, to - 8]) {
        const p = trackPoint(edge);
        for (const side of [-1, 1]) {
          this.box(this.worldGroup, .16, .42, .16, '#e3d6c5', [p.x, p.y + .14, p.z + side * 1.05], .035);
          this.sphere(this.worldGroup, .07, this.lightMaterial(world.color, 1), [p.x, p.y + .38, p.z + side * 1.05]);
        }
      }
    }
    // Larger landmarks create a distinct silhouette for each world.
    if (world.biome === 'garden') {
      for (const x of Array.from({length:Math.ceil(game.goal/500)},(_,i)=>100+i*500)) {
        const p = trackPoint(x), g = this.group(this.worldGroup, [p.x, -.1, p.z - 1.75]);
        this.cylinder(g, .23, .3, 2.1, '#cad2b5', [0, .9, 0], 7);
        this.box(g, .85, .25, .7, '#dfddc0', [0, 2, 0], .08);
        this.flora(g, world, .05, 2.1, 0, .6, 1);
      }
    } else if (world.biome === 'ice') {
      for (let i = 0; i < Math.ceil(game.goal/360); i++) { const p = trackPoint(100 + i * 360); this.flora(this.worldGroup, world, p.x, p.y-.2, p.z - 2.3, 1.8 + i % 2, i); }
    } else if (world.biome === 'lava') {
      const lava = this.cylinder(this.worldGroup, 17, 17, .15, this.lightMaterial('#d86d63', .45), [game.goal/84, -5.5, 0], 48);
      lava.scale.set(game.goal/42/32,1,.55);
      for (let i = 0; i < 8; i++) this.halo(this.worldGroup, '#ffb45e', 3, [Math.sin(i * 8) * 11, -5.3, Math.cos(i * 4) * 5]);
    } else if (world.biome === 'cloud') {
      for (let i = 0; i < Math.ceil(game.goal/160); i++) {
        const cloud = this.sphere(this.worldGroup, 1.1 + i % 3 * .4, '#d3c4e3', [i*160/42, -3.6 - i % 3 * .5, Math.cos(i * 7) * 5], { roughness: 1 }, 12);
        cloud.scale.set(1.8, .4, 1);
      }
    } else {
      const reactor = this.group(this.worldGroup, [game.goal/84, 3, -5]);
      this.sphere(reactor, 1.25, this.lightMaterial('#bb9afa', .5));
      for (let i = 0; i < 3; i++) { const ring = this.torus(reactor, 1.7 + i * .25, .055, this.lightMaterial(i % 2 ? '#83f2dc' : '#c9afff', 1)); ring.rotation.set(i * .6, i * 1.1, .3); this.animations.push({ type: 'orbit', mesh: ring, speed: .3 + i * .12 }); }
      this.halo(reactor, '#c0a0ff', 7, [0, 0, 0]);
    }
    this.portal(this.worldGroup, world, game.goal+20);
    const startPad = trackPoint(45); const startRing = this.torus(this.worldGroup, .8, .04, this.lightMaterial(world.secondary, 1), [startPad.x, startPad.y + .06, startPad.z]); startRing.rotation.x = Math.PI / 2;
    for (const [index, x] of game.memoryPositions.entries()) {
      const p = trackPoint(x), g = this.group(this.worldGroup, [p.x, p.y + 1.15, p.z]);
      this.mesh(g, this.geometry('memory', () => new THREE.OctahedronGeometry(.27)), this.lightMaterial('#ffdf8c', .65));
      const ring = this.torus(g, .4, .018, '#fff2ba'); ring.rotation.y = .6;
      this.halo(g, '#ffdc88', 1.2, [0, 0, 0]);this.memories.push(g);
    }
    for (const hazard of game.hazards) this.createHazard(hazard, world);
    for(const x of game.checkpoints){const p=trackPoint(x),t=trackTangent(x),g=this.group(this.worldGroup,[p.x,p.y,p.z]);g.rotation.y=Math.atan2(t.x,t.z);const ring=this.torus(g,1.85,.06,this.lightMaterial(world.secondary,.7),[0,1.85,0]);this.cylinder(g,.2,.3,.28,'#d8d7c0',[-1.85,.1,0]);this.cylinder(g,.2,.3,.28,'#d8d7c0',[1.85,.1,0]);this.checkpointMeshes.push({x,ring});}
  }
  createHazard(hazard, world) {
    const p = trackPoint(hazard.x), g = this.group(this.worldGroup, [p.x, p.y, p.z]);
    let moving, beam;
    if (hazard.type === 'laser') {
      for (const z of [-1.2, 1.2]) {
        this.box(g, .3, 1.8, .35, '#7b7390', [0, .8, z], .07);
        this.box(g, .38, .2, .45, '#ddc8d0', [0, 1.65, z], .06);
      }
      beam = this.box(g, .06, .075, 2.35, this.lightMaterial('#ff9c9c', 2), [0, 1.1, 0], .02);
      const second = this.box(beam, .06, .075, 2.35, this.lightMaterial('#ff9c9c', 2), [0, -.6, 0], .02);
      this.halo(g, '#ff9e9e', 2.2, [0, .8, 0]);
    } else if (hazard.type === 'piston') {
      this.box(g, .7, 4.9, .6, '#5c5268', [0, 2.3, -1.4], .12);
      this.box(g, 1.4, .45, 2.3, '#8a6879', [0, 4.7, -.45], .1);
      moving = this.box(g, 1, .6, 1.8, '#dd9b7e', [0, 3.9, 0], .12);
      this.box(moving, .75, .08, 1.4, this.lightMaterial('#ffd298', .6), [0, -.33, 0], .025);
    } else if (hazard.type === 'wind') {
      this.cylinder(g, .12, .2, 1.4, '#bca6c9', [0, .6, -1.3]);
      const hub = this.sphere(g, .22, '#eee1e6', [0, 1.5, -1.3]);
      moving = this.group(g, [0, 1.5, -1.25]);
      for (let i = 0; i < 3; i++) { const blade = this.box(moving, .2, 1.1, .1, '#e3cbdf', [Math.sin(i / 3 * TAU) * .47, Math.cos(i / 3 * TAU) * .47, 0], .08); blade.rotation.z = -i / 3 * TAU; }
    } else {
      this.box(g, .75, .2, 2.1, '#88accc', [0, .04, 0], .08);
      for (const z of [-.7, 0, .7]) this.cylinder(g, .1, .15, .2, '#d5edee', [0, .2, z]);
      beam = this.box(g, .55, 1.5, 2, this.lightMaterial('#bcf0ff', .25, .27), [0, .8, 0], .1);
    }
    this.hazardMeshes.push({ group: g, hazard, moving, beam });
  }
  createRobot() {
    const root = new THREE.Group();
    const chassis = this.group(root, [0, .68, 0]);
    const cream = '#f1e2bb', dark = '#3a4c5e', orange = '#f6af68';
    const body = this.box(chassis, 1, .85, .76, cream, [0, .52, 0], .19); body.castShadow = true;
    this.box(chassis, .64, .45, .08, '#d79b62', [0, .55, .41], .07);
    this.box(chassis, .37, .16, .05, this.lightMaterial('#b7edba', .5), [0, .58, .47], .04);
    this.box(chassis, .75, .65, .4, '#a4bbad', [0, .5, -.53], .14);
    this.cylinder(chassis, .19, .19, .26, dark, [0, 1.08, 0]);
    const head = this.group(chassis, [0, 1.55, .035]);
    const helmet = this.box(head, 1.52, 1.15, 1.15, cream, [0, 0, 0], .25); helmet.castShadow = true;
    this.box(head, 1.25, .71, .13, dark, [0, -.02, .58], .19);
    this.box(head, .9, .5, .04, '#203a4b', [0, -.015, .665], .1);
    const leftEye = this.box(head, .18, .3, .035, this.lightMaterial('#aef9ec', 1.1), [-.27, -.015, .698], .065);
    const rightEye = this.box(head, .18, .3, .035, this.lightMaterial('#aef9ec', 1.1), [.27, -.015, .698], .065);
    this.box(head, .15, .04, .03, this.lightMaterial('#aef9ec', .7), [0, -.18, .698], .015);
    for (const side of [-1, 1]) {
      const ear = this.cylinder(head, .32, .32, .2, orange, [side * .83, 0, -.05]); ear.rotation.z = Math.PI / 2;
      const center = this.cylinder(head, .17, .17, .225, dark, [side * .84, 0, -.05]); center.rotation.z = Math.PI / 2;
    }
    const antenna = this.group(head, [.25, .65, 0]);
    this.cylinder(antenna, .035, .045, .47, dark, [0, .15, 0], 8);
    this.sphere(antenna, .13, this.lightMaterial('#adf4c5', .7), [0, .42, 0]);
    const arms = [], legs = [];
    for (const side of [-1, 1]) {
      const arm = this.group(chassis, [side * .65, .77, 0]);
      this.sphere(arm, .18, dark);
      this.box(arm, .25, .6, .28, orange, [side * .07, -.28, 0], .1);
      this.sphere(arm, .2, cream, [side * .07, -.62, .02]); arms.push(arm);
      const leg = this.group(root, [side * .29, .66, 0]);
      this.cylinder(leg, .105, .13, .37, dark, [0, -.14, 0]);
      this.box(leg, .4, .23, .62, '#899b95', [0, -.45, .11], .09); legs.push(leg);
    }
    const shield = this.sphere(root, 1.9, this.material('#a8f7da', { emissive: '#64cbb5', emissiveIntensity: .2, transparent: true, opacity: .11, roughness: .15, metalness: .3, depthWrite: false }), [0, 1.4, 0], {}, 32);
    const shieldRing = this.torus(shield, .96, .01, this.lightMaterial('#9ff5db', 1)); shieldRing.rotation.x = .5;
    shield.visible = false;
    const flame = this.sphere(root, .38, this.lightMaterial('#ffc08b', 1.2), [0, 1, -.95]); flame.scale.set(.6, .6, 1.8); flame.visible = false;
    root.rotation.y = Math.PI/2;
    return { root, chassis, head, antenna, arms, legs, leftEye, rightEye, shield, flame };
  }
  createMap() {
    this.mapIslands = [];
    const links = [];
    WORLDS.forEach((world, index) => {
      const [x, y, z] = world.mapPosition, g = this.group(this.mapGroup, [x, y, z]);g.userData.worldIndex = index;
      const rock = this.mesh(g, this.geometry('map-rock', () => new THREE.IcosahedronGeometry(1, 1)), world.rock, [0, -.8, 0]);rock.scale.set(2.1, 1.3, 1.8);
      this.cylinder(g, 1.85, 1.6, .43, world.ground, [0, .1, 0], 8);
      this.cylinder(g, 1, 1, .13, world.path, [0, .38, 0], 16);
      const ring = this.torus(g, .88, .075, this.lightMaterial(world.color, .9), [0, 1.25, 0]);ring.rotation.y = .3;
      this.halo(g, world.color, 3.4, [0, 1.25, 0]);
      this.flora(g, world, -1, .33, -.3, .8, index);
      this.flora(g, world, 1, .33, .2, .6, index + 1);
      const marker = this.torus(g, 2.12, .03, this.lightMaterial(world.color, 1), [0, -.05, 0]);marker.rotation.x = Math.PI / 2;
      this.mapIslands.push({ group: g, ring, marker, world });
      links.push(new THREE.Vector3(x, y - .5, z));
    });
    const curve = new THREE.CatmullRomCurve3(links);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(160)), new THREE.LineDashedMaterial({ color: '#c8c5ed', dashSize: .17, gapSize: .14, transparent: true, opacity: .45 }));line.computeLineDistances();this.mapGroup.add(line);this.mapLink=line;
  }
  setBroadcastMode() {
    this.broadcast=true;this.setCameraMode('follow');this.camera.fov=50;this.camera.updateProjectionMatrix();this.resetCamera({robot:{x:65}});
    const points=[];
    this.mapIslands.forEach((item,index)=>{item.baseY=index%2*.3;item.group.position.set(index%2?2.3:-2.3,item.baseY,(2-index)*4.4);points.push(item.group.position.clone().add(new THREE.Vector3(0,-.5,0)));});
    this.mapLink.geometry.dispose();this.mapLink.geometry=new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(points).getPoints(160));this.mapLink.computeLineDistances();
  }
  setMapView(value, selected = this.selectedWorld) {
    if(value&&!this.mapView)this.beforeMap={position:this.camera.position.clone(),target:this.lookAt.clone()};
    if(!value&&this.mapView&&this.beforeMap){
      this.camera.position.copy(this.beforeMap.position);this.lookAt.copy(this.beforeMap.target);
      this.controls.target.copy(this.lookAt);this.camera.lookAt(this.lookAt);
    }
    this.mapView = value;this.selectedWorld = selected;
    this.mapGroup.visible = value;this.worldGroup.visible = !value;this.robot.root.visible = !value;
    this.controls.enabled = !value && this.cameraMode === 'orbit';
    if(value){this.scene.background=new THREE.Color('#171d35');this.scene.fog=new THREE.FogExp2('#171d35',.007);}
    else if(this.currentGame){this.scene.background=new THREE.Color(this.currentGame.level.background);this.scene.fog=new THREE.FogExp2(this.currentGame.level.background,.012);}
  }
  setCameraMode(mode) {
    this.cameraMode = mode; this.controls.enabled = mode === 'orbit' && !this.mapView;
    if(this.controls.enabled){this.controls.target.copy(this.lookAt);this.controls.update();}
  }
  resetCamera(game) {
    if(this.cameraMode==='orbit')return;
    if(this.broadcast){const pose=followPose(game.robot.x);this.lookAt.copy(vec(pose.target));this.camera.position.copy(vec(pose.position));this.camera.lookAt(this.lookAt);return;}
    const p=trackPoint(game.robot.x),follow=this.cameraMode==='follow'||this.camera.aspect<1.5;
    this.lookAt.set(follow?p.x+1:0,follow?1.1:.5,follow?p.z:0);
    this.camera.position.copy(this.lookAt).add(this.broadcast?new THREE.Vector3(9,10.5,12):follow?new THREE.Vector3(8,8.5,13.5):new THREE.Vector3(16,15,24));
    this.camera.lookAt(this.lookAt);
  }
  warp() { this.warpRemaining = this.reducedMotion ? .25 : 1.5; this.lastKey = ''; }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    if(!r.width||!r.height)return;
    this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();
  }
  projectPosition(position) {
    const p=this.temp.copy(position).project(this.camera),rect=this.canvas.getBoundingClientRect();
    return {x:(p.x*.5+.5)*rect.width,y:(-.5*p.y+.5)*rect.height};
  }
  screenPosition(x, z=0) {const p=trackPoint(x);return this.projectPosition(new THREE.Vector3(p.x,p.y+2.8+z/42,p.z));}
  mapPosition(index) {const g=this.mapIslands[index].group;return this.projectPosition(new THREE.Vector3(g.position.x,g.position.y+2,g.position.z));}
  pickWorld(event) {
    if(!this.mapView||!this.onPickWorld)return;
    const rect=this.canvas.getBoundingClientRect();
    const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);
    const hits=ray.intersectObjects(this.mapGroup.children,true);
    for(const hit of hits){let obj=hit.object;while(obj&&obj!==this.mapGroup){if(Number.isInteger(obj.userData.worldIndex)){this.onPickWorld(obj.userData.worldIndex);return;}obj=obj.parent;}}
  }
  burst(event) {
    const p=trackPoint(event.x),n=22,positions=new Float32Array(n*3),velocities=new Float32Array(n*3);
    for(let i=0;i<n;i++){positions[i*3]=p.x;positions[i*3+1]=p.y+.5;positions[i*3+2]=p.z;velocities[i*3]=(Math.random()-.5)*4;velocities[i*3+1]=1+Math.random()*4;velocities[i*3+2]=(Math.random()-.5)*4;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const material=new THREE.PointsMaterial({color:event.echo?'#c6a3ff':EFFECTS[event.type]?.color||'#ffdc88',size:.1,transparent:true,opacity:1,depthWrite:false});
    const mesh=new THREE.Points(geo,material);this.scene.add(mesh);this.bursts.push({mesh,velocities,age:0});
    while(this.bursts.length>24)this.removeBurst(this.bursts.shift());
  }
  removeBurst(burst){this.scene.remove(burst.mesh);burst.mesh.geometry.dispose();burst.mesh.material.dispose();}
  disposeTransient(group){group.traverse(obj=>{if(obj.userData.ownedGeometry)obj.geometry.dispose();if(obj.userData.ownedMaterial)obj.material.dispose();if(obj.isSprite)obj.material.dispose();if(obj.isLineSegments){obj.geometry.dispose();obj.material.dispose();}if(obj.material?.isShaderMaterial)obj.material.dispose();});}
  syncEffects(game,t) {
    const active=new Set();
    // Coincident gift streaks share a visual; every gift still has its own recorded echo.
    const grouped=new Map();
    for(const e of game.effects){const k=`${e.type}:${e.echo}:${e.x.toFixed(1)}:${Math.floor(e.born*6)}`;grouped.set(k,e);}
    for(const [key,e] of grouped){
      active.add(key);let g=this.effectGroups.get(key);
      const color=e.echo?'#bf9eff':EFFECTS[e.type].color;
      if(!g){
        g=this.group(this.worldGroup);const p=trackPoint(e.x);g.position.set(p.x,p.y,p.z);g.userData.effect=e;
        if(e.type==='cube'){
          const gap=game.gaps[e.gapIndex],width=gap?(gap.to-gap.from)/gap.pieces/42+.025:.65;
          const block=this.box(g,width,e.banked?.65:.22,e.banked?.65:2.4,this.lightMaterial(color,.22,e.echo?.52:1),[0,e.banked?1.2:-.08,0],.08);const tangent=trackTangent(e.x);g.rotation.y=-Math.atan2(tangent.z,tangent.x);
          const outline=new THREE.LineSegments(new THREE.EdgesGeometry(block.geometry),new THREE.LineBasicMaterial({color:e.echo?'#e0c4ff':'#e4d3ff',transparent:true,opacity:.8}));block.add(outline);
          if(!e.banked)for(const z of [-1.05,1.05])this.box(g,Math.max(.08,width-.12),.035,.045,this.lightMaterial(color,1.5),[0,.045,z],.01);
        }else if(e.type==='heal'){
          const geometry=this.geometry('life-heart',()=>{const s=new THREE.Shape();s.moveTo(0,-.4);s.bezierCurveTo(-.9,.15,-.7,.85,0,.4);s.bezierCurveTo(.7,.85,.9,.15,0,-.4);return new THREE.ExtrudeGeometry(s,{depth:.1,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.03,bevelThickness:.03});});
          const heart=this.mesh(g,geometry,this.lightMaterial('#ffb4ca',.35),[0,2.5,0]);heart.scale.setScalar(.7);g.userData.heart=heart;
        }else if(e.type==='pulse'){
          for(let i=0;i<3;i++){const ring=this.torus(g,.5+i*.22,.025,this.lightMaterial(color,1));ring.rotation.x=Math.PI/2;ring.position.y=.15+i*.02;}
          this.halo(g,color,3,[0,.2,0]);
        }
        this.effectGroups.set(key,g);
      }
      const age=game.time-e.born;
      if(e.type==='cube'){g.position.y=trackPoint(e.x).y+Math.max(0,1-age/.38)**2*6;g.scale.y=age<.38?2:1;g.visible=true;}
      else if(e.type==='heal'){g.position.y=trackPoint(e.x).y+age*.65;g.userData.heart.lookAt(this.camera.position);}
      else if(e.type==='pulse'){const s=1+age*.7;g.scale.set(s,1,s);g.rotation.y=t*.5;}
      if(e.until-game.time<1)g.visible=Math.floor(t*9)%2===0;
    }
    for(const [key,g] of this.effectGroups){if(!active.has(key)){g.traverse(obj=>{if(obj.isLineSegments){obj.geometry.dispose();obj.material.dispose();}if(obj.isSprite)obj.material.dispose();});this.worldGroup.remove(g);this.effectGroups.delete(key);}}
  }
  draw(game,now,dt) {
    this.currentGame=game;
    if(this.lastKey!==`${game.levelIndex}:${game.route}`)this.buildWorld(game);
    const t=this.reducedMotion?0:now;
    this.stars.rotation.y=t*.002;
    if(this.mapView){
      this.environment.position.x=0;this.sun.position.set(-9,20,12);this.sun.target.position.set(0,0,0);this.sun.target.updateMatrixWorld();
      this.scene.background.set('#171d35');
      this.mapIslands.forEach((item,index)=>{
        item.group.position.y=(item.baseY??item.world.mapPosition[1])+Math.sin(t*.8+index)*.16;
        item.ring.rotation.z=t*.3;item.marker.material=this.lightMaterial(item.world.color,index===this.selectedWorld?2.5:.4);
        item.marker.scale.setScalar(index===this.selectedWorld?1.08:1);
      });
      this.temp.set(0,-1.6,0);this.lookAt.lerp(this.temp,smooth(5,dt));
      const portrait=this.camera.aspect<1.5;
      this.temp.set(this.broadcast?7:portrait?13:14,this.broadcast?24:portrait?27:22,this.broadcast?24:portrait?37:30);this.camera.position.lerp(this.temp,smooth(4,dt));
      this.camera.lookAt(this.lookAt);
    }else{
      const r=game.robot,p=trackPoint(r.x),robot=this.robot;
      this.environment.position.x=p.x*.8;this.sun.position.set(p.x-9,20,p.z+12);this.sun.target.position.set(p.x,0,p.z);this.sun.target.updateMatrixWorld();
      const moving=game.phase==='running'&&!game.paused&&!r.waiting&&!r.rescued&&r.stun<=0;
      const airborne=r.z>3,boosting=r.boostUntil>game.time,gait=moving?Math.sin(r.x*.16):0,yaw=followPose(r.x).yaw;
      if(this.wasAirborne&&!airborne)this.landing=.22;this.wasAirborne=airborne;this.landing=Math.max(0,(this.landing||0)-dt);
      robot.root.position.set(p.x,p.y+r.z/42+(moving?Math.abs(gait)*.07:Math.sin(t*2)*.015)-.08,p.z);
      robot.root.rotation.y=yaw+(r.rescued?Math.sin(t*2)*.08:0);
      robot.chassis.rotation.z=r.stun>0?Math.sin(t*25)*.12:gait*.035;
      robot.chassis.rotation.x=boosting?-.13:airborne?-.08:0;
      robot.chassis.scale.set(1+this.landing*.15,1-this.landing*.5,1);
      robot.head.rotation.y=r.waiting?Math.sin(t*1.1)*.1:0;robot.head.rotation.z=r.waiting?-.08:0;
      const stride=boosting?.65:.45;
      robot.legs[0].rotation.x=airborne?-.6:gait*stride;robot.legs[1].rotation.x=airborne?.35:-gait*stride;
      robot.arms[0].rotation.x=airborne?-.7:-gait*.4;robot.arms[1].rotation.x=airborne?-.7:gait*.4;
      robot.arms[0].rotation.z=r.rescued?.9+Math.sin(t*5)*.2:.1;
      robot.arms[1].rotation.z=r.rescued?-.9-Math.sin(t*5)*.2:-.1;
      robot.antenna.rotation.z=Math.sin(t*3)*.08;
      const blink=t%5.2>5? .12:1;robot.leftEye.scale.y=robot.rightEye.scale.y=blink;
      robot.shield.visible=r.shieldUntil>game.time;robot.shield.rotation.y=t*.4;
      robot.flame.visible=r.boostUntil>game.time&&!r.rescued;robot.flame.scale.z=1.8+Math.sin(t*30)*.3;
      this.memories.forEach((m,i)=>{m.visible=!r.memories.has(i);m.rotation.y=t*1.5+i;m.position.y=trackPoint(game.memoryPositions[i]).y+1.15+Math.sin(t*2+i)*.12;});
      this.checkpointMeshes.forEach(({x,ring})=>{ring.material=this.lightMaterial(x<=game.checkpoint?'#d4f69d':game.level.secondary,x<=game.checkpoint?1.5:.5);});
      this.hazardMeshes.forEach(({hazard,moving,beam})=>{
        const active=game.phase!=='idle'&&hazardActive(hazard,game.time);
        if(beam)beam.visible=active;
        if(moving&&hazard.type==='piston')moving.position.y+=((active?.5:3.9)-moving.position.y)*smooth(18,dt);
        if(moving&&hazard.type==='wind')moving.rotation.z=t*(active?12:1.5);
      });
      for(const animation of this.animations){if(animation.type==='portal')animation.mesh.material.uniforms.time.value=t;else animation.mesh.rotation.y+=dt*animation.speed;}
      this.syncEffects(game,t);
      if(this.cameraMode==='orbit'){this.controls.update();}
      else{
        const follow=this.cameraMode==='follow'||this.camera.aspect<1.5;
        const pose=followPose(r.x),target=this.broadcast?vec(pose.target):follow?new THREE.Vector3(p.x+1,p.y+1.1,p.z):new THREE.Vector3(game.goal/84,.5,0);
        this.lookAt.lerp(target,smooth(3,dt));
        const offset=follow?new THREE.Vector3(8,8.5,13.5):new THREE.Vector3(16,15,24);
        if(this.broadcast)this.temp.copy(vec(pose.position));else this.temp.copy(this.lookAt).add(offset);this.camera.position.lerp(this.temp,smooth(3.5,dt));this.camera.lookAt(this.lookAt);
      }
    }
    for(const burst of this.bursts){
      if(!game.paused){burst.age+=dt;const p=burst.mesh.geometry.attributes.position.array;for(let i=0;i<p.length;i+=3){p[i]+=burst.velocities[i]*dt;p[i+1]+=burst.velocities[i+1]*dt;p[i+2]+=burst.velocities[i+2]*dt;burst.velocities[i+1]-=4*dt;}burst.mesh.geometry.attributes.position.needsUpdate=true;}
      burst.mesh.material.opacity=Math.max(0,1-burst.age/1.5);burst.mesh.visible=!this.mapView;
    }
    this.bursts=this.bursts.filter(b=>{if(b.age>1.5){this.removeBurst(b);return false;}return true;});
    const baseFov=this.broadcast?50:38;
    if(this.warpRemaining>0){this.warpRemaining=Math.max(0,this.warpRemaining-dt);const fov=baseFov+Math.sin(this.warpRemaining/1.5*Math.PI)*8;this.camera.fov=fov;this.camera.updateProjectionMatrix();}
    else if(this.camera.fov!==baseFov){this.camera.fov=baseFov;this.camera.updateProjectionMatrix();}
    this.renderer.render(this.scene,this.camera);
  }
}
