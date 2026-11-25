// Procedural hill terrain: a smooth height field (metres, y up) plus obstacle bumps and pickups.
import { clamp } from './rules.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1-D value noise with smooth (cosine) interpolation.
function valueNoise(rand, count) {
  const pts = Array.from({ length: count + 2 }, () => rand() * 2 - 1);
  return x => {
    const i = Math.floor(x), f = x - i;
    const a = pts[clamp(i, 0, count + 1)], b = pts[clamp(i + 1, 0, count + 1)];
    const u = (1 - Math.cos(f * Math.PI)) / 2;
    return a + (b - a) * u;
  };
}

const smooth = t => t * t * (3 - 2 * t);

export class Terrain {
  constructor(cfg) {
    this.cfg = cfg;
    const rand = mulberry32(cfg.seed);
    const rough = cfg.rough;
    this.step = 0.5;
    this.start = -60;
    this.finish = cfg.length;
    const end = cfg.length + 120;
    const n = Math.ceil((end - this.start) / this.step) + 1;
    const big = valueNoise(rand, Math.ceil(end / 160) + 4);
    const mid = valueNoise(rand, Math.ceil(end / 42) + 4);
    const small = valueNoise(rand, Math.ceil(end / 11) + 4);
    const trend = (rand() < 0.5 ? -1 : 1) * (0.02 + 0.04 * rand()); // overall uphill or downhill drift
    const h = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = this.start + i * this.step;
      const xs = Math.max(0, x);
      let y = 34 * big(xs / 160) * (0.6 + 0.4 * rough)
            + 9 * mid(xs / 42) * (0.35 + 0.65 * rough)
            + 1.4 * small(xs / 11) * rough
            + trend * xs * Math.sin(xs / 260);
      // flat launch pad and a flat finish plateau
      const wStart = smooth(clamp((x - 18) / 30, 0, 1));
      y *= wStart;
      h[i] = y;
    }
    // Limit slope AND curvature: work on the per-sample slope array, then integrate back to heights.
    // Slope ≤ maxSlope (L1 ≈ 25°, hardest ≈ 40°); curvature radius ≥ minRadius so valleys are drivable.
    const maxSlope = 0.5 + 0.42 * rough;   // L1 ≈ 31°, hardest ≈ 43° (ledges add 80° faces)
    const minRadius = 28 - 12 * rough;
    const dMax = this.step / minRadius;
    const sl = new Float64Array(n);
    for (let i = 1; i < n; i++) sl[i] = clamp((h[i] - h[i - 1]) / this.step, -maxSlope, maxSlope);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 2; i < n; i++) sl[i] = clamp(sl[i], sl[i - 1] - dMax, sl[i - 1] + dMax);
      for (let i = n - 2; i >= 1; i--) sl[i] = clamp(sl[i], sl[i + 1] - dMax, sl[i + 1] + dMax);
    }
    const startIdx = Math.round(-this.start / this.step);
    for (let i = 0; i <= startIdx; i++) sl[i] = 0;   // keep the launch pad flat
    for (let i = 1; i < n; i++) h[i] = h[i - 1] + sl[i] * this.step;
    // finish plateau: ease the last 40 m into flat ground
    const fi = Math.round((this.finish - this.start) / this.step);
    const ease = Math.round(40 / this.step);
    for (let i = fi - ease; i < n; i++) {
      const k = clamp((i - (fi - ease)) / ease, 0, 1);
      sl[i] *= 1 - smooth(k);
      h[i] = h[i - 1] + sl[i] * this.step;
    }
    this.h = h;
    this.n = n;

    // ---- features: rocks, logs, 80° ledges, rock staircases, cliff drops and traps ----
    this.obstacles = [];   // bumps: rock / log  {x, type, h, w}
    this.steps = [];       // ledges & drops: {x, w, H}  (H > 0 up, H < 0 down) — cumulative height change
    this.zones = [];       // traps: {x0, x1, type: 'mud'|'ice', grip}
    const snowy = cfg.biome.id === 'snow';
    const cps = [];
    for (let c = cfg.checkpointEvery; c < this.finish; c += cfg.checkpointEvery) cps.push(c);
    const nearCp = (a, b) => cps.some(c => b > c - 8 && a < c + 16);
    const R = () => rand();
    const rock = (x, hmax) => this.obstacles.push({ x, type: 'rock', h: 0.4 + R() * (hmax - 0.4), w: 1.0 + R() * 0.8, seed: (R() * 1e9) | 0 });
    const ledge = (x, H) => this.steps.push({ x, H, w: Math.abs(H) * (H > 0 ? 0.26 : 0.3), seed: (R() * 1e9) | 0 });
    let x = 60;
    while (true) {
      x += cfg.featureEvery * (0.6 + 0.8 * R());
      if (x >= this.finish - 40) break;
      const lvl = cfg.level;
      let pick = R();
      if (lvl < 2 && pick >= 0.5 && pick < 0.74) pick = pick < 0.62 ? 0.1 : 0.95;   // level 1: rocks instead of staircases / cliffs
      let span = 4;
      if (pick < 0.2) { span = 3; if (!nearCp(x - 2, x + span)) rock(x, 0.6 + 0.6 * rough); }
      else if (pick < 0.33) { const r = 0.25 + R() * (0.12 + 0.12 * rough); span = 2; if (!nearCp(x - 2, x + 2)) this.obstacles.push({ x, type: 'log', h: r * 2, w: r * 1.9, r, seed: (R() * 1e9) | 0 }); }
      else if (pick < 0.5) { span = 3; if (!nearCp(x - 2, x + 3)) ledge(x, 0.35 + R() * (0.15 + 0.6 * rough)); }
      else if (pick < 0.64 && lvl >= 2) {
        // rock staircase up the mountain
        const n = 3 + Math.floor(R() * (1 + 3 * rough)), gap = 2.6 + R() * 1.4;
        span = n * gap + 2;
        if (!nearCp(x - 2, x + span)) for (let i = 0; i < n; i++) ledge(x + i * gap, 0.3 + R() * (0.12 + 0.35 * rough));
      }
      else if (pick < 0.74 && lvl >= 2) { span = 3; if (!nearCp(x - 3, x + 6)) ledge(x, -(0.6 + R() * (0.5 + 0.7 * rough))); }
      else if (pick < 0.86) {
        const len = 6 + R() * 7; span = len + 2;
        if (!nearCp(x - 2, x + len)) this.zones.push({ x0: x, x1: x + len, type: snowy ? 'ice' : 'mud', grip: snowy ? 0.35 : 0.5 });
      } else {
        // boulder garden
        span = 6;
        if (!nearCp(x - 2, x + 6)) { rock(x, 0.55 + 0.4 * rough); rock(x + 1.8 + R() * 0.6, 0.5 + 0.35 * rough); rock(x + 3.8 + R() * 0.8, 0.55 + 0.4 * rough); }
      }
      x += span;
    }
    this.obstacles.sort((a, b) => a.x - b.x);
    this.steps.sort((a, b) => a.x - b.x);
    this.stepCum = [];
    let cum = 0;
    for (const st of this.steps) { this.stepCum.push(cum); cum += st.H; }

    // pickups
    const busy = (px, d) => this.obstacleNear(px, d) || this.steps.some(st => Math.abs(st.x - px) < d + 1) || this.zones.some(z => px > z.x0 - d && px < z.x1 + d);
    this.pickups = [];
    for (let c = 40; c < this.finish - 15; c += 22 + rand() * 16) {
      if (busy(c, 4) || busy(c + 6, 2)) continue;
      for (let k = 0; k < 5; k++) {
        const px = c + k * 1.4;
        this.pickups.push({ x: px, y: this.height(px) + 1.6 + Math.sin((k / 4) * Math.PI) * 0.7, type: 'coin', taken: false });
      }
    }
    for (let f = 160; f < this.finish - 30; f += 170) {
      let fx = f; while (busy(fx, 3) && fx < f + 40) fx += 3;
      this.pickups.push({ x: fx, y: this.height(fx) + 1.1, type: 'fuel', taken: false });
    }
    this.pickups.sort((a, b) => a.x - b.x);
    this.checkpoints = cps;
  }

  // cumulative ledge / drop offset (smoothstep faces ≈ 80° up, ≈ 79° down)
  stepAt(x) {
    const st = this.steps;
    let lo = 0, hi = st.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (st[m].x <= x) lo = m + 1; else hi = m; }
    const i = lo - 1;
    if (i < 0) return 0;
    const s = st[i], u = clamp((x - s.x) / s.w, 0, 1);
    return this.stepCum[i] + s.H * smooth(u);
  }

  zoneAt(x) {
    for (const z of this.zones) if (x >= z.x0 && x <= z.x1) return z;
    return null;
  }
  gripAt(x) { const z = this.zoneAt(x); return z ? z.grip : 1; }
  dip(x) { const z = this.zoneAt(x); return z && z.type === 'mud' ? -0.22 * Math.sin(Math.PI * (x - z.x0) / (z.x1 - z.x0)) : 0; }

  obstacleNear(x, d) { return this.obstacles.some(o => Math.abs(o.x - x) < d + o.w); }

  // Smooth ground without obstacles (Catmull-Rom over the samples).
  base(x) {
    const f = (x - this.start) / this.step;
    if (f <= 1) return this.h[0];
    if (f >= this.n - 2) return this.h[this.n - 1];
    const i = Math.floor(f), t = f - i;
    const p0 = this.h[i - 1], p1 = this.h[i], p2 = this.h[i + 1], p3 = this.h[i + 2];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }

  bump(x) {
    let y = 0;
    const obs = this.obstacles;
    // binary search for first obstacle with o.x >= x - 2
    let lo = 0, hi = obs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (obs[m].x < x - 2) lo = m + 1; else hi = m; }
    for (let i = lo; i < obs.length && obs[i].x < x + 2; i++) {
      const o = obs[i], u = (x - o.x) / o.w;
      if (u <= -1 || u >= 1) continue;
      const v = o.type === 'log' ? (1 - u * u) ** 0.6 : Math.cos(u * Math.PI / 2) ** 1.4;
      y = Math.max(y, o.h * v);
    }
    return y;
  }

  ground(x) { return this.base(x) + this.stepAt(x) + this.dip(x); }   // without rocks/logs
  height(x) { return this.ground(x) + this.bump(x); }
  slope(x) { return (this.height(x + 0.03) - this.height(x - 0.03)) / 0.06; }
  normal(x) { const s = this.slope(x), l = Math.hypot(1, s); return [-s / l, 1 / l]; }
}
