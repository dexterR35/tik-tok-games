// 🧮 Verifica cifrele jocului fara sa pornesti nimic:   node tools/balanta.mjs
// Citeste public/js/rules.js si arata, pentru fiecare din cele 4 jocuri, ce se intampla cu 2 ... 10.000 de jucatori.
import { RULES, activateGame } from '../public/js/rules.js';
import * as M from '../public/js/math.js';

const SEG = 26, OBST = 2 / RULES.LANES / SEG, COINS = 1.7 / RULES.LANES / SEG; // aceleasi valori ca in game.js
const sizes = [2, 10, 100, 1000, 10000, 40000];
const pad = (s, n) => String(s).padStart(n);
const line = (...c) => console.log(c.join(' | '));

console.log('\n=== REGULI COMUNE ===');
console.log(`Viteza reala (cu impiedicari): energie plina ${M.avgSpeed(RULES, 1, OBST).toFixed(2)} m/s, energie zero ${M.avgSpeed(RULES, 0, OBST).toFixed(2)} m/s`);
console.log('Tap-uri -> metri:   ' + [100, 300, 600, 1200, 2400].map(n => `${n} tap = ${M.tapMeters(RULES, n)} m`).join('   '));
console.log('Monede  -> metri:   ' + [1, 5, 10, 30, 100, 500, 1000, 5000].map(c => `${c} = ${M.coinsToMeters(RULES, c).meters} m`).join('   '));
let prev = 0, worst = 0; for (let l = 1; l <= 17; l++) { const perCoin = M.rocketMeters(RULES, l) / (M.rocketThreshold(RULES, l) - prev); prev = M.rocketThreshold(RULES, l); if (l > 4) worst = Math.max(worst, perCoin); }
console.log(`Metri pe moneda: prima moneda ${M.rocketMeters(RULES, 1)} m, de la racheta 5 incolo maxim ${worst.toFixed(1)} m/moneda (scade mereu => nu se poate "cumpara" cursa ieftin)`);

for (const [mode, title] of [['classic', '🏁 CLASIC'], ['challenge', '🎟️ CHALLENGE']]) {
  const G = activateGame(mode), T = G.ROUND_SECONDS;
  console.log(`\n=== ${title} (cursa ${T}s, cu sosire) ===`);
  const idle = M.idleDistance(RULES, T, RULES.FOCUS.START, OBST, COINS);
  line(pad('jucatori', 9), pad('tinta tap/s', 11), pad('SOSIRE', 8), pad('fara tap ajunge la', 18), pad('doar gift: monede', 17), pad('tap 2/s + monede', 16));
  for (const n of sizes) {
    if (n > G.MAX_RACERS) continue;
    const F = M.finishLength(RULES, G, T, n, OBST, COINS);
    const sprint = Math.min(T, RULES.FINAL_SPRINT_SECONDS), taps2 = 2 * (T + (RULES.FINAL_SPRINT_MULT - 1) * sprint);
    const full = M.avgSpeed(RULES, 1, OBST) * T * (1 + COINS * RULES.COIN_METERS);
    line(pad(n, 9), pad(M.goalTapsPerSec(G, n).toFixed(1), 11), pad(F + ' m', 8), pad(Math.round(idle) + ' m (' + Math.round(idle / F * 100) + '%)', 18),
      pad(M.coinsToCover(RULES, F - idle, 0, T, RULES.FOCUS.START, OBST, COINS, 0) + ' monede', 17), pad(M.coinsForMeters(RULES, Math.max(0, F - full - M.tapMeters(RULES, taps2))) + ' monede', 16));
  }
}
{
  const G = activateGame('teams');
  console.log(`\n=== 🔴🔵 ECHIPE (cursa ${G.ROUND_SECONDS}s, fara sosire) ===`);
  console.log(`Scor "${G.SCORE}": se aduna cei mai buni N din fiecare echipa, N = cea mai mica echipa. Exemplu cu echipe inegale:`);
  const a = Array.from({ length: 125 }, (_, i) => (i < 20 ? 100 : 5)), b = Array.from({ length: 100 }, (_, i) => (i < 20 ? 104 : 5));
  const top = M.teamScores([a, b], 'topN'), sum = M.teamScores([a, b], 'sum');
  console.log(`  Rosii 125 oameni (20 activi x 100 m), Albastrii 100 oameni (20 activi x 104 m); ceilalti au cate 5 m din monedele de pe pista`);
  console.log(`  topN: ${top.scores.join(' vs ')} => castiga ${top.scores[0] > top.scores[1] ? 'Rosii' : 'Albastrii (au muncit mai mult)'}`);
  console.log(`  sum:  ${sum.scores.join(' vs ')} => castiga ${sum.scores[0] > sum.scores[1] ? 'Rosii (doar pentru ca sunt mai multi)' : 'Albastrii'}`);
  console.log(`Echilibru ${G.BALANCE * 100}%: cu 100 de oameni intr-o echipa, cealalta poate avea maxim ${(() => { const c = [100, 100]; while (M.teamAllows(c, 0, G.BALANCE)) c[0]++; return c[0]; })()}`);
}
{
  const E = activateGame('elimination');
  console.log('\n=== 💀 ELIMINARE (fara sosire, durata se calculeaza singura) ===');
  line(pad('jucatori', 9), pad('taieri', 6), pad('finalisti', 9), pad('durata', 7), 'cati raman dupa fiecare taiere');
  for (const n of [2, 3, 4, 6, 10, 100, 1000, 10000]) {
    if (n > E.MAX_RACERS) continue;
    const P = M.elimPlan(E, n); let alive = n; const steps = [];
    for (let c = 0; c < P.cuts; c++) { alive -= M.elimCut(alive, P.finalists, P.cuts - c); steps.push(alive); }
    line(pad(n, 9), pad(P.cuts, 6), pad(P.finalists, 9), pad(P.seconds + 's', 7), steps.join(' → '));
  }
}
console.log('');

