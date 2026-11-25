import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original unbranded touring cars. No imported sports-car meshes or clearcoat.
export const CAR_COLORS=[0xb99763,0x667f8c,0xc0c2b8,0x576369,0x88776c,0x85918a,0x384c58];
const matte=(color,roughness=.9)=>new THREE.MeshStandardMaterial({color,roughness,metalness:0});
const IDENTITY=new THREE.Matrix4();
const up=new THREE.Vector3(0,1,0);
export class GeometryBatch {
  constructor(){this.parts=new Map();}
  add(geo,mat,matrix=IDENTITY){
    const geometry=geo.index?geo.toNonIndexed():geo; if(geometry!==geo)geo.dispose();
    for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(key))geometry.deleteAttribute(key);
    if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2));
    geometry.applyMatrix4(matrix);if(!this.parts.has(mat))this.parts.set(mat,[]);this.parts.get(mat).push(geometry);
  }
  box(x,y,z,w,h,d,mat,rotation=0){this.add(new THREE.BoxGeometry(w,h,d),mat,new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(up,rotation),new THREE.Vector3(1,1,1)));}
  finish(){const group=new THREE.Group();for(const [mat,parts]of this.parts){const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());if(geo){const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);}}return group;}
}
function loft(stations,segments=72,rings=36,wheelArches=false){
  const points=stations.map(a=>new THREE.Vector4(...a));
  const sample=(z)=>{
    let i=0;while(i<points.length-2&&points[i+1].x<z)i++;
    const a=points[i],b=points[i+1],t=THREE.MathUtils.smoothstep(z,a.x,b.x);
    return {half:THREE.MathUtils.lerp(a.y,b.y,t),bottom:THREE.MathUtils.lerp(a.z,b.z,t),top:THREE.MathUtils.lerp(a.w,b.w,t)};
  };
  const positions=[],uv=[],indices=[];const z0=points[0].x,z1=points.at(-1).x;
  for(let j=0;j<=segments;j++){const z=THREE.MathUtils.lerp(z0,z1,j/segments),p=sample(z);
    for(let k=0;k<=rings;k++){const a=k/rings*Math.PI*2,s=Math.sin(a),c=Math.cos(a),x=Math.sign(s)*Math.pow(Math.abs(s),.64)*p.half;
      let y=(p.bottom+p.top)/2+Math.sign(c)*Math.pow(Math.abs(c),.48)*(p.top-p.bottom)/2;
      if(wheelArches&&Math.abs(x)>.72){const axle=Math.min(Math.abs(z+1.38),Math.abs(z-1.38)),radius=.372;if(axle<radius)y=Math.max(y,.345+Math.sqrt(radius*radius-axle*axle));}
      positions.push(x,y,z);uv.push(k/rings,j/segments);
      if(j<segments&&k<rings){const i=j*(rings+1)+k;indices.push(i,i+rings+1,i+1,i+1,i+rings+1,i+rings+2);}
    }
  }
  // End caps share the rounded perimeter. No open shell is visible from chase view.
  for(const j of [0,segments]){const start=positions.length/3,p=sample(j===0?z0:z1),z=j===0?z0:z1;positions.push(0,(p.top+p.bottom)/2,z);uv.push(.5,.5);for(let k=0;k<rings;k++){const a=j*(rings+1)+k,b=a+1;if(j===0)indices.push(start,a,b);else indices.push(start,b,a);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function plateTexture(){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.fillStyle='#e6e6d9';x.fillRect(0,0,256,64);x.fillStyle='#33424e';x.fillRect(0,0,22,64);x.fillStyle='#293137';x.textAlign='center';x.font='bold 36px monospace';x.fillText('AUTO 01',143,44);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function wheelGeometry(rubber,rim,brake){
  const b=new GeometryBatch();const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
  b.add(new THREE.CylinderGeometry(.335,.335,.215,40,1),rubber,new THREE.Matrix4().makeRotationZ(Math.PI/2));
  b.add(new THREE.CylinderGeometry(.244,.244,.22,36,1),brake,new THREE.Matrix4().makeRotationZ(Math.PI/2));
  for(const side of [-1,1]){
    b.add(new THREE.TorusGeometry(.25,.022,8,36),rim,new THREE.Matrix4().compose(new THREE.Vector3(side*.117,0,0),new THREE.Quaternion().setFromAxisAngle(up,Math.PI/2),new THREE.Vector3(1,1,1)));
    b.add(new THREE.CylinderGeometry(.075,.075,.225,20),rim,new THREE.Matrix4().makeRotationZ(Math.PI/2));
    for(let i=0;i<7;i++){const a=i/7*Math.PI*2;const matrix=new THREE.Matrix4().compose(new THREE.Vector3(side*.12,Math.cos(a)*.15,Math.sin(a)*.15),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),a),new THREE.Vector3(1,1,1));b.add(new THREE.BoxGeometry(.025,.22,.035),rim,matrix);}
  }
  return b.finish();
}
export function createVehicleLibrary(){
  const material={paint:matte(0xffffff,.9),trim:matte(0x252d31),rubber:matte(0x182125,.98),glass:matte(0x334653,.67),rim:matte(0x788083,.77),seam:matte(0x343b3c),red:matte(0xb84231,.8),light:matte(0xb9c7cc,.8),amber:matte(0xb9904e),brake:matte(0x4e575b)};
  material.red.emissive.setHex(0xff2a12);material.red.emissiveIntensity=.12;material.light.emissive.setHex(0xfff1d6);material.light.emissiveIntensity=0;
  const wheel=wheelGeometry(material.rubber,material.rim,material.brake);
  const models=[];
  for(let style=0;style<3;style++){
    const b=new GeometryBatch(),length=style===1?4.65:style===2?4.05:4.45,front=-length/2,rear=length/2;
    b.add(loft([[front,.69,.34,.75],[front+.22,.86,.29,.87],[-1.35,.92,.3,.91],[-.7,.94,.3,1.0],[.85,.94,.3,1.01],[rear-.3,.88,.32,.94],[rear,.78,.39,.85]],72,36,true),material.paint);
    const cabinRear=style===1?1.62:style===2?1.35:1.24;
    b.add(loft([[-1.12,.66,.94,.95],[-.85,.72,.94,1.13],[-.43,.68,.94,1.5],[cabinRear-.65,.68,.94,1.51],[cabinRear-.12,.74,.94,1.22],[cabinRear,.77,.94,1.0]],56,28),material.glass);
    b.add(loft([[-.47,.57,1.477,1.495],[-.32,.65,1.477,1.535],[cabinRear-.80,.65,1.477,1.54],[cabinRear-.64,.57,1.477,1.495]],24,28),material.paint);
    // Door pillars, window surrounds, seams, handles, roof rails, mirrors.
    for(const side of [-1,1]){
      b.box(side*.719,1.25,.30,.045,.52,.09,material.trim);
      b.box(side*.84,.99,.28,.055,.035,2.35,material.trim);
      b.box(side*.945,.64,.2,.008,.54,.014,material.seam);
      b.box(side*.944,.9,-.38,.02,.025,.19,material.trim);b.box(side*.944,.9,.76,.02,.025,.19,material.trim);
      b.box(side*1.02,1.08,-.70,.19,.12,.29,material.paint);b.box(side*1.12,1.08,-.68,.015,.075,.17,material.glass);
      b.box(side*.91,.30,.1,.065,.08,3.34,material.trim);
      for(const axle of [-1.38,1.38])b.add(new THREE.TorusGeometry(.373,.018,8,40,Math.PI),material.trim,new THREE.Matrix4().compose(new THREE.Vector3(side*.94,.345,axle),new THREE.Quaternion().setFromAxisAngle(up,Math.PI/2),new THREE.Vector3(1,1,1)));
      if(style===1)b.box(side*.59,1.56,.31,.035,.04,1.7,material.trim);
      // Squared lamps and modest bodywork make the silhouette distinct.
      b.box(side*.62,.76,rear+.015,.38,.15,.04,material.red);b.box(side*.62,.73,front-.012,.38,.14,.04,material.light);
      b.box(side*.85,.65,front+.08,.045,.08,.16,material.amber);
      b.box(side*.62,.40,rear+.035,.23,.045,.05,material.red);
    }
    b.box(0,.48,front-.02,1.5,.19,.045,material.trim);b.box(0,.47,rear+.025,1.56,.14,.055,material.trim);
    for(let y=.44;y<.58;y+=.035)b.box(0,y,front-.05,1.18,.011,.012,material.rim);
    b.box(0,.53,rear+.062,.44,.14,.02,material.light);
    for(let i=0;i<5;i++){const t=(i+1)/6;b.box(0,1.45-t*.30,cabinRear-.58+t*.35,1.18,.006,.016,material.seam);}
    b.box(-.63,.31,rear+.03,.14,.08,.10,material.trim);b.box(0,.94,rear-.15,1.64,.04,.12,material.paint);
    const body=b.finish();body.userData.name=style===0?'ATLAS S4':style===1?'ATLAS TOURING':'METRO C2';
    models.push({body,wheelPositions:[[-.91,.345,-1.38],[.91,.345,-1.38],[-.91,.345,1.38],[.91,.345,1.38]],wheel});
  }
  const heroMaterials={red:material.red.clone(),light:material.light.clone()};heroMaterials.light.emissive.setHex(0xfff3dc);heroMaterials.light.emissiveIntensity=0;
  const hero=new THREE.Group(),heroBody=models[0].body.clone();heroBody.traverse(o=>{if(!o.isMesh)return;if(o.material===material.paint){o.material=material.paint.clone();o.material.color.setHex(CAR_COLORS[0]);}else if(o.material===material.red)o.material=heroMaterials.red;else if(o.material===material.light)o.material=heroMaterials.light;});hero.add(heroBody);
  const heroWheels=[];for(const p of models[0].wheelPositions){const w=wheel.clone();w.position.set(...p);hero.add(w);heroWheels.push(w);}
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(.43,.11),new THREE.MeshBasicMaterial({map:plateTexture()}));plate.position.set(0,.53,2.31);hero.add(plate);
  // Traffic is submitted in a handful of instanced draws instead of repeating
  // thousands of individual high-detail meshes.
  const trafficParts=[];
  for(let style=0;style<models.length;style++){
    const full=new GeometryBatch(),model=models[style];
    model.body.traverse(o=>{if(o.isMesh)full.add(o.geometry.clone(),o.material);});
    for(const p of model.wheelPositions)wheel.traverse(o=>{if(o.isMesh)full.add(o.geometry.clone(),o.material,new THREE.Matrix4().makeTranslation(...p));});
    const merged=full.finish();for(const mesh of merged.children)trafficParts.push({geometry:mesh.geometry,material:mesh.material,style,paint:mesh.material===material.paint});
  }
  return {hero,heroWheels,heroMaterials,trafficParts,materials:material,name:'ATLAS S4',triangleCount:trafficParts.filter(p=>p.style===0).reduce((n,p)=>n+p.geometry.getAttribute('position').count/3,0)};
}
