export const bounded = (v,min,max,fallback=min) => Number.isFinite(Number(v)) ? Math.max(min,Math.min(max,Number(v))) : fallback;
export const MODES=['auto','safe','fast','hardcore','superfast'];
export const CLOCKS=['real','day','night'];
export const CARS=['veloce','atlas'];
export const CAMERAS=['auto','chase','high','iso'];
// Tap combo: likes in the last five seconds raise the boost multiplier.
export const COMBO_MULTIPLIER=[1,1.25,1.5,2];
export const SECONDS_PER_LIKE=.05;
export class LiveState {
  constructor(now=()=>Date.now()) {this.now=now;this.mode='auto';this.clock='real';this.car='veloce';this.camera='auto';this.taps=[];this.route='mixed';this.likes=0;this.fuel=0;this.boostUntil=0;this.events=[];this.sequence=0;this.viewers=null;this.connection={state:'demo',username:'',message:'Try the controls, or connect your LIVE.'};this.telemetry=null;this.telemetryAt=0;this.seen=new Map();}
  tapRate(){const cutoff=this.now()-5000;while(this.taps.length&&this.taps[0][0]<cutoff)this.taps.shift();return this.taps.reduce((n,t)=>n+t[1],0)/5;}
  comboLevel(){const rate=this.tapRate();return rate>=12?3:rate>=5?2:rate>=1.5?1:0;}
  addBoostMs(ms){this.boostUntil=Math.min(this.now()+60000,Math.max(this.now(),this.boostUntil)+ms);}
  snapshot(){return {mode:this.mode,clock:this.clock,car:this.car,camera:this.camera,comboLevel:this.comboLevel(),tapRate:+this.tapRate().toFixed(1),route:this.route,likes:this.likes,fuel:this.fuel,boostSeconds:Math.max(0,(this.boostUntil-this.now())/1000),viewers:this.viewers,connection:this.connection,sequence:this.sequence,telemetry:this.telemetry,telemetryAgeMs:this.telemetryAt?this.now()-this.telemetryAt:null};}
  boost(seconds){this.boostUntil=Math.min(this.now()+60000,Math.max(this.now(),this.boostUntil)+bounded(seconds,1,30)*1000);}
  event(type,data={}) {
    const name=String(data.name||'You').slice(0,40);let e={id:++this.sequence,type,name,at:this.now()};
    if(type==='like'){
      // Every tap counts immediately: 0.05 s each (100 taps = 5 s), multiplied by the tap combo.
      const count=Math.round(bounded(data.count,1,100000,1));this.likes+=count;this.fuel+=count;this.taps.push([this.now(),count]);
      const level=this.comboLevel(),seconds=Math.min(30,count*SECONDS_PER_LIKE*COMBO_MULTIPLIER[level]);this.addBoostMs(seconds*1000);
      const earned=Math.floor(this.fuel/100);this.fuel%=100;Object.assign(e,{count,earned,level,seconds:+seconds.toFixed(2)});}
    else if(type==='gift'){const seconds=bounded(data.seconds,1,30,5);this.boost(seconds);Object.assign(e,{gift:String(data.gift||'Rose').slice(0,40),seconds});}
    else if(type==='mode'){if(!MODES.includes(data.mode))throw new Error('Mode must be auto, safe, fast, hardcore, or superfast');this.mode=data.mode;e.mode=this.mode;}
    else if(type==='camera'){const cam=data.camera==='next'?CAMERAS[(CAMERAS.indexOf(this.camera)+1)%CAMERAS.length]:data.camera;if(!CAMERAS.includes(cam))throw new Error('Camera must be auto, chase, high, iso, or next');this.camera=cam;e.camera=cam;}
    else if(type==='car'){if(!CARS.includes(data.car))throw new Error('Car must be veloce or atlas');this.car=data.car;e.car=this.car;}
    else if(type==='clock'){if(!CLOCKS.includes(data.clock))throw new Error('Clock must be real, day, or night');this.clock=data.clock;e.clock=this.clock;}
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
