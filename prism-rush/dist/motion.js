// The renderer and authoritative game use the same timings, including landings.
export const MOTION = Object.freeze({ swap: 210, burst: 240, power: 440, idle: 380, queued: 70, shuffle: 430 });
export const clamp01 = value => Math.max(0, Math.min(1, value));
export const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
export function dropTiming(drop) {
  const distance = Math.max(1, drop.to - drop.from);
  const delay = (drop.x % 3) * 7 + (drop.from < 0 ? Math.max(0, -drop.from - 1) * 3 : 0);
  const travel = 115 + Math.sqrt(distance) * 65;
  return { delay, travel, settle: 85, total: delay + travel + 85 };
}
export function fallDuration(drops) { return Math.ceil(Math.max(180, ...drops.map(d => dropTiming(d).total))); }
export function sampleDrop(drop, elapsedMs) {
  const timing = dropTiming(drop), t = clamp01((elapsedMs - timing.delay) / timing.travel);
  const landed = elapsedMs >= timing.delay + timing.travel;
  const u = clamp01((elapsedMs - timing.delay - timing.travel) / timing.settle);
  const spring = landed ? Math.sin(u * Math.PI * 2) * Math.exp(-u * 3) * (1 - u) : 0;
  return { progress: smooth(t), offset: -.11 * spring, scaleX: 1 + .2 * spring, scaleY: 1 - .18 * spring, landed, done: elapsedMs >= timing.total };
}
