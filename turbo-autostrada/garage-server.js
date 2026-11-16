// Local LIVE game runtime: one game leader, synchronized capture windows, and a read-only TikTok bridge.
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocket, WebSocketServer } from 'ws';
import { LiveEngine } from './live-engine.js';
const root=path.dirname(fileURLToPath(import.meta.url)),app=express(),port=Number(process.env.GARAGE_PORT||3210);
const savePath=path.join(process.env.GARAGE_DATA_DIR||path.join(root,'data'),'garage-live.json');
let lastSave=null,lastSnapshot=null,leader=null,bridge=null,bridgePort=3000,bridgeWanted=false,bridgeTimer=null;
let bridgeStatus={connected:false,live:false,text:'TikTok event bridge off'};
// A damaged save (power cut mid-write) must not wipe the garage: fall back to the previous copy and keep the damaged file aside.
for(const file of [savePath,savePath+'.bak']){if(!fs.existsSync(file))continue;try{const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value&&typeof value==='object'){lastSave=value;if(file!==savePath)console.log('Garage save was damaged: restored from garage-live.json.bak');break;}}catch{}try{fs.copyFileSync(file,file+'.damaged-'+Date.now());}catch{}}
const engine=new LiveEngine(lastSave);
app.disable('x-powered-by');
app.use('/vendor/three',express.static(path.join(root,'node_modules/three/build')));
app.use('/vendor/addons',express.static(path.join(root,'node_modules/three/examples/jsm')));
app.get('/api/garage-save',(_req,res)=>res.json(lastSave));
app.use(express.static(path.join(root,'public/garage')));
const server=http.createServer(app),wss=new WebSocketServer({server,path:'/garage-ws',maxPayload:1024*1024,verifyClient:info=>!info.origin||[`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(info.origin)});
const send=(client,message)=>{if(client?.readyState===WebSocket.OPEN)client.send(JSON.stringify(message));};
const all=message=>{for(const client of wss.clients)send(client,message);};
function elect(){if(leader?.readyState===WebSocket.OPEN){for(const c of wss.clients)send(c,{type:'role',primary:false,focus:c===leader,serverAuthoritative:true,save:null});return;}leader=[...wss.clients].find(c=>c.role==='game'&&c.readyState===WebSocket.OPEN)||null;for(const c of wss.clients)send(c,{type:'role',primary:false,focus:c===leader,serverAuthoritative:true,save:null});}
function status(value){bridgeStatus={...bridgeStatus,...value};all({type:'bridge-status',...bridgeStatus});}
function connectBridge(){
  clearTimeout(bridgeTimer);if(!bridgeWanted)return;
  bridge=new WebSocket(`ws://127.0.0.1:${bridgePort}/ws`);
  bridge.on('open',()=>status({connected:true,live:false,text:'Event server connected; waiting for LIVE status'}));
  bridge.on('message',raw=>{try{const m=JSON.parse(raw.toString());const events=m.type==='batch'?m.events:[m];for(const event of events){if(event.type==='status')status({connected:true,live:!!event.live,username:String(event.username||''),text:!event.live?'TikTok is not LIVE yet':'TikTok LIVE connected'});if(['gift','like','chat','follow'].includes(event.type)){engine.event(event);send(leader,{type:'live-event',event});}}}catch{}});
  bridge.on('error',()=>{});bridge.on('close',()=>{status({connected:false,live:false,text:bridgeWanted?'Event server unavailable; retrying':'TikTok event bridge off'});if(bridgeWanted)bridgeTimer=setTimeout(connectBridge,4000);});
}
let writeTimer;
function saveNow(){clearTimeout(writeTimer);writeTimer=null;if(!lastSave)return;try{fs.mkdirSync(path.dirname(savePath),{recursive:true});fs.writeFileSync(savePath+'.tmp',JSON.stringify(lastSave));if(fs.existsSync(savePath))fs.copyFileSync(savePath,savePath+'.bak');fs.renameSync(savePath+'.tmp',savePath);}catch(error){all({type:'save-error',text:'Server save unavailable; browser save remains active.'});}}
function saveLater(value){lastSave=value;if(writeTimer)return;writeTimer=setTimeout(saveNow,500);}
wss.on('connection',(client,req)=>{
  client.role=new URL(req.url,'http://127.0.0.1').searchParams.get('role')==='game'?'game':'host';
  send(client,{type:'bridge-status',...bridgeStatus});send(client,{type:'game-state',snapshot:engine.snapshot(bridgeStatus.live)});
  if(client.role==='game')elect();else send(client,{type:'role',primary:false});
  client.on('close',()=>{if(client===leader){leader=null;elect();}});
  client.on('message',raw=>{try{
    const m=JSON.parse(raw.toString());
    if(m.type==='control'){
      if(m.action==='bridge'){
        bridgeWanted=!!m.enabled;bridgePort=Math.max(1,Math.min(65535,Math.floor(Number(m.port)||3000)));clearTimeout(bridgeTimer);if(bridge){bridge.removeAllListeners('close');bridge.close();bridge=null;}
        if(bridgeWanted)connectBridge();else status({connected:false,live:false,text:'TikTok event bridge off'});
      }else if(['gift','like','tap','vote','rival','hood','rev','race','next','pause','resume'].includes(m.action)){engine.control(m);send(leader,m);saveLater(engine.save);}
    }
  }catch{}});
});
let lastTick=performance.now(),lastDiskSave=0;
const gameTimer=setInterval(()=>{const now=performance.now(),dt=Math.min(2,Math.max(0,(now-lastTick)/1000));lastTick=now;engine.tick(dt);lastSnapshot=engine.snapshot(bridgeStatus.live);all({type:'game-state',snapshot:lastSnapshot});if(now-lastDiskSave>2000){saveLater(engine.save);lastDiskSave=now;}},100);
server.on('close',()=>clearInterval(gameTimer));
function openGame(){
 const url=`http://127.0.0.1:${port}`,chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 if(fs.existsSync(chrome))spawn(chrome,[`--app=${url}`,'--window-size=540,960','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling',`--user-data-dir=${path.join(process.env.LOCALAPPDATA||root,'DreamGarage','game')}`],{stdio:'ignore',detached:true,windowsHide:false}).unref();
 else spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',windowsHide:true}).unref();
}
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Game already running: http://127.0.0.1:${port}`:error.message);if(error.code==='EADDRINUSE'&&process.argv.includes('--open'))openGame();clearInterval(gameTimer);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${port}`;console.log(`DREAM GARAGE LIVE GAME\nGame: ${url}\nHost controls: ${url}/host.html\nCapture source: ${url}/?source=1\nTikTok events: connect the existing LIVE server from Host controls.`);
  if(process.argv.includes('--open')&&process.platform==='win32')openGame();
});

// One unexpected error must not end a LIVE: log it and keep the game running. Closing the window saves the garage first.
process.on('uncaughtException',error=>console.error('[garage] error (still running):',error?.message||error));
process.on('unhandledRejection',error=>console.error('[garage] rejected promise (still running):',error?.message||error));
let closing=false;
function shutdown(){if(closing)return;closing=true;lastSave=engine.save;saveNow();clearInterval(gameTimer);for(const c of wss.clients)try{c.close(1001);}catch{}server.close();setTimeout(()=>process.exit(0),800).unref();}
for(const signal of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP'])process.on(signal,shutdown);
