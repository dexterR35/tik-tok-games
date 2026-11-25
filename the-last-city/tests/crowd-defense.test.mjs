import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, DT } from '../public/sim.js';
import { GARRISON, NUKE, waveConfig, giftWallet, UPGRADES } from '../public/rules.js';
import { moveHorde } from '../public/movement.js';
import { walkFrame, archerFrame } from '../public/animation.js';

test('likes boost firepower but only a join comment or gift creates a viewer defender', () => {
  const s = new Sim(); s.tap(1, 'liker', null, 300);
  assert.equal(s.survivors.size, 0); assert.equal(s.session.likes, 300);
  s.comment('liker', '!join'); s.comment('liker', '!join');
  assert.equal(s.survivors.size, 1); assert.equal(s.session.joined, 1);
  s.gift({ user: 'gifter', coins: 1 }); assert.equal(s.survivors.size, 2);
});
test('all processed comments are counted while bonus taps remain rate limited', () => {
  const s = new Sim(); s.state = 'fight';
  for (let i = 0; i < 10; i++) s.comment('alice', i ? 'hi' : '!join');
  assert.equal(s.session.comments, 10); assert.equal(s.session.likes, 0);
  assert.equal(s.pendingTaps, 3); assert.equal(s.roster()[0].comments, 10);
  assert.equal(s.player('alice').comments, 10);
});
test('roster distinguishes live, demo and test participants from NPC guards and saved scores', () => {
  const s = new Sim({ players: { yesterday: { taps: 100 } } });
  s.participant('demo_user', 'demo'); s.comment('demo_user', '!join');
  s.participant('HOST', 'test'); s.comment('HOST', '!join');
  s.comment('live_user', '!join'); s.update(DT);
  const rows = s.roster(); assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(p => p.source).sort(), ['demo', 'live', 'test']);
  assert.ok(rows.every(p => p.state === 'ON WALL'));
  assert.ok(!rows.some(p => p.name.startsWith('GUARD') || p.name === 'yesterday'));
});
test('joined viewers beyond the sixteen wall slots are visible as queued', () => {
  const s = new Sim(); for (let i = 0; i < 22; i++) s.comment(`u${i}`, '!join');
  s.updateSquad(); const rows = s.roster();
  assert.equal(rows.filter(p => p.state === 'ON WALL').length, 16);
  assert.equal(rows.filter(p => p.state === 'QUEUED').length, 6);
});

