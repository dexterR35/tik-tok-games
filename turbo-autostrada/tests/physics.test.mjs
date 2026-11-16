// Mathematical guarantees of the Dream Garage physics and duel. Run with: npm run test:garage
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS, CATEGORIES, newProject, stats, advanceRun, newRun, powerCurve, torqueCurve, PEAK_RPM, PHYSICS } from '../public/garage/model.js';
import { createDuel, advanceDuel, tapDuel, giftDuel, duelResult } from '../duel-race.js';
import { LiveEngine } from '../live-engine.js';
import { chooseGoal, completeGoal, freshLiveSave } from '../public/garage/live-rules.js';
const full = (id, level) => { const p = newProject(id); for (const k in p.parts) p.parts[k] = level; return p; };
const sprint = (project, race = 'sprint', dt = .02) => { const r = newRun(race); while (!r.finished) advanceRun(r, project, dt, r.speed > 16); return r; };

test('the engine curve peaks at exactly 100% and power is torque times rpm', () => {
  assert.ok(Math.abs(powerCurve(PEAK_RPM) - 1) < 1e-12);
  for (let x = .02; x <= 1.2; x += .02) { assert.ok(powerCurve(x) <= 1 + 1e-12); assert.ok(Math.abs(powerCurve(x) - x * torqueCurve(x) / (PEAK_RPM * torqueCurve(PEAK_RPM))) < 1e-12); }
  assert.equal(powerCurve(0), 0);
});
test('no setup creates energy: the car never gains kinetic energy faster than the engine can deliver it', () => {
  for (const car of CARS) for (const gearing of [.85, 1, 1.15]) for (const level of [0, 3]) {
    const p = full(car.id, level); p.tune.gearing = gearing; const s = stats(p), r = newRun('highway');
    while (!r.finished) {
      const v0 = r.speed, boost = r.speed > 16 && r.nitrousUsed < s.nitrousSeconds; advanceRun(r, p, .01, boost);
      const gained = .5 * s.mass * (r.speed ** 2 - v0 ** 2), limit = (s.hp + s.nitrousHp) * 745.7 * s.delivery * .01;
      assert.ok(gained <= limit * 1.0001 + 1e-6, `${car.id} gearing ${gearing}: +${gained.toFixed(1)} J in a step, engine limit ${limit.toFixed(1)} J`);
    }
  }
});
test('the result does not depend on the frame rate', () => {
  for (const level of [0, 3]) { const a = sprint(full('kaze', level), 'sprint', .05).time, b = sprint(full('kaze', level), 'sprint', .016).time, c = sprint(full('kaze', level), 'sprint', .004).time; assert.ok(Math.max(a, b, c) - Math.min(a, b, c) < .02, `${a} ${b} ${c}`); }
  const slow = newRun(); advanceRun(slow, newProject(), 1); assert.ok(Math.abs(slow.time - 1) < 1e-9, 'a long frame is simulated in full, not dropped');
});
test('no upgrade, at any level, on any car, in either event, makes the car slower', () => {
  for (const car of CARS) for (const base of [0, 1, 2]) for (const race of ['sprint', 'highway']) for (const c of CATEGORIES) for (let level = 1; level <= 3; level++) {
    const before = full(car.id, base), after = full(car.id, base); before.parts[c.id] = level - 1; after.parts[c.id] = level;
    assert.ok(sprint(after, race).time <= sprint(before, race).time + .0005, `${car.id} base ${base} ${race}: ${c.id} ${level - 1} -> ${level}`);
  }
});
test('setup is a real trade-off: the best final drive depends on the build', () => {
  const best = p => [.85, .9, .95, 1, 1.05, 1.1, 1.15].map(g => { const q = structuredClone(p); q.tune.gearing = g; return [sprint(q).time, g]; }).sort((a, b) => a[0] - b[0])[0][1];
  const grippy = newProject(); grippy.parts.tires = 3; grippy.parts.wheels = 3; grippy.parts.suspension = 3;
  assert.ok(best(grippy) > 1, 'grip to spare: short gearing wins'); assert.ok(best(full('atlas', 3)) < 1, 'power to spare: long gearing wins');
  const camber = v => { const q = full('atlas', 3); q.tune.camber = v; return sprint(q).time; };
  assert.ok(camber(1.5) < camber(0) && camber(1.5) < camber(6), 'camber has a sweet spot between none and too much');
});
test('more cooling is never hotter, and the hottest legal build loses power only without full cooling', () => {
  const hot = full('atlas', 3); hot.parts.cooling = 2; hot.tune.boost = 1.2; const cool = structuredClone(hot); cool.parts.cooling = 3;
  let maxHot = 0, maxCool = 0; for (const [p, set] of [[hot, v => maxHot = Math.max(maxHot, v)], [cool, v => maxCool = Math.max(maxCool, v)]]) { const r = newRun('highway'); while (!r.finished) { advanceRun(r, p, .02, r.speed > 16); set(r.temperature); } }
  assert.ok(maxHot > PHYSICS.T_HOT && maxCool < PHYSICS.T_HOT, `${maxHot.toFixed(0)} / ${maxCool.toFixed(0)}`);
  assert.ok(sprint(newProject(), 'highway').temperature < PHYSICS.T_HOT, 'a stock car never overheats');
});
function duel(project, pieces, credits) { const d = createDuel(project, 1, 'harder'); let charge = 0; advanceDuel(d, 5, 0); for (let i = 0; i < pieces; i++) giftDuel(d, credits / pieces); for (let i = 0; i < 3000 && !(d.player.finished && d.rival.finished); i++) charge = advanceDuel(d, .02, charge); return duelResult(d).time; }
test('audience help does not depend on how TikTok groups it', () => {
  assert.ok(Math.abs(duel(newProject(), 1, 1500) - duel(newProject(), 30, 1500)) < 1e-6, 'one 30-coin gift = thirty 1-coin gifts');
  const taps = batch => { const d = createDuel(newProject(), 1, 'harder'); advanceDuel(d, 4, 0); for (let i = 0; i < 60 / batch; i++) tapDuel(d, batch); return d.player.speed; };
  assert.ok(Math.abs(taps(1) - taps(60)) < 1e-9, 'sixty likes one by one = one message of sixty likes');
});
test('the same likes move a starter car and a finished build by the same share of the race', () => {
  const gain = p => { const run = taps => { const d = createDuel(p, 1, 'harder'); for (let i = 0; i < 3000 && !(d.player.finished && d.rival.finished); i++) { if (taps && i % 10 === 0) tapDuel(d, 1); advanceDuel(d, .02, 0); } return duelResult(d).time; }; const base = run(false); return (base - run(true)) / base; };
  const a = gain(newProject()), b = gain(full('atlas', 3)); assert.ok(a > .02 && b > .02 && Math.abs(a - b) / a < .35, `${(a * 100).toFixed(1)}% vs ${(b * 100).toFixed(1)}%`);
});
test('the build never stalls: a finished car hands over to the next unfinished one, and credits stay whole', () => {
  const save = freshLiveSave(); save.garage.credits = 1e9;
  for (let i = 0; i < 400; i++) { const goal = chooseGoal(save); if (goal.complete) break; assert.equal(completeGoal(save, goal).ok, true, JSON.stringify(goal)); }
  for (const car of CARS) assert.ok(CATEGORIES.every(c => save.garage.projects[car.id].parts[c.id] === 3), `${car.id} is fully built`);
  assert.equal(chooseGoal(save).complete, true);
  const engine = new LiveEngine(null); for (let i = 0; i < 300; i++) engine.tick(.0333); assert.ok(Number.isInteger(engine.save.garage.credits));
  engine.tick(NaN); engine.tick(-5); engine.event(null); assert.ok(Number.isInteger(engine.save.garage.credits));
});
