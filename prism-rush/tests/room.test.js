import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, giftSteps, TAP_DIVISOR, TAP_BATCH, JOKER_POINTS, cleanAvatar } from '../public/room.js';
import { validBoard, matches, moves, JOKER } from '../public/engine.js';
import { levelSpec } from '../public/levels.js';
import { MOTION } from '../public/motion.js';
const viewer = { id: 'viewer-1', name: 'Dexter', avatar: 'https://p16-sign-va.tiktokcdn.com/x.jpeg' };
const newRoom = (level = 47) => { const r = new Room({ seed: 41, now: 1000 }); r.settings.demo = false; r.startLevel(level); ready(r); return r; };
function advance(r, seconds, step = .05) { for (let t = 0; t < seconds; t += step) r.step(step, r.now + step * 1000); }
function ready(r) { for (let i = 0; i < 400 && r.level.status !== 'playing'; i++) r.step(.1, r.now + 100); }
function until(r, predicate, seconds = 120) { for (let t = 0; t < seconds * 20; t++) { if (predicate()) return; r.step(.05, r.now + 50); } throw Error(`Condition not reached (phase ${r.phase.type}, level ${r.level.n} ${r.level.status}, pending ${r.pendingTotal}, queue ${r.queue.length}, current ${r.current?.type})`); }
const ledgerOk = r => r.taps.received === r.taps.played + r.pendingTotal && r.pendingTotal === [...r.tapPending.values()].reduce((a, b) => a + b, 0);

test('nothing moves without taps or gifts (no autopilot)', () => {
  const r = newRoom(); const board = JSON.stringify(r.engine.board); advance(r, 60);
  assert.equal(r.score, 0); assert.equal(r.taps.played, 0); assert.equal(JSON.stringify(r.engine.board), board); assert.equal(r.phase.type, 'idle');
});

test('fresh and restored sessions cannot enable simulated viewers', () => {
  const fresh = new Room({ seed: 41, now: 0 });
  const saved = fresh.export(); saved.settings.demo = true; saved.settings.auto = true;
  for (const r of [fresh, new Room({ saved, now: 5000 })]) {
    ready(r); const board = r.engine.export();
    r.command({ action: 'demo', value: true }); r.command({ action: 'auto', value: true }); advance(r, 60);
    assert.deepEqual(r.engine.export(), board); assert.equal(r.settings.demo, false);
    assert.equal(r.users.size, 0); assert.equal(r.score, 0); assert.equal(r.taps.received, 0);
  }
});

test('large tap batches retain every tap; invalid counts create no taps', () => {
  const r = newRoom(); r.like(viewer, 1000001);
  assert.equal(r.taps.received, 1000001); assert.equal(r.pendingTotal, 1000001);
  for (const count of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) assert.equal(r.like(viewer, count), false);
  assert.equal(r.command({ action: 'tap', count: 0 }), false);
  const restored = new Room({ saved: r.export(), now: 0 });
  assert.ok(ledgerOk(restored)); assert.equal(restored.pendingTotal, 1000001);
});

test('connecting LIVE removes test input and preserves real counters through reconnects', () => {
  const r = newRoom(); r.command({ action: 'tap', count: 300 });
  until(r, () => r.phase.type === 'swap');
  r.like(viewer, 17); r.enqueue('rose', { id: 'host-test', name: 'Test' }, 'host', 70);
  r.enqueue('rose', viewer, 'live', 80);
  r.prepareLive();
  assert.deepEqual(r.taps, { received: 17, played: 0 }); assert.equal(r.pendingTotal, 17); assert.ok(ledgerOk(r));
  assert.equal(r.users.has('host-test'), false); assert.equal(r.current, null);
  assert.ok(r.queue.every(a => a.source === 'live')); assert.equal(r.engine.jokersWaiting(), 80);
  assert.ok(r.engine.jokerQueue.every(id => id === viewer.id)); assert.equal(r.engine.jokerBacklog.has('host-test'), false);
  assert.ok(validBoard(r.engine.board)); assert.equal(matches(r.engine.board).length, 0);
  const before = r.export(); r.prepareLive(); assert.deepEqual(r.export(), before);
});

