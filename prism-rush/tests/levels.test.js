import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, SIZE, JOKER, JOKER_CAP, matches, resolve, moves, emptyTally, goalValue, validBoard } from '../public/engine.js';
import { levelSpec, levelTemplate, simulateLevel, CALIBRATION, DESIGNED_LEVELS, WORLDS, starsFor, needFor, newProgress } from '../public/levels.js';

test('150 designed levels in 10 worlds are calibrated, valid and get longer', () => {
  assert.equal(DESIGNED_LEVELS, 150); assert.equal(WORLDS.length, 10); assert.equal(CALIBRATION.length, DESIGNED_LEVELS);
  for (let n = 1; n <= DESIGNED_LEVELS; n++) {
    const spec = levelSpec(n), [three, two, median, p90] = CALIBRATION[n - 1];
    assert.ok(spec.goals.length >= 1 && spec.goals.length <= 4);
    assert.ok(three > 0 && three <= two && two <= p90 && median <= p90, `level ${n} quantiles`);
    assert.deepEqual(spec.par, { three, two, median, p90 }); assert.equal(spec.hard, n % 5 === 0); assert.equal(spec.ice.length, SIZE);
    const ice = spec.goals.find(g => g.type === 'ice'); assert.equal(ice ? ice.target : 0, spec.ice.reduce((a, b) => a + b, 0));
  }
  const early = CALIBRATION.slice(0, 15).reduce((a, r) => a + r[2], 0), late = CALIBRATION.slice(135).reduce((a, r) => a + r[2], 0);
  assert.ok(late > early * 8, `late levels need far more taps (${early} vs ${late})`);
  assert.ok(levelSpec(151).encore); assert.deepEqual(levelSpec(151).goals, levelSpec(76).goals);
});
test('random taps finish sampled levels near their calibrated median', () => {
  for (const n of [1, 15, 40, 80]) {
    const spec = levelSpec(n), runs = [1, 2, 3].map(seed => simulateLevel(spec, seed * 104729 + n));
    for (const r of runs) { assert.ok(r.complete); assert.ok(r.used < spec.par.p90 * 2, `level ${n}: ${r.used} taps`); }
  }
});
test('stars reward finishing in fewer taps', () => {
  const spec = levelSpec(10);
  assert.equal(starsFor(spec, spec.par.three), 3); assert.equal(starsFor(spec, spec.par.three + 1), spec.par.two > spec.par.three ? 2 : 1);
  assert.equal(starsFor(spec, spec.par.two), spec.par.two === spec.par.three ? 3 : 2); assert.equal(starsFor(spec, spec.par.two + 1), 1); assert.equal(starsFor(spec, 0, false), 0);
});
test('goal value is clipped to what is still needed', () => {
  const t = emptyTally(); t.colors[2] = 10; t.ice = 4;
  assert.equal(goalValue(t, null), 0); assert.equal(goalValue(t, { colors: [0, 0, 3, 0, 0, 0], ice: 1 }), 3 * 600 + 1500);
  const need = needFor(levelTemplate(2), newProgress()); assert.equal(need.colors.reduce((a, b) => a + b, 0), levelTemplate(2).goals[0].target);
});
test('ice loses one layer per hit, including the cell that becomes a new power', () => {
  const e = new Engine(3); e.ice[10] = 2; e.ice[11] = 1;
  const tally = e.clear({ clear: [10], births: [{ index: 11, special: 'row', color: e.board[11].color }] });
  assert.deepEqual([e.ice[10], e.ice[11], tally.ice, tally.beam], [1, 0, 2, 1]);
});
const base = () => Array.from({ length: SIZE }, (_, i) => ({ id: i + 1, color: (i % 7 + Math.floor(i / 7) * 2) % 6, special: null }));
const joker = (id, owner = 'gifter') => ({ id, color: JOKER, special: null, joker: owner });
test('a joker is wild: it completes a line of any color and can complete two at once', () => {
  const b = base(); b.forEach(t => { if (t.color === 0 || t.color === 4) t.color = 1; });
  [14, 15].forEach(i => b[i].color = 0); b[16] = joker(17); [17, 18].forEach(i => b[i].color = 4);
  const hit = resolve(b); assert.deepEqual(hit.clear, [14, 15, 16, 17, 18]); assert.equal(hit.births.length, 0); assert.ok(validBoard(b));
  const c = base(); c[16] = joker(17); [17, 18].forEach(i => c[i].color = 3); c[15].color = 3; assert.ok(['row', 'prism'].includes(resolve(c).births[0]?.special));
  assert.ok(!resolve(c).births.some(x => c[x.index].joker), 'a joker never becomes a power anchor');
});
test('three jokers alone are not a match', () => {
  const b = base(); [14, 15, 16].forEach(i => b[i] = joker(i + 1)); b[13].color = 1; b[17].color = 1; b[13].color = 2; b[17].color = 4;
  assert.ok(!matches(b).some(g => [...g.cells].every(i => i >= 14 && i <= 16)));
});
test('gift jokers enter with refills and never exceed 5 of 56 cells', () => {
  const e = new Engine(7); e.addJokers('gifter', 60); let max = 0, seen = 0;
  for (let t = 0; t < 300; t++) {
    const r = e.randomMoves(2); if (!r) { e.shuffle(); continue; }
    let hit = e.applyPlan(r.plan); while (hit.clear.length) { seen += e.clear(hit).joker; e.collapse(); max = Math.max(max, e.jokerCount()); hit = resolve(e.board); }
    if (matches(e.board).length || !moves(e.board).length) e.shuffle(); if (e.jokerQueue.length < 5) e.addJokers('g', 10);
  }
  assert.ok(max <= JOKER_CAP); assert.ok(seen > 20); assert.ok(validBoard(e.board));
  const quiet = new Engine(7), copy = new Engine(7); quiet.clear({ clear: [0, 1, 2], births: [] }); quiet.collapse(); copy.clear({ clear: [0, 1, 2], births: [] }); copy.collapse();
  assert.deepEqual(quiet.export(), copy.export(), 'without gifts the generator is untouched by joker logic');
});
test('random tap moves are legal, disjoint, and uniform over legal swaps', () => {
  const e = new Engine(41), legal = moves(e.board), counts = new Map();
  for (let i = 0; i < 6000; i++) { const r = e.randomMoves(1), key = `${r.first.a}-${r.first.b}`; counts.set(key, (counts.get(key) || 0) + 1); }
  assert.equal(counts.size, legal.length);
  const expected = 6000 / legal.length; for (const c of counts.values()) assert.ok(Math.abs(c - expected) < expected * .35);
  const multi = new Engine(41).randomMoves(4), cells = multi.swaps.flatMap(s => [s.a, s.b]);
  assert.equal(new Set(cells).size, cells.length); assert.ok(new Engine(1, new Engine(41).export()).applyPlan(multi.plan));
});
