import {Simulation,CELL,LANES,signalPhase,clamp} from './simulation.js';
import {World} from './world.js';
import {FrameClock} from './motion.js';
import {districtAt,streetAt} from './districts.js';
import {Navigation} from './navigation.js';
import {FramePump} from './frame-pump.js';
const $=id=>document.getElementById(id);
const capture=new URLSearchParams(location.search).has('capture');if(capture)document.body.classList.add('capture');
const sim=new Simulation(4316),clock=new FrameClock();let world,ws,navigation,pump,liveState=null,toastTimeout,first=true,frame=0,uiTick=0,telemetryTick=0,bridgeReady=false;
// A named QA route exercises actual bends without changing the normal broadcast.
const qa=new URLSearchParams(location.search).get('qa');
if(qa==='turn'){const j=sim.route.junctions.find(j=>j.turn!=='straight');sim.s=j.s-70;sim.prevS=sim.s;sim.speed=12;sim.cars=[];sim.maxCars=0;sim.lane=1;sim.offset=LANES[1];sim.prevOffset=sim.offset;sim.time=5-j.id*3.7;while(sim.time<0)sim.time+=30;}
const formatTime=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
function journal(message){const li=document.createElement('li'),time=document.createElement('time'),span=document.createElement('span');time.textContent=formatTime(sim.time);span.textContent=message;li.append(time,span);$('journal').prepend(li);while($('journal').children.length>4)$('journal').lastChild.remove();}
function toast(message){$('event-toast').textContent=message;$('event-toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('event-toast').classList.remove('visible'),3300);}
sim.onEvent=(type,message)=>{journal(message);};
function hearts(count=4){for(let i=0;i<Math.min(10,count);i++)setTimeout(()=>{const el=document.createElement('span');el.className='heart-particle';el.textContent='♡';el.style.setProperty('--drift',`${Math.random()*90-45}px`);el.style.right=`${7+Math.random()*12}%`;$('hearts').append(el);setTimeout(()=>el.remove(),2100);},i*90);}
function applyState(state){
  liveState=state;sim.setMode(state.mode);sim.setRoute(state.route);sim.boost=Math.max(0,state.boostSeconds);
  document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===state.mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  document.querySelectorAll('[data-route]').forEach(b=>{const active=b.dataset.route===state.route;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  $('route-hint').textContent={mixed:'A little highway. A little getting lost.',highway:'Long straights ahead. Joining the highway in 500–800 m.',city:'More turns ahead. Heading into the city in 500–800 m.'}[state.route];
  $('hud-likes').textContent=state.likes.toLocaleString();$('fuel-progress').textContent=state.fuel;$('fuel-fill').style.width=state.fuel+'%';
  $('viewers').textContent=state.viewers===null?'—':state.viewers.toLocaleString();
  const c=state.connection;const connected=c.state==='live';$('connection-tag').textContent=connected?'LIVE EVENTS':'TEST MODE';$('connection-status').textContent=c.message;
  $('connect-button').disabled=c.state==='connecting';$('username').disabled=connected||c.state==='connecting';$('disconnect-button').hidden=!connected&&c.state!=='connecting';
  $('bridge-status').textContent=connected?'TIKTOK CONNECTED':bridgeReady?'LOCAL BRIDGE':'RECONNECTING';
}
function connectBridge(){
  ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
  ws.addEventListener('open',()=>{bridgeReady=true;});
  ws.addEventListener('message',event=>{try{const m=JSON.parse(event.data);if(m.state)applyState(m.state);if(m.type==='event'){
    const e=m.event;
    if(e.type==='like'){hearts(e.count>=10?5:2);if(e.earned){toast('Community boost unlocked · +5s');journal('100 likes. Community boost unlocked.');}}
    if(e.type==='gift'){hearts(8);toast(`${e.name} sent ${e.gift} · +${Math.round(e.seconds)}s boost`);journal(`${e.name} unlocked a ${Math.round(e.seconds)}s boost.`);}
    if(e.type==='boost'){toast(`Boost engaged · +${e.seconds}s`);journal('MCP boost engaged.');}
    if(e.type==='mode'){journal({safe:'Safe drive. Taking the scenic route.',fast:'Fast lane. Looking for clean overtakes.',hardcore:'Hardcore. Precision at pace.'}[e.mode]);}
    if(e.type==='route'){toast('Route preference updated for the next generated section.');}
  }}catch(error){console.warn('Bridge message',error);}});
  ws.addEventListener('close',()=>{bridgeReady=false;$('bridge-status').textContent='RECONNECTING';$('connection-status').textContent='Local bridge disconnected. Retrying…';setTimeout(connectBridge,2000);});
}
async function post(url,body){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');if(data.state&&!bridgeReady)applyState(data.state);return data;}catch(error){toast(error.message);return null;}}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>post('/api/event',{type:'mode',mode:b.dataset.mode})));
document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>post('/api/event',{type:'route',route:b.dataset.route})));
$('tap-button').addEventListener('click',()=>post('/api/event',{type:'like',count:10,name:'You'}));
$('rose-button').addEventListener('click',()=>post('/api/event',{type:'gift',gift:'Rose',seconds:5,name:'You'}));
$('turbo-button').addEventListener('click',()=>post('/api/event',{type:'gift',gift:'Turbo',seconds:15,name:'You'}));
$('connect-form').addEventListener('submit',e=>{e.preventDefault();post('/api/connect',{username:$('username').value});});
$('disconnect-button').addEventListener('click',()=>post('/api/disconnect',{}));
$('capture-button').addEventListener('click',()=>window.open('/?capture=1','autodrive-broadcast','noopener'));
$('game-frame').addEventListener('dblclick',()=>{world.cameraMode=(world.cameraMode+1)%2;toast(world.cameraMode?'High chase camera':'Close chase camera');});
if(capture)$('game-frame').addEventListener('click',e=>{if(e.target.closest('button,input,.map-overlay'))return;post('/api/event',{type:'like',count:1,name:'You'});});
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();post('/api/event',{type:'gift',gift:'Turbo',seconds:15,name:'Keyboard'});}if(e.code==='KeyC'&&world)world.cameraMode=(world.cameraMode+1)%2;});
let audio=null;
$('sound-button').addEventListener('click',async()=>{
  if(!audio){const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();osc.type='sawtooth';filter.type='lowpass';filter.frequency.value=450;gain.gain.value=.022;osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);osc.start();audio={ctx,osc,gain,filter,on:true};await ctx.resume();}
  else{audio.on=!audio.on;audio.gain.gain.setTargetAtTime(audio.on?.022:0,audio.ctx.currentTime,.1);}
  $('sound-button').textContent=audio.on?'♪ SOUND ON':'♪ SOUND OFF';$('sound-button').setAttribute('aria-pressed',String(audio.on));
});

