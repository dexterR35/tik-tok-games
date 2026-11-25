import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

// Cinematic camera. Gift shots jump the queue; otherwise it tours the colony.
export class Director {
  constructor(camera, world, crowd, hooks = {}) {
    this.camera = camera; this.world = world; this.crowd = crowd; this.hooks = hooks;
    this.queue = []; this.shot = null; this.idle = null;
    this.pos = V(0, 16, 42); this.look = V(0, 3, 0); this.fov = 50;
    this.dPos = this.pos.clone(); this.dLook = this.look.clone(); this.dFov = 50; this.k = 1;
    camera.position.copy(this.pos); camera.lookAt(this.look);
    this.focusId = null; this.lastPlace = null;
  }

  enqueue(shot) {
    // one entry per person: a new gift from someone already waiting just extends it
    const same = this.queue.find(s => s.person === shot.person);
    if (same) { same.sec = Math.max(same.sec, shot.sec) + 0.8; same.banner = shot.banner; same.hype = Math.max(same.hype, shot.hype); return; }
    if (this.shot?.person === shot.person && this.shot.type === 'face' && !shot.arrive) { this.shot.end += Math.min(2.5, shot.sec * 0.5); this.hooks.banner?.(shot); return; }
    if (this.queue.length >= 8) this.queue.shift();
    this.queue.push(shot);
  }
  get busy() { return !!this.shot || this.queue.length > 0; }

  startShot(s, t) {
    this.shot = s; s.t0 = t; s.end = t + s.sec + (s.arrive ? 1.4 : 0);
    const p = s.person;
    // the person turns to face where the camera comes from
    const from = this.pos.clone();
    p.faceYaw = Math.atan2(from.x - p.pos.x, from.z - p.pos.z);
    if (s.arrive) {
      // turn toward the plaza-facing side so the entrance reads well
      const P = this.world.places[p.place];
      const out = P.id === 'plaza' ? from.clone().sub(p.pos) : P.center.clone().multiplyScalar(-1);
      p.faceYaw = Math.atan2(out.x, out.z);
    }
    this.crowd.pose(p, s.sec + (s.arrive ? 1.4 : 0) + 0.6);
    this.focusId = p.id;
    this.hooks.banner?.(s); this.hooks.place?.(p.place);
    this.side = Math.random() < 0.5 ? -1 : 1;
  }

  pickIdle(t) {
    const W = this.world.places, ids = Object.keys(W);
    const active = this.crowd.people.filter(p => !p.hidden);
    const moving = active.filter(p => p.state === 'walk');
    const walkers = moving.length ? moving : active;
    const groups = this.crowd.groups.filter(g => g.until);
    const viewers = this.crowd.people.filter(p => p.isViewer && !p.hidden);
    const opts = walkers.length ? ['follow'] : ['orbit'];
    if (walkers.length) opts.push('follow', 'follow', 'follow');
    if (groups.length) opts.push('group', 'group', 'group');
    if (viewers.length) opts.push('viewer', 'viewer');
    let type = pick(opts);
    if (this.idle && type === this.idle.type) type = pick(opts);
    const s = { type, t0: t, end: t + rand(12, 18), a0: Math.random() * Math.PI * 2, side: Math.random() < 0.5 ? -1 : 1 };
    if (type === 'orbit' || type === 'dolly') s.place = pick(ids);
    if (type === 'follow') s.person = pick(walkers);
    if (type === 'group') { s.group = pick(groups); s.place = s.group.members[0]?.place; }
    if (type === 'viewer') { s.person = pick(viewers); s.end = t + rand(5, 7); }
    if (type === 'establish') s.end = t + rand(9, 12);
    this.idle = s; this.focusId = s.person?.id ?? null;
    this.hooks.place?.(s.place || s.person?.place || 'plaza');
  }

  // Close-up: head, plumbob and avatar tag in frame. yaw = direction the person faces.
  faceFrame(p, u, dist = 1.9, yaw = p.heading) {
    const head = p.headPos(V());
    const f = V(Math.sin(yaw), 0, Math.cos(yaw)), right = V(f.z, 0, -f.x);
    const d = THREE.MathUtils.lerp(dist + 0.9, dist, THREE.MathUtils.smootherstep(Math.min(1, u), 0, 1));
    this.dPos.copy(head).addScaledVector(f, d).addScaledVector(right, 0.35 * this.side).add(V(0, 0.12, 0));
    this.dLook.copy(head).add(V(0, -0.1, 0)).addScaledVector(right, -0.04 * this.side);
    this.dFov = 40;
  }

