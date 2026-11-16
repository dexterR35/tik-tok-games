// Rendering interpolates between completed fixed physics steps. Heading interpolation
// follows the shortest arc, including the -PI / PI boundary.
export const FIXED_STEP=1/60;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const dampFactor=(rate,dt)=>1-Math.exp(-rate*Math.max(0,dt));
export const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const lerpAngle=(a,b,t)=>a+wrapAngle(b-a)*t;
export function interpolateVehicle(vehicle,alpha){
  return {s:lerp(vehicle.prevS??vehicle.s,vehicle.s,alpha),offset:lerp(vehicle.prevOffset??vehicle.offset??0,vehicle.offset??0,alpha)};
}
export class FrameClock {
  constructor(){this.accumulator=0;this.previous=null;this.frames=0;this.elapsed=0;this.fps=0;this.frameMs=0;this.worstMs=0;}
  tick(now,step){
    if(this.previous===null){this.previous=now;return {dt:0,alpha:0};}
    const raw=Math.max(0,(now-this.previous)/1000);this.previous=now;
    const dt=Math.min(raw,.2);this.accumulator+=dt;
    let count=0;while(this.accumulator>=FIXED_STEP&&count<12){step(FIXED_STEP);this.accumulator-=FIXED_STEP;count++;}
    this.accumulator=Math.min(this.accumulator,FIXED_STEP);
    this.frames++;this.elapsed+=raw;this.worstMs=Math.max(this.worstMs,raw*1000);
    this.frameMs=lerp(this.frameMs,raw*1000,.08);
    if(this.elapsed>=1){this.fps=Math.round(this.frames/this.elapsed);this.frames=0;this.elapsed=0;}
    return {dt,alpha:this.accumulator/FIXED_STEP};
  }
  reset(){this.previous=null;this.accumulator=0;}
}
