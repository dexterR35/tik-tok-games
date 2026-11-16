import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CrowdBuffer} from '../crowd-buffer.mjs';
import {RaceEngine,advanceCrowdSimulation} from '../dist/rules.js';

test('1k, 2k and 10k viewers can feed a full race with no discarded likes',()=>{
  for(const audience of [1000,2000,10000]){
    const buffer=new CrowdBuffer(),race=new RaceEngine({audience});race.update(3);let total=0,packets=0;
    // Worst-case 5 likes/sec/viewer, forwarded as one bounded event every 100ms.
    for(let tick=0;tick<300;tick++){
      const eventsPerTick=audience/2;
      for(let i=0;i<eventsPerTick;i++){buffer.like(1,'viewer');total++;}
      const batch=buffer.flush();assert.equal(batch.length,1);packets++;
      for(const event of batch)race.tap(event.count,{live:true});race.update(.1);
    }
    assert.equal(race.taps,total);assert.equal(race.phase,'finished');assert.equal(race.elapsed,30);assert.equal(packets,300);assert.equal(race.cars.length,4);assert.equal(buffer.likes,0);
  }
});
test('a 10k-person gift storm keeps only four gift accumulators',()=>{const buffer=new CrowdBuffer();for(let i=0;i<10000;i++)buffer.gift({coins:[1,10,100,1000][i%4],count:2,user:`viewer-${i}`});assert.equal(buffer.gifts.size,4);const events=buffer.flush();assert.equal(events.length,4);assert.equal(events.reduce((sum,event)=>sum+event.count,0),20000);assert.equal(buffer.gifts.size,0);});
test('background timer throttling does not reduce simulated crowd participation',()=>{const a=new RaceEngine({duration:60,audience:10000,difficulty:'relentless'}),b=new RaceEngine({duration:60,audience:10000,difficulty:'relentless'});a.update(3);b.update(3);const stateA={viewers:10000,remainder:0},stateB={viewers:10000,remainder:0};for(let i=0;i<1200;i++)advanceCrowdSimulation(a,.05,stateA);for(let i=0;i<60;i++)advanceCrowdSimulation(b,1,stateB);assert.equal(a.phase,'finished');assert.equal(b.phase,'finished');assert.equal(a.taps,90000);assert.equal(b.taps,90000);assert.equal(a.position,1);assert.equal(b.position,1);assert.ok(Math.abs(a.cars[0].distance-b.cars[0].distance)<.001);});
