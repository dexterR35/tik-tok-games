import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SU from 'three/addons/utils/SkeletonUtils.js';
import { separatePeople } from './spacing.js';
import { retargetClip } from './retarget.js';
import { hashString, LOCATIONS } from '../rules.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

export const CHAT_ICONS = ['☕', '🚀', '🪐', '❤️', '😂', '🎵', '🌋', '🛰️', '💎', '🤖', '🌌', '👽', '🍕', '⚡', '🎮', '📸', '🌹', '🔭', '💬', '🥂', '🌅', '😍', '🤝', '✨'];
const NPC_NAMES = ['Ares', 'Nova', 'Kai', 'Lyra', 'Orion', 'Vega', 'Juno', 'Rhea', 'Atlas', 'Mira', 'Zed', 'Iris', 'Cyrus', 'Tess', 'Leo', 'Skye', 'Remy', 'Ana', 'Dex', 'Ivy'];

// ── Cast: four rigged bodies, animations shared through retargeting ─────────
export async function loadCast(base = 'assets/models/', onProgress = () => {}) {
  const loader = new GLTFLoader();
  const names = ['Xbot', 'Michelle', 'Gentleman', 'Soldier'];
  let done = 0;
  const [xbot, michelle, gent, soldier] = await Promise.all(names.map(n => loader.loadAsync(base + n + '.glb').then(g => { onProgress(++done / names.length); return g; })));
  const clip = (g, n) => g.animations.find(a => a.name.toLowerCase() === n.toLowerCase());
  const src = g => SU.clone(g.scene);
  const xb = { idle: clip(xbot, 'idle'), walk: clip(xbot, 'walk'), run: clip(xbot, 'run'), nod: clip(xbot, 'agree'), shake: clip(xbot, 'headShake') };
  const fromX = target => Object.fromEntries(Object.entries(xb).map(([k, c]) => [k, retargetClip(src(xbot), src(target), c)]));
  const kinds = {
    xbot: { gltf: xbot, clips: { ...xb }, turn: 0 },
    michelle: { gltf: michelle, clips: { ...fromX(michelle) }, turn: 0 },
    gentleman: { gltf: gent, clips: { ...fromX(gent) }, turn: 0 },
    soldier: { gltf: soldier, clips: { idle: clip(soldier, 'Idle'), walk: clip(soldier, 'Walk'), run: clip(soldier, 'Run') }, turn: Math.PI },
  };
  for (const k of Object.values(kinds)) {
    k.clips.nod ||= k.clips.idle; k.clips.shake ||= k.clips.idle;
    k.gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  }
  return kinds;
}

const OUTFITS = ['#2f4a7a', '#1f1f24', '#e9e6e0', '#7a2f3b', '#2f6b5a', '#a0612e', '#5a4a8a', '#c9b38a', '#3b6fb8'];
const ARMOR = ['#ffffff', '#f2c7a2', '#c8d6e6', '#e3b38f', '#bfbfbf', '#ffd9b0'];
const BOT = ['#f2f2f2', '#c9d2dc', '#ffb36b', '#9fd8ff', '#ff8fb2', '#d0c2ff'];

