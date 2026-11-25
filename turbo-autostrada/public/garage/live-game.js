import { GarageScene } from './scene.js';
import { DistrictView } from './district.js';
import { carDefinition } from './model.js';
import { STYLES } from './live-rules.js';
const $=s=>document.querySelector(s),fmt=n=>Math.floor(n).toLocaleString('en-US');
if(new URLSearchParams(location.search).has('source'))document.body.classList.add('source-mode');
let ws,paused=false,district=null,viewPhase='',modelSignature='',lastEffect='',audio=null,soundOn=false;
const scene=new GarageScene($('#game-stage'));await scene.ready;scene.autoRotate=true;
function connect(){ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/garage-ws?role=game`);
ws.onclose=()=>{$('#game-boot').hidden=true;$('#game-pause').hidden=false;$('#game-pause').textContent='GAME SERVER OFFLINE';setTimeout(connect,1800);};
ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='game-state'){render(m.snapshot);$('#game-boot').hidden=true;}if(m.type==='save-error')$('#live-save').textContent='SERVER SAVE UNAVAILABLE';}catch(error){console.error('Game display',error);}};}connect();
function render(s){if(!s?.car)return;
  paused=!!s.paused;
  const signature=JSON.stringify(s.car);if(signature!==modelSignature){scene.setProject(s.car);modelSignature=signature;}
  const transitioning=s.phase!==viewPhase;
  if(transitioning){viewPhase=s.phase;document.body.classList.toggle('travel',s.phase==='travel');document.body.classList.toggle('results',s.phase==='results');
    $('#travel-stage').hidden=s.phase!=='travel';
    if(s.phase==='travel'){
      if(!district){district=new DistrictView($('#travel-stage'),()=>{});district.controls.autoRotate=true;district.controls.autoRotateSpeed=1;district.select('track');}
      district.active=true;
      scene.renderer.setAnimationLoop(null);
    }else{if(district)district.active=false;scene.renderer.setAnimationLoop(()=>scene.animate());scene.timer.reset();}
    scene.autoRotate=['build','results','collect'].includes(s.phase);
  }
  scene.setDuel(s.phase==='race'?s.run:null,s.phase==='race'?s.rival:null); scene.revPulse=s.rev||0; scene.assist=s.phase==='race'?s.audienceAssist||0:0;
  if(s.phase!=='race')scene.setHood(!!s.hoodOpen);
  const left=s.phase==='build'?Math.max(0,35-s.phaseTime):s.phase==='travel'?Math.max(0,4-s.phaseTime):s.phase==='results'?Math.max(0,7-s.phaseTime):s.phase==='collect'?Math.max(0,6-s.phaseTime):s.run?.time||0;
  $('#phase-name').textContent=({build:'BUILD PHASE',travel:'HEADING TO DOCKSIDE',race:'400 M / HEAD-TO-HEAD',results:'RACE COMPLETE',collect:'SHOWROOM / NEXT PROJECT'})[s.phase];
  $('#phase-clock').textContent=s.phase==='race'?`${left.toFixed(1)}s`:`${Math.ceil(left)}s`;
  $('#connection-badge').textContent=s.live?'TIKTOK LIVE':'DEMO';$('#live-car').textContent=carDefinition(s.car).name.toUpperCase();$('#live-hp').textContent=s.hp;$('#live-round').textContent=`ROUND ${String(s.round).padStart(2,'0')}`;
  $('#live-goal').textContent=`${s.goal.type==='car'?'NEXT CAR':'NEXT PART'}: ${s.goal.name.toUpperCase()}`;$('#live-fund').textContent=`₡ ${fmt(s.credits)} / ${fmt(s.goal.cost)}`;$('#live-fund-bar').style.width=`${s.goal.cost?Math.min(100,s.credits/s.goal.cost*100):100}%`;
  $('#live-crew').textContent=s.crew;$('#live-collection').textContent=`${s.completed} CARS COMPLETED`;
  $('#charge-percent').textContent=`${Math.floor(s.charge)}%`;$('#charge-bar').style.width=`${s.charge}%`;document.body.classList.toggle('boosting',!!s.run?.boosting||s.audienceAssist>.02);document.body.classList.toggle('hyper',s.phase==='race'&&(s.audienceAssist>.12||!!s.run?.boosting));$('#boost-label').textContent=s.phase==='race'?(s.audienceAssist>.02?'AUDIENCE POWER / SPEED UP!':'TAPS ADD SPEED • GIFTS FIRE TURBO'):'TAPS CHARGE BOOST FOR THE NEXT RACE';
  [0,1,2].forEach(i=>{$(`#vote-${i+1}`).classList.toggle('leading',i===s.style);$(`#vote-${i+1}`).innerHTML=`<b>${i+1}</b> ${STYLES[i].name}${s.votes[i]?' / '+s.votes[i]:''}`;});
  $('#game-pause').hidden=!s.paused;$('#game-pause').textContent='GARAGE PAUSED';
  const racing=s.phase==='race';document.body.classList.toggle('racing',racing);if(!racing)document.body.classList.remove('neck-and-neck','hyper');$('#race-overlay').hidden=!racing;$('#duel-top').hidden=!racing;$('#tap-boost').hidden=!racing;$('.phase-banner').hidden=racing;
  if(racing){
    $('#race-speed').textContent=Math.round(s.run.speed*3.6);$('#race-distance').textContent=`${Math.floor(s.run.distance)} / 400 M`;$('#race-time').textContent=`${s.run.time.toFixed(2)} s`;$('#race-distance-bar').style.width=`${s.run.distance/4}%`;
    $('#player-duel-speed').textContent=`${Math.round(s.run.speed*3.6)} KM/H`;$('#rival-speed').textContent=`${Math.round(s.rival.speed*3.6)} KM/H`;
    $('#rival-name').textContent=`${s.rival.name} / ${s.rival.offsetPercent>0?'+':''}${s.rival.offsetPercent}%`;
    $('#player-progress').style.width=`${s.run.distance/4}%`;$('#rival-progress').style.width=`${s.rival.distance/4}%`;
    $('#race-position').textContent=s.run.finished?'YOU CROSSED THE LINE!':Math.abs(s.gap)<.5?'SIDE BY SIDE!':s.gap>0?(s.rival.pushing?`${s.rival.name} IS CLOSING IN / +${s.gap.toFixed(1)} M`:`YOU LEAD / ${s.gap.toFixed(1)} M`):`CATCH THEM / ${Math.abs(s.gap).toFixed(1)} M`;
    document.body.classList.toggle('neck-and-neck',!s.run.finished&&Math.abs(s.gap)<2.5);
    const kmh=s.run.speed*3.6;$('#live-frame').style.setProperty('--speed-fx',Math.min(1,Math.max(0,(kmh-70)/200)+(s.run.boosting||s.audienceAssist>.02?.35:0)).toFixed(2));
    $('#race-position').classList.toggle('behind',s.gap<0);$('#race-gear').textContent=s.run.gear??Math.min(6,1+Math.floor(s.run.speed*3.6/42));
    $('#tap-boost span').textContent=s.gap<0?'TO OVERTAKE':'KEEP THE LEAD';
  }
  else{const title=s.phase==='results'?(s.result?.draw?'PHOTO FINISH!':s.result?.won?'YOU WIN!':'RIVAL WINS!'):s.phase==='travel'?'TIME TO<br>PROVE IT.':s.phase==='collect'?'BUILD SAVED!<br>NEXT CAR.':'BUILD OUR<br>DREAM CAR.';
    $('#phase-headline').innerHTML=title;$('#phase-overline').textContent=s.phase==='results'?`YOU ${s.result?.time.toFixed(2)} S / ${s.result?.rivalName} ${s.result?.rivalTime?.toFixed(2)} S`:s.phase==='travel'?'WORKSHOP → HEAD-TO-HEAD':s.phase==='collect'?'THE COMMUNITY BUILT THIS':`CHAT VOTES: ${STYLES[s.style].name} BUILD`;
    $('#phase-subtitle').textContent=s.phase==='results'?`FINISH ${s.result?.speed||0} KM/H / +₡ ${s.result?.reward||400} • ${s.result?.won?'THE CREW DID IT!':'TAP FASTER NEXT ROUND!'}`:s.phase==='travel'?'Rival speed: 5% above or below your base pace.':s.phase==='collect'?'The build and its contributors are in the collection.':'Click the hood to inspect • Tap the car to rev.';
  }
  if(s.effect?.id!==lastEffect&&s.effect){lastEffect=s.effect.id;
    if(s.effect.kind==='part'){$('#delivery-name').textContent=s.effect.name;$('#delivery-part').textContent=s.effect.text;const box=$('#delivery');box.classList.remove('active');requestAnimationFrame(()=>box.classList.add('active'));}
    else if(s.effect.kind==='speed') {if(s.phase==='race')scene.kick(.3);const pop=$('#speed-pop');pop.textContent=s.effect.text;pop.classList.remove('show');requestAnimationFrame(()=>pop.classList.add('show'));}
    else{if(s.phase==='race'){scene.kick(1.1);const flash=$('#flash');flash.classList.remove('on');requestAnimationFrame(()=>flash.classList.add('on'));}$('#gift-sender').textContent=s.effect.name;$('#gift-label').textContent=s.effect.text;const pop=$('#gift-pop');pop.classList.remove('show');requestAnimationFrame(()=>pop.classList.add('show'));}
  }
}
function sound(){if(audio)return;const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;const context=new Context(),gain=context.createGain(),filter=context.createBiquadFilter(),osc=context.createOscillator(),osc2=context.createOscillator();osc.type='sawtooth';osc2.type='square';filter.type='lowpass';filter.frequency.value=300;filter.Q.value=4;gain.gain.value=0;osc.connect(filter);osc2.connect(filter);filter.connect(gain);gain.connect(context.destination);osc.start();osc2.start();audio={context,gain,filter,osc,osc2};}
$('#sound-button').onclick=()=>{sound();audio?.context.resume();soundOn=!soundOn;$('#sound-button').textContent=soundOn?'MUTE':'SOUND';};$('#fullscreen-button').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('#live-frame').requestFullscreen();$('#host-button').onclick=()=>window.open('./host.html','dream-garage-host');
const sendControl=m=>{if(ws?.readyState===1)ws.send(JSON.stringify({type:'control',...m}));};
$('#tap-boost').onclick=()=>sendControl({action:'tap',count:1,name:'TAP CREW'});
let touchStart=null;scene.renderer.domElement.addEventListener('pointerdown',e=>touchStart={x:e.clientX,y:e.clientY,time:performance.now()});
scene.renderer.domElement.addEventListener('pointerup',e=>{if(!touchStart||performance.now()-touchStart.time>450||Math.hypot(e.clientX-touchStart.x,e.clientY-touchStart.y)>10)return;touchStart=null;if(viewPhase==='race')sendControl({action:'tap',count:1});else if(viewPhase==='build'){const action=scene.interactCar(e.clientX,e.clientY);if(action)sendControl({action});}});
document.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();sendControl({action:viewPhase==='race'?'tap':'rev',count:1});return;}if(e.repeat)return;const key=e.key.toLowerCase();if(key==='h')$('#host-button').click();if(key==='s')$('#sound-button').click();if(key==='f')$('#fullscreen-button').click();if(key==='n')sendControl({action:'next'});if(key==='r')sendControl({action:'race'});if(key==='p')sendControl({action:paused?'resume':'pause'});if(key==='g')sendControl({action:'gift',gift:'toolbox',name:'TestDriver'});if(key==='t')sendControl({action:'like'});if(['1','2','3'].includes(key))sendControl({action:'vote',vote:key,name:'HostTest'});});
function frame(){if(audio){const racing=viewPhase==='race';audio.gain.gain.setTargetAtTime(soundOn?(racing?.035:.012+(scene.revPulse||0)*.02):0,audio.context.currentTime,.08);const rpm=racing?(scene.run?.shifting?.55:.35+.7*Math.min(1.05,scene.run?.rpm||0)):.25+(scene.revPulse||0)*.6,hz=38+rpm*150;audio.osc.frequency.setTargetAtTime(hz,audio.context.currentTime,scene.run?.shifting?.02:.05);audio.osc2.frequency.setTargetAtTime(hz*.502,audio.context.currentTime,.05);audio.filter.frequency.setTargetAtTime(racing?600+rpm*1400+(document.body.classList.contains('boosting')?900:0):280+(scene.revPulse||0)*1000,audio.context.currentTime,.06);}requestAnimationFrame(frame);}requestAnimationFrame(frame);
