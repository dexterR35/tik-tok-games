import { advanceRun, newRun, stats, raceDefinition } from './public/garage/model.js';

// DUEL MATH
// The rival drives an unboosted copy of YOUR car (the "reference" run) scaled by ±5%, so the result never depends on
// how much has been bought - only on what the audience does during these seconds.
// Audience help is LINEAR in what was sent, so it does not matter how TikTok groups the events:
//   100 likes in one message = 100 messages of one like; thirty 1-coin gifts = one 30-coin gift.
//   (before: one like alone was worth 0.22 m/s but 100 likes together only 1.46 m/s, and thirty roses
//    were worth 13 times more speed than one 30-coin gift)
// A tap or gift adds kinetic energy:  ½v'² = ½v² + energy  (≈ Δv = energy / v; power-like: the same push is worth less speed
// the faster the car already goes), limited by an envelope above the unboosted reference so no crowd can teleport the car.
// Energy that does not fit under the envelope right now is NOT lost: it waits in a small bank and is released as the
// car gains room, so a big burst and a steady stream of the same size end up worth the same.
// The energy is scaled with the car's own power-to-weight (exponent 2/3, which keeps Δv/v constant), so the same
// likes and gifts move a slow starter car and a finished 770 hp build by the same share of the race.
export const DUEL = {
  OFFSET: .05,
  TAP_ENERGY: 4.2, GIFT_ENERGY: 4.2,   // m²/s² per like, and per coin (1 coin = 50 workshop credits)
  V_FLOOR: 12,                          // m/s
  TAP_ENVELOPE: 1.18, GIFT_ENVELOPE: 1.32, ENVELOPE_PAD: 1.4,
  TAP_ASSIST: .004, TAP_ASSIST_MAX: .14, TAP_ASSIST_DECAY: .025,       // extra power fraction per like / cap / fade per second
  GIFT_ASSIST: .2 / 30, GIFT_ASSIST_MAX: .24, GIFT_ASSIST_DECAY: .045, // per coin / cap / fade per second
  TAP_NITROUS: .02, GIFT_NITROUS: .08,  // seconds of nitrous handed back per like / per coin
  CREDITS_PER_COIN: 50,
  TAP_BANK_MAX: 1500, GIFT_BANK_MAX: 6000, // m²/s² that can wait for room (≈ 360 likes / ≈ 1400 coins on the starter car)
  BASE_POWER_TO_WEIGHT: 205 * .82 / 1260, // the starter car: scale = 1
};

// CLOSE RACING (the rival "stays in the pack")
// The rival still drives its own pace (the reference × 1 ± 5%), but it reacts to the race like a real driver:
//  - when you pull away (taps, gifts, nitrous) it pushes after you - LATE (RESPONSE) and with LESS (CHASE_MAX) - and it
//    only closes to a few metres behind you (CHASE_FAR → CHASE_NEAR as the line gets closer); chasing can never pass you.
//  - when it is far ahead it lifts a little so the crew always sees a catchable car (LEAD_FAR → LEAD_NEAR), and the time
//    it gave away comes back only slowly (RECOVER), so it can still win if the crew stops - but never by a mile.
// Result: without help the faster rival still wins and the slower one still loses, help still wins the race,
// and the finish is almost always a few metres - a real duel instead of a car disappearing off screen.
export const PACK = {
  CHASE_FAR: 5, CHASE_NEAR: 1.1,   // metres the rival may trail you by before it pushes (start → finish line)
  LEAD_FAR: 6, LEAD_NEAR: 2.2,     // metres the rival may lead by before it lifts
  CHASE_GAIN: .9, CHASE_MAX: .55,  // push: m/s per metre of extra gap, capped at 55% of its own speed
  EASE_GAIN: .5, EASE_MAX: .07,    // lift: m/s per metre, at most 7% of its own speed
  RECOVER: .035,                   // after lifting it wins back at most 3.5% of its speed
  RESPONSE: 1.3,                   // 1/s: how fast the rival reacts (lower = later)
  FINAL_SQUEEZE: 1.6,              // ...and up to 2.6× quicker on the run to the line
  CLEARANCE: .6,                   // chasing stops this far behind your rear bumper
};

