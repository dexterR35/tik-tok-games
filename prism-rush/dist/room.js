import { Engine, moves, matches, copyBoard, scoreWave, addTally, validIce } from './engine.js';
import { MOTION, fallDuration, speedFor } from './motion.js';
import { levelSpec, newProgress, goalHave, goalsComplete, needFor, starsFor, COLOR_NAMES } from './levels.js';

// ---- Tap-driven rules (all integers, all exact) ----
// * Every received tap is exactly one move: one random legal swap.
//   Ledger invariant: received = played + pending, at every moment.
// * Pending taps are served round-robin per viewer (one heavy tapper cannot
//   starve others).
// * Step mode: one tap = one step = exactly one swap. Its match explodes and
//   the gems above fall (new gems never land in a line), then the board
//   stops. A line made by gems sliding down waits for the next step.
// * Tap points are a quarter of the wave score (TAP_DIVISOR); gift powers
//   score in full. Points of a multi-tap turn are split exactly between its
//   tappers (equal shares, remainder to the earliest tappers).
// * No autopilot: with no taps and no gifts the board waits.
export const TAP_DIVISOR = 4, TAP_BATCH = 12, JOKER_POINTS = 500, HERO_HISTORY = 200, MAX_GIFT_STEPS = 12;
// Gifts get automatic smart steps by value: steps = 1 + floor(log2(coins)),
// capped at 12 (1 coin = 1 step, 5 = 3, 30 = 5, 100 = 7, 1,000 = 10). Power
// gifts use their first step for the power. Host test buttons use these
// typical coin values.
export const GIFT_COINS = Object.freeze({ rose: 1, meteor: 5, prism: 30, supernova: 1000 });
export const giftSteps = coins => Math.min(MAX_GIFT_STEPS, 1 + Math.floor(Math.log2(Math.max(1, Math.floor(coins) || 1))));
export const POWERS = {
  tap: { name: 'Tap move', detail: 'Each tap = one random swap', icon: '♡' },
  rose: { name: 'Smart move', detail: 'Best swaps for the goals', icon: '✦' },
  meteor: { name: 'Meteor', detail: '3 × 3 nova blast', icon: '☄' },
  prism: { name: 'Prism', detail: 'One color in a 5 × 5 area', icon: '◈' },
  supernova: { name: 'Supernova', detail: '5 × 5 area blast', icon: '✹' },
};
const FAST = new Set(['idle', 'swap', 'power', 'explode', 'fall', 'shuffle']);
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const clean = (v, length = 28) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, length);
const addSafe = (a, b) => Math.min(Number.MAX_SAFE_INTEGER, a + b);
const normalize = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
// Only https photos from TikTok's image servers are kept (they are fetched
// later by the local server's avatar proxy).
export function cleanAvatar(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:' || String(url).length > 1000) return '';
    return /(^|\.)(tiktokcdn|tiktokcdn-us|tiktokcdn-eu|ibyteimg|byteimg|muscdn|tiktok)\.(com|net)$/.test(u.hostname) ? u.href : '';
  } catch { return ''; }
}
const validProgress = p => p && Array.isArray(p.colors) && p.colors.length === 6 && ['ice', 'beam', 'nova', 'prism', 'cleared', 'score'].every(k => Number.isFinite(p[k]));

