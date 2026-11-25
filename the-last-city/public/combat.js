// Intercept a constant-velocity target. A projectile never turns after leaving its weapon.
export function intercept(from, target, speed) {
  const dx = target.x - from.x, dy = target.y - 24 * target.size - from.y;
  const vx = target.vx || 0, vy = target.vy || 0;
  const a = vx * vx + vy * vy - speed * speed, b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
  const disc = b * b - 4 * a * c;
  let t = Math.hypot(dx, dy) / speed;
  if (Math.abs(a) > 1e-8 && disc >= 0) {
    const roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].filter(n => n > 0);
    if (roots.length) t = Math.min(...roots);
  }
  return { x: target.x + vx * t, y: target.y - 24 * target.size + vy * t, t };
}

// Earliest collision along a swept segment, so fast bullets cannot tunnel at low frame rates.
export function segmentHit(ax, ay, bx, by, x, y, radius) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const ox = ax - x, oy = ay - y;
  if (ox * ox + oy * oy <= radius * radius) return 0;
  if (len2 < 1e-10) return null;
  const b = 2 * (ox * dx + oy * dy), c = ox * ox + oy * oy - radius * radius;
  const disc = b * b - 4 * len2 * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * len2);
  return t >= 0 && t <= 1 ? t : null;
}
