import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket,WebSocketServer } from 'ws';
import { freshLiveSave,restoreLiveSave,chooseGoal,completeGoal,applyLiveEvent,simulatedGift } from '../public/garage/live-rules.js';
import { LiveEngine } from '../live-engine.js';
const context=()=>({seen:new Set(),votes:new Map()});
test('LIVE gifts use incremental streak value once and ignore final zero-value notifications',()=>{
 const save=freshLiveSave(),ctx=context(),before=save.garage.credits;
 applyLiveEvent(save,{type:'gift',id:'one',coins:3,giftName:'Test',user:{id:'abc',name:'Builder'}},ctx);
 applyLiveEvent(save,{type:'gift',id:'one',coins:3},ctx);applyLiveEvent(save,{type:'gift',coins:0,total:3,final:true},ctx);
 assert.equal(save.garage.credits,before+150);assert.equal(save.garage.totalGifts,1);assert.equal(save.garage.contributors[0].name,'Builder');
});
test('likes charge a bounded boost meter and each chatter has one current style vote',()=>{
 const save=freshLiveSave(),ctx=context();applyLiveEvent(save,{type:'like',count:10000},ctx);assert.equal(save.charge,100);
 applyLiveEvent(save,{type:'chat',text:'2',user:{id:'a'}},ctx);applyLiveEvent(save,{type:'chat',text:'3',user:{id:'a'}},ctx);assert.equal(ctx.votes.size,1);assert.equal(save.style,2);
 applyLiveEvent(save,{type:'chat',text:'blue',user:{id:'b'}},ctx);assert.equal(save.garage.projects.kaze.color,'#399bbc');
});
test('the automated build goal purchases real parts and advances without host shop clicks',()=>{
 const save=freshLiveSave(),first=chooseGoal(save);assert.equal(first.type,'part');assert.equal(first.category,'paint');
 const result=completeGoal(save,first);assert.equal(result.ok,true);assert.equal(save.garage.projects.kaze.parts.paint,1);assert.notEqual(chooseGoal(save).category,'paint');
 simulatedGift(save,'rocket','Crew');assert.equal(save.garage.totalGifts,1);assert.ok(save.garage.credits>=1500);assert.equal(restoreLiveSave(JSON.parse(JSON.stringify(save))).garage.projects.kaze.parts.paint,1);
});
test('a funded next car archives the completed build with its original model and contributors',()=>{
 const save=freshLiveSave();for(const key of Object.keys(save.garage.projects.kaze.parts)){save.garage.projects.kaze.parts[key]=1;save.garage.projects.kaze.owned[key].push(1);}save.garage.credits=10000;
 const goal=chooseGoal(save);assert.equal(goal.type,'car');assert.equal(completeGoal(save,goal).newCar,true);assert.equal(save.garage.active,'vanta');assert.equal(save.garage.collection[0].project.carId,'kaze');assert.equal(save.garage.credits,2000);
});
test('the server engine completes natural build, travel, race, and reward phases without browser frames',()=>{
 const engine=new LiveEngine(null);const phases=new Set();for(let i=0;i<1800;i++){engine.tick(.05);phases.add(engine.phase);}assert.ok(phases.has('build'));assert.ok(phases.has('travel'));assert.ok(phases.has('race'));assert.ok(phases.has('results'));assert.ok(engine.save.garage.totalRuns>=1);assert.ok(engine.save.round>=2);
 engine.control({action:'pause'});const credits=engine.save.garage.credits,time=engine.time;engine.tick(10);assert.equal(engine.time,time);assert.equal(engine.save.garage.credits,credits);engine.control({action:'resume'});engine.tick(.1);assert.ok(engine.time>time);
});
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
function message(client,predicate){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client.off('message',onMessage);reject(new Error('Message timeout'));},7000);function onMessage(raw){const value=JSON.parse(raw.toString());if(predicate(value)){clearTimeout(timer);client.off('message',onMessage);resolve(value);}}client.on('message',onMessage);});}
test('game transport elects one engine, relays host actions, synchronizes capture windows, and reads TikTok batches', {timeout:20000},async()=>{
 const port=await freePort(),bridgePort=await freePort(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'dream-garage-test-'));
 const child=spawn(process.execPath,['garage-server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,GARAGE_PORT:String(port),GARAGE_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
 const clients=[];let mock;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Game server startup timeout')),6000);child.stdout.on('data',data=>{if(data.toString().includes('DREAM GARAGE LIVE GAME')){clearTimeout(timer);resolve();}});child.on('error',reject);});
  const game=new WebSocket(`ws://127.0.0.1:${port}/garage-ws?role=game`);clients.push(game);const role=message(game,m=>m.type==='role');assert.equal((await role).serverAuthoritative,true);
  const host=new WebSocket(`ws://127.0.0.1:${port}/garage-ws?role=host`);clients.push(host);await once(host,'open');const action=message(game,m=>m.type==='control');host.send(JSON.stringify({type:'control',action:'gift',gift:'rocket',name:'TestCrew'}));assert.equal((await action).gift,'rocket');
  const capture=new WebSocket(`ws://127.0.0.1:${port}/garage-ws?role=game`);clients.push(capture);await once(capture,'open');const mirrored=message(capture,m=>m.type==='game-state');game.send(JSON.stringify({type:'game-state',snapshot:{phase:'race',round:2}}));assert.equal((await mirrored).snapshot.car.carId,'kaze');
  const ignored=message(host,m=>m.type==='game-state');capture.send(JSON.stringify({type:'game-state',snapshot:{phase:'invalid'}}));game.send(JSON.stringify({type:'game-state',snapshot:{phase:'build',round:3}}));assert.equal((await ignored).snapshot.phase,'build');
  const duel=message(capture,m=>m.type==='game-state'&&m.snapshot.phase==='race'&&m.snapshot.rival?.offsetPercent===5);
  host.send(JSON.stringify({type:'control',action:'rival',difficulty:'harder'}));host.send(JSON.stringify({type:'control',action:'race'}));
  const racing=(await duel).snapshot;assert.ok(racing.run);assert.equal(racing.difficulty,'harder');
  const tapped=message(capture,m=>m.type==='game-state'&&m.snapshot.audienceAssist>0);
  host.send(JSON.stringify({type:'control',action:'tap',count:20}));assert.ok((await tapped).snapshot.run.speed>racing.run.speed);
  mock=new WebSocketServer({host:'127.0.0.1',port:bridgePort,path:'/ws'});await once(mock,'listening');mock.on('connection',socket=>{socket.send(JSON.stringify({type:'status',live:true,username:'MockAccount'}));socket.send(JSON.stringify({type:'batch',events:[{type:'gift',coins:2,repeat:2,user:{name:'MockViewer'}},{type:'gift',coins:0,final:true,total:2}]}));});
  const event=message(game,m=>m.type==='live-event'&&m.event.coins===2);host.send(JSON.stringify({type:'control',action:'bridge',enabled:true,port:bridgePort}));assert.equal((await event).event.user.name,'MockViewer');
  const gifted=message(capture,m=>m.type==='game-state'&&m.snapshot.effect?.kind==='gift'&&m.snapshot.effect.name==='MockViewer');assert.ok((await gifted).snapshot.audienceAssist>.05);
  const promoted=message(capture,m=>m.type==='role'&&m.focus);game.close();assert.equal((await promoted).serverAuthoritative,true);
 }finally{for(const c of clients)c.terminate();if(mock){for(const c of mock.clients)c.terminate();await new Promise(resolve=>mock.close(resolve));}child.kill();await once(child,'exit').catch(()=>{});for(const name of ['garage-live.json','garage-live.json.tmp']){const file=path.join(directory,name);if(fs.existsSync(file))fs.unlinkSync(file);}fs.rmdirSync(directory);}
});
