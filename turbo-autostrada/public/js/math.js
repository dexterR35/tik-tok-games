// 🧮 MATEMATICA JOCULUI – functii pure (fara ecran), folosite de joc si de tools/balanta.mjs
// R = regulile active (RULES din rules.js)

// ---------------------------------------------------------------- tap-uri
export const tapCost = (R, dashes) => R.TAP_COST_START + Math.floor(dashes / R.TAP_COST_GROW_EVERY);
// cati metri aduc "taps" tap-uri pornind de la un jucator cu "dashes" metri deja castigati
export function tapMeters(R, taps, dashes = 0) {
  let m = 0;
  for (let guard = 0; guard < 1e6; guard++) {
    const cost = tapCost(R, dashes);
    // sare peste un bloc intreg de TAP_COST_GROW_EVERY metri cu acelasi pret
    const left = R.TAP_COST_GROW_EVERY - (dashes % R.TAP_COST_GROW_EVERY), block = left * cost;
    if (taps >= block) { taps -= block; dashes += left; m += left * R.TAP_METERS; continue; }
    const n = Math.floor(taps / cost); return m + n * R.TAP_METERS;
  }
  return m;
}
// cate tap-uri trebuie pentru "meters" metri (acc = tap-uri deja stranse spre metrul urmator)
export function tapsForMeters(R, meters, dashes = 0, acc = 0) {
  let taps = 0;
  for (let m = 0; m < meters && taps < 1e7; m += R.TAP_METERS) { taps += Math.max(0, tapCost(R, dashes) - acc); acc = 0; dashes++; }
  return Math.ceil(taps);
}

// ---------------------------------------------------------------- rachete (gift-uri)
export function rocketThreshold(R, level) {
  const t = [...R.ROCKET_THRESHOLDS];
  while (t.length < level) t.push(t[t.length - 1] + t[t.length - 2]);
  return t[level - 1];
}
export const rocketMeters = (R, level) => Math.round(R.ROCKET_METERS_BASE * Math.pow(R.ROCKET_GROWTH, level - 1));
// metri totali pentru "coins" monede stranse intr-o runda
export function coinsToMeters(R, coins) { let lvl = 0, m = 0; while (lvl < 80 && coins >= rocketThreshold(R, lvl + 1)) { lvl++; m += rocketMeters(R, lvl); } return { meters: m, level: lvl }; }
// cate monede mai trebuie (peste "have", de la nivelul "lvl") pentru inca "meters" metri
export function coinsForMeters(R, meters, lvl = 0, have = 0) { let got = 0, coins = have; while (got < meters && lvl < 80) { lvl++; got += rocketMeters(R, lvl); coins = rocketThreshold(R, lvl); } return Math.max(0, coins - have); }

// cate monede (minim) acopera "short" metri, socotind AMBELE efecte ale unui gift: rachetele si energia plina (GIFT_SECONDS_PER_COIN).
// have = monede deja trimise runda asta, seconds = cat mai dureaza cursa, focus / lock = energia de acum. Cautare binara (castigul creste cu monedele).
export function coinsToCover(R, short, have, seconds, focus, obstPerM, coinsPerM = 0, lock = 0, max = 100000) {
  if (short <= 0) return 0;
  const base = coinsToMeters(R, have).meters, idle0 = idleDistance(R, seconds, focus, obstPerM, coinsPerM, lock);
  const gain = c => coinsToMeters(R, have + c).meters - base + idleDistance(R, seconds, Math.min(1, focus + R.FOCUS.GIFT_REFILL), obstPerM, coinsPerM, lock + giftLockSeconds(R, c)) - idle0;
  if (gain(max) < short) return Infinity;
  let lo = 1, hi = max;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (gain(mid) >= short) hi = mid; else lo = mid + 1; }
  return lo;
}

