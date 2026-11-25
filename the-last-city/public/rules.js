// THE LAST CITY — shared, deterministic game rules.
// Imported by the browser game, the Node bridge and the tests, so every number lives here once.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function validCount(n, max = 1e6) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
}

/* ---------------- World layout (canvas units, 1080 × 1920 portrait) ---------------- */
export const WORLD = {
  W: 1080, H: 1920,
  // The horde comes down from the dark forest at the top; the city is at the bottom, behind its wall.
  wallY: 1160,         // outer (zombie-facing) edge of the city wall
  attackY: 1112,       // where zombies stand while hitting the wall
  coreY: 1530,         // the castle gate (city core) zombies go for once the wall is breached
  gateX: 540,
  spawnY: 480,         // zombies emerge on the ground below the distant treeline
  fieldX: [70, 1010],
};

/* ---------------- Gifts ---------------- */
// Every gift triggers one ACTION. The host maps gift names to actions; unmapped gifts use their coin tier.
// BUILD actions (repair, turret, barricade) apply at once, even between waves.
// COMBAT actions (rapid, freeze, airstrike, doomsday) are saved while no wave is running and fire at GO.
export const ACTIONS = {
  rapid:     { label: 'RAPID FIRE',  icon: '🏹', color: '#38e8ff', build: false, effects: { rapid: 4 } },
  repair:    { label: 'REPAIR WALL', icon: '🔨', color: '#7dff5a', build: true,  effects: { repair: 0.25 } },
  turret:    { label: 'BUILD TURRET', icon: '💣', color: '#ffb02e', build: true,  effects: { turret: 1 } },
  recruit:   { label: 'RECRUIT SOLDIER', icon: '🪖', color: '#89ccff', build: true, effects: { recruits: 1 } },
  upgrade:   { label: 'AUTO UPGRADE', icon: '⚒', color: '#e3bbff', build: true, effects: { upgrades: 1 } },
  freeze:    { label: 'FREEZE',      icon: '❄', color: '#9fe8ff', build: false, effects: { freeze: 5 } },
  airstrike: { label: 'METEOR STRIKE', icon: '☄', color: '#ff7a2e', build: false, effects: { meteors: 3 } },
  barricade: { label: 'BARRICADE',   icon: '🛡', color: '#7fb8ff', build: true,  effects: { shield: 0.4, repair: 0.15 } },
  doomsday:  { label: 'DRAGON FIRE', icon: '🐉', color: '#ff3d6e', build: false, effects: { nuke: 1, rapid: 6, repair: 0.2, shield: 0.15 } },
};
export const ACTION_IDS = Object.keys(ACTIONS);

// Coin tiers for gifts that are not in the host's list.
export const GIFT_TIERS = [
  { action: 'rapid', min: 1, range: '1–9' },
  { action: 'turret', min: 10, range: '10–99' },
  { action: 'airstrike', min: 100, range: '100–999' },
  { action: 'doomsday', min: 1000, range: '1000+' },
].map(t => ({ ...t, key: t.action, label: ACTIONS[t.action].label, color: ACTIONS[t.action].color }));

