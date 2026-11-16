export const CARS = [
  { id:'street', name:'FERRARI 458', brand:'FERRARI', model:'458 ITALIA', asset:'ferrari', class:'CLASS C', color:'#d3ff39', price:0, speed:0, length:4.53, rotation:0, subtitle:'The beginning of your legacy.' },
  { id:'porsche', name:'PORSCHE 911 GT3', brand:'PORSCHE', model:'911 GT3', asset:'porsche', class:'CLASS B', color:'#e9edf2', price:750, speed:8, length:4.57, rotation:Math.PI, subtitle:'Precision in every pursuit.' },
  { id:'lamborghini', name:'LAMBORGHINI SVJ', brand:'LAMBORGHINI', model:'AVENTADOR SVJ', asset:'lamborghini', class:'CLASS A', color:'#ff8446', price:2000, speed:15, length:4.94, rotation:Math.PI, subtitle:'V12 power. A different beast.' },
  { id:'bugatti', name:'BUGATTI CHIRON', brand:'BUGATTI', model:'CHIRON PROFILÉE', asset:'bugatti', class:'CLASS S', color:'#36b8f2', price:5000, speed:23, length:4.54, rotation:-Math.PI/2, subtitle:'The ultimate crowd-powered hypercar.' }
];
export const GIFTS = {
  rose:{name:'Rose',label:'STREET BOOST',speed:24,duration:3,icon:'rose',points:8},
  energy:{name:'Energy',label:'NITRO INJECTION',speed:50,duration:5,icon:'bolt',points:25},
  galaxy:{name:'Galaxy',label:'GALAXY OVERDRIVE',speed:92,duration:7,icon:'galaxy',points:65},
  lion:{name:'Mega gift',label:'BEAST MODE',speed:155,duration:9,icon:'crown',points:120}
};
export const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
export const validCount=(value,max=1e9)=>clamp(Math.floor(Number(value)||0),0,max);
export const giftTier=coins=>coins>=1000?'lion':coins>=100?'galaxy':coins>=10?'energy':'rose';
export const CROWD_PRESETS=[0,1000,2000,10000];
export const TAP_GAIN=1.5;
export const MAX_TAP_POWER=140;
export function crowdDivisor(viewers){return Math.max(1,validCount(viewers)*.03);}
export function advanceCrowdSimulation(engine,dt,state){
  let remaining=Math.max(0,Number(dt)||0);if(!Number.isFinite(remaining))return;
  while(remaining>1e-8){const step=Math.min(.05,remaining);remaining-=step;state.remainder=(state.remainder||0)+state.viewers*.15*step;const likes=Math.floor(state.remainder+1e-8);state.remainder=Math.max(0,state.remainder-likes);if(likes)engine.tap(likes,{live:true});engine.update(step);}
}

