import * as THREE from 'three';
import {LANES,signalPhase} from './simulation.js';
import {interpolateVehicle,dampFactor,lerp} from './motion.js';
import {createVehicleLibrary,CAR_COLORS} from './vehicles.js';
import {CityStreamer,createCityMaterials,glowTexture} from './city.js';
import {createSupercar} from './supercar.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {Simulation} from './simulation.js';
import {warpPoint,warpPose,warpHeading} from './warp.js';
import {installWarp,setWarpOrigin,markNoWarp} from './warp-shader.js';

const UP=new THREE.Vector3(0,1,0);
function contactTexture(){const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d'),g=x.createRadialGradient(48,48,2,48,48,48);g.addColorStop(0,'#00000080');g.addColorStop(.6,'#00000044');g.addColorStop(1,'#00000000');x.fillStyle=g;x.fillRect(0,0,96,96);return new THREE.CanvasTexture(c);}
function skyTexture(){const c=document.createElement('canvas');c.width=4;c.height=512;const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.userData={canvas:c};return t;}
function paintSky(texture,zenith,horizon,ground){const c=texture.userData.canvas,x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,zenith);g.addColorStop(.30,zenith);g.addColorStop(.49,horizon);g.addColorStop(.53,horizon);g.addColorStop(1,ground);x.fillStyle=g;x.fillRect(0,0,4,512);texture.needsUpdate=true;}
function discTexture(core,halo){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,core);g.addColorStop(.16,core);g.addColorStop(.22,halo);g.addColorStop(1,'#00000000');x.fillStyle=g;x.fillRect(0,0,256,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function starField(){const n=1600,pos=new Float32Array(n*3),r=(()=>{let s=99;return()=>(s=(s*16807)%2147483647)/2147483647;})();for(let i=0;i<n;i++){const a=r()*Math.PI*2,y=.08+r()*.92,h=Math.sqrt(1-y*y);pos[i*3]=Math.cos(a)*h*700;pos[i*3+1]=y*700;pos[i*3+2]=Math.sin(a)*h*700;}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));return new THREE.Points(g,new THREE.PointsMaterial({color:0xdfe8ff,size:1.6,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false,fog:false}));}
export class World {
  constructor(container,sim){
    this.container=container;this.sim=sim;this.scene=new THREE.Scene();this.origin={x:0,z:0};this.cameraMode=0;this.loaded=false;this.signals=new Map();this.crossCars=[];this.age=0;this.qualityScale=1;this.slowFrames=0;
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    const gl=this.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');this.gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate=false;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;this.renderer.outputColorSpace=THREE.SRGBColorSpace;container.append(this.renderer.domElement);
    this.scene.background=new THREE.Color(0xb4c5ca);this.scene.fog=new THREE.Fog(0xb8c8cb,200,650);
    this.camera=new THREE.PerspectiveCamera(54,9/16,.3,780);
    // Isometric view: true orthographic camera at 35.26° elevation, 45° to the road, turning in 90° steps.
    // Auto director state and the dip-to-black used for every camera cut.
    this.cameraSetting='auto';this.shotTime=0;this.cut=null;this.snap=true;this.fade=document.createElement('div');this.fade.className='camera-fade';container.append(this.fade);
    this.isoCamera=new THREE.OrthographicCamera(-10,10,10,-10,1,1500);this.isoView=66;this.isoAzimuth=null;this.isoLead=new THREE.Vector3();this.isoDistance=340;this.hemi=new THREE.HemisphereLight(0xd9e3e5,0x737567,2.0);this.scene.add(this.hemi);this.fov=54;
    this.sun=new THREE.DirectionalLight(0xffeed4,2.0);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1536,1536);Object.assign(this.sun.shadow.camera,{left:-75,right:75,top:75,bottom:-75,near:1,far:240});this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.12;this.sun.shadow.radius=2;this.scene.add(this.sun,this.sun.target);
    this.skyMap=skyTexture();const sky=new THREE.Mesh(new THREE.SphereGeometry(720,32,24),new THREE.MeshBasicMaterial({map:this.skyMap,side:THREE.BackSide,depthWrite:false,fog:false}));this.scene.add(sky);this.sky=sky;
    // Celestial layer follows the car; it is drawn before the city and never fogged.
    this.celestial=new THREE.Group();this.stars=starField();this.celestial.add(this.stars);
    this.sunDisc=new THREE.Sprite(new THREE.SpriteMaterial({map:discTexture('#fffaf0','#ffd9a055'),transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));this.sunDisc.scale.set(150,150,1);
    this.moonDisc=new THREE.Sprite(new THREE.SpriteMaterial({map:discTexture('#f4f1e6','#9fb4e033'),transparent:true,depthWrite:false,fog:false}));this.moonDisc.scale.set(70,70,1);
    this.celestial.add(this.sunDisc,this.moonDisc);this.scene.add(this.celestial);this.skyKey='';
    this.materials=createCityMaterials();this.city=new CityStreamer(this.scene,this.materials);
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),new THREE.MeshStandardMaterial({color:0x7c8a78,roughness:1}));this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-2.0;this.scene.add(this.ground);
    this.vehicles=createVehicleLibrary();this.player=new THREE.Group();this.scene.add(this.player);this.loaded=true;this.vehicle=this.player;
    // Only the autodrive car changes: VELOCE R supercar (default) or the original Atlas S4.
    const pmrem=new THREE.PMREMGenerator(this.renderer);this.envMap=pmrem.fromScene(new RoomEnvironment(),.04).texture;pmrem.dispose();
    // From here on every material bends through the curved-city warp (see warp.js).
    installWarp();
    const supercar=createSupercar(this.vehicles.heroMaterials);for(const mat of supercar.reflective)mat.envMap=this.envMap;
    this.heroes={veloce:supercar,atlas:{group:this.vehicles.hero,wheels:this.vehicles.heroWheels,radius:.335,headlight:{y:.75,z:-2.2,spread:.62},name:'ATLAS S4',reflective:[]}};
    for(const h of Object.values(this.heroes)){h.group.visible=false;this.player.add(h.group);}
    // Amber indicators: front corner, mirror repeater and rear lamp on each side.
    this.blinkOn=new THREE.MeshBasicMaterial({color:0xff9a14,toneMapped:false,fog:false});this.blinkOff=new THREE.MeshStandardMaterial({color:0x4a3416,roughness:.35,metalness:0,emissive:0x2a1400});
    this.blinkGlow=new THREE.SpriteMaterial({map:glowTexture('#ffb347ff','#ff8a1a55'),color:0xffa63a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const lampSpots={veloce:{front:[.86,.53,-2.0],rear:[.82,.6,2.33],mirror:[1.06,.86,-.66]},atlas:{front:[.86,.70,-2.24],rear:[.84,.77,2.25],mirror:[1.13,1.08,-.68]}};
    for(const [id,h] of Object.entries(this.heroes)){h.blinkers={'-1':[],'1':[]};const spot=lampSpots[id];
      for(const side of [-1,1]){
        for(const [key,size] of [['front',[.2,.09,.1]],['rear',[.3,.12,.08]],['mirror',[.05,.05,.16]]]){const [x,y,z]=spot[key];const m=new THREE.Mesh(new THREE.BoxGeometry(...size),this.blinkOff);m.position.set(side*x,y,z);h.group.add(m);h.blinkers[side].push(m);}
        for(const key of ['front','rear']){const [x,y,z]=spot[key];const g=new THREE.Sprite(this.blinkGlow);const k=key==='rear'?1.7:1.25;g.scale.set(k,k,1);g.position.set(side*(x+.05),y,z+(key==='rear'?.2:-.12));g.visible=false;h.group.add(g);h.blinkers[side].push(g);}
      }}
    this.trafficBlinkers=new THREE.InstancedMesh(new THREE.BoxGeometry(.26,.13,.12),this.blinkOn,256);this.trafficBlinkers.count=0;this.trafficBlinkers.frustumCulled=false;this.trafficBlinkers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.trafficBlinkers);
    this.trafficBlinkGlow=new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1,1.1),new THREE.MeshBasicMaterial({map:glowTexture('#ffb347ff','#ff8a1a44'),color:0xffa63a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}),128);this.trafficBlinkGlow.count=0;this.trafficBlinkGlow.frustumCulled=false;this.trafficBlinkGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.trafficBlinkGlow);
    // Hero headlights are real spotlights (no shadow cost) plus a soft road pool.
    this.fill=new THREE.PointLight(0xc9d6ff,0,16,1.6);this.fill.position.set(0,4.2,5.5);this.player.add(this.fill);
    this.headlights=[];for(const side of [-1,1]){const l=new THREE.SpotLight(0xfff1dc,0,140,.48,.75,1.35);l.userData.side=side;this.player.add(l,l.target);this.headlights.push(l);}
    this.setHeroCar('veloce');
    this.poolMaterial=new THREE.MeshBasicMaterial({map:glowTexture('#fff3dcff','#ffe8c033'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});this.poolMaterial.visible=false;
    this.poolGeometry=new THREE.PlaneGeometry(5.6,16);this.poolGeometry.rotateX(-Math.PI/2);this.lightPools=new THREE.InstancedMesh(this.poolGeometry,this.poolMaterial,80);this.lightPools.frustumCulled=false;this.lightPools.count=0;this.lightPools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.lightPools);
    this.signalGlow=new THREE.SpriteMaterial({map:glowTexture('#ffffffff','#ffffff40'),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    this.lighting=null;
    this.shadowMaterial=new THREE.MeshBasicMaterial({map:contactTexture(),transparent:true,depthWrite:false,opacity:.7,polygonOffset:true,polygonOffsetFactor:-2});
    this.shadowGeometry=new THREE.PlaneGeometry(3.3,5.8);this.shadowGeometry.rotateX(-Math.PI/2);this.heroShadow=new THREE.Mesh(this.shadowGeometry,this.shadowMaterial);this.scene.add(this.heroShadow);
    this.trafficBatches=this.vehicles.trafficParts.map(part=>{const mesh=new THREE.InstancedMesh(part.geometry,part.material,64);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;this.scene.add(mesh);return {mesh,style:part.style,paint:part.paint};});
    this.trafficShadows=new THREE.InstancedMesh(this.shadowGeometry,this.shadowMaterial,64);this.trafficShadows.frustumCulled=false;this.trafficShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.trafficShadows);
    // These are placed by JS with an already-warped pose; the shader must not bend them again.
    for(const o of [this.sky,this.celestial,this.ground,this.player,this.heroShadow,this.trafficShadows,this.lightPools,this.trafficBlinkers,this.trafficBlinkGlow,...this.trafficBatches.map(b=>b.mesh)])markNoWarp(o);
    this.matrix=new THREE.Matrix4();this.quaternion=new THREE.Quaternion();this.scale=new THREE.Vector3(1,1,1);this.temp=new THREE.Vector3();this.color=new THREE.Color();this.lookMatrix=new THREE.Matrix4();this.lookQuaternion=new THREE.Quaternion();
    const p0=sim.position;this.city.update(p0.x,p0.z);this.origin={...this.city.origin};setWarpOrigin(this.origin.x,this.origin.z);const p=warpPose(p0.x,p0.z,p0.heading);
    this.camera.position.set(p.x-this.origin.x-p.dx*11.8,5.8,p.z-this.origin.z-p.dz*11.8);this.lookTarget=new THREE.Vector3(p.x-this.origin.x+p.dx*12,1.05,p.z-this.origin.z+p.dz*12);this.camera.lookAt(this.lookTarget);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;});this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.renderer.shadowMap.needsUpdate=true;});
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.isoAspect=w/h;}
  // Camera setting: 'auto' lets the director alternate chase and isometric; others are fixed.
  setCameraSetting(setting){
    const fixed={chase:0,high:1,iso:2}[setting];if(setting===this.cameraSetting)return;this.cameraSetting=setting;this.shotTime=0;
    if(setting==='auto'){if(this.cameraMode===1)this.cutTo(0);}else if(fixed!==undefined&&fixed!==this.cameraMode)this.cutTo(fixed);
  }
  cutTo(mode){if(this.cut)return;this.cut={to:mode,t:0,done:false};this.fade.classList.add('on');}
  get directorShot(){return this.cameraMode===2?'ISO':this.cameraMode===1?'HIGH':'CHASE';}
  updateDirector(dt){
    if(this.cut){this.cut.t+=dt;
      if(!this.cut.done&&this.cut.t>=.26){this.cut.done=true;this.cameraMode=this.cut.to;this.snap=true;this.isoAzimuth=null;this.isoLead.set(0,0,0);this.shotTime=0;}
      if(this.cut.t>=.32){this.fade.classList.remove('on');this.cut=null;}
      return;}
    if(this.cameraSetting!=='auto')return;
    this.shotTime+=dt;
    // Turns read best from above; long straights and top speed read best from behind.
    const s=this.sim.s,turnAhead=this.sim.route.junctions.some(j=>j.turn!=='straight'&&j.s-s>25&&j.s-s<Math.max(160,this.sim.speed*5));
    const turning=this.sim.route.junctions.some(j=>j.turn!=='straight'&&s-j.s>-25&&s-j.s<45);
    if(this.cameraMode!==2){if(this.shotTime>16||(turnAhead&&this.shotTime>6))this.cutTo(2);}
    else if(!turnAhead&&!turning&&this.shotTime>11||this.shotTime>24)this.cutTo(0);
  }
  get activeCamera(){return this.cameraMode===2?this.isoCamera:this.camera;}
  updateIso(dt,x,z,p,w){
    // Classic isometric: the view never follows small curves, only the road's compass direction.
    // Camera sits over the oncoming lanes (left), where buildings are farther away and rarely hide the car.
    const quarter=Math.PI/2,card=Math.round(p.heading/quarter)*quarter,target=card-Math.PI/4;
    if(this.isoAzimuth===null)this.isoAzimuth=target;else{const d=Math.atan2(Math.sin(target-this.isoAzimuth),Math.cos(target-this.isoAzimuth));this.isoAzimuth+=d*dampFactor(2.4,dt);}
    const kmh=this.sim.speed*3.6;this.isoView=lerp(this.isoView,62+Math.min(1,kmh/260)*44,dampFactor(1.4,dt));
    // Look ahead so the car sits in the lower-middle and the road ahead stays in frame.
    const away=this.isoView*.11,ahead=this.isoView*.05;this.temp.set(-Math.sin(this.isoAzimuth)*away+w.dx*ahead,0,-Math.cos(this.isoAzimuth)*away+w.dz*ahead);this.isoLead.lerp(this.temp,dampFactor(3,dt));
    const el=Math.atan(1/Math.SQRT2),a=this.isoAzimuth,d=this.isoDistance,tx=x+this.isoLead.x,tz=z+this.isoLead.z;
    this.isoCamera.position.set(tx+Math.sin(a)*Math.cos(el)*d,Math.sin(el)*d,tz+Math.cos(a)*Math.cos(el)*d);this.isoCamera.lookAt(tx,0,tz);
    const half=this.isoView/2,aspect=this.isoAspect||9/16;Object.assign(this.isoCamera,{top:half,bottom:-half,left:-half*aspect,right:half*aspect});this.isoCamera.updateProjectionMatrix();
  }
  pose(s,offset){return this.sim.route.sample(s,offset);}
  updateSignals(time,s){
    const wanted=new Set();this.crossCars.length=0;
    for(const j of this.sim.route.junctions){if(j.kind==='highway'||Math.abs(j.s-s)>330)continue;wanted.add(j.id);let g=this.signals.get(j.id);
      if(!g){
        g=new THREE.Group();const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,7.6,10),this.materials.metal);pole.position.set(13,3.8,38);g.add(pole);
        const arm=new THREE.Mesh(new THREE.BoxGeometry(8,.10,.10),this.materials.metal);arm.position.set(9,7.5,38);g.add(arm);
        const box=new THREE.Mesh(new THREE.BoxGeometry(.6,1.65,.4),this.materials.metal);box.position.set(5.8,7,38);g.add(box);g.userData.lights=[];
        for(let i=0;i<3;i++){const m=new THREE.MeshBasicMaterial({color:0x26302a});const l=new THREE.Mesh(new THREE.CircleGeometry(.16,16),m);l.position.set(5.8,7.5-i*.5,38.21);g.add(l);g.userData.lights.push(l);}const glow=new THREE.Sprite(this.signalGlow.clone());glow.scale.set(2.2,2.2,1);g.add(glow);g.userData.glow=glow;g.traverse(o=>o.frustumCulled=false);this.scene.add(g);this.signals.set(j.id,g);
      }
      g.position.set(j.x-this.origin.x,0,j.z-this.origin.z);g.rotation.y=[0,-Math.PI/2,Math.PI,Math.PI/2][j.dir];const on={red:0,amber:1,green:2}[signalPhase(time,j.id)];g.userData.lights.forEach((l,i)=>l.material.color.setHex(i===on?[0xff5a3c,0xffc457,0x7dffa8][i]:0x26302a));const glow=g.userData.glow;glow.position.set(5.8,7.5-on*.5,38.4);glow.material.color.setHex([0xff4a2a,0xffb13a,0x4dff9a][on]);glow.material.opacity=.25+.75*(this.lighting?.night??0);
      const phase=((time+j.id*3.7)%30+30)%30;
      for(let i=0;i<2;i++){const t=phase-21-i*2.5;if(t<=0||t>=5.8)continue;const angle=[0,-Math.PI/2,Math.PI,Math.PI/2][j.dir],delta=-45+t*16;this.crossCars.push({x:j.x+Math.cos(angle)*delta+Math.sin(angle)*-6,z:j.z-Math.sin(angle)*delta+Math.cos(angle)*-6,heading:angle-Math.PI/2,style:i,color:i+2});}
    }
    for(const [id,g]of this.signals)if(!wanted.has(id)){this.scene.remove(g);g.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(g.userData.lights.includes(o))o.material.dispose();}if(o.isSprite)o.material.dispose();});this.signals.delete(id);}
  }
  updateTraffic(alpha,s){
    const rendered=[];
    for(const c of this.sim.cars){if(Math.abs(c.s-s)>370)continue;const cs=lerp(c.prevS??c.s,c.s,alpha),off=lerp(c.prevOffset??c.offset,c.offset,alpha),p=this.pose(cs,off*(c.opposite?-1:1)),yaw=c.opposite?0:Math.atan2((c.offset-c.prevOffset)*60,Math.max(5,c.speed));rendered.push({...p,heading:p.heading+(c.opposite?Math.PI:0)-yaw,style:c.style%3,color:c.color,indicator:c.opposite?0:Simulation.carIndicator(c)});}
    rendered.push(...this.crossCars);
    // Curved city: every car is drawn at its warped position, rotated with the road.
    for(const c of rendered){const w=warpPose(c.x,c.z,c.heading);c.x=w.x;c.z=w.z;c.heading=w.heading;}
    const blink=this.blinkPhase(),half=[2.225,2.325,2.025];let b=0,g=0;
    if(blink)for(const c of rendered){if(!c.indicator||b>252)continue;const sin=Math.sin(c.heading),cos=Math.cos(c.heading),side=c.indicator*.84,len=half[c.style]??2.2;
      for(const end of [-1,1]){const lz=end*(len+.02),lx=side;this.temp.set(c.x-this.origin.x+cos*lx+sin*lz,.74,c.z-this.origin.z-sin*lx+cos*lz);this.quaternion.setFromAxisAngle(UP,c.heading);this.matrix.compose(this.temp,this.quaternion,this.scale);this.trafficBlinkers.setMatrixAt(b++,this.matrix);
        if(g<126){this.temp.x+=sin*end*.3;this.temp.z+=cos*end*.3;this.quaternion.copy(this.activeCamera.quaternion);this.matrix.compose(this.temp,this.quaternion,this.scale);this.trafficBlinkGlow.setMatrixAt(g++,this.matrix);}}}
    this.trafficBlinkers.count=b;this.trafficBlinkers.instanceMatrix.needsUpdate=true;this.trafficBlinkGlow.count=g;this.trafficBlinkGlow.instanceMatrix.needsUpdate=true;
    for(const batch of this.trafficBatches){let index=0;for(const c of rendered){if(c.style!==batch.style)continue;this.temp.set(c.x-this.origin.x,.015,c.z-this.origin.z);this.quaternion.setFromAxisAngle(UP,c.heading);this.matrix.compose(this.temp,this.quaternion,this.scale);batch.mesh.setMatrixAt(index,this.matrix);if(batch.paint)batch.mesh.setColorAt(index,this.color.setHex(CAR_COLORS[c.color%CAR_COLORS.length]));index++;}batch.mesh.count=index;if(index){batch.mesh.instanceMatrix.needsUpdate=true;if(batch.mesh.instanceColor)batch.mesh.instanceColor.needsUpdate=true;}}
    let i=0;for(const c of rendered){this.temp.set(c.x-this.origin.x,.038,c.z-this.origin.z);this.quaternion.setFromAxisAngle(UP,c.heading);this.matrix.compose(this.temp,this.quaternion,this.scale);this.trafficShadows.setMatrixAt(i++,this.matrix);}this.trafficShadows.count=i;this.trafficShadows.instanceMatrix.needsUpdate=true;
    if(this.poolMaterial.visible){let k=0;const add=(x,z,heading)=>{if(k>=80)return;this.temp.set(x-this.origin.x-Math.sin(heading)*10.5,.05,z-this.origin.z-Math.cos(heading)*10.5);this.quaternion.setFromAxisAngle(UP,heading);this.matrix.compose(this.temp,this.quaternion,this.scale);this.lightPools.setMatrixAt(k++,this.matrix);};
      add(this.heroPose.x,this.heroPose.z,this.heroPose.heading);for(const c of rendered)add(c.x,c.z,c.heading);this.lightPools.count=k;this.lightPools.instanceMatrix.needsUpdate=true;}else this.lightPools.count=0;
  }
  update(dt,alpha=1){
    if(this.contextLost)return;
    this.age+=dt;const render=interpolateVehicle(this.sim,alpha),p=this.pose(render.s,render.offset),old={...this.origin};
    const changed=this.city.update(p.x,p.z);this.origin=this.city.origin;if(changed)setWarpOrigin(this.origin.x,this.origin.z);
    if(changed){const dx=old.x-this.origin.x,dz=old.z-this.origin.z;this.camera.position.x+=dx;this.camera.position.z+=dz;this.lookTarget.x+=dx;this.lookTarget.z+=dz;}
    // Curved city: the car, camera and sun follow the warped road, physics stays on the grid route.
    const w=warpPose(p.x,p.z,p.heading),x=w.x-this.origin.x,z=w.z-this.origin.z;
    this.player.position.set(x,.02,z);
    const lateral=(this.sim.offset-this.sim.prevOffset)*60,angle=warpHeading(p.x,p.z,p.heading-Math.atan2(lateral,Math.max(5,this.sim.speed)));
    this.player.rotation.set(0,angle,0);this.hero.wheels.forEach(w=>w.rotation.x=-render.s/this.hero.radius);
    this.heroShadow.position.set(x,.035,z);this.heroShadow.rotation.y=angle;
    this.heroPose={x:w.x,z:w.z,heading:angle};this.updateIndicators();
    const night=this.lighting?.night??0,brake=this.sim.braking?1:0;this.brakeGlow=lerp(this.brakeGlow??0,brake,dampFactor(14,dt));
    this.vehicles.heroMaterials.red.emissiveIntensity=.15+.85*night+2.6*this.brakeGlow;
    this.updateSignals(this.sim.time-(1-alpha)/60,render.s);this.updateTraffic(alpha,render.s);
    const kmh=this.sim.speed*3.6,rush=Math.min(1,Math.max(0,(kmh-120)/180));
    const fog=this.fogBase||{near:200,far:650};if(this.cameraMode===2){this.scene.fog.near=this.isoDistance+this.isoView*.4;this.scene.fog.far=this.isoDistance+this.isoView*4+120;}else{this.scene.fog.near=fog.near;this.scene.fog.far=fog.far;}
    if(this.cameraMode<2){
    const fov=54+rush*11;if(Math.abs(fov-this.fov)>.02){this.fov=lerp(this.fov,fov,dampFactor(3,dt));this.camera.fov=this.fov;this.camera.updateProjectionMatrix();}
    const back=(this.cameraMode?17.5:11.8)-rush*1.4,height=(this.cameraMode?9:5.8)-rush*.6;
    this.temp.set(x-w.dx*back,height,z-w.dz*back);if(this.snap)this.camera.position.copy(this.temp);else this.camera.position.lerp(this.temp,dampFactor(9,dt));
    const look0=this.pose(render.s+12,render.offset),look=warpPoint(look0.x,look0.z);this.temp.set(look.x-this.origin.x,1.0,look.z-this.origin.z);if(this.snap)this.lookTarget.copy(this.temp);else this.lookTarget.lerp(this.temp,dampFactor(10,dt));
    this.lookMatrix.lookAt(this.camera.position,this.lookTarget,UP);this.lookQuaternion.setFromRotationMatrix(this.lookMatrix);if(this.snap)this.camera.quaternion.copy(this.lookQuaternion);else this.camera.quaternion.slerp(this.lookQuaternion,dampFactor(16,dt));
    }else this.updateIso(dt,x,z,p,w);
    this.snap=false;this.updateDirector(dt);
    this.sky.position.set(x,0,z);this.ground.position.x=x;this.ground.position.z=z;this.celestial.position.set(x,0,z);
    if(rush>.15&&this.cameraMode<2){const t=this.age*38,k=rush*.045;this.camera.position.y+=Math.sin(t)*k*.6+Math.sin(t*1.7)*k*.4;}
    const texel=150/1536,anchorX=Math.round(w.x/texel)*texel-this.origin.x,anchorZ=Math.round(w.z/texel)*texel-this.origin.z;
    const L=this.lightDir||{x:-.45,y:.74,z:-.35};this.sun.position.set(anchorX+L.x*155,L.y*155,anchorZ+L.z*155);this.sun.target.position.set(anchorX,0,anchorZ);this.sun.target.updateMatrixWorld();
    if(changed||this.city.completed!==this.shadowCityCount||this.age-this.lastShadow>.10||this.lastShadow===undefined){this.renderer.shadowMap.needsUpdate=true;this.lastShadow=this.age;this.shadowCityCount=this.city.completed;}
    const beforeRender=performance.now();this.renderer.render(this.scene,this.activeCamera);this.renderCpuMs=performance.now()-beforeRender;const beforeStream=performance.now();this.city.pump();this.streamCpuMs=performance.now()-beforeStream;
    if(dt>.024)this.slowFrames++;else this.slowFrames=Math.max(0,this.slowFrames-1);
    if(this.slowFrames>75&&this.qualityScale>.7){this.qualityScale-=.1;this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.35)*this.qualityScale);this.resize();this.slowFrames=0;}
  }
  // 1.4 Hz indicator rhythm, 55% on, locked to simulation time.
  blinkPhase(){return ((this.sim.time*1.4)%1)<.55;}
  updateIndicators(){
    const dir=this.sim.indicator,on=this.blinkPhase(),h=this.hero;if(!h?.blinkers)return;
    for(const side of [-1,1])for(const m of h.blinkers[side]){const lit=dir===side&&on;if(m.isSprite)m.visible=lit;else m.material=lit?this.blinkOn:this.blinkOff;}
  }
  setHeroCar(id){
    const next=this.heroes[id]||this.heroes.veloce;if(next===this.hero)return;
    for(const h of Object.values(this.heroes))h.group.visible=h===next;this.hero=next;this.heroId=id in this.heroes?id:'veloce';
    for(const l of this.headlights){const h=next.headlight;l.position.set(l.userData.side*h.spread,h.y,h.z);l.target.position.set(l.userData.side*2.6,-.4,-34);}
    this.renderer.shadowMap.needsUpdate=true;
  }
  setLighting(l){
    this.lighting=l;const el=l.elevation,az=l.azimuth*Math.PI/180;
    const dir=(azimuth,elev)=>{const e=elev*Math.PI/180;return {x:Math.sin(azimuth)*Math.cos(e),y:Math.sin(e),z:-Math.cos(azimuth)*Math.cos(e)};};
    const sunDir=dir(az,el),moonDir=dir(az+Math.PI*.85,Math.max(24,Math.min(62,-el*.8)));
    const key=[l.zenith,l.horizon].join();if(key!==this.skyKey){this.skyKey=key;paintSky(this.skyMap,l.zenith,l.horizon,l.night>.5?'#05070b':'#9a9c8e');}
    this.scene.background.set(l.horizon);this.scene.fog.color.set(l.horizon).lerp(new THREE.Color(l.zenith),.25);this.fogBase={near:200-70*l.night,far:650-80*l.night};
    this.hemi.color.set(l.ambientSky);this.hemi.groundColor.set(l.ambientGround);this.hemi.intensity=l.ambientIntensity;
    const sunUp=l.sunIntensity>.05,lightDir=sunUp?sunDir:moonDir;this.lightDir={x:lightDir.x,y:Math.max(.18,lightDir.y),z:lightDir.z};
    this.sun.color.set(sunUp?l.sunColor:'#9fb3e0');this.sun.intensity=sunUp?l.sunIntensity:l.moonIntensity;
    this.renderer.toneMappingExposure=l.exposure;for(const h of Object.values(this.heroes))for(const mat of h.reflective)mat.envMapIntensity=.1+.55*l.day;
    this.sunDisc.position.set(sunDir.x*640,sunDir.y*640,sunDir.z*640);this.sunDisc.visible=el>-3;this.sunDisc.material.color.set(l.sunColor);
    this.moonDisc.position.set(moonDir.x*640,moonDir.y*640,moonDir.z*640);this.moonDisc.material.opacity=l.night;this.moonDisc.visible=l.night>.02;
    this.stars.material.opacity=Math.max(0,l.night-.25)*1.2;this.stars.visible=l.night>.25;
    const m=this.materials,lamps=l.lampsOn?Math.max(.35,l.night):0;
    m.lamp.emissiveIntensity=2.1*lamps;m.shopGlass.emissiveIntensity=1.1*lamps;for(const f of m.facades)f.emissiveIntensity=1.25*Math.pow(l.night,1.4);
    m.lampPool.visible=lamps>0;m.lampPool.opacity=.62*lamps;
    this.vehicles.materials.red.emissiveIntensity=.12+1.0*l.night;this.vehicles.materials.light.emissiveIntensity=2.4*l.night;this.vehicles.heroMaterials.light.emissiveIntensity=2.8*lamps;
    for(const h of this.headlights)h.intensity=lamps*260;this.poolMaterial.visible=lamps>0;this.poolMaterial.opacity=.2*lamps;this.fill.intensity=34*Math.max(l.night,l.twilight*.7);
    this.renderer.shadowMap.needsUpdate=true;
  }
  stats(){return {drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,chunks:this.city.chunks.size,geometries:this.renderer.info.memory.geometries,vehicleLoaded:true,vehicle:this.hero?.name,lighting:this.lighting?{phase:this.lighting.phase,sunElevation:+this.lighting.elevation.toFixed(1)}:null,assetError:null,renderScale:+this.qualityScale.toFixed(1),streamingWorker:!!this.city.worker,renderCpuMs:+(this.renderCpuMs||0).toFixed(2),streamCpuMs:+(this.streamCpuMs||0).toFixed(2),gpu:this.gpu};}
}
