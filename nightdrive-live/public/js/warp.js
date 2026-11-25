// Curved-city warp. The simulation still drives on its exact grid route, but
// everything is drawn through one smooth, fold-free map of the plane, so every
// avenue bends left and right like a real city instead of running ruler-straight.
// The same function runs in JS (camera, cars, minimap) and in every shader.
//
// dx(X,Z) mostly depends on Z, so north-south avenues snake sideways.
// dz(X,Z) mostly depends on X, so east-west streets snake too.
// Largest slope sum stays below 0.29 per axis, so the Jacobian determinant is
// always > 0.78: no folds, objects that do not touch never touch after the warp.
export const WARP_TERMS = {
  // [amplitude, kz, kx, phase] for dx;   dx += a*sin(Z*kz + X*kx + phase)
  x: [[12, 1 / 62, 1 / 333, .3], [30, 1 / 560, 0, 1.1], [5, 1 / 150, 1 / 150, .7]],
  // [amplitude, kx, kz, phase] for dz;   dz += a*sin(X*kx + Z*kz + phase)
  z: [[12, 1 / 64, 1 / 310, 2.0], [30, 1 / 590, 0, 4.2], [5, 1 / 155, -1 / 155, 2.9]],
};
const TAU = Math.PI * 2;

// Absolute world point -> absolute warped point.
export function warpPoint(X, Z, out = {x: 0, z: 0}) {
  let dx = 0, dz = 0;
  for (const [a, kz, kx, ph] of WARP_TERMS.x) dx += a * Math.sin(Z * kz + X * kx + ph);
  for (const [a, kx, kz, ph] of WARP_TERMS.z) dz += a * Math.sin(X * kx + Z * kz + ph);
  out.x = X + dx; out.z = Z + dz; return out;
}

// Jacobian of the warp at an absolute point: [[dX'/dX, dX'/dZ],[dZ'/dX, dZ'/dZ]].
export function warpJacobian(X, Z) {
  let xx = 1, xz = 0, zx = 0, zz = 1;
  for (const [a, kz, kx, ph] of WARP_TERMS.x) { const c = a * Math.cos(Z * kz + X * kx + ph); xx += c * kx; xz += c * kz; }
  for (const [a, kx, kz, ph] of WARP_TERMS.z) { const c = a * Math.cos(X * kx + Z * kz + ph); zx += c * kx; zz += c * kz; }
  return {xx, xz, zx, zz, det: xx * zz - xz * zx};
}

// Heading convention matches route.sample(): forward = (-sin h, -cos h).
export function warpHeading(X, Z, heading) {
  const j = warpJacobian(X, Z), fx = -Math.sin(heading), fz = -Math.cos(heading);
  const wx = j.xx * fx + j.xz * fz, wz = j.zx * fx + j.zz * fz;
  return Math.atan2(-wx, -wz);
}

// Full pose: warped absolute position, heading and unit forward vector.
export function warpPose(X, Z, heading) {
  const p = warpPoint(X, Z), h = warpHeading(X, Z, heading);
  return {x: p.x, z: p.z, heading: h, dx: -Math.sin(h), dz: -Math.cos(h)};
}

// Shader phases for a floating origin. Each sin argument is evaluated in the
// shader as local.z*kz + local.x*kx + phase, and phase absorbs the origin in
// double precision, so float32 shaders stay exact far from the start.
export function warpPhases(ox, oz) {
  const px = WARP_TERMS.x.map(([, kz, kx, ph]) => ((oz * kz + ox * kx + ph) % TAU + TAU) % TAU);
  const pz = WARP_TERMS.z.map(([, kx, kz, ph]) => ((ox * kx + oz * kz + ph) % TAU + TAU) % TAU);
  return {px, pz};
}

// GLSL used by every material. Constants are baked in; only phases are uniforms.
export function warpGLSL() {
  const f = v => { const s = String(+v.toFixed(9)); return s.includes('.') || s.includes('e') ? s : s + '.0'; };
  const xs = WARP_TERMS.x.map(([a, kz, kx], i) => `${f(a)}*sin(p.z*${f(kz)}+p.x*${f(kx)}+warpPhaseX[${i}])`).join('+');
  const zs = WARP_TERMS.z.map(([a, kx, kz], i) => `${f(a)}*sin(p.x*${f(kx)}+p.z*${f(kz)}+warpPhaseZ[${i}])`).join('+');
  return `uniform float warpPhaseX[3];\nuniform float warpPhaseZ[3];\nvec3 warpPos(vec3 p){return vec3(p.x+${xs},p.y,p.z+${zs});}\n`;
}
