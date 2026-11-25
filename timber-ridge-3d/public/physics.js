// Monster rock-crawler physics. Units: metres, kg, seconds, y up, angles counter-clockwise (jeep faces +x).
// The chassis and the two wheels are separate rigid bodies. Each wheel rides on a coilover (spring + damper
// along the chassis' down axis, with bump stop and droop strap) and a stiff link that keeps it in line.
// Wheels touch the ground as circles (up to two contact points), so they can roll up near-vertical rock ledges.
// Tyre friction comes from slip and is limited to mu × normal force.
import { clamp } from './rules.js';

const G = 9.81;
export const JEEP = {
  mass: 1300, inertia: 2600,
  wheelRadius: 0.74, wheelMass: 55, wheelInertia: 0.6 * 55 * 0.74 * 0.74,
  attach: [[-1.48, -0.3], [1.52, -0.3]],          // rear, front coilover tops (local)
  restLen: 0.98,                                  // spring free length along the axis
  maxLen: 0.98,                                   // droop strap
  groundK: 1.0e6, groundC: 9000, slipK: 5000, linkK: 2.0e6, linkC: 15000,
  drag: 0.45,
  hull: [
    [-2.25, -0.05, 0], [2.3, 0.0, 0], [-1.0, -0.45, 0], [0, -0.5, 0], [1.0, -0.45, 0],
    [-2.2, 0.75, 0], [2.2, 0.62, 0],
    [-1.7, 1.75, 1], [0.35, 1.68, 1], [-0.6, 1.8, 1],   // roof / roll cage — flag 1 = crash zone
  ],
};

// Up to two ground contacts for a circle (cx, cy, r): the closest point, plus a second one on the other side.
function contacts(terrain, cx, cy, r, out) {
  out.length = 0;
  const gy = terrain.height(cx);
  if (cy <= gy) {
    const [nx, ny] = terrain.normal(cx);
    out.push({ pen: r + (gy - cy) * ny, px: cx, py: gy, nx, ny });
    return out;
  }
  const span = r * 1.12, N = 28, xs = [], ds = [];
  for (let i = 0; i <= N; i++) {
    const x = cx - span + (2 * span * i) / N, dy = terrain.height(x) - cy, dx = x - cx;
    xs.push(x); ds.push(dx * dx + dy * dy);
  }
  const refine = i => {
    let bx = xs[i], bd = ds[i], h = (2 * span) / N;
    for (let it = 0; it < 6; it++) {
      h *= 0.5;
      for (const x of [bx - h, bx + h]) { const dy = terrain.height(x) - cy, dx = x - cx, d = dx * dx + dy * dy; if (d < bd) { bd = d; bx = x; } }
    }
    return [bx, bd];
  };
  let i1 = 0;
  for (let i = 1; i <= N; i++) if (ds[i] < ds[i1]) i1 = i;
  const add = ([bx, bd]) => {
    const dist = Math.sqrt(bd);
    if (dist >= r) return;
    const py = terrain.height(bx);
    let nx = (cx - bx) / (dist || 1), ny = (cy - py) / (dist || 1);
    if (dist < 1e-4) [nx, ny] = terrain.normal(cx);
    out.push({ pen: r - dist, px: bx, py, nx, ny });
  };
  add(refine(i1));
  // second contact: best local minimum on the other side of the wheel (ledge corner + floor, two rocks…)
  let i2 = -1;
  for (let i = 1; i < N; i++) {
    if (Math.abs(xs[i] - xs[i1]) < r * 0.45) continue;
    if (ds[i] <= ds[i - 1] && ds[i] <= ds[i + 1] && ds[i] < r * r && (i2 < 0 || ds[i] < ds[i2])) i2 = i;
  }
  if (i2 >= 0) add(refine(i2));
  return out;
}