export class Room {
  constructor({ seed = 732941, saved = null, now = Date.now() } = {}) {
    this.now = now;
    // Work on a private copy: the caller's save object must never be shared
    // between rooms (shared phase objects would freeze one of them).
    saved = saved ? structuredClone(saved) : null;
    this.engine = new Engine(seed, saved?.engine);
    const { roundSeconds, auto, demo, ...settings } = saved?.settings || {};
    this.settings = { relayUrl: 'ws://localhost:3000/ws', mappings: { rose: 'Rose', meteor: 'Finger Heart,GG', prism: 'Heart', supernova: 'Galaxy' }, ...settings, demo: false };
    this.score = saved?.score || 0;
    this.bestChain = saved?.bestChain || 0; this.totalCleared = saved?.totalCleared || 0;
    this.chest = saved?.chest || 0; this.chests = saved?.chests || 0;
    this.users = new Map((saved?.users || []).slice(0, 5000).map(p => [p.id, p]));
    this.queue = (saved?.queue || []).filter(a => a.type !== 'tap').slice(0, 512).map(a => {
      // Older saves stored gifts as units only: give them their step budget.
      if (Number.isSafeInteger(a.powers) && Number.isSafeInteger(a.smart)) return a;
      const powers = a.type === 'rose' ? 0 : 1, steps = giftSteps(GIFT_COINS[a.type] * (a.units || 1));
      return { ...a, powers, smart: Math.max(0, steps - powers), credited: a.credited || 0 };
    });
    this.history = (saved?.history || []).filter(h => h.level && h.heroes).slice(0, 8);
    this.log = []; this.sequence = saved?.sequence || 0;
    this.paused = false;
    this.live = { state: 'disconnected', live: false, text: 'Waiting for viewers · no TikTok account connected', username: '' };
    this.rejected = 0; this.votes = new Map(); this.ranking = null;
    const v3 = saved?.version === 3;
    // Tap ledger. A version-2 save stored no ledger, so it starts empty.
    this.taps = v3 && saved.taps ? { received: saved.taps.received, played: saved.taps.played } : { received: 0, played: 0 };
    this.tapPending = new Map(v3 ? (saved.taps?.pending || []) : []);
    this.tapOrder = v3 ? (saved.taps?.order || []).filter(id => this.tapPending.has(id)) : [];
    this.pendingTotal = [...this.tapPending.values()].reduce((a, b) => a + b, 0);
    if (this.taps.received !== this.taps.played + this.pendingTotal) this.taps.received = this.taps.played + this.pendingTotal;
    for (const p of this.users.values()) p.tapsPlayed = v3 ? (p.tapsPlayed ?? Math.max(0, (p.likes || 0) - (this.tapPending.get(p.id) || 0))) : 0;
    this.levelStars = v3 && saved.levelStars ? { ...saved.levelStars } : {};
    this.heroes = v3 && saved.heroes ? { ...saved.heroes } : {};
    this.unlocked = v3 ? Math.max(1, saved.unlocked || 1) : 1;
    const resumable = v3 && saved.level && validProgress(saved.level.progress) && validIce(saved.engine?.ice);
    if (resumable) {
      this.level = { ...saved.level, progress: { ...saved.level.progress, colors: [...saved.level.progress.colors] } };
      this.spec = levelSpec(this.level.n);
      this.phase = saved.phase || { type: 'idle', duration: MOTION.idle, id: 0 };
      this.phase.start = now;
      if (saved.phaseRemaining !== undefined) this.phase.start = now - Math.max(0, this.phase.duration - saved.phaseRemaining);
      this.current = saved.current || null; this.pendingHit = saved.pendingHit || null;
      this.chain = saved.chain || 0; this.active = saved.active || this.waitingActive();
      this.analysis = saved.analysis || null; this.lastResult = saved.lastResult || null; this.lastLevel = saved.lastLevel || null;
      this.forceComplete = !!saved.forceComplete;
    } else {
      // New session or an older save: lifetime score, viewers and chests are
      // kept; the 150-level roadmap starts at level 1.
      for (const p of this.users.values()) { p.roundScore = 0; p.levelTaps = 0; p.levelGifts = 0; }
      this.current = null; this.pendingHit = null; this.chain = 0; this.analysis = null; this.lastResult = null; this.lastLevel = null;
      this.active = this.waitingActive();
      this.startLevel(1);
    }
    this.removeParticipants(p => p.source === 'demo');
    this.emit('welcome', `Level ${this.level.n} · ${this.spec.worldName}. Tap to play!`);
  }
  waitingActive() { return { name: 'Waiting for taps', type: 'wait', label: 'Every tap is one move' }; }
  emit(type, text, extra = {}) {
    const event = { id: ++this.sequence, type, text: clean(text, 150), at: this.now, ...extra };
    this.log.unshift(event); this.log.length = Math.min(14, this.log.length); return event;
  }
  participant(user = {}, source = 'live') {
    const id = clean(user.id || user.uniqueId || user.name || 'viewer', 80);
    if (!this.users.has(id)) {
      if (this.users.size >= 5000) {
        this.rejected++; this.emit('warning', 'Participant limit reached (5,000). Existing viewers can keep playing.'); return null;
      }
      this.users.set(id, { id, name: clean(user.name || user.nickname || user.uniqueId || id), score: 0, roundScore: 0, likes: 0, tapsPlayed: 0, gifts: 0, levelTaps: 0, levelGifts: 0, trophies: 0, source, avatar: '' });
    }
    const p = this.users.get(id); p.name = clean(user.name || user.nickname || p.name);
    const avatar = cleanAvatar(user.avatar || user.profilePictureUrl); if (avatar) p.avatar = avatar;
    this.ranking = null; return p;
  }
  // ---------- Tap ledger ----------
  like(user, count, source = 'live') {
    count = Number(count);
    if (!Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(this.taps.received + count)) {
      this.rejected++; this.emit('warning', 'Tap packet rejected: count must be a positive safe integer within counter capacity.'); return false;
    }
    const p = this.participant(user, source); if (!p) return false;
    p.likes = addSafe(p.likes, count);
    this.taps.received += count; this.pendingTotal += count;
    if (!this.tapPending.has(p.id)) this.tapOrder.push(p.id);
    this.tapPending.set(p.id, (this.tapPending.get(p.id) || 0) + count);
    this.activeTap = { id: p.id, name: p.name, at: this.now, count };
    this.wake();
    return true;
  }
  takeTap() {
    const id = this.tapOrder.shift(), left = this.tapPending.get(id) - 1;
    if (left > 0) { this.tapPending.set(id, left); this.tapOrder.push(id); } else this.tapPending.delete(id);
    this.pendingTotal--; this.taps.played++;
    const p = this.users.get(id); if (p) { p.tapsPlayed++; p.levelTaps = (p.levelTaps || 0) + 1; }
    return id;
  }
  // Remove simulated/test input before admitting a LIVE session. Remove
  // its counters as well, so historical test taps cannot masquerade as LIVE.
  removeParticipants(predicate) {
    const removed = new Set([...this.users.values()].filter(predicate).map(p => p.id));
    if (!removed.size) return;
    for (const id of removed) { this.users.delete(id); this.tapPending.delete(id); this.votes.delete(id); this.engine.jokerBacklog.delete(id); }
    this.tapOrder = this.tapOrder.filter(id => !removed.has(id));
    this.pendingTotal = [...this.tapPending.values()].reduce((n, count) => n + count, 0);
    this.taps.played = [...this.users.values()].reduce((n, p) => n + (p.tapsPlayed || 0), 0);
    this.taps.received = this.taps.played + this.pendingTotal;
    this.queue = this.queue.filter(a => !removed.has(a.userId));
    this.engine.jokerQueue = this.engine.jokerQueue.filter(id => !removed.has(id));
    for (let i = 0; i < this.engine.board.length; i++) if (removed.has(this.engine.board[i]?.joker)) this.engine.board[i] = this.engine.tile();
    const survivingTapper = this.current?.tappers?.find(id => !removed.has(id));
    if (this.current && removed.has(this.current.userId) && !survivingTapper) {
      // Cancel only test animation; real viewer actions and their pending
      // ledger survive reconnects. Stabilizing here grants no extra points.
      this.current = null; this.pendingHit = null; this.chain = 0;
      this.engine.shuffle(); this.active = this.waitingActive(); this.analysis = null;
      this.setPhase('idle', MOTION.queued);
    } else if (survivingTapper && removed.has(this.current.userId)) {
      const p = this.users.get(survivingTapper);
      Object.assign(this.current, { userId: p.id, name: p.name, source: p.source });
      Object.assign(this.active, { userId: p.id, name: p.name, source: p.source });
    } else if (!this.current && matches(this.engine.board).length) this.engine.shuffle();
    if (removed.has(this.activeTap?.id)) this.activeTap = null;
    for (const h of Object.values(this.heroes)) for (const kind of ['mvp', 'tapper', 'gifter']) if (removed.has(h[kind]?.id)) h[kind] = null;
    this.ranking = null;
  }
  prepareLive() { this.settings.demo = false; this.removeParticipants(p => p.source !== 'live'); }
  wake() { if (this.phase.type === 'idle' && !this.paused) this.phase.duration = Math.min(this.phase.duration, Math.max(0, this.now - this.phase.start) + MOTION.queued); }
  pendingUnits() { return this.queue.reduce((n, a) => addSafe(n, a.units), 0); }
  pendingSteps() { return this.queue.reduce((n, a) => addSafe(n, (a.powers || 0) + (a.smart || 0)), 0); }
  speed() { return speedFor(this.pendingSteps() + Math.ceil(this.pendingTotal / TAP_BATCH)); }
  enqueue(type, user, source = 'host', units = 1, coins = null) {
    if (!POWERS[type] || type === 'tap') throw Error('Unknown power');
    const p = this.participant(user, source); if (!p) return false;
    units = Number(units);
    if (!Number.isSafeInteger(units) || units <= 0 || !Number.isSafeInteger(this.pendingUnits() + units) || !Number.isSafeInteger(this.engine.jokersWaiting() + this.engine.jokerCount() + units)) {
      this.rejected++; this.emit('warning', 'Gift packet rejected: invalid count or counter capacity reached.'); return false;
    }
    const last = this.queue.find(a => a.userId === p.id && a.type === type && a.source === source);
    if (!last && this.queue.length >= 512) { this.rejected++; this.emit('warning', 'Power queue full. New power could not be queued.'); return false; }
    // Count every accepted gift unit, including long streaks. The engine
    // keeps excess jokers as compact per-viewer counts, not discarded pieces.
    this.engine.addJokers(p.id, units); p.gifts = addSafe(p.gifts, units);
    const value = Number(coins) > 0 ? Number(coins) : GIFT_COINS[type] * units, steps = giftSteps(value), powers = type === 'rose' ? 0 : 1;
    if (last) { last.units = addSafe(last.units, units); last.powers += powers; last.smart += steps - powers; }
    else this.queue.push({ type, userId: p.id, name: p.name, source, units, powers, smart: steps - powers, credited: 0 });
    this.wake();
    this.emit('join', `${p.name} sent ${POWERS[type].name}${units > 1 ? ` ×${units}` : ''} · joker incoming`, { name: p.name, power: type, userId: p.id });
    return true;
  }
  incoming(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'batch') { for (const event of packet.events || []) if (event?.type !== 'batch') this.incoming(event); return; }
    if (packet.type === 'status') {
      this.live = { state: 'connected', live: !!packet.live, username: clean(packet.username, 60), text: packet.live ? `Connected to @${clean(packet.username, 60)}` : clean(packet.text || 'Relay connected; account is not LIVE', 120) }; return;
    }
    if (packet.type === 'like') this.like(packet.user, packet.count);
    if (packet.type === 'gift') {
      // Existing relay already supplies streak DELTAS in coins. Its final
      // zero packet must never grant another gift. Do not recount totals.
      if (!(Number(packet.coins) > 0)) return;
      const unitValue = Number(packet.total) > 0 && Number(packet.repeat) > 0 ? Number(packet.total) / Number(packet.repeat) : Number(packet.coins);
      const units = Math.max(1, Math.round(Number(packet.coins) / Math.max(1, unitValue)));
      const gift = normalize(packet.giftName || '');
      const type = Object.keys(this.settings.mappings).find(k => this.settings.mappings[k].split(',').some(alias => normalize(alias) === gift)) || 'rose';
      const p = this.participant(packet.user); if (!p) return;
      this.enqueue(type, p, 'live', units, Number(packet.coins));
    }
    if (packet.type === 'chat') {
      const p = packet.user ? this.participant(packet.user) : null;
      const color = COLOR_NAMES.indexOf(String(packet.text || '').trim().toLowerCase());
      if (color >= 0 && p) this.votes.set(p.id, color);
    }
  }
  setPhase(type, duration, extra = {}) {
    const speed = FAST.has(type) ? this.speed() : 1;
    this.phase = { id: ++this.sequence, type, duration: Math.ceil(duration / speed), speed, start: this.now, ...extra };
  }

  // ---------- Level roadmap ----------
  startLevel(n, attempt = 1) {
    n = Math.max(1, Math.floor(n) || 1);
    this.spec = levelSpec(n);
    this.level = { n, attempt, tapsUsed: 0, giftActions: 0, progress: newProgress(), status: 'intro' };
    this.unlocked = Math.max(this.unlocked, n);
    // Jokers still on the old board go back to the joker queue,
    // so no gifter loses a piece when the level changes.
    this.engine.recycleJokers(); this.engine.fillStable(); this.engine.ice = this.spec.ice.slice();
    for (const p of this.users.values()) { p.roundScore = 0; p.levelTaps = 0; p.levelGifts = 0; }
    this.ranking = null; this.current = null; this.pendingHit = null; this.chain = 0; this.forceComplete = false;
    this.setPhase('levelIntro', MOTION.levelIntro, { level: n });
  }
  goals() { return this.spec.goals.map(g => ({ ...g, have: Math.min(g.target, goalHave(g, this.level.progress)) })); }
  levelDone() { return this.forceComplete || goalsComplete(this.spec, this.level.progress); }
  heroOf(key) {
    let best = null;
    for (const p of this.users.values()) if ((p[key] || 0) > 0 && (!best || p[key] > best[key] || (p[key] === best[key] && p.id < best.id))) best = p;
    return best ? { id: best.id, name: best.name, value: best[key], avatar: !!best.avatar } : null;
  }
  completeLevel() {
    const { n } = this.level, stars = starsFor(this.spec, this.level.tapsUsed);
    this.levelStars[n] = Math.max(this.levelStars[n] || 0, stars);
    this.unlocked = Math.max(this.unlocked, n + 1);
    const heroes = { mvp: this.heroOf('roundScore'), tapper: this.heroOf('levelTaps'), gifter: this.heroOf('levelGifts') };
    const mvp = heroes.mvp && this.users.get(heroes.mvp.id);
    if (mvp) { mvp.trophies++; this.ranking = null; }
    this.heroes[n] = heroes;
    for (const key of Object.keys(this.heroes)) if (Number(key) < n - HERO_HISTORY) delete this.heroes[key];
    const result = { level: n, world: this.spec.worldName, stars, levelScore: this.level.progress.score, tapsUsed: this.level.tapsUsed, par: this.spec.par, heroes, id: heroes.mvp?.id || null, name: heroes.mvp?.name || 'The tap crew', score: heroes.mvp?.value || 0, at: this.now };
    this.history.unshift(result); this.history.length = Math.min(8, this.history.length);
    this.lastLevel = result; this.level.status = 'complete'; this.current = null;
    this.emit('levelComplete', `Level ${n} complete ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} in ${this.level.tapsUsed} taps · MVP ${result.name}`, result);
    this.setPhase('levelComplete', MOTION.levelComplete, { result });
  }

  // ---------- Actions ----------
  // One gift step: the power first (bounded area), then smart swaps chosen
  // for the level goals. Steps of different gifters alternate; all gift
  // steps play before waiting taps.
  takeGift(action) {
    if (action.credited < action.units) { this.creditGift(action.userId, action.units - action.credited); action.credited = action.units; }
    const power = action.powers > 0 && action.type !== 'rose';
    if (power) action.powers--; else action.smart--;
    const left = (action.powers || 0) + (action.smart || 0);
    this.current = { ...action, type: power ? action.type : 'rose', stats: { points: 0, cleared: 0, waves: 0, created: 0, activated: 0 } }; this.chain = 0;
    this.active = { name: action.name, userId: action.userId, type: this.current.type, source: action.source, label: POWERS[this.current.type].name, units: 1, stepsLeft: left };
    if (left > 0) this.queue.push(action);
    const need = needFor(this.spec, this.level.progress);
    if (!power) {
      const best = this.engine.bestMoves(1, need);
      if (!best) return this.pendingStep();
      this.analysis = { ...best.analysis, name: action.name, source: action.source };
      this.current.plan = best.plan;
      this.setPhase('swap', MOTION.swap, { a: best.first.a, b: best.first.b, swaps: best.swaps }); return;
    }
    let voted = null;
    if (action.type === 'prism') {
      const counts = Array(6).fill(0); for (const color of this.votes.values()) counts[color]++;
      voted = counts.some(Boolean) ? counts.indexOf(Math.max(...counts)) : null; this.votes.clear();
    }
    const best = this.engine.bestPower(action.type, voted, 1, need);
    const plan = { type: action.type, indices: best.indices, color: best.color };
    this.analysis = { ...best.analysis, name: action.name, source: action.source, color: best.color };
    this.engine.placePlan(plan); this.current.plan = plan;
    const area = action.type === 'meteor' ? [] : this.engine.giftCells(plan);
    this.setPhase('power', MOTION.power, { index: best.index, indices: best.indices, power: action.type, area });
  }
  // No legal swap but lines are waiting on the board: this step explodes them.
  pendingStep() {
    if (!matches(this.engine.board).length) { this.engine.shuffle(); this.setPhase('shuffle', MOTION.shuffle); return; }
    this.current.plan = { type: 'pending' };
    const f = this.engine.forecast(this.current.plan);
    this.analysis = { ...f, points: this.current.type === 'tap' ? f.points / TAP_DIVISOR : f.points, kind: 'pending', legal: 0, scanned: 0, swaps: 0, name: this.active.name, source: this.current.source };
    this.setPhase('swap', MOTION.queued, { swaps: [] });
  }
  creditGift(id, units) {
    this.level.giftActions += units;
    const p = this.users.get(id); if (p) p.levelGifts = (p.levelGifts || 0) + units;
  }
  // One waiting tap = one step = one uniformly random legal swap.
  takeTaps() {
    const pick = this.engine.randomMoves(1);
    if (!pick && !matches(this.engine.board).length) { this.engine.shuffle(); this.setPhase('shuffle', MOTION.shuffle); return; }
    const id = this.takeTap(), p = this.users.get(id);
    this.level.tapsUsed++;
    this.current = { type: 'tap', name: p?.name || 'Viewer', userId: id, tappers: [id], source: p?.source || 'live', stats: { points: 0, cleared: 0, waves: 0, created: 0, activated: 0 } };
    this.chain = 0;
    this.active = { name: p?.name || 'Viewer', others: 0, userId: id, type: 'tap', source: this.current.source, label: POWERS.tap.name, units: 1 };
    if (!pick) return this.pendingStep();
    this.current.plan = pick.plan;
    const f = this.engine.forecast(pick.plan);
    this.analysis = { ...f, points: f.points / TAP_DIVISOR, kind: 'tap', legal: pick.legal, scanned: pick.legal, swaps: 1, name: this.active.name, source: this.current.source };
    this.setPhase('swap', MOTION.swap, { a: pick.first.a, b: pick.first.b, swaps: pick.swaps });
  }
  credit(userId, points) {
    const p = this.users.get(userId); if (!p || !points) return;
    p.score = addSafe(p.score, points); p.roundScore = addSafe(p.roundScore, points); p.bestChain = Math.max(p.bestChain || 0, this.chain); this.ranking = null;
  }
  explode(hit) {
    if (!hit?.clear.length) { this.settle(); return; }
    this.pendingHit = hit; this.chain++;
    this.bestChain = Math.max(this.bestChain, this.chain);
    const tap = this.current?.type === 'tap', points = scoreWave(hit, this.chain) / (tap ? TAP_DIVISOR : 1);
    if (this.current) {
      const stats = this.current.stats; stats.points += points; stats.cleared += hit.clear.length; stats.waves++; stats.created += hit.births.length; stats.activated += hit.activated.length;
      if (tap) {
        const t = this.current.tappers, share = Math.floor(points / t.length);
        t.forEach((id, k) => this.credit(id, share + (k < points - share * t.length ? 1 : 0)));
      } else this.credit(this.current.userId, points);
    }
    this.score = addSafe(this.score, points); this.level.progress.score += points;
    this.totalCleared = addSafe(this.totalCleared, hit.clear.length);
    this.chest += hit.clear.length;
    const chestOpened = this.chest >= 500;
    if (chestOpened) { this.chest %= 500; this.chests++; this.emit('chest', `Team chest #${this.chests} unlocked · +1 reactor trophy`, { number: this.chests }); }
    const board = this.engine.board;
    const iceHit = [...new Set([...hit.clear, ...hit.births.map(b => b.index)])].filter(i => this.engine.ice[i] > 0);
    const jokers = hit.clear.filter(i => board[i]?.joker).map(i => ({ index: i, owner: board[i].joker, name: this.users.get(board[i].joker)?.name || 'Gifter' }));
    this.setPhase('explode', MOTION.burst, { clear: hit.clear, births: hit.births, activated: hit.activated, points, chain: this.chain, chestOpened, iceHit, jokers });
  }
  // Every joker that explodes pays JOKER_POINTS to the gifter it shows.
  payJokers(owners) {
    for (const owner of owners) {
      this.credit(owner, JOKER_POINTS); this.score = addSafe(this.score, JOKER_POINTS); this.level.progress.score += JOKER_POINTS;
      const p = this.users.get(owner); this.emit('joker', `🃏 ${p?.name || 'Gifter'}'s joker exploded · +${JOKER_POINTS}`, { userId: owner });
    }
  }
  settle() {
    this.pendingHit = null;
    // Lines left by sliding gems wait for the next step; reshuffle only when
    // nothing can be played at all.
    if (!matches(this.engine.board).length && !moves(this.engine.board).length) {
      this.engine.shuffle(); this.setPhase('shuffle', MOTION.shuffle); return;
    }
    if (this.chain >= 3) this.emit('cascade', `${this.active.name} · ${this.chain}× cascade`, { name: this.active.name, chain: this.chain });
    const finished = this.current;
    if (finished?.stats) {
      this.lastResult = { ...finished.stats, name: this.active.name, type: finished.type, source: finished.source, at: this.now, predicted: this.analysis?.points ?? null, swaps: finished.plan?.swaps?.length || finished.plan?.indices?.length || 1 };
      if (finished.type !== 'tap') this.emit('result', `${finished.name} · +${finished.stats.points.toLocaleString('en-US')} points · ${this.chain}× chain`);
    }
    this.current = null; this.active = this.waitingActive();
    if (this.level.status === 'playing' && this.levelDone()) { this.completeLevel(); return; }
    this.setPhase('idle', this.queue.length || this.pendingTotal ? MOTION.queued : MOTION.idle);
  }
  leaders() {
    if (!this.ranking) this.ranking = [...this.users.values()].filter(p => p.roundScore > 0).sort((a, b) => b.roundScore - a.roundScore || a.id.localeCompare(b.id));
    return this.ranking;
  }
  step(dt, now = this.now + dt * 1000) {
    const elapsed = Math.max(0, (now - this.now) / 1000); this.now = now;
    if (this.paused) { this.phase.start += elapsed * 1000; return; }
    if (now - this.phase.start < this.phase.duration) return;
    const type = this.phase.type;
    if (type === 'idle') {
      if (this.level.status !== 'playing') return;
      if (this.levelDone()) { this.completeLevel(); return; }
      // Gifts first (they were paid for), then taps. Nothing happens alone.
      const action = this.queue.shift();
      if (action) this.takeGift(action);
      else if (this.pendingTotal > 0) this.takeTaps();
    } else if (type === 'swap') {
      const hit = this.engine.applyPlan(this.current.plan);
      hit ? this.explode(hit) : this.settle();
    } else if (type === 'power') {
      this.explode(this.engine.resolvePlan(this.current.plan));
    } else if (type === 'explode') {
      const tally = this.engine.clear(this.pendingHit), owners = tally.jokerOwners; tally.jokerOwners = [];
      addTally(this.level.progress, tally); this.payJokers(owners);
      const drops = this.engine.collapse();
      this.setPhase('fall', fallDuration(drops), { drops });
    } else if (type === 'fall') {
      this.settle(); // step mode: one wave per step, nothing continues by itself
    } else if (type === 'shuffle') this.settle();
    else if (type === 'levelIntro') { this.level.status = 'playing'; this.emit('level', `Level ${this.level.n} · ${this.spec.worldName} · tap to play`); this.setPhase('idle', MOTION.queued); }
    else if (type === 'levelComplete') this.setPhase('roadmap', MOTION.roadmap, { from: this.level.n, to: this.level.n + 1, stars: this.levelStars[this.level.n] || 0, heroes: this.heroes[this.level.n] });
    else if (type === 'roadmap') this.startLevel(this.level.n + 1);
  }
  command(c) {
    const source = 'host', user = { id: 'host-test', name: clean(c.name || 'Host test') };
    if (c.action === 'power') { const type = c.power === 'tap' ? 'rose' : c.power; return this.enqueue(type, user, source, 1, Number(c.coins) > 0 ? Number(c.coins) : GIFT_COINS[type]); }
    if (c.action === 'tap') return this.like(user, c.count ?? 25, source);
    if (c.action === 'pause') { this.paused = !this.paused; return; }
    if (c.action === 'demo') { this.settings.demo = false; return; } // legacy controls cannot enable automatic input
    if (c.action === 'auto') return; // autopilot was removed: taps and gifts drive the game
    if (c.action === 'finish') { this.forceComplete = true; this.wake(); return; }
    if (c.action === 'restartLevel') { this.startLevel(this.level.n, this.level.attempt + 1); return; }
    if (c.action === 'skipLevel') { this.startLevel(this.level.n + 1); return; }
    if (c.action === 'setLevel') { this.startLevel(Math.floor(clamp(c.level, 1, 9999))); return; }
    if (c.action === 'settings') {
      if (c.mappings) {
        const next = {}, names = new Set();
        for (const power of ['rose', 'meteor', 'prism', 'supernova']) {
          next[power] = clean(c.mappings[power] ?? this.settings.mappings[power], 180);
          for (const alias of next[power].split(',').map(normalize).filter(Boolean)) { if (names.has(alias)) throw Error('A gift name can map to only one power'); names.add(alias); }
        }
        this.settings.mappings = next;
      }
      return;
    }
    throw Error('Unknown command');
  }
  // Names (and whether a photo exists) for every viewer the screen shows.
  people(ids) {
    const out = {};
    for (const id of ids) { const p = id && this.users.get(id); if (p && !out[id]) out[id] = { name: p.name, photo: !!p.avatar }; }
    return out;
  }
  levelSnapshot() {
    const l = this.level, s = this.spec;
    return { n: l.n, attempt: l.attempt, tapsUsed: l.tapsUsed, giftActions: l.giftActions, status: l.status, score: l.progress.score, goals: this.goals(), par: s.par, starsNow: starsFor(s, l.tapsUsed), world: s.world, worldName: s.worldName, accent: s.accent, hard: s.hard, pattern: s.pattern, topTapper: this.heroOf('levelTaps'), topGifter: this.heroOf('levelGifts') };
  }
  snapshot() {
    const units = this.pendingUnits(), leaders = this.leaders().slice(0, 5), level = this.levelSnapshot();
    const near = Object.entries(this.heroes).filter(([n]) => Math.abs(n - this.level.n) <= 8);
    const ids = [...this.engine.board.map(t => t?.joker), this.active.userId, this.activeTap?.id, ...leaders.map(p => p.id), level.topTapper?.id, level.topGifter?.id, ...near.flatMap(([, h]) => [h.mvp?.id, h.tapper?.id, h.gifter?.id]), ...this.history.flatMap(h => [h.heroes?.mvp?.id, h.heroes?.tapper?.id, h.heroes?.gifter?.id])];
    return { now: this.now, board: copyBoard(this.engine.board), ice: this.engine.ice.slice(), jokersWaiting: this.engine.jokersWaiting(), phase: { ...this.phase }, score: this.score, level, levelStars: this.levelStars, heroes: Object.fromEntries(near), unlocked: this.unlocked, lastLevel: this.lastLevel, chain: this.chain, bestChain: this.bestChain, totalCleared: this.totalCleared, taps: { received: this.taps.received, played: this.taps.played, pending: this.pendingTotal }, chest: this.chest, chests: this.chests, active: { ...this.active }, activeTap: this.activeTap, analysis: this.analysis, actionStats: this.current?.stats || null, lastResult: this.lastResult, leaders, people: this.people(ids), participants: this.users.size, queue: this.queue.slice(0, 4), queueUnits: units, speed: this.speed(), log: this.log.slice(0, 7), history: this.history, paused: this.paused, live: { ...this.live }, settings: this.settings, rejected: this.rejected, votes: this.votes.size, sequence: this.sequence };
  }
  export() {
    return { version: 3, engine: this.engine.export(), settings: this.settings, score: this.score, bestChain: this.bestChain, totalCleared: this.totalCleared, chest: this.chest, chests: this.chests, users: [...this.users.values()], queue: this.queue, history: this.history, levelStars: this.levelStars, heroes: this.heroes, unlocked: this.unlocked, level: this.level, lastLevel: this.lastLevel, forceComplete: this.forceComplete, taps: { received: this.taps.received, played: this.taps.played, pending: [...this.tapPending], order: this.tapOrder }, sequence: this.sequence, phase: this.phase, phaseRemaining: Math.max(0, this.phase.duration - (this.now - this.phase.start)), current: this.current, pendingHit: this.pendingHit, chain: this.chain, active: this.active, analysis: this.analysis, lastResult: this.lastResult };
  }
}
