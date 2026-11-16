import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,Route,LANES,CAR_LENGTH,idmAcceleration,signalPhase,smooth} from '../public/js/simulation.js';
import {LiveState} from '../live-state.mjs';

// Independent world-space oriented boxes also detect collisions on curved lanes,
// where an arc-length separation alone would overestimate physical clearance.
function bodiesOverlap(a,b){
  const dx=b.x-a.x,dz=b.z-a.z;
  for(const axis of [[a.dx,a.dz],[-a.dz,a.dx],[b.dx,b.dz],[-b.dz,b.dx]]){
    const radiusA=2.4*Math.abs(a.dx*axis[0]+a.dz*axis[1])+1.02*Math.abs(-a.dz*axis[0]+a.dx*axis[1]);
    const radiusB=2.4*Math.abs(b.dx*axis[0]+b.dz*axis[1])+1.02*Math.abs(-b.dz*axis[0]+b.dx*axis[1]);
    if(Math.abs(dx*axis[0]+dz*axis[1])>=radiusA+radiusB)return false;
  }return true;
}

test('route geometry stays continuous through streaming and pruning',()=>{
  const route=new Route(65);route.extend(50000);let previous=route.sample(0);
  for(let s=1;s<49000;s+=1){const p=route.sample(s);assert.ok(Math.hypot(p.x-previous.x,p.z-previous.z)<1.02);assert.ok(Number.isFinite(p.heading));previous=p;}
  const before=route.sample(48000);route.prune(48000);assert.deepEqual(route.sample(48000),before);assert.ok(route.points.length<1800);route.extend(54000);assert.ok(route.sample(53500).z<before.z);
});
test('IDM responds to stopped traffic and smooth lane change has zero endpoint slope',()=>{
  assert.ok(idmAcceleration(30,50,15,0)<-5);assert.ok(idmAcceleration(10,50,1000,30)>0);
  assert.equal(smooth(0),0);assert.equal(smooth(1),1);assert.ok(smooth(.001)<1e-7);assert.ok(1-smooth(.999)<1e-7);
});
test('route preference replans unseen roads and keeps the visible path intact',()=>{
  const sim=new Simulation(15),before=[];for(let d=0;d<450;d+=15)before.push(sim.route.sample(sim.s+d));
  sim.setRoute('city');for(let d=0;d<450;d+=15)assert.deepEqual(sim.route.sample(sim.s+d),before[d/15]);
  assert.equal(sim.route.sample(sim.s+1100).kind,'city');
  sim.setRoute('highway');assert.equal(sim.route.sample(sim.s+1100).kind,'highway');
});
test('all modes maintain body clearance through ten simulated minutes, boosts, and turns',()=>{
  for(const mode of ['safe','fast','hardcore']){
    const sim=new Simulation(4316);sim.setMode(mode);let minimum=Infinity,turns=0,stops=0,lastHeading=sim.position.heading;
    for(let tick=0;tick<60*600;tick++){
      if(tick%1800===0)sim.addBoost(20);sim.update(1/60);
      assert.ok(Number.isFinite(sim.s)&&sim.speed>=0&&sim.speed<90);
      assert.ok(sim.offset>=LANES[0]&&sim.offset<=LANES[2]);
      const pose=sim.position;
      for(const c of sim.cars){
        if(Math.abs(c.s-sim.s)<22){const other=sim.route.sample(c.s,LANES[c.lane]*(c.opposite?-1:1));assert.equal(bodiesOverlap(pose,other),false,`${mode} physical body overlap at ${sim.time.toFixed(1)}s`);}
        if(c.opposite||Math.abs(LANES[c.lane]-sim.offset)>2.15)continue;const gap=Math.abs(c.s-sim.s)-CAR_LENGTH;minimum=Math.min(minimum,gap);assert.ok(gap>=-.05,`${mode} overlap ${gap} at ${sim.time.toFixed(1)}s with car ${c.id}`);
      }
      turns+=Math.abs(Math.atan2(Math.sin(sim.position.heading-lastHeading),Math.cos(sim.position.heading-lastHeading)));lastHeading=sim.position.heading;
      if(sim.action==='RED LIGHT'&&sim.speed<.5)stops++;
    }
    assert.ok(sim.distance>2500,`${mode} must not deadlock`);assert.ok(turns>3,`${mode} must navigate corners`);assert.ok(stops>0,`${mode} must stop at city signals`);assert.ok(sim.route.points.length<2800);
    console.log(`${mode}: ${(sim.distance/1000).toFixed(2)}km, ${sim.overtakes} overtakes, minimum body clearance ${minimum.toFixed(2)}m`);
  }
});
test('red signal stops the car before the stop line even with a boost',()=>{
  const sim=new Simulation(5);sim.cars=[];sim.maxCars=0;sim.setMode('hardcore');sim.addBoost(30);
  const j=sim.route.junctions.find(j=>j.kind==='city');sim.s=j.s-65;sim.speed=16;sim.time=21-j.id*3.7;while(sim.time<0)sim.time+=30;
  assert.equal(signalPhase(sim.time,j.id),'red');for(let i=0;i<360;i++){sim.update(1/60);assert.ok(sim.s<j.s-.5);}
  assert.ok(sim.speed<6);
});
test('likes, timer caps, expired boosts and gift streak deduplication',()=>{
  let now=1000;const state=new LiveState(()=>now);state.event('like',{count:250});assert.equal(state.fuel,50);assert.equal(state.likes,250);assert.equal(state.snapshot().boostSeconds,10);
  state.event('gift',{seconds:1000});state.event('gift',{seconds:30});assert.equal(state.snapshot().boostSeconds,60);now+=61000;assert.equal(state.snapshot().boostSeconds,0);
  const gift={groupId:'combo',giftId:1,user:{userId:'a'},gift:{type:1,name:'Rose',diamondCount:1},repeatCount:8,repeatEnd:0};
  assert.equal(state.normalizeGift(gift),null);const end={...gift,repeatEnd:1};assert.ok(state.normalizeGift(end));assert.equal(state.normalizeGift(end),null);assert.throws(()=>state.event('mode',{mode:'invalid'}));
});
