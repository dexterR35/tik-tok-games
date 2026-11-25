import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../public/sim.js';
import { WORLD } from '../public/rules.js';
import { moveHorde } from '../public/movement.js';
import { intercept, segmentHit } from '../public/combat.js';
import { Settlement } from '../public/settlement.js';
import { Camera } from '../public/camera.js';

const advance = (s, seconds, fps = 60) => { for (let i = 0; i < Math.round(seconds * fps); i++) s.update(1 / fps); };
const enemy = (extra = {}) => ({ id: 1, hp: 100, max: 100, x: 400, y: 700, tx: 400, ay: WORLD.attackY, speed: 45, size: 1, dps: 4, hit: 0, phase: 0, state: 'walk', lane: 0, vx: 0, vy: 0, pending: 0, armor: 0.25, ...extra });

test('simulation outcome is identical at 30, 60 and 144 render frames per second', () => {
  const states = [30, 60, 144].map(fps => {
    const s = new Sim(); advance(s, 50, fps);
    return { save: s.serialize(), wave: s.wave, kills: s.session.kills, wall: s.wallHp, wood: s.settlement.wood, zs: s.zombies.map(z => [z.id, z.x, z.y, z.hp]) };
  });
  assert.deepEqual(states[0], states[1]); assert.deepEqual(states[1], states[2]);
});
test('intercept predicts moving targets and swept collision catches a fast projectile', () => {
  const p = { x: 0, y: 0 }, z = enemy({ x: 100, y: 24, vx: 0, vy: 30 });
  const aim = intercept(p, z, 200);
  assert.ok(aim.y > 0); assert.ok(Math.abs(Math.hypot(aim.x, aim.y) / 200 - aim.t) < 1e-8);
  assert.ok(segmentHit(0, 0, 1000, 0, 400, 0, 10) < 0.5);
  assert.equal(segmentHit(0, 0, 1000, 0, 400, 100, 10), null);
});
test('armored target reservation is released exactly after a hit', () => {
  const s = new Sim(), z = enemy(); s.zombies = [z];
  s.launchShot({ x: z.x, y: z.y + 70, target: z, dmg: 20, speed: 1000, kind: 'bow', life: 2, splash: 0 });
  assert.equal(z.pending, 15);
  for (let i = 0; i < 20; i++) s.moveShots(1 / 60);
  assert.equal(z.pending, 0); assert.equal(z.hp, 85); assert.equal(s.shots.length, 0);
});
test('expired and redirected shots cannot leave stale damage reservations', () => {
  const s = new Sim(), z = enemy(); s.zombies = [z];
  s.launchShot({ x: 400, y: 1000, target: z, dmg: 20, speed: 100, kind: 'bow', life: 0.01, splash: 0 });
  s.moveShots(1 / 60); assert.equal(z.pending, 0);
  s.launchShot({ x: 400, y: 1000, target: z, dmg: 20, speed: 1000, kind: 'bow', life: 2, splash: 0 });
  z.x += 300;
  const vx = s.shots[0].vx; s.moveShots(1 / 60); assert.equal(s.shots[0].vx, vx, 'arrows never home');
  for (let i = 0; i < 130; i++) s.moveShots(1 / 60);
  assert.equal(z.pending, 0);
});
test('the first intervening enemy takes the arrow and intended target is unreserved', () => {
  const s = new Sim(), target = enemy({ y: 700 }), blocker = enemy({ id: 2, y: 850 });
  s.zombies = [target, blocker];
  s.launchShot({ x: 400, y: 1000, target, dmg: 20, speed: 1000, kind: 'bow', life: 2, splash: 0 });
  for (let i = 0; i < 30; i++) s.moveShots(1 / 60);
  assert.equal(target.hp, 100); assert.equal(target.pending, 0); assert.equal(blocker.hp, 85);
});
test('overlapping enemies separate with finite bounded velocities', () => {
  const a = enemy(), b = enemy({ id: 2 });
  for (let i = 0; i < 120; i++) moveHorde([a, b], 1 / 60, false, false);
  assert.ok(Math.abs(a.x - b.x) > 10);
  for (const z of [a, b]) assert.ok(Number.isFinite(z.x) && Math.hypot(z.vx, z.vy) <= z.speed * 1.12 + 1e-8);
});
test('breached horde reaches the gate before crossing into the city', () => {
  const z = enemy({ x: 100, y: WORLD.attackY, state: 'breach', speed: 80, armor: 0 });
  let crossed = false;
  for (let i = 0; i < 900; i++) {
    moveHorde([z], 1 / 60, true, false);
    if (z.y > WORLD.wallY) { crossed = true; assert.ok(Math.abs(z.x - WORLD.gateX) < 42); }
  }
  assert.ok(crossed); assert.equal(z.state, 'core');
});
test('freeze stops movement and wall or core attacks', () => {
  const a = enemy(), b = enemy({ id: 2, state: 'attack' }), c = enemy({ id: 3, state: 'core' });
  const result = moveHorde([a, b, c], 1 / 60, true, true);
  assert.equal(a.y, 700); assert.deepEqual(result, { wallDmg: 0, coreDmg: 0 });
});
test('workers only create resources after returning with a completed delivery', () => {
  const s = new Sim(); s.settlement = new Settlement();
  advance(s, 5); assert.equal(s.settlement.wood + s.settlement.food, 0);
  advance(s, 25); assert.ok(s.settlement.deliveries >= 4);
  assert.ok(s.settlement.wood + s.settlement.food > 0);
  const copy = new Sim(s.serialize()); assert.deepEqual(copy.settlement.serialize(), s.settlement.serialize());
});
test('settlement provisions repair, fortify and shield without overspending', () => {
  const s = new Sim(); s.wallHp /= 2; s.settlement.wood = 128; s.settlement.food = 12;
  s.settlement.provision(s);
  assert.equal(s.wallHp, s.stats.wallHp); assert.equal(s.settlement.wood, 32);
  assert.equal(s.turrets.filter(t => t.level).length, 1); assert.equal(s.settlement.food, 0); assert.ok(s.shield > 0);
});
test('unassisted garrison is overwhelmed by the opening horde', () => {
  const s = new Sim(); let fell = false;
  for (let i = 0; i < 95 * 60; i++) { s.update(1 / 60); if (s.state === 'fallen') { fell = true; break; } }
  assert.ok(fell); assert.equal(s.best, 1); assert.equal(s.survivors.size, 0);
});
test('host restart cancels delayed attacks and preserves stored supplies and checkpoint relief', () => {
  const s = new Sim({ fallsAt: { 9: 2 }, settlement: { wood: 17, food: 19 } });
  s.delayed = { t: 1, bundle: { nukes: 1 } }; s.pendingTaps = 9; s.setWave(1);
  assert.equal(s.delayed, null); assert.equal(s.pendingTaps, 0); assert.equal(s.settlement.wood, 17);
  assert.equal(new Sim(s.serialize()).fallsAt[9], 2);
});
test('camera eases into battle, remains bounded, and overview returns to a full map', () => {
  const s = new Sim(), c = new Camera(); s.state = 'fight'; s.spawnZombie('boss'); c.manualZoom = 1.18;
  for (let i = 0; i < 300; i++) {
    c.update(1 / 60, s);
    assert.ok(c.x >= WORLD.W / (2 * c.zoom) - 1e-8); assert.ok(c.y <= WORLD.H - WORLD.H / (2 * c.zoom) + 1e-8);
  }
  assert.ok(c.zoom > 1.1); c.mode = 'overview'; c.manualZoom = 1;
  for (let i = 0; i < 600; i++) c.update(1 / 60, s);
  assert.ok(Math.abs(c.zoom - 1) < 1e-5);
});