function packRival(duel, step, previous) {
  const r = duel.rival, run = duel.player, target = duel.distance ?? 400;
  const base = duel.reference.distance * r.factor, baseSpeed = duel.reference.speed * r.factor;
  r.extra ??= 0; r.push ??= 0;
  const progress = Math.min(1, run.distance / target), far = 1 - progress;
  const gap = run.distance - (base + r.extra), chaseGap = PACK.CHASE_NEAR + (PACK.CHASE_FAR - PACK.CHASE_NEAR) * far, leadGap = PACK.LEAD_NEAR + (PACK.LEAD_FAR - PACK.LEAD_NEAR) * far;
  const ref = Math.max(baseSpeed, 8);
  let want = 0;
  if (!run.finished) {
    if (gap > chaseGap) want = Math.min(PACK.CHASE_MAX * ref, (gap - chaseGap) * PACK.CHASE_GAIN * (1 + progress));
    else if (gap < -leadGap) want = Math.max(-PACK.EASE_MAX * ref, (gap + leadGap) * PACK.EASE_GAIN);
    else if (r.extra < 0) want = Math.min(PACK.RECOVER * ref, -r.extra); // give back the lifted distance, slowly
  }
  if (r.extra < 0 && want > 0) want = Math.min(want, PACK.RECOVER * ref + Math.max(0, gap - chaseGap) * PACK.CHASE_GAIN * .5);
  r.push += (want - r.push) * Math.min(1, step * PACK.RESPONSE * (1 + PACK.FINAL_SQUEEZE * progress * progress)); // reacts quicker in the final metres: photo finishes
  r.extra += r.push * step;
  if (!run.finished) {
    // chasing can never put the rival in front; lifting can never drop it behind
    const cap = run.distance - PACK.CLEARANCE - base, floor = run.distance + PACK.CLEARANCE - base;
    if (r.extra > 0 && r.extra > Math.max(0, cap)) { r.extra = Math.max(0, cap); r.push = Math.min(r.push, Math.max(0, run.speed - baseSpeed)); }
    if (r.extra < 0 && r.extra < Math.min(0, floor)) { r.extra = Math.min(0, floor); r.push = Math.max(r.push, Math.min(0, run.speed - baseSpeed)); }
  }
  r.baseDistance = base;
  r.pushing = r.push > .6;
  return { distance: base + r.extra, speed: Math.max(0, baseSpeed + r.push) };
}

export function createDuel(project, round = 1, difficulty = 'auto') {
  const offset = difficulty === 'easier' ? -DUEL.OFFSET : difficulty === 'harder' ? DUEL.OFFSET : round % 2 ? DUEL.OFFSET : -DUEL.OFFSET;
  const car = structuredClone(project);
  car.parts.nitrous = Math.max(1, car.parts.nitrous);
  const player = newRun(), st = stats(car);
  return { scale: Math.pow(st.hp * st.delivery / st.mass / DUEL.BASE_POWER_TO_WEIGHT, 2 / 3), tapBank: 0, giftBank: 0, car, player, reference: newRun('highway'), distance: raceDefinition(player.race).distance, clock: 0, tapAssist: 0, giftAssist: 0, taps: 0, gifts: 0, giftCoins: 0,
    rival: { name: offset > 0 ? 'REDLINE' : 'SHADOW', offsetPercent: Math.round(offset * 100), factor: 1 + offset, speed: 0, distance: 0, time: 0, finished: false, extra: 0, push: 0, pushing: false, baseDistance: 0, color: offset > 0 ? '#e84b46' : '#599dc8' } };
}

// moves as much banked energy into speed as the envelope allows right now; returns the speed gained (m/s)
function release(duel) {
  const run = duel.player; if (run.finished) return 0;
  const before = run.speed;
  for (const [bank, envelope] of [['tapBank', DUEL.TAP_ENVELOPE], ['giftBank', DUEL.GIFT_ENVELOPE]]) {
    if (!(duel[bank] > 0)) continue;
    const room = duel.reference.speed * envelope + DUEL.ENVELOPE_PAD - run.speed;
    if (room <= 0) continue;
    // exact kinetic energy: ½v'² = ½v² + e  (so e1 then e2 gives exactly the same speed as e1 + e2 at once)
    const w = Math.max(run.speed, DUEL.V_FLOOR), use = Math.min(duel[bank], ((w + room) ** 2 - w * w) / 2);
    run.speed += Math.sqrt(w * w + 2 * use) - w; duel[bank] -= use;
  }
  if (run.zeroTo100 === null && before < 100 / 3.6 && run.speed >= 100 / 3.6) run.zeroTo100 = run.time;
  return run.speed - before;
}

