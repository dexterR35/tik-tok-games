import { CATEGORIES, COLORS, CARS, newState, restoreState, installPart, buyCar, saveBuild, partRequirements, addFeed, receiveGift } from './model.js';
export const LIVE_SAVE_KEY = 'dream-garage.live.v1';
export const STYLES = [
  { id:'street',name:'STREET',color:'#b6d255',order:['paint','wheels','tires','suspension','turbo','ecu','cooling','brakes','nitrous','exhaust','aero','transmission','lighting'] },
  { id:'track',name:'TRACK',color:'#74d4e8',order:['tires','turbo','suspension','ecu','cooling','brakes','wheels','nitrous','transmission','exhaust','aero','paint','lighting'] },
  { id:'show',name:'SHOW',color:'#ffc17b',order:['paint','lighting','wheels','aero','suspension','exhaust','tires','turbo','nitrous','ecu','cooling','brakes','transmission'] },
];
export function freshLiveSave() { const garage=newState();garage.credits=500;return {version:1,garage,round:1,charge:25,style:0,runsOnCar:0}; }
export function restoreLiveSave(raw) { if(raw?.version!==1)return freshLiveSave(); return {version:1,garage:restoreState(raw.garage),round:Math.max(1,Math.floor(Number(raw.round)||1)),charge:Math.min(100,Math.max(0,Number(raw.charge)||0)),style:[0,1,2].includes(raw.style)?raw.style:0,runsOnCar:Math.max(0,Math.floor(Number(raw.runsOnCar)||0))}; }
export function chooseGoal(save) {
  const g=save.garage,p=g.projects[g.active];
  if(CATEGORIES.every(c=>p.parts[c.id]>0)) {
    const current=CARS.findIndex(c=>c.id===p.carId),def=CARS[(current+1)%CARS.length];
    if(!g.projects[def.id])return {type:'car',id:def.id,name:def.name,cost:def.price,icon:'car'};
    const nextLevel=STYLES[save.style].order.map(id=>({id,level:p.parts[id]+1})).find(v=>v.level<=3);
    if(nextLevel)return goalForPart(p,nextLevel.id,nextLevel.level);
    // this car is finished (every part at level 3): move the crew to an owned car that still has work to do (before: the game stalled here forever)
    const unfinished=CARS.map((c,i)=>CARS[(current+1+i)%CARS.length]).find(c=>g.projects[c.id]&&CATEGORIES.some(k=>g.projects[c.id].parts[k.id]<3));
    if(unfinished)return {type:'car',id:unfinished.id,name:unfinished.name,cost:0,icon:'car'};
  }
  for(const id of STYLES[save.style].order)if(p.parts[id]===0)return goalForPart(p,id,1);
  return {type:'part',category:'paint',level:1,name:'Studio gloss',cost:0,icon:'paint',complete:true};
}
function goalForPart(p,id,level) { const missing=partRequirements(p,id,level);if(missing.length)return goalForPart(p,missing[0].category,missing[0].level);const cat=CATEGORIES.find(c=>c.id===id),item=cat.items[level];return {type:'part',category:id,level,name:item.name,cost:p.owned[id].includes(level)?0:item.cost,icon:cat.icon}; }
export function completeGoal(save,goal) {
  if(goal.complete)return {ok:false};
  if(goal.type==='car') {
    if(save.garage.credits<goal.cost)return {ok:false};
    const old=save.garage.projects[save.garage.active];
    const result=buyCar(save.garage,goal.id);if(!result.ok)return result;
    save.garage.active=old.carId;saveBuild(save.garage,`LIVE BUILD ${save.garage.collection.length+1} / ${STYLES[save.style].name}`);save.garage.active=goal.id;save.runsOnCar=0;return {...result,newCar:true};
  }
  return installPart(save.garage,goal.category,goal.level);
}
export function applyLiveEvent(save,event,context) {
  if(!event||typeof event!=='object')return null;
  const name=String(event.user?.name||event.user?.id||'Viewer').slice(0,24);
  if(event.type==='gift') {
    // The existing TikTok server already emits streak deltas. Final notifications can have zero value.
    const delta=Math.max(0,Math.min(100000,Math.floor(Number(event.coins)||0)));
    if(!delta)return null;
    if(event.id) {const key=String(event.id);if(context.seen.has(key))return null;context.seen.add(key);if(context.seen.size>1000)context.seen.delete(context.seen.values().next().value);}
    const credits=delta*50;save.garage.credits=Math.min(1e9,save.garage.credits+credits);save.garage.totalGifts++;
    let contributor=save.garage.contributors.find(c=>c.name===name);if(!contributor){contributor={name,credits:0};save.garage.contributors.push(contributor);}contributor.credits+=credits;save.garage.contributors.sort((a,b)=>b.credits-a.credits);save.garage.contributors=save.garage.contributors.slice(0,100);
    save.charge=Math.min(100,save.charge+Math.min(65,delta*3));addFeed(save.garage,`${name} · ${String(event.giftName||'Gift').slice(0,40)} · +${credits} workshop credits`,'gift');return {kind:'gift',name,text:String(event.giftName||'GIFT').slice(0,28),credits};
  }
  if(event.type==='like') { const likes=Math.max(0,Math.min(10000,Number(event.count)||0));save.charge=Math.min(100,save.charge+likes*.2);return likes?{kind:'like',name,text:'BOOST CHARGED'}:null; }
  if(event.type==='chat') {
    const text=String(event.text||'').trim().toLowerCase(),vote=Number(text)-1,id=String(event.user?.id||name);
    if([0,1,2].includes(vote)&&(context.votes.has(id)||context.votes.size<3000)){context.votes.set(id,vote);const counts=[0,0,0];context.votes.forEach(v=>counts[v]++);const top=Math.max(...counts);if(counts[save.style]!==top){const tied=[0,1,2].filter(i=>counts[i]===top);save.style=tied[(Math.random()*tied.length)|0];}return {kind:'vote',name,text:STYLES[save.style].name,counts};} // egalitate: ramane stilul curent (nu automat primul)
    const colors={red:'#ed6c32',orange:'#ed6c32',blue:'#399bbc',green:'#b6d255',white:'#dde3df',black:'#282d32',purple:'#79518f'};
    if(colors[text]){save.garage.projects[save.garage.active].color=colors[text];return {kind:'paint',name,text:text.toUpperCase()};}
  }
  if(event.type==='follow'){const fid=String(event.user?.id||name);context.followed??=new Set();if(context.followed.has(fid))return null;context.followed.add(fid);save.garage.credits+=100;save.charge=Math.min(100,save.charge+10);return {kind:'follow',name,text:'JOINED THE BUILD CREW'};}
  return null;
}
export function simulatedGift(save,id,name) { const gift=receiveGift(save.garage,id,name);if(!gift)return null;save.charge=Math.min(100,save.charge+(id==='rocket'?50:id==='toolbox'?20:5));return {kind:'gift',name:String(name||'TestViewer').slice(0,24),text:`TEST ${gift.name.toUpperCase()}`,credits:gift.value}; }
