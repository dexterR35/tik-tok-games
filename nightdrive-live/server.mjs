import express from 'express';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {TikTokLiveConnection,WebcastEvent,ControlEvent} from 'tiktok-live-connector';
import {LiveState} from './live-state.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4316),host='127.0.0.1';
const app=express(),server=http.createServer(app),state=new LiveState();
app.disable('x-powered-by');app.use(express.json({limit:'12kb'}));
// The host bridge is intentionally local, including MCP. OBS uses this same URL.
function localOrigin(req){if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||''))return false;if(!req.headers.origin)return true;try{const o=new URL(req.headers.origin);return ['http:','https:'].includes(o.protocol)&&['localhost','127.0.0.1'].includes(o.hostname)&&o.port===String(port);}catch{return false;}}
app.use((req,res,next)=>localOrigin(req)?next():res.status(403).json({error:'Local host origin required'}));
app.use('/vendor/three',express.static(path.join(root,'node_modules/three/build')));
app.use('/vendor/addons',express.static(path.join(root,'node_modules/three/examples/jsm')));
app.use(express.static(path.join(root,'public')));
const wss=new WebSocketServer({server,path:'/ws',maxPayload:8192});
let connection=null,connectGeneration=0,connecting=false,telemetryOwner=null;
const broadcast=message=>{const data=JSON.stringify(message);for(const client of wss.clients)if(client.readyState===1)client.send(data);};
function publish(type,data){const result=state.event(type,data);broadcast({type:'event',...result});return result;}
function status(s){state.connection={...state.connection,...s};broadcast({type:'state',state:state.snapshot()});}
function disconnect(){++connectGeneration;connecting=false;const old=connection;connection=null;try{old?.disconnect();}catch{}state.viewers=null;status({state:'demo',username:'',message:'Disconnected. Test controls are available.'});}
async function connect(username){
  if(connecting)throw new Error('A connection attempt is already running');
  const normalized=String(username||'').replace(/^@/,'').trim();
  if(!/^[\w.]{2,32}$/.test(normalized))throw new Error('Enter a TikTok username, without a URL');
  disconnect();connecting=true;const generation=++connectGeneration;
  status({state:'connecting',username:normalized,message:`Connecting to @${normalized}…`});
  const live=new TikTokLiveConnection(normalized,{processInitialData:false,enableExtendedGiftInfo:true,...(process.env.TIKTOK_SIGN_API_KEY?{signApiKey:process.env.TIKTOK_SIGN_API_KEY}:{})});connection=live;
  const active=fn=>data=>{if(generation===connectGeneration)fn(data);};
  live.on(WebcastEvent.LIKE,active(d=>publish('like',{name:d.user?.nickname||d.nickname||'Viewer',count:d.likeCount||1})));
  live.on(WebcastEvent.GIFT,active(d=>{const gift=state.normalizeGift(d);if(gift)publish('gift',gift);}));
  live.on(WebcastEvent.ROOM_USER,active(d=>{state.viewers=Number(d.viewerCount)||0;broadcast({type:'state',state:state.snapshot()});}));
  live.on(WebcastEvent.CHAT,active(d=>{const text=String(d.comment||'').trim().toLowerCase();if(text==='!boost')broadcast({type:'chat',name:String(d.user?.nickname||'Viewer').slice(0,40),text:'Tap the screen to fuel the drive!'});}));
  live.on(ControlEvent.DISCONNECTED,active(()=>{connecting=false;status({state:'offline',message:'LIVE disconnected. Reconnect when the stream is ready.'});}));
  live.on(ControlEvent.ERROR,active(e=>{console.warn('[TikTok]',String(e?.message||e?.info||'Connection error').slice(0,200));}));
  try{await live.connect();if(generation!==connectGeneration){live.disconnect();return;}connecting=false;status({state:'live',message:`Connected to @${normalized}. Gifts and likes are active.`});}
  catch(error){if(generation===connectGeneration){connecting=false;connection=null;try{live.disconnect();}catch{}status({state:'error',message:`Could not connect to @${normalized}. Check that the account is LIVE; the connector may require a signing provider.`});}console.warn('[TikTok connect]',String(error?.message||error).slice(0,250));}
}
wss.on('connection',(ws,req)=>{
  if(!localOrigin(req)){ws.close(1008,'Local origin required');return;}
  ws.send(JSON.stringify({type:'welcome',state:state.snapshot()}));
  ws.on('message',raw=>{try{const m=JSON.parse(raw);if(m.type==='telemetry'&&(!telemetryOwner||telemetryOwner===ws)){
    telemetryOwner=ws;if(m.state&&typeof m.state==='object'&&JSON.stringify(m.state).length<4000){state.telemetry=m.state;state.telemetryAt=Date.now();}
  }}catch{}});ws.on('close',()=>{if(telemetryOwner===ws)telemetryOwner=null;});
});
app.get('/api/state',(req,res)=>res.json(state.snapshot()));
app.post('/api/event',(req,res)=>{try{res.json(publish(req.body.type,req.body));}catch(error){res.status(400).json({error:error.message});}});
app.post('/api/connect',(req,res)=>{const username=String(req.body.username||'').replace(/^@/,'').trim();if(!/^[\w.]{2,32}$/.test(username))return res.status(400).json({error:'Enter a valid TikTok username'});if(connecting)return res.status(409).json({error:'Already connecting'});res.json({ok:true});connect(username).catch(error=>status({state:'error',message:error.message}));});
app.post('/api/disconnect',(req,res)=>{disconnect();res.json({ok:true});});

