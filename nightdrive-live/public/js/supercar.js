import * as THREE from 'three';
import {GeometryBatch} from './vehicles.js';

// VELOCE R — an original mid-engine supercar for the autodrive car only.
// Unbranded: no real-world logos, names or model-specific shapes.
const up=new THREE.Vector3(0,1,0);
export const VELOCE={id:'veloce',name:'VELOCE R',wheelRadius:.355,axles:[-1.42,1.33],track:.9,headlight:{y:.52,z:-2.2,spread:.66}};

function loft(stations,{segments=96,rings=40,arches=null,power=.6,crown=.42}={}){
  const pts=stations.map(a=>({z:a[0],half:a[1],bottom:a[2],top:a[3]}));
  const cr=(p0,p1,p2,p3,t)=>{const t2=t*t,t3=t2*t;return .5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);};
  const sample=z=>{let i=0;while(i<pts.length-2&&pts[i+1].z<z)i++;const a=pts[i],b=pts[i+1],p0=pts[Math.max(0,i-1)],p3=pts[Math.min(pts.length-1,i+2)],t=Math.max(0,Math.min(1,(z-a.z)/(b.z-a.z)));
    const f=k=>cr(p0[k],a[k],b[k],p3[k],t);return {half:f('half'),bottom:f('bottom'),top:f('top')};};
  const pos=[],uv=[],idx=[],z0=pts[0].z,z1=pts.at(-1).z;
  for(let j=0;j<=segments;j++){const z=THREE.MathUtils.lerp(z0,z1,j/segments),p=sample(z);
    for(let k=0;k<=rings;k++){const a=k/rings*Math.PI*2,s=Math.sin(a),c=Math.cos(a),x=Math.sign(s)*Math.pow(Math.abs(s),power)*p.half;
      let y=(p.bottom+p.top)/2+Math.sign(c)*Math.pow(Math.abs(c),crown)*(p.top-p.bottom)/2;
      if(arches&&Math.abs(x)>arches.inner){for(const axle of arches.axles){const d=Math.abs(z-axle);if(d<arches.radius)y=Math.max(y,arches.center+Math.sqrt(arches.radius*arches.radius-d*d));}}
      pos.push(x,y,z);uv.push(k/rings,j/segments);
      if(j<segments&&k<rings){const i=j*(rings+1)+k;idx.push(i,i+rings+1,i+1,i+1,i+rings+1,i+rings+2);}
    }
  }
  for(const j of [0,segments]){const start=pos.length/3,z=j===0?z0:z1,p=sample(z);pos.push(0,(p.top+p.bottom)/2,z);uv.push(.5,.5);for(let k=0;k<rings;k++){const a=j*(rings+1)+k,b=a+1;if(j===0)idx.push(start,a,b);else idx.push(start,b,a);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function plate(text){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.fillStyle='#ecece2';x.fillRect(0,0,256,64);x.fillStyle='#24398f';x.fillRect(0,0,24,64);x.fillStyle='#16191c';x.textAlign='center';x.font='bold 34px monospace';x.fillText(text,142,44);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function wheel(m){
  const b=new GeometryBatch(),r=VELOCE.wheelRadius,rotZ=new THREE.Matrix4().makeRotationZ(Math.PI/2);
  b.add(new THREE.CylinderGeometry(r,r,.27,48,1),m.tire,rotZ);
  b.add(new THREE.TorusGeometry(r-.02,.028,10,48),m.tire,new THREE.Matrix4().compose(new THREE.Vector3(.135,0,0),new THREE.Quaternion().setFromAxisAngle(up,Math.PI/2),new THREE.Vector3(1,1,1)));
  b.add(new THREE.CylinderGeometry(.205,.205,.24,40),m.disc,rotZ);
  b.add(new THREE.TorusGeometry(.262,.02,8,48),m.rim,new THREE.Matrix4().compose(new THREE.Vector3(.137,0,0),new THREE.Quaternion().setFromAxisAngle(up,Math.PI/2),new THREE.Vector3(1,1,1)));
  b.add(new THREE.CylinderGeometry(.06,.06,.26,20),m.rim,rotZ);
  // Ten forged twin spokes on the outer face.
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2+(i%2)*.09;b.add(new THREE.BoxGeometry(.03,.21,.042),m.rim,new THREE.Matrix4().compose(new THREE.Vector3(.142,Math.cos(a)*.155,Math.sin(a)*.155),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),a),new THREE.Vector3(1,1,1)));}
  return b.finish();
}
export function createSupercar(lights){
  const m={
    paint:new THREE.MeshPhysicalMaterial({color:0x8e0a12,roughness:.34,metalness:.22,clearcoat:1,clearcoatRoughness:.05}),
    carbon:new THREE.MeshPhysicalMaterial({color:0x111316,roughness:.38,metalness:.2,clearcoat:.8,clearcoatRoughness:.15}),
    black:new THREE.MeshStandardMaterial({color:0x060708,roughness:.8}),
    glass:new THREE.MeshPhysicalMaterial({color:0x0a1016,roughness:.05,metalness:.2,clearcoat:1}),
    stripe:new THREE.MeshPhysicalMaterial({color:0xf1efe6,roughness:.32,clearcoat:1,clearcoatRoughness:.06}),
    rim:new THREE.MeshStandardMaterial({color:0x2b2e31,roughness:.3,metalness:.85}),
    disc:new THREE.MeshStandardMaterial({color:0x6e7173,roughness:.45,metalness:.7}),
    caliper:new THREE.MeshStandardMaterial({color:0xe2b11c,roughness:.4,metalness:.2}),
    tire:new THREE.MeshStandardMaterial({color:0x131415,roughness:.95}),
    chrome:new THREE.MeshStandardMaterial({color:0xb9bcbf,roughness:.18,metalness:1}),
  };
  const b=new GeometryBatch(),arches={axles:VELOCE.axles,radius:.405,center:.355,inner:.68};
  const box=(x,y,z,w,h,d,mat,ry=0,rx=0)=>b.add(new THREE.BoxGeometry(w,h,d),mat,new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,0)),new THREE.Vector3(1,1,1)));
  // Low wedge body: short nose, long flanks, wide rear haunches over the engine.
  const body=[[-2.33,.70,.20,.40],[-2.2,.86,.17,.50],[-1.85,.97,.16,.60],[-1.42,1.0,.16,.67],[-1.0,.97,.16,.69],[-.5,.93,.17,.71],[0,.92,.17,.75],[.6,.98,.17,.81],[1.33,1.03,.17,.85],[1.9,1.01,.19,.85],[2.22,.95,.24,.81],[2.35,.86,.30,.75]];
  b.add(loft(body,{arches}),m.paint);
  // Teardrop canopy set back over the mid engine, with a painted roof.
  b.add(loft([[-1.18,.52,.64,.68],[-.86,.66,.66,.9],[-.45,.71,.68,1.08],[.15,.72,.7,1.14],[.65,.67,.74,1.07],[1.15,.54,.78,.92],[1.6,.38,.8,.85]],{segments:64,rings:32}),m.glass);
  b.add(loft([[-.46,.5,.99,1.085],[-.2,.6,1.03,1.135],[.3,.62,1.05,1.158],[.75,.56,.98,1.09],[1.05,.48,.9,.97]],{segments:32,rings:28}),m.paint);
  // Twin racing stripes along nose and engine cover.
  for(const sx of [-.17,.17]){
    b.add(loft([[-2.21,.065,.42,.505],[-1.85,.065,.52,.607],[-1.42,.065,.59,.677],[-1.15,.065,.6,.695]],{segments:32,rings:16,power:.3,crown:.25}),m.stripe,new THREE.Matrix4().makeTranslation(sx,.006,0));
    b.add(loft([[-.44,.065,1.0,1.09],[-.2,.065,1.06,1.14],[.3,.065,1.08,1.163],[.75,.065,1.0,1.095]],{segments:24,rings:16,power:.3,crown:.25}),m.stripe,new THREE.Matrix4().makeTranslation(sx,.004,0));
  }
  // Engine-cover louvres, side intakes, skirts, splitter, diffuser, wing.
  for(let i=0;i<6;i++)box(0,.86+i*.004,1.55+i*.11,1.05,.018,.05,m.black,0,-.12);
  for(const s of [-1,1]){
    box(s*.955,.48,.48,.04,.2,.62,m.black,s*.07);box(s*.958,.6,.36,.035,.03,.9,m.carbon,s*.07);
    box(s*.96,.205,-.05,.08,.09,2.15,m.carbon);
    box(s*.99,.86,-.7,.17,.08,.22,m.paint,s*-.15);box(s*.88,.8,-.66,.16,.03,.05,m.carbon);box(s*1.07,.86,-.69,.01,.055,.15,m.glass,s*-.15);
    // Slim angled LED headlights and a full-width taillight bar.
    box(s*.62,.5,-2.08,.44,.055,.18,lights.light,s*.32,-.25);box(s*.66,.47,-2.1,.36,.02,.12,m.chrome,s*.32,-.25);
    box(s*.74,.72,2.275,.34,.09,.06,lights.red,s*-.12);
    box(s*.42,.24,-2.16,.34,.13,.08,m.black);
    box(s*.18,.3,2.38,.1,.1,.06,m.black);b.add(new THREE.CylinderGeometry(.055,.055,.12,20),m.chrome,new THREE.Matrix4().compose(new THREE.Vector3(s*.18,.3,2.36),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2),new THREE.Vector3(1,1,1)));
    box(s*.47,1.0,1.98,.04,.24,.16,m.carbon);box(s*.9,1.11,2.03,.025,.14,.36,m.carbon);
    for(const z of VELOCE.axles)box(s*.8,.36,z-.2,.06,.17,.13,m.caliper);
  }
  box(0,.715,2.31,1.2,.045,.035,lights.red);
  box(0,.31,-2.27,1.05,.17,.06,m.black);box(0,.135,-2.12,1.78,.035,.38,m.carbon);
  box(0,.27,2.24,1.5,.1,.26,m.carbon,0,.2);for(let i=-2;i<=2;i++)box(i*.3,.27,2.26,.025,.11,.24,m.black,0,.2);
  box(0,1.125,2.03,1.86,.035,.36,m.carbon,0,.08);box(0,.875,2.25,1.6,.03,.14,m.carbon,0,-.2);
  const group=b.finish();group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const root=new THREE.Group();root.add(group);
  const plateMesh=new THREE.Mesh(new THREE.PlaneGeometry(.4,.1),new THREE.MeshBasicMaterial({map:plate('VELOCE')}));plateMesh.position.set(0,.47,2.385);root.add(plateMesh);
  const tyre=wheel(m),wheels=[];for(const z of VELOCE.axles)for(const s of [-1,1]){const w=tyre.clone();w.position.set(s*VELOCE.track,VELOCE.wheelRadius,z);if(s<0)w.rotation.y=Math.PI;root.add(w);wheels.push(w);}
  root.userData={...VELOCE,reflective:[m.paint,m.carbon,m.glass,m.stripe,m.rim,m.chrome]};
  return {group:root,wheels,radius:VELOCE.wheelRadius,headlight:VELOCE.headlight,name:VELOCE.name,reflective:root.userData.reflective};
}
