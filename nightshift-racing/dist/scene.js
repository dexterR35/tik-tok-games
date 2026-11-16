import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneModel } from 'three/addons/utils/SkeletonUtils.js';
import { CARS } from './rules.js';

const CAMERA_NAMES = ['CHASE CAM', 'RIVAL CAM', 'LOW PURSUIT', 'CINEMATIC CAM'];
const makeCanvas = (w, h, draw) => {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};
const glowTexture = makeCanvas(64, 64, (c, w) => {
  const gradient = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.15, '#ffffffbb'); gradient.addColorStop(.5, '#ffffff22'); gradient.addColorStop(1, '#ffffff00');
  c.fillStyle = gradient; c.fillRect(0, 0, w, w);
});

export class RaceScene {
  constructor(container, onCamera) {
    this.container = container; this.onCamera = onCamera; this.time = 0; this.travel = 0; this.mode = 0; this.autoCamera = true; this.lastCameraChange = 0; this.quality = 'high'; this.ready = false;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .82;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#0c1523'); this.scene.fog = new THREE.FogExp2('#152437', .006);
    this.camera = new THREE.PerspectiveCamera(48, 9 / 16, .1, 650);
    this.camera.position.set(-5.6, 3.5, 10.8); this.lookAt = new THREE.Vector3(0, .5, -9);
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(environment, .04).texture;
    this.scene.environmentIntensity = .2; environment.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#a9ccff', '#17202a', .85));
    const moonlight = new THREE.DirectionalLight('#c8dfff', 2.1); moonlight.position.set(-30, 65, -35);
    moonlight.castShadow = true; moonlight.shadow.mapSize.set(1024, 1024);
    Object.assign(moonlight.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, far: 120 });
    moonlight.shadow.bias = -.0004; moonlight.target.position.set(0, 0, 0); this.scene.add(moonlight, moonlight.target);
    const magenta = new THREE.DirectionalLight('#ff518f', 1.1); magenta.position.set(10, 8, -5); this.scene.add(magenta);
    const blue = new THREE.DirectionalLight('#5cdaff', 1.1); blue.position.set(-10, 4, 8); this.scene.add(blue);
    this.makeRoad(); this.makeCity(); this.makeFurniture(); this.makeSky();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new OutputPass());
    this.cars = []; this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
  }
  material(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: .3, ...opts }); }
  box(w, h, d, material, x = 0, y = 0, z = 0, parent = this.scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  plane(w, h, material, x, y, z, parent = this.scene) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  glow(color, scale, x, y, z, parent) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, depthWrite: false, opacity: 0 }));
    sprite.visible = false;
    sprite.scale.set(scale, scale, 1); sprite.position.set(x, y, z); (parent || this.scene).add(sprite); return sprite;
  }
  makeRoad() {
    const texture = makeCanvas(512, 1024, (c, w, h) => {
      c.fillStyle = '#29323c'; c.fillRect(0, 0, w, h);
      const pixels = c.getImageData(0, 0, w, h);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const n = Math.random() * 20 - 10; pixels.data[i] += n; pixels.data[i+1] += n; pixels.data[i+2] += n;
      }
      c.putImageData(pixels, 0, 0);
      for (let i=0;i<1000;i++){c.fillStyle = `rgba(165,190,210,${Math.random()*.065})`;c.fillRect(Math.random()*w,Math.random()*h,Math.random()*2+1,Math.random()*80+10);}
      c.fillStyle = '#ccd4c6'; c.fillRect(7,0,3,h); c.fillRect(w-10,0,3,h);
      for(let lane=1;lane<4;lane++)for(let y=0;y<h;y+=160){c.fillStyle='#c0c5b399';c.fillRect(lane*w/4-1.5,y,3,65);}
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1, 34); texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.roadTexture = texture;
    const road = this.plane(16, 1200, this.material('#586b7d', { map:texture, roughness:.96, metalness:0, envMapIntensity:.08 }), 0, -.03, -450); road.receiveShadow = true;
    // Asphalt reflections are drawn on the surface to keep the mobile render inexpensive.
    this.reflections=[];
    for(let i=0;i<40;i++){
      const color = ['#546d88','#ef5274','#e2c587','#6fa3d5'][i%4];
      const m = new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false});
      const mesh=this.plane(.05+Math.random()*.25,12+Math.random()*35,m,(Math.random()-.5)*15,.002,-Math.random()*250);
      this.reflections.push(mesh);
    }
    const concrete=this.material('#46515a',{roughness:.73});
    for(const side of [-1,1]) {
      this.box(.5,.8,1100,concrete,side*8.3,.35,-400);
      this.box(.15,.12,1100,this.material('#a9bac8',{metalness:.8,roughness:.2}),side*8.25,.95,-400);
      this.plane(.12,1100,new THREE.MeshBasicMaterial({color:'#78aecc',transparent:true,opacity:.3}),side*7.8,.01,-400);
    }
    this.finish = new THREE.Group();
    const flag=makeCanvas(256,64,(c,w,h)=>{c.fillStyle='#fafbe9';c.fillRect(0,0,w,h);c.fillStyle='#17212b';for(let x=0;x<16;x++)for(let y=0;y<4;y++)if((x+y)%2)c.fillRect(x*16,y*16,16,16);});
    this.plane(15.7,2.6,new THREE.MeshStandardMaterial({map:flag,roughness:.4,metalness:.2}),0,.012,0,this.finish);this.scene.add(this.finish);this.finish.visible=false;
  }
  makeCity() {
    const maps=[];
    for(let t=0;t<4;t++)maps.push(makeCanvas(256,512,(c,w,h)=>{
      c.fillStyle=['#1a2634','#1c2434','#1b2e38','#252839'][t];c.fillRect(0,0,w,h);
      for(let y=6;y<h;y+=15)for(let x=7;x<w;x+=16){const lit=Math.random()>.4;c.fillStyle=lit?['#b5c7b3','#6b9eaf','#c6ad91','#7d8db8'][(x+y+t)%4]:'#263442';c.globalAlpha=lit?.3+Math.random()*.5:.3;c.fillRect(x,y,6+Math.random()*3,7);}
      c.globalAlpha=1;c.fillStyle='#0c1721';for(let x=0;x<w;x+=64)c.fillRect(x,0,3,h);
    }));
    const buildingMaterials=maps.map(map=>this.material('#c2d0df',{map,emissiveMap:map,emissive:'#9eb9dd',emissiveIntensity:.48,roughness:.7,metalness:.2}));
    this.city = new THREE.Group();this.scene.add(this.city);
    this.buildings=[];
    for(let i=0;i<115;i++){
      const side=i%2?1:-1; const w=8+Math.random()*13;const h=9+Math.random()**1.4*65;const d=8+Math.random()*17;
      const mesh=this.box(w,h,d,buildingMaterials[i%4],side*(19+Math.random()*70),h/2-6,-Math.random()*460+55,this.city);
      this.buildings.push(mesh);
      if(i%5===0){const strip=this.box(.12,h,.15,new THREE.MeshBasicMaterial({color:i%2?'#ef3c7b':'#42b9d4'}),-w/2-.03,0,-d/2-.1,mesh);strip.position.y=0;}
      if(i%9===0){this.box(w*.8,.2,d*.8,new THREE.MeshBasicMaterial({color:'#7094aa'}),0,h/2+.2,0,mesh);}
    }
    // Neon shop fronts and illuminated billboards give the camera recognisable city detail.
    const ads=[['NIGHTSHIFT','#d3ff39'],['MIDNIGHT RUN','#ff5d90'],['東京  EXPRESS','#70e0fa'],['OPEN ALL NIGHT','#ac8aff'],['NO BRAKES.','#f4e4bd'],['SHUTO  首都高','#67f0c3']];
    this.billboards=[];
    for(let i=0;i<18;i++){
      const [text,color]=ads[i%ads.length];const tex=makeCanvas(512,160,(c,w,h)=>{c.fillStyle='#0d1521';c.fillRect(0,0,w,h);c.strokeStyle=color;c.lineWidth=4;c.strokeRect(10,10,w-20,h-20);c.fillStyle=color;c.textAlign='center';c.font=`bold ${text.length>13?36:45}px Arial`;c.fillText(text,w/2,95);c.fillStyle='#acbbc8';c.font='12px Arial';c.fillText('AFTER HOURS STREET DIVISION',w/2,127);});
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(8,2.5),new THREE.MeshBasicMaterial({map:tex}));mesh.position.set(i%2?13.5:-13.5,4+(i%4)*3,-i*29+18);mesh.rotation.y=i%2?-.34:.34;this.scene.add(mesh);this.billboards.push(mesh);
    }
  }
  makeFurniture() {
    this.furniture=[];
    const metal=this.material('#435467',{metalness:.8,roughness:.3});
    const light=new THREE.MeshBasicMaterial({color:'#d3e9ff'});
    for(let i=0;i<32;i++){
      const group=new THREE.Group();const side=i%2?1:-1;group.position.set(side*8.7,0,-i*17+45);
      this.box(.12,9,.16,metal,0,4.5,0,group);this.box(3.2,.1,.14,metal,-side*1.5,9,0,group);
      this.box(1.7,.06,.25,light,-side*2.2,8.9,0,group);this.glow('#a5d4ff',2.2,-side*2.4,8.75,0,group);
      // Long translucent light puddles beneath the lamps.
      this.plane(3,11,new THREE.MeshBasicMaterial({map:glowTexture,color:'#9ed4fa',transparent:true,opacity:0,depthWrite:false}),-side*3,.008,0,group);
      this.box(.16,.13,.35,new THREE.MeshBasicMaterial({color:'#ff8463'}),-side*.5,.6,0,group);
      this.scene.add(group);this.furniture.push(group);
    }
    this.gantries=[];
    for(let i=0;i<4;i++){
      const group=new THREE.Group();group.position.z=-70-i*130;
      this.box(.35,10,.35,metal,-8.7,5,0,group);this.box(.35,10,.35,metal,8.7,5,0,group);this.box(18,.4,.5,metal,0,10,0,group);
      const sign=makeCanvas(1024,256,(c,w,h)=>{
        c.fillStyle='#174d43';c.fillRect(0,0,w,h);c.strokeStyle='#cfe7cf';c.lineWidth=5;c.strokeRect(8,8,w-16,h-16);
        c.fillStyle='#eef8e6';c.font='bold 44px Arial';c.fillText('BAYSHORE ROUTE',45,70);c.font='26px Arial';c.fillText('湾岸線   /   SHUTO EXPRESSWAY',45,116);c.font='bold 60px Arial';c.fillText('↓',140,213);c.fillText('↓',400,213);c.fillText('↓',660,213);c.fillText('↓',875,213);c.font='bold 35px Arial';c.fillText('C1',850,65);c.font='22px Arial';c.fillText('TOKYO',820,111);
      });
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(12,3),new THREE.MeshStandardMaterial({map:sign,emissiveMap:sign,emissive:'#b9d5c8',emissiveIntensity:.7,roughness:.5}));panel.position.set(0,8.1,.35);group.add(panel);
      this.box(12,.08,.1,light,0,9.7,.7,group);this.scene.add(group);this.gantries.push(group);
    }
    // Tokyo-style elevated bridge silhouette.
    this.bridge=new THREE.Group();this.bridge.position.z=-270;
    const red=this.material('#953c5a',{emissive:'#3d1425',emissiveIntensity:.4});
    for(const x of [-21,21]){this.box(1.4,44,1.8,red,x,16,0,this.bridge);this.box(1.4,44,1.8,red,x,16,-80,this.bridge);}
    this.box(44,1,1.8,red,0,36,0,this.bridge);this.box(44,1,1.8,red,0,36,-80,this.bridge);
    for(const side of [-1,1])for(let i=0;i<17;i++){const z=-i*5;const y=14+22*Math.abs((i-8)/8)**2;this.box(.07,y,.07,this.material('#ad6178'),side*20,y/2,z,this.bridge);this.glow('#ff5a8f',.7,side*21,y,z,this.bridge);}
    this.scene.add(this.bridge);
  }
  makeSky(){
    const stars=new Float32Array(600*3);for(let i=0;i<stars.length;i+=3){stars[i]=(Math.random()-.5)*900;stars[i+1]=60+Math.random()*350;stars[i+2]=-250-Math.random()*280;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(stars,3));this.scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:'#b9ccdf',size:.25,transparent:true,opacity:.5})));
    const moon=new THREE.Mesh(new THREE.SphereGeometry(5,24,16),new THREE.MeshBasicMaterial({color:'#acbfd0'}));moon.position.set(85,115,-420);this.scene.add(moon);this.glow('#a2b2d9',50,85,115,-423);
  }
  async load(onProgress) {
    const decoder=new DRACOLoader();decoder.setDecoderPath('./vendor/draco/');decoder.setWorkerLimit(2);
    const loader=new GLTFLoader();loader.setDRACOLoader(decoder);
    loader.setMeshoptDecoder(MeshoptDecoder);
    let loaded=0;
    const [models,hdr]=await Promise.all([
      Promise.all(CARS.map(car=>loader.loadAsync(`./assets/${car.asset}.glb`).then(gltf=>{onProgress?.(Math.round(++loaded/4*100));return gltf.scene;}))),
      new HDRLoader().loadAsync('./assets/city-night.hdr').catch(()=>null)
    ]);
    if(hdr){hdr.mapping=THREE.EquirectangularReflectionMapping;this.scene.environment.dispose();this.scene.environment=hdr;this.scene.environmentIntensity=.2;this.scene.environmentRotation.y=.7;}
    this.templates=new Map(CARS.map((car,i)=>[car.asset,models[i]]));this.playerCache=new Map();
    this.makeCar(0,CARS[0]);this.makeCar(1,CARS[2]);this.makeCar(2,CARS[1]);this.makeCar(3,CARS[3]);
    this.makeThumbnails();
    decoder.dispose();this.ready=true;
  }
  createVehicle(definition){
    const mount=new THREE.Group(),model=cloneModel(this.templates.get(definition.asset));
    const axis=new THREE.Group();axis.rotation.y=definition.rotation;axis.add(model);mount.add(axis);
    const paint=new THREE.MeshStandardMaterial({color:definition.color,metalness:.05,roughness:.82,envMapIntensity:.2});
    model.traverse(mesh=>{if(!mesh.isMesh)return;mesh.castShadow=true;mesh.receiveShadow=false;
      const modify=original=>{const mat=original.clone();
        if(/Body_Color|CARROSSERIE|^EXT_Carpaint|^Color1Mtl$/i.test(mat.name)||definition.asset==='ferrari'&&mesh.name==='body')return paint;
        if(mat.isMeshStandardMaterial){mat.envMapIntensity=.2;mat.roughness=Math.max(.7,mat.roughness);mat.metalness=Math.min(.12,mat.metalness);mat.emissiveIntensity=Math.min(.25,mat.emissiveIntensity);if('clearcoat'in mat)mat.clearcoat=0;}
        if(/glass|window/i.test(mat.name)&&!/light|lens/i.test(mat.name)){mat.color.set('#14232e');mat.roughness=.55;}
        return mat;
      };mesh.material=Array.isArray(mesh.material)?mesh.material.map(modify):modify(mesh.material);
    });
    mount.updateMatrixWorld(true);let box=new THREE.Box3().setFromObject(axis);const size=box.getSize(new THREE.Vector3());
    axis.scale.setScalar(definition.length/Math.max(size.x,size.z));mount.updateMatrixWorld(true);
    box=new THREE.Box3().setFromObject(axis);const center=box.getCenter(new THREE.Vector3());axis.position.set(-center.x,-box.min.y+.012,-center.z);
    const wheels=definition.asset==='ferrari'?['wheel_fl','wheel_fr','wheel_rl','wheel_rr'].map(name=>model.getObjectByName(name)).filter(Boolean):this.groupWheels(mount);
    return {mount,paint,wheels,definition};
  }
  groupWheels(mount){
    mount.updateMatrixWorld(true);const groups=new Map(),matches=[];
    mount.traverse(mesh=>{if(!mesh.isMesh||mesh.isSkinnedMesh)return;const names=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(mat=>mat.name).join(' ');
      if(!/tyre|tire|rim|wheel|neumatico|rin1mtl|eje1mtl/i.test(names))return;
      const box=new THREE.Box3().setFromObject(mesh),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      if(size.z>1.1||size.x>1.1||size.y>1.1||Math.abs(center.x)<.4)return;
      matches.push({mesh,box,center});
    });
    for(const item of matches){const key=`${Math.sign(item.center.x)}:${Math.sign(item.center.z)}`;if(!groups.has(key))groups.set(key,{bounds:new THREE.Box3(),meshes:[]});const group=groups.get(key);group.bounds.union(item.box);group.meshes.push(item.mesh);}
    const wheels=[];for(const {bounds,meshes} of groups.values()){const pivot=new THREE.Group();pivot.position.copy(bounds.getCenter(new THREE.Vector3()));mount.add(pivot);pivot.updateMatrixWorld(true);for(const mesh of meshes)pivot.attach(mesh);wheels.push(pivot);}return wheels;
  }
  makeCar(index,definition){
    const color=definition.color,root=new THREE.Group(),vehicle=this.createVehicle(definition),model=vehicle.mount,paint=vehicle.paint,wheels=vehicle.wheels;root.add(model);
    if(index===0)this.playerCache.set(definition.id,vehicle);
    const glow=this.plane(3.2,5.3,new THREE.MeshBasicMaterial({map:glowTexture,color,transparent:true,opacity:0,depthWrite:false}),0,.015,0,root);
    const shadow=this.plane(2.7,5.5,new THREE.MeshBasicMaterial({map:glowTexture,color:'#000000',transparent:true,opacity:.9,depthWrite:false}),0,.012,.1,root);shadow.renderOrder=1;
    const plate=makeCanvas(256,64,(c,w,h)=>{c.fillStyle='#e8ece3';c.fillRect(0,0,w,h);c.fillStyle='#16212a';c.font='bold 28px Arial';c.textAlign='center';c.fillText(index===0?'NIGHTSHIFT':['VIPER','GHOST','NOVA'][index-1],w/2,40);});
    const plateMesh=new THREE.Mesh(new THREE.PlaneGeometry(.65,.16),new THREE.MeshStandardMaterial({map:plate,roughness:.4}));plateMesh.position.set(0,.45,2.14);root.add(plateMesh);
    const tails=[];for(const x of [-.73,.73]){tails.push(this.glow('#ff294c',.55,x,.72,1.94,root));this.box(.22,.06,.025,new THREE.MeshBasicMaterial({color:'#c51f3c'}),x,.72,2.02,root);this.glow('#cceaff',.65,x,.55,-2.08,root);}
    const flames=[];for(const x of [-.28,.28]){
      const mesh=new THREE.Mesh(new THREE.ConeGeometry(.12,1.7,20,1,true),new THREE.MeshBasicMaterial({color:'#8ee6ff',transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.28,2.9);mesh.visible=false;root.add(mesh);flames.push(mesh);
      const sprite=this.glow('#58acff',1,x,.28,2.4,root);sprite.visible=false;flames.push(sprite);
    }
    root.position.x=[-1.8,1.8,5.4,-5.4][index];root.position.z=[0,-1.4,-3.6,-5.8][index];this.scene.add(root);
    this.cars.push({root,model,paint,glow,wheels,tails,flames,definition});
  }
  equip(car){if(!this.cars[0]||this.cars[0].definition.id===car.id)return;
    const visual=this.cars[0];visual.root.remove(visual.model);
    let vehicle=this.playerCache.get(car.id);if(!vehicle){vehicle=this.createVehicle(car);this.playerCache.set(car.id,vehicle);}
    visual.root.add(vehicle.mount);Object.assign(visual,{model:vehicle.mount,paint:vehicle.paint,wheels:vehicle.wheels,definition:car});
  }
  makeThumbnails(){
    this.thumbnails={};const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setSize(512,280);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
    const scene=new THREE.Scene();scene.environment=this.scene.environment;scene.environmentIntensity=.2;
    scene.add(new THREE.HemisphereLight('#e5efff','#5d6270',2));const key=new THREE.DirectionalLight('#ffffff',3);key.position.set(-4,7,-5);scene.add(key);
    const camera=new THREE.PerspectiveCamera(21,512/280,.1,30);camera.position.set(-6,2.5,-7);camera.lookAt(0,.5,0);
    for(const car of CARS){const vehicle=this.createVehicle(car);scene.add(vehicle.mount);renderer.render(scene,camera);this.thumbnails[car.id]=renderer.domElement.toDataURL('image/png');scene.remove(vehicle.mount);const materials=new Set();vehicle.mount.traverse(mesh=>{if(mesh.isMesh)for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(mat);});materials.forEach(mat=>mat.dispose());}
    renderer.dispose();
  }
  resize(){const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height,false);this.composer?.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  setQuality(value){this.quality=value;this.renderer.setPixelRatio(Math.min(devicePixelRatio,value==='performance'?1:1.6));this.renderer.shadowMap.enabled=value!=='performance';this.resize();}
  nextCamera(){this.mode=(this.mode+1)%4;this.lastCameraChange=this.time;this.onCamera?.(CAMERA_NAMES[this.mode]);}
  update(engine,dt){
    this.time+=dt;
    const speed=engine.cars[0].speed;const running=engine.phase==='racing';const boost=engine.boostSpeed;
    const motion=(running?speed/3.6:engine.phase==='finished'?speed/9:0)*dt;this.travel+=motion;
    this.roadTexture.offset.y=this.travel/35;
    const wrap=(mesh,lo=-480,hi=64)=>{mesh.position.z+=motion;if(mesh.position.z>hi)mesh.position.z=lo;};
    this.buildings.forEach(b=>wrap(b));this.furniture.forEach(b=>wrap(b));this.gantries.forEach(b=>wrap(b));this.billboards.forEach(b=>wrap(b));this.reflections.forEach(b=>wrap(b,-280,30));
    this.bridge.position.z+=motion;if(this.bridge.position.z>100)this.bridge.position.z=-470;
    this.finish.visible=engine.elapsed>engine.duration-3 && engine.phase==='racing';this.finish.position.z=-(engine.duration-engine.elapsed)*Math.max(speed/3.6,40);
    if(this.ready){
      engine.cars.forEach((car,i)=>{
        const visual=this.cars[i];const targetZ=i===0?0:THREE.MathUtils.clamp(-(car.distance-engine.cars[0].distance),-95,65);
        visual.root.position.z=THREE.MathUtils.damp(visual.root.position.z,targetZ,6,dt);
        visual.root.position.x=car.lane+Math.sin(this.time*1.4+i*3)*.045;
        visual.model.position.y=.006*Math.sin(this.time*30+i);
        visual.wheels.forEach(w=>w.rotation.x-=car.speed/3.6*dt/0.35);
        visual.flames.forEach(f=>{f.visible=i===0&&boost>0&&running;f.scale.setScalar(.8+Math.random()*.35);});
      });
    }
    const automatic=this.time-this.lastCameraChange>6.5;
    if(automatic&&running){this.nextCamera();}
    if(engine.phase==='countdown'&&this.mode!==0){this.mode=0;this.onCamera?.(CAMERA_NAMES[0]);}
    let pos,look;
    const x=engine.cars[0].lane;
    if(this.mode===0){pos=new THREE.Vector3(x-2.3,3,9.5+boost*.009);look=new THREE.Vector3(x+1.15,.45,-5);}
    else if(this.mode===1){pos=new THREE.Vector3(x-5.8,2.4,7.5);look=new THREE.Vector3(x+2.4,.65,-3.5);}
    else if(this.mode===2){pos=new THREE.Vector3(x-.8,1.65,9);look=new THREE.Vector3(x+.88,.45,-10);}
    else{pos=new THREE.Vector3(x+5.7,3.8,9.5);look=new THREE.Vector3(x-3,.5,-5);}
    if(engine.phase==='finished'){pos=new THREE.Vector3(x-5,2.3,7);look=new THREE.Vector3(x,.7,0);}
    this.camera.position.lerp(pos,1-Math.exp(-dt*2));this.lookAt.lerp(look,1-Math.exp(-dt*2.8));
    this.camera.position.x+=running?Math.sin(this.time*34)*.003*(speed/180):0;
    this.camera.lookAt(this.lookAt);const fov=48+Math.min(7,boost*.08);this.camera.fov=THREE.MathUtils.damp(this.camera.fov,fov,3,dt);this.camera.updateProjectionMatrix();
    if(this.quality==='performance')this.renderer.render(this.scene,this.camera);else this.composer.render();
  }
}