// Stateless Streamable HTTP MCP with JSON responses, usable by local MCP clients.
const mcpTools=[
  {name:'get_drive_state',description:'Read live interactions and latest game telemetry. telemetryAgeMs indicates freshness.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'set_drive_mode',description:'Change autonomous driving pace while preserving the safety controller.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['safe','fast','hardcore']}},required:['mode'],additionalProperties:false}},
  {name:'set_drive_route',description:'Choose the kind of future route generated beyond the current planned section.',inputSchema:{type:'object',properties:{route:{type:'string',enum:['mixed','highway','city']}},required:['route'],additionalProperties:false}},
  {name:'trigger_boost',description:'Grant a timed boost. Traffic and red-light braking stay active.',inputSchema:{type:'object',properties:{seconds:{type:'number',minimum:1,maximum:30}},required:['seconds'],additionalProperties:false}},
];
app.post('/mcp',(req,res)=>{
  const {id,method,params}=req.body||{};
  if(id===undefined)return res.sendStatus(202);
  let result;
  if(method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'autodrive-local',version:'2.0.0'}};
  else if(method==='ping')result={};
  else if(method==='tools/list')result={tools:mcpTools};
  else if(method==='tools/call'){
    try{const args=params?.arguments||{};let output;
      if(params.name==='get_drive_state')output=state.snapshot();
      else if(params.name==='set_drive_mode')output=publish('mode',args).state;
      else if(params.name==='set_drive_route')output=publish('route',args).state;
      else if(params.name==='trigger_boost'){if(!Number.isFinite(args.seconds)||args.seconds<1||args.seconds>30)throw new Error('seconds must be between 1 and 30');output=publish('boost',args).state;}
      else throw new Error('Unknown tool');
      result={content:[{type:'text',text:JSON.stringify(output)}]};
    }catch(error){result={isError:true,content:[{type:'text',text:error.message}]};}
  }else return res.json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
  res.json({jsonrpc:'2.0',id,result});
});
app.get('/mcp',(req,res)=>res.status(405).set('Allow','POST').end());
server.listen(port,host,()=>console.log(`\nAUTODRIVE LIVE\nStudio: http://localhost:${port}\nOBS 9:16: http://localhost:${port}/?capture=1\nMCP: http://localhost:${port}/mcp\n`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{try{connection?.disconnect();}catch{}for(const c of wss.clients)c.close();wss.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref();});
