import * as THREE from 'three';

export const DANCE_STYLES = ['jazz', 'ballet', 'breakdance', 'disco', 'robot', 'shuffle'];

// Bake once per body, share clips across the crowd. All motion stays in place;
// the navigation root remains available for walking and gift camera framing.
export function makeDanceClips(model, idle) {
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(idle).play(); mixer.setTime(0);
  const bones = [];
  model.traverse(b => { if (b.isBone) bones.push(b); });
  const rest = bones.map(b => ({ q: b.quaternion.clone(), p: b.position.clone() }));
  mixer.stopAllAction(); mixer.uncacheRoot(model);
  const clips = {};
  for (const style of DANCE_STYLES) {
    const frames = 121, duration = 4, times = [], values = bones.map(() => []), hips = [];
    const hip = bones.findIndex(b => /Hips$/.test(b.name));
    const height = hip < 0 ? 1 : Math.abs(rest[hip].p.y);
    for (let f = 0; f < frames; f++) {
      const t = f / (frames - 1) * duration, beat = t * Math.PI * 2;
      const s = Math.sin(beat), c = Math.cos(beat), slow = Math.sin(beat / 2);
      times.push(t);
      bones.forEach((b, i) => {
        const name = b.name.replace(/^mixamorig:?/, ''), side = name.startsWith('Left') ? 1 : -1;
        let x = 0, y = 0, z = 0;
        const arm = /^(Left|Right)Arm$/.test(name), fore = /ForeArm$/.test(name);
        const thigh = /UpLeg$/.test(name), shin = /^(Left|Right)Leg$/.test(name);
        if (name === 'Hips') { y = 0.12 * slow; z = 0.08 * s; }
        if (/^Spine/.test(name)) { x = 0.04 * c; z = 0.05 * s; }
        if (style === 'jazz') {
          if (arm) { x = 0.45 * side * s; z = side * (0.45 + 0.35 * c); }
          if (fore) x = -0.35 - 0.3 * s;
          if (thigh) { x = side * 0.35 * s; z = side * 0.12; }
          if (shin) x = 0.35 * Math.max(0, side * s);
        } else if (style === 'ballet') {
          if (arm) { z = side * (1.05 + 0.35 * slow); x = -0.2; }
          if (fore) x = -0.3;
          if (thigh) { x = side * 0.3 * slow; z = side * (0.16 + 0.18 * (1 + c)); }
          if (shin) x = 0.18 * (1 - c);
          if (name === 'Hips') y = 0.7 * slow;
        } else if (style === 'breakdance') {
          // Top-rock into a low alternating footwork / freeze phrase.
          const low = (1 - Math.cos(beat / 2)) / 2;
          if (name === 'Hips') { x = -0.25 * low; y = 0.65 * slow; z = 0.2 * s; }
          if (arm) { x = side * 0.65 * s; z = side * (0.5 + 0.35 * c); }
          if (fore) x = -0.7 - 0.35 * side * c;
          if (thigh) x = -0.65 * low + side * 0.35 * s;
          if (shin) x = 1.1 * low + 0.25 * Math.max(0, side * s);
        } else if (style === 'disco') {
          if (arm) { z = side * (0.65 + 0.65 * side * slow); x = 0.3 * c; }
          if (fore) x = -0.4 + 0.25 * c;
          if (thigh) x = 0.25 * side * s;
          if (name === 'Hips') z = 0.17 * s;
        } else if (style === 'robot') {
          const lock = Math.tanh(5 * s);
          if (arm) { x = side * 0.32 * lock; z = side * 0.5; }
          if (fore) x = -0.95 + side * 0.4 * Math.tanh(5 * c);
          if (name === 'Head') y = 0.25 * lock;
          if (thigh) x = side * 0.16 * lock;
        } else {
          if (thigh) x = side * 0.5 * s;
          if (shin) x = 0.6 * Math.max(0, -side * s);
          if (/Foot$/.test(name)) x = 0.2 * side * c;
          if (arm) x = -side * 0.35 * s;
          if (fore) x = -0.35;
        }
        const q = rest[i].q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
        values[i].push(q.x, q.y, q.z, q.w);
      });
      if (hip >= 0) {
        const p = rest[hip].p;
        const dip = style === 'breakdance' ? -0.16 * (1 - Math.cos(beat / 2)) : 0.018 * (1 - c);
        hips.push(p.x, p.y + height * dip, p.z);
      }
    }
    const tracks = bones.map((b, i) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values[i]));
    if (hip >= 0) tracks.push(new THREE.VectorKeyframeTrack(`${bones[hip].name}.position`, times, hips));
    clips[style] = new THREE.AnimationClip(style, duration, tracks);
  }
  return clips;
}
