import * as THREE from 'three';
import {LANES,signalPhase} from './simulation.js';
import {interpolateVehicle,dampFactor,lerp} from './motion.js';
import {createVehicleLibrary,CAR_COLORS} from './vehicles.js';
import {CityStreamer,createCityMaterials} from './city.js';

const UP=new THREE.Vector3(0,1,0);
function contactTexture(){const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d'),g=x.createRadialGradient(48,48,2,48,48,48);g.addColorStop(0,'#00000080');g.addColorStop(.6,'#00000044');g.addColorStop(1,'#00000000');x.fillStyle=g;x.fillRect(0,0,96,96);return new THREE.CanvasTexture(c);}
function skyTexture(){const c=document.createElement('canvas');c.width=4;c.height=512;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,'#829eaf');g.addColorStop(.48,'#b5c6cb');g.addColorStop(.82,'#d4d2bc');g.addColorStop(1,'#c3c4b3');x.fillStyle=g;x.fillRect(0,0,4,512);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
export class World {
  constructor(container,sim){
    this.container=container;this.sim=sim;this.scene=new THREE.Scene();this.origin={x:0,z:0};this.cameraMode=0;this.loaded=false;this.signals=new Map();this.crossCars=[];this.age=0;this.qualityScale=1;this.slowFrames=0;
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    const gl=this.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');this.gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate=false;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;this.renderer.outputColorSpace=THREE.SRGBColorSpace;container.append(this.renderer.domElement);
    this.scene.background=new THREE.Color(0xb4c5ca);this.scene.fog=new THREE.Fog(0xb8c8cb,200,650);
    this.camera=new THREE.PerspectiveCamera(54,9/16,.3,780);this.scene.add(new THREE.HemisphereLight(0xd9e3e5,0x737567,2.0));
    this.sun=new THREE.DirectionalLight(0xffeed4,2.0);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1536,1536);Object.assign(this.sun.shadow.camera,{left:-75,right:75,top:75,bottom:-75,near:1,far:240});this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.12;this.sun.shadow.radius=2;this.scene.add(this.sun,this.sun.target);
    const sky=new THREE.Mesh(new THREE.SphereGeometry(720,32,24),new THREE.MeshBasicMaterial({map:skyTexture(),side:THREE.BackSide,depthWrite:false,fog:false}));this.scene.add(sky);this.sky=sky;
    this.materials=createCityMaterials();this.city=new CityStreamer(this.scene,this.materials);
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),new THREE.MeshStandardMaterial({color:0x7c8a78,roughness:1}));this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-2.0;this.scene.add(this.ground);
    this.vehicles=createVehicleLibrary();this.player=this.vehicles.hero;this.scene.add(this.player);this.loaded=true;this.vehicle=this.player;
    this.shadowMaterial=new THREE.MeshBasicMaterial({map:contactTexture(),transparent:true,depthWrite:false,opacity:.7,polygonOffset:true,polygonOffsetFactor:-2});
    this.shadowGeometry=new THREE.PlaneGeometry(3.3,5.8);this.shadowGeometry.rotateX(-Math.PI/2);this.heroShadow=new THREE.Mesh(this.shadowGeometry,this.shadowMaterial);this.scene.add(this.heroShadow);
    this.trafficBatches=this.vehicles.trafficParts.map(part=>{const mesh=new THREE.InstancedMesh(part.geometry,part.material,64);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;this.scene.add(mesh);return {mesh,style:part.style,paint:part.paint};});
    this.trafficShadows=new THREE.InstancedMesh(this.shadowGeometry,this.shadowMaterial,64);this.trafficShadows.frustumCulled=false;this.trafficShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.trafficShadows);
    this.matrix=new THREE.Matrix4();this.quaternion=new THREE.Quaternion();this.scale=new THREE.Vector3(1,1,1);this.temp=new THREE.Vector3();this.color=new THREE.Color();this.lookMatrix=new THREE.Matrix4();this.lookQuaternion=new THREE.Quaternion();
    const p=sim.position;this.city.update(p.x,p.z);this.origin={...this.city.origin};
    this.camera.position.set(p.x-this.origin.x-p.dx*11.8,5.8,p.z-this.origin.z-p.dz*11.8);this.lookTarget=new THREE.Vector3(p.x-this.origin.x+p.dx*12,1.05,p.z-this.origin.z+p.dz*12);this.camera.lookAt(this.lookTarget);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;});this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.renderer.shadowMap.needsUpdate=true;});
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  pose(s,offset){return this.sim.route.sample(s,offset);}
  updateSignals(time,s){
    const wanted=new Set();this.crossCars.length=0;
    for(const j of this.sim.route.junctions){if(j.kind==='highway'||Math.abs(j.s-s)>330)continue;wanted.add(j.id);let g=this.signals.get(j.id);
      if(!g){
        g=new THREE.Group();const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,7.6,10),this.materials.metal);pole.position.set(13,3.8,38);g.add(pole);
        const arm=new THREE.Mesh(new THREE.BoxGeometry(8,.10,.10),this.materials.metal);arm.position.set(9,7.5,38);g.add(arm);
        const box=new THREE.Mesh(new THREE.BoxGeometry(.6,1.65,.4),this.materials.metal);box.position.set(5.8,7,38);g.add(box);g.userData.lights=[];
        for(let i=0;i<3;i++){const m=new THREE.MeshBasicMaterial({color:0x26302a});const l=new THREE.Mesh(new THREE.CircleGeometry(.16,16),m);l.position.set(5.8,7.5-i*.5,38.21);g.add(l);g.userData.lights.push(l);}this.scene.add(g);this.signals.set(j.id,g);
      }
      g.position.set(j.x-this.origin.x,0,j.z-this.origin.z);g.rotation.y=[0,-Math.PI/2,Math.PI,Math.PI/2][j.dir];const on={red:0,amber:1,green:2}[signalPhase(time,j.id)];g.userData.lights.forEach((l,i)=>l.material.color.setHex(i===on?[0xd95c45,0xe2bd60,0x84b691][i]:0x26302a));
      const phase=((time+j.id*3.7)%30+30)%30;
      for(let i=0;i<2;i++){const t=phase-21-i*2.5;if(t<=0||t>=5.8)continue;const angle=[0,-Math.PI/2,Math.PI,Math.PI/2][j.dir],delta=-45+t*16;this.crossCars.push({x:j.x+Math.cos(angle)*delta+Math.sin(angle)*-6,z:j.z-Math.sin(angle)*delta+Math.cos(angle)*-6,heading:angle-Math.PI/2,style:i,color:i+2});}
    }
    for(const [id,g]of this.signals)if(!wanted.has(id)){this.scene.remove(g);g.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(g.userData.lights.includes(o))o.material.dispose();}});this.signals.delete(id);}
  }
  updateTraffic(alpha,s){
    const rendered=[];
    for(const c of this.sim.cars){if(Math.abs(c.s-s)>370)continue;const cs=lerp(c.prevS??c.s,c.s,alpha),p=this.pose(cs,LANES[c.lane]*(c.opposite?-1:1));rendered.push({...p,heading:p.heading+(c.opposite?Math.PI:0),style:c.style%3,color:c.color});}
    rendered.push(...this.crossCars);
    for(const batch of this.trafficBatches){let index=0;for(const c of rendered){if(c.style!==batch.style)continue;this.temp.set(c.x-this.origin.x,.015,c.z-this.origin.z);this.quaternion.setFromAxisAngle(UP,c.heading);this.matrix.compose(this.temp,this.quaternion,this.scale);batch.mesh.setMatrixAt(index,this.matrix);if(batch.paint)batch.mesh.setColorAt(index,this.color.setHex(CAR_COLORS[c.color%CAR_COLORS.length]));index++;}batch.mesh.count=index;if(index){batch.mesh.instanceMatrix.needsUpdate=true;if(batch.mesh.instanceColor)batch.mesh.instanceColor.needsUpdate=true;}}
    let i=0;for(const c of rendered){this.temp.set(c.x-this.origin.x,.038,c.z-this.origin.z);this.quaternion.setFromAxisAngle(UP,c.heading);this.matrix.compose(this.temp,this.quaternion,this.scale);this.trafficShadows.setMatrixAt(i++,this.matrix);}this.trafficShadows.count=i;this.trafficShadows.instanceMatrix.needsUpdate=true;
  }
  update(dt,alpha=1){
    if(this.contextLost)return;
    this.age+=dt;const render=interpolateVehicle(this.sim,alpha),p=this.pose(render.s,render.offset),old={...this.origin};
    const changed=this.city.update(p.x,p.z);this.origin=this.city.origin;
    if(changed){const dx=old.x-this.origin.x,dz=old.z-this.origin.z;this.camera.position.x+=dx;this.camera.position.z+=dz;this.lookTarget.x+=dx;this.lookTarget.z+=dz;}
    const x=p.x-this.origin.x,z=p.z-this.origin.z;
    this.player.position.set(x,.02,z);
    const lateral=(this.sim.offset-this.sim.prevOffset)*60,angle=p.heading-Math.atan2(lateral,Math.max(5,this.sim.speed));
    this.player.rotation.set(0,angle,0);this.vehicles.heroWheels.forEach(w=>w.rotation.x=-render.s/.335);
    this.heroShadow.position.set(x,.035,z);this.heroShadow.rotation.y=angle;
    this.updateSignals(this.sim.time-(1-alpha)/60,render.s);this.updateTraffic(alpha,render.s);
    const back=this.cameraMode?17.5:11.8,height=this.cameraMode?9:5.8;
    this.temp.set(x-p.dx*back,height,z-p.dz*back);this.camera.position.lerp(this.temp,dampFactor(9,dt));
    const look=this.pose(render.s+12,render.offset);this.temp.set(look.x-this.origin.x,1.0,look.z-this.origin.z);this.lookTarget.lerp(this.temp,dampFactor(10,dt));
    this.lookMatrix.lookAt(this.camera.position,this.lookTarget,UP);this.lookQuaternion.setFromRotationMatrix(this.lookMatrix);this.camera.quaternion.slerp(this.lookQuaternion,dampFactor(16,dt));
    this.sky.position.set(x,0,z);this.ground.position.x=x;this.ground.position.z=z;
    const texel=150/1536,anchorX=Math.round(p.x/texel)*texel-this.origin.x,anchorZ=Math.round(p.z/texel)*texel-this.origin.z;
    this.sun.position.set(anchorX-70,115,anchorZ-55);this.sun.target.position.set(anchorX,0,anchorZ);this.sun.target.updateMatrixWorld();
    if(changed||this.city.completed!==this.shadowCityCount||this.age-this.lastShadow>.10||this.lastShadow===undefined){this.renderer.shadowMap.needsUpdate=true;this.lastShadow=this.age;this.shadowCityCount=this.city.completed;}
    const beforeRender=performance.now();this.renderer.render(this.scene,this.camera);this.renderCpuMs=performance.now()-beforeRender;const beforeStream=performance.now();this.city.pump();this.streamCpuMs=performance.now()-beforeStream;
    if(dt>.024)this.slowFrames++;else this.slowFrames=Math.max(0,this.slowFrames-1);
    if(this.slowFrames>75&&this.qualityScale>.7){this.qualityScale-=.1;this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.35)*this.qualityScale);this.resize();this.slowFrames=0;}
  }
  stats(){return {drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,chunks:this.city.chunks.size,geometries:this.renderer.info.memory.geometries,vehicleLoaded:true,vehicle:'Atlas S4 — original matte touring car',assetError:null,renderScale:+this.qualityScale.toFixed(1),streamingWorker:!!this.city.worker,renderCpuMs:+(this.renderCpuMs||0).toFixed(2),streamCpuMs:+(this.streamCpuMs||0).toFixed(2),gpu:this.gpu};}
}
