import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const DESTINATIONS = [
  { id: 'workshop', name: 'The Workshop', type: 'HOME BASE', icon: 'tool', position: [-7, 3.2, -5], detail: 'Your project. Your parts. Your late-night sanctuary.', action: 'ENTER WORKSHOP' },
  { id: 'parts', name: 'Parts Depot', type: '13 CATEGORIES / 39 UPGRADES', icon: 'gear', position: [6, 2.7, -6], detail: 'Forged wheels, full race engines, the little details. Build the right combination.', action: 'BROWSE PARTS' },
  { id: 'paint', name: 'Color Theory', type: 'PAINT & FINISH STUDIO', icon: 'paint', position: [-7, 2.6, 6], detail: 'A fresh identity under the booth lights. Gloss, pearl, or stealth carbon.', action: 'ENTER PAINT BOOTH' },
  { id: 'dyno', name: 'The Tuning Lab', type: 'DYNO / FINE TUNING', icon: 'turbo', position: [6, 4, 6], detail: 'Dial in boost, gearing, stance, and camber. Then see your power curve.', action: 'OPEN TUNING LAB' },
  { id: 'track', name: 'Dockside Strip', type: 'CLOSED-COURSE EVENTS', icon: 'flag', position: [12, 1.5, 1], detail: 'Chase a personal best, earn workshop credits, and prove the build.', action: 'CHOOSE AN EVENT' },
  { id: 'showroom', name: 'The Collection', type: 'COMMUNITY SHOWROOM', icon: 'grid', position: [-13, 3.5, 1], detail: 'Every car has a story. Keep the setups and the people who built them.', action: 'VISIT SHOWROOM' },
];
export class DistrictView {
  constructor(element, onSelect) {
    this.element = element; this.disposed = false; this.labels = []; this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#131c1b'); this.scene.fog = new THREE.Fog('#131c1b', 35, 75);
    this.renderer = new THREE.WebGLRenderer({ antialias: true }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4)); this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.35; element.prepend(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(42, 1, .1, 100); this.camera.position.set(-23, 27, 29);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true; this.controls.enablePan = false; this.controls.minDistance = 27; this.controls.maxDistance = 55; this.controls.minPolarAngle = .2; this.controls.maxPolarAngle = 1.1;
    this.scene.add(new THREE.HemisphereLight('#b5ddca', '#1d271a', 2.4)); const light = new THREE.DirectionalLight('#dfedcb', 3.5); light.position.set(-10, 20, 5); this.scene.add(light);
    const grid = new THREE.GridHelper(70, 35, '#304638', '#21352c'); grid.position.y = -.5; this.scene.add(grid);
    for (const dest of DESTINATIONS) {
      const marker = document.createElement('button'); marker.className = 'map-marker'; marker.setAttribute('aria-label', `Select ${dest.name}`); marker.innerHTML = `<i></i><span>${dest.name}</span>`; marker.addEventListener('click', () => onSelect(dest.id)); element.append(marker); this.labels.push({ dest, marker });
    }
    this.ready = new GLTFLoader().loadAsync(new URL('./assets/district.glb', import.meta.url).href).then(gltf => {
      if (this.disposed) return; this.scene.add(gltf.scene); this.model = gltf.scene;
    }).catch(() => { element.classList.add('map-fallback'); });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(element); this.resize();
    this.renderer.setAnimationLoop(() => {
      if(this.active===false)return;
      this.controls.update();
      const w = element.clientWidth, h = element.clientHeight;
      for (const { dest, marker } of this.labels) { const v = new THREE.Vector3(...dest.position).project(this.camera); marker.style.left = `${(v.x * .5 + .5) * w}px`; marker.style.top = `${(-v.y * .5 + .5) * h}px`; marker.hidden = v.z > 1; }
      this.renderer.render(this.scene, this.camera);
    });
  }
  select(id) { for (const { dest, marker } of this.labels) { marker.classList.toggle('selected', dest.id === id); marker.setAttribute('aria-pressed', String(dest.id === id)); } }
  resize() { const w = this.element.clientWidth, h = this.element.clientHeight; if (!w || !h) return; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false); this.controls.enableZoom = w > 500; this.renderer.domElement.style.touchAction = w <= 500 ? 'pan-y' : 'none'; }
  dispose() { this.disposed = true; this.observer.disconnect(); this.controls.dispose(); this.renderer.setAnimationLoop(null); this.scene.traverse(o => { o.geometry?.dispose(); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); }); this.renderer.dispose(); this.renderer.forceContextLoss(); }
}
