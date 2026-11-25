import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCast, Person, Crowd } from '../public/js/people.js';

// Keep actual meshes, skins, bind matrices and animations; omit browser textures.
async function loadBody(name) {
  const raw = await fs.readFile(new URL(`../public/assets/models/${name}.glb`, import.meta.url));
  const size = raw.readUInt32LE(12);
  const json = JSON.parse(raw.subarray(20, 20 + size));
  delete json.images; delete json.textures; delete json.materials;
  for (const mesh of json.meshes) for (const p of mesh.primitives) delete p.material;
  let data = Buffer.from(JSON.stringify(json));
  data = Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4, 32)]);
  const bin = raw.subarray(20 + size), out = Buffer.alloc(20 + data.length + bin.length);
  raw.copy(out, 0, 0, 12); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(data.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
  data.copy(out, 20); bin.copy(out, 20 + data.length);
  return new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset, out.byteOffset + out.length), '');
}

test('all real character rigs walk and settle for a gift portrait', async () => {
  const original = GLTFLoader.prototype.loadAsync;
  GLTFLoader.prototype.loadAsync = url => loadBody(url.split('/').pop().replace('.glb', ''));
  let cast;
  try { cast = await loadCast(); } finally { GLTFLoader.prototype.loadAsync = original; }
  const crowd = new Crowd(new THREE.Scene(), { places: {}, obstacles: [] }, cast, {});
  for (const kind of Object.keys(cast)) {
    const p = new Person(cast, kind);
    for (const style of ['idle', 'walk']) {
      const clip = cast[kind].clips[style];
      assert.ok(clip.duration > 0);
      assert.ok(clip.tracks.every(track => [...track.values].every(Number.isFinite)));
      p.play(style, 0); p.mixer.update(0.4);
      assert.equal(p.current.getClip(), clip);
    }
    assert.equal(p.actions.jazz, undefined);
    crowd.pose(p, 4); assert.equal(p.state, 'pose'); assert.equal(p.currentName, 'idle');
  }
});
