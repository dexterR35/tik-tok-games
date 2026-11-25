import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { newProject } from '../public/garage/model.js';
import { createDuel, advanceDuel, tapDuel, giftDuel, duelResult } from '../duel-race.js';
import { LiveEngine } from '../live-engine.js';
function finish(duel,taps=false){for(let i=0;i<4000&&!(duel.player.finished&&duel.rival.finished);i++){if(taps&&i%10===0)tapDuel(duel,3);advanceDuel(duel,.02,0);}assert.equal(duel.player.finished,true);assert.equal(duel.rival.finished,true);return duelResult(duel);}
test('rival base pace is exactly plus or minus 5% of the independent unboosted reference',()=>{
 for(const [mode,factor] of [['easier',.95],['harder',1.05]]){const d=createDuel(newProject(),1,mode);advanceDuel(d,4,0);assert.ok(Math.abs(d.rival.baseDistance/d.reference.distance-factor)<1e-10);
  // close racing only shifts the rival by a few metres around that pace
  assert.ok(Math.abs(d.rival.distance-d.rival.baseDistance)<8);}
 assert.equal(createDuel(newProject(),1).rival.factor,1.05);assert.equal(createDuel(newProject(),2).rival.factor,.95);
});
test('without audience assistance the faster rival wins and the slower rival loses',()=>{
 const hard=finish(createDuel(newProject(),1,'harder')),easy=finish(createDuel(newProject(),1,'easier'));
 assert.equal(hard.won,false);assert.ok(hard.rivalTime<hard.time);assert.equal(hard.reward,400);
 assert.equal(easy.won,true);assert.ok(easy.time<easy.rivalTime);assert.equal(easy.reward,600);
});
test('one tap increases speed immediately without moving the car along the course',()=>{
 const d=createDuel(newProject());advanceDuel(d,4,0);const speed=d.player.speed,distance=d.player.distance,rival=d.rival.speed;
 assert.ok(tapDuel(d,1)>0);assert.ok(d.player.speed>speed);assert.equal(d.player.distance,distance);assert.equal(d.rival.speed,rival);assert.equal(d.taps,1);
});
test('sustained taps can change a losing race against the 5% faster rival into a win',()=>{
 const baseline=finish(createDuel(newProject(),1,'harder')),withTaps=finish(createDuel(newProject(),1,'harder'),true);
 assert.equal(baseline.won,false);assert.equal(withTaps.won,true);assert.ok(withTaps.time<baseline.time);assert.ok(withTaps.taps>0);
});
test('larger gifts create a stronger immediate speed burst and never accelerate the rival',()=>{
 const d=createDuel(newProject());advanceDuel(d,5,0);const small=structuredClone(d),large=structuredClone(d),rival=d.rival.speed;
 const low=giftDuel(small,100),high=giftDuel(large,1500);assert.ok(high>low);assert.ok(large.player.speed>small.player.speed);assert.equal(large.rival.speed,rival);assert.ok(large.giftAssist>small.giftAssist);
});
test('repeated taps and gifts have bounded power and finished cars cannot get more boosts',()=>{
 const d=createDuel(newProject());advanceDuel(d,4,0);for(let i=0;i<1000;i++){tapDuel(d,10000);giftDuel(d,1000000);}assert.ok(d.tapAssist<=.14);assert.ok(d.giftAssist<=.24);assert.ok(Number.isFinite(d.player.speed));assert.ok(d.player.speed<=d.reference.speed*1.32+1.40001);
 finish(d);const speed=d.player.speed;assert.equal(tapDuel(d,10),0);assert.equal(giftDuel(d,1500),0);assert.equal(d.player.speed,speed);
});
test('LIVE gift streak finals and duplicate ids cannot award another racing burst',()=>{
 const e=new LiveEngine(null);e.save.charge=0;e.control({action:'race'});e.tick(4);const speed=e.run.speed,credits=e.save.garage.credits;
 const gift={type:'gift',id:'race-gift-1',coins:10,user:{id:'crew',name:'Crew'}};e.event(gift);assert.ok(e.run.speed>speed);assert.equal(e.duel.gifts,1);assert.equal(e.save.garage.credits,credits+500);
 const boosted=e.run.speed;e.event(gift);e.event({type:'gift',coins:0,total:10,final:true});assert.equal(e.run.speed,boosted);assert.equal(e.duel.gifts,1);
});
test('rival selection applies on the next start and a paused race cannot gain velocity',()=>{
 const e=new LiveEngine(null);e.control({action:'rival',difficulty:'harder'});e.control({action:'race'});assert.equal(e.duel.rival.factor,1.05);e.tick(4);
 e.control({action:'rival',difficulty:'easier'});assert.equal(e.duel.rival.factor,1.05);e.control({action:'pause'});const speed=e.run.speed;e.control({action:'tap',count:20});assert.equal(e.run.speed,speed);
 e.setPhase('build');e.control({action:'race'});assert.equal(e.duel.rival.factor,.95);
});
test('the new coupe loads with separate panels and an open engine bay beneath its bonnet',async()=>{
 const file=fs.readFileSync(new URL('../public/garage/assets/coachwork-v2.glb',import.meta.url));assert.equal(file.toString('utf8',0,4),'glTF');assert.equal(file.readUInt32LE(8),file.length);
 const gltf=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)));
 for(const name of ['body_shell','hood_surface','roof_surface','front_glass','rear_glass','left_glass','right_glass'])assert.ok(gltf.nodes.some(n=>n.name===name));
 for(const accessor of gltf.accessors){if(accessor.min)assert.ok(accessor.min.every(Number.isFinite));if(accessor.max)assert.ok(accessor.max.every(Number.isFinite));}
 const loaded=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');loaded.scene.updateMatrixWorld(true);
 const shell=loaded.scene.getObjectByName('body_shell'),hood=loaded.scene.getObjectByName('hood_surface');shell.material.side=THREE.DoubleSide;hood.material.side=THREE.DoubleSide;
 const ray=new THREE.Raycaster(new THREE.Vector3(-1.55,2,0),new THREE.Vector3(0,-1,0));
 assert.ok(ray.intersectObject(hood).some(hit=>hit.point.y>1),'closed bonnet covers the engine bay');
 assert.equal(ray.intersectObject(shell).some(hit=>hit.point.y>1.1),false,'opening the bonnet exposes the engine above the inner wheel arch');
});

