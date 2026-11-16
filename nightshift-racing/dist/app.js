import { RaceEngine, CARS, GIFTS, giftTier, clamp, validCount, advanceCrowdSimulation } from './rules.js';
import { RaceScene } from './scene.js';

const $ = id => document.getElementById(id);
const svg = icon => `<svg><use href="#i-${icon}"/></svg>`;
const STORAGE = 'nightshift-racing-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch {}
const safeNumber = n => Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0;
const profile = { points: safeNumber(saved.points), races: safeNumber(saved.races), wins: safeNumber(saved.wins), taps: safeNumber(saved.taps), unlocked: [0, ...[1,2,3].filter(i => Array.isArray(saved.unlocked) && saved.unlocked.includes(i))], selected: 0 };
profile.selected = profile.unlocked.includes(saved.selected) ? saved.selected : 0;
const settings = { duration: [30,60].includes(saved.duration) ? saved.duration : 30, audience:['auto','0','1000','2000','10000'].includes(String(saved.audience))?String(saved.audience):'auto', difficulty:saved.difficulty==='relentless'?'relentless':'hard', auto: saved.auto !== false, quality: saved.quality === 'performance' ? 'performance' : 'high' };
let liveViewers=0,simulation=null,simulationViewers=0;
const effectiveAudience=()=>simulation?simulationViewers:settings.audience==='auto'?liveViewers:Number(settings.audience);
let engine = new RaceEngine({ duration: settings.duration, car: profile.selected, round: profile.races + 1, audience:effectiveAudience(), difficulty:settings.difficulty });
let scene, resultShown = false, lastCount = '', calloutTimer, noticeTimer, pausedForVisibility = false;
let audio, oscillator, engineGain, soundEnabled = false;
let liveConnected = false, bridgeAvailable = false, bridgeEvents;
const persist = () => { try { localStorage.setItem(STORAGE, JSON.stringify({ ...profile, duration: settings.duration, auto: settings.auto, quality: settings.quality, audience:settings.audience, difficulty:settings.difficulty })); } catch {} };
function notice(message) { $('notice').textContent = message; $('notice').classList.add('show'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').classList.remove('show'), 3200); }
function callout(title, subtitle, duration = 1800) {
  $('callout-title').textContent = title; $('callout-small').textContent = subtitle;
  $('callout').classList.add('show'); clearTimeout(calloutTimer); calloutTimer = setTimeout(() => $('callout').classList.remove('show'), duration);
}
function carThumbnail(color, wing) {
  return `<svg viewBox="0 0 115 52" aria-hidden="true"><defs><linearGradient id="paint-${color.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".22" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".5"/></linearGradient></defs><ellipse cx="56" cy="45" rx="51" ry="4" fill="#000" opacity=".7"/>${wing?'<path d="M6 20h24v3H6zm5 2h3v9h-3" fill="#647473"/>':''}<path d="m5 34 7-9 21-5 16-9h27l18 14 15 6 2 10-6 4H9l-6-5z" fill="url(#paint-${color.slice(1)})"/><path d="m38 21 13-8h22l13 12-50-1z" fill="#17282f"/><path d="m55 14-4 10m22-10 8 11" stroke="#648895"/><path d="M10 33h20m57-3 17 4" stroke="#f0f8ea" stroke-width="2"/><path d="m39 28 42 1-2 9H36z" fill="#000" opacity=".13"/><circle cx="26" cy="40" r="10" fill="#090f14"/><circle cx="88" cy="40" r="10" fill="#090f14"/><circle cx="26" cy="40" r="6" fill="#899b9e"/><circle cx="88" cy="40" r="6" fill="#899b9e"/><path d="m22 36 8 8m0-8-8 8m62-8 8 8m0-8-8 8" stroke="#1c272e" stroke-width="2"/></svg>`;
}
function renderGarage() {
  $('points').textContent = Math.floor(profile.points).toLocaleString();
  $('total-races').textContent = profile.races; $('total-wins').textContent = profile.wins; $('total-taps').textContent = profile.taps.toLocaleString();
  $('garage').innerHTML = CARS.map((car, i) => {
    const owned = profile.unlocked.includes(i), active = profile.selected === i, afford = profile.points >= car.price;
    const action = active ? 'EQUIPPED' : owned ? 'SELECT' : `${car.price.toLocaleString()} PTS`;
    const thumbnail=scene?.thumbnails?.[car.id];
    return `<button class="garage-car ${active ? 'equipped' : ''} ${!owned && !afford ? 'locked' : ''}" data-car="${i}" style="--car-color:${car.color}" aria-label="${owned ? 'Equip' : 'Unlock'} ${car.name}${owned ? '' : ` for ${car.price} points`}"><span class="car-thumb">${thumbnail?`<img src="${thumbnail}" alt="">`:carThumbnail(car.color,i>0)}</span><span><strong>${car.name}</strong><small>${car.class} ${car.speed ? `· +${car.speed} KM/H` : '· STARTER'}</small></span><span class="car-action">${!owned ? svg('lock') : ''}${action}</span></button>`;
  }).join('');
  const nextIndex = CARS.findIndex((_, i) => !profile.unlocked.includes(i));
  const next = CARS[nextIndex];
  $('unlock-label').textContent = next ? `NEXT UNLOCK · ${next.name}` : 'GARAGE COMPLETE · ALL CARS UNLOCKED';
  $('unlock-count').textContent = next ? `${Math.floor(profile.points).toLocaleString()} / ${next.price.toLocaleString()}` : '4 / 4';
  $('unlock-progress').style.width = `${next ? Math.min(100, profile.points / next.price * 100) : 100}%`;
  document.querySelectorAll('[data-car]').forEach(button => button.addEventListener('click', () => selectCar(Number(button.dataset.car))));
}
function selectCar(index) {
  const car = CARS[index];
  if (!profile.unlocked.includes(index)) {
    if (profile.points < car.price) { $('preview-title').textContent=car.name;$('preview-image').src=scene?.thumbnails?.[car.id]||'';$('preview-description').textContent=`${car.subtitle} ${car.class} · +${car.speed} km/h base speed. Earn ${(car.price-profile.points).toLocaleString()} more points to unlock.`;$('car-preview').showModal(); return; }
    profile.points -= car.price; profile.unlocked.push(index); notice(`${car.name} unlocked. Ready for the next race.`);
  } else if (index !== profile.selected) notice(`${car.name} selected for the next race.`);
  profile.selected = index; persist(); renderGarage();
  if (engine.phase !== 'racing') { engine.car=index; engine.cars[0].color=car.color; scene?.equip(car); updateCarLabel(); }
}
function updateCarLabel() { const car = CARS[engine.car]; $('car-name').textContent = car.name; $('car-class').textContent = car.class.slice(-1); }
function tap(count=1, user='', live=false) {
  count=validCount(count);if(!scene?.ready||!count)return;
  const gain=engine.tap(count,{live});if(!gain)return;
  profile.taps += count;
  if (!live && count < 20) {
    const particle = document.createElement('span'); particle.className = 'tap-particle'; particle.textContent = `+${gain.toFixed(1)}`; particle.style.setProperty('--x',`${30+Math.random()*35}%`); $('tap-particles').appendChild(particle); setTimeout(() => particle.remove(),700);
  }
  $('tap').classList.add('pressed'); setTimeout(() => $('tap').classList.remove('pressed'),70);
  if (user && count>=10) $('race-status').textContent = `${user.slice(0,20)} · ${count} TAPS`;
}
function gift(tier, count=1, user='YOU') {
  if (!scene?.ready || !engine.gift(tier,count)) { notice('The next race starts soon. Save that boost for the starting line.'); return; }
  const gift = GIFTS[tier]; callout(gift.label,`${user.slice(0,24).toUpperCase()} · ${gift.name.toUpperCase()}${count>1?` ×${count}`:''} · +${gift.speed} KM/H`,2400);
  if(soundEnabled) boostSound();
}
function nextRace() {
  engine=new RaceEngine({duration:settings.duration,car:profile.selected,round:profile.races+1,audience:effectiveAudience(),difficulty:settings.difficulty}); resultShown=false;lastCount='';renderHud.lastPass=null;renderHud.lastCaught=null;
  $('result').hidden=true; $('countdown').hidden=false; $('race-status').textContent='AUTOMATIC RACES · EVERY TAP COUNTS';
  $('round-label').textContent=`RACE ${String(profile.races+1).padStart(3,'0')}`; updateCarLabel();scene?.equip(CARS[profile.selected]);scene?.setQuality(settings.quality);
  $('track-meta').textContent=`4 DRIVERS · ${settings.duration} SECONDS · ONE WINNER`;
  callout('MAKE SOME NOISE.',`${settings.duration}S ${settings.difficulty==='relentless'?'RELENTLESS':'STREET'} RACE · TAP TO LAUNCH`,1800);
}
function finishRace() {
  resultShown=true;const {rank,points,taps}=engine.result;
  profile.points+=points;profile.races++;if(rank===1)profile.wins++;persist();renderGarage();
  $('result').classList.toggle('won',rank===1);$('result-eyebrow').textContent=rank===1?'THE CROWD DID THAT.':'RACE COMPLETE';
  $('result-title').textContent=['OWN THE NIGHT.','SO CLOSE.','KEEP PUSHING.','RUN IT BACK.'][rank-1];
  $('result-subtitle').textContent=rank===1?'One crowd. One car. One perfect finish.':`Finished ${['1st','2nd','3rd','4th'][rank-1]}. Keep tapping to outpace Viper.`;
  $('result-position').textContent=['1ST','2ND','3RD','4TH'][rank-1];$('result-points').textContent=`+${points}`;$('result-taps').textContent=taps.toLocaleString();
  $('result').hidden=false;$('countdown').hidden=true;$('callout').classList.remove('show');
  $('next-timer').parentElement.style.visibility=settings.auto?'visible':'hidden';
}
function renderHud() {
  const seconds=Math.max(0,engine.duration-engine.elapsed),whole=Math.floor(seconds),fraction=Math.floor((seconds-whole)*100);
  $('timer').innerHTML=`${String(whole).padStart(2,'0')}<span>.${String(fraction).padStart(2,'0')}</span>`;
  document.querySelector('.timer-block').classList.toggle('urgent',seconds<=5&&engine.phase==='racing');
  $('race-progress').style.width=`${engine.elapsed/engine.duration*100}%`;
  $('position').textContent=engine.position;
  $('speed').textContent=String(Math.round(engine.cars[0].speed)).padStart(3,'0');
  $('gear').textContent=engine.cars[0].speed<5?'N':Math.min(6,Math.floor(engine.cars[0].speed/46)+1);
  $('power-label').innerHTML=`CROWD POWER <b>+${engine.tapPower.toFixed(1)}</b> KM/H`;
  const lights=Math.floor(engine.cars[0].speed/460*26);[...$('rpm').children].forEach((el,i)=>el.classList.toggle('on',i<lights));
  $('combo').textContent=`×${engine.combo>=1000?`${(engine.combo/1000).toFixed(1)}K`:engine.combo}`;$('combo').classList.toggle('show',engine.combo>=3&&engine.phase==='racing');
  const boosted=engine.boosts.length>0&&engine.phase==='racing';$('boost-status').classList.toggle('show',boosted);$('boost-vignette').classList.toggle('show',boosted);
  $('boost-status').querySelector('strong').textContent=`${engine.boostLeft.toFixed(1)}s`;
  $('boost-status').querySelector('span').textContent=engine.boostSpeed>=150?'BEAST MODE':engine.boostSpeed>=90?'OVERDRIVE':'NITRO ACTIVE';
  $('rival-pressure').textContent=engine.phase==='racing'&&engine.cars[1].catchup>8?'VIPER IS CLOSING':engine.difficulty==='relentless'?'RELENTLESS RIVALS':'HARD RIVALS';
  const leaderDistance=engine.order[0].distance;
  $('leaderboard').innerHTML=engine.order.map((car,i)=>`<div class="leader-row ${car.id==='you'?'you':''}" style="--car-color:${car.color}"><b>${i+1}</b><i></i><span>${car.name}</span><small>${i===0?'LEADER':`+${Math.max(.01,(leaderDistance-car.distance)/Math.max(car.speed/3.6,1)).toFixed(2)}s`}</small></div>`).join('');
  if(engine.phase==='countdown'){
    const count=String(Math.max(1,3-Math.floor(engine.phaseTime)));if(count!==lastCount){$('countdown').textContent=count;$('countdown').classList.remove('pop');void $('countdown').offsetWidth;$('countdown').classList.add('pop');lastCount=count;}
  }else if(lastCount!=='GO'&&engine.phase==='racing'){
    lastCount='GO';$('countdown').textContent='GO';$('countdown').classList.remove('pop');void $('countdown').offsetWidth;$('countdown').classList.add('pop');setTimeout(()=>{$('countdown').textContent='';},650);
  }
  if(engine.lastOvertake&&engine.elapsed-engine.lastOvertake.at<.08 && engine.lastOvertake.at!==renderHud.lastPass){renderHud.lastPass=engine.lastOvertake.at;callout(engine.position===1?'TAKE THE LEAD.':'CLEAN OVERTAKE.',engine.position===1?'KEEP TAPPING. VIPER IS COMING.':`UP TO P${engine.position} · KEEP THE PRESSURE ON`,1500);}
  if(engine.lastCaught&&engine.elapsed-engine.lastCaught.at<.08&&engine.lastCaught.at!==renderHud.lastCaught){renderHud.lastCaught=engine.lastCaught.at;callout('THEY’RE FIGHTING BACK.','KEEP TAPPING. BUILD YOUR SPEED.',1500);}
  if(engine.phase==='racing'&&seconds<5&&seconds>4.9&&!renderHud.finalSprint){renderHud.finalSprint=true;callout('FINAL SPRINT.','EVERY TAP COUNTS NOW',1800);}
  if(engine.phase==='countdown')renderHud.finalSprint=false;
  if(engine.phase==='finished'){$('next-timer').textContent=Math.max(0,Math.ceil(7-engine.phaseTime));if(!resultShown)finishRace();if(settings.auto&&engine.phaseTime>7)nextRace();}
  $('total-taps').textContent=profile.taps.toLocaleString();
  if(soundEnabled&&audio&&oscillator){oscillator.frequency.setTargetAtTime(35+engine.cars[0].speed*.56,audio.currentTime,.12);engineGain.gain.setTargetAtTime(engine.phase==='racing'?.035:.009,audio.currentTime,.2);}
}
function toggleSound(){
  if(!audio){audio=new AudioContext();oscillator=audio.createOscillator();oscillator.type='sawtooth';engineGain=audio.createGain();engineGain.gain.value=0;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=380;oscillator.connect(filter);filter.connect(engineGain);engineGain.connect(audio.destination);oscillator.start();}
  soundEnabled=!soundEnabled;audio.resume().catch(()=>{});if(!soundEnabled)engineGain.gain.setTargetAtTime(0,audio.currentTime,.1);
  $('sound').textContent=soundEnabled?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-label',soundEnabled?'Mute engine sound':'Enable engine sound');
}
function boostSound(){const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(130,audio.currentTime);o.frequency.exponentialRampToValueAtTime(700,audio.currentTime+.4);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.7);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.7);}

