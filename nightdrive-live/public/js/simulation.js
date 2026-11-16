// SI units throughout: metres, seconds, radians. Rendering never controls physics.
export const CELL = 240;
export const LANES = [2.4, 6.0, 9.6];
export const CAR_LENGTH = 4.8;
export const MODES = {
  safe: { highway: 29, city: 14, headway: 2.0, accel: 2.6, lateral: 3.0 },
  fast: { highway: 48, city: 21, headway: 1.25, accel: 4.1, lateral: 4.6 },
  hardcore: { highway: 61, city: 28, headway: 0.85, accel: 5.4, lateral: 6.0 },
};
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

export function idmAcceleration(speed, desired, gap, leadSpeed, headway=1.5, accel=3) {
  const b=5.5, dv=speed-leadSpeed;
  const desiredGap=3+Math.max(0,speed*headway+speed*dv/(2*Math.sqrt(accel*b)));
  return clamp(accel*(1-Math.pow(speed/Math.max(1,desired),4)-Math.pow(desiredGap/Math.max(0.2,gap),2)),-9,accel);
}

export class Simulation {
  constructor(seed=4316) {
    this.route=new Route(seed); this.rng=random(seed+1); this.mode='fast';
    this.s=125; this.prevS=this.s;this.speed=23; this.lane=1; this.offset=LANES[1];this.prevOffset=this.offset;this.change=null;
    this.time=0; this.distance=0; this.overtakes=0; this.boost=0; this.cooldown=0;
    this.cars=[];this.nextCar=0;this.action='CRUISING';this.braking=false;this.lastTurn=-1;
    this.onEvent=()=>{}; this.maxCars=42;
    this.populate();
  }
  setMode(mode) { if(MODES[mode])this.mode=mode; }
  setRoute(bias) { if(['mixed','highway','city'].includes(bias)){this.route.replan(this.s,bias);} }
  addBoost(seconds) { this.boost=clamp(this.boost+seconds,0,60); }
  spawn(s,lane,opposite=false) {
    if(!opposite && Math.abs(s-this.s)<14 && Math.abs(LANES[lane]-this.offset)<3) return;
    if(this.cars.some(c=>c.opposite===opposite&&c.lane===lane&&Math.abs(c.s-s)<24)) return;
    this.cars.push({id:this.nextCar++,s,prevS:s,lane,speed:opposite?18:15+this.rng()*10,cruise:18+this.rng()*12,opposite,passed:s<this.s,color:Math.floor(this.rng()*7),style:Math.floor(this.rng()*4)});
  }
  populate() {
    for(let i=0;i<27;i++) this.spawn(this.s+25+i*21,Math.floor(this.rng()*3),i%5===0);
  }
  signalStop(s,speed) {
    for(const j of this.route.junctions) {
      if(j.s<s-1 || j.kind==='highway')continue;
      if(j.s-s>250)break;
      const phase=signalPhase(this.time,j.id);
      const canStop=(speed*speed/16+4)<(j.s-s);
      if(phase==='red'||(phase==='amber'&&canStop))return {gap:j.s-s,j};
    }
    return null;
  }
  lead(s,offset,exclude=-1) {
    let gap=1e6,speed=80;
    for(const c of this.cars) {
      if(c.id===exclude||c.opposite||Math.abs(LANES[c.lane]-offset)>2.3)continue;
      const g=c.s-s-CAR_LENGTH;
      if(c.s>s&&g<gap){gap=g;speed=c.speed;}
    }
    return {gap,speed};
  }
  canChange(lane) {
    const offset=LANES[lane];
    for(const c of this.cars) {
      if(c.opposite||c.lane!==lane)continue;
      const d=c.s-this.s;
      if(d>0&&d<Math.max(16,this.speed*1.2+Math.max(0,this.speed-c.speed)*2))return false;
      if(d<=0&&-d<Math.max(15,c.speed*1.2+Math.max(0,c.speed-this.speed)*3))return false;
    }
    return offset>=LANES[0]&&offset<=LANES[2];
  }
  desiredSpeed(s,mode) {
    const here=this.route.sample(s);
    let desired=here.kind==='highway'?mode.highway:mode.city;
    if(this.boost>0)desired+=here.kind==='highway'?18:5;
    // Brake early for the tightest curvature and lower speed zones in the horizon.
    const horizon=Math.max(85,this.speed*this.speed/12+35);
    for(let d=0;d<horizon;d+=9) {
      const p=this.route.sample(s+d),k=this.route.curvature(s+d);
      const curve=Math.sqrt(mode.lateral/Math.max(k*(1+k*LANES[2]),0.00001));
      const limit=Math.min(curve,p.kind==='city'?mode.city+(this.boost>0?5:0):100);
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
    const mode=MODES[this.mode];
    this.cars.sort((a,b)=>b.s-a.s);
    for(const c of this.cars) {
      if(c.opposite){c.s-=c.speed*dt;continue;}
      let lead=this.lead(c.s,LANES[c.lane],c.id);
      // The protagonist is a leader for cars behind it, including both occupied lanes.
      if(this.s>c.s&&Math.abs(LANES[c.lane]-this.offset)<2.5&&this.s-c.s-CAR_LENGTH<lead.gap)lead={gap:this.s-c.s-CAR_LENGTH,speed:this.speed};
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
    if(!this.change&&this.cooldown===0&&!nearJunction&&(!stop||stop.gap>160)) {
      const candidates=[this.lane-1,this.lane+1].filter(l=>l>=0&&l<3&&this.canChange(l));
      candidates.sort((a,b)=>this.lead(this.s,LANES[b]).gap-this.lead(this.s,LANES[a]).gap);
      const best=candidates[0];
      if(best!==undefined&&leadNow.gap<Math.max(70,this.speed*3)&&this.lead(this.s,LANES[best]).gap>leadNow.gap+18) {
        this.change={from:this.offset,to:LANES[best],lane:best,t:0,referenceSpeed:Math.max(6,this.speed),duration:this.mode==='safe'?3.8:this.mode==='fast'?2.8:2.3};
        this.onEvent('overtake','Clear gap. Moving '+(best<this.lane?'left':'right')+'.');
      }
    }
    let lead=leadNow;
    if(this.change) {
      const targetLead=this.lead(this.s,this.change.to);
      if(targetLead.gap<lead.gap)lead=targetLead;
    }
    if(stop&&stop.gap<lead.gap)lead={gap:stop.gap,speed:0};
    const desired=this.desiredSpeed(this.s,mode);
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
      if(t===1){this.lane=this.change.lane;this.change=null;this.cooldown=3;}
    }
    this.distance+=Math.hypot(travel*arcScale,this.offset-this.prevOffset)-travel*arcScale;
    this.action=stop&&stop.gap<65?'RED LIGHT':this.change?'OVERTAKING':nearJunction?'TAKING THE TURN':this.braking?'KEEPING DISTANCE':this.boost>0?'BOOST ACTIVE':here.kind==='highway'?'HIGHWAY CRUISE':'CITY CRUISE';
    for(const c of this.cars)if(!c.opposite&&!c.passed&&c.s<this.s-CAR_LENGTH){c.passed=true;this.overtakes++;}
    this.cars=this.cars.filter(c=>c.s>this.s-120&&c.s<this.s+720);
    if(this.cars.length<this.maxCars&&this.rng()<dt*14)this.spawn(this.s+380+this.rng()*200,Math.floor(this.rng()*3),this.rng()<0.25);
    if(Math.floor(this.time)%12===0)this.route.prune(this.s);
  }
  get position() {return this.route.sample(this.s,this.offset);}
  get physicalSpeed(){return Math.hypot(this.speed*Math.max(.25,1-this.route.signedCurvature(this.s)*this.offset),(this.offset-this.prevOffset)*60);}
  snapshot() {return {mode:this.mode,speedKmh:Math.round(this.physicalSpeed*3.6),distanceKm:+(this.distance/1000).toFixed(3),overtakes:this.overtakes,boostSeconds:+this.boost.toFixed(1),action:this.action,traffic:this.cars.length,position:this.position,simulationSeconds:+this.time.toFixed(1)};}
}
