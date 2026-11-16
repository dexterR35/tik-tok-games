import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RaceEngine,giftTier,CARS,MAX_TAP_POWER,crowdDivisor} from '../dist/rules.js';
import {GiftLedger} from '../gift-ledger.mjs';

export function simulate({rate=0,duration=30,car=0,difficulty='hard',stop=Infinity,boost,audience=0}={}){
  const engine=new RaceEngine({duration,car,difficulty,audience});engine.update(3);
  for(let frame=0;engine.phase==='racing'&&frame<5000;frame++){
    if(rate&&frame%Math.round(60/rate)===0&&engine.elapsed<stop)engine.tap();
    boost?.(engine,frame);engine.update(1/60);
  }
  return engine;
}
test('default is thirty seconds; idle crowd loses even with the Bugatti',()=>{for(const car of [0,3]){const e=simulate({car});assert.notEqual(e.position,1);assert.equal(e.elapsed,30);assert.equal(e.order[0].id,'viper');}assert.equal(new RaceEngine({duration:20}).duration,30);});
test('continuous free taps can win both durations against both difficulties',()=>{for(const duration of [30,60])for(const difficulty of ['hard','relentless']){const e=simulate({duration,difficulty,rate:5});assert.equal(e.position,1,`${duration}s ${difficulty}`);assert.equal(e.giftCount,0);assert.ok(e.result.points>=400);}});
test('rivals stay close and recover when the crowd stops tapping',()=>{const full=simulate({rate:5,duration:60});assert.ok(full.cars[0].distance-full.cars[1].distance<40);const stopped=simulate({rate:7,stop:18});assert.notEqual(stopped.position,1);assert.ok(stopped.tapPower<1);});
test('a rival behind the player accelerates without teleporting',()=>{const e=new RaceEngine();e.update(13);e.cars[0].distance=e.cars[1].distance+90;e.cars[1].speed=230;const previous=e.cars[1].distance;e.update(.1);assert.ok(e.cars[1].catchup>40);assert.ok(e.cars[1].speed>230);assert.ok(e.cars[1].distance-previous<10);});
test('well-timed mega gift can turn a loss into victory',()=>{const e=simulate({boost:(e,f)=>{if(f===1200)e.gift('lion');}});assert.equal(e.position,1);assert.equal(e.taps,0);});
test('small boost helps without guaranteeing a win',()=>{const base=simulate();const boosted=simulate({boost:(e,f)=>{if(f===300)e.gift('rose');}});assert.ok(boosted.cars[0].distance>base.cars[0].distance);assert.notEqual(boosted.position,1);});
test('wall-clock jumps terminate races once, preserving final positions',()=>{for(const duration of [30,60]){const e=new RaceEngine({duration});e.update(3);e.update(duration+10);assert.equal(e.elapsed,duration);assert.equal(e.phase,'finished');assert.ok(e.phaseTime>=9.99);const result=e.result,distances=e.cars.map(c=>c.distance);assert.equal(e.tap(),0);assert.equal(e.gift('lion'),false);e.update(120);assert.equal(e.result,result);assert.deepEqual(e.cars.map(c=>c.distance),distances);}});
test('streak gift effects are bounded to four types and have a fixed expiry',()=>{const e=new RaceEngine();e.update(3);for(let i=0;i<10000;i++)e.gift(['rose','energy','galaxy','lion'][i%4],100);assert.equal(e.boosts.length,4);assert.equal(e.boostSpeed,210);e.update(14);assert.equal(e.boostSpeed,0);});
test('inactivity drops momentum quickly; crowd size normalises LIVE likes',()=>{const e=new RaceEngine();e.update(3);e.tap(100);assert.equal(e.tapPower,MAX_TAP_POWER);e.update(5);assert.ok(e.tapPower<2);for(const audience of [1000,2000,10000]){const race=new RaceEngine({audience});const gain=race.tap(crowdDivisor(audience)*5,{live:true});assert.equal(gain,7.5);assert.equal(race.taps,crowdDivisor(audience)*5);}});
test('all unlocks use distinct detailed model files',()=>{assert.equal(new Set(CARS.map(c=>c.asset)).size,4);assert.deepEqual(CARS.map(c=>c.price),[0,750,2000,5000]);});
test('coin values route to the correct boost tier',()=>{assert.deepEqual([1,9,10,99,100,999,1000,29999].map(giftTier),['rose','rose','energy','energy','galaxy','galaxy','lion','lion']);});
test('gift streaks count only deltas and ignore repeated final messages',()=>{const ledger=new GiftLedger(),gift={user:{userId:'123',nickname:'Test'},giftId:1,giftDetails:{giftType:1,diamondCount:1}};assert.equal(ledger.consume({...gift,repeatCount:1,repeatEnd:false}).count,1);assert.equal(ledger.consume({...gift,repeatCount:3,repeatEnd:false}).count,2);assert.equal(ledger.consume({...gift,repeatCount:3,repeatEnd:true}),null);assert.equal(ledger.consume({...gift,repeatCount:3,repeatEnd:true}),null);assert.equal(ledger.consume({...gift,repeatCount:1,repeatEnd:false}).count,1);});
test('duplicate message history expires and memory is bounded',()=>{const ledger=new GiftLedger();const gift={msgId:'abc',user:{userId:'123'},giftId:1,giftDetails:{giftType:0,diamondCount:100},repeatCount:1};assert.equal(ledger.consume(gift,0).coins,100);assert.equal(ledger.consume(gift,100),null);assert.equal(ledger.consume(gift,61000).count,1);for(let i=0;i<60000;i++)ledger.consume({...gift,msgId:`event-${i}`},62000);assert.ok(ledger.messages.size<=50000);});
