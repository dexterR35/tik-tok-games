// THE LAST CITY — game simulation: wave flow, survivors, zombies, turrets, gift actions, wall and core.
// No DOM access: the renderer reads this state and drains `events` for visual effects.
//
// Wave flow:  intro (wave card + gift menu) → countdown 3-2-1 → fight → clear (summary, MVP) → next wave
// If the city core falls: "fallen" → the horde is pushed back to the checkpoint wave (1, 6, 11, …).
// While no wave is running, BUILD gifts (repair, turret, barricade) apply at once and COMBAT gifts
// (rapid fire, freeze, meteors, dragon fire) are saved and fire at GO, so a viewer never loses a gift.
import {
  WORLD, waveConfig, checkpointFor, cityStats, stepTapPower, fireMultFor, actionBundle, actionForGift, giftWallet,
  autoUpgrade, upgradeCost, UPGRADES, SOCIAL, REPAIR_WORDS, scoreFor, clamp, FLOW, DEFAULT_GIFT_MAP, sanitizeGiftMap,
  EFFECT_CAPS, RAPID_MULT, METEOR, NUKE, SURVIVORS, survivorLevel, survivorDamageMult, weaponFor, CAPTAIN, TURRET, ZOMBIES, GARRISON, JOIN_WORDS, validCount, ACTIONS,
} from './rules.js';
import { Settlement } from './settlement.js';
import { moveHorde } from './movement.js';
import { intercept, segmentHit } from './combat.js';

export const DT = 1 / 60;
const LOCKED = new Set(['intro', 'countdown', 'clear', 'fallen']);
const MAX_ALIVE = 240;

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Where things stand on screen.
// Two staggered rows on the wall walk, four survivors each side of the gate.
// Slots fill from the gate outwards, alternating left and right, so a small crowd still looks balanced.
const SLOT_XS = [[345, 735], [383, 697], [270, 810], [308, 772], [195, 885], [233, 847], [120, 960], [158, 922]];
export const SLOTS = SLOT_XS.flatMap(([l, r], k) => [l, r].map(x => ({ x, y: WORLD.wallY + 50 + (k % 2) * 44, row: k % 2 }))).slice(0, SURVIVORS.wallSlots);
export const TURRET_SLOTS = [
  { x: 60, y: 1150 }, { x: 1020, y: 1150 }, { x: 452, y: 1140 }, { x: 628, y: 1140 }, { x: 236, y: 1158 }, { x: 844, y: 1158 },
];
export const CAPTAIN_POS = { x: 540, y: 1150 };

const emptyBundle = () => ({ rapid: 0, freeze: 0, shield: 0, repair: 0, turrets: 0, meteors: 0, nukes: 0, recruits: 0, upgrades: 0 });

export class Sim {
  constructor(save = {}) {
    this.coins = Math.max(0, Math.floor(save.coins || 0));
    this.upgrades = { walls: 0, arrows: 0, drill: 0, cannons: 0, medics: 0, ...(save.upgrades || {}) };
    this.wave = Math.max(1, Math.floor(save.wave || 1));
    this.best = Math.max(this.wave, save.best || 1);
    this.autoUpgrade = save.autoUpgrade !== false;
    this.players = new Map(Object.entries(save.players || {}));   // name -> {taps, coins, kills, avatar}
    this.turrets = (Array.isArray(save.turrets) ? save.turrets : []).slice(0, TURRET.slots).map((t, i) => ({ slot: i, level: clamp(t?.level | 0, 0, TURRET.maxLevel), cd: 0, flash: 0, aim: -Math.PI / 2 }));
    while (this.turrets.length < TURRET.slots) this.turrets.push({ slot: this.turrets.length, level: 0, cd: 0, flash: 0, aim: -Math.PI / 2 });
    this.giftMap = sanitizeGiftMap(save.giftMap || DEFAULT_GIFT_MAP);
    this.fallsAt = { ...(save.fallsAt || {}) };
    this.events = [];
    this.time = 0;
    this.tapPower = 0;
    this.sinceTap = 99;
    this.pendingTaps = 0;
    this.effects = { rapid: 0, freeze: 0 };
    this.bank = { ...emptyBundle(), gifts: 0 };
    this.survivors = new Map();      // session survivors: name -> {name, avatar, last, adren, cd, slot, gifted, flash, aim}
    this.squad = [];                 // survivors on the wall (indices = SLOTS)
    this.squadT = 0;
    this.captain = { name: CAPTAIN.name, captain: true, cd: 0, flash: 0, aim: -Math.PI / 2, adren: 0 };
    this.garrison = [];
    this.recruit(clamp(save.garrisonCount | 0 || GARRISON.base, GARRISON.base, GARRISON.max), false);
    this.settlement = new Settlement(save.settlement);
    this.commentSeen = new Map();
    this.repairSeen = new Map();
    this.session = { taps: 0, likes: 0, comments: 0, follows: 0, shares: 0, gifts: 0, coinsGifted: 0, joined: 0, kills: 0 };
    this.activity = new Map();
    this.stats = cityStats(this.upgrades);
    this.wallHp = this.stats.wallHp;
    this.coreHp = this.stats.coreHp;
    this.shield = 0;                 // absorbs wall damage, in HP
    this.nextId = 1;
    this.startWave(this.wave, true);
  }

