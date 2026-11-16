import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, COLS, ROWS, SIZE, matches, specialFor, resolve, moves, moveAt, validBoard, copyBoard } from '../public/engine.js';

const base = () => Array.from({ length: SIZE }, (_, i) => ({ id: i + 1, color: (i % COLS + Math.floor(i / COLS) * 2) % 6, special: null }));
const line = (length, axis = 'h') => { const b = base(), cells = Array.from({ length }, (_, i) => axis === 'h' ? 2 * COLS + i : i * COLS + 3); cells.forEach(i => b[i].color = 0); return { b, cells }; };

test('seeded initial boards are full, stable, unique, and have a legal move', () => {
  for (let seed = 1; seed <= 150; seed++) { const e = new Engine(seed); assert.ok(validBoard(e.board)); assert.equal(matches(e.board).length, 0); assert.ok(moves(e.board).length); assert.deepEqual(e.export(), new Engine(seed).export()); }
});
test('three clears exactly three cells and creates no power', () => {
  const { b, cells } = line(3), hit = resolve(b);
  assert.deepEqual(hit.clear, cells); assert.equal(hit.births.length, 0);
});
test('four makes a line power in the match direction at the preferred endpoint', () => {
  for (const axis of ['h', 'v']) {
    const { b, cells } = line(4, axis), hit = resolve(b, { preferred: [cells[3]] });
    assert.equal(hit.births.length, 1); assert.equal(hit.births[0].special, axis === 'h' ? 'row' : 'column'); assert.equal(hit.births[0].index, cells[3]); assert.equal(hit.clear.length, 3); assert.ok(!hit.clear.includes(cells[3]));
  }
});
test('five and six in a line make exactly one prism', () => {
  for (const axis of ['h', 'v']) for (const length of [5, 6]) { const { b } = line(length, axis), hit = resolve(b); assert.equal(hit.births.length, 1); assert.equal(hit.births[0].special, 'prism'); assert.equal(hit.births[0].color, -1); assert.equal(hit.clear.length, length - 1); }
});
test('T and L intersections merge into one nova and count each cell once', () => {
  for (const cells of [[16, 17, 18, 10, 24], [16, 17, 18, 25, 32]]) {
    const b = base(); b.forEach(t => { if (t.color === 5) t.color = 0; }); cells.forEach(i => b[i].color = 5); const hit = resolve(b);
    assert.equal(hit.groups.length, 1); assert.equal(hit.births.length, 1); assert.equal(hit.births[0].special, 'nova'); assert.equal(new Set([...hit.clear, hit.births[0].index]).size, cells.length);
  }
});
test('a line of five takes priority over an intersecting nova', () => {
  const { b } = line(5); b[9].color = b[23].color = 0;
  assert.equal(resolve(b).births[0].special, 'prism');
});
test('separate matches stay separate and do not combine into a power', () => {
  const { b } = line(3); [35, 36, 37].forEach(i => b[i].color = 5); const hit = resolve(b);
  assert.equal(hit.groups.length, 2); assert.equal(hit.clear.length, 6); assert.equal(hit.births.length, 0);
});
test('illegal swaps do not change the board or RNG', () => {
  const e = new Engine(49), saved = e.export();
  assert.equal(e.swap(6, 7), null); assert.equal(e.swap(-1, 0), null); assert.equal(e.swap(0, 55), null); assert.equal(e.swap(1.5, 2.5), null);
  const illegal = Array.from({ length: SIZE - 1 }, (_, i) => [i, i + 1]).find(([a, b]) => a % COLS < 6 && !moveAt(e.board, a, b));
  assert.equal(e.swap(...illegal), null); assert.deepEqual(e.export(), saved);
});
test('a prism swap targets the other gem color', () => {
  const b = base(); b[0] = { ...b[0], color: -1, special: 'prism' }; const target = b[1].color, move = moveAt(b, 0, 1);
  assert.ok(move); assert.equal(move.options.targetColor, target);
  const swapped = b.slice(); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const expected = swapped.flatMap((t, i) => t.color === target || t.special === 'prism' ? [i] : []);
  assert.deepEqual(move.hit.clear, expected);
});
test('double prism swap clears the whole board', () => {
  const b = base(); for (const i of [0, 1]) b[i] = { ...b[i], color: -1, special: 'prism' };
  assert.equal(moveAt(b, 0, 1).hit.clear.length, SIZE);
});
test('beam activates chained nova exactly once with bounded clear cells', () => {
  const b = base(); b[16].special = 'row'; b[18].special = 'nova';
  const hit = resolve(b, { triggers: [16] });
  assert.equal(hit.activated.length, 2); assert.equal(new Set(hit.clear).size, hit.clear.length);
  for (let x = 0; x < COLS; x++) assert.ok(hit.clear.includes(2 * COLS + x));
  assert.ok(hit.clear.includes(10)); assert.ok(hit.clear.includes(26));
});
test('gravity preserves survivor order and spawns only into vacancies', () => {
  const e = new Engine(33), original = copyBoard(e.board), hit = { clear: [0, 14, 21, 49], births: [] }; e.clear(hit); const drops = e.collapse();
  assert.ok(validBoard(e.board));
  const survivors = original.filter((t, i) => i % COLS === 0 && !hit.clear.includes(i));
  assert.deepEqual(e.board.filter((t, i) => i % COLS === 0).slice(-survivors.length).map(t => t.id), survivors.map(t => t.id));
  assert.equal(e.board.filter(t => t.id >= 57).length, 4); assert.equal(drops.filter(d => d.from < 0).length, 4);
  for (let x = 1; x < COLS; x++) for (let y = 0; y < ROWS; y++) assert.equal(e.board[y * COLS + x].id, original[y * COLS + x].id);
});
test('look-ahead is deterministic and cannot consume live RNG', () => {
  const e = new Engine(991), before = e.export(), a = e.bestMove(), b = e.bestMove(); assert.deepEqual(a, b); assert.deepEqual(e.export(), before); assert.ok(moveAt(e.board, a.a, a.b));
});
test('thousands of legal moves and cascades preserve board invariants', () => {
  const e = new Engine(710293); let waves = 0;
  for (let n = 0; n < 2500; n++) {
    if (!moves(e.board).length) e.shuffle();
    const options = moves(e.board), move = options[n % options.length]; let hit = e.swap(move.a, move.b), chain = 0;
    assert.ok(hit?.clear.length);
    while (hit.clear.length && chain++ < 32) { waves++; assert.equal(new Set(hit.clear).size, hit.clear.length); e.clear(hit); e.collapse(); assert.ok(validBoard(e.board)); hit = resolve(e.board); }
    if (hit.clear.length) e.shuffle(); assert.equal(matches(e.board).length, 0);
  }
  assert.ok(waves >= 2500);
});