test('the on-screen leaderboard contains current defenders rather than inactive saved test users', () => {
  const s = new Sim({ players: { 'OLD TEST GIFT': { coins: 100000 } } });
  s.comment('playing_now', '!join'); s.updateSquad();
  assert.deepEqual(s.activeLeaderboard().map(p => p.name), ['playing_now']);
  assert.equal(s.leaderboard()[0].name, 'OLD TEST GIFT', 'saved history is preserved separately');
});
test('configured recruit and upgrade gifts work immediately, respect limits, and survive reload', () => {
  const s = new Sim(); s.setGiftMap([{ name: 'army', action: 'recruit' }, { name: 'forge', action: 'upgrade' }]);
  s.gift({ name: 'army', count: 1000, user: 'sender' });
  assert.equal(s.garrison.length, GARRISON.max); assert.equal(s.state, 'intro');
  const before = Object.values(s.upgrades).reduce((a, b) => a + b, 0);
  s.gift({ name: 'forge', user: 'sender' });
  assert.equal(Object.values(s.upgrades).reduce((a, b) => a + b, 0), before + 1);
  assert.equal(new Sim(s.serialize()).garrison.length, GARRISON.max);
});
test('gift upgrades distribute levels rather than overfilling one stat', () => {
  const s = new Sim(); s.grantUpgrades(5);
  assert.ok(Object.keys(UPGRADES).every(k => s.upgrades[k] === 1));
  s.grantUpgrades(50); assert.ok(Object.keys(UPGRADES).every(k => s.upgrades[k] === UPGRADES[k].max));
});
test('one 1000-tier gift cannot wipe a healthy horde, fully heal the core, or buy every upgrade', () => {
  const s = new Sim({ wave: 5 }); s.state = 'fight'; s.queue = []; s.zombies = []; s.coreHp = 200; s.wallHp = 600;
  for (const kind of ['walker', 'runner', 'brute', 'boss']) s.spawnZombie(kind);
  const hp = s.zombies.map(z => z.hp);
  s.gift({ coins: 1000, name: '', user: 'sender' });
  assert.equal(s.zombies.filter(z => z.hp > 0).length, 4);
  assert.ok(s.zombies.every((z, i) => z.hp < hp[i]));
  assert.equal(s.coreHp, 200); assert.ok(s.wallHp < s.stats.wallHp);
  assert.equal(s.coins, giftWallet(1000, 1)); assert.ok(s.coins < 200);
  const boss = s.zombies.find(z => z.kind === 'boss'); assert.ok(Math.abs(boss.hp / boss.max - (1 - NUKE.bossShare)) < 1e-9);
});
test('meteor strike only hits its local area, leaving a distant pack intact', () => {
  const s = new Sim(); s.state = 'fight'; s.queue = []; s.shoot = () => {};
  s.spawnZombie('brute'); s.spawnZombie('brute');
  const [near, far] = s.zombies; near.x = 220; near.y = 850; far.x = 900; far.y = 700;
  near.hp = near.max = far.hp = far.max = 1000;
  s.meteors = [{ x: near.x, y: near.y, t: 0, max: 1 }]; s.fight(DT);
  assert.ok(near.hp < 1000); assert.equal(far.hp, 1000);
});
test('waves contain broad packs and guaranteed runners and brutes; late wave maths stays finite', () => {
  const s = new Sim({ wave: 3 }); assert.equal(s.queue.length, 80);
  assert.ok(s.queue.filter(z => z.kind === 'brute').length >= 2);
  assert.ok(s.queue.filter(z => z.kind === 'runner').length >= 1);
  assert.ok(s.queue.filter(z => z.t < 1.6).length >= 24);
  const max = waveConfig(1000, 0, 1000);
  assert.equal(max.count, 360); assert.ok(Number.isFinite(max.hpMult)); assert.ok(max.boss <= 4); assert.ok(max.pressure <= 2.2);
  assert.ok(s.cfg.sizeMult > waveConfig(1).sizeMult);
});
test('the active horde is capped without losing queued enemies', () => {
  const s = new Sim({ wave: 30 }); s.state = 'fight'; s.shoot = () => {};
  s.queue.forEach(z => { z.t = 0; }); s.fight(DT);
  assert.equal(s.zombies.length, 240); assert.equal(s.remaining, s.queue.length);
});
test('zombie strikes deliver exact interval damage and freeze pauses the attack clock', () => {
  const z = { id: 1, hp: 100, x: 500, y: 1100, tx: 500, ay: 1100, state: 'attack', size: 1, speed: 40, dps: 8, attackInterval: 1.35, attackCd: 1.35, phase: 0, hit: 0 };
  let damage = 0;
  for (let i = 0; i < 810; i++) damage += moveHorde([z], DT, false, false).wallDmg;
  assert.ok(Math.abs(damage - 108) < 1e-7);
  const clock = z.attackCd;
  for (let i = 0; i < 600; i++) assert.equal(moveHorde([z], DT, false, true).wallDmg, 0);
  assert.equal(z.attackCd, clock);
});
test('archers reserve during windup, launch on release, and never double-reserve', () => {
  const s = new Sim(); s.state = 'fight'; s.queue = []; s.spawnZombie('boss');
  const z = s.zombies[0]; z.x = 540; z.y = 1000;
  s.shoot(DT); assert.equal(s.captain.animStage, 'windup'); assert.equal(s.shots.length, 0);
  const reserved = z.pending; assert.ok(reserved > 0);
  for (let i = 0; i < 11; i++) s.shoot(DT);
  assert.equal(s.captain.animStage, 'recover'); assert.ok(s.shots.length > 0); assert.equal(z.pending, reserved);
});
test('removing an idle defender releases its windup reservation', () => {
  const s = new Sim(); s.comment('away', '!join'); s.updateSquad(); const a = s.survivors.get('away');
  const target = { pending: 12 }; a.windup = { shot: { target, reserved: 12 } }; a.last = -1000;
  s.updateSquad(); assert.equal(target.pending, 0); assert.equal(a.windup, null);
});
test('walk animation follows travelled distance and shooting has a separate release frame', () => {
  assert.equal(walkFrame('walker', 0), 0); assert.equal(walkFrame('walker', 21), 4); assert.equal(walkFrame('walker', 42), 0);
  assert.equal(walkFrame('worker', 22), 4); assert.equal(archerFrame('idle', 99), 0);
  assert.equal(archerFrame('windup', 0.135), 4); assert.equal(archerFrame('recover', 0), 5);
});
