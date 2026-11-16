import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newState, newProject, restoreState, installPart, buyCar, receiveGift, saveBuild, stats, newRun, advanceRun, rewardRun, CATEGORIES, applyTune, serviceCar, claimContract, recordDyno, reputation } from '../public/garage/model.js';

function sprint(project, boost = false) { const run = newRun(); for (let i = 0; i < 6000 && !run.finished; i++) advanceRun(run, project, .01, boost); assert.equal(run.finished, true); return run; }
test('a purchase is atomic and owned parts can be refitted without spending again', () => {
  const state = newState(); state.credits = 100;
  const before = JSON.stringify(state);
  assert.equal(installPart(state, 'wheels', 2).ok, false); assert.equal(JSON.stringify(state), before);
  state.credits = 2000;
  assert.equal(installPart(state, 'wheels', 2).ok, true); assert.equal(state.credits, 900);
  installPart(state, 'wheels', 0); installPart(state, 'wheels', 2);
  assert.equal(state.credits, 900); assert.equal(state.projects.kaze.spent, 1100);
  assert.equal(installPart(state, 'wheels', 2).ok, false);
});
test('gift credits and contributor totals match the three simulated actions', () => {
  const state = newState(); state.credits = 0;
  receiveGift(state, 'spark', 'Dex'); receiveGift(state, 'toolbox', 'Dex'); receiveGift(state, 'rocket', 'Crew');
  assert.equal(state.credits, 2100); assert.equal(state.totalGifts, 3);
  assert.deepEqual(state.contributors, [{ name: 'Crew', credits: 1500 }, { name: 'Dex', credits: 600 }]);
  assert.equal(receiveGift(state, 'unknown', 'Dex'), null); assert.equal(state.credits, 2100);
});
test('new cars cost credits once and switching projects preserves their parts', () => {
  const state = newState(); state.credits = 10000;
  installPart(state, 'wheels', 1); assert.equal(buyCar(state, 'vanta').ok, true); assert.equal(state.credits, 1500);
  assert.equal(state.projects.vanta.parts.wheels, 0);
  buyCar(state, 'kaze'); assert.equal(state.projects.kaze.parts.wheels, 1);
  buyCar(state, 'vanta'); assert.equal(state.credits, 1500);
  assert.equal(buyCar(state, 'atlas').ok, false); assert.equal(state.active, 'vanta');
});
test('saved builds are independent snapshots and survive a validated storage round trip', () => {
  const state = newState(); receiveGift(state, 'rocket', 'NightCrew'); installPart(state, 'paint', 2); installPart(state, 'wheels', 2);
  const saved = saveBuild(state, 'Night Shift'); const original = saved.project.color;
  state.projects.kaze.color = '#ffffff'; state.contributors[0].credits += 100;
  assert.equal(saved.project.color, original); assert.equal(saved.contributors[0].credits, 1500);
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(state))), state);
});
test('corrupt storage cannot install unowned parts or introduce invalid credit values', () => {
  const raw = newState(); raw.credits = -500; raw.projects.kaze.parts.turbo = 3; raw.projects.kaze.color = '<script>'; raw.active = '__proto__';
  const clean = restoreState(raw);
  assert.equal(clean.credits, 0); assert.equal(clean.active, 'kaze'); assert.equal(clean.projects.kaze.parts.turbo, 0); assert.match(clean.projects.kaze.color, /^#[0-9a-f]{6}$/);
  assert.deepEqual(restoreState({ version: 99 }), newState());
});
test('power, tires and nitrous materially affect the measured 400 m sprint', () => {
  const stock = newProject(), turbo = newProject(), tuned = newProject();
  turbo.parts.turbo = 3;
  tuned.parts.turbo = 3; tuned.parts.wheels = 3; tuned.parts.tires = 3; tuned.parts.suspension = 3; tuned.parts.nitrous = 3; tuned.parts.ecu = 2; tuned.parts.cooling = 2;
  const baseRun = sprint(stock), turboRun = sprint(turbo), tunedRun = sprint(tuned), boostedRun = sprint(tuned, true);
  assert.ok(turboRun.time < baseRun.time, 'more power should reduce sprint time');
  assert.ok(tunedRun.zeroTo100 < turboRun.zeroTo100, 'tires and suspension should improve launch');
  assert.ok(boostedRun.time < tunedRun.time, 'nitrous should improve sprint time');
  assert.ok(boostedRun.nitrousUsed <= stats(tuned).nitrousSeconds + .011);
  assert.equal(baseRun.distance, 400); assert.ok(baseRun.time > 10 && baseRun.time < 30);
});
test('the expanded catalog contains thirteen independent upgrade categories', () => {
  assert.equal(CATEGORIES.length, 13);
  assert.equal(CATEGORIES.reduce((total,c) => total+c.items.filter(item => item.cost > 0).length,0),39);
});
test('Blender exports contain the named nodes consumed by Three.js and every category has a thumbnail', () => {
  const readModel = filename => { const file = fs.readFileSync(new URL(`../public/garage/assets/${filename}.glb`,import.meta.url)); assert.equal(file.toString('utf8',0,4),'glTF'); assert.equal(file.readUInt32LE(8),file.length); return JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12))); };
  const district=readModel('district'),parts=readModel('parts'),coach=readModel('coachwork');readModel('workshop');
  for(const id of ['workshop','parts','paint','dyno','track','showroom'])assert.ok(district.nodes.some(n=>n.name===`destination_${id}`));
  assert.ok(coach.nodes.some(n=>n.name==='body_shell'));
  for(const cat of CATEGORIES){assert.ok(parts.nodes.some(n=>n.name===`part_${cat.id}`));const png=fs.readFileSync(new URL(`../public/garage/assets/part-${cat.id}.png`,import.meta.url));assert.equal(png.readUInt32BE(16),360);assert.equal(png.readUInt32BE(20),240);}
});
test('an old garage migrates without losing credits, cars, grip, or showroom builds', () => {
  const old = { version: 1, credits: 1234, active: 'kaze', projects: { kaze: { parts: { wheels: 2, turbo: 3 }, owned: { wheels:[0,2], turbo:[0,3] }, spent: 6300, best: 12.9 } }, collection:[], totalRuns: 2 };
  const state = restoreState(old);
  assert.equal(state.version,2);assert.equal(state.credits,1234);assert.equal(state.projects.kaze.parts.wheels,2);assert.equal(state.projects.kaze.parts.tires,2);
  assert.equal(state.projects.kaze.parts.ecu,2);assert.equal(state.projects.kaze.parts.cooling,2);assert.equal(state.projects.kaze.best,12.9);assert.equal(state.xp,120);
});
test('supporting-part requirements prevent invalid purchases and removing required equipment', () => {
  const state = newState();state.credits=20000;
  const before=JSON.stringify(state);assert.equal(installPart(state,'turbo',3).ok,false);assert.equal(JSON.stringify(state),before);
  assert.equal(installPart(state,'ecu',2).ok,true);assert.equal(installPart(state,'cooling',2).ok,true);assert.equal(installPart(state,'turbo',3).ok,true);
  const credits=state.credits;assert.equal(installPart(state,'cooling',0).ok,false);assert.equal(state.credits,credits);assert.equal(state.projects.kaze.parts.cooling,2);
});
test('setup values are bounded and short gearing trades top speed for launch delivery', () => {
  const state=newState();const stock=stats(state.projects.kaze);
  applyTune(state,{boost:999,gearing:999,camber:-4,stance:900});const tuned=stats(state.projects.kaze);
  assert.equal(state.projects.kaze.tune.boost,1.2);assert.equal(state.projects.kaze.tune.gearing,1.15);assert.equal(state.projects.kaze.tune.camber,0);assert.equal(state.projects.kaze.tune.stance,40);assert.ok(tuned.maxSpeed<stock.maxSpeed);
});
test('boost settings cannot produce negative heat or add power to an engine without a turbo', () => {
  const state = newState(), base=stats(state.projects.kaze);
  for(const boost of [.8,1.2]){ applyTune(state,{boost,gearing:1,camber:0,stance:0});const setup=stats(state.projects.kaze);assert.equal(setup.hp,base.hp);assert.equal(setup.heatRate,base.heatRate);assert.ok(setup.heatRate>0); }
});
test('contracts and first dyno reputation can only be awarded once', () => {
  const state=newState();assert.equal(claimContract(state,'dyno').ok,false);
  assert.equal(recordDyno(state),60);assert.equal(recordDyno(state),0);
  assert.equal(claimContract(state,'dyno').ok,true);const credits=state.credits,xp=state.xp;
  assert.equal(claimContract(state,'dyno').ok,false);assert.equal(state.credits,credits);assert.equal(state.xp,xp);
  state.xp=300;assert.equal(reputation(state),2);
});
test('heat and wear respond to cooling, while service charges the exact repair cost', () => {
  const state=newState(),hot=newProject(),cool=newProject();hot.parts.turbo=3;cool.parts.turbo=3;cool.parts.cooling=3;
  const hotRun=sprint(hot,true),coolRun=sprint(cool,true);assert.ok(hotRun.temperature>coolRun.temperature);
  rewardRun(state,sprint(state.projects.kaze));assert.ok(state.projects.kaze.condition<100);
  const expected=Math.ceil((100-state.projects.kaze.condition)*12),before=state.credits;
  const result=serviceCar(state);assert.equal(result.ok,true);assert.equal(state.credits,before-expected);assert.equal(state.projects.kaze.condition,100);assert.equal(serviceCar(state).ok,false);
});
test('the 800 m event pays its own reward and preserves the 400 m record', () => {
  const state=newState();state.projects.kaze.best=14;
  const run=newRun('highway');for(let i=0;i<6000&&!run.finished;i++)advanceRun(run,state.projects.kaze,.01);
  assert.equal(run.distance,800);assert.equal(rewardRun(state,run),650);assert.equal(state.projects.kaze.best,14);assert.equal(state.projects.kaze.bestHighway,run.time);assert.equal(state.xp,90);
});
test('only a finished run can earn credits and each run is paid once', () => {
  const state = newState(), pending = newRun();
  assert.equal(rewardRun(state, pending), 0);
  const run = sprint(state.projects.kaze);
  assert.equal(rewardRun(state, run), 400); assert.equal(rewardRun(state, run), 0);
  assert.equal(state.credits, 3000); assert.equal(state.totalRuns, 1); assert.equal(state.projects.kaze.runs, 1); assert.equal(state.projects.kaze.best, run.time);
});
