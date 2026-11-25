import test from 'node:test';
import assert from 'node:assert/strict';
import { locationForGift, locationByCoins, sanitizeGiftMap, DEFAULT_GIFT_MAP, giftHype, shotSeconds, hashString, LOCATIONS } from '../public/rules.js';

test('mapped gifts go to their place, case-insensitive', () => {
  assert.equal(locationForGift('Rose', 1), 'park');
  assert.equal(locationForGift('tiktok', 1), 'cafe');
  assert.equal(locationForGift('Finger Heart', 5), 'cathedral');
  assert.equal(locationForGift('Doughnut', 30), 'studio');
  assert.equal(locationForGift('Hand Hearts', 100), 'skyport');
});

test('unknown gifts go by value', () => {
  assert.equal(locationByCoins(1), 'park');
  assert.equal(locationByCoins(5), 'cafe');
  assert.equal(locationByCoins(15), 'cathedral');
  assert.equal(locationByCoins(50), 'studio');
  assert.equal(locationByCoins(5000), 'skyport');
  assert.equal(locationForGift('Mystery', 20), 'cathedral');
});

test('gift list is cleaned', () => {
  const m = sanitizeGiftMap([{ name: ' Rose ', loc: 'cafe' }, { name: 'rose', loc: 'park' }, { name: '', loc: 'park' }, { name: 'X', loc: 'moon' }]);
  assert.deepEqual(m, [{ name: 'Rose', loc: 'cafe' }]);
  assert.deepEqual(sanitizeGiftMap('nope'), DEFAULT_GIFT_MAP);
});

test('hype levels and shot length', () => {
  assert.equal(giftHype(1, 1), 0);
  assert.equal(giftHype(99, 1), 1);
  assert.equal(giftHype(1, 100), 1);
  assert.equal(giftHype(1000, 1), 2);
  assert.ok(shotSeconds(1000, 1, 0) > shotSeconds(1, 1, 0));
  assert.ok(shotSeconds(1000, 1, 6) < 3);
});

test('same viewer always gets the same body', () => {
  assert.equal(hashString('luna.star'), hashString('luna.star'));
  assert.equal(LOCATIONS.length, 5);
});
