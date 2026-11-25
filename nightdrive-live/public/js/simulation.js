// SI units throughout: metres, seconds, radians. Rendering never controls physics.
export const CELL = 240;
export const LANES = [2.4, 6.0, 9.6];
export const CAR_LENGTH = 4.8;
export const MODES = {
  safe: { highway: 29, city: 14, headway: 2.0, accel: 2.6, lateral: 3.0, change: 3.8 },
  fast: { highway: 48, city: 21, headway: 1.25, accel: 4.1, lateral: 4.6, change: 2.8 },
  hardcore: { highway: 61, city: 28, headway: 0.85, accel: 5.4, lateral: 6.0, change: 2.3 },
  // Super fast: ~290 km/h on open highway. Every safety envelope still applies.
  superfast: { highway: 80, city: 32, headway: 0.95, accel: 7.2, lateral: 7.6, change: 1.9 },
};
export const MODE_IDS = ['auto','safe','fast','hardcore','superfast'];
// Forward sensor range. Desired speed never exceeds what can be stopped inside it.
export const SENSOR_RANGE = 640;
export const MAX_SPEED = 85;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = t => t*t*t*(t*(t*6-15)+10);
export function random(seed = 4316) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const directions = [{x:0,z:-1}, {x:1,z:0}, {x:0,z:1}, {x:-1,z:0}];
const mix = (a,b,t) => a+(b-a)*t;
const dist = (a,b) => Math.hypot(b.x-a.x,b.z-a.z);
export function signalPhase(time, id) {
  const phase = ((time + id * 3.7) % 30 + 30) % 30;
  return phase < 17 ? 'green' : phase < 20 ? 'amber' : 'red';
}