// =====================================================================================
// CORECTITUDINE: un jucator simulat exact cu regulile jocului (energie, impiedicari, tap-uri, sprint, rachete, energia din gift-uri).
// Verifica tintele de echilibru; daca schimbi cifrele din rules.js si apare ✗, ceva s-a dezechilibrat.
function finalDistance(G, tapsPerSec, coins, n = 10) {
  const T = G.ROUND_SECONDS ?? 240, dt = 0.02;
  let d = M.coinsToMeters(RULES, coins).meters, focus = coins ? 1 : RULES.FOCUS.START, lock = M.giftLockSeconds(RULES, coins), acc = 0, dashes = 0;
  for (let t = 0; t < T; t += dt) {
    const taps = tapsPerSec * dt;
    focus = Math.min(1, focus + taps * RULES.FOCUS.PER_TAP);
    if (lock > 0) { lock -= dt; focus = 1; } else focus *= Math.pow(0.5, dt / RULES.FOCUS.HALF_LIFE);
    acc += taps * (T - t <= RULES.FINAL_SPRINT_SECONDS ? RULES.FINAL_SPRINT_MULT : 1);
    while (acc >= M.tapCost(RULES, dashes)) { acc -= M.tapCost(RULES, dashes); dashes++; d += RULES.TAP_METERS; }
    d += M.avgSpeed(RULES, focus, OBST) * dt * (1 + COINS * RULES.COIN_METERS);
  }
  return d;
}
let allOk = true;
for (const [mode, title] of [['classic', '🏁 CLASIC'], ['challenge', '🎟️ CHALLENGE']]) {
  const G = activateGame(mode), F = M.finishLength(RULES, G, G.ROUND_SECONDS, 10, OBST, COINS), D = (t, c) => finalDistance(G, t, c);
  console.log(`\n=== CORECTITUDINE ${title} (10 jucatori, sosire ${F} m) ===`);
  const row = [['nimic', 0, 0], ['tap 1.5/s', 1.5, 0], ['tap 6/s', 6, 0], ['tap 10/s', 10, 0], ['5 monede', 0, 5], ['30 monede', 0, 30], ['100 monede', 0, 100], ['500 monede', 0, 500], ['1000 monede', 0, 1000], ['tap 1.5/s + 100', 1.5, 100]];
  const v = Object.fromEntries(row.map(([k, t, c]) => [k, D(t, c)]));
  console.log('  ' + row.map(([k]) => `${k}: ${Math.round(v[k] / F * 100)}%`).join(' | '));
  const goal = D(M.goalTapsPerSec(G, 10), 0);
  const checks = [
    ['jucatorul "tinta" (' + M.goalTapsPerSec(G, 10).toFixed(1) + ' tap/s) ajunge exact la final (±3%)', Math.abs(goal / F - 1) <= 0.03],
    ['fara tap si fara gift NU ajunge', v['nimic'] < F],
    ['500 monede fara tap >= tap 6/s gratis (gifterul nu e pacalit)', v['500 monede'] >= v['tap 6/s']],
    ['1000 monede fara tap >= tap 10/s gratis', v['1000 monede'] >= v['tap 10/s']],
    ['tap 10/s gratis > 30 monede fara tap (tap-ul conteaza)', v['tap 10/s'] > v['30 monede']],
    ['tap 6/s gratis > 100 monede fara tap', v['tap 6/s'] > v['100 monede']],
    ['mai multe monede = mereu mai departe', [0, 5, 30, 100, 500, 1000].every((c, i, a) => i === 0 || D(0, c) > D(0, a[i - 1]))],
  ];
  for (const [txt, ok] of checks) { console.log(`  ${ok ? '✓' : '✗'} ${txt}`); allOk &&= ok; }
}
console.log(allOk ? '\n✅ Toate tintele de echilibru sunt respectate.\n' : '\n❌ Unele tinte NU sunt respectate (vezi ✗ mai sus).\n');
if (!allOk) process.exitCode = 1;
