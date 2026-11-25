import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bendAt, curvature, curveRadius, installCurves, noBend, CURVE_STATE } from '../public/js/curves.js';

test('the road is straight and level right under the camera, at any distance', () => {
  for (const dc of [0, 137, 999, 2500]) { const b = bendAt(dc, dc); assert.equal(b.x, 0); assert.equal(b.y, 0); }
  // and has no angle there: a point 1 m ahead moves less than 1 cm
  for (const dc of [0, 640, 1800]) assert.ok(Math.abs(bendAt(dc + 1, dc).x) < 0.01);
});
test('curves are highway-like: tightest radius at least 150 m, hills a few metres', () => {
  let tight = Infinity, hill = 0;
  for (let d = 0; d < 6000; d += 2) { tight = Math.min(tight, curveRadius(d)); hill = Math.max(hill, Math.abs(bendAt(d + 100, d).y)); }
  assert.ok(tight >= 150 && tight < 400, `tightest radius ${tight}`); assert.ok(hill > 1 && hill < 8, `hill ${hill}`);
  const signs = new Set(); for (let d = 0; d < 3000; d += 20) signs.add(Math.sign(curvature(d))); assert.ok(signs.has(1) && signs.has(-1), 'curves go both ways');
});
test('far away the bend stops growing (inside the fog)', () => {
  assert.deepEqual(bendAt(900, 100), bendAt(2000, 100));
});
test('installs into this three.js version: meshes, shadows and sprites all bend; sky can opt out', () => {
  installCurves(THREE, true);
  assert.ok(THREE.ShaderChunk.project_vertex.includes('roadBend'));
  assert.ok(THREE.ShaderChunk.worldpos_vertex.includes('roadBend'));
  assert.ok(THREE.ShaderLib.sprite.vertexShader.includes('roadBend'));
  assert.ok(THREE.ShaderLib.depth.vertexShader.startsWith('#define BEND_SHADOW'));
  assert.ok(THREE.ShaderChunk.common.includes('#ifdef NO_BEND'));
  const m = noBend(new THREE.MeshBasicMaterial()); assert.equal(m.defines.NO_BEND, '');
  installCurves(THREE, true); assert.equal(THREE.ShaderChunk.common.split('vec3 roadBend').length, 2, 'installed only once');
  assert.equal(CURVE_STATE.on, true);
});
