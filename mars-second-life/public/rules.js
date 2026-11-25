// Shared rules for the browser game and the local bridge (no DOM, no Three.js).

// The five places of the colony. Order = the "gift 1 … gift 5" order shown on screen.
export const LOCATIONS = [
  { id: 'park', name: 'Olympus Gardens', short: 'PARK', icon: '🌳', color: '#59e38a' },
  { id: 'cafe', name: 'Red Planet Café', short: 'CAFÉ', icon: '☕', color: '#ffb35c' },
  { id: 'cathedral', name: 'Cathedral of Stars', short: 'CATHEDRAL', icon: '⛪', color: '#b9a7ff' },
  { id: 'studio', name: 'Nova Studio', short: 'STUDIO', icon: '🎧', color: '#ff4fd8' },
  { id: 'skyport', name: 'Phobos Skyport', short: 'SKYPORT', icon: '🚀', color: '#5cd6ff' },
];
export const LOCATION_IDS = LOCATIONS.map(l => l.id);
export const locationById = id => LOCATIONS.find(l => l.id === id) || LOCATIONS[0];

// Default gift list: TikTok gift name (as TikTok shows it) → place.
export const DEFAULT_GIFT_MAP = [
  { name: 'Rose', loc: 'park' },
  { name: 'TikTok', loc: 'cafe' },
  { name: 'Finger Heart', loc: 'cathedral' },
  { name: 'Doughnut', loc: 'studio' },
  { name: 'Hand Hearts', loc: 'skyport' },
];

export function validCount(value, max = 1e5) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
}

export function sanitizeGiftMap(map) {
  if (!Array.isArray(map)) return DEFAULT_GIFT_MAP.map(g => ({ ...g }));
  const out = [], seen = new Set();
  for (const row of map.slice(0, 30)) {
    const name = String(row?.name || '').trim().slice(0, 40);
    const key = name.toLowerCase();
    if (!name || seen.has(key) || !LOCATION_IDS.includes(row?.loc)) continue;
    seen.add(key); out.push({ name, loc: row.loc });
  }
  return out;
}

// Gifts that are not in the list go somewhere by value, so no gift is ever ignored.
export function locationByCoins(coins) {
  const c = Math.max(1, Number(coins) || 1);
  if (c >= 100) return 'skyport';
  if (c >= 30) return 'studio';
  if (c >= 10) return 'cathedral';
  if (c >= 2) return 'cafe';
  return 'park';
}

export function locationForGift(name, coins, map = DEFAULT_GIFT_MAP) {
  const key = String(name || '').trim().toLowerCase();
  const hit = map.find(g => g.name.toLowerCase() === key);
  return hit ? hit.loc : locationByCoins(coins);
}

// How strong the moment is: 0 normal, 1 fireworks, 2 ship fly-over + gold plumbob.
export function giftHype(coins, count = 1) {
  const total = Math.max(1, Number(coins) || 1) * Math.max(1, Number(count) || 1);
  return total >= 1000 ? 2 : total >= 99 ? 1 : 0;
}

// Close-up length in seconds; shorter when many gifts are waiting.
export function shotSeconds(coins, count, queued) {
  const total = Math.max(1, coins) * Math.max(1, count);
  const base = 4.2 + Math.min(3.5, Math.log10(total) * 1.4);
  return queued > 4 ? 2.6 : queued > 2 ? Math.min(base, 3.4) : base;
}

// Stable choice of body for a viewer, so the same person always looks the same.
export function hashString(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