export class RaceEngine {
  constructor({duration=30,car=0,round=1,audience=0,difficulty='hard'}={}){
    this.duration=[30,60].includes(Number(duration))?Number(duration):30;
    this.car=clamp(Math.floor(Number(car)||0),0,CARS.length-1);this.round=round;
    this.audience=validCount(audience,1e7);this.difficulty=difficulty==='relentless'?'relentless':'hard';this.reset();
  }
  reset(){
    this.phase='countdown';this.phaseTime=0;this.elapsed=0;this.taps=0;this.effectiveTaps=0;
    this.tapPower=0;this.combo=0;this.lastTap=-100;this.boosts=[];this.giftPoints=0;this.giftCount=0;
    this.position=4;this.result=null;this.lastOvertake=null;this.lastCaught=null;
    this.cars=[
      {id:'you',name:'YOU',color:CARS[this.car].color,speed:0,distance:0,lane:-1.8,catchup:0},
      {id:'viper',name:'VIPER',color:'#ff8446',speed:0,distance:1.4,lane:1.8,catchup:0},
      {id:'ghost',name:'GHOST',color:'#e9edf2',speed:0,distance:3.6,lane:5.4,catchup:0},
      {id:'nova',name:'NOVA',color:'#36b8f2',speed:0,distance:5.8,lane:-5.4,catchup:0}
    ];
  }
  setAudience(viewers){this.audience=validCount(viewers,1e7);}
  tap(count=1,{live=false}={}){
    if(!['countdown','racing'].includes(this.phase))return 0;
    count=validCount(count);if(!count)return 0;
    const effective=count/(live?crowdDivisor(this.audience):1);
    this.taps+=count;this.effectiveTaps+=effective;
    const gain=effective*TAP_GAIN;this.tapPower=clamp(this.tapPower+gain,0,MAX_TAP_POWER);
    this.combo=this.elapsed-this.lastTap<.9?clamp(this.combo+count,0,999999999):count;this.lastTap=this.elapsed;
    return gain;
  }
  gift(tier,count=1){
    if(!GIFTS[tier]||!['countdown','racing'].includes(this.phase))return false;
    count=validCount(count,1e6);if(!count)return false;
    const gift=GIFTS[tier];let boost=this.boosts.find(b=>b.tier===tier);
    const amount=(boost?.count||0)+count;
    const speed=gift.speed*(1+Math.min(.45,Math.log2(amount)*.075));
    const left=gift.duration+Math.min(4,Math.log2(amount)*.5);
    if(boost)Object.assign(boost,{left:Math.max(boost.left,left),speed,count:amount});
    else this.boosts.push({tier,left,speed,count:amount});
    this.giftPoints+=gift.points*count;this.giftCount+=count;return true;
  }
  get boostSpeed(){return clamp(this.boosts.reduce((sum,b)=>sum+b.speed,0),0,210);}
  get boostLeft(){return this.boosts.reduce((max,b)=>Math.max(max,b.left),0);}
  get order(){return [...this.cars].sort((a,b)=>b.distance-a.distance);}
  update(dt){
    dt=Math.max(0,Number(dt)||0);if(!Number.isFinite(dt))return;
    // Wall-clock catch-up: a slow or backgrounded renderer cannot extend the race.
    while(dt>1e-8){
      if(this.phase==='finished'){this.phaseTime+=dt;break;}
      if(this.phase==='countdown'){
        const step=Math.min(dt,3-this.phaseTime);this.phaseTime+=step;dt-=step;
        if(this.phaseTime>=3-1e-8){this.phase='racing';this.phaseTime=0;}continue;
      }
      const step=Math.min(dt,.05,this.duration-this.elapsed);dt-=step;this.tick(step);
    }
  }
  tick(dt){
    this.elapsed+=dt;this.phaseTime+=dt;
    const inactive=this.elapsed-this.lastTap>.9;
    this.tapPower=Math.max(0,this.tapPower-dt*3.2);
    if(inactive){this.tapPower*=Math.exp(-dt/.95);this.combo=0;}
    this.boosts=this.boosts.filter(b=>(b.left-=dt)>0);
    const player=this.cars[0],launch=1-Math.exp(-this.elapsed/1.8);
    const playerTarget=(210+CARS[this.car].speed+this.tapPower+this.boostSpeed)*launch;
    const relentless=this.difficulty==='relentless'?10:0;
    const finalSprint=this.elapsed>this.duration-7?12:0;
    const base=[0,226,220,216];
    const targets=this.cars.map((car,i)=>{
      if(!i)return playerTarget;
      const gap=player.distance-car.distance;
      const catchup=clamp((gap-3)*.9,0,55);
      car.catchup=catchup;
      const chaseTarget=gap>3?Math.min(85,this.tapPower*(this.difficulty==='relentless'?.68:.6)):0;
      car.chasePower=(car.chasePower||0)+(chaseTarget-(car.chasePower||0))*(1-Math.exp(-dt/2.5));
      const attack=Math.max(0,Math.sin(this.elapsed*.8+i*1.7))*5;
      return (base[i]+relentless+finalSprint+catchup+car.chasePower+attack+this.elapsed/this.duration*5)*launch;
    });
    this.cars.forEach((car,i)=>{car.speed+=(targets[i]-car.speed)*(1-Math.exp(-dt*3));car.distance+=car.speed/3.6*dt;});
    const position=this.order.findIndex(car=>car.id==='you')+1;
    if(position<this.position)this.lastOvertake={position,at:this.elapsed};
    if(position>this.position)this.lastCaught={position,at:this.elapsed};
    this.position=position;
    if(this.elapsed>=this.duration-1e-8){
      this.elapsed=this.duration;this.phase='finished';this.phaseTime=0;
      const points=[400,220,130,70][position-1]+Math.min(150,Math.floor(this.effectiveTaps))+Math.min(250,this.giftPoints);
      this.result=Object.freeze({rank:position,points,taps:this.taps,speed:Math.round(player.speed),distance:Math.round(player.distance),duration:this.duration});
    }
  }
}
