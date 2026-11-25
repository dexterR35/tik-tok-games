import { clamp, WORLD } from './rules.js';

export class Camera {
  constructor() { this.mode = 'auto'; this.zoom = 1; this.x = WORLD.W / 2; this.y = WORLD.H / 2; this.manualZoom = 1; }
  update(dt, sim) {
    let zoom = 1, x = WORLD.W / 2, y = WORLD.H / 2;
    if (this.mode === 'battle' || (this.mode === 'auto' && sim.state === 'fight')) {
      const targets = sim.zombies.filter(z => z.hp > 0);
      const boss = targets.find(z => z.kind === 'boss');
      const front = targets.reduce((a, b) => !a || b.y > a.y ? b : a, null);
      zoom = sim.breached ? 1.07 : boss ? 1.06 : 1.025;
      x += clamp(((boss || front)?.x ?? x) - x, -100, 100) * 0.1;
      y += sim.breached ? 24 : -18;
    }
    if (this.mode === 'overview') zoom = 1;
    zoom = clamp(zoom * this.manualZoom, 1, 1.2);
    // Bounds prevent a zoom or camera transition exposing empty canvas edges.
    const halfW = WORLD.W / (2 * zoom), halfH = WORLD.H / (2 * zoom);
    x = clamp(x, halfW, WORLD.W - halfW); y = clamp(y, halfH, WORLD.H - halfH);
    const a = 1 - Math.exp(-dt * 1.6);
    this.zoom += (zoom - this.zoom) * a; this.x += (x - this.x) * a; this.y += (y - this.y) * a;
    const hw = WORLD.W / (2 * this.zoom), hh = WORLD.H / (2 * this.zoom);
    this.x = clamp(this.x, hw, WORLD.W - hw); this.y = clamp(this.y, hh, WORLD.H - hh);
  }
  apply(ctx) { ctx.translate(WORLD.W / 2, WORLD.H / 2); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.x, -this.y); }
}