export const DEFAULT_GIFT_MAP = [
  { name: 'Rose', action: 'rapid' },
  { name: 'TikTok', action: 'repair' },
  { name: 'Finger Heart', action: 'turret' },
  { name: 'Ice Cream Cone', action: 'freeze' },
  { name: 'Doughnut', action: 'airstrike' },
  { name: 'Hand Hearts', action: 'barricade' },
  { name: 'Galaxy', action: 'doomsday' },
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

// Timed effects stack per gift up to these caps (seconds). Shield is a fraction of the wall's max HP.
export const EFFECT_CAPS = { rapid: 25, freeze: 15, shield: 1 };
export const RAPID_MULT = 2;              // rapid fire doubles everyone's fire rate
export const METEOR = { damage: 110, radius: 105, delay: 0.9, max: 30 };
export const NUKE = { damage: 280, normalShare: 0.65, bossShare: 0.2 };
export const GARRISON = { base: 3, max: 12 };
export const LIGHTING = { radius: 36, opacity: 0.075, shakePixels: 1.2 };

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
 * Sums `count` uses of an action into a plain effect bundle:
 * { rapid, freeze, shield (fraction), repair (fraction), turrets, meteors, nukes }. Timed values are capped.
 */
export function actionBundle(action, count, into = null) {
  const a = ACTIONS[action] || ACTIONS.rapid;
  count = validCount(count);
  const b = into || { rapid: 0, freeze: 0, shield: 0, repair: 0, turrets: 0, meteors: 0, nukes: 0, recruits: 0, upgrades: 0 };
  if (!count) return b;
  const e = a.effects;
  if (e.rapid) b.rapid = Math.min(EFFECT_CAPS.rapid, b.rapid + e.rapid * count);
  if (e.freeze) b.freeze = Math.min(EFFECT_CAPS.freeze, b.freeze + e.freeze * count);
  if (e.shield) b.shield = Math.min(EFFECT_CAPS.shield, b.shield + e.shield * count);
  if (e.repair) b.repair = Math.min(1, b.repair + e.repair * count);
  if (e.turret) b.turrets = Math.min(60, b.turrets + e.turret * count);
  if (e.meteors) b.meteors = Math.min(METEOR.max, b.meteors + e.meteors * count);
  if (e.nuke) b.nukes = Math.min(3, b.nukes + e.nuke * count);
  if (e.recruits) b.recruits = Math.min(GARRISON.max, (b.recruits || 0) + e.recruits * count);
  if (e.upgrades) b.upgrades = Math.min(50, (b.upgrades || 0) + e.upgrades * count);
  return b;
}

// In-game coins (scrap) a gift adds to the armory: 5 per TikTok coin, bounded.
export const giftWallet = (coins, count) => Math.min(100000, Math.round(Math.sqrt(Math.max(1, Number(coins) || 1)) * validCount(count) * 5));

/* ---------------- Taps / likes ---------------- */
// Crowd power decays exponentially, so a steady tap rate settles at  power = 0.1 × taps per second.
export const TAP = { gain: 0.05, decay: 0.5, fastDecay: 1.6, idleDelay: 0.9 };
export const steadyPower = tapsPerSecond => clamp((TAP.gain * Math.max(0, tapsPerSecond)) / TAP.decay, 0, 1);

// LIVE likes are divided so a big audience cannot instantly max the city. Manual taps are unscaled.
export const likeDivisor = viewers => Math.max(1, (Number(viewers) || 0) * 0.03);
export const effectiveTaps = (likes, viewers) => validCount(likes) / likeDivisor(viewers);

export function stepTapPower(p, taps, dt, sinceTap) {
  p = clamp(p + Math.max(0, taps) * TAP.gain, 0, 1);
  const k = sinceTap > TAP.idleDelay ? TAP.fastDecay : TAP.decay;
  return clamp(p * Math.exp(-k * dt), 0, 1);
}
// FIREPOWER: survivors always defend, but slowly. Crowd taps speed every bow, crossbow and musket up:
// fire-rate multiplier = 40 % with nobody tapping, 140 % at full crowd power.
export const fireMultFor = p => 0.4 + 1.0 * clamp(p, 0, 1);

/* ---------------- Viewer actions ---------------- */
export const SOCIAL = {
  commentTaps: 3,          // any chat message = 3 taps (once per viewer every 4 s)
  commentCooldown: 4,
  repairWordCooldown: 10,  // chat "repair" / "fix" / "build" patches the wall (once per viewer every 10 s)
  repairWordAmount: 0.015, // +1.5 % wall
  followRepair: 0.08,      // follow = +8 % wall
  shareRapid: 6,           // share = +6 s rapid fire
};
export const REPAIR_WORDS = /\b(repair|fix|build|repara|construie|wall|zid)\b/i;
export const JOIN_WORDS = /^\s*[!/\.]?(join|play|defend|intru|particip)\s*[!.]?\s*$/i;

/* ---------------- Survivors ---------------- */
// Every viewer who taps, comments, follows, shares or gifts becomes a survivor on the wall.
export const SURVIVORS = {
  wallSlots: 16,           // survivors shown shooting from the wall (most recently active)
  activeFor: 90,           // seconds a viewer stays on the wall after their last action
  baseInterval: 1.15,      // seconds between shots at ×1 fire rate
  baseDamage: 10,
  range: 460,             // px: let the horde emerge and approach before engaging
  adrenaline: 2.5,         // a viewer's own tap makes their survivor shoot 50 % faster for this long
};
export const survivorLevel = points => clamp(1 + Math.floor(Math.log2(1 + Math.max(0, points) / 15)), 1, 10);
export const survivorDamageMult = level => 1 + 0.22 * (clamp(level, 1, 10) - 1);
export const WEAPONS = [
  { id: 'bow', name: 'BOW', from: 1 },
  { id: 'crossbow', name: 'CROSSBOW', from: 3 },
  { id: 'musket', name: 'MUSKET', from: 6 },
  { id: 'cannon', name: 'HAND CANNON', from: 9 },
];
export const weaponFor = level => [...WEAPONS].reverse().find(w => level >= w.from);
// The host's own defender is always on the gate tower, so the city is never empty.
export const CAPTAIN = { name: 'CAPTAIN', level: 4 };

/* ---------------- Turrets ---------------- */
export const TURRET = { slots: 6, maxLevel: 5, damage: 46, radius: 85, interval: 1.7, levelDamage: 0.45, range: 500 };

/* ---------------- Leaderboard score ---------------- */
// 1 point per effective tap, 10 points per TikTok coin, 2 points per kill.
export const scoreFor = ({ taps = 0, coins = 0, kills = 0 } = {}) => Math.round(Math.max(0, taps) + 10 * Math.max(0, coins) + 2 * Math.max(0, kills));

/* ---------------- Armory upgrades ---------------- */
export const UPGRADES = {
  walls:   { name: 'STONE WALLS', base: 120, max: 10, info: '+15% wall HP, +regen' },
  arrows:  { name: 'STEEL ARROWS', base: 150, max: 10, info: '+12% survivor damage' },
  drill:   { name: 'DRILL',        base: 140, max: 10, info: '+8% fire rate' },
  cannons: { name: 'CANNONS',      base: 160, max: 10, info: '+15% turret damage' },
  medics:  { name: 'MASONS',       base: 100, max: 10, info: '+0.2% wall repair per second' },
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

export function cityStats(levels = {}) {
  const w = levels.walls || 0, a = levels.arrows || 0, d = levels.drill || 0, c = levels.cannons || 0, m = levels.medics || 0;
  return {
    wallHp: 1200 * (1 + 0.15 * w),
    coreHp: 600 * (1 + 0.1 * w),
    regen: 0.002 * m + 0.0005 * w,         // fraction of wall HP per second, only between attacks (see sim)
    damage: 1 + 0.12 * a,
    fireRate: 1 + 0.08 * d,
    turretDamage: 1 + 0.15 * c,
  };
}

/* ---------------- Zombies ---------------- */
// hp at wave 1, walking speed (px/s), wall damage per second, scrap coins on kill, body size.
export const ZOMBIES = {
  walker: { hp: 44, speed: 43, dps: 8, interval: 1.35, coins: 1, size: 1 },
  runner: { hp: 28, speed: 86, dps: 6, interval: 0.85, coins: 1, size: 0.9 },
  brute:  { hp: 200, speed: 30, dps: 24, interval: 1.8, coins: 4, size: 1.65, armor: 0.3 },
  boss:   { hp: 2200, speed: 24, dps: 95, interval: 2.2, coins: 60, size: 2.9, armor: 0.25 },
};

/* ---------------- Waves ---------------- */
export const NIGHTS = [
  { id: 'night', name: 'MOONLIT SIEGE' },
  { id: 'dusk', name: 'BLOOD DUSK' },
  { id: 'fog', name: 'GREEN FOG' },
  { id: 'storm', name: 'THUNDER NIGHT' },
  { id: 'winter', name: 'FROZEN HORDE' },
];

/**
 * Wave n. `falls` = how many times the city fell on this wave in a row: each fall makes the
 * horde 20 % weaker (to 40 % at most), so a stream can never be stuck forever.
 */
export function waveConfig(n, falls = 0, fortification = 0) {
  n = clamp(Math.floor(Number(n) || 1), 1, 1000);
  const relief = Math.max(0.4, 1 - 0.2 * Math.max(0, falls));
  const count = Math.min(360, 48 + 16 * (n - 1));
  const pressure = 1 + clamp(fortification, 0, 1.2);
  const runners = n >= 2 ? Math.min(0.35, 0.1 + 0.025 * (n - 2)) : 0;
  const brutes = n >= 3 ? Math.min(0.18, 0.04 + 0.015 * (n - 3)) : 0;
  return {
    wave: n,
    count,
    mix: { runner: runners, brute: brutes },
    boss: n % 5 === 0 ? Math.min(4, 1 + Math.floor(n / 15)) : 0,
    hpMult: (1 + 0.2 * (n - 1) + 0.012 * (n - 1) ** 2) * relief * pressure,
    attackMult: (1 + 0.075 * (n - 1)) * pressure,
    sizeMult: 1 + Math.min(0.45, (n - 1) * 0.014),
    pressure,
    speedMult: Math.min(1.6, 1 + 0.03 * (n - 1)),
    spawnTime: Math.min(42, 14 + 1.5 * (n - 1)),
    night: NIGHTS[(n - 1) % NIGHTS.length],
    seed: (2000 + n * 7919 + falls * 104729) >>> 0,
    reward: 80 + 30 * n,
    relief,
  };
}
// Falling back: the wave restarts from its checkpoint (waves 1, 6, 11, …).
export const checkpointFor = n => Math.max(1, Math.floor((Math.max(1, n) - 1) / 5) * 5 + 1);

// Flow timings (seconds)
export const FLOW = { intro: 3, countdown: 3, clear: 5, fallen: 6 };
