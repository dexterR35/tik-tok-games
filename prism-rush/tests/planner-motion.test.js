import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, moves } from '../public/engine.js';
import { Room } from '../public/room.js';
import { MOTION, dropTiming, sampleDrop, fallDuration } from '../public/motion.js';

test('smart choice maximizes the stated cascade-score and power utility across every legal swap', () => {
  for (const seed of [41, 991, 732941, 773]) {
    const engine = new Engine(seed), before = engine.export(), candidates = moves(engine.board), best = engine.bestMove();
    const forecasts = candidates.map(move => engine.forecast({ type: 'move', a: move.a, b: move.b }));
    assert.equal(best.forecast, Math.max(...forecasts.map(f => f.utility)));
    assert.equal(best.analysis.scanned, candidates.length);
    assert.equal(best.analysis.strong, candidates.filter(m => m.hit.births.length).length);
    assert.deepEqual(engine.export(), before);
  }
});
test('meteor compares all 56 cells and prism compares all 336 cell/color choices without changing RNG', () => {
  const engine = new Engine(41), before = engine.export();
  for (const type of ['meteor','prism']) {
    const best = engine.bestPower(type); let maximum = -1;
    for (const color of type === 'prism' ? [0,1,2,3,4,5] : [null]) for (let index = 0; index < 56; index++) maximum = Math.max(maximum,engine.forecast({ type,index,color }).utility);
    assert.equal(best.analysis.utility,maximum); assert.equal(best.analysis.scanned,type === 'meteor' ? 56 : 336);
  }
  assert.deepEqual(engine.export(),before);
});
test('a voted prism color restricts optimization to that color', () => {
  const engine = new Engine(991), best = engine.bestPower('prism',4);
  assert.equal(best.color,4); assert.equal(best.analysis.scanned,56); assert.equal(best.analysis.voted,true);
});
test('forecast equals actual settled points, gems, powers and waves for every action type', () => {
  for (const type of ['tap','rose','meteor','prism','supernova']) {
    const room = new Room({seed:41,now:1000}); room.settings.auto = false; room.settings.demo = false;
    room.enqueue(type,{id:'test',name:'Planner test'});
    for (let i = 0; i < 1000 && !room.lastResult; i++) room.step(.05,room.now+50);
    assert.ok(room.lastResult,`${type} settled`);
    for (const key of ['points','cleared','created','waves','activated']) assert.equal(room.lastResult[key],room.analysis[key],`${type} ${key}`);
    assert.equal(room.lastResult.predicted,room.lastResult.points);
  }
});
test('votes arriving during a prism animation apply to the next prism, keeping the current forecast exact', () => {
  const room = new Room({seed:41,now:1000}); room.settings.auto = false; room.settings.demo = false;
  room.incoming({type:'chat',user:{id:'v'},text:'red'}); room.enqueue('prism',{id:'v',name:'Viewer'});
  while (room.phase.type !== 'power') room.step(.05,room.now+50);
  assert.equal(room.current.powerColor,0);
  room.incoming({type:'chat',user:{id:'v'},text:'blue'});
  while (!room.lastResult) room.step(.05,room.now+50);
  assert.equal(room.lastResult.points,room.lastResult.predicted); assert.equal(room.votes.get('v'),4);
});
test('shorter animations leave every drop fully landed before the next logical wave', () => {
  for (let distance=1;distance<=8;distance++) for (let x=0;x<7;x++) {
    const drop={x,from:7-distance,to:7}, timing=dropTiming(drop), duration=fallDuration([drop]);
    assert.ok(duration<=420); assert.equal(sampleDrop(drop,0).progress,0);
    let previous=0;
    for (let ms=0;ms<=duration;ms++) {
      const frame=sampleDrop(drop,ms); assert.ok(Number.isFinite(frame.progress)); assert.ok(frame.progress>=previous); assert.ok(frame.scaleX>0 && frame.scaleY>0); previous=frame.progress;
    }
    const final=sampleDrop(drop,duration); assert.equal(final.progress,1); assert.equal(final.offset,0); assert.equal(final.scaleX,1); assert.equal(final.scaleY,1); assert.equal(final.done,true); assert.ok(duration>=timing.total);
  }
  assert.ok(MOTION.burst<430); assert.ok(MOTION.swap<300); assert.ok(MOTION.idle<1000);
});
test('refills form a contiguous column directly above the board, with no eight-row teleport for a single vacancy', () => {
  for (let missing=1;missing<=8;missing++) {
    const engine=new Engine(41); engine.clear({clear:Array.from({length:missing},(_,i)=>i*7),births:[]});
    const drops=engine.collapse(), spawned=drops.filter(d=>d.x===0 && d.from<0);
    assert.equal(spawned.length,missing); assert.deepEqual(spawned.map(d=>d.from).sort((a,b)=>a-b),Array.from({length:missing},(_,i)=>i-missing));
    for(const drop of spawned) assert.equal(drop.to-drop.from,missing);
    assert.ok(fallDuration(drops)<=420);
  }
});
test('restoring mid-drop preserves elapsed animation time instead of restarting a shortened fall', () => {
  const room = new Room({seed:41,now:1000}); room.settings.auto=false; room.settings.demo=false; room.enqueue('meteor',{id:'v',name:'Viewer'});
  while(room.phase.type!=='fall') room.step(.05,room.now+50);
  room.step(.1,room.now+100);
  const elapsed=room.now-room.phase.start, saved=JSON.parse(JSON.stringify(room.export())), restored=new Room({saved,now:100000});
  assert.equal(restored.now-restored.phase.start,elapsed); assert.equal(restored.phase.duration,room.phase.duration);
});
