import * as THREE from 'three';
// Bake a clip from one Mixamo rig onto another whose bind pose differs (both in T-pose, same facing).
// World-space delta per bone: tgtWorld = (srcWorld * srcRestWorld^-1) * tgtRestWorld.
export function retargetClip(srcRoot, tgtRoot, clip, fps = 30) {
  const key = n => n.replace(/^mixamorig:?/, ''); const bonesOf = root => { const m = new Map(); root.traverse(o => { if (o.isBone) m.set(key(o.name), o); }); return m; };
  const S = bonesOf(srcRoot), T = bonesOf(tgtRoot);
  const order = []; tgtRoot.traverse(o => { if (o.isBone && S.has(key(o.name))) order.push(o); });
  srcRoot.updateMatrixWorld(true); tgtRoot.updateMatrixWorld(true);
  const restS = new Map(), restT = new Map(), restTlocal = new Map();
  for (const b of order) { restS.set(b.name, S.get(key(b.name)).getWorldQuaternion(new THREE.Quaternion())); restT.set(b.name, b.getWorldQuaternion(new THREE.Quaternion())); restTlocal.set(b.name, { q: b.quaternion.clone(), p: b.position.clone() }); }
  // Match the anatomical rest directions, not just bone coordinate frames.
  // Gentleman is bound with bent, lowered arms; Mixamo sources use a T pose.
  // Without this alignment the bind bend is added to every animated elbow.
  for (const b of order) {
    const source = S.get(key(b.name));
    const child = b.children.find(c => c.isBone && S.has(key(c.name)));
    const sourceChild = child && S.get(key(child.name));
    if (!child || !sourceChild || !/Arm$|Shoulder$/.test(key(b.name))) continue;
    const td = child.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
    const sd = sourceChild.getWorldPosition(new THREE.Vector3()).sub(source.getWorldPosition(new THREE.Vector3())).normalize();
    const align = new THREE.Quaternion().setFromUnitVectors(td, sd);
    restT.set(b.name, align.multiply(restT.get(b.name)));
  }
  const hipName = order[0].name, sH = S.get(key(hipName)), tH = order[0];
  const sHipRest = sH.getWorldPosition(new THREE.Vector3()), tHipRest = tH.getWorldPosition(new THREE.Vector3());
  const ratio = tHipRest.y / Math.max(1e-4, sHipRest.y);
  const mixer = new THREE.AnimationMixer(srcRoot); mixer.clipAction(clip).play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1), times = new Float32Array(frames);
  const qv = new Map(order.map(b => [b.name, new Float32Array(frames * 4)])), pv = new Float32Array(frames * 3);
  const q = new THREE.Quaternion(), pq = new THREE.Quaternion(), w = new THREE.Vector3(), inv = new THREE.Matrix4();
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps); times[f] = t;
    mixer.setTime(t); srcRoot.updateMatrixWorld(true);
    for (const b of order) {
      S.get(key(b.name)).getWorldQuaternion(q);
      q.multiply(restS.get(b.name).clone().invert()).multiply(restT.get(b.name));
      b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(q));
      if (b === tH) {
        sH.getWorldPosition(w).sub(sHipRest).multiplyScalar(ratio); w.x = 0; w.z *= 0.0; w.add(tHipRest);
        b.parent.updateMatrixWorld(true); inv.copy(b.parent.matrixWorld).invert(); b.position.copy(w.applyMatrix4(inv)); pv.set([b.position.x, b.position.y, b.position.z], f * 3);
      }
      b.updateMatrixWorld(true); qv.get(b.name).set([b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], f * 4);
    }
  }
  for (const b of order) { const r = restTlocal.get(b.name); b.quaternion.copy(r.q); b.position.copy(r.p); }
  mixer.stopAllAction(); mixer.uncacheRoot(srcRoot);
  const tracks = order.map(b => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, qv.get(b.name)));
  tracks.push(new THREE.VectorKeyframeTrack(`${tH.name}.position`, times, pv));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
