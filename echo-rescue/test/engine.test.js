import test from 'node:test';
import assert from 'node:assert/strict';
import {EchoGame,EFFECTS,MAX_HEARTS,normalizeGift} from '../public/engine.js';
import {WORLDS,followPose,trackPoint,trackTangent,sanitizeProgress} from '../public/worlds.js';
import {createDemoState,runDemo} from '../public/demo.js';
import {PerspectiveCamera,Vector3} from '../public/vendor/three.core.js';

function demoRescue(game){const state=createDemoState();for(let i=0;i<game.duration*60&&!game.robot.rescued&&game.phase==='running';i++){runDemo(game,state);game.step(1/60);}return game.robot.rescued;}

test('fresh actions return once at the recorded time and never create recursive echoes',()=>{
  const events=[],game=new EchoGame({onEvent:e=>{if(e.type==='effect')events.push(e.event);}});
  game.start();game.step(4);game.send('cube','Ada');const original={...game.recording[0]};game.step(game.duration-game.time+3.05);
  game.step(3.8);assert.equal(game.echoes,0);game.step(.3);assert.equal(game.echoes,1);
  assert.equal(events[1].at,original.at);assert.equal(events[1].viewer,'Ada');assert.equal(events[1].echo,true);assert.equal(game.recording.length,0);
  game.step(game.duration-game.time+3.05);assert.equal(game.previous.length,0);game.step(10);assert.equal(game.echoes,1);
});

test('one bridge gift builds one piece and advances the robot only onto supported ground',()=>{
  const g=new EchoGame();g.start();g.step(8);const gap=g.gaps[0];assert.equal(g.robot.waiting,true);assert.equal(g.robot.x,gap.from-14);
  g.send('cube');g.step(2);assert.equal(g.bridgeAt(gap),false);assert.ok(g.robot.x>gap.from);assert.ok(g.robot.x<gap.to);assert.equal(g.robot.waiting,true);
  g.send('cube');g.step(2);assert.equal(g.bridgeAt(gap),true);assert.ok(g.robot.x>gap.to);
});

test('bridge pieces persist for the rest of the round instead of expiring before the robot arrives',()=>{
  const g=new EchoGame();g.send('cube');g.send('cube');g.step(20);assert.equal(g.bridgeAt(g.gaps[0]),true);
});

test('a combo allocates separate pieces across upcoming gaps rather than overlapping the same bridge',()=>{
  const g=new EchoGame();g.send('cube');g.send('cube');g.send('cube');
  assert.deepEqual(g.recording.map(e=>[e.gapIndex,e.pieceIndex]),[[0,0],[0,1],[1,0]]);assert.equal(g.builtPieces,3);assert.equal(g.gifts,3);
});

test('spare building gifts are banked when the course is complete and survive a world warp',()=>{
  const g=new EchoGame();for(let i=0;i<g.totalPieces+2;i++)g.send('cube');assert.equal(g.parts,2);
  assert.equal(g.effects.filter(e=>e.banked).length,2);g.warp(1,{carryEchoes:true});assert.equal(g.parts,2);assert.ok(g.previous.length>0);
});

test('boost and shield gift streaks stack full duration instead of merely refreshing one effect',()=>{
  const g=new EchoGame();for(let i=0;i<3;i++)g.send('boost');for(let i=0;i<2;i++)g.send('shield');
  assert.equal(g.robot.boostUntil,12);assert.equal(g.robot.shieldUntil,12);g.step(1);g.send('boost');g.send('shield');
  assert.equal(g.robot.boostUntil,16);assert.equal(g.robot.shieldUntil,18);
});

test('life gifts restore actual health and bank hearts when already at maximum health',()=>{
  const g=new EchoGame();g.robot.hearts=1;g.send('heal');assert.equal(g.robot.hearts,2);
  for(let i=0;i<5;i++)g.send('heal');assert.equal(g.robot.hearts,MAX_HEARTS);assert.equal(g.robot.reserves,2);
});

