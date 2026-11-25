// Position constraints after steering: includes standing and talking people,
// exact overlaps, and the edges of props. Pose subjects remain stationary.
export function separatePeople(people, obstacles = [], passes = 6) {
  const active = people.filter(p => !p.hidden);
  const gap = 1.05;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d >= gap || (a.posing && b.posing)) continue;
      if (d < 1e-6) { const angle = (i * 13 + j * 7) * 2.39996; dx = Math.cos(angle); dz = Math.sin(angle); d = 1; }
      const overlap = gap - Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      const share = a.posing ? 0 : b.posing ? 1 : 0.5;
      a.pos.x -= dx / d * overlap * share; a.pos.z -= dz / d * overlap * share;
      b.pos.x += dx / d * overlap * (1 - share); b.pos.z += dz / d * overlap * (1 - share);
    }
    for (const p of active) {
      if (p.posing) continue;
      for (const o of obstacles) {
        let dx = p.pos.x - o.x, dz = p.pos.z - o.z, d = Math.hypot(dx, dz);
        const min = o.r + 0.45;
        if (d >= min) continue;
        if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
        p.pos.x = o.x + dx / d * min; p.pos.z = o.z + dz / d * min;
      }
    }
  }
}