export class Route {
  constructor(seed = 4316) {
    this.rng = random(seed); this.points = []; this.junctions = []; this.nodes = [];
    this.total = 0; this.nextId = 0; this.bias = 'mixed';
    this.node = {x:0,z:0}; this.dir = 0; this.cursor = {x:0,z:100};
    this._point(this.cursor, 'highway');
    this.extend(4000);
  }
  _point(p, kind, tangent=null) {
    const prev = this.points.at(-1);
    if (prev) this.total += dist(prev,p);
    this.points.push({x:p.x,z:p.z,s:this.total,kind,dx:tangent?.x??0,dz:tangent?.z??-1});
  }
  _line(end,kind) {
    const start = {...this.cursor}, length=dist(start,end),n = Math.max(1,Math.ceil(length/3));
    const tangent={x:(end.x-start.x)/(length||1),z:(end.z-start.z)/(length||1)};
    if(this.points.length===1){this.points[0].dx=tangent.x;this.points[0].dz=tangent.z;}
    for(let i=1;i<=n;i++) this._point({x:mix(start.x,end.x,i/n),z:mix(start.z,end.z,i/n)},kind,tangent);
    this.cursor = {...end};
  }
  extend(until) {
    while(this.total < until) {
      const id = this.nextId++, block = id % 14;
      const highway = this.bias === 'highway' || (this.bias === 'mixed' && block < 6);
      const kind = highway ? 'highway' : 'city';
      let out = this.dir;
      // Monotonic northbound growth prevents self-intersection and finite-map loops.
      if (highway) out = 0;
      else if(this.dir !== 0) out = this.rng() < 0.72 ? 0 : this.dir;
      else if(this.rng() < 0.64) out = this.rng() < 0.5 ? 1 : 3;
      const incoming = directions[this.dir], outgoing = directions[out];
      const turning = out !== this.dir;
      const radius = 33;
      const pre = {x:this.node.x-incoming.x*radius,z:this.node.z-incoming.z*radius};
      this._line(pre,kind);
      const stopS = this.total - 5;
      const junction = {id,x:this.node.x,z:this.node.z,s:stopS,kind,dir:this.dir,out,turn:turning ? (out-this.dir+4)%4 === 1 ? 'right':'left':'straight'};
      this.junctions.push(junction); this.nodes.push({...this.node,id,kind});
      const post = {x:this.node.x+outgoing.x*radius,z:this.node.z+outgoing.z*radius};
      if(turning) {
        // Quintic Bezier: the first/last three controls are collinear, giving
        // zero curvature where the junction meets a straight road (C2 join).
        const controls=[pre,{x:pre.x+incoming.x*radius*.3,z:pre.z+incoming.z*radius*.3},{x:pre.x+incoming.x*radius*.6,z:pre.z+incoming.z*radius*.6},{x:post.x-outgoing.x*radius*.6,z:post.z-outgoing.z*radius*.6},{x:post.x-outgoing.x*radius*.3,z:post.z-outgoing.z*radius*.3},post];
        const evaluate=(t)=>{const work=controls.map(p=>({...p}));for(let level=5;level>0;level--)for(let k=0;k<level;k++){work[k].x=mix(work[k].x,work[k+1].x,t);work[k].z=mix(work[k].z,work[k+1].z,t);}return work[0];};
        for(let i=1;i<=64;i++) {
          const t=i/64,p=evaluate(t),a=evaluate(Math.max(0,t-.0001)),b=evaluate(Math.min(1,t+.0001)),length=dist(a,b)||1;
          this._point(p,kind,{x:(b.x-a.x)/length,z:(b.z-a.z)/length});
        }
        this.cursor = post;
      } else this._line(post,kind);
      junction.endS=this.total;
      this.dir = out;
      this.node = {x:this.node.x+outgoing.x*CELL,z:this.node.z+outgoing.z*CELL};
    }
  }
  sample(s, offset=0) {
    const pts=this.points;
    let lo=0,hi=pts.length-1;
    while(lo<hi-1) { const mid=(lo+hi)>>1; if(pts[mid].s<=s)lo=mid;else hi=mid; }
    const a=pts[lo],b=pts[hi],span=b.s-a.s||1,t=clamp((s-a.s)/span,0,1),t2=t*t,t3=t2*t;
    // Cubic Hermite reconstruction uses analytic endpoint tangents instead of
    // assigning a constant heading to each line segment.
    const h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;
    const x=h00*a.x+h10*span*a.dx+h01*b.x+h11*span*b.dx;
    const z=h00*a.z+h10*span*a.dz+h01*b.z+h11*span*b.dz;
    const tx=(6*t2-6*t)*a.x+(3*t2-4*t+1)*span*a.dx+(-6*t2+6*t)*b.x+(3*t2-2*t)*span*b.dx;
    const tz=(6*t2-6*t)*a.z+(3*t2-4*t+1)*span*a.dz+(-6*t2+6*t)*b.z+(3*t2-2*t)*span*b.dz;
    const length=Math.hypot(tx,tz)||1,dx=tx/length,dz=tz/length;
    return {x:x-dz*offset,z:z+dx*offset,dx,dz,heading:Math.atan2(-dx,-dz),kind:a.kind};
  }
  curvature(s) {
    return Math.abs(this.signedCurvature(s));
  }
  signedCurvature(s){
    const a=this.sample(s-4),b=this.sample(s+4);
    return Math.atan2(a.dx*b.dz-a.dz*b.dx,a.dx*b.dx+a.dz*b.dz)/8;
  }
  prune(s) {
    const keep=s-1100;
    const i=this.points.findIndex(p=>p.s>=keep);
    if(i>1) this.points.splice(0,i-1);
    this.junctions=this.junctions.filter(j=>j.s>keep);
    this.nodes=this.nodes.filter(n=>this.junctions.some(j=>j.id===n.id));
  }
  replan(s,bias){
    if(this.bias===bias)return;
    const keep=this.junctions.find(j=>j.s>s+500);this.bias=bias;
    if(!keep)return;
    const exit=this.sample(keep.endS),out=directions[keep.out];
    this.points=this.points.filter(p=>p.s<=keep.endS);this.total=keep.endS;
    this.junctions=this.junctions.filter(j=>j.id<=keep.id);this.nodes=this.nodes.filter(n=>n.id<=keep.id);
    this.cursor={x:exit.x,z:exit.z};this.dir=keep.out;this.nextId=keep.id+1;
    this.node={x:keep.x+out.x*CELL,z:keep.z+out.z*CELL};this.extend(s+3400);
  }
}

