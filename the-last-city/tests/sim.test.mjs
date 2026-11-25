import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../public/sim.js';
import { FLOW, TURRET } from '../public/rules.js';

const GO = FLOW.intro + FLOW.countdown + 0.1;
function play(s, seconds, tps = 0, viewers = 4, until = null) {
  let acc = 0, t = 0, viewerTick = 0;
  for (; t < seconds; t += 1 / 60) {
    acc += tps / 60; const k = Math.floor(acc); acc -= k;
    if (k && viewers) {
      const user = 'v' + (viewerTick++ % viewers);
      if (!s.survivors.has(user)) s.comment(user, '!join');
      s.tap(k, user);
    }
    s.update(1 / 60);
    if (until && s.events.some(until)) return t;
    if (s.events.length > 400) s.events.length = 0;
  }
  return t;
}

test('a modest crowd (4 viewers, 3 taps/s) survives wave 1', () => {
  const s = new Sim({});
  const t = play(s, 120, 3, 4, e => e.type === 'clear' || e.type === 'fallen');
  assert.ok(s.events.some(e => e.type === 'clear'), 'wave 1 cleared');
  assert.ok(t < 90, `t=${t}`);
});
test('viewers join through a join comment, then taps boost their defender', () => {
  const s = new Sim({});
  s.comment('ana', '!join', 'https://x/a.jpg'); s.comment('bob', 'join');
  s.tap(1, 'ana'); s.tap(1, 'bob');
  s.update(0.1);
  assert.equal(s.survivors.size, 2);
  assert.deepEqual(s.squad.filter(Boolean).map(x => x.name).sort(), ['ana', 'bob']);
  assert.equal(s.events.filter(e => e.type === 'join').length, 2);
});
test('the wall holds at most 16 survivors, the most recently active ones', () => {
  const s = new Sim({});
  for (let i = 0; i < 30; i++) { s.comment('u' + i, '!join'); s.update(1 / 60); }
  s.update(0.6);
  const on = s.squad.filter(Boolean).map(x => x.name);
  assert.equal(on.length, 16);
  assert.ok(on.includes('u29') && !on.includes('u0'));
});
test('combat gifts are saved before GO, build gifts work at once', () => {
  const s = new Sim({});
  play(s, 1);
  assert.equal(s.state, 'intro');
  s.gift({ name: 'Rose', coins: 1, count: 2, user: 'a' });
  s.gift({ name: 'Finger Heart', coins: 5, count: 1, user: 'b' });
  assert.equal(s.effects.rapid, 0);
  assert.equal(s.bank.gifts, 1);
  assert.equal(s.turrets.filter(t => t.level).length, 1, 'turret built immediately');
  play(s, GO);
  assert.equal(s.state, 'fight');
  play(s, 4.2);
  assert.ok(s.effects.rapid > 3, `rapid=${s.effects.rapid}`);
  assert.equal(s.bank.gifts, 0);
  assert.equal(s.player('a').coins, 2);
});
test('turret gifts build all slots, then upgrade, then turn into rapid fire', () => {
  const s = new Sim({}); play(s, GO);
  s.gift({ coins: 10, count: TURRET.slots, user: 't' });
  assert.ok(s.turrets.every(t => t.level === 1));
  s.gift({ coins: 10, count: TURRET.slots * 10, user: 't' });
  assert.ok(s.turrets.every(t => t.level === TURRET.maxLevel));
  assert.ok(s.effects.rapid > 0);
});
test('the wall breaks, zombies reach the city, and the city falls back to the checkpoint', () => {
  const s = new Sim({ wave: 9 }); play(s, GO);
  s.wallHp = 1; s.coreHp = 50;
  const t = play(s, 120, 0, 0, e => e.type === 'fallen');
  assert.ok(t < 120, 'city fell');
  assert.equal(s.state, 'fallen');
  s.events.length = 0;
  play(s, FLOW.fallen + 0.1);
  assert.equal(s.wave, 6);
  assert.equal(s.fallsAt[9], 1);
  assert.equal(s.wallHp, s.stats.wallHp);
});
test('repair after a breach puts the wall back up', () => {
  const s = new Sim({}); play(s, GO);
  s.wallHp = 0;
  s.gift({ name: 'TikTok', coins: 1, user: 'fixer' });
  assert.ok(s.wallHp > 0);
  assert.ok(s.comment('x', 'please repair!'));
  assert.ok(!s.comment('x', 'repair again'), 'repair word has a cooldown');
});
test('dragon fire damages the horde without wiping healthy enemies', () => {
  const s = new Sim({ wave: 5 }); play(s, GO);
  for (const k of ['walker', 'walker', 'brute', 'boss']) s.spawnZombie(k);
  const before = s.zombies.filter(z => z.hp > 0).length;
  s.gift({ coins: 1000, user: 'whale' });
  const alive = s.zombies.filter(z => z.hp > 0);
  assert.equal(alive.length, before);
  assert.ok(alive.every(z => z.hp < z.max));
  assert.ok(s.effects.rapid > 0);
});
test('comment taps are rate limited per viewer', () => {
  const s = new Sim({}); play(s, GO);
  s.comment('u', 'hi'); s.comment('u', 'hi again');
  assert.equal(s.pendingTaps, 3);
});
test('a long stream with a joined crowd progresses through multiple checkpoints', () => {
  const s = new Sim({});
  play(s, 900, 8, 8);
  assert.ok(s.best >= 6, `best=${s.best}`);
});
test('save keeps coins, upgrades, turrets and the leaderboard', () => {
  const s = new Sim({}); s.tap(5, 'z'); s.coins = 77; s.turrets[2].level = 3;
  const t = new Sim(JSON.parse(JSON.stringify(s.serialize())));
  assert.equal(t.coins, 77); assert.equal(t.turrets[2].level, 3); assert.equal(t.player('z').taps, 5);
});
