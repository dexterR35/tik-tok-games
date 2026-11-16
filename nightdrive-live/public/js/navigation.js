import {CELL,LANES,signalPhase} from './simulation.js';
import {districtAt,DISTRICTS,isRiverCell} from './districts.js';
export class Navigation {
  constructor(sim){this.sim=sim;this.mini=document.getElementById('minimap');this.map=document.getElementById('world-map');this.overlay=document.getElementById('map-overlay');this.zoom=1;
    document.getElementById('map-button').addEventListener('click',()=>this.toggle());document.getElementById('map-close').addEventListener('click',()=>this.toggle(false));
    document.getElementById('map-zoom-in').addEventListener('click',()=>{this.zoom=Math.min(3,this.zoom*1.4);this.draw();});document.getElementById('map-zoom-out').addEventListener('click',()=>{this.zoom=Math.max(.45,this.zoom/1.4);this.draw();});
    window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.code==='KeyM'){e.preventDefault();this.toggle();}if(e.code==='Escape')this.toggle(false);});
  }
  toggle(open=this.overlay.hidden){this.overlay.hidden=!open;document.getElementById('map-button').setAttribute('aria-expanded',String(open));if(open){this.draw();document.getElementById('map-close').focus();}}
  paint(canvas,large=false){
    const ctx=canvas.getContext('2d'),n=canvas.width,p=this.sim.position,scale=large?.16*this.zoom:.47;
    const project=(x,z)=>({x:n*.5+(x-p.x)*scale,y:n*(large?.57:.62)+(z-p.z)*scale});
    ctx.clearRect(0,0,n,n);ctx.fillStyle=large?'#1b252c':'#1b272e';ctx.fillRect(0,0,n,n);
    const radius=Math.ceil(n/(CELL*scale)/2)+2,cx=Math.floor(p.x/CELL),cz=Math.floor(p.z/CELL);
    for(let x=cx-radius;x<=cx+radius;x++)for(let z=cz-radius;z<=cz+radius;z++){
      const v=project(x*CELL,z*CELL),size=CELL*scale,d=districtAt((x+.5)*CELL,(z+.5)*CELL);
      ctx.fillStyle=isRiverCell(x)?'#35505c':d.style==='river'?'#34423a':d.style==='brick'?'#403d38':d.style==='industrial'?'#373d3c':'#35404a';
      ctx.fillRect(v.x+10*scale,v.y+10*scale,size-20*scale,size-20*scale);
      if(!isRiverCell(x))for(let i=0;i<2;i++)for(let j=0;j<2;j++){ctx.fillStyle='#ffffff05';ctx.fillRect(v.x+(30+i*110)*scale,v.y+(30+j*110)*scale,80*scale,80*scale);}
    }
    ctx.lineWidth=large?3:5;ctx.strokeStyle='#7c8b904f';
    for(let k=-radius;k<=radius;k++){let a=project((cx+k)*CELL,p.z-n/scale),b=project((cx+k)*CELL,p.z+n/scale);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();a=project(p.x-n/scale,(cz+k)*CELL);b=project(p.x+n/scale,(cz+k)*CELL);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#1b2934';ctx.lineWidth=large?10:9;this.routePath(ctx,project,large);ctx.stroke();ctx.strokeStyle='#e9b66f';ctx.lineWidth=large?5:4;this.routePath(ctx,project,large);ctx.stroke();
    for(const j of this.sim.route.junctions){if(j.kind==='highway'||Math.abs(j.s-this.sim.s)>800)continue;const v=project(j.x,j.z);ctx.fillStyle=signalPhase(this.sim.time,j.id)==='green'?'#86aaa2':'#d98f75';ctx.beginPath();ctx.arc(v.x,v.y,large?3.5:3,0,Math.PI*2);ctx.fill();}
    if(!large)for(const c of this.sim.cars){if(Math.abs(c.s-this.sim.s)>350)continue;const q=this.sim.route.sample(c.s,LANES[c.lane]*(c.opposite?-1:1)),v=project(q.x,q.z);ctx.fillStyle='#bac9cb';ctx.fillRect(v.x-2,v.y-2,4,4);}
    if(large){ctx.font='bold 19px Arial';ctx.textAlign='center';for(let dz=-1;dz<=1;dz++){const x=(cx+.5)*CELL,z=(Math.floor(cz/5)*5+dz*5+2)*CELL,d=districtAt(x,z),v=project(x,z);ctx.fillStyle='#d3d9d4';ctx.fillText(d.name,v.x,v.y);ctx.fillStyle='#8f9da0';ctx.font='12px monospace';ctx.fillText(d.road.toUpperCase(),v.x,v.y+22);ctx.font='bold 19px Arial';}}
    const v=project(p.x,p.z);ctx.save();ctx.translate(v.x,v.y);ctx.rotate(p.heading);ctx.fillStyle='#f1eddf';ctx.strokeStyle='#1c2c34';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(9,10);ctx.lineTo(0,6);ctx.lineTo(-9,10);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  }
  routePath(ctx,project,large){ctx.beginPath();let first=true;for(let s=this.sim.s-100;s<this.sim.s+(large?3300:800);s+=large?12:5){const p=this.sim.route.sample(s,this.sim.offset),v=project(p.x,p.z);if(first){ctx.moveTo(v.x,v.y);first=false;}else ctx.lineTo(v.x,v.y);}}
  draw(){this.paint(this.mini);if(!this.overlay.hidden){this.paint(this.map,true);const d=districtAt(this.sim.position.x,this.sim.position.z);document.getElementById('map-district').textContent=d.name;}}
}
