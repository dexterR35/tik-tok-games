// Prism Rush level roadmap for a tap-driven LIVE game. Pure and deterministic:
// the server, hosted demo, tests and the calibration tool build identical
// levels from a number. Every viewer tap is one random legal move; there is
// no move limit and no autopilot, so a level ends only when its goals are met.
import { Engine, COLS, ROWS, SIZE, COLORS, resolve, scoreWave, addTally, emptyTally, matches, moves } from './engine.js';

export const COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
export const WORLDS = Object.freeze([
  { name: 'Crystal Meadow', accent: '#a3ffce' }, { name: 'Nova Caverns', accent: '#ffb671' },
  { name: 'Prism Peaks', accent: '#eb8fff' }, { name: 'Supernova Sky', accent: '#ffdb77' },
  { name: 'Ruby Rapids', accent: '#ff7a9c' }, { name: 'Glacier Gate', accent: '#8fd8ff' },
  { name: 'Amber Dunes', accent: '#ffc46b' }, { name: 'Jade Jungle', accent: '#7ff0a8' },
  { name: 'Violet Vault', accent: '#c59cff' }, { name: 'Diamond Crown', accent: '#f2f6ff' },
].map((w, i) => ({ ...w, from: i * 15 + 1 })));
export const LEVELS_PER_WORLD = 15, DESIGNED_LEVELS = WORLDS.length * LEVELS_PER_WORLD;
// Measured random-tap rates in step mode (one tap = one swap, one wave,
// calm refill; tools/calibrate-levels.mjs): per tap ~3.85 gems cleared,
// ~0.64 gems of each color, ~0.061 beams, ~0.014 novas and ~66 points (tap
// points are a quarter of the wave score).
export const TAP_RATE = Object.freeze({ color: .64, points: 66, beam: .061, nova: .014 });

// Ice patterns: cell -> number of layers. Each layer needs one hit.
const PATTERNS = {
  center: (x, y) => x >= 2 && x <= 4 && y >= 3 && y <= 4,
  band: (x, y) => y === 4 || y === 5,
  ring: (x, y) => x >= 1 && x <= 5 && y >= 1 && y <= 6 && (x === 1 || x === 5 || y === 1 || y === 6),
  bottom: (x, y) => y >= 6,
  cross: (x, y) => x === 3 || y === 4,
  diamond: (x, y) => Math.abs(x - 3) + Math.abs(y - 3.5) <= 2.5,
  columns: x => x === 1 || x === 5,
  frame: (x, y) => x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1,
  corners: (x, y) => (x <= 1 || x >= 5) && (y <= 1 || y >= 6),
  checker: (x, y) => (x + y) % 2 === 0 && x >= 1 && x <= 5 && y >= 1 && y <= 6,
  top: (x, y) => y <= 2,
};
export const PATTERN_ORDER = ['center', 'band', 'cross', 'diamond', 'columns', 'ring', 'checker', 'top'];
export function icePattern(name, layers = 1, coreLayers = layers) {
  const test = PATTERNS[name] || PATTERNS.center;
  return Array.from({ length: SIZE }, (_, i) => {
    const x = i % COLS, y = Math.floor(i / COLS);
    if (!test(x, y)) return 0;
    return Math.abs(x - 3) <= 1 && Math.abs(y - 3.5) <= 1.5 ? coreLayers : layers;
  });
}

// Fifteen-level world rhythm. Every fifth level is a hard level (skull) with
// combined goals and about 30% more taps.
const RHYTHM = [
  ['score'], ['collect1'], ['ice', 'score'], ['collect2'], ['ice', 'collect1'],
  ['power-beam', 'score'], ['ice', 'collect1'], ['collect1', 'power-nova'], ['score', 'collect1'], ['ice', 'collect2'],
  ['collect2'], ['ice', 'score'], ['power-beam', 'collect1'], ['collect3'], ['ice', 'collect2', 'power-nova'],
];