test('a banked heart prevents an otherwise fatal hit and is consumed once',()=>{
  const g=new EchoGame();g.start();g.robot.hearts=1;g.robot.reserves=1;g.time=.2;g.robot.x=g.hazards[0].x-.5;g.step(.03);
  assert.equal(g.robot.hearts,1);assert.equal(g.robot.reserves,0);assert.equal(g.phase,'running');assert.equal(g.robot.damageTaken,1);
});

test('shields block hazard damage and hazards cannot damage repeatedly after the same crossing',()=>{
  const g=new EchoGame();g.start();g.time=.2;g.robot.x=g.hazards[0].x-.5;g.send('shield');g.step(.03);assert.equal(g.robot.hearts,3);
  const hit=new EchoGame();hit.start();hit.time=.2;hit.robot.x=hit.hazards[0].x-.5;hit.step(.03);assert.equal(hit.robot.hearts,2);hit.step(2);assert.equal(hit.robot.hearts,2);
});

test('failed long runs resume at a saved checkpoint with collected memories and damage history retained',()=>{
  const g=new EchoGame();g.start();g.checkpoint=g.checkpoints[1];g.robot.x=g.checkpoint+20;g.robot.memories.add(0);g.robot.damageTaken=2;g.finishLoop('SYSTEM OVERLOAD');g.step(3.1);
  assert.ok(g.robot.x>=g.checkpoint);assert.ok(g.robot.x>650);assert.equal(g.robot.hearts,3);assert.ok(g.robot.memories.has(0));assert.equal(g.robot.damageTaken,2);
});

test('healing does not fake a perfect no-damage score',()=>{
  const g=new EchoGame();g.start();g.robot.damageTaken=1;g.send('heal');assert.equal(demoRescue(g),true);assert.equal(g.lastStars,2);
});

test('checkpoint restarts do not turn a long run into a falsely short best time',()=>{
  const g=new EchoGame();g.start();g.runElapsed=40;g.checkpoint=g.checkpoints.at(-1);g.robot.x=g.checkpoint+1;g.finishLoop('SYSTEM OVERLOAD');g.step(3.1);
  g.robot.x=g.goal-.5;g.step(.03);assert.equal(g.robot.rescued,true);assert.ok(g.time<1);assert.ok(g.progress[g.level.id].bestTime>=40);
});

test('gravity jumps clear gaps and an early jump cannot leave the robot standing over the void',()=>{
  const g=new EchoGame();g.start();g.step(8);g.send('pulse');g.step(3.4);assert.ok(g.robot.x>g.gaps[0].to);
  const early=new EchoGame();early.send('pulse');early.step(10);assert.equal(early.robot.x,early.gaps[0].from-14);assert.equal(early.robot.waiting,true);
});

test('pause and invalid deltas cannot advance or corrupt the clock',()=>{
  const g=new EchoGame();g.start();g.step(3);g.start();const time=g.time,x=g.robot.x;g.step(100);assert.equal(g.time,time);assert.equal(g.robot.x,x);assert.equal(g.send('heal'),false);
  g.start();g.step(NaN);g.step(-1);g.step(Infinity);assert.equal(g.time,time);
});

test('one viewer has one replaceable route vote, applied after the round',()=>{
  const g=new EchoGame();g.vote('a','safe');g.vote('a','fast');g.vote('b','fast');g.vote('c','safe');assert.deepEqual(g.voteCounts,{safe:1,fast:2});assert.equal(g.vote('x','invalid'),false);
  g.start();g.finishLoop();g.step(3.1);assert.equal(g.route,'fast');assert.deepEqual(g.voteCounts,{safe:0,fast:0});
});

test('recording capacity is bounded and a deliberate reset clears current actions',()=>{
  const g=new EchoGame();for(let i=0;i<200;i++)g.send('heal');assert.equal(g.recording.length,160);assert.equal(g.gifts,160);assert.equal(g.send('invalid'),false);g.reset();assert.equal(g.phase,'idle');assert.equal(g.recording.length,0);assert.equal(g.parts,0);
});