  update(dt, t) {
    if (this.shot && t > this.shot.end) { this.shot.person.posing = Math.min(this.shot.person.posing || 0, this.crowd.time + 0.4); this.shot = null; this.hooks.bannerOff?.(); this.idle = null; }
    if (!this.shot && this.queue.length) { this.startShot(this.queue.shift(), t); }
    const s = this.shot;
    if (s) {
      const p = s.person, u = (t - s.t0);
      const far = this.pos.distanceTo(p.pos) > 18;
      if (s.arrive && u < 1.4) {
        // wide view of the beam and the place
        const head = p.pos.clone().add(V(0, 1.4, 0));
        const out = V(Math.sin(p.faceYaw), 0, Math.cos(p.faceYaw));
        this.dPos.copy(head).addScaledVector(out, 4.6).add(V(0, 0.9, 0)).addScaledVector(V(out.z, 0, -out.x), 1.2 * this.side);
        this.dLook.copy(head).add(V(0, 0.4, 0)); this.dFov = 50; this.k = far ? 2.2 : 3;
      } else {
        this.faceFrame(p, (u - (s.arrive ? 1.4 : 0)) / 2.2, 2.35, p.faceYaw);
        this.k = far ? 2.4 : 3.2;
      }
    } else {
      if (!this.idle || t > this.idle.end || (this.idle.person && (this.idle.person.hidden || !this.crowd.people.includes(this.idle.person))) || (this.idle.group && !this.crowd.groups.includes(this.idle.group))) this.pickIdle(t);
      const i = this.idle, u = t - i.t0, W = this.world.places;
      this.k = 0.9; this.dFov = 50;
      if (i.type === 'orbit') {
        const P = W[i.place], c = P.center;
        if (P.id === 'plaza') {
          const a = i.a0 + u * 0.045 * i.side;
          this.dPos.set(c.x + Math.cos(a) * 24, 7.5 + Math.sin(u * 0.15) * 1.5, c.z + Math.sin(a) * 24);
          this.dLook.set(c.x, 2.4, c.z);
        } else {
          // swing across the open (plaza-facing) side of the place, never behind its buildings
          const a = Math.sin(i.a0 + u * 0.06 * i.side) * 1.05, R = P.radius + 9;
          this.dPos.copy(P.toW(Math.sin(a) * R, 7 + Math.sin(u * 0.15) * 1.2, Math.cos(a) * R));
          this.dLook.copy(P.toW(0, 2.2, -P.radius * 0.2));
        }
      } else if (i.type === 'establish') {
        const a = i.a0 + u * 0.03;
        this.dPos.set(Math.cos(a) * 58, 28 - u * 0.8, Math.sin(a) * 58);
        this.dLook.set(0, 14, 0); this.dFov = 55;
      } else if (i.type === 'dolly') {
        const P = W[i.place];
        const a = P.toW(-14 * i.side, 2.4, 10 + 0), b = P.toW(14 * i.side, 2.2, 6);
        const k = Math.min(1, u / (i.end - i.t0));
        this.dPos.copy(a).lerp(b, k); this.dLook.copy(P.toW(0, 2.2, -4));
      } else if (i.type === 'follow' || i.type === 'viewer') {
        const p = i.person, head = p.headPos(V()), f = p.forward(V()), right = V(f.z, 0, -f.x);
        if (i.type === 'follow') {
          this.dPos.copy(head).addScaledVector(f, 5.5).addScaledVector(right, 2.6 * i.side).add(V(0, 1.1, 0));
          this.dLook.copy(head).add(V(0, -0.35, 0)); this.dFov = 48; this.k = 1.1;
        } else { this.side = i.side; this.faceFrame(p, 1, 2.6); this.dFov = 40; this.k = 1.4; }
      } else if (i.type === 'group') {
        const g = i.group, c = g.center, a = i.a0 + u * 0.06;
        this.dPos.set(c.x + Math.cos(a) * 6, c.y + 3.2, c.z + Math.sin(a) * 6);
        this.dLook.set(c.x, c.y + 1.2, c.z); this.dFov = 42; this.k = 1.2;
      }
    }
    const a = 1 - Math.exp(-this.k * dt);
    this.pos.lerp(this.dPos, a); this.look.lerp(this.dLook, Math.min(1, a * 1.4)); this.fov += (this.dFov - this.fov) * a;
    // never below the ground, never inside walls, pillars or spires
    this.pos.y = Math.max(this.pos.y, 0.6);
    if (this.pos.y < 24) for (const o of this.world.obstacles) {
      if (o.r < 1.2 && this.shot) continue; // small props may sit between camera and face
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z, dd = Math.hypot(dx, dz), m = o.r + 0.5;
      if (dd < m && dd > 1e-3) { this.pos.x = o.x + (dx / dd) * m; this.pos.z = o.z + (dz / dd) * m; }
    }
    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
    this.world.setFocus(this.look);
  }
}