// Tap pars measured by tools/calibrate-levels.mjs (random taps, no gifts):
// [threeStarTaps (p25), twoStarTaps (p60), medianTaps, p90Taps]
// CALIBRATION-START
export const CALIBRATION = [
  [43, 51, 47, 58], // 1
  [59, 68, 63, 73], // 2
  [57, 63, 61, 121], // 3
  [65, 81, 80, 100], // 4
  [90, 116, 102, 216], // 5
  [71, 79, 77, 88], // 6
  [77, 94, 84, 109], // 7
  [100, 112, 111, 138], // 8
  [87, 94, 91, 107], // 9
  [122, 135, 135, 140], // 10
  [131, 145, 135, 155], // 11
  [108, 114, 112, 121], // 12
  [121, 126, 125, 142], // 13
  [155, 162, 157, 168], // 14
  [138, 154, 154, 189], // 15
  [168, 181, 175, 186], // 16
  [185, 197, 190, 224], // 17
  [150, 158, 157, 165], // 18
  [197, 220, 208, 235], // 19
  [210, 232, 222, 243], // 20
  [156, 187, 175, 210], // 21
  [170, 190, 187, 204], // 22
  [189, 206, 203, 229], // 23
  [199, 213, 210, 217], // 24
  [257, 275, 273, 282], // 25
  [258, 282, 279, 300], // 26
  [206, 219, 213, 229], // 27
  [224, 247, 234, 269], // 28
  [273, 290, 287, 297], // 29
  [247, 278, 265, 640], // 30
  [293, 312, 310, 331], // 31
  [308, 339, 332, 362], // 32
  [256, 265, 265, 284], // 33
  [334, 347, 339, 358], // 34
  [333, 360, 356, 385], // 35
  [271, 291, 287, 319], // 36
  [262, 298, 291, 317], // 37
  [296, 325, 313, 355], // 38
  [300, 310, 305, 341], // 39
  [389, 402, 396, 416], // 40
  [378, 398, 390, 410], // 41
  [305, 323, 316, 338], // 42
  [346, 365, 353, 425], // 43
  [380, 399, 397, 429], // 44
  [352, 375, 372, 496], // 45
  [406, 434, 426, 447], // 46
  [437, 465, 455, 487], // 47
  [342, 361, 352, 398], // 48
  [445, 473, 468, 502], // 49
  [500, 520, 510, 560], // 50
  [376, 387, 386, 466], // 51
  [393, 416, 412, 457], // 52
  [385, 423, 406, 550], // 53
  [406, 428, 421, 476], // 54
  [512, 535, 530, 548], // 55
  [520, 527, 522, 562], // 56
  [402, 428, 423, 447], // 57
  [460, 487, 469, 601], // 58
  [504, 520, 514, 545], // 59
  [447, 489, 481, 742], // 60
  [535, 566, 560, 586], // 61
  [565, 601, 581, 637], // 62
  [457, 473, 468, 490], // 63
  [579, 595, 588, 650], // 64
  [619, 662, 653, 688], // 65
  [487, 502, 491, 563], // 66
  [484, 510, 501, 527], // 67
  [499, 537, 531, 914], // 68
  [504, 534, 529, 560], // 69
  [646, 674, 670, 724], // 70
  [625, 659, 649, 692], // 71
  [499, 525, 513, 541], // 72
  [552, 572, 569, 764], // 73
  [612, 648, 638, 689], // 74
  [553, 598, 587, 663], // 75
  [674, 698, 694, 731], // 76
  [691, 740, 732, 768], // 77
  [539, 568, 566, 600], // 78
  [698, 705, 701, 746], // 79
  [766, 796, 786, 818], // 80
  [562, 622, 586, 746], // 81
  [609, 631, 628, 658], // 82
  [612, 674, 660, 747], // 83
  [628, 650, 635, 692], // 84
  [786, 813, 805, 840], // 85
  [767, 796, 783, 844], // 86
  [589, 625, 620, 652], // 87
  [646, 683, 665, 793], // 88
  [736, 765, 760, 790], // 89
  [680, 726, 704, 1070], // 90
  [790, 828, 808, 851], // 91
  [854, 868, 863, 916], // 92
  [660, 676, 672, 690], // 93
  [832, 865, 855, 887], // 94
  [887, 943, 910, 992], // 95
  [681, 758, 724, 853], // 96
  [700, 744, 740, 813], // 97
  [700, 756, 747, 882], // 98
  [735, 751, 743, 789], // 99
  [916, 951, 941, 979], // 100
  [875, 905, 904, 939], // 101
  [707, 730, 718, 775], // 102
  [721, 801, 778, 880], // 103
  [865, 879, 878, 899], // 104
  [773, 797, 791, 1486], // 105
  [930, 958, 950, 972], // 106
  [964, 999, 994, 1048], // 107
  [740, 776, 770, 791], // 108
  [959, 1003, 992, 1040], // 109
  [1014, 1068, 1057, 1103], // 110
  [786, 825, 809, 962], // 111
  [814, 843, 831, 875], // 112
  [832, 883, 848, 1024], // 113
  [821, 847, 834, 914], // 114
  [1048, 1080, 1072, 1107], // 115
  [1020, 1045, 1041, 1074], // 116
  [819, 839, 829, 882], // 117
  [826, 876, 861, 1006], // 118
  [964, 987, 982, 1037], // 119
  [914, 999, 963, 1318], // 120
  [1060, 1086, 1078, 1096], // 121
  [1103, 1128, 1119, 1150], // 122
  [839, 859, 855, 884], // 123
  [1083, 1121, 1117, 1149], // 124
  [1154, 1226, 1210, 1251], // 125
  [879, 919, 901, 1005], // 126
  [906, 930, 922, 984], // 127
  [938, 976, 969, 1047], // 128
  [916, 945, 934, 985], // 129
  [1165, 1209, 1188, 1241], // 130
  [1120, 1170, 1155, 1199], // 131
  [898, 947, 930, 979], // 132
  [967, 997, 988, 1062], // 133
  [1075, 1109, 1097, 1160], // 134
  [1003, 1041, 1028, 1344], // 135
  [1183, 1214, 1196, 1247], // 136
  [1250, 1293, 1286, 1325], // 137
  [956, 988, 985, 1050], // 138
  [1192, 1221, 1208, 1256], // 139
  [1289, 1357, 1345, 1403], // 140
  [985, 1078, 1040, 1154], // 141
  [995, 1039, 1020, 1116], // 142
  [1046, 1145, 1069, 1305], // 143
  [1022, 1061, 1058, 1136], // 144
  [1317, 1338, 1332, 1380], // 145
  [1249, 1284, 1262, 1328], // 146
  [1007, 1032, 1021, 1063], // 147
  [1064, 1105, 1099, 1149], // 148
  [1233, 1256, 1250, 1301], // 149
  [1071, 1128, 1090, 1442], // 150
];
// CALIBRATION-END