export class Jeep {
  constructor(stats) {
    this.stats = stats;
    this.wheels = JEEP.attach.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, omega: 0, rot: 0, len: 0.8, grounded: false, slip: 0, load: 0, cx: 0, cy: 0, nx: 0, ny: 1, list: [] }));
    this.reset(0, 2, 0);
  }

  get minLen() { return JEEP.maxLen - this.stats.travel; }

  reset(x, y, a) {
    Object.assign(this, { x, y, a, vx: 0, vy: 0, w: 0 });
    const c = Math.cos(a), s = Math.sin(a);
    JEEP.attach.forEach(([ax, ay], i) => {
      const wh = this.wheels[i], L = 0.78;
      Object.assign(wh, { x: x + ax * c - (ay - L) * s, y: y + ax * s + (ay - L) * c, vx: 0, vy: 0, omega: 0, len: L, grounded: false, slip: 0, load: 0 });
    });
    this.roofHit = false; this.hullImpact = 0; this.landImpact = 0; this.airTime = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get grounded() { return this.wheels.some(w => w.grounded); }

  toWorld(lx, ly) {
    const c = Math.cos(this.a), s = Math.sin(this.a);
    return [this.x + lx * c - ly * s, this.y + lx * s + ly * c];
  }
  toLocal(wx, wy) {
    const c = Math.cos(this.a), s = Math.sin(this.a), dx = wx - this.x, dy = wy - this.y;
    return [dx * c + dy * s, -dx * s + dy * c];
  }

  /**
   * One fixed step. input = { throttle 0..1, speedShare 0..1, powerMult, gripMult, nitro, assist, brake }.
   */
  step(terrain, input, dt) {
    const st = this.stats, J = JEEP, r = J.wheelRadius, mw = J.wheelMass, Iw = J.wheelInertia;
    const c = Math.cos(this.a), s = Math.sin(this.a);
    const dX = s, dY = -c;           // chassis down axis
    const pX = c, pY = s;            // chassis forward axis
    let fx = 0, fy = -J.mass * G, tq = 0;
    const applyAt = (px, py, Fx, Fy) => { fx += Fx; fy += Fy; tq += (px - this.x) * Fy - (py - this.y) * Fx; };
    const topSpeed = st.topSpeed * input.speedShare * (input.nitro ? 1.4 : 1);
    const torqueTotal = st.torque * input.powerMult * input.throttle;
    const minLen = this.minLen;
    const wasAir = !this.grounded;

    this.wheels.forEach((wh, i) => {
      const [ax, ay] = J.attach[i];
      const Ax = this.x + ax * c - ay * s, Ay = this.y + ax * s + ay * c;
      const vAx = this.vx - this.w * (Ay - this.y), vAy = this.vy + this.w * (Ax - this.x);
      const rx = wh.x - Ax, ry = wh.y - Ay;
      const along = rx * dX + ry * dY, lat = rx * pX + ry * pY;
      const rvx = wh.vx - vAx, rvy = wh.vy - vAy;
      const vAlong = rvx * dX + rvy * dY, vLat = rvx * pX + rvy * pY;
      // coilover (force on the wheel along the down axis; + pushes the wheel down)
      let Fd = st.springK * (J.restLen - along) - st.damping * vAlong;
      if (along < minLen) Fd += 500000 * (minLen - along) - 9000 * Math.min(0, vAlong);   // bump stop
      if (along > J.maxLen) Fd -= 500000 * (along - J.maxLen) + 9000 * Math.max(0, vAlong); // droop strap
      const Fl = -J.linkK * lat - J.linkC * vLat;                                          // locating link
      const Fwx = dX * Fd + pX * Fl, Fwy = dY * Fd + pY * Fl;
      applyAt(Ax, Ay, -Fwx, -Fwy);
      wh.len = along;

      // ground contacts
      let gx = Fwx, gy = Fwy - mw * G, wTorque = 0;
      const roll = wh.omega * r;
      // flat torque up to 60 % of the limiter, then a linear fade to zero at the limiter
      const drive = 0.5 * torqueTotal * clamp(2.5 * (1 - roll / Math.max(1, topSpeed)), 0, 1);
      wTorque += drive;
      tq += drive * 0.6;   // engine reaction lifts the nose (wheelie)
      contacts(terrain, wh.x, wh.y, r, wh.list);
      let load = 0;
      wh.grounded = wh.list.length > 0;
      for (const k of wh.list) {
        const vn = wh.vx * k.nx + wh.vy * k.ny;
        const Fn = Math.max(0, J.groundK * k.pen - J.groundC * vn);
        const tx = k.ny, ty = -k.nx;
        const slip = wh.vx * tx + wh.vy * ty - roll;
        const mu = st.grip * input.gripMult * terrain.gripAt(k.px);
        const Ff = clamp(-slip * J.slipK * (input.gripMult > 1 ? 1.3 : 1), -mu * Fn, mu * Fn);
        gx += k.nx * Fn + tx * Ff; gy += k.ny * Fn + ty * Ff;
        wTorque -= Ff * r;
        load += Fn;
        wh.slip = slip; wh.cx = k.px; wh.cy = k.py; wh.nx = k.nx; wh.ny = k.ny;
        if (wasAir && vn < -3) this.landImpact = Math.max(this.landImpact, -vn);
      }
      wh.load = load;
      if (!wh.grounded) wh.slip = 0;
      // brakes: hold the jeep when the crowd is not tapping
      if (input.brake) {
        const lim = (9000 * dt) / Iw;
        wh.omega -= clamp(wh.omega + (wTorque * dt) / Iw, -lim, lim);
      }
      wh.omega += (wTorque / Iw) * dt;
      wh.omega -= Math.sign(wh.omega) * Math.min(Math.abs(wh.omega), (25 / Iw) * dt);   // rolling resistance
      wh.rot -= wh.omega * dt;
      wh.vx += (gx / mw) * dt; wh.vy += (gy / mw) * dt;
      wh.x += wh.vx * dt; wh.y += wh.vy * dt;
    });

    // hull contacts (body and roll cage)
    this.roofHit = false; this.hullImpact = 0;
    for (const [lx, ly, roof] of J.hull) {
      const px = this.x + lx * c - ly * s, py = this.y + lx * s + ly * c;
      const gy = terrain.height(px);
      if (py >= gy) continue;
      const [nx, ny] = terrain.normal(px);
      const pen = Math.min(0.6, (gy - py) * Math.max(0.3, ny));
      const vpx = this.vx - this.w * (py - this.y), vpy = this.vy + this.w * (px - this.x);
      const vn = vpx * nx + vpy * ny;
      const Fn = Math.max(0, 260000 * pen - 16000 * vn);
      const tx = ny, ty = -nx, vt = vpx * tx + vpy * ty;
      const Ft = clamp(-vt * 9000, -0.5 * Fn, 0.5 * Fn);
      applyAt(px, py, nx * Fn + tx * Ft, ny * Fn + ty * Ft);
      this.hullImpact = Math.max(this.hullImpact, -vn);
      if (roof) this.roofHit = true;
    }

    // invisible wall behind the start line
    if (this.x < -12) fx += (-12 - this.x) * 40000 - this.vx * 3000;
    if (input.nitro) { fx += pX * st.nitroForce; fy += pY * st.nitroForce; }
    const sp = Math.hypot(this.vx, this.vy);
    fx -= J.drag * this.vx * sp; fy -= J.drag * this.vy * sp;

    // stability assist: level to the slope ahead in the air, resist flips on the ground
    const target = Math.atan(clamp(terrain.slope(this.x + 2.5 + Math.max(0, this.vx) * 0.25), -1.5, 1.5));
    const err = Math.atan2(Math.sin(target - this.a), Math.cos(target - this.a));
    if (!this.grounded) { this.airTime += dt; tq += st.stability * (3200 * err - 1400 * this.w); }
    else { this.airTime = 0; if (Math.abs(err) > 0.8) tq += st.stability * 2600 * Math.sign(err) * (Math.abs(err) - 0.8); }
    if (input.assist) tq += 11000 * err - 3000 * this.w;   // shield: hard self-righting

    this.vx += (fx / J.mass) * dt;
    this.vy += (fy / J.mass) * dt;
    this.w = clamp(this.w + (tq / J.inertia) * dt, -9, 9);
    this.x += this.vx * dt; this.y += this.vy * dt; this.a += this.w * dt;
    if (this.a > Math.PI) this.a -= 2 * Math.PI;
    if (this.a < -Math.PI) this.a += 2 * Math.PI;
  }

  // Up-vector vs ground normal: < 0 means upside down.
  uprightness(terrain) {
    const [nx, ny] = terrain.normal(this.x);
    return -Math.sin(this.a) * nx + Math.cos(this.a) * ny;
  }
}
