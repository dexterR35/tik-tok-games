import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {once} from 'node:events';
import {createNightshiftServer} from '../server.mjs';
import {WebcastEvent} from 'tiktok-live-connector';

test('local bridge serves game, validates usernames, connects and disconnects',async()=>{
  let mock;
  const server=createNightshiftServer({connectionFactory:()=>{mock=new EventEmitter();mock.connect=async()=>({roomId:'test'});mock.disconnect=async()=>{};return mock;}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(base)).status,200);
    const state=await(await fetch(`${base}/api/status`)).json();assert.equal(state.connected,false);assert.equal(state.app,'nightshift');
    const post=(route,body,origin=base)=>fetch(`${base}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
    assert.equal((await post('connect',{username:'bad / user'})).status,400);
    assert.equal((await post('connect',{username:'testuser'},'https://untrusted.example')).status,403);
    const response=await post('connect',{username:'testuser'});assert.equal(response.status,200);assert.equal((await response.json()).connected,true);
    assert.equal((await post('connect',{username:'otheruser'})).status,409);
    assert.equal((await(await post('disconnect',{})).json()).connected,false);
  }finally{server.closeAllConnections();server.close();await once(server,'close');}
});
test('failed LIVE connection returns a useful error without claiming to be connected',async()=>{
  const server=createNightshiftServer({connectionFactory:()=>{const mock=new EventEmitter();mock.connect=async()=>{throw new Error('User is not LIVE');};mock.disconnect=async()=>{};return mock;}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try{const response=await fetch(`${base}/api/connect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'testuser'})});assert.equal(response.status,502);const state=await response.json();assert.equal(state.connected,false);assert.match(state.message,/not LIVE/);}finally{server.closeAllConnections();server.close();await once(server,'close');}
});
test('SSE batches a 10k-viewer burst without losing likes or duplicating streak gifts',async()=>{
  let mock;const server=createNightshiftServer({connectionFactory:()=>{mock=new EventEmitter();mock.connect=async()=>({});mock.disconnect=async()=>{};return mock;}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;let reader;
  try{
    await fetch(`${base}/api/connect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'testuser'})});
    const stream=await fetch(`${base}/api/events`,{signal:AbortSignal.timeout(4000)});reader=stream.body.getReader();
    mock.emit(WebcastEvent.ROOM_USER,{viewerCount:10000});for(let i=0;i<10000;i++)mock.emit(WebcastEvent.LIKE,{likeCount:5,user:{nickname:'viewer'}});
    const gift={msgId:'streak-start',user:{userId:'1',nickname:'gifter'},giftId:7,giftDetails:{giftType:1,diamondCount:1000},repeatCount:1,repeatEnd:false};
    mock.emit(WebcastEvent.GIFT,gift);mock.emit(WebcastEvent.GIFT,{...gift,msgId:'streak-end',repeatEnd:true});
    let content='',batch;const decoder=new TextDecoder();
    while(!batch){const chunk=await reader.read();assert.equal(chunk.done,false);content+=decoder.decode(chunk.value,{stream:true});for(const line of content.split('\n'))if(line.startsWith('data: ')){const event=JSON.parse(line.slice(6));if(event.type==='batch')batch=event;}}
    assert.equal(batch.events.length,2);assert.equal(batch.events.find(e=>e.type==='like').count,50000);assert.equal(batch.events.find(e=>e.type==='gift').count,1);
    assert.equal((await(await fetch(`${base}/api/status`)).json()).viewers,10000);
  }finally{await reader?.cancel().catch(()=>{});server.closeAllConnections();server.close();await once(server,'close');}
});