const round = (n, step) => Math.max(step, Math.round(n / step) * step);
export function worldOf(n) { const w = Math.min(WORLDS.length - 1, Math.floor((Math.max(1, n) - 1) / LEVELS_PER_WORLD) % WORLDS.length); return { index: w, ...WORLDS[w] }; }
// After the designed levels, the last five worlds replay as an endless encore.
export const designedIndex = n => n <= DESIGNED_LEVELS ? n : DESIGNED_LEVELS - 74 + ((n - DESIGNED_LEVELS - 1) % 75);

// Intended length in taps: 50 on level 1, +9 per level (about 1,390 on
// level 150), +30% on hard levels. Goal sizes = measured rate x taps x share.
export const paceFor = (d, hard) => Math.round((50 + 9 * (d - 1)) * (hard ? 1.3 : 1));
export function levelTemplate(n) {
  n = Math.max(1, Math.floor(n) || 1);
  const d = designedIndex(n), w = Math.floor((d - 1) / LEVELS_PER_WORLD), i = (d - 1) % LEVELS_PER_WORLD;
  const hard = (i + 1) % 5 === 0, kinds = RHYTHM[i], pace = paceFor(d, hard);
  const share = kinds.length === 1 ? 1 : kinds.length === 2 ? .8 : .65;
  const goals = [], used = new Set();
  const color = k => { let c = (d * 5 + k * 2) % COLORS; while (used.has(c)) c = (c + 1) % COLORS; used.add(c); return c; };
  let ice = Array(SIZE).fill(0), pattern = null;
  for (const kind of kinds) {
    if (kind === 'score') goals.push({ type: 'score', target: round(TAP_RATE.points * pace * share * .95, 500) });
    if (kind.startsWith('collect')) {
      const count = Number(kind.at(-1));
      for (let k = 0; k < count; k++) goals.push({ type: 'collect', color: color(k), target: round(TAP_RATE.color * pace * share * (1 - .06 * (count - 1)), 5) });
    }
    if (kind === 'ice') {
      pattern = PATTERN_ORDER[(d * 4 + w) % PATTERN_ORDER.length];
      const layers = Math.min(3, 1 + Math.floor(w / 3) + (hard ? 1 : 0)), core = Math.min(3, layers + (w >= 4 ? 1 : 0));
      ice = icePattern(pattern, layers, core);
      goals.push({ type: 'ice', target: ice.reduce((a, b) => a + b, 0), pattern });
    }
    if (kind.startsWith('power')) {
      const kindName = kind.slice(6);
      goals.push({ type: 'power', kind: kindName, target: Math.max(kindName === 'nova' ? 1 : 2, Math.round(TAP_RATE[kindName] * pace * share * .9)) });
    }
  }
  return { n, designed: d, world: w, worldName: WORLDS[w].name, accent: WORLDS[w].accent, hard, pace, goals, ice, pattern, encore: n > DESIGNED_LEVELS };
}

