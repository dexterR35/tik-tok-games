// Pure, seeded match-3 rules. Shared by the server, hosted demo, and tests.
export const COLS = 7, ROWS = 8, COLORS = 6, SIZE = COLS * ROWS, MAX_MULTI = 4;
// Joker pieces: a gifter's avatar. Wild like a joker in cards (counts as any
// color in a line), never more than JOKER_CAP on the 56-cell board (8.9%).
// Each new refill tile becomes a waiting joker with probability JOKER_SPAWN.
export const JOKER = -2, JOKER_CAP = 5, JOKER_SPAWN = 0.3, JOKER_QUEUE_MAX = 60;
// Gift areas: Prism clears its color, Supernova clears every piece, inside a
// 5 x 5 square (Chebyshev radius 2) instead of the whole board.
export const AREA_RADIUS = 2;
export function areaCells(index, radius = AREA_RADIUS) {
  const cx = index % COLS, cy = Math.floor(index / COLS), out = [];
  for (let y = Math.max(0, cy - radius); y <= Math.min(ROWS - 1, cy + radius); y++) for (let x = Math.max(0, cx - radius); x <= Math.min(COLS - 1, cx + radius); x++) out.push(y * COLS + x);
  return out;
}
const wild = tile => !!tile?.joker;
export const xy = i => ({ x: i % COLS, y: Math.floor(i / COLS) });
export const adjacent = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < SIZE && b < SIZE && Math.abs(a % COLS - b % COLS) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) === 1;
export const copyBoard = board => board.map(t => t ? { ...t } : null);
export const scoreWave = (hit, chain) => hit.clear.length * 60 * Math.min(chain, 12) + hit.activated.length * 180 + hit.births.length * 240;

const POWER_KIND = { row: 'beam', column: 'beam', nova: 'nova', prism: 'prism' };
export const emptyTally = () => ({ colors: Array(COLORS).fill(0), ice: 0, beam: 0, nova: 0, prism: 0, cleared: 0, joker: 0, jokerOwners: [] });
export function addTally(total, part) {
  for (let c = 0; c < COLORS; c++) total.colors[c] += part.colors[c];
  for (const key of ['ice', 'beam', 'nova', 'prism', 'cleared', 'joker']) total[key] = (total[key] || 0) + (part[key] || 0);
  if (part.jokerOwners?.length) (total.jokerOwners ||= []).push(...part.jokerOwners);
  return total;
}
// Level-goal value of one action. Only progress that is still needed counts
// (clipped by min), so the planner never over-values a finished goal.
// Weights are in score points and were chosen by simulation (see
// tools/calibrate-levels.mjs): a needed gem (600) outweighs a typical cascade
// (~1,260 points per move spread over ~10 gems), so goal progress comes first
// and points break ties. While ice remains, new powers get an "ice tool"
// bonus because a beam or nova later reaches ice that no swap can touch.
export const GOAL_WEIGHT = Object.freeze({ gem: 600, ice: 1500, beam: 2500, nova: 3500, prism: 4000, iceTool: 500 });
export function goalValue(tally, need) {
  if (!need) return 0;
  let value = 0;
  for (let c = 0; c < COLORS; c++) value += GOAL_WEIGHT.gem * Math.min(tally.colors[c], need.colors?.[c] || 0);
  for (const key of ['ice', 'beam', 'nova', 'prism']) value += GOAL_WEIGHT[key] * Math.min(tally[key], need[key] || 0);
  if (need.ice > 0) value += GOAL_WEIGHT.iceTool * (tally.beam + 1.5 * tally.nova + 2 * tally.prism);
  return value;
}

