// Game simulation: level flow, crowd power, gift actions, fuel, pickups, checkpoints and crashes.
// No DOM access — the renderer reads this state and drains `events` for visual effects.
//
// Level flow:  intro (level card + gift menu) → countdown 3-2-1 → GO / drive → finish (jeep brakes to a stop)
// During intro / countdown / finish the race is LOCKED: taps do not move the jeep and gift boosts are banked.
// Banked boosts fire at GO, so a viewer never loses a gift. Leaderboard points and wallet coins count at once.
import {
  levelConfig, vehicleStats, stepTapPower, throttleFor, speedShareFor, fuelBurn, applyAction, actionForGift,
  giftWallet, autoUpgrade, upgradeCost, UPGRADES, SOCIAL, JUMP_WORDS, scoreFor, clamp, FLOW, DEFAULT_GIFT_MAP,
  sanitizeGiftMap, EFFECT_CAPS,
} from './rules.js';
import { Terrain } from './terrain.js';
import { Jeep } from './physics.js';

export const DT = 1 / 480;
const LOCKED = new Set(['intro', 'countdown', 'finish']);

export class Sim {
  constructor(save = {}) {
    this.coins = Math.max(0, Math.floor(save.coins || 0));
    this.upgrades = { engine: 0, suspension: 0, tires: 0, tank: 0, nitro: 0, ...(save.upgrades || {}) };
    this.level = Math.max(1, Math.floor(save.level || 1));
    this.best = Math.max(this.level, save.best || 1);
    this.autoUpgrade = save.autoUpgrade !== false;
    this.players = new Map(Object.entries(save.players || {}));   // name -> {taps, coins, avatar}
    this.giftMap = sanitizeGiftMap(save.giftMap || DEFAULT_GIFT_MAP);
    this.events = [];
    this.time = 0;
    this.tapPower = 0;
    this.sinceTap = 99;
    this.pendingTaps = 0;
    this.effects = { nitro: 0, grip: 0, power: 0, shield: 0 };
    this.bank = { effects: { nitro: 0, grip: 0, power: 0, shield: 0 }, fuel: 0, jumps: 0, gifts: 0 };
    this.jumpCd = 0;
    this.commentSeen = new Map();
    this.fans = new Map();       // recent tappers shown running behind the jeep: name -> {avatar, last, taps, gifted}
    this.copilot = null;
    this.session = { taps: 0, gifts: 0, coinsGifted: 0 };
    this.startLevel(this.level);
  }