test('normalization expands gift deltas and ignores zero-value finals',()=>{
  const mappings={cube:'Rose',heal:'Heart',pulse:'Finger Heart,Fingerheart',shield:'Hand Hearts',boost:'GG'};
  assert.equal(normalizeGift({type:'gift',coins:1,giftName:'Finger Heart'},mappings).type,'pulse');
  assert.equal(normalizeGift({type:'gift',coins:20,total:50,repeat:5,giftName:'Heart'},mappings).type,'heal');
  assert.equal(normalizeGift({type:'gift',coins:20,total:50,repeat:5,giftName:'Heart'},mappings).count,2);
  assert.equal(normalizeGift({type:'gift',coins:3,total:7,repeat:7,giftName:'Rose'},mappings).count,3);
  assert.equal(normalizeGift({type:'gift',coins:0,final:true},mappings),null);assert.equal(normalizeGift({type:'chat'},mappings),null);
});

test('world warps carry pending effects, adapt bridge coordinates and scale timing to the new course',()=>{
  const g=new EchoGame();g.start();g.step(5);g.send('cube','Ada');const oldDuration=g.duration,id=g.recording[0].id;g.warp(4,{carryEchoes:true});const e=g.previous.find(e=>e.id===id);
  assert.ok(Math.abs(e.at-5/oldDuration*g.duration)<.001);assert.ok(g.gaps[e.gapIndex]);assert.ok(e.x>g.gaps[e.gapIndex].from&&e.x<g.gaps[e.gapIndex].to);assert.equal(g.recording.length,0);
  assert.equal(g.warp(-1),false);assert.equal(g.warp(99),false);
});

test('all long-course checkpoints are on solid ground and away from active hazard positions',()=>{
  for(const [index,world]of WORLDS.entries())for(const route of ['safe','fast']){const g=new EchoGame();g.warp(index);g.route=route;assert.ok(g.goal>=3200);assert.ok(g.duration>=95);assert.ok(g.gaps.length>=5);for(const x of g.checkpoints){assert.ok(!g.gaps.some(gap=>x>gap.from&&x<gap.to),`${world.name} ${route} checkpoint ${x}`);assert.ok(g.hazards.every(h=>Math.abs(h.x-x)>=75));}}
});

for(const[index,world]of WORLDS.entries())for(const route of ['safe','fast'])test(`${world.name}: the ${route} long course is completable with the actual demo driver`,()=>{
  const g=new EchoGame();g.warp(index);g.route=route;assert.equal(demoRescue(g),true,`stopped at ${g.robot.x}, pieces ${g.builtPieces}/${g.totalPieces}`);assert.equal(g.robot.memories.size,3);assert.ok(g.progress[world.id].stars>=2);assert.ok(g.time<g.duration);assert.equal(g.builtPieces,g.totalPieces);
});

test('the third-person camera remains behind the character while keeping the route ahead in frame',()=>{
  for(const x of [65,500,1800,3500,5000]){const pose=followPose(x),p=trackPoint(x),t=trackTangent(x),camera=new PerspectiveCamera(50,9/16,.1,180);camera.position.set(pose.position.x,pose.position.y,pose.position.z);camera.lookAt(new Vector3(pose.target.x,pose.target.y,pose.target.z));camera.updateMatrixWorld();
    assert.ok((pose.position.x-p.x)*t.x+(pose.position.z-p.z)*t.z<0);
    const robot=new Vector3(p.x,p.y+1.6,p.z).project(camera),a=trackPoint(x+240),ahead=new Vector3(a.x,a.y,a.z).project(camera);assert.ok(Math.abs(robot.x)<.8&&Math.abs(robot.y)<.6);assert.ok(Math.abs(ahead.x)<.9&&Math.abs(ahead.y)<.8);
  }
});

test('saved world records accept valid stars only',()=>{
  assert.deepEqual(sanitizeProgress({moss:{stars:3,bestTime:40},ember:{stars:9,bestTime:10},unknown:{stars:1}}),{moss:{stars:3,bestTime:40}});
});
