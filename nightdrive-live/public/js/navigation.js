import {CELL,LANES,signalPhase} from './simulation.js';
import {districtAt,isRiverCell} from './districts.js';
import {warpPoint,warpPose} from './warp.js';

// GTA-style radar: heading-up, curved streets (same warp as the 3D city),
// purple GPS route, white player arrow, traffic blips and two status bars.
const COLORS={land:'#2c3a36',block:'#3b4744',river:'#2f6a86',road:'#8d989b',roadEdge:'#1b2426',route:'#b05fe0',routeGlow:'#d79bff',north:'#f2f2f2'};
const blockTint=d=>d.style==='river'?'#33463d':d.style==='brick'?'#463f37':d.style==='industrial'?'#3a403f':d.style==='tower'?'#3c4652':'#3b4744';

export class Navigation {
  constructor(sim){this.sim=sim;this.mini=document.getElementById('minimap');this.map=document.getElementById('world-map');this.overlay=document.getElementById('map-overlay');this.zoom=1;this.view=null;
    document.getElementById('map-button').addEventListener('click',()=>this.toggle());document.getElementById('map-close').addEventListener('click',()=>this.toggle(false));
    document.getElementById('map-zoom-in').addEventListener('click',()=>{this.zoom=Math.min(3,this.zoom*1.4);this.draw();});document.getElementById('map-zoom-out').addEventListener('click',()=>{this.zoom=Math.max(.45,this.zoom/1.4);this.draw();});
    window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.code==='KeyM'){e.preventDefault();this.toggle();}if(e.code==='Escape')this.toggle(false);});
  }
  toggle(open=this.overlay.hidden){this.overlay.hidden=!open;document.getElementById('map-button').setAttribute('aria-expanded',String(open));if(open){this.draw();document.getElementById('map-close').focus();}}
  // World (absolute, unwarped) -> canvas. The radar turns with the car, the big map stays north-up.
  projector(canvas,large){
    const n=canvas.width,p=this.sim.position,car=warpPose(p.x,p.z,p.heading),scale=large?.16*this.zoom:.62;
    const cx=n*.5,cy=large?n*.55:n*.6,fx=large?0:car.dx,fz=large?-1:car.dz;
    const tmp={x:0,z:0};
    const project=(x,z,warped=false)=>{const w=warped?{x,z}:warpPoint(x,z,tmp),rx=w.x-car.x,rz=w.z-car.z;
      return {x:cx+(rx*-fz+rz*fx)*scale,y:cy-(rx*fx+rz*fz)*scale};};
    return {n,p,car,scale,cx,cy,fx,fz,project};
  }
  // A straight grid line drawn as a polyline through the warp, so it bends like the 3D road.
  line(ctx,project,x0,z0,x1,z1,step){const len=Math.hypot(x1-x0,z1-z0),k=Math.max(1,Math.ceil(len/step));for(let i=0;i<=k;i++){const t=i/k,v=project(x0+(x1-x0)*t,z0+(z1-z0)*t);if(i)ctx.lineTo(v.x,v.y);else ctx.moveTo(v.x,v.y);}}
  cellPath(ctx,project,x0,z0,x1,z1,step){ctx.beginPath();this.line(ctx,project,x0,z0,x1,z0,step);this.line(ctx,project,x1,z0,x1,z1,step);this.line(ctx,project,x1,z1,x0,z1,step);this.line(ctx,project,x0,z1,x0,z0,step);ctx.closePath();}
  paint(canvas,large=false){
    const ctx=canvas.getContext('2d'),{n,p,car,scale,cx,cy,fx,fz,project}=this.projector(canvas,large),step=large?30:14;
    ctx.save();ctx.clearRect(0,0,n,n);
    // Rounded radar frame.
    const r=large?18:26,inset=large?0:6,barH=large?0:24;
    ctx.beginPath();ctx.roundRect(inset,inset,n-inset*2,n-inset*2-barH,r);ctx.fillStyle=COLORS.land;ctx.fill();ctx.save();ctx.clip();
    const reach=Math.hypot(n,n)/scale*.5,radius=Math.ceil(reach/CELL)+1,gx=Math.floor(car.x/CELL),gz=Math.floor(car.z/CELL);
    // City blocks and canals.
    for(let x=gx-radius;x<=gx+radius;x++)for(let z=gz-radius;z<=gz+radius;z++){
      const x0=x*CELL,z0=z*CELL,d=districtAt((x+.5)*CELL,(z+.5)*CELL);
      ctx.fillStyle=isRiverCell(x)?COLORS.river:blockTint(d);this.cellPath(ctx,project,x0+15,z0+15,x0+CELL-15,z0+CELL-15,step*2);ctx.fill();
      if(!isRiverCell(x)){ctx.strokeStyle='#ffffff10';ctx.lineWidth=Math.max(1,6*scale);ctx.beginPath();this.line(ctx,project,x0+CELL/2,z0+20,x0+CELL/2,z0+CELL-20,step*2);this.line(ctx,project,x0+20,z0+CELL/2,x0+CELL-20,z0+CELL/2,step*2);ctx.stroke();}
    }
    // Streets: dark casing, then light asphalt, both bent through the warp.
    ctx.lineCap='round';ctx.lineJoin='round';
    const span=radius*CELL;
    for(const [width,color] of [[30*scale+3,COLORS.roadEdge],[26*scale,COLORS.road]]){
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(large?2.5:4,width);ctx.beginPath();
      for(let k=-radius;k<=radius;k++){const x=(gx+k)*CELL,z=(gz+k)*CELL;this.line(ctx,project,x,(gz-radius)*CELL,x,(gz+radius+1)*CELL,step);this.line(ctx,project,(gx-radius)*CELL,z,(gx+radius+1)*CELL,z,step);}
      ctx.stroke();
    }
    // GPS route in GTA purple with a soft glow.
    ctx.strokeStyle='#2a0f3a';ctx.lineWidth=large?10:12;this.routePath(ctx,project,large);ctx.stroke();
    ctx.strokeStyle=COLORS.route;ctx.lineWidth=large?6:7;this.routePath(ctx,project,large);ctx.stroke();
    ctx.strokeStyle=COLORS.routeGlow;ctx.globalAlpha=.55;ctx.lineWidth=large?2:2.5;this.routePath(ctx,project,large);ctx.stroke();ctx.globalAlpha=1;
    // Traffic lights at the next junctions.
    for(const j of this.sim.route.junctions){if(j.kind==='highway'||Math.abs(j.s-this.sim.s)>800)continue;const v=project(j.x,j.z),ph=signalPhase(this.sim.time,j.id);ctx.fillStyle=ph==='green'?'#5fd38a':ph==='amber'?'#f2c14e':'#ef5b4b';ctx.strokeStyle='#111a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(v.x,v.y,large?4:5,0,Math.PI*2);ctx.fill();ctx.stroke();}
    // Traffic blips; a car that is indicating shows an amber blip.
    for(const c of this.sim.cars){if(Math.abs(c.s-this.sim.s)>(large?900:420))continue;const q=this.sim.route.sample(c.s,(c.offset??LANES[c.lane])*(c.opposite?-1:1)),v=project(q.x,q.z);
      ctx.fillStyle=(c.change||c.signal)&&!c.opposite?'#ffad3a':c.opposite?'#8fa3ab':'#dfe6e8';ctx.beginPath();ctx.arc(v.x,v.y,large?2.2:3.2,0,Math.PI*2);ctx.fill();}
    if(large){ctx.font='bold 19px Arial';ctx.textAlign='center';const cx0=Math.floor(p.x/CELL),cz0=Math.floor(p.z/CELL);for(let dz=-1;dz<=1;dz++){const x=(cx0+.5)*CELL,z=(Math.floor(cz0/5)*5+dz*5+2)*CELL,d=districtAt(x,z),v=project(x,z);ctx.fillStyle='#e3e6e2';ctx.fillText(d.name,v.x,v.y);ctx.fillStyle='#a3adb0';ctx.font='12px monospace';ctx.fillText(d.road.toUpperCase(),v.x,v.y+22);ctx.font='bold 19px Arial';}}
    // Player arrow (GTA white chevron with dark outline).
    ctx.save();ctx.translate(cx,cy);if(large)ctx.rotate(Math.atan2(car.dx,-car.dz));
    ctx.fillStyle='#ffffff';ctx.strokeStyle='#101418';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-15);ctx.lineTo(11,11);ctx.lineTo(0,5);ctx.lineTo(-11,11);ctx.closePath();ctx.stroke();ctx.fill();ctx.restore();
    // North marker rides the radar edge as the car turns.
    if(!large){
      // World north (0,-1) seen on the turning radar is (-fx, fz) on canvas.
      const dx=-fx,dy=fz,edge=(n-inset*2-barH)/2-16,ox=n/2,oy=inset+(n-inset*2-barH)/2;
      const t=Math.min(edge/Math.max(Math.abs(dx),1e-6),edge/Math.max(Math.abs(dy),1e-6)),px=ox+dx*t,py=oy+dy*t;
      ctx.fillStyle='#0d1114cc';ctx.beginPath();ctx.arc(px,py,12,0,Math.PI*2);ctx.fill();ctx.fillStyle=COLORS.north;ctx.font='bold 15px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('N',px,py+1);ctx.textBaseline='alphabetic';}
    ctx.restore();
    // Radar border.
    ctx.lineWidth=large?2:4;ctx.strokeStyle='#0b0f12';ctx.beginPath();ctx.roundRect(inset,inset,n-inset*2,n-inset*2-barH,r);ctx.stroke();
    // GTA-style bars under the radar: green = pace, blue = boost.
    if(!large){
      const y=n-barH+3,h=12,w=n-inset*2,gap=6,half=(w-gap)/2,pace=Math.min(1,this.sim.speed*3.6/300),boost=Math.min(1,this.sim.boost/30);
      for(const [x0,fill,base,color] of [[inset,pace,'#1f3a26','#5cc26e'],[inset+half+gap,boost,'#1d2c45','#4f8fe8']]){ctx.fillStyle='#0b0f12';ctx.fillRect(x0-1,y-1,half+2,h+2);ctx.fillStyle=base;ctx.fillRect(x0,y,half,h);ctx.fillStyle=color;ctx.fillRect(x0,y,half*fill,h);}
    }
    ctx.restore();
  }
  routePath(ctx,project,large){ctx.beginPath();let first=true;for(let s=this.sim.s-60;s<this.sim.s+(large?3300:900);s+=large?12:5){const p=this.sim.route.sample(s,this.sim.offset),v=project(p.x,p.z);if(first){ctx.moveTo(v.x,v.y);first=false;}else ctx.lineTo(v.x,v.y);}}
  drawRadar(){this.paint(this.mini);}
  draw(){this.paint(this.mini);if(!this.overlay.hidden){this.paint(this.map,true);const d=districtAt(this.sim.position.x,this.sim.position.z);document.getElementById('map-district').textContent=d.name;}}
}