export function levelSpec(n) {
  const spec = levelTemplate(n), row = CALIBRATION[spec.designed - 1];
  const par = row ? { three: row[0], two: row[1], median: row[2], p90: row[3] } : { three: Math.round(spec.pace * .8), two: Math.round(spec.pace * 1.05), median: spec.pace, p90: Math.round(spec.pace * 1.6) };
  return { ...spec, par };
}

export const newProgress = () => ({ ...emptyTally(), score: 0 });
export function goalHave(goal, progress) {
  if (goal.type === 'score') return progress.score;
  if (goal.type === 'collect') return progress.colors[goal.color];
  if (goal.type === 'ice') return progress.ice;
  return progress[goal.kind];
}
export const goalsComplete = (spec, progress) => spec.goals.every(g => goalHave(g, progress) >= g.target);
// What is still needed, in the planner's units (goal-aware utility).
export function needFor(spec, progress) {
  const need = { colors: Array(COLORS).fill(0), ice: 0, beam: 0, nova: 0, prism: 0 };
  for (const g of spec.goals) {
    const left = Math.max(0, g.target - goalHave(g, progress));
    if (g.type === 'collect') need.colors[g.color] = left;
    else if (g.type === 'ice') need.ice = left;
    else if (g.type === 'power') need[g.kind] = left;
  }
  return need;
}
// Stars reward speed: 3 stars when the crew needs no more taps than the
// fastest quarter of simulated random-tap runs, 2 stars within the fastest
// 60%, otherwise 1. Gift powers do not use taps, so gifts improve stars.
export const starsFor = (spec, tapsUsed, complete = true) => !complete ? 0 : tapsUsed <= spec.par.three ? 3 : tapsUsed <= spec.par.two ? 2 : 1;

// Runs one cascade to rest exactly like the live room does.
// One step exactly like the live room: one wave, gravity, calm refill; a
// reshuffle only when nothing at all can be played. Returns the points.
export function playStep(engine, plan, progress, divisor = 1) {
  const hit = engine.applyPlan(plan); let points = 0;
  if (hit?.clear.length) { points = scoreWave(hit, 1) / divisor; addTally(progress, engine.clear(hit)); engine.collapse(); }
  if (!matches(engine.board).length && !moves(engine.board).length) engine.shuffle();
  progress.score += points; return points;
}
// Kept for older tools: plays a step (no automatic chain in step mode).
export const runToRest = (engine, hit, progress, divisor = 1) => {
  let points = 0;
  if (hit?.clear.length) { points = scoreWave(hit, 1) / divisor; addTally(progress, engine.clear(hit)); engine.collapse(); }
  if (!matches(engine.board).length && !moves(engine.board).length) engine.shuffle();
  progress.score += points; return { points, chain: hit?.clear.length ? 1 : 0 };
};

// Random-tap playthrough used for calibration and tests: every tap is one
// step (a uniformly random legal swap, or a waiting line if no swap exists).
export function simulateLevel(spec, seed, { cap = 12000 } = {}) {
  const engine = new Engine(seed); engine.ice = spec.ice.slice();
  const progress = newProgress(); let used = 0;
  while (!goalsComplete(spec, progress) && used < cap) {
    const pick = engine.randomMoves(1);
    if (!pick && !matches(engine.board).length) { engine.shuffle(); continue; }
    playStep(engine, pick ? pick.plan : { type: 'pending' }, progress, 4); used++;
  }
  return { complete: goalsComplete(spec, progress), used, score: progress.score };
}