// The public preview is fully playable. The local launcher additionally serves the LIVE bridge.
async function initialiseBridge(){
  try{
    const response=await fetch('./api/status',{signal:AbortSignal.timeout(2000)});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('No local bridge');
    const state=await response.json();if(state.app!=='nightshift')throw new Error('No local bridge');
    bridgeAvailable=true;$('bridge-label').textContent='BRIDGE READY';setConnection(state);
    bridgeEvents=new EventSource('./api/events');
    bridgeEvents.onmessage=event=>{try{handleLiveEvent(JSON.parse(event.data));}catch(error){console.warn('LIVE event could not be processed:',error.message);}};
    bridgeEvents.onerror=()=>{$('bridge-label').textContent='RECONNECTING';if(liveConnected){liveConnected=false;$('connection-dot').classList.remove('connected');$('connection-label').textContent='BRIDGE RECONNECTING';$('game-mode').textContent='DEMO';}};
    bridgeEvents.onopen=()=>{$('bridge-label').textContent='BRIDGE READY';};
  }catch{$('bridge-label').textContent='WEB PREVIEW';$('connection-help').textContent='Play the demo here. Use the local START launcher to connect TikTok LIVE.';}
}
function handleLiveEvent(message){if(message.type==='batch'){for(const event of message.events||[])handleLiveEvent(event);}else if(message.type==='status')setConnection(message);else if(message.type==='audience'){liveViewers=validCount(message.viewers);updateAudience();}else if(message.type==='like')tap(message.count,message.user,true);else if(message.type==='gift')gift(message.tier||giftTier(message.coins),message.count,message.user);}
function updateAudience(){engine.setAudience(effectiveAudience());$('crowd-label').textContent=simulation?`SIMULATING ${simulationViewers.toLocaleString()} VIEWERS`:effectiveAudience()?`${effectiveAudience().toLocaleString()} VIEWERS · SCALED INPUT`:'SOLO TAPS · READY FOR LIVE';}
function setConnection(state){liveConnected=state.connected;liveViewers=validCount(state.viewers);if(state.connected&&simulation)toggleSimulation();updateAudience();$('connection-label').textContent=state.connected?'TIKTOK LIVE':state.connecting?'CONNECTING…':'DEMO SESSION';$('connection-dot').classList.toggle('connected',state.connected);$('game-mode').textContent=state.connected?'LIVE':'DEMO';$('connect-message').textContent=state.message||'';$('connect-button').disabled=!!state.connecting;$('username').disabled=!!state.connecting||!!state.connected;$('connect-button').title=state.connected?'Disconnect TikTok LIVE':'Connect TikTok LIVE';$('connect-button').setAttribute('aria-label',state.connected?'Disconnect TikTok LIVE':'Connect TikTok LIVE');if(state.username)$('username').value=state.username;}
function toggleSimulation(){if(simulation){simulation=null;simulationViewers=0;$('simulate-crowd').textContent='SIMULATE CROWD';}else{if(liveConnected){notice('Disconnect LIVE before simulating an audience.');return;}simulationViewers=Number(settings.audience)||1000;simulation={viewers:simulationViewers,remainder:0};$('simulate-crowd').textContent='STOP SIMULATION';}updateAudience();}
$('simulate-crowd').addEventListener('click',toggleSimulation);
$('audience').value=settings.audience;$('audience').addEventListener('change',()=>{settings.audience=$('audience').value;if(simulation){simulationViewers=Number(settings.audience)||1000;simulation.viewers=simulationViewers;}updateAudience();persist();});
$('connect-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!bridgeAvailable){notice('TikTok LIVE needs the local bridge. Double-click START-NIGHTSHIFT.bat in your game folder.');return;}
  const username=$('username').value.trim().replace(/^@/,'');if(!liveConnected&&!/^[\w.]{2,32}$/.test(username)){ $('connect-message').textContent='Enter your TikTok username, without the @.';return; }
  $('connect-button').disabled=true;
  try{const response=await fetch(`./api/${liveConnected?'disconnect':'connect'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})});const state=await response.json();setConnection(state);}catch{$('connect-message').textContent='The local bridge is unavailable. Restart the launcher.';}
  finally{$('connect-button').disabled=false;}
});

$('tap').addEventListener('pointerdown',e=>{if(e.button!==0)return;tap();});
document.querySelectorAll('[data-gift]').forEach(button=>button.addEventListener('click',()=>gift(button.dataset.gift)));
$('race-again').addEventListener('click',nextRace);$('camera').addEventListener('click',()=>scene?.nextCamera());$('sound').addEventListener('click',toggleSound);
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen();}catch{toggleBroadcast();}});
function toggleBroadcast(){document.body.classList.toggle('broadcast-mode');scene?.resize();}
$('broadcast').addEventListener('click',toggleBroadcast);
if(new URLSearchParams(location.search).has('broadcast'))document.body.classList.add('broadcast-mode');
$('duration').value=settings.duration;$('quality').value=settings.quality;$('auto-race').checked=settings.auto;$('difficulty').value=settings.difficulty;
$('settings-open').addEventListener('click',()=>$('settings').showModal());
$('settings').addEventListener('close',()=>{settings.duration=Number($('duration').value);settings.difficulty=$('difficulty').value;settings.auto=$('auto-race').checked;settings.quality=$('quality').value;persist();scene?.setQuality(settings.quality);notice('Race settings saved for the next race.');});
document.addEventListener('keydown',event=>{
  if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)||$('settings').open||$('car-preview').open)return;
  if(event.code==='Space'){event.preventDefault();if(!event.repeat)tap();}
  if(event.code==='KeyC')scene?.nextCamera();
  if(event.code==='Escape'&&document.body.classList.contains('broadcast-mode'))toggleBroadcast();
  if(event.code==='KeyM')toggleSound();
  if(/^Digit[1-4]$/.test(event.code)&&!event.repeat)gift(['rose','energy','galaxy','lion'][Number(event.code.slice(-1))-1]);
});
document.addEventListener('visibilitychange',()=>{pausedForVisibility=document.hidden;});
window.addEventListener('pagehide',persist);
for(let i=0;i<26;i++){const bar=document.createElement('i');if(i>21)bar.className='red';$('rpm').appendChild(bar);}
renderGarage();updateCarLabel();
let previous=performance.now(),hudTime=0;
async function start(){
  try{
    scene=new RaceScene($('stage'),name=>$('camera-label').textContent=name);scene.setQuality(settings.quality);
    await scene.load(percent=>$('load-status').textContent=`Loading detailed car model… ${percent}%`);scene.equip(CARS[profile.selected]);
    $('loading').classList.add('hide');$('loading').setAttribute('aria-hidden','true');renderGarage();nextRace();previous=performance.now();
    requestAnimationFrame(frame);initialiseBridge();
  }catch(error){console.error(error);$('load-status').textContent=`Unable to load 3D graphics. ${error.message}`;$('loading').querySelector('strong').textContent='LET’S GET YOU BACK ON TRACK.';const retry=document.createElement('button');retry.textContent='RETRY';retry.style.cssText='background:#d3ff39;color:#152000;padding:12px 35px;margin-top:15px';retry.onclick=()=>location.reload();$('loading').appendChild(retry);}
}
function step(now){const dt=Math.max(0,(now-previous)/1000);previous=now;if(simulation){const before=engine.taps;advanceCrowdSimulation(engine,dt,simulation);profile.taps+=engine.taps-before;$('race-status').textContent=`SIMULATED ${simulationViewers.toLocaleString()} VIEWERS`;}else engine.update(dt);hudTime+=dt;if(hudTime>.045){renderHud();hudTime=0;}return dt;}
function frame(now){const dt=step(now);if(!document.hidden)scene.update(engine,Math.min(.1,dt));requestAnimationFrame(frame);}
setInterval(()=>{if(document.hidden&&scene?.ready)step(performance.now());},250);
start();