function updateUI(){
  const s=sim.snapshot(),p=sim.position;$('speed').textContent=s.speedKmh;$('gear').textContent=s.speedKmh<1?'D1':'D'+Math.min(6,1+Math.floor(s.speedKmh/35));
  $('distance').textContent=(sim.distance/1000).toFixed(2);$('overtakes').textContent=sim.overtakes;
  $('rpm-fill').style.width=(22+(s.speedKmh%35)*1.7)+'%';$('hud-mode').textContent={safe:'SAFE',fast:'FAST',hardcore:'HARDCORE'}[sim.mode];
  $('autopilot-state').textContent=sim.action.toLowerCase().replace(/^./,c=>c.toUpperCase());
  const district=districtAt(p.x,p.z);$('district').textContent=district.name;$('district-id').textContent='D'+district.id;
  $('road-type').textContent=streetAt(p.x,p.z,p.kind);$('driver-action').textContent=sim.action.replaceAll('_',' ');
  const next=sim.route.junctions.find(j=>j.s>sim.s+10&&j.turn!=='straight');
  if(next){const d=Math.round((next.s-sim.s+38)/10)*10;$('turn-icon').textContent=next.turn==='right'?'↱':'↰';$('turn-distance').textContent=d>=1000?(d/1000).toFixed(1)+' km':d+' m';$('turn-name').textContent=(next.turn==='right'?'Right · ':'Left · ')+districtAt(next.x,next.z).short;}
  else{$('turn-icon').textContent='↑';$('turn-distance').textContent='OPEN ROAD';$('turn-name').textContent='Continue on expressway';}
  $('boost-alert').classList.toggle('active',sim.boost>.1);$('boost-count').textContent=Math.ceil(sim.boost)+'s';
  $('session-clock').textContent='SESSION '+formatTime(sim.time);navigation.draw();$('fps').textContent=clock.fps||'—';$('frame-time').textContent=clock.frameMs.toFixed(1)+' MS';
  if(audio?.on){const rpm=45+(s.speedKmh%35)*2.5+s.speedKmh*.18;audio.osc.frequency.setTargetAtTime(rpm,audio.ctx.currentTime,.12);audio.filter.frequency.setTargetAtTime(300+s.speedKmh*4,audio.ctx.currentTime,.15);}
  if(ws?.readyState===1&&telemetryTick>.5){telemetryTick=0;ws.send(JSON.stringify({type:'telemetry',state:{...s,render:{...world.stats(),fps:clock.fps,frameMs:+clock.frameMs.toFixed(2),frameSource:pump?.source}}}));}
}
function animate(now){
  if(document.hidden){clock.reset();return;}
  const {dt,alpha}=clock.tick(now,d=>sim.update(d));
  world.update(dt,alpha);frame++;uiTick+=dt;telemetryTick+=dt;
  if(uiTick>.10){uiTick=0;updateUI();}
  if(first&&world.city.chunks.size>=12){first=false;$('loading').classList.add('ready');$('loading').setAttribute('aria-hidden','true');journal('Atlas S4 ready. Autodrive is on.');}
}
document.addEventListener('visibilitychange',()=>{clock.reset();if(!document.hidden)fetch('/api/state').then(r=>r.json()).then(applyState).catch(()=>{});});
try{world=new World($('scene'),sim);navigation=new Navigation(sim);connectBridge();pump=new FramePump(animate);pump.start();
  // Read-only diagnostics for support and simulation QA.
  window.nightdrive={snapshot:()=>({...sim.snapshot(),render:world.stats()}),get simulation(){return sim;},get world(){return world;}};
  window.autodrive=window.nightdrive;
}catch(error){console.error(error);$('loading').innerHTML='<b>3D RENDERER UNAVAILABLE</b><small>Enable browser hardware acceleration, then reload.</small>';$('error-banner').textContent=error.message;$('error-banner').hidden=false;}