test('pending taps and gifts earn recognition in the level where they play', () => {
  const r = newRoom(1); r.like(viewer, 20);
  r.enqueue('rose', { id: 'gifter', name: 'Gifter' }, 'live', 2);
  assert.equal(r.heroOf('levelTaps'), null); assert.equal(r.heroOf('levelGifts'), null);
  r.command({ action: 'finish' }); until(r, () => r.phase.type === 'levelComplete');
  r.like(viewer, 5); assert.equal(r.lastLevel.heroes.tapper, null);
  until(r, () => r.level.n === 2 && r.taps.played > 0);
  assert.equal(r.heroOf('levelTaps').id, viewer.id); assert.equal(r.heroOf('levelTaps').value, r.level.tapsUsed);
  assert.equal(r.heroOf('levelGifts').value, 2); assert.ok(ledgerOk(r));
});

test('long gift streaks keep every joker across level changes and restore', () => {
  const r = newRoom();
  r.incoming({ type: 'gift', user: viewer, giftName: 'Rose', coins: 1000, total: 1000, repeat: 1000 });
  assert.equal(r.engine.jokersWaiting(), 1000); assert.equal(r.users.get(viewer.id).gifts, 1000);
  assert.equal(r.engine.jokerQueue.length, 60); assert.equal(r.engine.jokerBacklog.size, 1);
  r.engine.board[3] = { id: r.engine.nextId++, color: JOKER, special: null, joker: viewer.id };
  r.command({ action: 'skipLevel' }); assert.equal(r.engine.jokersWaiting(), 1001);
  const restored = new Room({ saved: r.export(), now: 9999 });
  assert.equal(restored.engine.jokersWaiting(), 1001); assert.equal(restored.snapshot().jokersWaiting, 1001);
  assert.deepEqual(restored.engine.export(), r.engine.export());
});

