import test from 'node:test';
import assert from 'node:assert/strict';
import {warpPoint,warpJacobian,warpHeading,warpPhases,WARP_TERMS} from '../public/js/warp.js';
import {Simulation,LANES} from '../public/js/simulation.js';

test('curved-city warp is smooth, never folds and bends straight roads into real curves',()=>{
  let minDet=Infinity,maxShift=0;
  for(let x=-6000;x<=6000;x+=37)for(let z=-6000;z<=6000;z+=41){
    const j=warpJacobian(x,z),w=warpPoint(x,z);minDet=Math.min(minDet,j.det);maxShift=Math.max(maxShift,Math.hypot(w.x-x,w.z-z));
  }
  assert.ok(minDet>.75,`Jacobian determinant ${minDet} must stay well above zero`);
  assert.ok(maxShift<70,`displacement ${maxShift} stays bounded`);
  // A grid avenue (x = 480) must visibly curve: lateral swing > 15 m, tightest radius > 250 m.
  let minX=Infinity,maxX=-Infinity,minRadius=Infinity;
  for(let z=0;z<3000;z+=4){
    const a=warpPoint(480,z-4),b=warpPoint(480,z),c=warpPoint(480,z+4);minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x);
    const ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z),ac=Math.hypot(c.x-a.x,c.z-a.z),cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
    if(cross>1e-9)minRadius=Math.min(minRadius,ab*bc*ac/(2*cross));
  }
  assert.ok(maxX-minX>15,`avenue swings ${maxX-minX} m`);assert.ok(minRadius>250,`tightest bend radius ${minRadius} m`);
});

test('shader phases reproduce the JS warp far from the start (floating origin)',()=>{
  const ox=240*913,oz=-240*1177,{px,pz}=warpPhases(ox,oz);
  for(const [lx,lz] of [[3,-7],[120,88],[-210,64]]){
    let dx=0,dz=0;WARP_TERMS.x.forEach(([a,kz,kx],i)=>dx+=a*Math.sin(lz*kz+lx*kx+px[i]));WARP_TERMS.z.forEach(([a,kx,kz],i)=>dz+=a*Math.sin(lx*kx+lz*kz+pz[i]));
    const w=warpPoint(ox+lx,oz+lz);assert.ok(Math.abs(w.x-(ox+lx+dx))<1e-6&&Math.abs(w.z-(oz+lz+dz))<1e-6);
  }
  // Heading follows the warped road tangent.
  const h=warpHeading(480,900,0),a=warpPoint(480,901),b=warpPoint(480,899);
  const fx=-Math.sin(h),fz=-Math.cos(h),tx=b.x-a.x,tz=b.z-a.z,len=Math.hypot(tx,tz);assert.ok(fx*tx/len+fz*tz/len>.9999);
});

function calmSim(){
  const sim=new Simulation(21);sim.setRoute('highway');sim.cars=[];sim.maxCars=0;sim.setMode('fast');
  // Park the car on a long highway stretch, far from any signal or turn.
  const j=sim.route.junctions;let s=200;for(;s<3000;s+=10){if(sim.route.sample(s).kind==='highway'&&!j.some(k=>Math.abs(k.s-s)<400))break;}
  sim.s=sim.prevS=s;return sim;
}

test('autodrive in the second lane indicates right, then returns to the first lane',()=>{
  const sim=calmSim();sim.lane=1;sim.offset=sim.prevOffset=LANES[1];sim.speed=30;sim.cooldown=0;
  const actions=[];let firstBlink=-1,firstMove=-1,events=[];sim.onEvent=(t,m)=>events.push(t);
  for(let i=0;i<60*12;i++){sim.update(1/60);if(!actions.includes(sim.action))actions.push(sim.action);
    if(firstBlink<0&&sim.indicator===1)firstBlink=sim.time;if(firstMove<0&&Math.abs(sim.offset-LANES[1])>.01)firstMove=sim.time;}
  assert.equal(sim.lane,2,'ends in the first (rightmost) lane');assert.equal(sim.offset,LANES[2]);
  assert.ok(firstBlink>0&&firstMove>0&&firstMove-firstBlink>1.2,`indicates ${firstMove-firstBlink}s before moving`);
  assert.ok(actions.indexOf('SIGNALLING RIGHT')>=0&&actions.indexOf('KEEPING RIGHT')>actions.indexOf('SIGNALLING RIGHT'),actions.join(','));
  assert.ok(events.includes('keepright'));assert.equal(sim.indicator,0,'indicator cancels after the move');
});

test('keep-right waits while the first lane is occupied, and overtakes indicate before moving',()=>{
  const sim=calmSim();sim.lane=1;sim.offset=sim.prevOffset=LANES[1];sim.speed=30;
  // A car alongside in the first lane blocks the move.
  sim.cars.push({id:900,s:sim.s+2,prevS:sim.s+2,lane:2,offset:LANES[2],prevOffset:LANES[2],change:null,cooldown:99,speed:30,cruise:30,opposite:false,passed:false,color:0,style:0});
  for(let i=0;i<60*4;i++){sim.update(1/60);assert.ok(sim.offset<=LANES[1]+1e-9,'never moves into an occupied lane');sim.cars[0].s=sim.s+2;sim.cars[0].speed=sim.speed;}
  // Overtake: slow car ahead in lane 1 -> signal left before the lateral move.
  const o=calmSim();o.lane=1;o.offset=o.prevOffset=LANES[1];o.speed=28;
  o.cars.push({id:901,s:o.s+45,prevS:o.s+45,lane:1,offset:LANES[1],prevOffset:LANES[1],change:null,cooldown:99,speed:12,cruise:12,opposite:false,passed:false,color:0,style:0});
  o.cars.push({id:902,s:o.s+60,prevS:o.s+60,lane:2,offset:LANES[2],prevOffset:LANES[2],change:null,cooldown:99,speed:12,cruise:12,opposite:false,passed:false,color:0,style:0});
  let blink=-1,move=-1;for(let i=0;i<60*6;i++){o.update(1/60);if(blink<0&&o.indicator===-1)blink=o.time;if(move<0&&o.offset<LANES[1]-.01)move=o.time;}
  assert.ok(blink>0&&move>blink+.3,`overtake indicated ${move-blink}s before moving`);
});

test('traffic indicates before keeping right',()=>{
  const sim=calmSim();sim.speed=0;sim.s-=300;sim.prevS=sim.s;
  const c={id:5,s:sim.s+150,prevS:sim.s+150,lane:0,offset:LANES[0],prevOffset:LANES[0],change:null,cooldown:0,speed:25,cruise:25,opposite:false,passed:false,color:0,style:0};sim.cars.push(c);
  let blink=-1,move=-1;for(let i=0;i<60*8;i++){sim.update(1/60);const ind=Simulation.carIndicator(c);if(blink<0&&ind===1)blink=sim.time;if(move<0&&c.offset>LANES[0]+.01)move=sim.time;}
  assert.ok(blink>0&&move>blink+1,`traffic indicated ${move-blink}s before moving`);assert.equal(c.lane,1);
});
