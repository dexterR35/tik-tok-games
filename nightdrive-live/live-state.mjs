export const bounded = (v,min,max,fallback=min) => Number.isFinite(Number(v)) ? Math.max(min,Math.min(max,Number(v))) : fallback;
export class LiveState {
  constructor(now=()=>Date.now()) {this.now=now;this.mode='fast';this.route='mixed';this.likes=0;this.fuel=0;this.boostUntil=0;this.events=[];this.sequence=0;this.viewers=null;this.connection={state:'demo',username:'',message:'Try the controls, or connect your LIVE.'};this.telemetry=null;this.telemetryAt=0;this.seen=new Map();}
  snapshot(){return {mode:this.mode,route:this.route,likes:this.likes,fuel:this.fuel,boostSeconds:Math.max(0,(this.boostUntil-this.now())/1000),viewers:this.viewers,connection:this.connection,sequence:this.sequence,telemetry:this.telemetry,telemetryAgeMs:this.telemetryAt?this.now()-this.telemetryAt:null};}
  boost(seconds){this.boostUntil=Math.min(this.now()+60000,Math.max(this.now(),this.boostUntil)+bounded(seconds,1,30)*1000);}
  event(type,data={}) {
    const name=String(data.name||'You').slice(0,40);let e={id:++this.sequence,type,name,at:this.now()};
    if(type==='like'){const count=Math.round(bounded(data.count,1,100000,1));this.likes+=count;this.fuel+=count;const earned=Math.floor(this.fuel/100);this.fuel%=100;if(earned)this.boost(Math.min(30,earned*5));Object.assign(e,{count,earned});}
    else if(type==='gift'){const seconds=bounded(data.seconds,1,30,5);this.boost(seconds);Object.assign(e,{gift:String(data.gift||'Rose').slice(0,40),seconds});}
    else if(type==='mode'){if(!['safe','fast','hardcore'].includes(data.mode))throw new Error('Mode must be safe, fast, or hardcore');this.mode=data.mode;e.mode=this.mode;}
    else if(type==='route'){if(!['mixed','highway','city'].includes(data.route))throw new Error('Route must be mixed, highway, or city');this.route=data.route;e.route=this.route;}
    else if(type==='boost'){const seconds=bounded(data.seconds,1,30,5);this.boost(seconds);e.seconds=seconds;}
    else throw new Error('Unsupported event');
    this.events.push(e);if(this.events.length>60)this.events.shift();return {event:e,state:this.snapshot()};
  }
  normalizeGift(data){
    const gift=data.gift||{};
    if((gift.type===1||data.giftType===1)&&!data.repeatEnd)return null;
    const unique=String(data.common?.msgId||data.msgId||'');
    const group=String(data.groupId||'');const user=String(data.user?.userId||data.userId||'');
    const key=group?`${user}:${data.giftId}:${group}`:unique;
    if(key&&this.seen.has(key))return null;
    if(key)this.seen.set(key,this.now());
    for(const [k,t]of this.seen)if(this.now()-t>600000)this.seen.delete(k);
    if(this.seen.size>2000)this.seen.delete(this.seen.keys().next().value);
    const count=bounded(data.repeatCount,1,1000,1),value=bounded(gift.diamondCount??data.diamondCount??data.extendedGiftInfo?.diamond_count,1,100000,1)*count;
    return {name:data.user?.nickname||data.user?.uniqueId||data.nickname||'Viewer',gift:gift.name||data.giftName||data.extendedGiftInfo?.name||'Gift',seconds:Math.min(30,5+Math.log2(Math.max(1,value))*2)};
  }
}