// A car occupies its current lateral band and, while changing lanes, its target lane too.
export const occupies=(c,offset,band=2.3)=>Math.abs((c.offset??LANES[c.lane])-offset)<band||Math.abs(LANES[c.lane]-offset)<band;
export function idmAcceleration(speed, desired, gap, leadSpeed, headway=1.5, accel=3) {
  const b=5.5, dv=speed-leadSpeed;
  const desiredGap=3+Math.max(0,speed*headway+speed*dv/(2*Math.sqrt(accel*b)));
  return clamp(accel*(1-Math.pow(speed/Math.max(1,desired),4)-Math.pow(desiredGap/Math.max(0.2,gap),2)),-9,accel);
}

export class Simulation {
  constructor(seed=4316) {
    this.route=new Route(seed); this.rng=random(seed+1); this.mode='auto';
    this.s=125; this.prevS=this.s;this.speed=23; this.lane=1; this.offset=LANES[1];this.prevOffset=this.offset;this.change=null;this.signal=null;this.keepRightClock=0;
    this.time=0; this.distance=0; this.overtakes=0; this.boost=0; this.boostLevel=0; this.cooldown=0; this.night=0; this.autoMode='fast'; this.autoTimer=0; this.topSpeed=0;
    this.cars=[];this.nextCar=0;this.action='CRUISING';this.braking=false;this.lastTurn=-1;
    this.onEvent=()=>{}; this.maxCars=42;
    this.populate();
  }
  setMode(mode) { if(MODE_IDS.includes(mode)){this.mode=mode;this.autoTimer=0;} }
  // The mode actually driving the car; 'auto' picks one from road, traffic and daylight.
  get activeMode(){return this.mode==='auto'?this.autoMode:this.mode;}
  chooseAutoMode(){
    const here=this.route.sample(this.s),ahead=this.cars.filter(c=>!c.opposite&&c.s>this.s&&c.s<this.s+350).length;
    const turnSoon=this.route.junctions.some(j=>j.turn!=='straight'&&j.s>this.s&&j.s-this.s<420);
    let next;
    if(here.kind==='highway')next=ahead<=10&&!turnSoon?'superfast':'hardcore';
    else next=this.night>.6?'safe':ahead<=5?'hardcore':'fast';
    if(next!==this.autoMode){const was=this.autoMode;this.autoMode=next;this.onEvent('auto',next==='superfast'?'SUPER FAST MODE ACTIVATED. Open road ahead.':`Autopilot: ${({safe:'safe drive',fast:'fast lane',hardcore:'hardcore pace'})[next]}${was==='superfast'?' — traffic ahead.':'.'}`,next);}
  }
  setRoute(bias) { if(['mixed','highway','city'].includes(bias)){this.route.replan(this.s,bias);} }
  addBoost(seconds) { this.boost=clamp(this.boost+seconds,0,60); }
  setBoostLevel(level){this.boostLevel=clamp(Math.round(level)||0,0,3);}
  spawn(s,lane,opposite=false) {
    if(!opposite && Math.abs(s-this.s)<14 && Math.abs(LANES[lane]-this.offset)<3) return;
    if(this.cars.some(c=>c.opposite===opposite&&(c.lane===lane||(!opposite&&occupies(c,LANES[lane])))&&Math.abs(c.s-s)<24)) return;
    this.cars.push({id:this.nextCar++,s,prevS:s,lane,offset:LANES[lane],prevOffset:LANES[lane],change:null,cooldown:this.rng()*6,speed:0,cruise:24+this.rng()*14,opposite,passed:s<this.s,color:Math.floor(this.rng()*7),style:Math.floor(this.rng()*4)});
    const car=this.cars.at(-1);car.speed=opposite?18:Math.min(car.cruise,this.route.sample(s).kind==='city'?15:car.cruise)*(.9+this.rng()*.1);
  }
  populate() {
    for(let i=0;i<27;i++) this.spawn(this.s+25+i*21,Math.floor(this.rng()*3),i%5===0);
  }
  signalStop(s,speed) {
    for(const j of this.route.junctions) {
      if(j.s<s-1 || j.kind==='highway')continue;
      if(j.s-s>Math.max(250,speed*speed/8+60))break;
      const phase=signalPhase(this.time,j.id);
      const canStop=(speed*speed/16+4)<(j.s-s);
      if(phase==='red'||(phase==='amber'&&canStop))return {gap:j.s-s,j};
    }
    return null;
  }
  lead(s,offset,exclude=-1) {
    let gap=1e6,speed=80;
    for(const c of this.cars) {
      if(c.id===exclude||c.opposite||!occupies(c,offset))continue;
      const g=c.s-s-CAR_LENGTH;
      if(c.s>s&&g<gap){gap=g;speed=c.speed;}
    }
    return {gap,speed};
  }
  playerIn(offset,band=2.3){return Math.abs(this.offset-offset)<band||(this.change&&Math.abs(this.change.to-offset)<band);}
  trafficLead(c){
    let lead=this.lead(c.s,c.offset,c.id);
    if(c.change){const target=this.lead(c.s,LANES[c.lane],c.id);if(target.gap<lead.gap)lead=target;}
    return lead;
  }
  trafficCanChange(c,lane){
    const offset=LANES[lane],check=(s,speed)=>{const d=s-c.s;
      if(d>0&&d-CAR_LENGTH<Math.max(14,c.speed*1.1+Math.max(0,c.speed-speed)*2.5))return false;
      if(d<=0&&-d-CAR_LENGTH<Math.max(16,speed*1.4+Math.max(0,speed-c.speed)*3.2))return false;return true;};
    for(const o of this.cars){if(o===c||o.opposite||!occupies(o,offset))continue;if(!check(o.s,o.speed))return false;}
    if(this.playerIn(offset,2.6)&&!check(this.s,Math.max(this.speed,MODES[this.activeMode].highway*.8)))return false;
    return true;
  }
  canChange(lane) {
    const offset=LANES[lane];
    for(const c of this.cars) {
      if(c.opposite||!occupies(c,offset))continue;
      const d=c.s-this.s;
      if(d>0&&d<Math.max(16,this.speed*1.2+Math.max(0,this.speed-c.speed)*2))return false;
      if(d<=0&&-d<Math.max(15,c.speed*1.2+Math.max(0,c.speed-this.speed)*3))return false;
    }
    return offset>=LANES[0]&&offset<=LANES[2];
  }
  desiredSpeed(s,mode) {
    const here=this.route.sample(s);
    let desired=here.kind==='highway'?mode.highway:mode.city;
    const lift=this.boost>0?(here.kind==='highway'?12+6*this.boostLevel:4+2*this.boostLevel):0;desired+=lift;
    desired=Math.min(desired,MAX_SPEED,Math.sqrt(2*6*(SENSOR_RANGE-80)));
    // Brake early for the tightest curvature and lower speed zones in the horizon.
    const horizon=Math.max(85,this.speed*this.speed/12+35);
    for(let d=0;d<horizon;d+=9) {
      const p=this.route.sample(s+d),k=this.route.curvature(s+d);
      const curve=Math.sqrt(mode.lateral/Math.max(k*(1+k*LANES[2]),0.00001));
      const limit=Math.min(curve,p.kind==='city'?mode.city+(this.boost>0?4+2*this.boostLevel:0):100);
      desired=Math.min(desired,Math.sqrt(limit*limit+2*5.5*Math.max(0,d-12)));
    }
    return desired;
  }
  update(dt) {
    // Fixed maximum substep keeps safety independent of display refresh rate.
    if(dt>1/60+1e-7) {let remaining=Math.min(dt,0.5);while(remaining>1e-8){const d=Math.min(remaining,1/60);this.update(d);remaining-=d;}return;}
    this.prevS=this.s;this.prevOffset=this.offset;for(const car of this.cars)car.prevS=car.s;
    this.time+=dt;this.boost=Math.max(0,this.boost-dt);this.cooldown=Math.max(0,this.cooldown-dt);
    this.route.extend(this.s+3400);
    if(this.mode==='auto'){this.autoTimer-=dt;if(this.autoTimer<=0){this.autoTimer=2.5;this.chooseAutoMode();}}
    const mode=MODES[this.activeMode];
    this.cars.sort((a,b)=>b.s-a.s);
    for(const c of this.cars) {
      if(c.opposite){c.s-=c.speed*dt;continue;}
      c.prevOffset=c.offset;c.cooldown=Math.max(0,c.cooldown-dt);
      let lead=this.trafficLead(c);
      // The protagonist is a leader for cars behind it, including both occupied lanes.
      if(this.s>c.s&&this.playerIn(c.offset,2.5)||this.s>c.s&&this.playerIn(LANES[c.lane],2.5)){if(this.s-c.s-CAR_LENGTH<lead.gap)lead={gap:this.s-c.s-CAR_LENGTH,speed:this.speed};}
      // Give way: a slower car with the fast autodrive closing behind moves over when it is safe.
      const closing=this.s<c.s&&c.s-this.s<Math.max(220,this.speed*4.5)&&this.playerIn(c.offset,2.4)&&Math.max(this.speed,this.wanted||0)>c.speed+3;
      if(closing&&!c.change&&c.cooldown===0){c.signal=null;
        c.cooldown=.6+this.rng()*.6;const ways=[c.lane+1,c.lane-1].filter(l=>l>=0&&l<3&&!this.playerIn(LANES[l],2.6)&&this.trafficCanChange(c,l));
        if(ways.length){const l=ways[0];c.change={from:c.offset,to:LANES[l],t:0,duration:2.6+this.rng()*.6};c.lane=l;lead=this.trafficLead(c);if(this.speed>30)this.onEvent('yield','Traffic giving way.');}
      }
      // Traffic overtakes slower traffic too, only into a lane with safe front and rear gaps.
      if(!c.change&&!c.signal&&c.cooldown===0&&lead.gap<48&&lead.speed<c.cruise-2.5&&!this.route.junctions.some(j=>Math.abs(j.s-c.s)<75)){
        c.cooldown=1+this.rng()*1.5;
        const options=[c.lane-1,c.lane+1].filter(l=>l>=0&&l<3&&this.trafficCanChange(c,l));
        let best=null,bestGap=lead.gap+12;for(const l of options){const g=this.lead(c.s,LANES[l],c.id).gap;if(g>bestGap){best=l;bestGap=g;}}
        if(best!==null){c.change={from:c.offset,to:LANES[best],t:0,duration:3.2+this.rng()};c.lane=best;lead=this.trafficLead(c);}
      }
      // Keep right: once nothing slower is ahead on the right, traffic returns there and leaves the fast lane open.
      else if(!c.change&&!c.signal&&c.cooldown===0&&c.lane<2&&!this.route.junctions.some(j=>Math.abs(j.s-c.s)<75)){
        c.cooldown=1.5+this.rng()*2;const right=c.lane+1,ahead=this.lead(c.s,LANES[right],c.id);
        if((ahead.gap>70||ahead.speed>=c.speed-1)&&this.trafficCanChange(c,right))c.signal={lane:right,t:0,hold:1.1+(c.id%5)*.1};
      }
      // Traffic indicates before a keep-right move and only moves if the gap is still safe.
      if(c.signal&&!c.change){c.signal.t+=dt;if(c.signal.t>=c.signal.hold){const l=c.signal.lane;c.signal=null;if(this.trafficCanChange(c,l)){c.change={from:c.offset,to:LANES[l],t:0,duration:3.4+this.rng()};c.lane=l;lead=this.trafficLead(c);}else c.cooldown=1+(c.id%3)*.3;}}
      if(c.change){c.change.t+=dt*clamp(c.speed/8,.3,1);const t=clamp(c.change.t/c.change.duration,0,1);c.offset=mix(c.change.from,c.change.to,smooth(t));if(t===1){c.offset=c.change.to;c.change=null;c.cooldown=5+this.rng()*6;}}
      const stop=this.signalStop(c.s,c.speed);
      if(stop&&stop.gap<lead.gap)lead={gap:stop.gap,speed:0};
      let desired=this.route.sample(c.s).kind==='city'?Math.min(c.cruise,17):c.cruise;
      for(let d=0;d<75;d+=12){const k=this.route.curvature(c.s+d);desired=Math.min(desired,Math.sqrt(3.2/Math.max(k,0.00001)+10*Math.max(0,d-8)));}
      c.speed=Math.max(0,c.speed+idmAcceleration(c.speed,desired,lead.gap,lead.speed,1.6,2.1)*dt);
      const travel=Math.min(c.speed*dt,Math.max(0,lead.gap-2.5));c.s+=travel;
      if(travel<c.speed*dt-0.001)c.speed=Math.min(c.speed,lead.speed);
    }
    const here=this.route.sample(this.s),nearJunction=this.route.junctions.some(j=>Math.abs(j.s-this.s)<65&&j.turn!=='straight');
    const stop=this.signalStop(this.s,this.speed);
    const leadNow=this.lead(this.s,this.offset);
    const desiredHere=here.kind==='highway'?mode.highway:mode.city;
    const calm=!nearJunction&&(!stop||stop.gap>160);
    this.keepRightClock=this.lane<2&&!this.change&&!this.signal?this.keepRightClock+dt:0;
    if(!this.change&&!this.signal&&this.cooldown===0&&calm) {
      const candidates=[this.lane-1,this.lane+1].filter(l=>l>=0&&l<3&&this.canChange(l));
      candidates.sort((a,b)=>this.lead(this.s,LANES[b]).gap-this.lead(this.s,LANES[a]).gap);
      const best=candidates[0];
      // Look further ahead at higher speed and only move to a lane that is clearly better.
      const slower=leadNow.speed<this.speed-1||leadNow.speed<desiredHere-2;
      const reach=Math.max(70,this.speed*(this.activeMode==='superfast'?4.2:3));
      if(best!==undefined&&slower&&leadNow.gap<reach&&this.lead(this.s,LANES[best]).gap>leadNow.gap+18) {
        // Indicate first, then pass: a short blink at pace, longer when relaxed.
        this.signal={lane:best,dir:best>this.lane?1:-1,t:0,hold:this.activeMode==='superfast'?.45:this.activeMode==='hardcore'?.55:.75,kind:'overtake'};
      }
      // Keep right: from the second or third lane, indicate right and return to the
      // first lane (rightmost) once it is free and not slower than the lane we are in.
      else if(this.lane<2&&this.keepRightClock>1.2&&this.canChange(this.lane+1)) {
        const right=this.lead(this.s,LANES[this.lane+1]);
        if(right.gap>reach+20||(right.speed>=desiredHere-2&&right.gap>40))
          this.signal={lane:this.lane+1,dir:1,t:0,hold:this.activeMode==='superfast'?1.0:1.5,kind:'keep-right'};
      }
    }
    if(this.signal&&!this.change) {
      this.signal.t+=dt;
      if(!calm&&this.signal.kind==='keep-right'){this.signal=null;}
      else if(this.signal.t>=this.signal.hold) {
        const sig=this.signal;
        if(this.canChange(sig.lane)) {
          this.change={from:this.offset,to:LANES[sig.lane],lane:sig.lane,t:0,referenceSpeed:Math.max(6,this.speed),duration:mode.change*(sig.kind==='keep-right'?1.25:1),kind:sig.kind,dir:sig.dir};
          if(sig.kind==='overtake')this.onEvent('overtake',(this.activeMode==='superfast'?'Slipstream pass. ':'Clear gap. ')+'Indicating '+(sig.dir<0?'left':'right')+', moving over.');
          else this.onEvent('keepright','Indicating right. Back to the first lane.');
        }else{this.signal=null;this.cooldown=.8;}
      }
    }
    let lead=leadNow;
    if(this.change) {
      const targetLead=this.lead(this.s,this.change.to);
      if(targetLead.gap<lead.gap)lead=targetLead;
    }
    if(stop&&stop.gap<lead.gap)lead={gap:stop.gap,speed:0};
    const desired=this.desiredSpeed(this.s,mode);this.wanted=desired;
    let acc=idmAcceleration(this.speed,desired,lead.gap,lead.speed,mode.headway,mode.accel);
    // Independent stopping envelope remains active even in hardcore and during gifts.
    const safeSpeed=Math.sqrt(Math.max(0,lead.speed*lead.speed+2*8*Math.max(0,lead.gap-4)));
    if(this.speed>safeSpeed)acc=-9;
    this.speed=Math.max(0,this.speed+acc*dt);
    const travel=Math.min(this.speed*dt,Math.max(0,lead.gap-2.8));
    const arcScale=Math.max(.25,1-this.route.signedCurvature(this.s)*this.offset);
    this.s+=travel;this.distance+=travel*arcScale;
    if(travel<this.speed*dt-0.001)this.speed=Math.min(this.speed,lead.speed);
    this.braking=acc<-0.9;
    if(this.change) {
      this.change.t+=dt*clamp(this.speed/this.change.referenceSpeed,0,1.15);
      const t=clamp(this.change.t/this.change.duration,0,1);
      this.offset=clamp(mix(this.change.from,this.change.to,smooth(t)),LANES[0],LANES[2]);
      if(t===1){this.lane=this.change.lane;this.change=null;this.signal=null;this.cooldown=this.activeMode==='superfast'?1.6:3;}
    }
    this.distance+=Math.hypot(travel*arcScale,this.offset-this.prevOffset)-travel*arcScale;
    this.topSpeed=Math.max(this.topSpeed,this.speed);
    this.action=stop&&stop.gap<65?'RED LIGHT':this.change?(this.change.kind==='keep-right'?'KEEPING RIGHT':'OVERTAKING'):this.signal?(this.signal.dir>0?'SIGNALLING RIGHT':'SIGNALLING LEFT'):nearJunction?'TAKING THE TURN':this.braking?'KEEPING DISTANCE':this.boost>0?'BOOST ACTIVE':this.activeMode==='superfast'?'SUPER FAST':here.kind==='highway'?'HIGHWAY CRUISE':'CITY CRUISE';
    for(const c of this.cars)if(!c.opposite&&!c.passed&&c.s<this.s-CAR_LENGTH){c.passed=true;this.overtakes++;}
    this.cars=this.cars.filter(c=>c.s>this.s-120&&c.s<this.s+1000);
    // Spawn beyond the stopping distance so fast modes never meet a car that appears too close.
    const spawnAt=Math.max(380,Math.min(720,this.speed*8.5));
    const capacity=here.kind==='highway'?Math.min(this.maxCars,this.activeMode==='superfast'||this.boost>0?20:30):this.maxCars;
    if(this.cars.length<capacity&&this.rng()<dt*14)this.spawn(this.s+spawnAt+this.rng()*200,Math.floor(this.rng()*3),this.rng()<0.25);
    if(Math.floor(this.time)%12===0)this.route.prune(this.s);
  }
  get position() {return this.route.sample(this.s,this.offset);}
  // -1 left, 0 off, +1 right. Stays on from the first blink until the lane change ends.
  get indicator(){return this.change?Math.sign(this.change.to-this.change.from):this.signal?this.signal.dir:0;}
  static carIndicator(c){return c.change?Math.sign(c.change.to-c.change.from):c.signal?Math.sign(LANES[c.signal.lane]-c.offset):0;}
  get physicalSpeed(){return Math.hypot(this.speed*Math.max(.25,1-this.route.signedCurvature(this.s)*this.offset),(this.offset-this.prevOffset)*60);}
  snapshot() {return {mode:this.mode,activeMode:this.activeMode,boostLevel:this.boostLevel,topSpeedKmh:Math.round(this.topSpeed*3.6),speedKmh:Math.round(this.physicalSpeed*3.6),distanceKm:+(this.distance/1000).toFixed(3),overtakes:this.overtakes,boostSeconds:+this.boost.toFixed(1),action:this.action,indicator:this.indicator,lane:this.lane,traffic:this.cars.length,position:this.position,simulationSeconds:+this.time.toFixed(1)};}
}