  serialize() {
    return {
      coins: this.coins, upgrades: this.upgrades, level: this.level, best: this.best, autoUpgrade: this.autoUpgrade,
      players: Object.fromEntries([...this.players].sort((a, b) => scoreFor(b[1]) - scoreFor(a[1])).slice(0, 50)),
    };
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); if (this.events.length > 300) this.events.shift(); }

  get locked() { return LOCKED.has(this.state); }

  startLevel(n) {
    this.level = n;
    this.cfg = levelConfig(n);
    this.terrain = new Terrain(this.cfg);
    this.stats = vehicleStats(this.upgrades);
    this.jeep = new Jeep(this.stats);
    this.fuel = this.stats.tank;
    this.checkpoint = 0;
    this.maxX = 0;
    this.state = 'intro';
    this.stateT = 0;
    this.levelT = 0;
    this.levelCoins = 0;
    this.levelTaps = new Map();
    this.stuckT = 0; this.liftStage = 0;
    this.crashesHere = 0;
    this.effects = { nitro: 0, grip: 0, power: 0, shield: 0 };
    this.tapPower = 0;
    this.spawn(0);
    this.emit('level', { level: n, name: this.cfg.biome.name, length: this.cfg.length });
  }

  spawn(x) {
    const t = this.terrain;
    this.jeep.reset(x, t.height(x) + 1.45, Math.atan(t.slope(x)));
    this.stuckT = 0; this.liftStage = 0;
  }

  refreshStats() {
    const st = vehicleStats(this.upgrades);
    const frac = this.fuel / this.stats.tank;
    this.stats = st; this.jeep.stats = st;
    this.fuel = clamp(frac, 0, 1) * st.tank;
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

  player(name, avatar) {
    name = String(name || 'VIEWER').slice(0, 24);
    let p = this.players.get(name);
    if (!p) { p = { taps: 0, coins: 0 }; this.players.set(name, p); }
    if (avatar) p.avatar = avatar;
    return p;
  }

  fan(name, avatar, taps, gifted = false) {
    if (!name) return;
    let f = this.fans.get(name);
    if (!f) { f = { name, avatar: null, taps: 0, gifted: false, last: 0, first: this.time }; this.fans.set(name, f); }
    if (avatar) f.avatar = avatar;
    f.taps += taps; f.last = this.time; f.gifted = f.gifted || gifted;
    if (this.fans.size > 60) {
      const oldest = [...this.fans.values()].sort((a, b) => a.last - b.last)[0];
      this.fans.delete(oldest.name);
    }
  }

  /** Up to n most recent tappers/gifters (active in the last 15 s), newest first. */
  activeFans(n = 7) {
    return [...this.fans.values()].filter(f => this.time - f.last < 15).sort((a, b) => b.last - a.last).slice(0, n);
  }

  /* ---------- crowd input ---------- */
  tap(count = 1, user = null, avatar = null) {
    if (!(count > 0)) return;
    if (!this.locked) this.pendingTaps += count;   // taps never move the jeep during the countdown / finish
    this.session.taps += count;
    if (user) {
      this.player(user, avatar).taps += count;
      this.fan(user, avatar, count);
      this.levelTaps.set(user, (this.levelTaps.get(user) || 0) + count);
      this.emit('fantap', { user, count });
    }
  }

  gift({ coins = 1, count = 1, user = 'VIEWER', avatar = null, name = 'Gift' }) {
    count = Math.max(1, Math.floor(count) || 1);
    const action = actionForGift(name, coins, this.giftMap);
    const wallet = giftWallet(coins, count);
    this.coins += wallet;
    const p = this.player(user, avatar);
    p.coins += coins * count;
    this.fan(user, avatar, 0, true);
    this.session.gifts += count; this.session.coinsGifted += coins * count;
    const value = coins * count;
    if (!this.copilot || value >= this.copilot.value || this.time - this.copilot.t > 45) this.copilot = { name: String(user).slice(0, 24), avatar, value, t: this.time };
    const banked = this.locked;
    if (banked) {
      // hold the boost until GO
      const res = applyAction(this.bank.effects, action, count);
      this.bank.effects = res.effects;
      this.bank.fuel = Math.min(1, this.bank.fuel + res.fuel);
      this.bank.jumps = Math.min(1, this.bank.jumps + res.jumps);
      this.bank.gifts += count;
    } else this.useAction(action, count, user);
    this.emit('gift', { action, count, user, avatar, wallet, name, banked });
  }

  useAction(action, count, user) {
    const res = applyAction(this.effects, action, count);
    this.effects = res.effects;
    if (res.fuel) this.fuel = Math.min(this.stats.tank, this.fuel + res.fuel * this.stats.tank);
    if (res.jumps) this.jump(user, true);
    if (this.state === 'empty' && this.fuel > 1) { this.state = 'drive'; this.stateT = 0; }
  }

  releaseBank() {
    const b = this.bank;
    if (!b.gifts) return;
    for (const k of Object.keys(this.effects)) this.effects[k] = Math.min(EFFECT_CAPS[k], this.effects[k] + (b.effects[k] || 0));
    if (b.fuel) this.fuel = Math.min(this.stats.tank, this.fuel + b.fuel * this.stats.tank);
    const jumps = b.jumps, gifts = b.gifts;
    this.bank = { effects: { nitro: 0, grip: 0, power: 0, shield: 0 }, fuel: 0, jumps: 0, gifts: 0 };
    if (jumps) this.jumpQueued = 0.4;
    this.emit('bank', { gifts });
  }

  follow(user, avatar) {
    this.fan(user, avatar, 0);
    if (this.locked) { this.bank.fuel = Math.min(1, this.bank.fuel + SOCIAL.followFuel); this.bank.gifts = Math.max(1, this.bank.gifts); }
    else this.fuel = Math.min(this.stats.tank, this.fuel + SOCIAL.followFuel * this.stats.tank);
    if (this.state === 'empty') { this.state = 'drive'; this.stateT = 0; }
    this.emit('follow', { user, avatar });
  }

  share(user, avatar) {
    this.fan(user, avatar, 0);
    if (this.locked) { this.bank.effects.grip = Math.min(45, this.bank.effects.grip + SOCIAL.shareGrip); this.bank.gifts = Math.max(1, this.bank.gifts); }
    else this.effects.grip = Math.min(45, (this.effects.grip || 0) + SOCIAL.shareGrip);
    this.emit('share', { user, avatar });
  }

  comment(user, text, avatar) {
    const last = this.commentSeen.get(user) ?? -99;
    if (this.time - last >= SOCIAL.commentCooldown) {
      this.commentSeen.set(user, this.time);
      if (this.commentSeen.size > 5000) this.commentSeen.delete(this.commentSeen.keys().next().value);
      this.tap(SOCIAL.commentTaps, user, avatar);
    }
    if (JUMP_WORDS.test(String(text || ''))) this.jump(user);
  }

  jump(user, mega = false) {
    if (this.state !== 'drive' || !this.jeep.grounded || (!mega && this.jumpCd > 0)) return false;
    const [nx, ny] = this.terrain.normal(this.jeep.x);
    const v = mega ? SOCIAL.megaJumpSpeed : SOCIAL.jumpSpeed;
    const j = this.jeep;
    j.vx += nx * v; j.vy += ny * v;
    for (const w of j.wheels) { w.vx += nx * v; w.vy += ny * v; }
    if (!mega) this.jumpCd = SOCIAL.jumpCooldown;
    this.emit('jump', { user, mega });
    return true;
  }

  /* ---------- simulation ---------- */
  update(frameDt) {
    frameDt = Math.min(frameDt, 0.1);
    const steps = Math.max(1, Math.round(frameDt / DT));
    const tapsPerStep = this.pendingTaps / steps;
    this.pendingTaps = 0;
    for (let i = 0; i < steps; i++) this.fixed(DT, tapsPerStep);
  }

  fixed(dt, taps) {
    this.time += dt;
    this.stateT += dt;
    if (taps > 0) this.sinceTap = 0; else this.sinceTap += dt;
    this.tapPower = this.locked ? 0 : stepTapPower(this.tapPower, taps, dt, taps > 0 ? 0 : this.sinceTap);
    if (!this.locked) for (const k in this.effects) this.effects[k] = Math.max(0, this.effects[k] - dt);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    if (this.jumpQueued > 0 && (this.jumpQueued -= dt) <= 0) this.jump('BANKED GIFT', true);

    // level flow
    if (this.state === 'intro' && this.stateT >= FLOW.intro) { this.state = 'countdown'; this.stateT = 0; this.emit('count', { n: 3 }); }
    else if (this.state === 'countdown') {
      const n = 3 - Math.floor(this.stateT);
      if (n !== this.lastCount && n > 0) { this.lastCount = n; if (n < 3) this.emit('count', { n }); }
      if (this.stateT >= FLOW.countdown) { this.state = 'drive'; this.stateT = 0; this.lastCount = 0; this.emit('go'); this.releaseBank(); }
    }

    const j = this.jeep, t = this.terrain;
    const driving = this.state === 'drive';
    const engineOn = driving && this.fuel > 0;
    const throttle = engineOn ? throttleFor(this.tapPower) : 0;
    const nitro = engineOn && this.effects.nitro > 0;

    j.step(t, {
      throttle,
      speedShare: Math.max(speedShareFor(this.tapPower), nitro ? 1 : 0),
      powerMult: this.effects.power > 0 ? 1.8 : 1,
      gripMult: this.effects.grip > 0 ? 1.5 : 1,
      nitro,
      assist: this.effects.shield > 0,
      brake: throttle === 0 && !nitro,
    }, dt);
    if (!Number.isFinite(j.x + j.y + j.a + j.vx + j.vy + j.wheels[0].x + j.wheels[1].y)) { this.spawn(this.checkpoint); return; }

    if (driving) {
      this.levelT += dt;
      if (this.fuel > 0) this.fuel = Math.max(0, this.fuel - fuelBurn(throttle) * dt);
    }
    if (j.landImpact > 3) this.emit('land', { power: j.landImpact });
    j.landImpact = 0;

    // pickups
    for (const p of t.pickups) {
      if (p.taken || p.x < j.x - 3.5) continue;
      if (p.x > j.x + 3.5) break;
      if (Math.hypot(p.x - j.x, p.y - (j.y + 0.2)) < 2.0) {
        p.taken = true;
        if (p.type === 'coin') { this.coins += this.cfg.coinValue; this.levelCoins += this.cfg.coinValue; }
        else this.fuel = Math.min(this.stats.tank, this.fuel + 0.45 * this.stats.tank);
        this.emit('pickup', { kind: p.type, x: p.x, y: p.y });
      }
    }

    if (driving) {
      // stuck at an obstacle while the crowd is tapping → the crowd helps, then lifts the jeep over
      if (j.x > this.maxX + 0.5) { this.maxX = j.x; this.stuckT = 0; this.liftStage = 0; }
      else if (this.tapPower > 0.25) this.stuckT += dt;
      if (this.stuckT > 14 && this.liftStage === 0) {
        this.liftStage = 1;
        this.effects.power = Math.max(this.effects.power, 6); this.effects.grip = Math.max(this.effects.grip, 6);
        this.emit('crowdpush');
      } else if (this.stuckT > 26 && this.liftStage === 1) {
        this.liftStage = 2; this.stuckT = 0;
        const nx = Math.min(t.finish - 1, this.maxX + 6);
        this.spawn(nx); this.maxX = nx;
        this.emit('crowdlift');
      }
      const cp = t.checkpoints.filter(c => c <= j.x).pop() || 0;
      if (cp > this.checkpoint) { this.checkpoint = cp; this.crashesHere = 0; this.emit('checkpoint', { x: cp }); }
      const up = j.uprightness(t);
      if (((j.roofHit && up < 0.25) || up < -0.6) && !(this.effects.shield > 0)) {
        this.state = 'crash'; this.stateT = 0; this.emit('crash', { x: j.x, y: j.y });
      }
      if (this.fuel <= 0 && j.speed < 0.6) { this.state = 'empty'; this.stateT = 0; this.emit('empty'); }
      if (j.x >= t.finish) {
        this.state = 'finish'; this.stateT = 0;
        this.effects = { nitro: 0, grip: 0, power: 0, shield: 0 };   // boosts end at the line
        const reward = this.cfg.reward;
        this.coins += reward;
        this.best = Math.max(this.best, this.level + 1);
        const mvp = [...this.levelTaps].sort((a, b) => b[1] - a[1])[0];
        this.emit('finish', { level: this.level, reward, levelCoins: this.levelCoins + reward, time: this.levelT, mvp: mvp ? mvp[0] : null });
      }
    } else if (this.state === 'crash' && this.stateT > 2.4) {
      this.spawn(this.checkpoint); this.state = 'drive'; this.stateT = 0;
      this.crashesHere++;
      const rescue = this.crashesHere >= 2;
      if (rescue) this.effects.shield = Math.max(this.effects.shield, 6 + 2 * Math.min(5, this.crashesHere));
      this.emit('respawn', { rescue });
    } else if (this.state === 'empty' && this.stateT > 6) {
      this.fuel = this.stats.tank * 0.5; this.spawn(this.checkpoint);
      this.state = 'drive'; this.stateT = 0; this.emit('refuel');
    } else if (this.state === 'finish' && this.stateT > FLOW.finish) {
      if (this.autoUpgrade) {
        const plan = autoUpgrade(this.upgrades, this.coins);
        this.upgrades = plan.levels; this.coins = plan.coins;
        if (plan.bought.length) this.emit('autoupgrade', { bought: plan.bought, upgrades: { ...this.upgrades } });
      }
      this.startLevel(this.level + 1);
    }
  }

  respawn() { if (this.state === 'drive' || this.state === 'empty') { this.spawn(this.checkpoint); this.state = 'drive'; this.emit('respawn', {}); } }

  get progress() { return clamp(this.jeep.x / this.terrain.finish, 0, 1); }
  get countdown() { return this.state === 'countdown' ? Math.max(1, 3 - Math.floor(this.stateT)) : 0; }

  leaderboard(n = 5) {
    return [...this.players].map(([name, p]) => ({ name, ...p, score: scoreFor(p) }))
      .filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
  }
}
