// The LIVE simulation runs in Node, independent of browser focus and rendering.
import { stats, rewardRun, serviceCar } from './public/garage/model.js';
import { restoreLiveSave,chooseGoal,completeGoal,applyLiveEvent,simulatedGift } from './public/garage/live-rules.js';
import { createDuel, advanceDuel, tapDuel, giftDuel, duelResult } from './duel-race.js';
export class LiveEngine {
 constructor(raw){this.save=restoreLiveSave(raw);this.phase='build';this.time=0;this.paused=false;this.run=null;this.runCar=null;this.duel=null;this.difficulty='auto';this.hoodOpen=false;this.revUntil=0;this.lastTapNotice=-1;this.result=null;this.effect=null;this.sequence=0;this.lastInstall=0;this.builder='BUILD CREW';this.votes=[0,0,0];this.context={seen:new Set(),votes:new Map()};this.creditCarry=0;}
 get car(){return this.save.garage.projects[this.save.garage.active];}
 effectOf(kind,name,text){this.effect={id:`${Date.now()}-${++this.sequence}`,kind,name:String(name||'BUILD CREW').slice(0,24),text:String(text).slice(0,80)};}
 setPhase(phase){this.phase=phase;this.time=0;this.lastInstall=0;this.revUntil=0;this.lastTapNotice=-1;
  if(phase==='build'){this.context.votes.clear();this.votes=[0,0,0];this.run=null;this.duel=null;}
  if(phase==='race'){this.hoodOpen=false;this.duel=createDuel(this.car,this.save.round,this.difficulty);this.run=this.duel.player;this.runCar=this.duel.car;}
  if(phase==='results'){this.result=duelResult(this.duel);rewardRun(this.save.garage,this.run);this.save.garage.credits+=this.result.reward-400;this.save.runsOnCar++;}
 }
 next(){if(this.phase==='build')this.setPhase('travel');else if(this.phase==='travel')this.setPhase('race');else if(this.phase==='race'){for(let i=0;i<30000&&!(this.run.finished&&this.duel.rival.finished);i++)this.save.charge=advanceDuel(this.duel,.02,this.save.charge);this.setPhase('results');}else if(this.phase==='results')this.endResults();else this.setPhase('build');}
 // the end of a round is the same whether the timer or the host ends it: next round, service the car, back to the build
 endResults(){this.save.round++;if(this.car.condition<90)serviceCar(this.save.garage);this.setPhase('build');}
 event(event){if(!event||typeof event!=='object')return;if(event.type==='chat'&&['hood','rev'].includes(String(event.text||'').trim().toLowerCase())){this.control({action:String(event.text).trim().toLowerCase()});return;}const out=applyLiveEvent(this.save,event,this.context);if(!out)return;
  if(out.counts)this.votes=out.counts;
  if(out.kind==='gift'){this.builder=out.name;if(this.phase==='race'&&!this.paused)giftDuel(this.duel,out.credits);this.effectOf('gift',out.name,`${out.text} / ${this.phase==='race'?'TURBO BURST!':'+₡ '+Math.floor(out.credits).toLocaleString('en-US')}`);}
  if(out.kind==='paint')this.effectOf('part',out.name,`${out.text} PAINT!`);
  if(out.kind==='follow')this.effectOf('gift',out.name,'JOINED THE BUILD CREW');
  if(this.phase==='race'&&event.type==='like'&&!this.paused){tapDuel(this.duel,event.count);if(this.time-this.lastTapNotice>.4){this.effectOf('speed',out.name,'TAP TAP / SPEED UP!');this.lastTapNotice=this.time;}}
 }
 control(m){if(m.action==='pause')this.paused=true;if(m.action==='resume')this.paused=false;if(m.action==='next')this.next();
  if(m.action==='race'&&this.phase!=='race'){this.paused=false;if(this.phase==='results')this.save.round++;this.setPhase('race');}
  if(m.action==='gift'){const out=simulatedGift(this.save,m.gift,m.name||'TestDriver');if(out){this.builder=out.name;if(this.phase==='race'&&!this.paused)giftDuel(this.duel,out.credits);this.effectOf('gift',out.name,`${out.text} / ${this.phase==='race'?'TURBO BURST!':'+₡ '+out.credits.toLocaleString('en-US')}`);}}
  if(m.action==='like')this.event({type:'like',count:100,user:{id:'test',name:'TestDriver'}});
  if(m.action==='tap')this.event({type:'like',count:Math.max(1,Math.min(10000,Number(m.count)||1)),user:{id:'local-tap',name:m.name||'TAP CREW'}});
  if(m.action==='rival'&&['auto','easier','harder'].includes(m.difficulty))this.difficulty=m.difficulty;
  if(m.action==='hood'&&this.phase==='build')this.hoodOpen=!this.hoodOpen;
  if(m.action==='rev'&&this.phase==='build'){this.revUntil=this.time+1;this.effectOf('speed',m.name||'THE CREW','ENGINE REV!');}
  if(m.action==='vote')this.event({type:'chat',text:String(m.vote),user:{id:m.name||'HostTest',name:m.name||'HostTest'}});
 }
 tick(dt){dt=Number(dt);if(this.paused||!(dt>0))return;dt=Math.min(dt,5);this.time+=dt; // a bad or negative time step can never poison the credits or the clock
  if(this.phase==='build'){
   // workshop income: 40 credits a second, paid in whole credits (the fraction is carried, so credits stay integers)
   this.creditCarry+=40*dt;const whole=Math.floor(this.creditCarry);this.creditCarry-=whole;this.save.garage.credits=Math.min(1e9,Math.floor(this.save.garage.credits)+whole);
   if(this.time-this.lastInstall>2.5){const goal=chooseGoal(this.save);if(!goal.complete&&this.save.garage.credits>=goal.cost){const result=completeGoal(this.save,goal);if(result.ok){this.lastInstall=this.time;this.effectOf('part',this.builder,result.newCar?'NEW PROJECT UNLOCKED!':goal.name.toUpperCase());if(result.newCar)this.setPhase('collect');}}}
   if(this.time>=35)this.setPhase('travel');
  }else if(this.phase==='travel'&&this.time>=4)this.setPhase('race');
  else if(this.phase==='race'){
   this.save.charge=advanceDuel(this.duel,dt,this.save.charge);
   if((this.run.finished&&this.duel.rival.finished)||this.time>=120)this.setPhase('results'); // plasa de siguranta: o cursa nu tine peste 2 minute
  }else if(this.phase==='results'&&this.time>=7)this.endResults();
  else if(this.phase==='collect'&&this.time>=6)this.setPhase('build');
 }
 snapshot(live=false){return {car:this.car,hp:stats(this.car).hp,phase:this.phase,phaseTime:this.time,paused:this.paused,round:this.save.round,charge:this.save.charge,credits:this.save.garage.credits,goal:chooseGoal(this.save),style:this.save.style,votes:this.votes,run:this.phase==='race'?this.run:null,rival:this.duel?.rival||null,difficulty:this.difficulty,audienceAssist:this.duel?this.duel.tapAssist+this.duel.giftAssist:0,hoodOpen:this.hoodOpen&&this.phase==='build',rev:Math.max(0,this.revUntil-this.time),gap:this.duel?this.duel.player.distance-this.duel.rival.distance:0,result:this.result,completed:this.save.garage.collection.length,crew:this.save.garage.contributors[0]?.name||'YOUR NAME HERE',effect:this.effect,live,totalGifts:this.save.garage.totalGifts};}
}
