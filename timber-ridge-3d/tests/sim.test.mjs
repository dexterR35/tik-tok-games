import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../public/sim.js';
import { FLOW } from '../public/rules.js';

function drive(level, tapsPerSec, ups = 0, seconds = 400) {
  const up = { engine: ups, suspension: ups, tires: ups, tank: ups, nitro: ups };
  const s = new Sim({ level, upgrades: up }); let acc = 0, t = 0;
  for (; t < seconds && s.state !== 'finish'; t += 1 / 60) {
    acc += tapsPerSec / 60; const k = Math.floor(acc); acc -= k; if (k) s.tap(k, 'fan');
    s.update(1 / 60);
    assert.ok(Number.isFinite(s.jeep.x + s.jeep.y + s.jeep.a), 'physics stays finite');
    s.events.length = 0;
  }
  return { s, t };
}
const run = (s, sec, tps = 0) => { let acc = 0; for (let t = 0; t < sec; t += 1 / 60) { acc += tps / 60; const k = Math.floor(acc); acc -= k; if (k) s.tap(k); s.update(1 / 60); } };

test('no taps: the jeep stays where it is', () => { const { s } = drive(1, 0, 0, 40); assert.ok(Math.abs(s.jeep.x) < 0.5, `x=${s.jeep.x}`); });
test('level 1 is finished by a modest crowd (3 taps/s)', () => { const { s, t } = drive(1, 3); assert.equal(s.state, 'finish'); assert.ok(t < 150, `t=${t}`); });
test('upgraded crawler finishes level 8 (rock stairs, cliffs, traps)', () => { assert.equal(drive(8, 6, 5).s.state, 'finish'); });
test('hard level never soft-locks', () => { const { s } = drive(12, 8, 8, 500); assert.ok(s.jeep.x > 1800, `x=${s.jeep.x}`); });
test('countdown locks the jeep, gifts are banked and fire at GO', () => {
  const s = new Sim({});
  run(s, 1, 10);
  assert.equal(s.state, 'intro');
  s.gift({ name: 'Rose', coins: 1, count: 2, user: 'a' });
  assert.equal(s.effects.nitro, 0);
  assert.equal(s.bank.gifts, 2);
  assert.ok(Math.abs(s.jeep.x) < 0.3);
  run(s, FLOW.intro + FLOW.countdown);
  assert.equal(s.state, 'drive');
  assert.ok(s.effects.nitro > 4, `nitro=${s.effects.nitro}`);
  assert.equal(s.bank.gifts, 0);
  assert.equal(s.player('a').coins, 2);
});
test('after the finish line the jeep stops and boosts end', () => {
  const s = new Sim({}); run(s, FLOW.intro + FLOW.countdown + 0.1);
  s.jeep.reset(s.terrain.finish - 1, s.terrain.height(s.terrain.finish - 1) + 1.4, 0); s.jeep.vx = 10;
  for (const w of s.jeep.wheels) w.vx = 10;
  s.gift({ coins: 1000, user: 'b' });
  run(s, 0.2, 10);
  assert.equal(s.state, 'finish');
  s.gift({ coins: 1000, user: 'b' });
  assert.equal(s.effects.power, 0);
  run(s, 3, 10);
  assert.ok(Math.abs(s.jeep.vx) < 0.3, `vx=${s.jeep.vx}`);
  run(s, FLOW.finish);
  assert.equal(s.level, 2);
  assert.ok(s.locked, 'next level starts locked with intro + 3-2-1');
});
test('power gift refuels half a tank; wallet 5 per coin', () => {
  const s = new Sim({}); run(s, FLOW.intro + FLOW.countdown + 0.1);
  s.fuel = 0; s.gift({ coins: 100, count: 1, user: 'a' });
  assert.equal(Math.round(s.fuel), Math.round(s.stats.tank * 0.5));
  assert.equal(s.coins, 500);
});
test('comment taps are rate limited per user', () => {
  const s = new Sim({}); run(s, FLOW.intro + FLOW.countdown + 0.1);
  s.comment('u', 'hi'); s.comment('u', 'hi again');
  assert.equal(s.pendingTaps, 3);
});
test('tappers appear as fans behind the jeep', () => {
  const s = new Sim({}); s.tap(1, 'x', 'https://a/b.jpg'); s.tap(1, 'y');
  assert.deepEqual(s.activeFans().map(f => f.name).sort(), ['x', 'y']);
});
