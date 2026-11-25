// CURBE + DEALURI pentru TURBOSTRADA
// Jocul (benzi, distante, obstacole, matematica corecta pentru toti) ramane pe o banda dreapta: (d = metri, x = banda).
// IMAGINEA se indoaie: fiecare punct al lumii e mutat lateral (curbe) si pe verticala (dealuri) in shader,
// in functie de cat de departe e in fata camerei. Sub camera drumul e mereu drept si plat; in fata se vad curbele,
// exact ca in jocurile runner moderne. Aceeasi formula e folosita pentru radar (stil GTA) si pentru indicatoarele de curba.
//
// Linia de mijloc a drumului: X(d) = suma A·sin(d/L + φ) (curbe), Y(d) = suma A·sin(d/L + φ) (dealuri).
// Curbura X''(d) = -suma A/L²·sin(...): raza minima ≈ 1/(suma A/L²) ≈ 170 m – curbe vizibile din camera de sus.
// Fata de camera (distanta dc): offset(d) = X(d) - X(dc) - X'(dc)·(d - dc)  → zero si fara unghi chiar sub camera.

export const BEND_H = [[30, 110, 0.4], [10, 64, 2.1], [40, 190, 4.0]];  // [A metri, L metri/radian, faza]
export const BEND_V = [[2.2, 75, 1.3], [1.0, 41, 0.2]];
export const BEND_NEAR = -60, BEND_FAR = 320; // dincolo de 320 m (in ceata) offsetul ramane constant
export const SHADOW_BACK = 18;                // lumina cu umbre sta la 18 m in spatele camerei (vezi key.position in game.js)

const sum = (T, d, f) => T.reduce((s, [A, L, P]) => s + f(A, L, d / L + P), 0);
export const X = d => sum(BEND_H, d, (A, L, a) => A * Math.sin(a));
export const dX = d => sum(BEND_H, d, (A, L, a) => A / L * Math.cos(a));
export const ddX = d => sum(BEND_H, d, (A, L, a) => -A / (L * L) * Math.sin(a));
export const Y = d => sum(BEND_V, d, (A, L, a) => A * Math.sin(a));
export const dY = d => sum(BEND_V, d, (A, L, a) => A / L * Math.cos(a));
export const CURVE_STATE = { on: true };

// cat e mutat un punct aflat la distanta d, vazut din camera aflata la distanta dc (metri pe pista)
export function bendAt(d, dc) {
  if (!CURVE_STATE.on) return { x: 0, y: 0 };
  const dd = Math.min(BEND_FAR, Math.max(BEND_NEAR, d - dc)), de = dc + dd;
  return { x: X(de) - X(dc) - dX(dc) * dd, y: Y(de) - Y(dc) - dY(dc) * dd };
}
// curbura (1/raza): > 0 = curba la dreapta, < 0 = curba la stanga (privind inainte)
export const curvature = d => ddX(d);
export const curveRadius = d => 1 / Math.max(1e-6, Math.abs(ddX(d)));

const f = n => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const glslSum = (T, kind) => T.map(([A, L, P]) => kind === 'v' ? `${f(A)}*sin(d/${f(L)}+${f(P)})` : `${f(A / L)}*cos(d/${f(L)}+${f(P)})`).join('+');

// instaleaza indoirea in TOATE materialele three.js (inainte de prima randare)
export function installCurves(THREE, enabled = true) {
  CURVE_STATE.on = enabled;
  if (!enabled || THREE.ShaderChunk.__curves) return;
  THREE.ShaderChunk.__curves = true;
  const fn = `
float roadBX(float d){ return ${glslSum(BEND_H, 'v')}; }
float roadBDX(float d){ return ${glslSum(BEND_H, 'd')}; }
float roadBY(float d){ return ${glslSum(BEND_V, 'v')}; }
float roadBDY(float d){ return ${glslSum(BEND_V, 'd')}; }
vec3 roadBend(vec3 w){
#ifdef NO_BEND
  return vec3(0.0);
#else
  #ifdef BEND_SHADOW
    float dc = -(cameraPosition.z - ${f(SHADOW_BACK)});
  #else
    float dc = -cameraPosition.z;
  #endif
  float dd = clamp(-w.z - dc, ${f(BEND_NEAR)}, ${f(BEND_FAR)}), de = dc + dd;
  return vec3(roadBX(de) - roadBX(dc) - roadBDX(dc) * dd, roadBY(de) - roadBY(dc) - roadBDY(dc) * dd, 0.0);
#endif
}
`;
  const C = THREE.ShaderChunk;
  C.common += fn;
  C.project_vertex = C.project_vertex.replace('mvPosition = modelViewMatrix * mvPosition;',
    'mvPosition = modelMatrix * mvPosition; mvPosition.xyz += roadBend(mvPosition.xyz); mvPosition = viewMatrix * mvPosition;');
  C.worldpos_vertex = C.worldpos_vertex.replace('worldPosition = modelMatrix * worldPosition;',
    'worldPosition = modelMatrix * worldPosition; worldPosition.xyz += roadBend(worldPosition.xyz);');
  const L = THREE.ShaderLib;
  L.sprite.vertexShader = L.sprite.vertexShader.replace('vec4 mvPosition = modelViewMatrix[ 3 ];',
    'vec4 mvPosition = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ); mvPosition.xyz += roadBend(mvPosition.xyz); mvPosition = viewMatrix * mvPosition;');
  for (const k of ['depth', 'distance']) if (L[k]) L[k].vertexShader = '#define BEND_SHADOW\n' + L[k].vertexShader;
  if (!C.project_vertex.includes('roadBend') || !C.worldpos_vertex.includes('roadBend') || !L.sprite.vertexShader.includes('roadBend')) console.warn('curbe: shader three.js necunoscut, drumul ramane drept');
}
// materiale care nu se indoaie (orizontul, soarele: sunt "la infinit")
export function noBend(material) { material.defines = { ...(material.defines || {}), NO_BEND: '' }; material.needsUpdate = true; return material; }