test('close racing: without help the rival never runs away and never falls far behind',()=>{
 for(const mode of ['harder','easier']){const d=createDuel(newProject(),1,mode);let worst=0;
  for(let i=0;i<4000&&!(d.player.finished||d.rival.finished);i++){advanceDuel(d,.02,0);worst=Math.max(worst,Math.abs(d.player.distance-d.rival.distance));}
  assert.ok(worst<9,`${mode}: gap reached ${worst.toFixed(1)} m`);}
});
test('the rival chases audience help late and with less, so the crew still wins but the finish stays close',()=>{
 const d=createDuel(newProject(),1,'harder');let led=false,maxLead=0;
 for(let i=0;i<4000&&!(d.player.finished&&d.rival.finished);i++){if(i%10===0)tapDuel(d,3);advanceDuel(d,.02,0);
  if(!d.player.finished){const lead=d.player.distance-d.rival.distance;maxLead=Math.max(maxLead,lead);if(lead>.5)led=true;
   if(d.rival.extra>0)assert.ok(d.rival.distance<=d.player.distance-.6+1e-9,'chasing never puts the rival in front');}}
 const r=duelResult(d);assert.equal(led,true);assert.equal(r.won,true);assert.ok(r.margin<.3,`margin ${r.margin}`);assert.ok(maxLead<20);
 // a huge gift: a clear lead first, then the rival claws back
 const g=createDuel(newProject(),1,'easier');advanceDuel(g,6,0);giftDuel(g,500*50);let peak=0,atLine=null;for(let i=0;i<4000&&!(g.player.finished&&g.rival.finished);i++){advanceDuel(g,.02,0);if(!g.player.finished)peak=Math.max(peak,g.player.distance-g.rival.distance);else atLine??=g.player.distance-g.rival.distance;}
 const end=duelResult(g);assert.equal(end.won,true);assert.ok(peak>8);assert.ok(atLine<peak*.75,`rival closed in before the line (${atLine?.toFixed(1)} of ${peak.toFixed(1)} m)`);
});
