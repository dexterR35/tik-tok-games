// Persistent resources, with deliveries driven by actual worker trips in simulation time.
import { clamp } from './rules.js';

export const WORK_SITES = [
  { name: 'LUMBER CAMP', resource: 'wood', x: 145, y: 1570, amount: 8, work: 4 },
  { name: 'WHEAT FIELDS', resource: 'food', x: 900, y: 1650, amount: 6, work: 5 },
];
export const STORE = { x: 540, y: 1665 };
const stock = n => Number.isFinite(Number(n)) ? clamp(Math.floor(Number(n)), 0, 9999) : 0;

export class Settlement {
  constructor(save = {}) {
    this.wood = stock(save.wood); this.food = stock(save.food);
    this.deliveries = stock(save.deliveries);
    this.workers = Array.from({ length: 6 }, (_, i) => ({
      id: i, site: i % 2, x: STORE.x + (i - 3) * 12, y: STORE.y + i * 6,
      state: 'outbound', wait: i * 0.8, phase: i, vx: 0, vy: 0, carrying: false,
    }));
  }
  serialize() { return { wood: this.wood, food: this.food, deliveries: this.deliveries }; }
  update(dt, sim) {
    if (sim.state === 'fallen') return;
    for (const w of this.workers) {
      if (w.wait > 0) { w.wait -= dt; w.vx = w.vy = 0; continue; }
      const site = WORK_SITES[w.site];
      if (w.state === 'working') { w.state = 'returning'; w.carrying = true; }
      const goal = w.state === 'returning' ? STORE : site;
      const dx = goal.x - w.x, dy = goal.y + (w.id % 3) * 12 - w.y;
      const d = Math.hypot(dx, dy);
      if (d < 5) {
        w.vx = w.vy = 0;
        if (w.state === 'returning') {
          this[site.resource] = Math.min(9999, this[site.resource] + site.amount);
          this.deliveries++; w.carrying = false; w.state = 'outbound'; w.wait = 0.8;
        } else { w.state = 'working'; w.wait = site.work; }
        continue;
      }
      const speed = w.carrying ? 47 : 60, blend = 1 - Math.exp(-dt * 7);
      w.vx += (dx / d * speed - w.vx) * blend;
      w.vy += (dy / d * speed - w.vy) * blend;
      w.x += w.vx * dt; w.y += w.vy * dt; w.phase += dt * speed / 12;
      w.distance = (w.distance || 0) + Math.hypot(w.vx, w.vy) * dt;
    }
  }
  provision(sim) {
    // Repairs and one fortification per clear; resources cannot silently disappear at full health.
    if (sim.wallHp < sim.stats.wallHp && this.wood >= 8) {
      const n = Math.min(Math.floor(this.wood / 8), Math.ceil((sim.stats.wallHp - sim.wallHp) / (sim.stats.wallHp * 0.08)));
      this.wood -= n * 8; sim.repair(n * 0.08, 'MASONS');
    }
    if (this.wood >= 40 && sim.turrets.some(t => t.level < 5)) {
      this.wood -= 40; sim.buildTurrets(1, 'WORKERS');
    }
    if (this.food >= 12) { this.food -= 12; sim.addShield(0.08); }
  }
}