// A run is a maximal line of one color in which jokers stand in for that
// color; it needs 3+ cells and at least one real gem (three jokers alone do
// not match). A joker between two colors can complete both runs; overlapping
// runs merge into one group, so every cell is still cleared exactly once.
export function matches(board) {
  const runs = [];
  for (const axis of ['h', 'v']) {
    const outer = axis === 'h' ? ROWS : COLS, inner = axis === 'h' ? COLS : ROWS;
    for (let o = 0; o < outer; o++) {
      const line = Array.from({ length: inner }, (_, q) => axis === 'h' ? o * COLS + q : q * COLS + o);
      for (let c = 0; c < COLORS; c++) {
        const fits = q => board[line[q]]?.color === c || wild(board[line[q]]);
        for (let p = 0; p < inner;) {
          if (!fits(p)) { p++; continue; }
          let end = p, real = 0;
          while (end < inner && fits(end)) { if (!wild(board[line[end]])) real++; end++; }
          if (real && end - p >= 3) runs.push({ axis, color: c, cells: line.slice(p, end) });
          p = end;
        }
      }
    }
  }
  const groups = [];
  for (const run of runs) {
    const connected = groups.filter(g => run.cells.some(i => g.cells.has(i)));
    const group = { cells: new Set(run.cells), runs: [run] };
    for (const g of connected) {
      for (const i of g.cells) group.cells.add(i);
      group.runs.push(...g.runs);
      groups.splice(groups.indexOf(g), 1);
    }
    groups.push(group);
  }
  return groups;
}

export function specialFor(group) {
  if (group.runs.some(r => r.cells.length >= 5)) return 'prism';
  if (group.runs.some(r => r.axis === 'h') && group.runs.some(r => r.axis === 'v')) return 'nova';
  const four = group.runs.find(r => r.cells.length === 4);
  return four ? (four.axis === 'h' ? 'row' : 'column') : null;
}

function commonColor(board) {
  const counts = Array(COLORS).fill(0);
  for (const t of board) if (t?.color >= 0) counts[t.color]++;
  return counts.indexOf(Math.max(...counts));
}

export function resolve(board, { preferred = [], triggers = [], targetColor = null, all = false, combo = false } = {}) {
  const groups = matches(board), births = [];
  const clear = new Set(triggers), protectedCells = new Set();
  for (const group of groups) {
    const special = specialFor(group);
    if (special) {
      const intersection = [...group.cells].find(i => group.runs.filter(r => r.cells.includes(i)).length > 1);
      const anchor = [...preferred, intersection, ...group.cells].find(i => group.cells.has(i) && board[i] && !board[i].special && !board[i].joker);
      if (anchor !== undefined) {
        births.push({ index: anchor, special, color: special === 'prism' ? -1 : board[anchor].color });
        protectedCells.add(anchor);
      }
    }
    for (const i of group.cells) clear.add(i);
  }
  if (all) for (let i = 0; i < SIZE; i++) clear.add(i);
  const queue = [...clear], activated = new Set();
  const add = i => { if (i >= 0 && i < SIZE && !clear.has(i)) { clear.add(i); queue.push(i); } };
  for (let n = 0; n < queue.length; n++) {
    const i = queue[n], tile = board[i];
    if (!tile?.special || activated.has(i) || protectedCells.has(i)) continue;
    activated.add(i);
    const { x, y } = xy(i);
    if (tile.special === 'prism') {
      const color = targetColor ?? commonColor(board);
      for (let j = 0; j < SIZE; j++) if (board[j]?.color === color || wild(board[j]) || (combo && board[j]?.special === 'prism')) add(j);
    } else if (tile.special === 'row' || tile.special === 'column') {
      for (let j = 0; j < SIZE; j++) if ((tile.special === 'row' ? Math.floor(j / COLS) === y : j % COLS === x) || (combo && (Math.floor(j / COLS) === y || j % COLS === x))) add(j);
    } else if (tile.special === 'nova') {
      const radius = combo ? 2 : 1;
      for (let j = 0; j < SIZE; j++) if (Math.abs(j % COLS - x) <= radius && Math.abs(Math.floor(j / COLS) - y) <= radius) add(j);
    }
  }
  for (const i of protectedCells) clear.delete(i);
  return { clear: [...clear].sort((a, b) => a - b), births, activated: [...activated], groups: groups.map(g => ({ cells: [...g.cells], special: specialFor(g) })) };
}

export function swapOptions(board, a, b) {
  const ta = board[a], tb = board[b];
  const prism = ta?.special === 'prism' || tb?.special === 'prism';
  const combo = !!ta?.special && !!tb?.special;
  const partner = prism ? (ta.special === 'prism' ? tb : ta) : null;
  return { preferred: [b, a], triggers: prism || combo ? [a, b] : [], targetColor: partner && partner.color >= 0 ? partner.color : null, all: ta?.special === 'prism' && tb?.special === 'prism', combo };
}