function dress(kind, model, seed) {
  const r = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 1) >>> 0; return seed / 4294967296; };
  model.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map(m => {
      const c = m.clone();
      if (kind === 'gentleman' && /Outfit_(Top|Bottom)/.test(o.name) && r() < 0.75) { c.map = null; c.color.set(OUTFITS[Math.floor(r() * OUTFITS.length)]); c.roughness = 0.75; }
      if (kind === 'soldier' && /Body/.test(m.name)) c.color.set(ARMOR[Math.floor(r() * ARMOR.length)]);
      if (kind === 'xbot' && /Surface|Beta_HighLimbs|asdf/.test(m.name)) { c.color.set(BOT[Math.floor(r() * BOT.length)]); c.metalness = 0.5; c.roughness = 0.3; }
      c.envMapIntensity = 0.8;
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

// ── One person ───────────────────────────────────────────────────────────────
let NEXT_ID = 1;
export class Person {
  constructor(cast, kind, { name = '', user = null, avatar = null, seed = Math.random() * 1e9 } = {}) {
    this.id = NEXT_ID++; this.kind = kind; this.name = name; this.user = user; this.avatar = avatar;
    this.isViewer = !!user;
    const k = cast[kind];
    this.root = new THREE.Group();
    this.model = SU.clone(k.gltf.scene); this.model.rotation.y = k.turn;
    dress(kind, this.model, seed >>> 0);
    const sc = kind === 'michelle' ? rand(0.92, 1.0) : kind === 'soldier' ? rand(0.98, 1.05) : rand(0.95, 1.04);
    this.model.scale.setScalar(sc);
    this.root.add(this.model);
    this.head = null; this.model.traverse(o => { if (o.isBone && /Head$/.test(o.name)) this.head = o; });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [n, c] of Object.entries(k.clips)) {
      if (n !== 'idle' && c === k.clips.idle) continue; // no separate clip: falls back to idle
      const a = this.mixer.clipAction(c); a.enabled = true; this.actions[n] = a;
    }
    for (const n of ['nod', 'shake']) if (this.actions[n]) { this.actions[n].setLoop(THREE.LoopOnce, 1); this.actions[n].clampWhenFinished = false; }
    this.current = null; this.play('idle', 0);
    this.mixer.update(Math.random() * 3);
    this.state = 'idle'; this.timer = rand(0.5, 4); this.path = []; this.speed = rand(1.15, 1.45);
    this.place = 'plaza'; this.heading = Math.random() * Math.PI * 2; this.group = null;
    this.vel = V(); this.stuck = 0; this.lastDist = 1e9;
    this.appear = 1; this.hidden = false;
    this.bubble = null; this.bubbleUntil = 0; this.tag = null; this.plumbob = null;
    this.lastActive = performance.now();
  }
  get pos() { return this.root.position; }
  play(name, fade = 0.35) {
    const a = this.actions[name] || this.actions.idle;
    if (this.current === a) return;
    a.reset(); a.setEffectiveWeight(1); a.play();
    if (name === 'walk') a.setEffectiveTimeScale(this.speed / 1.3);
    if (this.current) { this.current.crossFadeTo(a, fade, false); this.retiring ||= []; this.retiring.push({ action: this.current, left: fade }); }
    this.currentName = name; this.current = a;
  }
  gesture() {
    const n = Math.random() < 0.6 ? 'nod' : 'shake', a = this.actions[n];
    if (!a || this.currentName !== 'idle') return;
    a.reset().setEffectiveWeight(0.85).fadeIn(0.3).play();
    clearTimeout(this._g); this._g = setTimeout(() => a.fadeOut(0.4), (a.getClip().duration - 0.4) * 1000);
  }
  headPos(out = V()) {
    if (this.head) { this.head.getWorldPosition(out); out.y += 0.1; }
    else out.copy(this.pos).add(V(0, 1.7, 0));
    return out;
  }
  forward(out = V()) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
}

// ── Crowd: wandering, conversations, dancing, arrivals ───────────────────────
export class Crowd {
  constructor(scene, world, cast, overlay) {
    this.scene = scene; this.world = world; this.cast = cast; this.overlay = overlay;
    this.people = []; this.byUser = new Map(); this.groups = [];
    this.socialTimer = 0; this.maxPeople = 24; this.time = 0;
    const P = world.places;
    // floor heights of raised decks
    this.floors = [
      { P: P.plaza, test: (x, z) => Math.hypot(x, z) < 15.2, y: 0.12 },
      { P: P.park, test: (x, z) => Math.hypot(x, z) < 17.2, y: 0.14 },
      { P: P.cafe, test: (x, z) => Math.abs(x) < 10 && z > -14 && z < 7.5, y: 0.2 },
      { P: P.cathedral, test: (x, z) => Math.abs(x) < 9 && z < 2.3 && z > -31, y: 0.5, ramp: (x, z) => (z > 2.3 && z < 3.8 && Math.abs(x) < 9 ? 0.5 * (1 - (z - 2.3) / 1.5) : null) },
      { P: P.studio, test: (x, z) => Math.abs(x) < 6.5 && z > -3.5 && z < 6.5, y: 0.18 },
      { P: P.studio, test: (x, z) => Math.abs(x) < 11 && z > -12 && z < 10, y: 0.1 },
      { P: P.skyport, test: (x, z) => Math.abs(x) < 15 && z > -17 && z < 13, y: 0.1 },
    ];
  }

  floorAt(p) {
    for (const f of this.floors) {
      const lx = p.x - f.P.center.x, lz = p.z - f.P.center.z, c = Math.cos(-f.P.yaw), s = Math.sin(-f.P.yaw);
      const x = lx * c + lz * s, z = -lx * s + lz * c;
      if (f.ramp) { const rr = f.ramp(x, z); if (rr !== null) return rr; }
      if (f.test(x, z)) return f.y;
    }
    return 0;
  }

  randomSpot(placeId, near = null) {
    const spots = this.world.places[placeId].spots;
    if (!near) return pick(spots).clone();
    let best = null, bd = 1e9;
    for (let i = 0; i < 8; i++) { const s = pick(spots), d = s.distanceTo(near) + Math.random() * 3; if (d < bd) { bd = d; best = s; } }
    return best.clone();
  }

  freeSpot(placeId) {
    const spots = this.world.places[placeId].spots;
    for (let i = 0; i < 30; i++) { const s = pick(spots); if (this.people.every(p => p.hidden || p.pos.distanceTo(s) > 1.1)) return s.clone(); }
    return pick(spots).clone();
  }

  add(person, placeId, pos) {
    person.place = placeId; person.pos.copy(pos || this.freeSpot(placeId));
    person.pos.x += rand(-0.2, 0.2); person.pos.z += rand(-0.2, 0.2);
    person.root.rotation.y = person.heading;
    this.scene.add(person.root); this.people.push(person);
    if (person.user) this.byUser.set(person.user.toLowerCase(), person);
    return person;
  }

  spawnNPC(placeId = pick(['plaza', 'plaza', 'park', 'cafe', 'cathedral', 'studio', 'skyport'])) {
    const kind = pick(['michelle', 'michelle', 'gentleman', 'gentleman', 'soldier', 'soldier', 'xbot']);
    const p = new Person(this.cast, kind, { name: pick(NPC_NAMES) });
    return this.add(p, placeId);
  }

  viewer(user) { return this.byUser.get(String(user || '').toLowerCase()); }

  // Viewer enters the colony (or is moved). Returns { person, arrived } where arrived=true for a new body.
  bringViewer(user, avatar, placeId, { teleport = true } = {}) {
    let p = this.viewer(user), arrived = false, moved = false;
    if (!p) {
      this.makeRoom();
      const kinds = ['michelle', 'gentleman', 'soldier', 'xbot', 'michelle', 'gentleman'];
      const h = hashString(user);
      p = new Person(this.cast, kinds[h % kinds.length], { name: user, user, avatar, seed: h });
      this.add(p, placeId, this.freeSpot(placeId));
      this.overlay.attach(p);
      arrived = true;
    } else if (avatar && !p.avatar) { p.avatar = avatar; this.overlay.attach(p); }
    p.lastActive = performance.now();
    if (arrived || p.place !== placeId) {
      if (!arrived) { moved = true; this.leaveGroup(p); this.world.beam(p.pos.clone(), '#ff9b5c', 1.6); p.pos.copy(this.freeSpot(placeId)); p.place = placeId; }
      if (teleport) { p.hidden = true; p.appear = 0; p.root.visible = false; p.appearAt = this.time + 0.65; this.world.beam(p.pos.clone(), pick(['#7fe7ff', '#b98bff', '#7dffb2'])); }
      p.state = 'idle'; p.timer = rand(3, 6); p.path = [];
    }
    return { person: p, arrived, moved };
  }

  makeRoom() {
    if (this.people.length < this.maxPeople) return;
    const npc = this.people.filter(p => !p.isViewer && !p.posing);
    const victim = npc.length ? pick(npc) : this.people.filter(p => !p.posing).sort((a, b) => a.lastActive - b.lastActive)[0];
    if (victim) this.remove(victim);
  }

  remove(p) {
    this.leaveGroup(p);
    this.scene.remove(p.root); this.overlay.detach(p);
    clearTimeout(p._g); p.mixer.stopAllAction(); p.mixer.uncacheRoot(p.model);
    p.model.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
    this.people.splice(this.people.indexOf(p), 1);
    if (p.user) this.byUser.delete(p.user.toLowerCase());
  }

  // Close-up pose: stop and face the given direction for `sec` seconds.
  pose(p, sec) {
    this.leaveGroup(p);
    p.posing = this.time + sec; p.state = 'pose'; p.path = [];
    p.play('idle'); // stable, readable face during gift shots
    setTimeout(() => p.gesture(), 700);
  }

  // Route: inside a place, walk straight; between places, go via gates and the plaza.
  routeTo(p, placeId, target) {
    const W = this.world.places;
    p.path = [];
    if (placeId !== p.place) {
      if (p.place !== 'plaza') p.path.push(W[p.place].gate.clone());
      if (placeId !== 'plaza') {
        const dir = W[placeId].center.clone().normalize();
        p.path.push(dir.clone().multiplyScalar(13).add(V(-dir.z, 0, dir.x).multiplyScalar(rand(-2, 2))));
        p.path.push(W[placeId].gate.clone());
      }
    }
    p.path.push(target);
    p.place = placeId; p.state = 'walk'; p.stuck = 0; p.lastDist = 1e9;
    p.play('walk');
  }

  leaveGroup(p) {
    const g = p.group; if (!g) return;
    g.members = g.members.filter(m => m !== p); p.group = null;
    if (g.members.length < 2) { for (const m of g.members) { m.group = null; if (m.state === 'talk' || m.state === 'gather') { m.state = 'idle'; m.timer = rand(1, 3); m.play('idle'); } } this.groups = this.groups.filter(x => x !== g); }
  }

  formGroups(now) {
    const places = Object.keys(this.world.places);
    for (const id of places) {
      const free = this.people.filter(p => p.place === id && p.state === 'idle' && !p.hidden && !p.group && !p.posing);
      if (free.length < 2 || Math.random() < 0.35) continue;
      const a = pick(free), size = Math.random() < 0.6 ? 2 : Math.random() < 0.7 ? 3 : 4;
      const near = free.filter(p => p !== a && p.pos.distanceTo(a.pos) < 14).sort((x, y) => x.pos.distanceTo(a.pos) - y.pos.distanceTo(a.pos)).slice(0, size - 1);
      if (!near.length) continue;
      const members = [a, ...near];
      const center = members.reduce((s, m) => s.add(m.pos), V()).multiplyScalar(1 / members.length);
      // snap to a walkable spot of this place
      const spot = this.randomSpot(id, center);
      const g = { members, center: spot, until: 0, nextTalk: 0, speaker: 0, id: Math.random() };
      const rad = members.length === 2 ? 0.85 : 1.15, base = Math.random() * Math.PI * 2;
      members.forEach((m, i) => {
        const a2 = base + (i / members.length) * Math.PI * 2;
        m.slot = spot.clone().add(V(Math.cos(a2) * rad, 0, Math.sin(a2) * rad));
        m.group = g; m.state = 'gather'; m.path = [m.slot.clone()]; m.stuck = 0; m.lastDist = 1e9; m.play('walk');
      });
      g.gatherUntil = now + 14;
      this.groups.push(g);
    }
  }

  say(p, text, sec = 4.5) { this.overlay.bubble(p, text, sec); }

  update(dt, t, camera) {
    const now = t;
    this.socialTimer -= dt;
    if (this.socialTimer <= 0) { this.socialTimer = 1.2; this.formGroups(now); }
    this.time = t; const ms = t;
    for (const p of this.people) {
      // arrival (teleport in)
      if (p.hidden && p.appearAt && ms >= p.appearAt) { p.hidden = false; p.root.visible = true; p.appearAt = 0; }
      if (p.appear < 1 && !p.hidden) { p.appear = Math.min(1, p.appear + dt * 2.2); const e = 1 - Math.pow(1 - p.appear, 3); p.root.scale.set(e, e, e); }
      if (p.posing && ms > p.posing) { p.posing = 0; p.state = 'idle'; p.timer = rand(1, 2); p.play('idle'); }
      p.animationDt = (p.animationDt || 0) + dt;
      if (!camera || p.posing || camera.position.distanceToSquared(p.pos) < 900 || p.animationDt >= 0.1) {
        p.mixer.update(p.animationDt); p.animationDt = 0;
      }
      p.retiring = (p.retiring || []).filter(r => {
        r.left -= dt; if (r.left > 0) return true;
        if (r.action !== p.current) r.action.stop(); return false;
      });
      if (p.hidden) continue;
      switch (p.state) {
        case 'idle': {
          p.timer -= dt;
          if (p.timer <= 0) {
            const W = this.world.places;
            const roll = Math.random();
            if (roll > 0.92) { p.timer = rand(3, 8); break; }
            let dest = p.place;
            if (!p.isViewer && roll < 0.22) dest = pick(Object.keys(W));
            else if (p.isViewer && roll < 0.06) dest = 'plaza';
            this.routeTo(p, dest, this.freeSpot(dest));
          }
          break;
        }
        case 'walk': case 'gather': this.steer(p, dt); break;
        case 'talk': {
          const g = p.group; if (!g) { p.state = 'idle'; break; }
          const to = Math.atan2(g.center.x - p.pos.x, g.center.z - p.pos.z); this.turn(p, to, dt);
          break;
        }
        case 'pose': if (p.faceYaw !== undefined) this.turn(p, p.faceYaw, dt, 4); break;
      }
      p.pos.y += (this.floorAt(p.pos) - p.pos.y) * Math.min(1, dt * 10);
      p.root.rotation.y = p.heading;
    }
    separatePeople(this.people, this.world.obstacles);
    // conversations
    for (const g of [...this.groups]) {
      const ready = g.members.every(m => m.state === 'talk' || (m.state === 'gather' && m.path.length === 0));
      if (g.until === 0 && (ready || now > g.gatherUntil)) {
        g.until = now + rand(9, 20); g.nextTalk = now + 0.6;
        for (const m of g.members) { m.state = 'talk'; m.path = []; m.play('idle'); }
      }
      if (g.strolling && ready) {
        g.strolling = false;
        for (const m of g.members) { m.state = 'talk'; m.play('idle'); }
      }
      // Some conversations continue as a short side-by-side stroll.
      if (g.until && !g.didStroll && now > g.until - 6) {
        g.didStroll = true; g.strolling = true;
        const target = this.randomSpot(g.members[0].place, g.center);
        const dx = target.x - g.center.x, dz = target.z - g.center.z;
        const len = Math.hypot(dx, dz) || 1;
        const step = Math.min(len, 4);
        g.center.x += dx / len * step; g.center.z += dz / len * step;
        g.members.forEach((m, i) => {
          m.slot = g.center.clone().add(V(-dz / len, 0, dx / len).multiplyScalar((i - (g.members.length - 1) / 2) * 1.3));
          m.path = [m.slot.clone()]; m.state = 'gather'; m.play('walk');
        });
        g.until = now + 12;
      }
      if (g.until && now > g.nextTalk) {
        g.speaker = (g.speaker + 1 + Math.floor(Math.random() * (g.members.length - 1))) % g.members.length;
        const s = g.members[g.speaker];
        if (s) { if (!s.isViewer || Math.random() < 0.8) this.say(s, pick(CHAT_ICONS) + (Math.random() < 0.35 ? pick(CHAT_ICONS) : ''), 2.2); if (Math.random() < 0.6) s.gesture(); }
        g.nextTalk = now + rand(1.6, 2.8);
      }
      if (g.until && now > g.until) {
        for (const m of g.members) { m.group = null; m.state = 'idle'; m.timer = rand(0.5, 3); m.play('idle'); }
        this.groups = this.groups.filter(x => x !== g);
      }
    }
  }

  turn(p, to, dt, rate = 5) {
    let d = to - p.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    p.heading += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }

  steer(p, dt) {
    const target = p.path[0];
    if (!target) {
      if (p.state === 'gather') { if (p.group) { const c = p.group.center; this.turn(p, Math.atan2(c.x - p.pos.x, c.z - p.pos.z), dt); } p.play('idle'); return; }
      p.state = 'idle'; p.timer = rand(2, 7); p.play('idle'); return;
    }
    const to = V(target.x - p.pos.x, 0, target.z - p.pos.z), dist = to.length();
    const last = p.path.length === 1;
    if (dist < (last ? 0.25 : 1.2)) { p.path.shift(); p.lastDist = 1e9; return; }
    // progress watchdog
    p.stuck += dt;
    if (p.stuck > 3) { if (dist > p.lastDist - 0.2) { p.path = [this.randomSpot(p.place, p.pos)]; } p.lastDist = dist; p.stuck = 0; }
    to.normalize();
    // separation + obstacle push
    const push = V();
    for (const o of this.people) {
      if (o === p || o.hidden) continue;
      const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 2.25 && d2 > 1e-4) { const d = Math.sqrt(d2); push.x += (dx / d) * (1.5 - d) * 2.2; push.z += (dz / d) * (1.5 - d) * 2.2; }
    }
    for (const o of this.world.obstacles) {
      const dx = p.pos.x - o.x, dz = p.pos.z - o.z, d = Math.hypot(dx, dz), m = o.r + 0.35;
      if (d < m + 0.8 && d > 1e-3) {
        const k = d < m ? (m - d) * 6 : (m + 0.8 - d) * 1.2;
        push.x += (dx / d) * k; push.z += (dz / d) * k;
        // slide around: add tangential component toward target side
        const side = 1; // consistent passing side prevents head-on oscillation
        push.x += (-dz / d) * side * k * 0.6; push.z += (dx / d) * side * k * 0.6;
      }
    }
    const dir = to.clone().add(push.multiplyScalar(0.5));
    const want = Math.atan2(dir.x, dir.z);
    this.turn(p, want, dt, 6);
    const f = p.forward(V()), sp = p.speed * (last && dist < 0.8 ? Math.max(0.35, dist / 0.8) : 1);
    const facing = Math.max(0.2, f.dot(to.lengthSq() ? dir.normalize() : f));
    p.pos.addScaledVector(f, sp * dt * facing);
    // hard collision with obstacles
    for (const o of this.world.obstacles) {
      const dx = p.pos.x - o.x, dz = p.pos.z - o.z, d = Math.hypot(dx, dz), m = o.r + 0.25;
      if (d < m && d > 1e-3) { p.pos.x = o.x + (dx / d) * m; p.pos.z = o.z + (dz / d) * m; }
    }
  }
}

