import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../public/room.js';
import { validBoard, matches, moves } from '../public/engine.js';
const viewer = { id: 'viewer-1', name: 'Dexter' };
const newRoom = () => { const r = new Room({ seed: 41, now: 1000 }); r.settings.demo = false; return r; };
function advance(r, seconds, step = .1) { for (let t = 0; t < seconds; t += step) r.step(step, r.now + step * 1000); }
function finishAction(r) { for (let i = 0; i < 300; i++) { advance(r, .1); if (!r.current && !r.queue.length && r.phase.type === 'idle') return; } throw Error('Action did not settle'); }

test('100 free taps queue one named action and carry the remainder', () => {
  const r = newRoom(); r.like(viewer, 75); assert.equal(r.queue.length, 0); r.like(viewer, 60); assert.equal(r.queue[0].type, 'tap'); assert.equal(r.queue[0].name, 'Dexter'); assert.equal(r.tapCharge, 35); assert.equal(r.totalTaps, 135);
});
test('large like packets coalesce without losing charges', () => {
  const r = newRoom(); r.like(viewer, 100_025); assert.equal(r.queue.length, 1); assert.equal(r.queue[0].units, 1000); assert.equal(r.tapCharge, 25);
});
test('gift streak uses relay deltas; final zero packet grants no extra power', () => {
  const r = newRoom();
  for (const packet of [{ coins: 1, total: 1, repeat: 1 }, { coins: 2, total: 3, repeat: 3 }, { coins: 0, total: 3, repeat: 3, final: true }]) r.incoming({ type: 'gift', giftName: 'Rose', user: viewer, ...packet });
  assert.equal(r.queue.length, 1); assert.equal(r.queue[0].units, 3); assert.equal(r.users.get(viewer.id).gifts, 3);
});
test('batched likes, mapped gifts and LIVE status are understood', () => {
  const r = newRoom(); r.incoming({ type: 'batch', events: [{ type: 'status', live: true, username: 'dexter' }, { type: 'like', user: viewer, count: 101 }, { type: 'gift', user: viewer, giftName: 'Galaxy', coins: 100, total: 100, repeat: 1 }] });
  assert.equal(r.live.live, true); assert.deepEqual(r.queue.map(a => a.type), ['tap', 'supernova']);
});
test('all viewer powers complete, credit their owner, and leave a playable stable board', () => {
  for (const power of ['tap', 'rose', 'meteor', 'prism', 'supernova']) {
    const r = newRoom(); r.settings.auto = false; r.enqueue(power, viewer); finishAction(r);
    assert.ok(r.score > 0); assert.equal(r.users.get(viewer.id).score, r.score); assert.ok(validBoard(r.engine.board)); assert.equal(matches(r.engine.board).length, 0); assert.ok(moves(r.engine.board).length);
  }
});
test('pause freezes round time and phase progress; queued gifts survive pause', () => {
  const r = newRoom(); r.command({ action: 'pause' }); const remaining = r.roundRemaining, phaseRemaining = r.phase.duration - (r.now - r.phase.start); advance(r, 30); r.enqueue('prism', viewer); assert.equal(r.roundRemaining, remaining); assert.equal(r.phase.duration - (r.now - r.phase.start), phaseRemaining); assert.equal(r.queue.length, 1); r.command({ action: 'pause' }); advance(r, 3); assert.ok(r.score > 0);
});
test('round awards one deterministic winner, then loops without resetting lifetime scores', () => {
  const r = newRoom(); r.settings.auto = false; r.enqueue('supernova', viewer); finishAction(r); const total = r.score; r.roundRemaining = 0; advance(r, 2); assert.equal(r.phase.type, 'winner'); assert.equal(r.history.length, 1); assert.equal(r.history[0].name, 'Dexter'); assert.equal(r.users.get(viewer.id).trophies, 1); advance(r, 8); assert.equal(r.round, 2); assert.equal(r.score, total); assert.equal(r.users.get(viewer.id).roundScore, 0); assert.equal(r.history.length, 1);
});
test('round ending mid-cascade waits until the viewer receives all points', () => {
  const r = newRoom(); r.settings.auto = false; r.enqueue('supernova', viewer); advance(r, 1.1); r.roundRemaining = 0; advance(r, 25); assert.equal(r.history.length, 1); assert.equal(r.history[0].score, r.score); assert.equal(r.history[0].id, viewer.id);
});
test('saving during every animation phase resumes without duplicate scoring', () => {
  const r = newRoom(); r.settings.auto = false; r.enqueue('supernova', viewer);
  for (let i = 0; i < 150; i++) {
    advance(r, .1);
    const saved = JSON.parse(JSON.stringify(r.export())), restored = new Room({ saved, now: 1_000_000 });
    restored.settings.auto = false; finishAction(restored);
    const original = new Room({ saved, now: 2_000_000 }); original.settings.auto = false; finishAction(original);
    assert.equal(restored.score, original.score); assert.deepEqual(restored.engine.export(), original.engine.export());
    if (!r.current && !r.queue.length) break;
  }
});
test('queue remains bounded and reports overflow', () => {
  const r = newRoom(); for (let i = 0; i < 600; i++) r.enqueue('rose', { id: `u${i}`, name: `Viewer ${i}` }); assert.equal(r.queue.length, 512); assert.equal(r.rejected, 88); assert.equal(r.log[0].type, 'warning');
});
test('color votes are replaceable and only one vote counts per viewer', () => {
  const r = newRoom(); r.incoming({ type: 'chat', user: viewer, text: 'red' }); r.incoming({ type: 'chat', user: viewer, text: 'blue' }); assert.equal(r.votes.size, 1); assert.equal(r.votes.get(viewer.id), 4);
});
test('gift aliases are unique and unknown gifts map to a smart move', () => {
  const r = newRoom(); assert.throws(() => r.command({ action: 'settings', mappings: { rose: 'Rose', meteor: 'rose' } }), /only one power/); r.incoming({ type: 'gift', user: viewer, giftName: 'New gift', coins: 1 }); assert.equal(r.queue[0].type, 'rose');
});
test('four hours of accelerated sessions keep animating, awarding rounds, and bounded memory', () => {
  const r = newRoom(); r.settings.roundSeconds = 60; r.roundRemaining = 60;
  for (let i = 0; i < 4 * 3600 * 2; i++) {
    if (i % 200 === 0) r.enqueue(['rose', 'meteor', 'prism', 'supernova'][(i / 200) % 4], viewer);
    r.step(.5, r.now + 500);
  }
  assert.ok(r.score > 1_000_000); assert.ok(r.round > 100); assert.ok(r.history.length <= 8); assert.ok(r.log.length <= 14); assert.ok(r.queue.length <= 512); assert.ok(validBoard(r.engine.board));
});
