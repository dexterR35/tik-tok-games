import { WORLD, clamp } from './rules.js';

// A spatial hash keeps local avoidance bounded even with a full horde.
export function moveHorde(zombies, dt, breached, frozen) {
  const cells = new Map(), cellSize = 64;
  for (const z of zombies) {
    z.hit = Math.max(0, z.hit - dt);
    z.strike = Math.max(0, (z.strike || 0) - dt);
    if (z.hp <= 0) continue;
    const key = `${Math.floor(z.x / cellSize)},${Math.floor(z.y / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(z);
  }
  let wallDmg = 0, coreDmg = 0;
  // Compute all steering before applying positions: neighbors always see the same tick.
  const motions = [];
  for (const z of zombies) {
    if (z.hp <= 0) continue;
    if (frozen) { z.vx = z.vy = 0; continue; }
    if (z.state === 'attack' && breached) z.state = 'breach';
    let gx = z.tx + Math.sin(z.phase * 0.35 + z.id * 1.7) * 26 * clamp((z.ay - z.y) / 250, 0, 1), gy = z.ay;
    if (z.state === 'attack' || z.state === 'core') {
      z.vx = z.vy = 0;
      const interval = z.attackInterval || 1.35;
      z.attackCd = (z.attackCd ?? interval) - dt;
      if (z.attackCd <= 1e-9) {
        z.attackCd += interval; z.strike = 0.2;
        if (z.state === 'core') coreDmg += z.dps * interval;
        else wallDmg += z.dps * interval;
      }
      continue;
    }
    if (z.state === 'breach') {
      gx = WORLD.gateX + z.lane * 30;
      // Outside units must first reach the gate mouth; no diagonal travel through intact stone.
      gy = z.y < WORLD.wallY + 115 && Math.abs(z.x - gx) > 24 ? WORLD.attackY : WORLD.coreY - 40 + z.lane * 6;
    }
    const dx = gx - z.x, dy = gy - z.y, d = Math.hypot(dx, dy);
    let sx = 0, sy = 0;
    const cx = Math.floor(z.x / cellSize), cy = Math.floor(z.y / cellSize);
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
      for (const other of cells.get(`${xx},${yy}`) || []) {
        if (other === z) continue;
        let ox = z.x - other.x, oy = z.y - other.y;
        let dist = Math.hypot(ox, oy), radius = 13 * (z.size + other.size);
        if (dist >= radius) continue;
        if (dist < 0.01) { ox = z.id < other.id ? -1 : 1; oy = 0; dist = 1; }
        const push = (radius - dist) / radius;
        sx += ox / dist * push; sy += oy / dist * push;
      }
    }
    let vx = (d > 1 ? dx / d : 0) * z.speed + clamp(sx, -1, 1) * z.speed * 0.7;
    let vy = (d > 1 ? dy / d : 0) * z.speed + clamp(sy, -1, 1) * z.speed * 0.3;
    const speed = Math.hypot(vx, vy), cap = z.speed * 1.12;
    if (speed > cap) { vx *= cap / speed; vy *= cap / speed; }
    const blend = 1 - Math.exp(-dt * 5);
    motions.push({ z, vx: (z.vx || 0) + (vx - (z.vx || 0)) * blend, vy: (z.vy || 0) + (vy - (z.vy || 0)) * blend });
  }
  for (const { z, vx, vy } of motions) {
    z.vx = vx; z.vy = vy;
    if (vx > 14) z.facing = true; else if (vx < -14) z.facing = false;
    z.x = clamp(z.x + vx * dt, WORLD.fieldX[0], WORLD.fieldX[1]); z.y += vy * dt;
    const distance = Math.hypot(vx, vy) * dt;
    z.phase += distance / 18; z.distance = (z.distance || 0) + distance;
    if (z.state === 'walk' && z.y >= z.ay - 2) { z.y = z.ay; z.state = breached ? 'breach' : 'attack'; }
    if (z.state === 'breach' && z.y >= WORLD.coreY - 42 + z.lane * 6) { z.y = WORLD.coreY - 40 + z.lane * 6; z.state = 'core'; }
  }
  return { wallDmg, coreDmg };
}
