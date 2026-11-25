// TIMBER RIDGE — shared, deterministic game rules.
// Imported by the browser game, the Node bridge and the tests, so every number lives here once.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function validCount(n, max = 1e6) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
}

/* ---------------- Gifts ---------------- */
// Every gift triggers one ACTION. The host maps gift names to actions; unmapped gifts use their coin tier.
export const ACTIONS = {
  nitro:    { label: 'NITRO',        icon: '⚡', color: '#38e8ff', effects: { nitro: 3 } },
  traction: { label: 'TRACTION',     icon: '🛞', color: '#7dff5a', effects: { grip: 8, nitro: 2 } },
  power:    { label: 'POWER',        icon: '🔥', color: '#ffb02e', effects: { power: 10, grip: 10, nitro: 3, fuel: 0.5 } },
  monster:  { label: 'MONSTER MODE', icon: '👹', color: '#ff3d6e', effects: { power: 15, grip: 15, nitro: 8, shield: 15, fuel: 1 } },
  jump:     { label: 'MEGA JUMP',    icon: '🚀', color: '#c78bff', effects: { jump: 1 } },
  fuel:     { label: 'REFUEL',       icon: '⛽', color: '#ff6b5a', effects: { fuel: 0.5 } },
  shield:   { label: 'SHIELD',       icon: '🛡', color: '#7fe7ff', effects: { shield: 8 } },
};
export const ACTION_IDS = Object.keys(ACTIONS);

// Coin tiers for gifts that are not in the host's list.
export const GIFT_TIERS = [
  { action: 'nitro', min: 1, range: '1–9' },
  { action: 'traction', min: 10, range: '10–99' },
  { action: 'power', min: 100, range: '100–999' },
  { action: 'monster', min: 1000, range: '1000+' },
].map(t => ({ ...t, key: t.action, label: ACTIONS[t.action].label, color: ACTIONS[t.action].color }));

export const DEFAULT_GIFT_MAP = [
  { name: 'Rose', action: 'nitro' },
  { name: 'TikTok', action: 'jump' },
  { name: 'Finger Heart', action: 'traction' },
  { name: 'Ice Cream Cone', action: 'fuel' },
  { name: 'Doughnut', action: 'power' },
  { name: 'Hand Hearts', action: 'shield' },
  { name: 'Galaxy', action: 'monster' },
];

export function sanitizeGiftMap(list) {
  if (!Array.isArray(list)) return DEFAULT_GIFT_MAP.map(r => ({ ...r }));
  const seen = new Set(), out = [];
  for (const r of list.slice(0, 24)) {
    const name = String(r?.name || '').trim().slice(0, 40), key = name.toLowerCase();
    if (!name || seen.has(key) || !ACTIONS[r?.action]) continue;
    seen.add(key); out.push({ name, action: r.action });
  }
  return out;
}

export const EFFECT_CAPS = { nitro: 20, grip: 45, power: 45, shield: 30 };
export const EFFECT_MULT = { power: 1.8, grip: 1.5, nitroTopSpeed: 1.4 };

export function giftTier(coins) {
  coins = Math.max(1, Number(coins) || 1);
  return coins >= 1000 ? 3 : coins >= 100 ? 2 : coins >= 10 ? 1 : 0;
}

/** Which action a gift triggers: the host's list wins (case-insensitive name), otherwise the coin tier. */
export function actionForGift(name, coins, map = []) {
  const key = String(name || '').trim().toLowerCase();
  const hit = key && map.find(r => r.name.toLowerCase() === key);
  return hit ? hit.action : GIFT_TIERS[giftTier(coins)].action;
}

/**
 * Applies `count` uses of an action. Each use adds its seconds; totals are capped.
 * Returns { effects, fuel (tank fraction 0..1), jumps }.
 */
export function applyAction(effects, action, count) {
  const a = ACTIONS[action] || ACTIONS.nitro;
  count = validCount(count);
  const out = { nitro: 0, grip: 0, power: 0, shield: 0, ...effects };
  let fuel = 0, jumps = 0;
  if (!count) return { effects: out, fuel, jumps };
  for (const [k, v] of Object.entries(a.effects)) {
    if (k === 'fuel') fuel = Math.min(1, v * count);
    else if (k === 'jump') jumps = 1;
    else out[k] = Math.min(EFFECT_CAPS[k], Math.max(0, out[k] || 0) + v * count);
  }
  return { effects: out, fuel, jumps };
}
// Backwards-compatible helper: apply a coin tier.
export const applyGift = (effects, tier, count) => applyAction(effects, GIFT_TIERS[clamp(Math.floor(tier) || 0, 0, 3)].action, count);

// In-game coins a gift adds to the garage wallet: 5 per TikTok coin, bounded.
export const giftWallet = (coins, count) => Math.min(100000, Math.round(Math.max(1, Number(coins) || 1) * validCount(count) * 5));

/* ---------------- Taps / likes ---------------- */
// Crowd power decays exponentially, so a steady tap rate settles at  power = gain × taps/s ÷ decay
// = 0.1 × taps per second  (3 taps/s → 30 %, 6 → 60 %, 10+ → 100 %).
export const TAP = { gain: 0.05, decay: 0.5, fastDecay: 1.6, idleDelay: 0.9, idleThrottle: 0.35 };
export const steadyPower = tapsPerSecond => clamp((TAP.gain * Math.max(0, tapsPerSecond)) / TAP.decay, 0, 1);

// LIVE likes are divided so a big audience cannot instantly max the jeep. Manual taps are unscaled.
export const likeDivisor = viewers => Math.max(1, (Number(viewers) || 0) * 0.03);
export const effectiveTaps = (likes, viewers) => validCount(likes) / likeDivisor(viewers);