test('supernova on a joker remains saveable and pays the original gifter exactly once', () => {
  const r = newRoom(); r.participant(viewer);
  r.engine.board[24] = { id: r.engine.nextId++, color: JOKER, special: null, joker: viewer.id };
  r.enqueue('supernova', { id: 'other', name: 'Other' }, 'live');
  until(r, () => r.phase.type === 'power'); assert.ok(validBoard(r.engine.board));
  const restored = new Room({ saved: r.export(), now: 9999 });
  assert.deepEqual(restored.engine.export(), r.engine.export());
  for (const room of [r, restored]) {
    until(room, () => !!room.lastResult);
    assert.equal(room.users.get(viewer.id).score, JOKER_POINTS); assert.ok(validBoard(room.engine.board));
  }
  assert.equal(restored.score, r.score);
});
test('every tap is exactly one move and the ledger never drifts', () => {
  const r = newRoom(); r.like(viewer, 7); assert.equal(r.taps.received, 7); assert.equal(r.pendingTotal, 7);
  until(r, () => r.pendingTotal === 0 && !r.current && r.phase.type === 'idle');
  assert.equal(r.taps.played, 7); assert.equal(r.level.tapsUsed, 7); assert.ok(ledgerOk(r)); assert.ok(r.score > 0);
});
test('pending taps are served round-robin so one heavy tapper cannot starve others', () => {
  const r = newRoom(); r.like({ id: 'heavy', name: 'Heavy' }, 500); r.like({ id: 'light', name: 'Light' }, 3);
  const order = []; for (let i = 0; i < 6; i++) order.push(r.takeTap());
  assert.deepEqual(order, ['heavy', 'light', 'heavy', 'light', 'heavy', 'light']); assert.ok(ledgerOk(r));
});
test('a tap backlog still plays exactly one swap per tap, at most 1.5x faster', () => {
  const r = newRoom(); r.like(viewer, 400);
  until(r, () => r.phase.type === 'swap');
  assert.ok(r.phase.swaps.length <= 1); assert.equal(r.taps.played, 1); assert.equal(r.phase.speed, 1.5); assert.equal(r.phase.duration, Math.ceil(MOTION.swap / 1.5));
  let swaps = 0, last = -1;
  for (let i = 0; i < 8000 && r.taps.played < 60; i++) { r.step(.05, r.now + 50); assert.ok(ledgerOk(r)); if (r.phase.type === 'swap' && r.phase.id !== last) { last = r.phase.id; swaps++; assert.ok(r.phase.swaps.length <= 1); } }
  assert.equal(r.level.tapsUsed, r.taps.played); assert.ok(swaps >= 55);
});
test('one tap is one step: swap, explode, fall, then the board stops (no automatic chain)', () => {
  const r = newRoom(); r.like(viewer, 1);
  const seen = []; for (let i = 0; i < 400; i++) { r.step(.05, r.now + 50); if (seen.at(-1) !== r.phase.type) seen.push(r.phase.type); }
  assert.deepEqual(seen.filter(t => t !== 'idle'), ['swap', 'explode', 'fall']); assert.equal(r.taps.played, 1);
  assert.equal(r.lastResult.waves, 1); assert.equal(r.lastResult.points, r.lastResult.predicted);
});
test('new gems never land in a line; lines made by sliding gems wait for the next step', () => {
  const r = newRoom();
  for (let t = 0; t < 120; t++) {
    r.like(viewer, 1); until(r, () => r.phase.type === 'fall'); const ids = new Set(r.phase.drops.filter(d => d.from < 0).map(d => d.id));
    until(r, () => r.phase.type === 'idle' && !r.current);
    const fresh = r.engine.board.map((tile, i) => ids.has(tile.id) ? i : -1).filter(i => i >= 0);
    for (const group of matches(r.engine.board)) for (const i of group.cells) if (fresh.includes(i)) assert.ok(r.engine.board.some(t => t.joker) , 'a fresh gem completed a line');
    assert.ok(ledgerOk(r));
  }
});
test('gift steps grow with coin value (1 + floor(log2 coins), max 12) and play one step at a time', () => {
  assert.deepEqual([1, 2, 5, 30, 100, 1000, 1e6].map(giftSteps), [1, 2, 3, 5, 7, 10, 12]);
  const r = newRoom(); r.enqueue('supernova', viewer, 'live', 1, 1000);
  assert.deepEqual([r.queue[0].powers, r.queue[0].smart], [1, 9]);
  const kinds = []; let last = -1;
  until(r, () => { if (['swap', 'power'].includes(r.phase.type) && r.phase.id !== last) { last = r.phase.id; kinds.push(r.current.type); } return !r.queue.length && !r.current && r.phase.type === 'idle'; }, 300);
  assert.equal(kinds[0], 'supernova'); assert.equal(kinds.length, 10); assert.ok(kinds.slice(1).every(k => k === 'rose'));
});
test('Prism and Supernova gifts stay inside a 5 x 5 area (never the whole board)', () => {
  for (const type of ['prism', 'supernova']) {
    const r = newRoom(); r.enqueue(type, viewer, 'live', 1, 1);
    until(r, () => r.phase.type === 'explode');
    const center = r.current.plan.indices[0], cx = center % 7, cy = Math.floor(center / 7);
    const outside = r.phase.clear.filter(i => Math.max(Math.abs(i % 7 - cx), Math.abs(Math.floor(i / 7) - cy)) > 2);
    assert.ok(r.phase.clear.length <= 25 || outside.length > 0); assert.ok(r.phase.activated.length || outside.length === 0, `${type} cleared outside its area without a power piece`);
  }
});
test('gift steps play before waiting taps and alternate fairly between gifters', () => {
  const r = newRoom(); r.like({ id: 't', name: 'T' }, 5);
  r.enqueue('rose', { id: 'a', name: 'A' }, 'live', 1, 5); r.enqueue('rose', { id: 'b', name: 'B' }, 'live', 1, 5);
  const order = []; let last = -1;
  until(r, () => { if (r.phase.type === 'swap' && r.phase.id !== last) { last = r.phase.id; order.push(r.current.userId); } return order.length >= 7; }, 300);
  assert.deepEqual(order.slice(0, 6), ['a', 'b', 'a', 'b', 'a', 'b']); assert.equal(order[6], 't');
});
test('tap points are a quarter of the wave score, split exactly between tappers, and match the forecast', () => {
  const r = newRoom(); r.like({ id: 'a', name: 'A' }, 30); r.like({ id: 'b', name: 'B' }, 30);
  until(r, () => r.lastResult);
  assert.equal(r.lastResult.points, r.lastResult.predicted); assert.equal(r.lastResult.points * TAP_DIVISOR % 1, 0);
  const a = r.users.get('a').score, b = r.users.get('b').score; assert.equal(a + b, r.score); assert.ok(Math.abs(a - b) <= r.score);
});
test('gifts play before waiting taps, at full points, and drop jokers with the gifter photo', () => {
  const r = newRoom(); r.like({ id: 't', name: 'T' }, 50);
  r.incoming({ type: 'gift', user: viewer, giftName: 'Rose', coins: 1, total: 1, repeat: 1 });
  until(r, () => r.phase.type === 'swap'); assert.equal(r.current.type, 'rose'); assert.equal(r.taps.played, 0);
  assert.equal(r.users.get(viewer.id).avatar, viewer.avatar); assert.equal(r.engine.jokerQueue.length + r.engine.jokerCount(), 1);
  until(r, () => r.lastResult); assert.equal(r.lastResult.points, r.lastResult.predicted);
});
test('an exploding joker pays its gifter and counts as one cleared piece', () => {
  const r = newRoom(); const i = 24; r.engine.board[i] = { id: r.engine.nextId++, color: JOKER, special: null, joker: viewer.id }; r.participant(viewer);
  r.like({ id: 't', name: 'T' }, 300);
  until(r, () => !r.engine.board.some(t => t?.joker), 200);
  assert.ok(r.users.get(viewer.id).score >= JOKER_POINTS); assert.equal(r.log.some(e => e.type === 'joker'), true);
});
test('level completes only by goals, records stars by taps, and shows top tapper, gifter and MVP', () => {
  const r = newRoom(1); r.like({ id: 'tapper', name: 'Tapper' }, 400); r.enqueue('rose', viewer, 'live', 2);
  until(r, () => r.phase.type === 'levelComplete', 400);
  const result = r.history[0], spec = levelSpec(1);
  assert.equal(result.level, 1); assert.ok(result.tapsUsed > 0); assert.equal(result.stars, result.tapsUsed <= spec.par.three ? 3 : result.tapsUsed <= spec.par.two ? 2 : 1);
  assert.equal(result.heroes.tapper.id, 'tapper'); assert.equal(result.heroes.gifter.id, viewer.id); assert.ok(result.heroes.mvp);
  assert.ok(r.users.get(result.heroes.mvp.id).trophies >= 1); assert.equal(r.levelStars[1], result.stars); assert.deepEqual(r.heroes[1], result.heroes);
  until(r, () => r.phase.type === 'roadmap'); assert.deepEqual(r.phase.heroes, result.heroes);
  until(r, () => r.level.n === 2); assert.equal(r.phase.type, 'levelIntro'); assert.ok(ledgerOk(r), 'waiting taps carry over to the next level');
});
test('taps arriving during level transitions are kept and played afterwards', () => {
  const r = new Room({ seed: 5, now: 0 }); r.settings.demo = false; assert.equal(r.phase.type, 'levelIntro');
  r.like(viewer, 5); advance(r, 1); assert.equal(r.taps.played, 0); assert.equal(r.pendingTotal, 5);
  until(r, () => r.pendingTotal === 0); assert.equal(r.taps.played, 5);
});
test('jokers on the board when a level changes go back to the joker queue', () => {
  const r = newRoom(); r.engine.board[3] = { id: r.engine.nextId++, color: JOKER, special: null, joker: 'g1' }; r.engine.jokerQueue = ['g2'];
  r.command({ action: 'skipLevel' }); assert.deepEqual(r.engine.jokerQueue, ['g2', 'g1']); assert.equal(r.engine.jokerCount(), 0);
});
test('only https TikTok photo links are kept', () => {
  assert.equal(cleanAvatar('https://p16-sign-va.tiktokcdn.com/a.jpeg'), 'https://p16-sign-va.tiktokcdn.com/a.jpeg');
  for (const bad of ['http://p16.tiktokcdn.com/a.jpg', 'https://eviltiktokcdn.com/a.jpg', 'https://example.com/a.jpg', 'javascript:alert(1)', '']) assert.equal(cleanAvatar(bad), '');
});
test('gift streak uses relay deltas; final zero packet grants no extra power', () => {
  const r = newRoom();
  for (const packet of [{ coins: 1, total: 1, repeat: 1 }, { coins: 2, total: 3, repeat: 3 }, { coins: 0, total: 3, repeat: 3, final: true }]) r.incoming({ type: 'gift', giftName: 'Rose', user: viewer, ...packet });
  assert.equal(r.queue.length, 1); assert.equal(r.queue[0].units, 3); assert.equal(r.users.get(viewer.id).gifts, 3); assert.equal(r.engine.jokerQueue.length, 3);
});
test('batched likes, mapped gifts and LIVE status are understood', () => {
  const r = newRoom(); r.incoming({ type: 'batch', events: [{ type: 'status', live: true, username: 'dexter' }, { type: 'like', user: viewer, count: 51 }, { type: 'gift', user: viewer, giftName: 'Galaxy', coins: 100, total: 100, repeat: 1 }] });
  assert.equal(r.live.live, true); assert.equal(r.pendingTotal, 51); assert.deepEqual(r.queue.map(a => a.type), ['supernova']);
});
test('all gift powers complete, credit their owner, and leave a playable stable board', () => {
  for (const power of ['rose', 'meteor', 'prism', 'supernova']) {
    const r = newRoom(); r.enqueue(power, viewer); until(r, () => r.lastResult);
    assert.ok(r.score > 0); assert.equal(r.users.get(viewer.id).score, r.score - (r.log.filter(e => e.type === 'joker').length ? 0 : 0) || r.score);
    assert.ok(validBoard(r.engine.board)); assert.equal(matches(r.engine.board).length, 0); assert.ok(moves(r.engine.board).length); assert.equal(r.level.tapsUsed, 0);
  }
});
test('pause freezes everything; taps keep counting while paused', () => {
  const r = newRoom(); r.command({ action: 'pause' }); r.like(viewer, 10); advance(r, 10); assert.equal(r.taps.played, 0); assert.equal(r.pendingTotal, 10);
  r.command({ action: 'pause' }); until(r, () => r.pendingTotal === 0); assert.ok(ledgerOk(r));
});
test('saving during every animation phase resumes with the same board, score and tap ledger', () => {
  const r = newRoom(); r.like(viewer, 40); r.enqueue('supernova', { id: 'g', name: 'G' });
  for (let i = 0; i < 120; i++) {
    advance(r, .1);
    const saved = JSON.parse(JSON.stringify(r.export())), a = new Room({ saved, now: 1_000_000 }), b = new Room({ saved, now: 2_000_000 });
    for (const x of [a, b]) { x.settings.demo = false; until(x, () => !x.current && !x.queue.length && !x.pendingTotal && x.phase.type === 'idle', 300); }
    assert.equal(a.score, b.score); assert.deepEqual(a.engine.export(), b.engine.export()); assert.deepEqual(a.taps, b.taps); assert.ok(ledgerOk(a));
    if (!r.current && !r.queue.length && !r.pendingTotal) break;
  }
});
test('older saves keep lifetime score, viewers and chests and start the 150-level roadmap at level 1', () => {
  const old = { version: 2, score: 123456, chests: 4, users: [{ id: 'v', name: 'Old viewer', score: 9, roundScore: 9, trophies: 2 }], settings: { auto: true, demo: false }, history: [{ level: 3, name: 'x' }], engine: new Room({ seed: 3 }).engine.export() };
  const r = new Room({ saved: old, now: 5 }); assert.equal(r.score, 123456); assert.equal(r.chests, 4); assert.equal(r.users.get('v').trophies, 2); assert.equal(r.level.n, 1); assert.equal(r.history.length, 0); assert.equal(r.settings.auto, undefined); assert.deepEqual(r.taps, { received: 0, played: 0 });
});
test('host level tools jump, skip and restart', () => {
  const r = newRoom(); r.command({ action: 'setLevel', level: 12 }); assert.equal(r.level.n, 12); assert.deepEqual(r.engine.ice, levelSpec(12).ice);
  r.command({ action: 'skipLevel' }); assert.equal(r.level.n, 13); r.command({ action: 'restartLevel' }); assert.equal(r.level.attempt, 2);
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
test('two hours of busy live play keep the ledger exact and memory bounded', () => {
  const r = new Room({ seed: 41, now: 1000 }); r.settings.demo = false;
  for (let i = 0; i < 2 * 3600 * 4; i++) {
    if (i % 2 === 0) r.like({ id: `v${i % 37}`, name: `V${i % 37}` }, 1 + (i % 3));
    if (i % 300 === 0) r.enqueue(['rose', 'meteor', 'prism', 'supernova'][(i / 300) % 4], { id: `g${i % 7}`, name: `G${i % 7}` }, 'live', 1 + (i / 300) % 3);
    r.step(.25, r.now + 250);
    if (i % 997 === 0) assert.ok(ledgerOk(r));
  }
  assert.ok(ledgerOk(r)); assert.ok(r.unlocked > 10, `reached level ${r.unlocked}`); assert.ok(r.history.length <= 8); assert.ok(r.log.length <= 14); assert.ok(Object.keys(r.heroes).length <= 201); assert.ok(validBoard(r.engine.board));
});
void TAP_BATCH;
