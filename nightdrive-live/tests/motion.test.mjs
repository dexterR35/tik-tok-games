import test from 'node:test';
import assert from 'node:assert/strict';
import {Route,Simulation,LANES} from '../public/js/simulation.js';
import {FrameClock,interpolateVehicle,lerpAngle,wrapAngle} from '../public/js/motion.js';
import {planCityCell} from '../public/js/city-plan.js';

test('turn headings change continuously through sample boundaries and straight joins',()=>{
  const route=new Route(4316);const junction=route.junctions.find(j=>j.turn!=='straight');let last=route.sample(junction.s-10).heading,maxDelta=0,total=0;
  for(let s=junction.s-10;s<junction.endS+12;s+=.05){const heading=route.sample(s).heading,delta=Math.abs(wrapAngle(heading-last));maxDelta=Math.max(maxDelta,delta);total+=delta;last=heading;}
  assert.ok(total>1.5&&total<1.7,`one quarter-turn, got ${total}`);assert.ok(maxDelta<.006,`heading jump ${maxDelta} rad per 5 cm`);
  const end=route.sample(junction.endS),after=route.sample(junction.endS+.02);assert.ok(Math.abs(wrapAngle(end.heading-after.heading))<.001);
  for(let s=junction.s;s<junction.endS;s+=.2)for(const offset of [...LANES,...LANES.map(x=>-x)]){const p=route.sample(s,offset),q=route.sample(s+.05,offset);assert.ok((q.x-p.x)*p.dx+(q.z-p.z)*p.dz>.025,'offset lane must keep moving forward through a bend');}
});
test('fixed physics produces the same journey at 30, 60 and 144 Hz',()=>{
  const runs=[];for(const fps of [30,60,144]){const sim=new Simulation(43),clock=new FrameClock();clock.tick(0,dt=>sim.update(dt));for(let i=1;i<=fps*20;i++)clock.tick(i*1000/fps,dt=>sim.update(dt));runs.push(sim);}
  for(const sim of runs){assert.ok(Math.abs(sim.s-runs[0].s)<1.1);assert.ok(Math.abs(sim.time-runs[0].time)<.02);}
  assert.deepEqual(interpolateVehicle({prevS:10,s:12,prevOffset:2,offset:4},.5),{s:11,offset:3});assert.ok(Math.abs(wrapAngle(lerpAngle(Math.PI-.02,-Math.PI+.02,.5)-Math.PI))<1e-6);
});
test('asphalt junctions and road runs have no overlapping top surfaces',()=>{
  const plan=planCityCell(0,0),data=plan.groups.asphalt,boxes=[];for(let k=0;k<data.length;k+=9)boxes.push({x:data[k],z:data[k+2],w:data[k+3],d:data[k+5]});
  for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const xOverlap=(boxes[a].w+boxes[b].w)/2-Math.abs(boxes[a].x-boxes[b].x),zOverlap=(boxes[a].d+boxes[b].d)/2-Math.abs(boxes[a].z-boxes[b].z);assert.ok(xOverlap<=0||zOverlap<=0,'coplanar road overlap');}
  for(const group of Object.values(plan.groups))for(const value of group)assert.ok(Number.isFinite(value));
});
