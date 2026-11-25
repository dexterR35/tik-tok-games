import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import WebSocket from 'ws';

test('local bridge serves 3D assets, broadcasts gifts, and accepts MCP controls',async t=>{
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Test server exited before startup');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timed out')),10000);timer.unref();})]);
  const base='http://127.0.0.1:'+port;
  const post=(url,body,headers={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await fetch(base+'/js/vehicles.js')).status,200);
  assert.equal((await fetch(base+'/js/city-worker.js')).status,200);
  assert.equal((await fetch(base+'/assets/grand-tourer.glb')).status,404);
  const ws=new WebSocket(base.replace('http:','ws:')+'/ws');t.after(()=>ws.close());await once(ws,'message');
  const event=once(ws,'message');await post('/api/event',{type:'gift',seconds:15,gift:'Turbo',name:'QA'});
  const broadcast=JSON.parse((await event)[0]);assert.equal(broadcast.event.type,'gift');assert.ok(broadcast.state.boostSeconds>14);
  const init=await(await post('/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',clientInfo:{name:'qa',version:'1'}}})).json();assert.equal(init.result.serverInfo.name,'autodrive-local');
  const tools=await(await post('/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'})).json();assert.equal(tools.result.tools.length,7);
  const mode=await(await post('/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'set_drive_mode',arguments:{mode:'hardcore'}}})).json();assert.equal(JSON.parse(mode.result.content[0].text).mode,'hardcore');
  const invalid=await(await post('/mcp',{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'trigger_boost',arguments:{seconds:-1}}})).json();assert.equal(invalid.result.isError,true);
  assert.equal((await post('/api/event',{type:'like'},{Origin:'https://other-site.example'})).status,403);
  assert.equal((await post('/api/connect',{username:'not a username!'})).status,400);
});