/** Crowd power 0..1. `sinceTap` = seconds since the last tap (before this step). */
export function stepTapPower(p, taps, dt, sinceTap) {
  p = clamp(p + Math.max(0, taps) * TAP.gain, 0, 1);
  const k = sinceTap > TAP.idleDelay ? TAP.fastDecay : TAP.decay;
  return clamp(p * Math.exp(-k * dt), 0, 1);
}
// The jeep never drives by itself: below 4 % crowd power the engine idles and the brakes hold it.
// Once the crowd taps, throttle = 35 % + 65 % × power.
export const ENGINE_ON = 0.04;
export const throttleFor = p => (p < ENGINE_ON ? 0 : TAP.idleThrottle + (1 - TAP.idleThrottle) * clamp(p, 0, 1));
// Top-speed limiter: 45 % with no crowd, 100 % at full crowd power.
export const speedShareFor = p => 0.45 + 0.55 * clamp(p, 0, 1);

/* ---------------- Viewer actions ---------------- */
export const SOCIAL = {
  commentTaps: 3,          // any chat message = 3 taps (once per user every 4 s)
  commentCooldown: 4,
  followFuel: 0.12,        // follow = +12 % fuel
  shareGrip: 6,            // share = +6 s traction
  jumpCooldown: 3,         // chat "jump" / "sari" / "hop" makes the jeep hop
  jumpSpeed: 4.6,          // m/s upward impulse
  megaJumpSpeed: 7.5,      // gift MEGA JUMP (ignores the chat cooldown)
};
export const JUMP_WORDS = /\b(jump|sari|hop|salt|up)\b/i;

/* ---------------- Leaderboard score ---------------- */
// 1 point per effective tap, 10 points per TikTok coin.
export const scoreFor = ({ taps = 0, coins = 0 } = {}) => Math.round(Math.max(0, taps) + 10 * Math.max(0, coins));

/* ---------------- Upgrades ---------------- */
export const UPGRADES = {
  engine:     { name: 'ENGINE',     base: 150, max: 10, info: '+12% torque, +6% top speed' },
  suspension: { name: 'SUSPENSION', base: 120, max: 10, info: '+5% springs, +4% travel, steadier air' },
  tires:      { name: 'TIRES',      base: 130, max: 10, info: '+7% grip' },
  tank:       { name: 'FUEL TANK',  base: 100, max: 10, info: '+15% capacity' },
  nitro:      { name: 'NITRO',      base: 160, max: 10, info: '+10% nitro thrust' },
};
export const UPGRADE_IDS = Object.keys(UPGRADES);

export function upgradeCost(id, level) {
  const u = UPGRADES[id];
  if (!u || level >= u.max) return Infinity;
  return Math.round((u.base * 1.45 ** level) / 5) * 5;
}

/** Buys the cheapest affordable upgrade repeatedly. Returns { levels, coins, bought: [ids] }. */
export function autoUpgrade(levels, coins) {
  levels = { ...levels };
  const bought = [];
  for (;;) {
    let best = null, bestCost = Infinity;
    for (const id of UPGRADE_IDS) {
      const c = upgradeCost(id, levels[id] || 0);
      if (c < bestCost) { best = id; bestCost = c; }
    }
    if (!best || bestCost > coins) break;
    coins -= bestCost;
    levels[best] = (levels[best] || 0) + 1;
    bought.push(best);
  }
  return { levels, coins, bought };
}

export function vehicleStats(levels = {}) {
  const e = levels.engine || 0, s = levels.suspension || 0, t = levels.tires || 0, k = levels.tank || 0, n = levels.nitro || 0;
  return {
    torque: 8000 * (1 + 0.12 * e),        // N·m at full throttle, split over both wheels (4x4)
    topSpeed: 15 * (1 + 0.06 * e),        // m/s at full crowd power
    springK: 32000 * (1 + 0.05 * s),      // N/m per wheel (soft, long-travel)
    damping: 4100 * (1 + 0.05 * s),       // N·s/m per wheel
    travel: 0.53 * (1 + 0.04 * s),        // m of suspension travel
    stability: 1 + 0.1 * s,               // air / anti-flip assist
    grip: 1.15 * (1 + 0.07 * t),          // mud-terrain tyre friction coefficient
    tank: 100 * (1 + 0.15 * k),           // fuel units
    nitroForce: 6500 * (1 + 0.1 * n),     // N
  };
}

// Fuel units per second: 0.1 idling, up to 1.3 at full throttle.
export const fuelBurn = throttle => 0.1 + 1.2 * clamp(throttle, 0, 1);

/* ---------------- Levels ---------------- */
export const BIOMES = [
  { id: 'forest', name: 'GREEN FOREST' },
  { id: 'sunset', name: 'PINE SUNSET' },
  { id: 'autumn', name: 'AUTUMN VALLEY' },
  { id: 'night',  name: 'MOONLIGHT WOODS' },
  { id: 'snow',   name: 'FROZEN RIDGE' },
];

export function levelConfig(n) {
  n = Math.max(1, Math.floor(Number(n) || 1));
  return {
    level: n,
    length: Math.min(2500, 900 + 150 * (n - 1)),       // metres to the finish
    rough: Math.min(1, 0.22 + 0.06 * (n - 1)),          // terrain difficulty 0..1
    featureEvery: Math.max(24, 62 - 3 * (n - 1)),       // average metres between rocks, ledges and traps
    biome: BIOMES[(n - 1) % BIOMES.length],
    seed: (1000 + n * 7919) >>> 0,
    reward: 150 + 75 * n,
    checkpointEvery: 150,
    coinValue: 5,
  };
}

// Level flow timings (seconds)
export const FLOW = { intro: 3, countdown: 3, finish: 5 };