// Exact fast test: does a 3+ line (jokers wild, at least one real gem) pass
// through cell i? A plain swap is legal only if this holds for a or b.
function lineThrough(board, i) {
  const tile = board[i]; if (!tile || tile.color === -1) return false;
  const x = i % COLS, y = Math.floor(i / COLS);
  for (const c of tile.joker ? [0, 1, 2, 3, 4, 5] : [tile.color]) {
    const fits = j => board[j]?.color === c || wild(board[j]);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      let length = 1, real = tile.joker ? 0 : 1;
      for (const dir of [-1, 1]) for (let k = 1; ; k++) {
        const nx = x + dx * k * dir, ny = y + dy * k * dir, j = ny * COLS + nx;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || !fits(j)) break;
        length++; if (!wild(board[j])) real++;
      }
      if (length >= 3 && real) return true;
    }
  }
  return false;
}

export function moveAt(board, a, b) {
  if (!adjacent(a, b) || !board[a] || !board[b]) return null;
  const options = swapOptions(board, a, b), swapped = board.slice();
  [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
  if (!options.triggers.length && !lineThrough(swapped, a) && !lineThrough(swapped, b)) return null;
  const hit = resolve(swapped, options);
  if (!hit.clear.length) return null;
  // Stable boards have no unrelated matches. Requiring an endpoint also makes
  // the validator safe when used on an externally supplied test board.
  if (!options.triggers.length && !hit.groups.some(g => g.cells.includes(a) || g.cells.includes(b))) return null;
  const value = hit.clear.length * 10 + hit.births.reduce((n, t) => n + ({ prism: 150, nova: 85, row: 45, column: 45 }[t.special]), 0) + hit.activated.length * 35;
  return { a, b, value, hit, options };
}

export function moves(board) {
  const result = [];
  for (let a = 0; a < SIZE; a++) {
    for (const b of [a % COLS < COLS - 1 ? a + 1 : -1, a + COLS < SIZE ? a + COLS : -1]) {
      if (b < 0) continue;
      const move = moveAt(board, a, b);
      if (move) result.push(move);
    }
  }
  return result.sort((a, b) => b.value - a.value || a.a - b.a || a.b - b.b);
}

export class Engine {
  constructor(seed = 183071, saved = null) {
    this.rng = (Number(seed) >>> 0) || 1;
    this.nextId = 1;
    this.board = []; this.ice = Array(SIZE).fill(0); this.jokerQueue = []; this.jokerBacklog = new Map(); this.calm = true;
    if (saved && validBoard(saved.board) && Number.isInteger(saved.rng) && Number.isSafeInteger(saved.nextId) && saved.nextId > Math.max(...saved.board.map(t => t.id))) {
      this.board = copyBoard(saved.board); this.rng = saved.rng >>> 0 || 1; this.nextId = saved.nextId;
      if (validIce(saved.ice)) this.ice = saved.ice.slice();
      if (Array.isArray(saved.jokerQueue)) this.jokerQueue = saved.jokerQueue.filter(o => typeof o === 'string' && o.length <= 80).slice(0, JOKER_QUEUE_MAX);
      for (const [owner, count] of saved.jokerBacklog || []) if (typeof owner === 'string' && owner.length <= 80 && Number.isSafeInteger(count) && count > 0) this.jokerBacklog.set(owner, count);
    } else this.fillStable();
  }
  random() { let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rng = x >>> 0; return this.rng / 4294967296; }
  tile() { return { id: this.nextId++, color: Math.floor(this.random() * COLORS), special: null }; }
  // Gift jokers wait in a queue and enter with refills. The generator is only
  // consulted while jokers are waiting, so boards without gifts are unchanged.
  addJokers(owner, count = 1) {
    if (!Number.isSafeInteger(count) || count <= 0) return 0;
    owner = String(owner).slice(0, 80);
    const total = (this.jokerBacklog.get(owner) || 0) + count;
    if (!Number.isSafeInteger(total)) throw Error('Joker counter is full');
    this.jokerBacklog.set(owner, total); this.fillJokerQueue(); return count;
  }
  // Only 60 individual pieces are materialized; excess gifts remain exact
  // per-viewer counts, rotated fairly instead of silently discarded.
  fillJokerQueue() {
    while (this.jokerQueue.length < JOKER_QUEUE_MAX && this.jokerBacklog.size) {
      const [owner, count] = this.jokerBacklog.entries().next().value;
      this.jokerBacklog.delete(owner); if (count > 1) this.jokerBacklog.set(owner, count - 1);
      this.jokerQueue.push(owner);
    }
  }
  jokersWaiting() { return this.jokerQueue.length + [...this.jokerBacklog.values()].reduce((n, count) => n + count, 0); }
  recycleJokers() {
    for (const tile of this.board) if (tile?.joker) this.addJokers(tile.joker);
  }
  jokerCount() { return this.board.reduce((n, t) => n + (t?.joker ? 1 : 0), 0); }
  refillTile(onBoard) {
    this.fillJokerQueue();
    if (this.jokerQueue.length && onBoard.count < JOKER_CAP && this.random() < JOKER_SPAWN) {
      onBoard.count++; return { id: this.nextId++, color: JOKER, special: null, joker: this.jokerQueue.shift() };
    }
    return this.tile();
  }
  fillStable() {
    for (let attempt = 0; attempt < 200; attempt++) {
      this.board = [];
      for (let i = 0; i < SIZE; i++) {
        const tile = this.tile(), unavailable = new Set();
        if (i % COLS >= 2 && this.board[i - 1].color === this.board[i - 2].color) unavailable.add(this.board[i - 1].color);
        if (i >= COLS * 2 && this.board[i - COLS].color === this.board[i - COLS * 2].color) unavailable.add(this.board[i - COLS].color);
        while (unavailable.has(tile.color)) tile.color = (tile.color + 1) % COLORS;
        this.board.push(tile);
      }
      if (moves(this.board).length) return;
    }
    throw Error('Could not generate a playable board');
  }
  swap(a, b) {
    const move = moveAt(this.board, a, b);
    if (!move) return null;
    [this.board[a], this.board[b]] = [this.board[b], this.board[a]];
    return move.hit;
  }
  // Clears a wave and returns what it achieved for level goals. Ice is a
  // cell layer (like jelly): every matched or blasted cell, including the
  // anchor that becomes a new power, removes one layer.
  clear(hit) {
    const tally = emptyTally(), touched = new Set(hit.clear);
    for (const birth of hit.births) touched.add(birth.index);
    for (const i of hit.clear) { const tile = this.board[i]; if (tile?.color >= 0) tally.colors[tile.color]++; if (tile) tally.cleared++; if (tile?.joker) { tally.joker++; tally.jokerOwners.push(tile.joker); } }
    for (const i of touched) if (this.ice[i] > 0) { this.ice[i]--; tally.ice++; }
    for (const birth of hit.births) tally[POWER_KIND[birth.special]]++;
    this.clearTiles(hit); return tally;
  }
  clearTiles(hit) {
    for (const i of hit.clear) this.board[i] = null;
    for (const birth of hit.births) if (this.board[birth.index]) this.board[birth.index] = { ...this.board[birth.index], color: birth.color, special: birth.special };
  }
  collapse() {
    const drops = [], onBoard = { count: this.jokerCount() }, fresh = [];
    for (let x = 0; x < COLS; x++) {
      const kept = [];
      for (let y = ROWS - 1; y >= 0; y--) if (this.board[y * COLS + x]) kept.push({ tile: this.board[y * COLS + x], from: y });
      const missing = ROWS - kept.length;
      for (let y = ROWS - 1, n = 0; y >= 0; y--, n++) {
        const entry = kept[n] || { tile: this.refillTile(onBoard), from: y - missing, fresh: true };
        if (entry.fresh) fresh.push(y * COLS + x);
        this.board[y * COLS + x] = entry.tile;
        if (entry.from !== y) drops.push({ id: entry.tile.id, x, from: entry.from, to: y });
      }
    }
    if (this.calm) this.calmRefill(fresh);
    return drops;
  }
  // Calm refill (step mode): a new gem never completes a line when it lands,
  // so one tap cannot start an endless chain. If its random color would make
  // a line, the next colors are tried in order (at most 4 of 6 colors can be
  // blocked by two neighbors on each side, so one always fits unless jokers
  // surround the cell). A joker that would land in a line goes back to the
  // front of its owner's queue and a plain gem takes the cell. Lines formed
  // by existing gems sliding down stay on the board until the next step.
  calmRefill(cells) {
    for (const i of cells) {
      if (!lineThrough(this.board, i)) continue;
      let tile = this.board[i];
      if (tile.joker) {
        if (this.jokerQueue.length < JOKER_QUEUE_MAX) this.jokerQueue.unshift(tile.joker); else this.addJokers(tile.joker, 1);
        tile = this.board[i] = { id: tile.id, color: 0, special: null };
      }
      const start = tile.color;
      for (let k = 1; k <= COLORS; k++) { this.board[i] = { ...tile, color: (start + k) % COLORS }; if (!lineThrough(this.board, i)) break; }
    }
  }
  shuffle() {
    for (let tries = 0; tries < 300; tries++) {
      for (let i = SIZE - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.board[i], this.board[j]] = [this.board[j], this.board[i]];
      }
      if (!matches(this.board).length && moves(this.board).length) return;
    }
    this.recycleJokers(); this.fillStable();
  }
  // Power placement is split from resolution so the live room can show the
  // new nova/prism/beams for one animation phase before they detonate.
  placePlan(plan) {
    if (plan.type === 'finale') { for (const b of plan.beams) this.board[b.index] = { ...this.board[b.index], special: b.special }; return; }
    if (plan.type !== 'meteor') return; // Prism and Supernova act on an area; no piece is changed first
    for (const index of plan.indices ?? [plan.index]) this.board[index] = { ...this.board[index], special: 'nova' };
  }
  // Cells a bounded gift clears: Prism = its color (and jokers, which are
  // wild) inside the 5 x 5 area; Supernova = the whole 5 x 5 area.
  giftCells(plan) {
    const index = plan.indices?.[0] ?? plan.index;
    if (plan.type === 'supernova') return areaCells(index);
    return areaCells(index).filter(i => this.board[i] && (this.board[i].color === plan.color || this.board[i].joker));
  }
  resolvePlan(plan) {
    if (plan.type === 'finale') return resolve(this.board, { triggers: plan.beams.map(b => b.index) });
    if (plan.type === 'pending') return resolve(this.board);
    if (plan.type === 'prism' || plan.type === 'supernova') return resolve(this.board, { triggers: this.giftCells(plan) });
    return resolve(this.board, { triggers: plan.indices ?? [plan.index] });
  }
  // Applies a validated plan and returns its first wave, or null if illegal.
  // A multi plan swaps up to MAX_MULTI disjoint pairs at the same instant;
  // every pair must create its own match (only the first may be a power
  // swap), so one gift or tap packet changes several board areas together.
  applyPlan(plan) {
    if (plan.type === 'move') return this.swap(plan.a, plan.b);
    if (plan.type === 'multi') {
      const swaps = plan.swaps || [], cells = swaps.flatMap(s => [s.a, s.b]);
      if (!swaps.length || swaps.length > MAX_MULTI || new Set(cells).size !== cells.length) return null;
      const first = moveAt(this.board, swaps[0].a, swaps[0].b); if (!first) return null;
      const scratch = this.board.slice();
      [scratch[swaps[0].a], scratch[swaps[0].b]] = [scratch[swaps[0].b], scratch[swaps[0].a]];
      for (const s of swaps.slice(1)) {
        const move = moveAt(scratch, s.a, s.b);
        if (!move || move.options.triggers.length) return null;
        [scratch[s.a], scratch[s.b]] = [scratch[s.b], scratch[s.a]];
      }
      this.board = scratch;
      return resolve(this.board, { ...first.options, preferred: swaps.flatMap(s => [s.b, s.a]) });
    }
    if (plan.type === 'pending') return matches(this.board).length ? resolve(this.board) : null;
    if (!['meteor', 'prism', 'supernova', 'finale'].includes(plan.type)) return null;
    this.placePlan(plan); return this.resolvePlan(plan);
  }
  // Step mode: one action = one wave (explode, then gravity and a calm
  // refill). Lines left by sliding gems are scored by the next step.
  forecast(plan, need = null, maxWaves = 1) {
    const copy = new Engine(this.rng, this.export());
    let hit = copy.applyPlan(plan);
    const result = { points: 0, cleared: 0, waves: 0, created: 0, activated: 0, prisms: 0, novas: 0, beams: 0, tally: emptyTally() };
    while (hit?.clear.length && result.waves < maxWaves) {
      result.waves++; result.points += scoreWave(hit, result.waves); result.cleared += hit.clear.length;
      result.created += hit.births.length; result.activated += hit.activated.length;
      for (const birth of hit.births) result[birth.special === 'prism' ? 'prisms' : birth.special === 'nova' ? 'novas' : 'beams']++;
      addTally(result.tally, copy.clear(hit)); copy.collapse(); hit = resolve(copy.board);
    }
    // Utility = exact action score + power-creation bonus + clipped level-goal
    // progress. No speculative follow-up turn is counted.
    result.goal = goalValue(result.tally, need);
    result.utility = result.points + result.prisms * 480 + result.novas * 240 + result.beams * 120 + result.goal;
    return result;
  }
  bestMove(strong = true, need = null) {
    if (strong) { const best = this.bestMoves(1, need); return best && { ...best.first, forecast: best.forecast, analysis: best.analysis }; }
    const candidates = moves(this.board); if (!candidates.length) return null;
    const analysis = this.forecast({ type: 'move', a: candidates[0].a, b: candidates[0].b }, need);
    return { ...candidates[0], forecast: analysis.utility, analysis: { ...analysis, legal: candidates.length, strong: 0, prisms: 0, scanned: 1, kind: 'move', swaps: 1 } };
  }
  // Exhaustive single-swap search, then a greedy multi-swap extension: each
  // extra pair must be at least one cell away from the previous pairs and
  // their matches, and is kept only if the exact combined forecast improves.
  bestMoves(k = 1, need = null) {
    const candidates = moves(this.board);
    if (!candidates.length) return null;
    const scored = candidates.map(move => ({ move, f: this.forecast({ type: 'move', a: move.a, b: move.b }, need) }));
    scored.sort((x, y) => y.f.utility - x.f.utility || y.f.points - x.f.points || x.move.a - y.move.a || x.move.b - y.move.b);
    const chosen = [scored[0].move], near = new Set();
    const mark = m => { for (const i of [m.a, m.b, ...m.hit.groups.flatMap(g => g.cells)]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = i % COLS + dx, y = Math.floor(i / COLS) + dy; if (x >= 0 && y >= 0 && x < COLS && y < ROWS) near.add(y * COLS + x); } };
    mark(chosen[0]);
    let plan = { type: 'move', a: chosen[0].a, b: chosen[0].b }, analysis = scored[0].f;
    for (const { move } of scored.slice(1)) {
      if (chosen.length >= Math.min(k, MAX_MULTI)) break;
      if (move.options.triggers.length || [move.a, move.b, ...move.hit.groups.flatMap(g => g.cells)].some(i => near.has(i))) continue;
      const swaps = [...chosen, move].map(m => ({ a: m.a, b: m.b })), f = this.forecast({ type: 'multi', swaps }, need);
      if (!f.waves || f.utility <= analysis.utility) continue;
      chosen.push(move); mark(move); plan = { type: 'multi', swaps }; analysis = f;
    }
    const stats = { legal: candidates.length, strong: candidates.filter(m => m.hit.births.length).length, prisms: candidates.filter(m => m.hit.births.some(b => b.special === 'prism')).length, scanned: candidates.length, kind: 'move', swaps: chosen.length };
    return { plan, first: chosen[0], swaps: chosen.map(m => ({ a: m.a, b: m.b })), forecast: analysis.utility, analysis: { ...analysis, ...stats } };
  }
  bestPower(type, votedColor = null, k = 1, need = null) {
    if (!['meteor', 'prism', 'supernova'].includes(type)) return null;
    let best = null, scanned = 0;
    const colors = type === 'prism' ? (votedColor === null ? Array.from({ length: COLORS }, (_, i) => i) : [votedColor]) : [null];
    const chosen = [], rounds = type === 'meteor' ? Math.max(1, Math.min(k, MAX_MULTI)) : 1;
    // Meteors compare every target cell; several meteors are placed greedily on
    // non-overlapping 3 x 3 areas, each scored by the exact combined forecast.
    // Prisms compare every target cell and every allowed color.
    for (let round = 0; round < rounds; round++) {
      let roundBest = null;
      for (const color of colors) for (let index = 0; index < SIZE; index++) {
        if (type === 'meteor' && this.board[index]?.joker) continue;
        if (type === 'prism' && !areaCells(index).some(i => this.board[i]?.color === color)) continue;
        if (chosen.some(c => Math.abs(c % COLS - index % COLS) < 3 && Math.abs(Math.floor(c / COLS) - Math.floor(index / COLS)) < 3)) continue;
        const indices = [...chosen, index], analysis = this.forecast({ type, indices, color }, need); scanned++;
        if (!roundBest || analysis.utility > roundBest.analysis.utility || (analysis.utility === roundBest.analysis.utility && analysis.points > roundBest.analysis.points)) roundBest = { index, color, analysis };
      }
      if (!roundBest) break; // every paid meteor lands, even if a later one adds little
      chosen.push(roundBest.index); best = { ...roundBest, index: chosen[0], indices: [...chosen] };
    }
    best.analysis = { ...best.analysis, scanned, kind: type, voted: votedColor !== null, count: chosen.length };
    return best;
  }
  // Viewer taps: every legal swap is equally likely (seeded Fisher-Yates).
  // With a tap backlog, up to k swaps play at the same instant; each extra
  // swap must be one cell away from the others and still be legal.
  randomMoves(k = 1) {
    const legal = moves(this.board); if (!legal.length) return null;
    const order = legal.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const chosen = [order[0]], near = new Set();
    const mark = m => { for (const i of [m.a, m.b, ...m.hit.groups.flatMap(g => g.cells)]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = i % COLS + dx, y = Math.floor(i / COLS) + dy; if (x >= 0 && y >= 0 && x < COLS && y < ROWS) near.add(y * COLS + x); } };
    mark(chosen[0]);
    for (const move of order.slice(1)) {
      if (chosen.length >= Math.min(k, MAX_MULTI)) break;
      if (move.options.triggers.length || [move.a, move.b, ...move.hit.groups.flatMap(g => g.cells)].some(i => near.has(i))) continue;
      const swaps = [...chosen, move].map(m => ({ a: m.a, b: m.b }));
      if (!new Engine(1, this.export()).applyPlan({ type: 'multi', swaps })) continue;
      chosen.push(move); mark(move);
    }
    const swaps = chosen.map(m => ({ a: m.a, b: m.b }));
    return { plan: swaps.length > 1 ? { type: 'multi', swaps } : { type: 'move', ...swaps[0] }, swaps, first: chosen[0], legal: legal.length };
  }
  export() { return { board: copyBoard(this.board), rng: this.rng, nextId: this.nextId, ice: this.ice.slice(), jokerQueue: this.jokerQueue.slice(), jokerBacklog: [...this.jokerBacklog] }; }
}

const validTile = t => t && Number.isSafeInteger(t.id) && t.id > 0 && (t.joker
  ? t.color === JOKER && t.special === null && typeof t.joker === 'string' && t.joker.length <= 80
  : Number.isInteger(t.color) && t.color >= -1 && t.color < COLORS && [null, 'row', 'column', 'nova', 'prism'].includes(t.special) && (t.special === 'prism' ? t.color === -1 : t.color >= 0));
export function validBoard(board) {
  return Array.isArray(board) && board.length === SIZE && new Set(board.map(t => t?.id)).size === SIZE && board.every(validTile);
}

export function validIce(ice) { return Array.isArray(ice) && ice.length === SIZE && ice.every(n => Number.isInteger(n) && n >= 0 && n <= 3); }
