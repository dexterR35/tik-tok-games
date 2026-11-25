// Monte Carlo calibration for the tap-driven level roadmap.
// Each designed level is played SEEDS times from different seeded boards with
// random taps only (every tap = one uniformly random legal swap, no gifts).
// It records how many taps the goals needed and stores the quantiles:
//   3 stars <= p25 taps, 2 stars <= p60 taps, plus median and p90.
// Levels have no move limit, so every level always finishes; gifts (free
// power moves that use no taps) make it finish sooner and earn more stars.
// Usage: node tools/calibrate-levels.mjs   (uses all CPU cores, rewrites the table in public/levels.js)
import { readFile, writeFile } from 'node:fs/promises';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { levelTemplate, simulateLevel, DESIGNED_LEVELS } from '../public/levels.js';

const SEEDS = Number(process.env.SEEDS || 16);
const quantile = (values, q) => { const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]; };
function calibrate(n) {
  const spec = levelTemplate(n), taps = [];
  for (let s = 0; s < SEEDS; s++) { const r = simulateLevel(spec, 700_001 + n * 10_007 + s * 7_919); taps.push(r.complete ? r.used : r.used * 2); }
  return [quantile(taps, .25), quantile(taps, .6), quantile(taps, .5), quantile(taps, .9)];
}
if (!isMainThread) {
  parentPort.on('message', n => parentPort.postMessage({ n, row: n ? calibrate(n) : null }));
} else {
  const started = Date.now(), rows = [], todo = Array.from({ length: DESIGNED_LEVELS }, (_, i) => DESIGNED_LEVELS - i); // longest first
  await Promise.all(Array.from({ length: Math.max(1, availableParallelism()) }, () => new Promise(done => {
    const worker = new Worker(new URL(import.meta.url), { workerData: {} });
    const next = () => { const n = todo.shift(); if (n) worker.postMessage(n); else { worker.terminate(); done(); } };
    worker.on('message', ({ n, row }) => { rows[n - 1] = row; next(); }); next();
  })));
  for (let n = 1; n <= DESIGNED_LEVELS; n++) { const spec = levelTemplate(n), row = rows[n - 1]; console.log(`L${String(n).padStart(3)}${spec.hard ? ' HARD' : '     '} pace ${String(spec.pace).padStart(4)}  3★≤${row[0]}  2★≤${row[1]}  median ${row[2]}  p90 ${row[3]}  ${spec.goals.map(g => `${g.type}:${g.target}`).join(' ')}`); }
  const file = new URL('../public/levels.js', import.meta.url), source = await readFile(file, 'utf8');
  const table = `// CALIBRATION-START\nexport const CALIBRATION = [\n${rows.map((r, i) => `  [${r.join(', ')}], // ${i + 1}`).join('\n')}\n];\n// CALIBRATION-END`;
  await writeFile(file, source.replace(/\/\/ CALIBRATION-START[\s\S]*\/\/ CALIBRATION-END/, table));
  console.log(`Calibrated ${rows.length} levels x ${SEEDS} random-tap runs in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}