  serialize() {
    return {
      coins: this.coins, upgrades: this.upgrades, wave: this.wave, best: this.best, autoUpgrade: this.autoUpgrade,
      turrets: this.turrets.map(t => ({ level: t.level })),
      settlement: this.settlement.serialize(), fallsAt: { ...this.fallsAt },
      garrisonCount: this.garrison.length,
      players: Object.fromEntries([...this.players].sort((a, b) => scoreFor(b[1]) - scoreFor(a[1])).slice(0, 200)),
    };
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); if (this.events.length > 500) this.events.shift(); }

  get locked() { return LOCKED.has(this.state); }
  get breached() { return this.wallHp <= 0; }

  startWave(n, fresh = false) {
    // A host restart must not leak reservations, timers or taps into another wave.
    this.delayed = null; this.pendingTaps = 0;
    for (const s of [this.captain, ...this.garrison, ...this.survivors.values()]) {
      s.cd = 0; if (s.windup) this.releaseShot(s.windup.shot);
      s.windup = null; s.animStage = 'idle'; s.animT = 0;
    }
    this.wave = n;
    // Snapshot fortifications at wave start; a gift never upgrades enemies already fighting.
    const fortification = this.turrets.reduce((sum, t) => sum + t.level, 0) * 0.04 + Object.values(this.upgrades).reduce((a, b) => a + b, 0) * 0.012 + (this.garrison.length - GARRISON.base) * 0.025;
    this.cfg = waveConfig(n, this.fallsAt[n] || 0, fortification);
    this.rng = mulberry32(this.cfg.seed);
    this.zombies = [];
    this.shots = [];
    this.meteors = [];
    this.queue = this.buildQueue();
    this.spawned = 0;
    this.state = 'intro';
    this.stateT = 0;
    this.waveT = 0;
    this.waveKills = new Map();
    this.waveTaps = new Map();
    this.waveCoins = 0;
    this.effects = { rapid: 0, freeze: 0 };
    this.tapPower = 0;
    if (fresh) { this.wallHp = this.stats.wallHp; this.coreHp = this.stats.coreHp; }
    this.emit('wave', { wave: n, name: this.cfg.night.name, count: this.queue.length, boss: this.cfg.boss, relief: this.cfg.relief });
  }

  buildQueue() {
    const c = this.cfg, r = this.rng, list = [];
    for (let i = 0; i < c.count; i++) {
      const roll = r();
      const kind = roll < c.mix.brute ? 'brute' : roll < c.mix.brute + c.mix.runner ? 'runner' : 'walker';
      // Broad packs arrive together from different parts of the treeline.
      const packs = Math.ceil(c.count / 24), pack = Math.floor(i / 24);
      const t = pack / Math.max(1, packs - 1) * c.spawnTime + r() * 1.5;
      const center = [260, 800, 510, 360, 690][pack % 5];
      list.push({ kind, t, x: clamp(center + (r() - 0.5) * 400, 100, 980), pack });
    }
    for (let b = 0; b < c.boss; b++) list.push({ kind: 'boss', t: c.spawnTime * (0.55 + 0.15 * b) });
    // Guarantee a visible mixed horde, rather than relying on rare rolls for all elites.
    const ensure = (kind, wanted) => {
      let have = list.filter(z => z.kind === kind).length;
      for (let i = list.length - 1; i >= 0 && have < wanted; i--) if (list[i].kind === 'walker') { list[i].kind = kind; have++; }
    };
    if (c.wave >= 2) ensure('runner', Math.ceil(c.count * c.mix.runner));
    if (c.wave >= 3) ensure('brute', Math.max(2, Math.ceil(c.count * c.mix.brute)));
    return list.sort((a, b) => a.t - b.t);
  }

  refreshStats() {
    const st = cityStats(this.upgrades);
    const wf = this.wallHp / this.stats.wallHp, cf = this.coreHp / this.stats.coreHp;
    this.stats = st;
    this.wallHp = clamp(wf, 0, 1) * st.wallHp; this.coreHp = clamp(cf, 0, 1) * st.coreHp;
  }

  buy(id) {
    const cost = upgradeCost(id, this.upgrades[id] || 0);
    if (!UPGRADES[id] || cost > this.coins) return false;
    this.coins -= cost;
    this.upgrades[id] = (this.upgrades[id] || 0) + 1;
    this.refreshStats();
    this.emit('upgrade', { id, level: this.upgrades[id] });
    return true;
  }

  setGiftMap(list) { this.giftMap = sanitizeGiftMap(list); }

  /* ---------- people ---------- */
  player(name, avatar) {
    name = String(name || 'VIEWER').slice(0, 24);
    let p = this.players.get(name);
    if (!p) { p = { taps: 0, coins: 0, kills: 0 }; this.players.set(name, p); }
    if (avatar) p.avatar = avatar;
    return p;
  }

  participant(name, source) {
    name = String(name || 'VIEWER').slice(0, 24);
    let p = this.activity.get(name);
    if (!p) {
      p = { name, source: source || 'live', last: this.time, comments: 0, likes: 0, taps: 0, gifts: 0, coins: 0, kills: 0, follows: 0, shares: 0 };
      this.activity.set(name, p);
    }
    if (source) p.source = source;
    p.last = this.time;
    return p;
  }

  roster() {
    return [...this.activity.values()].map(p => {
      const s = this.survivors.get(p.name), active = s && this.time - s.last < SURVIVORS.activeFor;
      return { ...p, state: !s ? 'NOT JOINED' : !active ? 'IDLE' : s.slot >= 0 ? 'ON WALL' : 'QUEUED', level: this.levelOf(p.name), joined: !!s };
    }).sort((a, b) => b.last - a.last);
  }

  recruit(n, notify = true) {
    const before = this.garrison.length;
    for (let i = 0; i < validCount(n, GARRISON.max) && this.garrison.length < GARRISON.max; i++) {
      const k = this.garrison.length;
      this.garrison.push({ name: `GUARD ${k + 1}`, guard: true, cd: k * 0.13, flash: 0, aim: -Math.PI / 2, adren: 0, pos: { x: 150 + (k % 6) * 156, y: WORLD.wallY + 118 + Math.floor(k / 6) * 38 } });
    }
    if (notify) this.emit('recruit', { added: this.garrison.length - before, total: this.garrison.length });
    return this.garrison.length - before;
  }

  grantUpgrades(n) {
    const bought = [];
    for (let i = 0; i < validCount(n, 50); i++) {
      const id = Object.keys(UPGRADES).filter(k => this.upgrades[k] < UPGRADES[k].max).sort((a, b) => this.upgrades[a] - this.upgrades[b] || upgradeCost(a, this.upgrades[a]) - upgradeCost(b, this.upgrades[b]))[0];
      if (!id) break;
      this.upgrades[id]++; bought.push(id);
    }
    if (bought.length) { this.refreshStats(); this.emit('autoupgrade', { bought }); }
    else this.addShield(0.05);
  }

  levelOf(name) { const p = this.players.get(name); return p ? survivorLevel(scoreFor(p)) : 1; }

  /** Every viewer who does anything joins the city as a survivor. */
  survivor(name, avatar, { gifted = false, tap = false } = {}) {
    if (!name) return null;
    name = String(name).slice(0, 24);
    this.player(name, avatar);
    this.participant(name);
    let s = this.survivors.get(name);
    if (!s) {
      s = { name, avatar: null, last: this.time, adren: 0, cd: this.rng ? this.rng() : 0.5, slot: -1, gifted: false, flash: 0, aim: -Math.PI / 2, joined: this.time };
      this.survivors.set(name, s);
      this.session.joined++;
      this.emit('join', { user: name, avatar });
      if (this.survivors.size > 3000) {   // forget the longest-idle survivor (never someone on the wall)
        let old = null; for (const v of this.survivors.values()) if (v.slot < 0 && (!old || v.last < old.last)) old = v;
        if (old) this.survivors.delete(old.name);
      }
    }
    if (avatar) s.avatar = avatar;
    s.last = this.time; s.gifted = s.gifted || gifted;
    if (tap) s.adren = SURVIVORS.adrenaline;
    if (s.slot < 0) this.squadT = 0;   // re-pick the wall squad right away
    return s;
  }

  updateSquad() {
    const active = [...this.survivors.values()].filter(s => this.time - s.last < SURVIVORS.activeFor).sort((a, b) => b.last - a.last).slice(0, SURVIVORS.wallSlots);
    const keep = new Set(active);
    const squad = new Array(SURVIVORS.wallSlots).fill(null);
    for (const s of this.survivors.values()) if (s.slot >= 0 && !keep.has(s)) {
      s.slot = -1; if (s.windup) this.releaseShot(s.windup.shot);
      s.windup = null; s.animStage = 'idle';
    }
    for (const s of active) if (s.slot >= 0) squad[s.slot] = s;
    for (const s of active) if (s.slot < 0) { const i = squad.indexOf(null); if (i >= 0) { s.slot = i; squad[i] = s; } }
    this.squad = squad;
  }

  /* ---------- crowd input ---------- */
  tap(count = 1, user = null, avatar = null, rawLikes = count) {
    if (!Number.isFinite(count) || !(count > 0)) return;
    rawLikes = Math.max(0, Number(rawLikes) || 0);
    if (!this.locked) this.pendingTaps += count;
    this.session.taps += count;
    this.session.likes += rawLikes;
    if (user) {
      user = String(user).slice(0, 24);
      const p = this.participant(user); p.taps += count; p.likes += rawLikes;
      this.player(user, avatar).taps += count;
      if (this.survivors.has(user)) this.survivor(user, avatar, { tap: true });
      this.waveTaps.set(user, (this.waveTaps.get(user) || 0) + count);
    }
  }

  gift({ coins = 1, count = 1, user = 'VIEWER', avatar = null, name = 'Gift', action: override }) {
    count = Math.max(1, Math.floor(count) || 1);
    coins = Math.max(1, Math.floor(Number(coins) || 1));
    const action = ACTIONS[override] ? override : actionForGift(name, coins, this.giftMap);
    const wallet = giftWallet(coins, count);
    this.coins += wallet;
    const p = this.player(user, avatar);
    const activity = this.participant(user); activity.gifts += count; activity.coins += coins * count;
    p.coins += coins * count;
    this.survivor(user, avatar, { gifted: true, tap: true });
    this.session.gifts += count; this.session.coinsGifted += coins * count;
    const banked = this.applyBundle(actionBundle(action, count), user);
    this.emit('gift', { action, count, user, avatar, wallet, name, banked });
  }

  /** Applies build parts now; combat parts now during a fight, otherwise into the bank. Returns true if anything was banked. */
  applyBundle(b, user = '') {
    if (b.repair) this.repair(b.repair, user);
    if (b.shield) this.addShield(b.shield);
    if (b.turrets) this.buildTurrets(b.turrets, user);
    if (b.recruits) {
      const added = this.recruit(b.recruits);
      if (added < b.recruits) this.addShield(0.03 * (b.recruits - added));
    }
    if (b.upgrades) this.grantUpgrades(b.upgrades);
    const combat = b.rapid || b.freeze || b.meteors || b.nukes;
    if (!combat) return false;
    if (this.locked) {
      const k = this.bank;
      k.rapid = Math.min(EFFECT_CAPS.rapid, k.rapid + b.rapid);
      k.freeze = Math.min(EFFECT_CAPS.freeze, k.freeze + b.freeze);
      k.meteors = Math.min(METEOR.max, k.meteors + b.meteors);
      k.nukes = Math.min(3, k.nukes + b.nukes);
      k.gifts++;
      return true;
    }
    if (b.rapid) this.effects.rapid = Math.min(EFFECT_CAPS.rapid, this.effects.rapid + b.rapid);
    if (b.freeze) { this.effects.freeze = Math.min(EFFECT_CAPS.freeze, this.effects.freeze + b.freeze); this.emit('freeze', { t: this.effects.freeze }); }
    if (b.meteors) this.callMeteors(b.meteors);
    for (let i = 0; i < (b.nukes || 0); i++) this.dragonFire();
    return false;
  }

  releaseBank() {
    const k = this.bank;
    if (!k.gifts) return;
    this.bank = { ...emptyBundle(), gifts: 0 };
    const gifts = k.gifts;
    // fire after the first zombies are on the field
    this.delayed = { t: 4, bundle: { ...k, repair: 0, shield: 0, turrets: 0 } };
    this.emit('bank', { gifts });
  }

  repair(frac, user = '') {
    const was = this.breached;
    this.wallHp = Math.min(this.stats.wallHp, this.wallHp + frac * this.stats.wallHp);
    if (frac >= 0.999) this.coreHp = this.stats.coreHp;
    this.emit('repair', { amount: frac, user });
    if (was && !this.breached) this.wallUp();
  }

  /** The wall is standing again: zombies that have not got through yet go back to hitting it. */
  wallUp() {
    for (const z of this.zombies) if (z.state === 'breach' && z.y < WORLD.wallY + 20) { z.state = 'attack'; z.y = Math.min(z.y, z.ay); }
    this.emit('wallup');
  }

  addShield(frac) {
    this.shield = Math.min(this.stats.wallHp * EFFECT_CAPS.shield, this.shield + frac * this.stats.wallHp);
    this.emit('shield', { shield: this.shield });
  }

  buildTurrets(n, user = '') {
    for (let i = 0; i < n; i++) {
      const empty = this.turrets.find(t => t.level === 0);
      const target = empty || [...this.turrets].filter(t => t.level < TURRET.maxLevel).sort((a, b) => a.level - b.level)[0];
      if (!target) { this.applyBundle({ ...emptyBundle(), rapid: 2 }); continue; }
      target.level++;
      this.emit('turret', { slot: target.slot, level: target.level, built: target.level === 1, user });
    }
  }

  follow(user, avatar) {
    this.participant(user).follows++; this.session.follows++;
    if (this.survivors.has(user)) this.survivor(user, avatar);
    this.repair(SOCIAL.followRepair, user);
    this.emit('follow', { user, avatar });
  }

  share(user, avatar) {
    this.participant(user).shares++; this.session.shares++;
    if (this.survivors.has(user)) this.survivor(user, avatar);
    this.applyBundle({ ...emptyBundle(), rapid: SOCIAL.shareRapid }, user);
    this.emit('share', { user, avatar });
  }

  comment(user, text, avatar) {
    user = String(user || 'VIEWER').slice(0, 24);
    this.participant(user).comments++; this.session.comments++;
    this.player(user, avatar).comments = (this.player(user).comments || 0) + 1;
    if (JOIN_WORDS.test(String(text || ''))) this.survivor(user, avatar);
    const last = this.commentSeen.get(user) ?? -99;
    if (this.time - last >= SOCIAL.commentCooldown) {
      this.commentSeen.set(user, this.time);
      if (this.commentSeen.size > 5000) this.commentSeen.delete(this.commentSeen.keys().next().value);
      this.tap(SOCIAL.commentTaps, user, avatar, 0);
    } else if (this.survivors.has(user)) this.survivor(user, avatar);
    if (REPAIR_WORDS.test(String(text || ''))) {
      const r = this.repairSeen.get(user) ?? -99;
      if (this.time - r >= SOCIAL.repairWordCooldown) {
        this.repairSeen.set(user, this.time);
        if (this.repairSeen.size > 5000) this.repairSeen.delete(this.repairSeen.keys().next().value);
        this.repair(SOCIAL.repairWordAmount, user);
        return true;
      }
    }
    return false;
  }

  /* ---------- big actions ---------- */
  callMeteors(n) {
    for (let i = 0; i < n; i++) {
      const target = this.densest();
      const x = target ? target.x + (this.rng() - 0.5) * 60 : 200 + this.rng() * 680;
      const y = target ? target.y + (target.state === 'walk' ? 30 : 0) : 400 + this.rng() * 600;
      this.meteors.push({ x, y, t: METEOR.delay + i * 0.28, max: METEOR.delay + i * 0.28 });
    }
    this.emit('meteorcall', { n });
  }

  densest() {
    let best = null, bestN = -1;
    const zs = this.zombies, step = Math.max(1, Math.floor(zs.length / 60));
    for (let i = 0; i < zs.length; i += step) {
      const a = zs[i]; if (a.hp <= 0) continue;
      let n = 0;
      for (const b of zs) if (b.hp > 0 && Math.abs(a.x - b.x) < METEOR.radius && Math.abs(a.y - b.y) < METEOR.radius) n += b.kind === 'boss' ? 6 : 1;
      n += a.y / 400;            // prefer zombies closer to the wall
      if (n > bestN) { bestN = n; best = a; }
    }
    return best;
  }

  dragonFire() {
    for (const z of this.zombies) {
      if (z.hp <= 0) continue;
      this.damage(z, z.kind === 'boss' ? z.max * NUKE.bossShare : Math.min(NUKE.damage, z.max * NUKE.normalShare), 'DRAGON FIRE', true);
    }
    this.emit('nuke');
  }

  /* ---------- simulation ---------- */
  update(frameDt) {
    if (!Number.isFinite(frameDt) || frameDt <= 0) return;
    frameDt = Math.min(frameDt, 0.25);
    this.acc = (this.acc || 0) + frameDt;
    const steps = Math.floor(this.acc / DT + 1e-6);
    if (!steps) return;
    this.acc -= steps * DT;
    const tapsPerStep = this.pendingTaps / steps;
    this.pendingTaps = 0;
    for (let i = 0; i < steps; i++) this.fixed(DT, tapsPerStep);
  }

  fixed(dt, taps) {
    this.time += dt;
    this.stateT += dt;
    this.settlement.update(dt, this);
    for (const s of [this.captain, ...this.garrison, ...this.survivors.values()]) {
      s.animT = (s.animT || 0) + dt;
      if (s.animStage === 'recover' && s.animT >= 0.27) { s.animStage = 'idle'; s.animT = 0; }
    }
    if (taps > 0) this.sinceTap = 0; else this.sinceTap += dt;
    this.tapPower = this.locked ? 0 : stepTapPower(this.tapPower, taps, dt, taps > 0 ? 0 : this.sinceTap);
    if (!this.locked) for (const k in this.effects) this.effects[k] = Math.max(0, this.effects[k] - dt);
    if ((this.squadT -= dt) <= 0) { this.squadT = 0.5; this.updateSquad(); }

    // flow
    if (this.state === 'intro' && this.stateT >= FLOW.intro) { this.state = 'countdown'; this.stateT = 0; this.lastCount = 3; this.emit('count', { n: 3 }); }
    else if (this.state === 'countdown') {
      const n = 3 - Math.floor(this.stateT);
      if (n !== this.lastCount && n > 0) { this.lastCount = n; this.emit('count', { n }); }
      if (this.stateT >= FLOW.countdown) { this.state = 'fight'; this.stateT = 0; this.emit('go', { wave: this.wave }); this.releaseBank(); }
    } else if (this.state === 'clear' && this.stateT >= FLOW.clear) {
      if (this.autoUpgrade) {
        const plan = autoUpgrade(this.upgrades, this.coins);
        if (plan.bought.length) { this.upgrades = plan.levels; this.coins = plan.coins; this.refreshStats(); this.emit('autoupgrade', { bought: plan.bought }); }
      }
      this.startWave(this.wave + 1);
    } else if (this.state === 'fallen' && this.stateT >= FLOW.fallen) {
      const back = checkpointFor(this.fallenWave);
      // turrets are damaged in the fall: each loses one level
      for (const t of this.turrets) t.level = Math.max(0, t.level - 1);
      this.wallHp = this.stats.wallHp; this.coreHp = this.stats.coreHp; this.shield = 0;
      this.startWave(back);
    }

    if (this.state === 'fight') this.fight(dt);
    else this.idle(dt);

    for (const s of this.survivors.values()) { s.adren = Math.max(0, s.adren - dt); s.flash = Math.max(0, s.flash - dt); }
    this.captain.flash = Math.max(0, this.captain.flash - dt);
    for (const g of this.garrison) g.flash = Math.max(0, g.flash - dt);
    for (const t of this.turrets) t.flash = Math.max(0, t.flash - dt);
  }

  idle(dt) {
    // projectiles in flight still land; shots and zombies are cleared at the next wave
    this.moveShots(dt);
    if (this.state === 'clear' || this.state === 'intro') {
      // masons patch the wall between waves
      this.wallHp = Math.min(this.stats.wallHp, this.wallHp + this.stats.wallHp * (0.008 + this.stats.regen) * dt);
      this.coreHp = Math.min(this.stats.coreHp, this.coreHp + this.stats.coreHp * 0.04 * dt);
    }
  }

  fight(dt) {
    this.waveT += dt;
    const c = this.cfg;
    if (this.delayed && (this.delayed.t -= dt) <= 0) { const b = this.delayed.bundle; this.delayed = null; this.applyBundle({ ...emptyBundle(), ...b }); }

    // spawn
    while (this.spawned < this.queue.length && this.queue[this.spawned].t <= this.waveT && this.zombies.length < MAX_ALIVE) {
      this.spawnZombie(this.queue[this.spawned].kind, this.queue[this.spawned]);
      this.spawned++;
    }

    // zombies
    const { wallDmg, coreDmg } = moveHorde(this.zombies, dt, this.breached, this.effects.freeze > 0);
    if (wallDmg > 0) {
      const absorbed = Math.min(this.shield, wallDmg);
      this.shield -= absorbed;
      const before = this.wallHp;
      this.wallHp = Math.max(0, this.wallHp - (wallDmg - absorbed));
      if (before > 0 && this.wallHp <= 0) { this.emit('breach'); }
    } else if (!this.breached) {
      this.wallHp = Math.min(this.stats.wallHp, this.wallHp + this.stats.wallHp * this.stats.regen * dt);
    }
    if (coreDmg > 0) {
      this.coreHp = Math.max(0, this.coreHp - coreDmg);
      this.coreHitT = (this.coreHitT || 0) - dt;
      if (this.coreHitT <= 0) { this.coreHitT = 0.6; this.emit('corehit'); }
      if (this.coreHp <= 0) return this.fall();
    }

    // defenders
    this.shoot(dt);
    this.moveShots(dt);

    // meteors
    for (const m of this.meteors) {
      if ((m.t -= dt) > 0) continue;
      m.done = true;
      for (const z of this.zombies) if (z.hp > 0 && Math.hypot(z.x - m.x, (z.y - m.y) * 1.3) < METEOR.radius) this.damage(z, METEOR.damage * (z.kind === 'boss' ? 0.6 : 1), 'METEOR', true);
      this.emit('meteor', { x: m.x, y: m.y });
    }
    if (this.meteors.length) this.meteors = this.meteors.filter(m => !m.done);

    // clean up
    if (this.zombies.length > 40 || this.zombies.some(z => z.hp <= 0 && z.hit <= 0)) this.zombies = this.zombies.filter(z => z.hp > 0 || z.hit > 0);

    // wave cleared
    if (this.spawned >= this.queue.length && !this.zombies.some(z => z.hp > 0)) this.clearWave();
  }

  spawnZombie(kind, entry = {}) {
    const k = ZOMBIES[kind], c = this.cfg, r = this.rng;
    const x = entry.x ?? WORLD.fieldX[0] + 30 + r() * (WORLD.fieldX[1] - WORLD.fieldX[0] - 60);
    const hp = k.hp * c.hpMult;
    const ay = WORLD.attackY - r() * 40 - (kind === 'boss' ? 30 : 0);
    const z = {
      id: this.nextId++, kind, x, y: WORLD.spawnY - r() * 50, hp, max: hp,
      speed: k.speed * c.speedMult * (0.85 + r() * 0.3), dps: k.dps * c.attackMult, armor: k.armor || 0,
      attackInterval: k.interval, attackCd: k.interval * (0.4 + r() * 0.6), strike: 0,
      coins: k.coins, size: k.size * c.sizeMult, state: 'walk', tx: clamp(x + (r() - 0.5) * 160, 90, 990),
      ay, phase: r() * 10, hit: 0, pending: 0, lane: (r() - 0.5) * 2, vx: 0, vy: 0,
    };
    this.zombies.push(z);
    if (kind === 'boss') this.emit('boss', { x: z.x });
  }

  /* ---------- shooting ---------- */
  shooters() {
    const out = [{ s: this.captain, pos: CAPTAIN_POS, level: CAPTAIN.level }];
    for (const s of this.garrison) out.push({ s, pos: s.pos, level: 1 });
    this.squad.forEach((s, i) => { if (s) out.push({ s, pos: SLOTS[i], level: this.levelOf(s.name) }); });
    return out;
  }

  pickTarget(from, dmg, range) {
    // most advanced zombie (closest to the city) that is not already going to die
    let best = null, bestScore = Infinity;
    for (const z of this.alive) {
      if (z.pending >= z.hp) continue;
      const d = Math.hypot(z.x - from.x, z.y - from.y);
      if (d > range) continue;
      const score = (z.state === 'walk' || z.state === 'attack' ? -z.y : -z.y - 2000) + Math.abs(z.x - from.x) * 0.35;
      if (score < bestScore) { bestScore = score; best = z; }
    }
    return best;
  }

  shoot(dt) {
    this.alive = this.zombies.filter(z => z.hp > 0 && z.y > WORLD.spawnY - 10);
    const rate = fireMultFor(this.tapPower) * this.stats.fireRate * (this.effects.rapid > 0 ? RAPID_MULT : 1);
    for (const { s, pos, level } of this.shooters()) {
      if (s.windup) {
        const p = s.windup.shot;
        if (p.target.hp <= 0) { this.releaseShot(p); s.windup = null; s.animStage = 'idle'; continue; }
        if ((s.windup.t -= dt) <= 1e-9) {
          this.launchShot(p); s.windup = null; s.animStage = 'recover'; s.animT = 0; s.flash = 0.12;
        }
        continue;
      }
      s.cd -= dt * rate * (s.adren > 0 ? 1.5 : 1);
      if (s.cd > 0) continue;
      const w = weaponFor(level);
      const dmg = (s.captain ? 14 : 10) * survivorDamageMult(level) * this.stats.damage * (w.id === 'musket' ? 1.35 : w.id === 'cannon' ? 1.6 : 1);
      const z = this.pickTarget(pos, dmg, s.captain ? SURVIVORS.range + 100 : SURVIVORS.range);
      if (!z) { s.cd = Math.max(s.cd, 0.1); continue; }
      s.cd += SURVIVORS.baseInterval * (w.id === 'musket' ? 1.15 : w.id === 'cannon' ? 1.3 : 1) * (0.9 + this.rng() * 0.2);
      s.aim = Math.atan2(z.y - pos.y, z.x - pos.x);
      const shot = { x: pos.x, y: pos.y - 30, target: z, dmg, kind: w.id, owner: s.captain || s.guard ? null : s.name, speed: w.id === 'bow' ? 1500 : 1900, splash: w.id === 'cannon' ? 45 : 0, life: 2 };
      shot.reserved = dmg * (1 - z.armor); z.pending += shot.reserved;
      s.windup = { shot, t: 0.18 }; s.animStage = 'windup'; s.animT = 0;
    }
    // turrets
    for (const t of this.turrets) {
      if (!t.level) continue;
      t.cd -= dt * (this.effects.rapid > 0 ? 1.5 : 1);
      if (t.cd > 0) continue;
      const pos = TURRET_SLOTS[t.slot];
      const dmg = TURRET.damage * (1 + TURRET.levelDamage * (t.level - 1)) * this.stats.turretDamage;
      const z = this.pickTarget(pos, dmg, TURRET.range);
      if (!z) { t.cd = 0.15; continue; }
      t.cd += TURRET.interval;
      t.flash = 0.18; t.aim = Math.atan2(z.y - pos.y, z.x - pos.x);
      this.launchShot({ x: pos.x, y: pos.y - 10, target: z, dmg, kind: 'ball', owner: null, speed: 1100, splash: TURRET.radius + 8 * t.level, life: 2.5 });
    }
  }

  launchShot(p) {
    const aim = intercept(p, p.target, p.speed), d = Math.hypot(aim.x - p.x, aim.y - p.y) || 1;
    p.vx = (aim.x - p.x) / d * p.speed; p.vy = (aim.y - p.y) / d * p.speed;
    p.flight = Math.min(p.life, d / p.speed); p.age = 0;
    if (p.reserved === undefined) {
      p.reserved = p.dmg * (1 - p.target.armor);
      p.target.pending += p.reserved;
    }
    this.shots.push(p);
  }

  releaseShot(p) {
    if (p.target && p.reserved) p.target.pending = Math.max(0, p.target.pending - p.reserved);
    p.reserved = 0;
  }

  moveShots(dt) {
    for (const p of this.shots) {
      p.life -= dt;
      p.age = (p.age || 0) + dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      let first = null, hitT = Infinity;
      for (const z of this.zombies) {
        if (z.hp <= 0) continue;
        const t = segmentHit(p.x, p.y, nx, ny, z.x, z.y - 24 * z.size, 10 + z.size * 7);
        if (t !== null && t < hitT) { first = z; hitT = t; }
      }
      if (first) {
        p.x += (nx - p.x) * hitT; p.y += (ny - p.y) * hitT;
        this.releaseShot(p); p.target = first; this.impact(p, first.x, first.y); p.dead = true;
      } else {
        p.x = nx; p.y = ny;
        if (p.life <= 0 || (p.splash && p.age >= p.flight)) {
          this.releaseShot(p); p.target = null;
          if (p.splash) this.impact(p, p.x, p.y);
          p.dead = true;
        }
      }
    }
    if (this.shots.length) this.shots = this.shots.filter(p => !p.dead);
  }

  impact(p, x, y) {
    this.releaseShot(p);
    if (p.splash) {
      for (const z of this.zombies) if (z.hp > 0 && Math.hypot(z.x - x, (z.y - y) * 1.3) < p.splash) this.damage(z, z === p.target ? p.dmg : p.dmg * 0.6, p.owner);
      this.emit('boom', { x, y, r: p.splash, kind: p.kind });
    } else if (p.target && p.target.hp > 0) this.damage(p.target, p.dmg, p.owner);
  }

  damage(z, amount, owner, raw = false) {
    if (z.hp <= 0) return;
    z.hp -= amount * (raw ? 1 : 1 - z.armor);
    z.hit = 0.12;
    if (z.hp > 0) return;
    z.hp = 0; z.hit = 0.5;
    this.coins += z.coins; this.waveCoins += z.coins;
    this.session.kills++;
    if (owner && this.survivors.has(owner)) {
      this.participant(owner).kills++;
      this.player(owner).kills = (this.player(owner).kills || 0) + 1;
      this.waveKills.set(owner, (this.waveKills.get(owner) || 0) + 1);
    }
    this.emit('kill', { x: z.x, y: z.y, kind: z.kind, owner, size: z.size });
  }

  clearWave() {
    this.state = 'clear'; this.stateT = 0;
    this.effects = { rapid: 0, freeze: 0 };
    this.meteors = [];
    const reward = this.cfg.reward;
    this.coins += reward;
    this.settlement.provision(this);
    delete this.fallsAt[this.wave];
    this.best = Math.max(this.best, this.wave + 1);
    const mvp = [...this.waveKills].sort((a, b) => b[1] - a[1])[0];
    const tapper = [...this.waveTaps].sort((a, b) => b[1] - a[1])[0];
    this.emit('clear', { wave: this.wave, reward, coins: this.waveCoins + reward, time: this.waveT, mvp: mvp ? { name: mvp[0], kills: mvp[1] } : null, tapper: tapper ? { name: tapper[0], taps: Math.round(tapper[1]) } : null, survivors: this.squad.filter(Boolean).length });
  }

  fall() {
    this.state = 'fallen'; this.stateT = 0;
    this.fallenWave = this.wave;
    this.fallsAt[this.wave] = (this.fallsAt[this.wave] || 0) + 1;
    this.effects = { rapid: 0, freeze: 0 };
    this.delayed = null;
    this.emit('fallen', { wave: this.wave, back: checkpointFor(this.wave), falls: this.fallsAt[this.wave] });
  }

  /* ---------- host ---------- */
  setWave(n) { n = clamp(Math.floor(n) || 1, 1, this.best); this.wallHp = this.stats.wallHp; this.coreHp = this.stats.coreHp; this.startWave(n); }

  get remaining() { return this.queue.length - this.spawned + this.zombies.filter(z => z.hp > 0).length; }
  get countdown() { return this.state === 'countdown' ? Math.max(1, 3 - Math.floor(this.stateT)) : 0; }

  leaderboard(n = 5) {
    return [...this.players].map(([name, p]) => ({ name, ...p, score: scoreFor(p), level: survivorLevel(scoreFor(p)) }))
      .filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
  }

  activeLeaderboard(n = 5) {
    return this.squad.filter(Boolean).map(s => {
      const p = this.activity.get(s.name) || { taps: 0, coins: 0, kills: 0 };
      return { name: s.name, avatar: s.avatar, kills: p.kills, score: scoreFor(p), level: this.levelOf(s.name) };
    }).sort((a, b) => b.score - a.score).slice(0, n);
  }
}
