import express from 'express';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TikTokLiveConnection,WebcastEvent,ControlEvent} from 'tiktok-live-connector';
import {GiftLedger} from './gift-ledger.mjs';
import {CrowdBuffer} from './crowd-buffer.mjs';
import {spawn} from 'node:child_process';

export function createNightshiftServer({connectionFactory=(username,options)=>new TikTokLiveConnection(username,options)}={}){
  const app=express(),server=http.createServer(app),clients=new Set();
  let connection=null,connecting=false,connected=false,username='',message='',generation=0,viewers=0;
  const crowd=new CrowdBuffer();
  let ledger=new GiftLedger();
  const status=()=>({type:'status',app:'nightshift',connected,connecting,username,message,viewers});
  const broadcast=data=>{const packet=`data: ${JSON.stringify(data)}\n\n`;for(const client of clients){if(client.destroyed||client.writableEnded){clients.delete(client);continue;}if(client.writableLength>128*1024){clients.delete(client);client.destroy();continue;}client.write(packet);}};
  const setStatus=(changes)=>{if('connected'in changes)connected=changes.connected;if('connecting'in changes)connecting=changes.connecting;if('message'in changes)message=changes.message;broadcast(status());};
  app.disable('x-powered-by');app.use(express.json({limit:'2kb'}));
  app.get('/api/status',(_req,res)=>res.json(status()));
  app.get('/api/events',(req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(status())}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));});
  app.use('/api',(req,res,next)=>{
    if(req.method!=='POST')return next();
    const origin=req.headers.origin;
    // The host-only bridge accepts controls only from its own browser origin.
    if(origin&&origin!==`http://${req.headers.host}`)return res.status(403).json({message:'Open Race Control from the local game address.'});
    if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({message:'Cross-site commands are disabled.'});
    next();
  });
  async function disconnect(){generation++;const old=connection;connection=null;viewers=0;crowd.clear();ledger=new GiftLedger();setStatus({connected:false,connecting:false,message:'Disconnected. Demo racing is ready.'});if(old){old.removeAllListeners();try{await old.disconnect();}catch{}}}
  app.post('/api/connect',async(req,res)=>{
    const requested=String(req.body?.username||'').trim().replace(/^@/,'');
    if(!/^[\w.]{2,32}$/.test(requested))return res.status(400).json({...status(),message:'Enter a valid TikTok username.'});
    if(connecting||connected)return res.status(409).json({...status(),message:'Disconnect the current session before starting another.'});
    username=requested;ledger=new GiftLedger();const session=++generation;
    setStatus({connecting:true,connected:false,message:`Connecting to @${username}…`});
    let candidate;
    try{
      candidate=connectionFactory(username,{enableExtendedGiftInfo:true,processInitialData:false,...(process.env.TIKTOK_SIGN_API_KEY?{signApiKey:process.env.TIKTOK_SIGN_API_KEY}:{})});connection=candidate;
      candidate.on(WebcastEvent.LIKE,d=>{if(session!==generation)return;crowd.like(d.likeCount||1,d.user?.nickname||'THE CROWD');});
      candidate.on(WebcastEvent.GIFT,d=>{if(session!==generation)return;const gift=ledger.consume(d);if(gift)crowd.gift(gift);});
      candidate.on(WebcastEvent.ROOM_USER,d=>{if(session!==generation)return;viewers=Math.max(0,Math.floor(Number(d.viewerCount)||0));broadcast({type:'audience',viewers});});
      candidate.on(WebcastEvent.STREAM_END,()=>{if(session===generation)setStatus({connected:false,connecting:false,message:'The LIVE has ended. Connect again when you go live.'});});
      candidate.on(ControlEvent.DISCONNECTED,()=>{if(session===generation)setStatus({connected:false,connecting:false,message:'TikTok disconnected. Press connect to try again.'});});
      candidate.on(ControlEvent.ERROR,error=>{if(session===generation){console.warn('TikTok connector:',error.info||error.message||'connection error');setStatus({message:'TikTok reported a connection issue. If it disconnects, try connecting again.'});}});
      await Promise.race([candidate.connect(),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Connection timed out. Make sure your account is LIVE, then retry.')),25000);timer.unref();})]);
      if(session!==generation){candidate.removeAllListeners();await candidate.disconnect().catch(()=>{});return res.json(status());}
      setStatus({connected:true,connecting:false,message:`@${username} is LIVE. Likes accelerate your car. Gifts activate nitro.`});res.json(status());
    }catch(error){if(session===generation){generation++;connection=null;candidate?.removeAllListeners();try{await candidate?.disconnect();}catch{}setStatus({connecting:false,connected:false,message:String(error.message||'Connection failed. Confirm your account is LIVE.').slice(0,230)});}res.status(502).json(status());}
  });
  app.post('/api/disconnect',async(_req,res)=>{await disconnect();res.json(status());});
  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)),'dist')));
  const flush=setInterval(()=>{const events=crowd.flush();if(events.length)broadcast({type:'batch',events});},100);flush.unref();
  const heartbeat=setInterval(()=>{for(const client of clients)client.write(': heartbeat\n\n');},15000);heartbeat.unref();
  server.on('close',()=>{clearInterval(flush);clearInterval(heartbeat);for(const client of clients)client.end();clients.clear();void disconnect();});
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createNightshiftServer();const port=Number(process.env.PORT)||3316;
  server.listen(port,'127.0.0.1',()=>{console.log(`NIGHTSHIFT is ready: http://127.0.0.1:${port}\nBroadcast capture: http://127.0.0.1:${port}/?broadcast=1\nKeep this window open while playing.`);if(process.argv.includes('--open')){const url=`http://127.0.0.1:${port}`;const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();}});
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. The game may already be running.`:error);process.exitCode=1;});
}