// ---------------------------------------------------------------- energie, viteza, impiedicari
export const dodgeOf = (R, focus) => R.FOCUS.DODGE_MIN + (R.FOCUS.DODGE_MAX - R.FOCUS.DODGE_MIN) * focus;
export const focusSpeed = (R, focus) => R.FOCUS.SPEED_MIN + (1 - R.FOCUS.SPEED_MIN) * focus;
// viteza medie reala (m/s) la o energie data, cu tot cu impiedicari.
// obstPerM = obstacole pe metru pe o banda (masurat din generatorul de traseu).
// Un ciclu: alearga 1/λ metri cu viteza v, apoi e impiedicat τ secunde cu viteza s  =>  medie = (1/λ + s·τ) / (1/(λ·v) + τ)
export function avgSpeed(R, focus, obstPerM, slow = 1) {
  const v = R.BASE_SPEED * focusSpeed(R, focus) * slow, lam = obstPerM * (1 - dodgeOf(R, focus));
  if (lam <= 0) return v;
  return (1 / lam + R.STUMBLE_SPEED * R.STUMBLE_SECONDS) / (1 / (lam * v) + R.STUMBLE_SECONDS);
}
// cate secunde de energie plina da un gift (se aduna peste ce mai e ramas)
export const giftLockSeconds = (R, coins) => Math.max(0, coins) * (R.FOCUS.GIFT_SECONDS_PER_COIN || 0);
// distanta parcursa in "seconds" de cineva care NU mai da tap, pornind cu energia "focus" (energia scade la jumatate la HALF_LIFE).
// "lock" = secunde ramase de energie plina din gift-uri (in acest timp energia nu scade). Exact, fara pas de timp:
// energia e constanta pe bucati mici de 0,25 s dupa lock.
export function idleDistance(R, seconds, focus, obstPerM, coinsPerM = 0, lock = 0) {
  let d = 0;
  const full = Math.min(seconds, Math.max(0, lock));
  if (full > 0) { d += avgSpeed(R, 1, obstPerM) * full; focus = 1; }
  const step = 0.25, k = Math.pow(0.5, step / R.FOCUS.HALF_LIFE);
  for (let t = full; t < seconds; t += step) { const dt = Math.min(step, seconds - t); const f = focus * Math.pow(0.5, dt / 2 / R.FOCUS.HALF_LIFE); d += avgSpeed(R, f, obstPerM) * dt; focus *= dt === step ? k : Math.pow(0.5, dt / R.FOCUS.HALF_LIFE); }
  return d * (1 + coinsPerM * R.COIN_METERS);
}

// ---------------------------------------------------------------- lungimea traseului (jocurile cu linie de sosire)
// SOSIREA = unde ajunge fix la final un jucator cu energia plina care da "goal" tap-uri pe secunda toata cursa.
export function goalTapsPerSec(G, players) { return G.GOAL_TAPS_PER_SEC + G.GOAL_TAPS_PER_10X * Math.log10(Math.max(1, players)); }
export function finishLength(R, G, seconds, players, obstPerM, coinsPerM = 0) {
  const sprint = Math.min(seconds, R.FINAL_SPRINT_SECONDS);
  const taps = goalTapsPerSec(G, players) * (seconds + (R.FINAL_SPRINT_MULT - 1) * sprint);
  const run = avgSpeed(R, 1, obstPerM) * seconds * (1 + coinsPerM * R.COIN_METERS);
  return Math.max(100, Math.round((run + tapMeters(R, taps)) / 10) * 10);
}

// ---------------------------------------------------------------- eliminare
// planul rundei pentru n jucatori la start
export function elimPlan(E, n) {
  const finalists = Math.max(1, Math.min(E.FINALISTS, n >= 6 ? E.FINALISTS : n >= 4 ? 2 : 1, n - 1));
  // cate taieri trebuie ca fiecare sa scoata macar ~MIN_CUT_SHARE din cei ramasi: (1 - share)^taieri <= finalisti / n
  const share = Math.min(0.9, Math.max(0.01, E.MIN_CUT_SHARE || 0.01));
  const need = Math.ceil(Math.log(n / finalists) / -Math.log(1 - share) - 1e-9);
  const cuts = Math.max(1, Math.min(E.MAX_CUTS, n - finalists, need));
  const final = finalists > 1 ? E.FINAL_SECONDS : 0;
  return { finalists, cuts, final, lastCutAt: E.FIRST_AT + (cuts - 1) * E.EVERY, seconds: E.FIRST_AT + (cuts - 1) * E.EVERY + final };
}
// cati ies la taierea asta, daca sunt "alive" in cursa si mai sunt "cutsLeft" taieri (cu aceasta)
export function elimCut(alive, finalists, cutsLeft) {
  if (alive <= finalists) return 0;
  if (cutsLeft <= 1) return alive - finalists;
  const keep = alive * Math.pow(finalists / alive, 1 / cutsLeft);
  // macar 1 la fiecare taiere, dar lasa cate cineva de scos si la taierile urmatoare (altfel cu putini jucatori ultimele taieri ar fi goale)
  return Math.max(1, Math.min(alive - finalists - (cutsLeft - 1), Math.round(alive - keep)));
}

// ---------------------------------------------------------------- echipe
// lists[i] = metrii castigati de membrii echipei i, sortati descrescator. 'topN': se aduna doar cei mai buni N, N = cea mai mica echipa.
export function teamScores(lists, mode = 'topN') {
  const sizes = lists.map(l => l.length), n = mode === 'sum' ? Infinity : Math.max(1, Math.min(...sizes.filter(s => s > 0), Infinity));
  return { n: Number.isFinite(n) ? n : 0, scores: lists.map(l => { let s = 0; for (let i = 0; i < l.length && i < n; i++) s += l[i]; return s; }) };
}
// poate intra inca un om in echipa "want"? (nicio echipa cu peste BALANCE mai mare decat cea mai mica)
export function teamAllows(counts, want, balance) {
  let min = Infinity; for (let i = 0; i < counts.length; i++) if (i !== want) min = Math.min(min, counts[i]);
  return counts[want] + 1 <= Math.max(min + 1, Math.ceil(min * (1 + balance)));
}
