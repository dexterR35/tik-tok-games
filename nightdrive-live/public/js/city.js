import * as THREE from 'three';
import {CELL,random} from './simulation.js';
import {planCityCell} from './city-plan.js';

function texture(width,height,paint){const c=document.createElement('canvas');c.width=width;c.height=height;paint(c.getContext('2d'),width,height);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;}
function facadeTexture(type){
  const r=random(type.length*817);
  return texture(768,768,(c,w,h)=>{
    const base={brick:'#8b786b',plaster:'#b4afa0',stone:'#8c9394',glass:'#526776',warehouse:'#929a98'}[type];c.fillStyle=base;c.fillRect(0,0,w,h);
    for(let i=0;i<50000;i++){c.fillStyle=r()<.5?'#0000000a':'#ffffff0b';c.fillRect(r()*w,r()*h,1+r()*2,1+r()*4);}
    if(type==='brick'){c.lineWidth=1;c.strokeStyle='#4e494529';for(let y=0;y<h;y+=8){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();for(let x=(y%16?8:0);x<w;x+=18){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+8);c.stroke();}}}
    if(type==='warehouse'){c.strokeStyle='#323c3d55';for(let x=0;x<w;x+=7){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}}
    const cols=6,rows=8,cw=w/cols,ch=h/rows;
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const x=col*cw+cw*.20,y=row*ch+ch*.20,ww=cw*.60,hh=ch*.60;
      c.fillStyle='#25313b5c';c.fillRect(x-4,y-3,ww+8,hh+9);
      c.fillStyle=type==='glass'?'#455a67':['#394d59','#4f6167','#6e7978'][Math.floor(r()*3)];c.fillRect(x,y,ww,hh);
      c.fillStyle='#c0c5b21a';c.fillRect(x+3,y+2,ww-6,hh*.32);
      if(r()<.5){c.fillStyle=['#b4b0a1','#a6a79d','#b4b6ab'][Math.floor(r()*3)];const curtain=ww*(.15+r()*.55);c.fillRect(x+2,y+2,curtain,hh-3);}
      c.fillStyle=type==='glass'?'#293d48':'#b7b7ab';c.fillRect(x-2,y+hh,ww+4,3);c.fillRect(x+ww/2-1,y,2,hh);c.fillRect(x,y+hh*.5,ww,1.5);
      c.fillStyle='#16252d39';c.fillRect(x,y,ww,2);
      if(type==='stone'||type==='plaster'){c.fillStyle='#494f4a12';c.fillRect(col*cw,row*ch,cw,2);}
    }
  });
}
function asphaltTexture(){const r=random(561);return texture(512,512,(c,n)=>{c.fillStyle='#555a5b';c.fillRect(0,0,n,n);for(let i=0;i<80000;i++){const value=50+r()*65;c.fillStyle=`rgba(${value},${value+2},${value+2},.24)`;c.fillRect(r()*n,r()*n,1,1);}c.strokeStyle='#1f242329';c.lineWidth=.8;for(let i=0;i<9;i++){let x=r()*n,y=r()*n;c.beginPath();c.moveTo(x,y);for(let k=0;k<12;k++){x+=r()*17-6;y+=r()*13;c.lineTo(x,y);}c.stroke();}});}
function pavementTexture(){return texture(256,256,(c,n)=>{c.fillStyle='#9a9d98';c.fillRect(0,0,n,n);c.strokeStyle='#777c782f';c.lineWidth=2;for(let i=0;i<=n;i+=64){c.beginPath();c.moveTo(i,0);c.lineTo(i,n);c.moveTo(0,i);c.lineTo(n,i);c.stroke();}});}
function foliageTexture(){const r=random(215);return texture(256,256,(c,n)=>{c.fillStyle='#6d8261';c.fillRect(0,0,n,n);for(let i=0;i<5500;i++){c.fillStyle=['#465f46','#738c64','#8d9c73','#607957','#536b4f'][Math.floor(r()*5)];c.beginPath();c.ellipse(r()*n,r()*n,1+r()*2,2+r()*3,r()*6,0,Math.PI*2);c.fill();}});}
export function createCityMaterials(){
  const mat=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness,metalness:0});
  const roadMap=asphaltTexture();roadMap.repeat.set(3,14);
  const materials={asphalt:new THREE.MeshStandardMaterial({color:0xb7babe,map:roadMap,roughness:1,metalness:0}),alley:mat(0x5d6565),terrain:mat(0x6d7c6e),paving:new THREE.MeshStandardMaterial({color:0xb9b8ab,map:pavementTexture(),roughness:1}),curb:mat(0xadae9f),quay:mat(0x7a8380),bridge:mat(0x626b6e),metal:mat(0x434e51,.86),grass:mat(0x778a68),foliage:new THREE.MeshStandardMaterial({color:0xd3d8be,map:foliageTexture(),roughness:1}),trunk:mat(0x6b6254),bench:mat(0x887a61),water:mat(0x597b86,.93),roof:mat(0x6f7778),roofPlant:mat(0x858d8d),stoneTrim:mat(0xa6a698),cornice:mat(0x7c8584),shopGlass:mat(0x394f58,.81),awning:mat(0x626e65),lamp:mat(0xb7b59b),drain:mat(0x414b4d),marking:mat(0xcccbb9),yellow:mat(0xbdb18c)};
  for(const key of ['marking','yellow','drain']){materials[key].polygonOffset=true;materials[key].polygonOffsetFactor=-1;materials[key].polygonOffsetUnits=-1;}
  for(const type of ['brick','plaster','stone','glass','warehouse']){
    const m=new THREE.MeshStandardMaterial({color:0xffffff,map:facadeTexture(type),roughness:.94,metalness:0});
    m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 facadeRepeat;');shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv *= facadeRepeat;\n#endif');};
    m.customProgramCacheKey=()=>`facade-repeat-v1`;materials[type]=m;
  }
  return materials;
}
export class CityStreamer {
  constructor(scene,materials){
    this.scene=scene;this.materials=materials;this.chunks=new Map();this.requested=new Set();this.ready=[];this.wanted=new Set();this.origin={x:0,z:0};this.cell=null;this.completed=0;
    this.geometries={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(1,20,14),trunk:new THREE.CylinderGeometry(.5,.65,1,12)};
    this.matrix=new THREE.Matrix4();this.position=new THREE.Vector3();this.scale=new THREE.Vector3();this.quaternion=new THREE.Quaternion();this.axis=new THREE.Vector3(0,1,0);
    try{this.worker=new Worker(new URL('./city-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{this.requested.delete(data.cx+','+data.cz);this.ready.push(data);};this.worker.onerror=()=>{this.worker?.terminate();this.worker=null;for(const key of this.requested){const [cx,cz]=key.split(',').map(Number);this.ready.push(planCityCell(cx,cz));}this.requested.clear();};}catch{this.worker=null;}
  }
  update(x,z){
    const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL),cell=cx+','+cz;
    if(cell===this.cell)return false;this.cell=cell;this.origin={x:cx*CELL,z:cz*CELL};
    const cells=[];this.wanted.clear();
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const key=(cx+dx)+','+(cz+dz);this.wanted.add(key);cells.push({cx:cx+dx,cz:cz+dz,d:dx*dx+dz*dz});}
    cells.sort((a,b)=>a.d-b.d);
    // The closest four cells are ready before the first visible frame. Everything
    // else is queued outside the main simulation and committed one cell per frame.
    if(this.chunks.size===0)for(const c of cells.slice(0,4))this.commit(planCityCell(c.cx,c.cz));
    for(const c of cells){const key=c.cx+','+c.cz;if(this.chunks.has(key)||this.requested.has(key))continue;this.requested.add(key);if(this.worker)this.worker.postMessage(c);else{this.requested.delete(key);this.ready.push(planCityCell(c.cx,c.cz));}}
    for(const [key,g]of this.chunks){if(!this.wanted.has(key)){this.scene.remove(g);g.traverse(o=>{if(o.isInstancedMesh){o.dispose();o.geometry.dispose();}});this.chunks.delete(key);}else g.position.set(g.userData.cx*CELL-this.origin.x,0,g.userData.cz*CELL-this.origin.z);}
    return true;
  }
  commit(plan){
    const key=plan.cx+','+plan.cz;if(this.chunks.has(key))return;
    const group=new THREE.Group();group.userData={cx:plan.cx,cz:plan.cz};
    for(const [name,data]of Object.entries(plan.groups)){
      const count=data.length/9,source=name==='foliage'?this.geometries.sphere:name==='trunk'?this.geometries.trunk:this.geometries.box;
      // Every cell owns its base buffer, so releasing a cell cannot invalidate
      // an attribute buffer still used by another cell.
      const geo=source.clone();
      const repeats=new Float32Array(count*2);for(let i=0;i<count;i++){repeats[i*2]=data[i*9+7];repeats[i*2+1]=data[i*9+8];}geo.setAttribute('facadeRepeat',new THREE.InstancedBufferAttribute(repeats,2));
      const mesh=new THREE.InstancedMesh(geo,this.materials[name],count);
      mesh.castShadow=['brick','plaster','stone','glass','warehouse','roof','stoneTrim'].includes(name);mesh.receiveShadow=true;
      for(let i=0;i<count;i++){const k=i*9;this.position.set(data[k],data[k+1],data[k+2]);this.scale.set(data[k+3],data[k+4],data[k+5]);this.quaternion.setFromAxisAngle(this.axis,data[k+6]);this.matrix.compose(this.position,this.quaternion,this.scale);mesh.setMatrixAt(i,this.matrix);}
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
    }
    group.position.set(plan.cx*CELL-this.origin.x,0,plan.cz*CELL-this.origin.z);this.scene.add(group);this.chunks.set(key,group);this.completed++;
  }
  pump(){let next;while((next=this.ready.shift())){if(this.wanted.has(next.cx+','+next.cz)){this.commit(next);break;}}}
}
