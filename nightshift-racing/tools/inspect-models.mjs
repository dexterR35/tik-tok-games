import fs from 'node:fs';
import * as THREE from 'three';
for(const id of ['ferrari','lamborghini','bugatti','porsche']){
  const b=fs.readFileSync(`dist/assets/${id}.glb`),j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
  const total=new THREE.Box3(),parts=[];
  function walk(index,parent){const node=j.nodes[index],local=node.matrix?new THREE.Matrix4().fromArray(node.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(node.translation||[0,0,0])),new THREE.Quaternion(...(node.rotation||[0,0,0,1])),new THREE.Vector3(...(node.scale||[1,1,1])));const matrix=parent.clone().multiply(local);const bounds=new THREE.Box3();
    if(node.mesh!==undefined){for(const p of j.meshes[node.mesh].primitives){const a=j.accessors[p.attributes.POSITION];if(a.min&&a.max){const min=new THREE.Vector3(...a.min),max=new THREE.Vector3(...a.max);if(a.normalized){const divisor=a.componentType===5122?32767:a.componentType===5123?65535:127;min.divideScalar(divisor);max.divideScalar(divisor);}bounds.union(new THREE.Box3(min,max).applyMatrix4(matrix));}}total.union(bounds);if(/wheel|tyre|tire|front|rear/i.test(node.name))parts.push({name:node.name,center:bounds.getCenter(new THREE.Vector3()).toArray().map(x=>+x.toFixed(2))});}
    for(const child of node.children||[])walk(child,matrix);
  }
  for(const index of j.scenes[j.scene||0].nodes)walk(index,new THREE.Matrix4());
  console.log(JSON.stringify({id,size:total.getSize(new THREE.Vector3()).toArray(),center:total.getCenter(new THREE.Vector3()).toArray(),triangles:j.meshes.reduce((s,m)=>s+m.primitives.reduce((t,p)=>t+(p.indices?j.accessors[p.indices].count:0)/3,0),0),paint:j.materials.filter(m=>/body|paint|carros|colou?r/i.test(m.name)).map(m=>m.name),parts:parts.slice(0,6)}));
}