export function tapDuel(duel, count = 1) {
  if (!duel || duel.player.finished) return 0;
  const taps = Math.max(0, Math.min(10000, Number(count) || 0));
  if (!taps) return 0;
  duel.taps += taps;
  duel.tapAssist = Math.min(DUEL.TAP_ASSIST_MAX, duel.tapAssist + taps * DUEL.TAP_ASSIST);
  duel.player.nitrousUsed = Math.max(0, duel.player.nitrousUsed - taps * DUEL.TAP_NITROUS);
  duel.tapBank = Math.min(DUEL.TAP_BANK_MAX * (duel.scale ?? 1), (duel.tapBank || 0) + taps * DUEL.TAP_ENERGY * (duel.scale ?? 1));
  return release(duel) * 3.6;
}

export function giftDuel(duel, credits = 100) {
  if (!duel || duel.player.finished || !(credits > 0)) return 0;
  const coins = Math.min(100000, credits / DUEL.CREDITS_PER_COIN);
  duel.gifts++; duel.giftCoins += coins;
  duel.giftAssist = Math.min(DUEL.GIFT_ASSIST_MAX, duel.giftAssist + coins * DUEL.GIFT_ASSIST);
  duel.player.nitrousUsed = Math.max(0, duel.player.nitrousUsed - coins * DUEL.GIFT_NITROUS);
  duel.giftBank = Math.min(DUEL.GIFT_BANK_MAX * (duel.scale ?? 1), (duel.giftBank || 0) + coins * DUEL.GIFT_ENERGY * (duel.scale ?? 1));
  return release(duel) * 3.6;
}

export function advanceDuel(duel, seconds, charge = 0) {
  let remaining = Math.min(60, Math.max(0, Number(seconds) || 0));
  const target = duel.distance ?? 400;
  while (remaining > 1e-9 && !(duel.player.finished && duel.rival.finished)) {
    const step = Math.min(.02, remaining), previousDistance = duel.rival.distance;
    const boost = charge > .2 && duel.player.speed > 16 && duel.player.nitrousUsed < stats(duel.car).nitrousSeconds && !duel.player.finished;
    advanceRun(duel.player, duel.car, step, boost, Math.min(.32, duel.tapAssist + duel.giftAssist));
    advanceRun(duel.reference, duel.car, step, false);
    release(duel);
    if (duel.player.boosting) charge = Math.max(0, charge - step * 18);
    duel.tapAssist = Math.max(0, duel.tapAssist - step * DUEL.TAP_ASSIST_DECAY);
    duel.giftAssist = Math.max(0, duel.giftAssist - step * DUEL.GIFT_ASSIST_DECAY);
    if (!duel.rival.finished) {
      const { distance, speed } = packRival(duel, step, previousDistance);
      duel.rival.speed = speed;
      duel.rival.distance = Math.min(target, distance);
      duel.rival.time = duel.clock + step;
      if (distance >= target) {
        duel.rival.time = duel.clock + step * (target - previousDistance) / (distance - previousDistance);
        duel.rival.finished = true;
      }
    }
    duel.clock += step; remaining -= step;
  }
  return charge;
}

export function duelResult(duel) {
  // a car that never reached the line (safety stop) cannot win
  const complete = duel.player.finished && duel.rival.finished && duel.player.distance >= (duel.distance ?? 400) - 1e-6;
  const difference = complete ? duel.rival.time - duel.player.time : -Infinity;
  return { time: duel.player.time, rivalTime: duel.rival.time, won: difference > .005, draw: Math.abs(difference) <= .005,
    margin: Number.isFinite(difference) ? Math.abs(difference) : 0, speed: Math.round(duel.player.speed * 3.6), zero: duel.player.zeroTo100,
    rivalName: duel.rival.name, offsetPercent: duel.rival.offsetPercent, taps: duel.taps, gifts: duel.gifts,
    reward: difference > .005 ? 600 : 400 };
}