// ── DOM overlay: plumbobs are 3D, avatar tags + chat bubbles are HTML ────────
export class Overlay {
  constructor(el, scene) {
    this.el = el; this.scene = scene; this.items = new Map();
    this.plumbGeo = new THREE.OctahedronGeometry(0.085, 0); this.plumbGeo.scale(1, 2, 1);
    this.plumbMat = new THREE.MeshStandardMaterial({ color: '#39ff6a', emissive: '#18d84a', emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92 });
    this.goldMat = new THREE.MeshStandardMaterial({ color: '#ffd34a', emissive: '#ffb300', emissiveIntensity: 1.3, roughness: 0.15, metalness: 0.4 });
    this.v = V();
  }
  entry(p) { let e = this.items.get(p.id); if (!e) { e = { p }; this.items.set(p.id, e); } return e; }
  attach(p) {
    const e = this.entry(p);
    if (!e.tag) {
      e.tag = document.createElement('div'); e.tag.className = 'tag';
      e.tag.innerHTML = '<div class="pic"></div><div class="nm"></div>';
      this.el.appendChild(e.tag);
    }
    const pic = e.tag.querySelector('.pic');
    pic.innerHTML = '';
    if (p.avatar) { const img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = p.avatar; img.onerror = () => { pic.textContent = initials(p.name); }; pic.appendChild(img); }
    else { pic.textContent = initials(p.name); pic.style.background = `hsl(${hashString(p.name) % 360},70%,45%)`; }
    e.tag.querySelector('.nm').textContent = p.name;
    if (!p.plumbob) { p.plumbob = new THREE.Mesh(this.plumbGeo, this.plumbMat); p.plumbob.castShadow = false; this.scene.add(p.plumbob); }
  }
  setGold(p, on) { if (p.plumbob) p.plumbob.material = on ? this.goldMat : this.plumbMat; const e = this.items.get(p.id); e?.tag?.classList.toggle('gold', on); }
  detach(p) {
    const e = this.items.get(p.id); if (!e) return;
    e.tag?.remove(); e.bubble?.remove(); this.items.delete(p.id);
    if (p.plumbob) { this.scene.remove(p.plumbob); p.plumbob = null; }
  }
  bubble(p, text, sec) {
    const e = this.entry(p);
    if (!e.bubble) { e.bubble = document.createElement('div'); e.bubble.className = 'bubble'; this.el.appendChild(e.bubble); }
    const emojiOnly = /^[\p{Extended_Pictographic}‍️\s]+$/u.test(text);
    e.bubble.classList.toggle('emoji', emojiOnly);
    e.bubble.textContent = text; e.bubbleUntil = performance.now() + sec * 1000; e.bubble.classList.add('show');
  }
  update(camera, t, focusId = null) {
    const w = this.el.clientWidth, h = this.el.clientHeight, now = performance.now();
    const proj = (v, dy) => { const s = v.clone(); s.y += dy; s.project(camera); return { x: (s.x * 0.5 + 0.5) * w, y: (-s.y * 0.5 + 0.5) * h, on: s.z < 1 && Math.abs(s.x) < 1.3 && Math.abs(s.y) < 1.3 }; };
    for (const [id, e] of this.items) {
      const p = e.p, hp = p.headPos(this.v);
      if (p.plumbob) {
        p.plumbob.visible = !p.hidden;
        p.plumbob.position.set(hp.x, hp.y + 0.36 + Math.sin(t * 2.4 + id) * 0.03, hp.z);
        p.plumbob.rotation.y = t * 1.6 + id;
        p.plumbob.scale.setScalar(p.root.scale.x);
      }
      const dist = camera.position.distanceTo(hp), focus = id === focusId;
      const k = THREE.MathUtils.clamp(9 / dist, 0.38, focus ? 1.05 : 1.25);
      if (e.tag) {
        const s = proj(hp, 0.6), vis = s.on && !p.hidden && dist < 70;
        e.tag.style.display = vis ? '' : 'none';
        if (vis) { e.tag.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%) scale(${k})`; e.tag.style.zIndex = String(1000 - Math.round(dist)); }
      }
      if (e.bubble) {
        const live = now < e.bubbleUntil;
        if (p.isViewer) {
          // speech bubble beside the head (the tag sits above it)
          const s = proj(hp, 0.05), vis = live && s.on && !p.hidden && dist < 60, kb = Math.min(1.2, k);
          e.bubble.style.display = vis ? '' : 'none'; e.bubble.classList.add('side');
          if (vis) { e.bubble.style.transform = `translate(${s.x + 34 * kb}px,${s.y}px) translate(0,-100%) scale(${kb})`; e.bubble.style.zIndex = String(1100 - Math.round(dist)); }
        } else {
          const s = proj(hp, 0.5), vis = live && s.on && !p.hidden && dist < 34, kb = Math.min(1.2, k);
          e.bubble.style.display = vis ? '' : 'none';
          if (vis) { e.bubble.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%) scale(${kb})`; e.bubble.style.zIndex = String(1100 - Math.round(dist)); }
        }
        if (!live && !p.isViewer && !e.tag) { e.bubble.remove(); e.bubble = null; this.items.delete(id); }
      }
    }
  }
}

function initials(name) { const s = String(name || '?').replace(/[^\p{L}\p{N}]/gu, ''); return (s.slice(0, 2) || '?').toUpperCase(); }
export { LOCATIONS };
