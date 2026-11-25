import test from 'node:test';
import assert from 'node:assert/strict';
import { giftTier, actionForGift, actionBundle, sanitizeGiftMap, fireMultFor, EFFECT_CAPS, likeDivisor, effectiveTaps, stepTapPower, steadyPower, upgradeCost, autoUpgrade, UPGRADES, waveConfig, checkpointFor, giftWallet, scoreFor, survivorLevel, weaponFor } from '../public/rules.js';

test('gift tiers follow coin value boundaries', () => {
  assert.deepEqual([1, 9, 10, 99, 100, 999, 1000, 50000].map(giftTier), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([1, 10, 100, 1000].map(c => actionForGift('', c)), ['rapid', 'turret', 'airstrike', 'doomsday']);
});
test('host gift list wins over coin tiers (case-insensitive)', () => {
  const map = [{ name: 'Rose', action: 'doomsday' }];
  assert.equal(actionForGift('rose', 1, map), 'doomsday');
  assert.equal(actionForGift('Unknown', 15, map), 'turret');
});
test('gift list is sanitised', () => {
  const m = sanitizeGiftMap([{ name: ' Rose ', action: 'rapid' }, { name: 'rose', action: 'freeze' }, { name: 'X', action: 'hack' }, { name: '', action: 'rapid' }]);
  assert.deepEqual(m, [{ name: 'Rose', action: 'rapid' }]);
});
test('gift effects stack and respect caps', () => {
  assert.equal(actionBundle('rapid', 2).rapid, 8);
  const big = actionBundle('rapid', 1000);
  assert.equal(big.rapid, EFFECT_CAPS.rapid);
  assert.equal(actionBundle('freeze', 100).freeze, EFFECT_CAPS.freeze);
  assert.equal(actionBundle('repair', 10).repair, 1);
  assert.equal(actionBundle('airstrike', 2).meteors, 6);
  assert.equal(actionBundle('turret', 0).turrets, 0);
});
test('like scaling: 3 % of viewers per effective tap', () => {
  assert.equal(likeDivisor(0), 1);
  assert.equal(likeDivisor(1000), 30);
  assert.equal(effectiveTaps(300, 10000), 1);
  assert.equal(effectiveTaps(-5, 10), 0);
});
test('crowd power converges to 0.1 × taps per second; survivors always shoot', () => {
  for (const rate of [2, 3, 6]) {
    let p = 0; const dt = 1 / 240;
    for (let i = 0; i < 240 * 30; i++) p = stepTapPower(p, rate * dt, dt, 0);
    assert.ok(Math.abs(p - steadyPower(rate)) < 0.01);
  }
  assert.ok(Math.abs(fireMultFor(0) - 0.4) < 1e-9);
  assert.ok(Math.abs(fireMultFor(1) - 1.4) < 1e-9);
});
test('upgrades: 45 % per level, auto-upgrade never overspends', () => {
  assert.equal(upgradeCost('walls', 0), 120);
  assert.equal(upgradeCost('walls', UPGRADES.walls.max), Infinity);
  const r = autoUpgrade({}, 400);
  assert.deepEqual(r.bought, ['medics', 'walls', 'drill']);
  assert.ok(r.coins >= 0);
});
test('waves grow, bosses every 5th, falls make the horde weaker', () => {
  assert.equal(waveConfig(1).count, 48);
  assert.equal(waveConfig(3).count, 80);
  assert.equal(waveConfig(5).boss, 1);
  assert.equal(waveConfig(4).boss, 0);
  assert.ok(waveConfig(10, 2).hpMult < waveConfig(10).hpMult);
  assert.equal(waveConfig(10, 99).relief, 0.4);
  assert.deepEqual([1, 5, 6, 9, 11, 15].map(checkpointFor), [1, 1, 6, 6, 11, 11]);
});
test('survivor ranks and weapons', () => {
  assert.equal(survivorLevel(0), 1);
  assert.equal(survivorLevel(15), 2);
  assert.equal(survivorLevel(1e9), 10);
  assert.equal(weaponFor(1).id, 'bow'); assert.equal(weaponFor(3).id, 'crossbow'); assert.equal(weaponFor(6).id, 'musket'); assert.equal(weaponFor(10).id, 'cannon');
});
test('wallet and score', () => {
  assert.equal(giftWallet(1, 3), 15);
  assert.equal(scoreFor({ taps: 10, coins: 5, kills: 3 }), 66);
});
