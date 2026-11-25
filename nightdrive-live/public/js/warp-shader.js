import * as THREE from 'three';
import {warpGLSL,warpPhases} from './warp.js';

// One shared uniform set for every program: the phases move with the floating origin.
export const warpUniforms={warpPhaseX:{value:[0,0,0]},warpPhaseZ:{value:[0,0,0]}};
export function setWarpOrigin(ox,oz){const {px,pz}=warpPhases(ox,oz);warpUniforms.warpPhaseX.value=px;warpUniforms.warpPhaseZ.value=pz;}

const PROJECT=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = viewMatrix * vec4( warpPos( ( modelMatrix * mvPosition ).xyz ), 1.0 );
gl_Position = projectionMatrix * mvPosition;`;

// Bends a compiled shader. Objects that are placed by JS with an already-warped
// pose (cars, contact shadows, sky) set material.userData.noWarp and are skipped.
export function applyWarp(shader,material){
  if(material?.userData?.noWarp)return;
  const vs=shader.vertexShader;if(!vs.includes('#include <common>'))return;
  shader.uniforms.warpPhaseX=warpUniforms.warpPhaseX;shader.uniforms.warpPhaseZ=warpUniforms.warpPhaseZ;
  let out=vs.replace('#include <common>','#include <common>\n'+warpGLSL());
  if(out.includes('#include <project_vertex>'))out=out.replace('#include <project_vertex>',PROJECT);
  if(out.includes('#include <worldpos_vertex>'))out=out.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\nworldPosition.xyz = warpPos( worldPosition.xyz );\n#endif');
  // Sprites (traffic-light glows) bend at their centre.
  if(out.includes('vec4 mvPosition = modelViewMatrix[ 3 ];'))out=out.replace('vec4 mvPosition = modelViewMatrix[ 3 ];','vec4 mvPosition = viewMatrix * vec4( warpPos( modelMatrix[ 3 ].xyz ), 1.0 );');
  shader.vertexShader=out;
}

let installed=false;
export function installWarp(){
  if(installed)return;installed=true;
  THREE.Material.prototype.onBeforeCompile=function(shader){applyWarp(shader,this);};
  THREE.Material.prototype.customProgramCacheKey=function(){return 'warp-v1|'+(this.userData?.noWarp?'flat':'bent')+'|'+this.onBeforeCompile.toString();};
}

const flatDepth=new THREE.MeshDepthMaterial();flatDepth.userData.noWarp=true;
export function markNoWarp(object){
  object.traverse(o=>{
    for(const m of [o.material].flat())if(m){m.userData.noWarp=true;m.needsUpdate=true;}
    if(o.isMesh&&o.castShadow)o.customDepthMaterial=flatDepth;
  });
}
