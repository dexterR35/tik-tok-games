import test from 'node:test';
import assert from 'node:assert/strict';
import { ControlRoom } from '../control-room.js';
import { EchoGame } from '../public/engine.js';

const advance = (room, seconds) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) room.step(1 / 60, room.now + 1000 / 60);
};

test('the default game starts playing automatically and the demo finishes a rescue', () => {
  const room = new ControlRoom(); assert.equal(room.game.phase, 'running'); assert.equal(room.settings.demo, true);
  advance(room, 65); assert.ok(room.game.rescues >= 1); assert.ok(room.game.echoes >= 1);
});

test('automatic progression shows the warp map and starts the next world with carried echoes', () => {
  const room = new ControlRoom(); let visitedMap = false;
  for (let i = 0; i < 200 * 60 && room.game.levelIndex === 0; i++) {
    room.step(1 / 60, room.now + 1000 / 60); if (room.view === 'map') visitedMap = true;
  }
  assert.equal(visitedMap, true); assert.equal(room.game.levelIndex, 1); assert.equal(room.game.loop, 1);
  assert.ok(room.game.previous.length > 0);
  for (const event of room.game.previous.filter(e => e.type === 'cube')) assert.ok(room.game.gaps.some(g => event.x >= g.from && event.x <= g.to));
});

test('all clients receive one authoritative clock; opening a second snapshot does not start a second game', () => {
  const room = new ControlRoom({ settings: { demo: false } }); advance(room, 2);
  const a = JSON.parse(JSON.stringify(room.snapshot())), b = JSON.parse(JSON.stringify(room.snapshot()));
  assert.equal(a.game.time, b.game.time); assert.equal(a.game.robot.x, b.game.robot.x);
  room.command({ action: 'effect', effect: 'shield' }); assert.equal(room.snapshot().game.gifts, 1);
  assert.equal(JSON.parse(JSON.stringify(room.snapshot())).game.effects[0].type, 'shield');
});

test('gift combos queue during the map, ignore streak finals, and apply once per gift after resume', () => {
  const room = new ControlRoom({ settings: { demo: false } }); room.command({ action: 'map', open: true });
  room.incoming({ type: 'batch', events: [
    { type: 'gift', coins: 3, total: 3, repeat: 3, giftName: 'Rose', user: { name: 'Ada' } },
    { type: 'gift', coins: 0, total: 3, repeat: 3, final: true, giftName: 'Rose' },
  ] });
  advance(room, 3); assert.equal(room.queue.length, 3); assert.equal(room.game.time, 0); assert.equal(room.game.gifts, 0);
  room.command({ action: 'map', open: false }); advance(room, .1);
  assert.equal(room.queue.length, 0); assert.equal(room.game.gifts, 3); assert.equal(room.game.recording.length, 3);
});

test('likes charge a free team jump, with a remainder kept for the next jump', () => {
  const room = new ControlRoom({ settings: { demo: false } }); room.incoming({ type: 'like', count: 120 });
  assert.equal(room.energy, 20); assert.equal(room.game.recording.length, 1); assert.equal(room.game.recording[0].type, 'pulse');
  assert.equal(room.game.recording[0].viewer, 'TEAM TAPS'); room.addLikes(-3); assert.equal(room.energy, 20);
});

test('unplayed echoes survive an early failed loop and are not recorded again', () => {
  const game = new EchoGame(); game.warp(4); game.time = 20; game.send('shield', 'Ada'); game.finishLoop(); game.step(3.1);
  assert.equal(game.previous.length, 1); game.finishLoop('SYSTEM OVERLOAD'); game.step(3.1);
  assert.equal(game.previous.length, 1); game.step(20.1); assert.equal(game.echoes, 1); assert.equal(game.recording.length, 0);
  game.finishLoop(); game.step(3.1); assert.equal(game.previous.length, 0);
});

test('host commands validate worlds and reset the session while preserving earned progress', () => {
  const room = new ControlRoom({ progress: { moss: { stars: 3, bestTime: 18 } } });
  assert.throws(() => room.command({ action: 'warp', world: 99 }), /Invalid world/);
  assert.throws(() => room.command({ action: 'unknown' }), /Unknown command/);
  room.command({ action: 'warp', world: 2 }); assert.equal(room.game.levelIndex, 2);
  room.command({ action: 'reset' }); assert.equal(room.game.totalStars, 3); assert.equal(room.game.phase, 'running'); assert.equal(room.game.gifts, 0);
});
