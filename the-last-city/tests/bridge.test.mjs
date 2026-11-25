import test from 'node:test';
import assert from 'node:assert/strict';
import { CrowdBuffer } from '../crowd-buffer.mjs';
import { GiftLedger } from '../gift-ledger.mjs';

test('10k-viewer like storm flushes as one bounded event without losing likes', () => {
  const c = new CrowdBuffer();
  for (let i = 0; i < 10000; i++) c.like(5, 'user' + i);
  const ev = c.flush();
  assert.equal(ev.length, 1); assert.equal(ev[0].count, 50000); assert.ok(ev[0].users.length <= 20);
});
test('gift burst is bounded and counts preserved', () => {
  const c = new CrowdBuffer();
  for (let i = 0; i < 500; i++) c.gift({ user: 'g' + i, coins: 1, count: 2 });
  const ev = c.flush();
  assert.ok(ev.length <= 41);
  assert.equal(ev.reduce((s, e) => s + e.count, 0), 1000);
});

test('two different gifts with the same coin value retain their distinct action mapping', () => {
  const c = new CrowdBuffer();
  c.gift({ user: 'alice', coins: 1, count: 1, name: 'Repair gift' });
  c.gift({ user: 'alice', coins: 1, count: 1, name: 'Soldier gift' });
  const gifts = c.flush(); assert.equal(gifts.length, 2);
  assert.deepEqual(gifts.map(g => g.name), ['Repair gift', 'Soldier gift']);
});
test('streak gifts count only new gifts', () => {
  const l = new GiftLedger(); const base = { user: { userId: '1', nickname: 'a' }, giftId: 5, giftType: 1, giftDetails: { diamondCount: 1, giftType: 1 } };
  const counts = [1, 2, 5].map((r, i) => l.consume({ ...base, repeatCount: r, msgId: 'm' + i })?.count || 0);
  counts.push(l.consume({ ...base, repeatCount: 5, repeatEnd: true, msgId: 'm9' })?.count || 0);
  assert.deepEqual(counts, [1, 1, 3, 0]);
});
