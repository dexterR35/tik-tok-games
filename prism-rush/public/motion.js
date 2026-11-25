// The renderer and authoritative game use the same timings, including landings.
// Step mode is calmer: a readable swap, burst and drop for every tap.
export const MOTION = Object.freeze({ swap: 300, burst: 320, power: 600, idle: 300, queued: 140, shuffle: 520, finale: 760, levelIntro: 2800, levelComplete: 6800, roadmap: 4800 });
// Busy queues play a little faster: 1 + 0.1 per pending unit (a gift step,
// or 12 waiting taps), capped at 1.5x (reached at 5 units, e.g. 60 taps).
export const speedFor = pendingUnits => 1 + Math.min(5, Math.max(0, pendingUnits)) * .1;
export const clamp01 = value => Math.max(0, Math.min(1, value));
export const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
export function dropTiming(drop) {
  const distance = Math.max(1, drop.to - drop.from);
  // Slower, readable drop: about 1.4x the previous fall time.
  const delay = (drop.x % 3) * 10 + (drop.from < 0 ? Math.max(0, -drop.from - 1) * 5 : 0);
  const travel = 165 + Math.sqrt(distance) * 95;
  return { delay, travel, settle: 110, total: delay + travel + 110 };
}
export function fallDuration(drops, speed = 1) { return Math.ceil(Math.max(260, ...drops.map(d => dropTiming(d).total)) / speed); }
export function sampleDrop(drop, elapsedMs) {
  const timing = dropTiming(drop), t = clamp01((elapsedMs - timing.delay) / timing.travel);
  const landed = elapsedMs >= timing.delay + timing.travel;
  const u = clamp01((elapsedMs - timing.delay - timing.travel) / timing.settle);
  const spring = landed ? Math.sin(u * Math.PI * 2) * Math.exp(-u * 3) * (1 - u) : 0;
  return { progress: smooth(t), offset: -.11 * spring, scaleX: 1 + .2 * spring, scaleY: 1 - .18 * spring, landed, done: elapsedMs >= timing.total };
}
