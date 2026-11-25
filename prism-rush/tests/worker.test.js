import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

test('standalone simulation worker handles state, batched taps, exact results, saves and command errors', {timeout:10000}, async t => {
  const workerUrl=new URL('../public/sim-worker.js',import.meta.url).href;
  const worker=new Worker(`const {parentPort}=require('node:worker_threads'); globalThis.self={postMessage:m=>parentPort.postMessage(m)}; import(${JSON.stringify(workerUrl)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'ready'});});`,{eval:true});
  t.after(()=>worker.terminate());
  const messages=[]; worker.on('message',m=>messages.push(m));
  const until=predicate=>new Promise((resolve,reject)=>{
    const found=messages.find(predicate); if(found) return resolve(found);
    const timer=setTimeout(()=>{worker.off('message',listener);reject(Error('Worker response timed out'));},5000);
    function listener(message){if(predicate(message)){clearTimeout(timer);worker.off('message',listener);resolve(message);}}
    worker.on('message',listener); worker.once('error',reject);
  });
  await until(m=>m.type==='ready'); worker.postMessage({type:'init'});
  const first=await until(m=>m.type==='state'); assert.equal(first.state.board.length,56);
  const command=async(id,command)=>{worker.postMessage({type:'command',id,command});return until(m=>m.type==='reply'&&m.id===id);};
  await command(1,{action:'demo',value:false}); await command(2,{action:'pause'}); await command(5,{action:'pause'});
  assert.equal((await command(3,{action:'tap',count:100,name:'Worker Viewer'})).ok,true);
  const result=await until(m=>m.type==='state'&&m.state.lastResult?.name==='Worker Viewer');
  assert.equal(result.state.lastResult.points,result.state.lastResult.predicted); assert.equal(result.state.taps.received,100); assert.equal(result.state.taps.played+result.state.taps.pending,100);
  const save=await until(m=>m.type==='save'&&m.saved.users.some(p=>p.name==='Worker Viewer')); assert.equal(save.saved.engine.board.length,56);
  const forbidden=await command(4,{action:'connect',url:'ws://localhost:3000/ws'}); assert.match(forbidden.error,/local edition/);
});
