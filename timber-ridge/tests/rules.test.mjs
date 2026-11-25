import test from 'node:test';
import assert from 'node:assert/strict';
import { giftTier, applyGift, actionForGift, sanitizeGiftMap, throttleFor, applyAction, EFFECT_CAPS, likeDivisor, effectiveTaps, stepTapPower, steadyPower, upgradeCost, autoUpgrade, UPGRADES, levelConfig, giftWallet, scoreFor } from '../public/rules.js';

test('gift tiers follow coin value boundaries', () => {
  assert.deepEqual([1, 9, 10, 99, 100, 999, 1000, 50000].map(giftTier), [0, 0, 1, 1, 2, 2, 3, 3]);
});
test('gift effects stack per gift and respect caps', () => {
  assert.equal(applyGift({}, 0, 2).effects.nitro, 6);
  assert.equal(applyGift({ nitro: 5 }, 0, 1).effects.nitro, 8);
  const big = applyGift({}, 3, 1000);
  for (const k of Object.keys(EFFECT_CAPS)) assert.equal(big.effects[k], EFFECT_CAPS[k]);
  assert.equal(big.fuel, 1);
  assert.equal(applyGift({}, 2, 1).fuel, 0.5);
  assert.equal(applyGift({}, 1, 0).effects.grip, 0);
});
test('like scaling: 3 % of viewers per effective tap', () => {
  assert.equal(likeDivisor(0), 1);
  assert.equal(likeDivisor(1000), 30);
  assert.equal(effectiveTaps(300, 10000), 1);
  assert.equal(effectiveTaps(-5, 10), 0);
});
test('crowd power converges to 0.1 × taps per second', () => {
  for (const rate of [2, 3, 6]) {
    let p = 0; const dt = 1 / 240;
    for (let i = 0; i < 240 * 30; i++) p = stepTapPower(p, rate * dt, dt, 0);
    assert.ok(Math.abs(p - steadyPower(rate)) < 0.01, `${rate}/s → ${p}`);
  }
  assert.equal(steadyPower(50), 1);
});
test('upgrade costs grow 45 % per level and stop at max', () => {
  assert.equal(upgradeCost('engine', 0), 150);
  assert.equal(upgradeCost('engine', 1), 220);
  assert.equal(upgradeCost('engine', UPGRADES.engine.max), Infinity);
});
test('auto-upgrade never overspends and buys cheapest first', () => {
  const r = autoUpgrade({}, 400);
  assert.deepEqual(r.bought, ['tank', 'suspension', 'tires']);
  assert.equal(r.coins, 400 - 100 - 120 - 130);
  assert.ok(r.coins >= 0);
});
test('level progression', () => {
  assert.equal(levelConfig(1).length, 900);
  assert.equal(levelConfig(3).length, 1200);
  assert.equal(levelConfig(99).length, 2500);
  assert.equal(levelConfig(6).biome.id, 'forest');
});
test('wallet and score', () => {
  assert.equal(giftWallet(1, 3), 15);
  assert.equal(scoreFor({ taps: 10, coins: 5 }), 60);
});

test('the jeep never drives by itself', () => {
  assert.equal(throttleFor(0), 0);
  assert.equal(throttleFor(0.03), 0);
  assert.ok(Math.abs(throttleFor(1) - 1) < 1e-9);
});
test('host gift list wins over coin tiers (case-insensitive), others use coins', () => {
  const map = [{ name: 'Rose', action: 'monster' }];
  assert.equal(actionForGift('rose', 1, map), 'monster');
  assert.equal(actionForGift('Lion', 29999, map), 'monster');
  assert.equal(actionForGift('Unknown', 15, map), 'traction');
});
test('gift list is sanitised', () => {
  const m = sanitizeGiftMap([{ name: ' Rose ', action: 'nitro' }, { name: 'rose', action: 'power' }, { name: 'X', action: 'hack' }, { name: '', action: 'nitro' }]);
  assert.deepEqual(m, [{ name: 'Rose', action: 'nitro' }]);
});
test('mega jump and refuel actions', () => {
  assert.equal(applyAction({}, 'jump', 3).jumps, 1);
  assert.equal(applyAction({}, 'fuel', 3).fuel, 1);
});
