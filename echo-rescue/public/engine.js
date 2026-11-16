import {WORLDS,memoryPositions,hazardActive,sanitizeProgress} from './worlds.js';
export const DURATION=WORLDS[0].duration;
export const MAX_HEARTS=5;
export const EFFECTS={
  cube:{name:'Bridge piece',color:'#b49aff',short:'BUILD',duration:0},
  heal:{name:'Life',color:'#ffb1bd',short:'LIFE',duration:2},
  pulse:{name:'Gravity jump',color:'#ef9bdc',short:'JUMP',duration:3.2},
  shield:{name:'Super shield',color:'#6de6d4',short:'SHIELD',duration:6},
  boost:{name:'Turbo boost',color:'#ffe2a1',short:'BOOST',duration:4},
};
export const ROUTES={safe:{name:'Main route'},fast:{name:'Fast route'}};

export class EchoGame{
  constructor({onEvent=()=>{},progress={}}={}){this.onEvent=onEvent;this.progress=sanitizeProgress(progress);this.levelIndex=0;this.reset();}
  reset(){this.phase='idle';this.paused=false;this.loop=1;this.time=0;this.runElapsed=0;this.route='safe';this.votes=new Map();this.previous=[];this.recording=[];this.effects=[];this.nextEcho=0;this.sequence=0;this.rescues=0;this.gifts=0;this.echoes=0;this.completed=0;this.transition=0;this.outcome='';this.lastStars=0;this.checkpoint=65;this.parts=0;this.bankCooldown=0;this.makeRobot();}
  makeRobot(x=65,{memories=[],damageTaken=0,reserves=0}={}){this.robot={x,z:0,waiting:false,stun:0,jumpUntil:-1,jumpStart:-1,shieldUntil:-1,boostUntil:-1,rescued:false,laserHit:false,hearts:3,reserves,damageTaken,memories:new Set(memories),hazards:new Set(this.hazards.map((h,i)=>h.x<x?i:-1).filter(i=>i>=0))};}
  get level(){return WORLDS[this.levelIndex];}get duration(){return this.level.duration;}get goal(){return this.level.length;}get hazards(){return this.level.hazards;}get gaps(){return this.route==='fast'?this.level.fastGaps:this.level.gaps;}get checkpoints(){return [...new Set(this.level.checkpoints.map(original=>{let x=original;for(let i=0;i<3;i++){const gap=this.gaps.find(g=>x>g.from-40&&x<g.to+40);if(gap)x=gap.to+60;const hazard=this.hazards.find(h=>Math.abs(h.x-x)<75);if(hazard)x=hazard.x+90;}return x;}).filter(x=>x<this.goal-80))].sort((a,b)=>a-b);}get memoryPositions(){return memoryPositions(this.level,this.gaps);}get remaining(){return Math.max(0,this.duration-this.time);}get nextGap(){return this.gaps.find(g=>g.to>this.robot.x);}get nextEchoEvent(){return this.previous[this.nextEcho]||null;}get totalStars(){return Object.values(this.progress).reduce((n,r)=>n+r.stars,0);}get totalPieces(){return this.gaps.reduce((n,g)=>n+g.pieces,0);}get builtPieces(){return this.gaps.reduce((n,g)=>n+this.pieceSet(g,true).size,0);}
  emit(type,data={}){this.onEvent({type,...data});}
  start(){if(this.phase==='idle'){this.phase='running';this.emit('start');}else if(this.phase==='running'){this.paused=!this.paused;this.emit('pause');}}
  vote(viewer,route){if(!Object.hasOwn(ROUTES,route))return false;this.votes.set(String(viewer).slice(0,80),route);return true;}
  get voteCounts(){const counts={safe:0,fast:0};for(const route of this.votes.values())counts[route]++;return counts;}
  pieceSet(gap,includeFalling=false){const index=this.gaps.indexOf(gap);return new Set(this.effects.filter(e=>e.type==='cube'&&!e.banked&&e.gapIndex===index&&e.until>this.time&&(includeFalling||e.born+.38<=this.time)).map(e=>e.pieceIndex));}
  bridgeAt(gap){return this.pieceSet(gap).size>=gap.pieces;}
  supportEdge(gap){const built=this.pieceSet(gap);let count=0;while(built.has(count)&&count<gap.pieces)count++;return gap.from+(gap.to-gap.from)*count/gap.pieces;}
  nextPlacement(){for(const [gapIndex,gap]of this.gaps.entries()){if(gap.to<=this.robot.x)continue;const built=this.pieceSet(gap,true);for(let pieceIndex=0;pieceIndex<gap.pieces;pieceIndex++)if(!built.has(pieceIndex))return {gapIndex,pieceIndex,x:gap.from+(gap.to-gap.from)*(pieceIndex+.5)/gap.pieces};}return {gapIndex:-1,pieceIndex:-1,x:this.robot.x};}
  send(type,viewer='Host test',count=1){if(!Object.hasOwn(EFFECTS,type)||this.paused||this.phase==='rewinding'||this.recording.length>=160)return false;if(this.phase==='idle')this.start();const event={id:++this.sequence,type,at:this.time,x:this.robot.x,viewer:String(viewer).slice(0,30),count:Math.max(1,Math.min(999,Number(count)||1)),...(type==='cube'?this.nextPlacement():{})};this.recording.push(event);this.gifts++;this.apply(event,false);return true;}
  apply(event,echo){
    const effect={...event,echo,born:this.time,until:event.type==='cube'?this.duration+1:this.time+EFFECTS[event.type].duration};
    const r=this.robot;
    if(effect.type==='cube'){
      const gap=this.gaps[effect.gapIndex];
      if(echo&&(!gap||effect.x<r.x-15||this.pieceSet(gap,true).has(effect.pieceIndex)))Object.assign(effect,this.nextPlacement());
      if(effect.gapIndex<0){this.parts++;effect.banked=true;effect.until=this.time+1.2;}
      else if(!echo&&Math.abs(r.x-effect.x)<60&&r.shieldUntil<=this.time){r.x=Math.max(65,r.x-8);r.stun=Math.max(r.stun,.22);}
    }
    if(effect.type==='heal'){if(r.hearts<MAX_HEARTS){r.hearts++;effect.healed=1;}else{r.reserves++;effect.storedLife=true;}}
    if(!r.rescued){
      if(effect.type==='pulse'){if(r.jumpUntil<=this.time)r.jumpStart=this.time;r.jumpUntil=Math.max(this.time,r.jumpUntil)+EFFECTS.pulse.duration;if(!echo&&r.shieldUntil<=this.time){r.x=Math.max(65,r.x-8);r.stun=Math.max(r.stun,.12);}}
      if(effect.type==='shield')r.shieldUntil=Math.max(this.time,r.shieldUntil)+EFFECTS.shield.duration;
      if(effect.type==='boost')r.boostUntil=Math.max(this.time,r.boostUntil)+EFFECTS.boost.duration;
    }
    this.effects.push(effect);if(echo)this.echoes++;this.emit('effect',{event:effect});
  }
  warp(index,{carryEchoes=false}={}){
    if(!Number.isInteger(index)||!WORLDS[index])return false;
    const oldDuration=this.duration,oldGaps=this.gaps,changed=index!==this.levelIndex;
    const carried=carryEchoes?[...this.previous.slice(this.nextEcho),...this.recording].map(e=>({...e})):[];
    const reserves=carryEchoes?this.robot.reserves:0;
    this.levelIndex=index;this.route='safe';this.phase='running';this.paused=false;this.loop=1;this.time=0;this.runElapsed=0;this.checkpoint=65;
    if(!carryEchoes)this.parts=0;
    for(const event of carried){if(changed)event.at=Math.min(this.duration-.1,event.at/oldDuration*this.duration);if(event.type!=='cube'||!changed)continue;const oldIndex=event.gapIndex??oldGaps.findIndex(g=>event.x>=g.from&&event.x<=g.to);if(oldIndex<0)continue;event.gapIndex=Math.min(oldIndex,this.gaps.length-1);const gap=this.gaps[event.gapIndex];event.pieceIndex=Math.min(event.pieceIndex??0,gap.pieces-1);event.x=gap.from+(gap.to-gap.from)*(event.pieceIndex+.5)/gap.pieces;}
    this.previous=carried.sort((a,b)=>a.at-b.at||a.id-b.id);this.recording=[];this.effects=[];this.nextEcho=0;this.transition=0;this.votes.clear();this.outcome='';this.lastStars=0;this.bankCooldown=0;this.makeRobot(65,{reserves});this.emit('warp',{world:this.level});return true;
  }
  step(dt){if(!Number.isFinite(dt)||dt<=0||this.paused||this.phase==='idle')return;let remaining=dt;while(remaining>0){const n=Math.min(remaining,1/60);this.advance(n);remaining-=n;}}
  advance(dt){
    if(this.phase==='rewinding'){this.transition-=dt;if(this.transition<=0)this.nextLoop();return;}
    this.time=Math.min(this.duration,this.time+dt);this.runElapsed+=dt;
    while(this.nextEcho<this.previous.length&&this.previous[this.nextEcho].at<=this.time)this.apply(this.previous[this.nextEcho++],true);
    this.effects=this.effects.filter(e=>e.until>this.time);
    const r=this.robot;
    if(!r.rescued){
      this.bankCooldown=Math.max(0,this.bankCooldown-dt);
      if(this.parts>0&&this.bankCooldown===0){const placement=this.nextPlacement(),gap=this.gaps[placement.gapIndex];if(gap&&gap.from-r.x<180){this.parts--;this.bankCooldown=.4;this.apply({id:++this.sequence,type:'cube',at:this.time,viewer:'STORED PARTS',...placement},false);}}
      r.waiting=false;r.stun=Math.max(0,r.stun-dt);const airborne=r.jumpUntil>this.time;
      r.z=airborne?Math.sin(Math.min(1,(this.time-r.jumpStart)/(r.jumpUntil-r.jumpStart))*Math.PI)*110:0;
      const speed=this.level.speed*(this.route==='fast'?1.25:1)*(r.boostUntil>this.time?1.8:1);
      let nextX=r.x+(r.stun>0?0:speed*dt);
      for(const gap of this.gaps){if(r.x>=gap.to||airborne)continue;const edge=this.supportEdge(gap);if(edge>=gap.to-.01)continue;if(nextX>=edge-14&&nextX<gap.to){nextX=Math.min(nextX,Math.max(r.x,edge-14));r.waiting=true;if(r.x>edge&&r.x<gap.to)nextX=edge-14;}}
      const previousX=r.x;r.x=nextX;
      for(const[index,hazard]of this.hazards.entries())if(!r.hazards.has(index)&&previousX<hazard.x&&r.x>=hazard.x){r.hazards.add(index);if(hazardActive(hazard,this.time)&&!airborne){if(r.shieldUntil<=this.time){r.hearts--;r.damageTaken++;r.x=Math.max(65,r.x-(hazard.type==='wind'?45:22));r.stun=hazard.type==='piston'?.8:.5;this.emit('damage',{hazard:hazard.type});if(r.hearts<=0&&r.reserves>0){r.hearts=1;r.reserves--;this.emit('revive');}}else this.emit('blocked',{hazard:hazard.type});}}
      for(const[index,x]of this.memoryPositions.entries())if(r.x>=x&&!r.memories.has(index)){r.memories.add(index);this.emit('memory',{index,x});}
      for(const x of this.checkpoints)if(r.x>=x&&this.checkpoint<x){this.checkpoint=x;this.emit('checkpoint',{x});}
      if(r.hearts<=0){this.finishLoop('SYSTEM OVERLOAD');return;}
      if(r.x>=this.goal){r.x=this.goal;r.rescued=true;r.z=0;this.rescues++;this.lastStars=1+Number(r.memories.size===3)+Number(r.damageTaken===0);const old=this.progress[this.level.id];this.progress[this.level.id]={stars:Math.max(old?.stars||0,this.lastStars),bestTime:Math.min(old?.bestTime||Infinity,this.runElapsed)};this.emit('rescue',{stars:this.lastStars,world:this.level});}
    }
    if(this.time>=this.duration)this.finishLoop();
  }
  finishLoop(outcome=this.robot.rescued?'RESCUE COMPLETE':'TIME TO TRY AGAIN'){if(this.phase!=='running')return;this.phase='rewinding';this.transition=3;this.completed++;this.outcome=outcome;this.emit('rewind');}
  nextLoop(){const respawn=this.robot.rescued?65:this.checkpoint,old=this.robot;if(old.rescued)this.runElapsed=0;this.previous=[...this.previous.slice(this.nextEcho),...this.recording].map(e=>({...e})).sort((a,b)=>a.at-b.at||a.id-b.id);this.recording=[];this.effects=[];this.nextEcho=0;this.time=0;const votes=this.voteCounts;if(votes.safe!==votes.fast)this.route=votes.fast>votes.safe?'fast':'safe';this.votes.clear();this.checkpoint=respawn;this.makeRobot(respawn,{reserves:old.reserves,memories:respawn>65?[...old.memories]:[],damageTaken:respawn>65?old.damageTaken:0});this.loop++;this.phase='running';this.emit('loop');}
}
export function normalizeGift(message,mappings){if(message.type!=='gift'||!(Number(message.coins)>0))return null;const name=String(message.giftName||'').toLowerCase().replace(/[^a-z0-9]/g,'');const mapping=Object.entries(mappings).find(([,names])=>String(names).split(',').some(n=>n.toLowerCase().replace(/[^a-z0-9]/g,'')===name));const unit=Number(message.total)/Number(message.repeat),delta=Number(message.coins)/unit,count=Number.isSafeInteger(Math.round(delta))&&delta>0?Math.max(1,Math.round(delta)):1;return {type:mapping?.[0]||'cube',viewer:message.user?.name||message.user?.id||'Viewer',count};}
