// Pure, seeded match-3 rules. Shared by the server, hosted demo, and tests.
export const COLS = 7, ROWS = 8, COLORS = 6, SIZE = COLS * ROWS;
export const xy = i => ({ x: i % COLS, y: Math.floor(i / COLS) });
export const adjacent = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < SIZE && b < SIZE && Math.abs(a % COLS - b % COLS) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) === 1;
export const copyBoard = board => board.map(t => t ? { ...t } : null);
export const scoreWave = (hit, chain) => hit.clear.length * 60 * Math.min(chain, 12) + hit.activated.length * 180 + hit.births.length * 240;

export function matches(board) {
  const runs = [];
  for (const axis of ['h', 'v']) {
    const outer = axis === 'h' ? ROWS : COLS, inner = axis === 'h' ? COLS : ROWS;
    for (let o = 0; o < outer; o++) {
      for (let p = 0; p < inner;) {
        const at = q => axis === 'h' ? o * COLS + q : q * COLS + o;
        const color = board[at(p)]?.color;
        let end = p + 1;
        while (color >= 0 && end < inner && board[at(end)]?.color === color) end++;
        if (color >= 0 && end - p >= 3) runs.push({ axis, cells: Array.from({ length: end - p }, (_, q) => at(p + q)) });
        p = end;
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
      const anchor = [...preferred, intersection, ...group.cells].find(i => group.cells.has(i) && board[i] && !board[i].special);
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
      for (let j = 0; j < SIZE; j++) if (board[j]?.color === color || (combo && board[j]?.special === 'prism')) add(j);
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
  return { preferred: [b, a], triggers: prism || combo ? [a, b] : [], targetColor: prism ? (ta.special === 'prism' ? tb.color : ta.color) : null, all: ta?.special === 'prism' && tb?.special === 'prism', combo };
}

export function moveAt(board, a, b) {
  if (!adjacent(a, b) || !board[a] || !board[b]) return null;
  const options = swapOptions(board, a, b), swapped = board.slice();
  [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
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
    this.board = [];
    if (saved && validBoard(saved.board) && Number.isInteger(saved.rng) && Number.isSafeInteger(saved.nextId) && saved.nextId > Math.max(...saved.board.map(t => t.id))) {
      this.board = copyBoard(saved.board); this.rng = saved.rng >>> 0 || 1; this.nextId = saved.nextId;
    } else this.fillStable();
  }
  random() { let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rng = x >>> 0; return this.rng / 4294967296; }
  tile() { return { id: this.nextId++, color: Math.floor(this.random() * COLORS), special: null }; }
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
  clear(hit) {
    for (const i of hit.clear) this.board[i] = null;
    for (const birth of hit.births) if (this.board[birth.index]) this.board[birth.index] = { ...this.board[birth.index], color: birth.color, special: birth.special };
  }
  collapse() {
    const drops = [];
    for (let x = 0; x < COLS; x++) {
      const kept = [];
      for (let y = ROWS - 1; y >= 0; y--) if (this.board[y * COLS + x]) kept.push({ tile: this.board[y * COLS + x], from: y });
      const missing = ROWS - kept.length;
      for (let y = ROWS - 1, n = 0; y >= 0; y--, n++) {
        const entry = kept[n] || { tile: this.tile(), from: y - missing };
        this.board[y * COLS + x] = entry.tile;
        if (entry.from !== y) drops.push({ id: entry.tile.id, x, from: entry.from, to: y });
      }
    }
    return drops;
  }
  shuffle() {
    for (let tries = 0; tries < 300; tries++) {
      for (let i = SIZE - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.board[i], this.board[j]] = [this.board[j], this.board[i]];
      }
      if (!matches(this.board).length && moves(this.board).length) return;
    }
    this.fillStable();
  }
  forecast(plan) {
    const copy = new Engine(this.rng, this.export());
    let hit;
    if (plan.type === 'move') hit = copy.swap(plan.a, plan.b);
    else {
      const tile = copy.board[plan.index], special = plan.type === 'meteor' ? 'nova' : 'prism';
      copy.board[plan.index] = { ...tile, special, color: special === 'prism' ? -1 : tile.color };
      hit = resolve(copy.board, { triggers: [plan.index], targetColor: plan.color ?? null, all: plan.type === 'supernova' });
    }
    const result = { points: 0, cleared: 0, waves: 0, created: 0, activated: 0, prisms: 0, novas: 0, beams: 0 };
    while (hit?.clear.length && result.waves < 32) {
      result.waves++; result.points += scoreWave(hit, result.waves); result.cleared += hit.clear.length;
      result.created += hit.births.length; result.activated += hit.activated.length;
      for (const birth of hit.births) result[birth.special === 'prism' ? 'prisms' : birth.special === 'nova' ? 'novas' : 'beams']++;
      copy.clear(hit); copy.collapse(); hit = resolve(copy.board);
    }
    // Utility combines exact action score with power-creation bonuses.
    // No speculative follow-up points are shown as earned or predicted.
    result.utility = result.points + result.prisms * 480 + result.novas * 240 + result.beams * 120;
    return result;
  }
  bestMove(strong = true) {
    const candidates = moves(this.board);
    if (!candidates.length) return null;
    const options = { legal: candidates.length, strong: candidates.filter(m => m.hit.births.length).length, prisms: candidates.filter(m => m.hit.births.some(b => b.special === 'prism')).length };
    const scored = (strong ? candidates : candidates.slice(0, 1)).map(move => {
      const analysis = this.forecast({ type: 'move', a: move.a, b: move.b });
      return { ...move, forecast: analysis.utility, analysis: { ...analysis, ...options, scanned: strong ? candidates.length : 1, kind: 'move' } };
    });
    scored.sort((a, b) => b.forecast - a.forecast || b.analysis.points - a.analysis.points || a.a - b.a || a.b - b.b);
    return scored[0];
  }
  bestPower(type, votedColor = null) {
    if (!['meteor', 'prism', 'supernova'].includes(type)) return null;
    let best = null, scanned = 0;
    const colors = type === 'prism' ? (votedColor === null ? Array.from({ length: COLORS }, (_, i) => i) : [votedColor]) : [null];
    // Meteors compare every target cell. Prisms compare every target cell and
    // every allowed color: placement can trigger a power and change gravity.
    for (const color of colors) for (let index = 0; index < SIZE; index++) {
      if (type === 'supernova' && index !== 24) continue;
      const analysis = this.forecast({ type, index, color }); scanned++;
      if (!best || analysis.utility > best.analysis.utility || (analysis.utility === best.analysis.utility && analysis.points > best.analysis.points)) best = { index, color, analysis };
    }
    best.analysis = { ...best.analysis, scanned, kind: type, voted: votedColor !== null };
    return best;
  }
  export() { return { board: copyBoard(this.board), rng: this.rng, nextId: this.nextId }; }
}

export function validBoard(board) {
  return Array.isArray(board) && board.length === SIZE && new Set(board.map(t => t?.id)).size === SIZE && board.every(t => t && Number.isSafeInteger(t.id) && t.id > 0 && Number.isInteger(t.color) && t.color >= -1 && t.color < COLORS && [null, 'row', 'column', 'nova', 'prism'].includes(t.special) && (t.special === 'prism' ? t.color === -1 : t.color >= 0));
}
