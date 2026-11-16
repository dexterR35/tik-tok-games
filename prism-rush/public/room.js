import { Engine, moves, matches, resolve, copyBoard, scoreWave } from './engine.js';
import { MOTION, fallDuration } from './motion.js';

export const POWERS = {
  tap: { name: 'Smart move', detail: '100 team taps', icon: '↗' },
  rose: { name: 'Smart move', detail: 'Best legal cascade', icon: '✦' },
  meteor: { name: 'Meteor', detail: '3 × 3 nova blast', icon: '☄' },
  prism: { name: 'Prism', detail: 'Clear one gem color', icon: '◈' },
  supernova: { name: 'Supernova', detail: 'Double-prism board clear', icon: '✹' },
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const clean = (v, length = 28) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, length);
const addSafe = (a, b) => Math.min(Number.MAX_SAFE_INTEGER, a + b);
const normalize = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');

export class Room {
  constructor({ seed = 732941, saved = null, now = Date.now() } = {}) {
    this.now = now;
    this.engine = new Engine(seed, saved?.engine);
    this.settings = { auto: true, demo: true, roundSeconds: 300, relayUrl: 'ws://localhost:3000/ws', mappings: { rose: 'Rose', meteor: 'Finger Heart,GG', prism: 'Heart', supernova: 'Galaxy' }, ...saved?.settings };
    this.score = saved?.score || 0; this.round = saved?.round || 1;
    this.roundScore = saved?.roundScore || 0; this.roundRemaining = saved?.roundRemaining ?? this.settings.roundSeconds;
    this.bestChain = saved?.bestChain || 0; this.totalCleared = saved?.totalCleared || 0;
    this.tapCharge = saved?.tapCharge || 0; this.totalTaps = saved?.totalTaps || 0;
    this.chest = saved?.chest || 0; this.chests = saved?.chests || 0;
    this.users = new Map((saved?.users || []).slice(0, 5000).map(p => [p.id, p]));
    this.queue = (saved?.queue || []).slice(0, 512);
    this.history = (saved?.history || []).slice(0, 8);
    this.log = []; this.sequence = saved?.sequence || 0;
    this.paused = false;
    this.phase = saved?.phase || { type: 'idle', duration: MOTION.idle, id: 0 };
    this.phase.start = now;
    if (saved?.phaseRemaining !== undefined) this.phase.start = now - Math.max(0, this.phase.duration - saved.phaseRemaining);
    this.current = saved?.current || null; this.pendingHit = saved?.pendingHit || null;
    this.chain = saved?.chain || 0; this.active = saved?.active || { name: 'Reactor autopilot', type: 'auto', label: 'Finding the next cascade' };
    this.nextDemo = now + 5000; this.demoIndex = 0;
    this.live = { state: 'disconnected', live: false, text: 'Local demo · no TikTok account connected', username: '' };
    this.rejected = 0; this.votes = new Map(); this.voteColor = null;
    this.analysis = saved?.analysis || null; this.lastResult = saved?.lastResult || null;
    this.ranking = null;
    if (!saved?.phase && matches(this.engine.board).length) this.engine.shuffle();
    this.emit('welcome', 'Reactor online. Every cascade counts.');
  }
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
      this.users.set(id, { id, name: clean(user.name || user.nickname || user.uniqueId || id), score: 0, roundScore: 0, likes: 0, gifts: 0, trophies: 0, source });
    }
    const p = this.users.get(id); p.name = clean(user.name || user.nickname || p.name); this.ranking = null; return p;
  }
  enqueue(type, user, source = 'host', units = 1) {
    if (!POWERS[type]) throw Error('Unknown power');
    const p = this.participant(user, source); if (!p) return false;
    units = Math.floor(clamp(units, 1, 1_000_000));
    const last = this.queue.at(-1);
    if (last && last.userId === p.id && last.type === type && last.source === source) { last.units = addSafe(last.units, units); return true; }
    if (this.queue.length >= 512) { this.rejected++; this.emit('warning', 'Power queue full. New power could not be queued.'); return false; }
    this.queue.push({ type, userId: p.id, name: p.name, source, units });
    if (this.phase.type === 'idle' && !this.paused) this.phase.duration = Math.min(this.phase.duration, Math.max(0, this.now - this.phase.start) + MOTION.queued);
    this.emit('join', `${p.name} queued ${POWERS[type].name}${units > 1 ? ` ×${units}` : ''}`, { name: p.name, power: type });
    return true;
  }
  like(user, count, source = 'live') {
    count = Math.floor(clamp(count, 0, 1_000_000)); if (!count) return;
    const p = this.participant(user, source); if (!p) return;
    p.likes = addSafe(p.likes, count); this.totalTaps = addSafe(this.totalTaps, count);
    this.tapCharge += count;
    const charges = Math.floor(this.tapCharge / 100); this.tapCharge %= 100;
    if (charges) this.enqueue('tap', p, source, charges);
    else this.activeTap = { name: p.name, at: this.now };
  }
  incoming(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'batch') { for (const event of (packet.events || []).slice(0, 2000)) if (event.type !== 'batch') this.incoming(event); return; }
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
      p.gifts = addSafe(p.gifts, units); this.enqueue(type, p, 'live', units);
    }
    if (packet.type === 'chat') {
      const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
      const color = colors.indexOf(String(packet.text || '').trim().toLowerCase());
      if (color >= 0) { const p = this.participant(packet.user); if (p) this.votes.set(p.id, color); }
    }
  }
  setPhase(type, duration, extra = {}) { this.phase = { id: ++this.sequence, type, duration, start: this.now, ...extra }; }
  takeAction(action) {
    this.current = action; this.chain = 0;
    action.stats = { points: 0, cleared: 0, waves: 0, created: 0, activated: 0 };
    this.active = { name: action.name, type: action.type, source: action.source, label: action.type === 'auto' ? 'Reactor autopilot' : POWERS[action.type].name, units: action.units || 1 };
    if (action.type === 'meteor' || action.type === 'prism' || action.type === 'supernova') {
      let voted = null;
      if (action.type === 'prism') {
        const counts = Array(6).fill(0); for (const color of this.votes.values()) counts[color]++;
        voted = counts.some(Boolean) ? counts.indexOf(Math.max(...counts)) : null; this.votes.clear();
      }
      const best = this.engine.bestPower(action.type, voted), index = best.index;
      this.analysis = { ...best.analysis, name: action.name, source: action.source, color: best.color };
      const special = action.type === 'meteor' ? 'nova' : 'prism';
      this.engine.board[index] = { ...this.engine.board[index], special, color: special === 'prism' ? -1 : this.engine.board[index].color };
      this.current.powerIndex = index; this.current.powerColor = best.color;
      this.setPhase('power', MOTION.power, { index, power: action.type }); return;
    }
    const move = this.engine.bestMove(action.type !== 'auto');
    if (!move) { this.engine.shuffle(); this.setPhase('shuffle', MOTION.shuffle); return; }
    this.analysis = { ...move.analysis, name: action.name, source: action.source };
    this.current.move = { a: move.a, b: move.b };
    this.setPhase('swap', MOTION.swap, { a: move.a, b: move.b });
  }
  explode(hit) {
    if (!hit.clear.length) { this.settle(); return; }
    this.pendingHit = hit; this.chain++;
    this.bestChain = Math.max(this.bestChain, this.chain);
    const points = scoreWave(hit, this.chain);
    if (this.current) {
      this.current.stats ||= { points: 0, cleared: 0, waves: 0, created: 0, activated: 0 };
      const stats = this.current.stats; stats.points += points; stats.cleared += hit.clear.length; stats.waves++; stats.created += hit.births.length; stats.activated += hit.activated.length;
    }
    this.score = addSafe(this.score, points); this.roundScore = addSafe(this.roundScore, points);
    this.totalCleared = addSafe(this.totalCleared, hit.clear.length);
    this.chest += hit.clear.length;
    const chestOpened = this.chest >= 500;
    if (chestOpened) { this.chest %= 500; this.chests++; this.emit('chest', `Team chest #${this.chests} unlocked · +1 reactor trophy`, { number: this.chests }); }
    const p = this.users.get(this.current?.userId);
    if (p) { p.score = addSafe(p.score, points); p.roundScore = addSafe(p.roundScore, points); p.bestChain = Math.max(p.bestChain || 0, this.chain); this.ranking = null; }
    this.setPhase('explode', MOTION.burst, { clear: hit.clear, births: hit.births, activated: hit.activated, points, chain: this.chain, chestOpened });
  }
  settle() {
    this.pendingHit = null;
    if (matches(this.engine.board).length || !moves(this.engine.board).length) {
      this.engine.shuffle(); this.setPhase('shuffle', MOTION.shuffle); return;
    }
    if (this.chain >= 3) this.emit('cascade', `${this.active.name} · ${this.chain}× cascade`, { name: this.active.name, chain: this.chain });
    if (this.current?.type !== 'auto' && this.current?.stats) {
      this.lastResult = { ...this.current.stats, name: this.current.name, type: this.current.type, source: this.current.source, at: this.now, predicted: this.analysis?.points ?? null };
      const p = this.users.get(this.current.userId);
      if (p) { p.actions = (p.actions || 0) + 1; p.cleared = (p.cleared || 0) + this.current.stats.cleared; }
      this.emit('result', `${this.current.name} · +${this.current.stats.points.toLocaleString('en-US')} points · ${this.chain}× chain`);
    }
    this.current = null;
    if (this.roundRemaining <= 0) { this.finishRound(); return; }
    this.setPhase('idle', this.queue.length ? MOTION.queued : MOTION.idle);
  }
  finishRound() {
    const leader = this.leaders()[0];
    const winner = leader ? { id: leader.id, name: leader.name, score: leader.roundScore, source: leader.source } : { id: null, name: 'The reactor crew', score: this.roundScore, source: 'auto' };
    if (leader) { leader.trophies++; this.ranking = null; }
    const result = { round: this.round, ...winner, at: this.now, badge: ['Prism Champion', 'Nova Champion', 'Cascade Champion'][(this.round - 1) % 3] };
    this.history.unshift(result); this.history.length = Math.min(8, this.history.length);
    this.emit('winner', `${winner.name} is round ${this.round} champion!`, result);
    this.setPhase('winner', 5500, { winner: result });
  }
  leaders() {
    if (!this.ranking) this.ranking = [...this.users.values()].filter(p => p.roundScore > 0).sort((a, b) => b.roundScore - a.roundScore || a.id.localeCompare(b.id));
    return this.ranking;
  }
  step(dt, now = this.now + dt * 1000) {
    const elapsed = Math.max(0, (now - this.now) / 1000); this.now = now;
    if (this.paused) { this.phase.start += elapsed * 1000; this.nextDemo += elapsed * 1000; return; }
    if (this.phase.type !== 'winner') this.roundRemaining = Math.max(0, this.roundRemaining - elapsed);
    if (this.settings.demo && now >= this.nextDemo && !this.live.live) {
      const names = ['Luna', 'Kai', 'Mila', 'Alex', 'Nova', 'Rio'];
      const n = this.demoIndex++, name = names[n % names.length];
      const user = { id: `demo-${name}`, name: `${name} · demo` };
      if (n % 3 === 0) this.enqueue(['rose', 'meteor', 'prism', 'supernova'][Math.floor(n / 3) % 4], user, 'demo');
      else this.like(user, 35 + (n % 4) * 15, 'demo');
      this.nextDemo = now + 6500;
    }
    if (now - this.phase.start < this.phase.duration) return;
    const type = this.phase.type;
    if (type === 'idle') {
      if (this.roundRemaining <= 0) return this.finishRound();
      let action = this.queue.shift();
      if (action && action.units > 1) {
        this.queue.push({ ...action, units: action.units - 1 }); action = { ...action, units: 1 };
      }
      if (action) this.takeAction(action);
      else if (this.settings.auto) this.takeAction({ type: 'auto', name: 'Reactor autopilot', source: 'auto', units: 1 });
    } else if (type === 'swap') {
      const hit = this.engine.swap(this.phase.a, this.phase.b);
      hit ? this.explode(hit) : this.settle();
    } else if (type === 'power') {
      this.explode(resolve(this.engine.board, { triggers: [this.current.powerIndex], targetColor: this.current.powerColor ?? null, all: this.current.type === 'supernova' }));
    } else if (type === 'explode') {
      this.engine.clear(this.pendingHit);
      const drops = this.engine.collapse();
      this.setPhase('fall', fallDuration(drops), { drops });
    } else if (type === 'fall') {
      const hit = resolve(this.engine.board);
      // Safety bound for adversarial seeded refills; recovery is explicit.
      if (hit.clear.length && this.chain < 32) this.explode(hit);
      else if (hit.clear.length) { this.engine.shuffle(); this.emit('shuffle', 'Reactor stabilized after 32 cascade waves.'); this.setPhase('shuffle', MOTION.shuffle); }
      else this.settle();
    } else if (type === 'shuffle') this.settle();
    else if (type === 'winner') {
      this.round++; this.roundScore = 0; this.roundRemaining = this.settings.roundSeconds;
      for (const p of this.users.values()) p.roundScore = 0;
      this.ranking = null; this.current = null; this.setPhase('idle', MOTION.idle);
    }
  }
  command(c) {
    const source = 'host', user = { id: 'host-test', name: clean(c.name || 'Host test') };
    if (c.action === 'power') return this.enqueue(c.power, user, source);
    if (c.action === 'tap') return this.like(user, c.count || 25, source);
    if (c.action === 'pause') { this.paused = !this.paused; return; }
    if (c.action === 'demo') { this.settings.demo = !!c.value; this.nextDemo = this.now + 3000; return; }
    if (c.action === 'auto') { this.settings.auto = !!c.value; return; }
    if (c.action === 'finish') { this.roundRemaining = 0; return; }
    if (c.action === 'settings') {
      if (c.roundSeconds !== undefined) { this.settings.roundSeconds = Math.floor(clamp(c.roundSeconds, 60, 3600)); this.roundRemaining = Math.min(this.roundRemaining, this.settings.roundSeconds); }
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
  snapshot() {
    return { now: this.now, board: copyBoard(this.engine.board), phase: { ...this.phase }, score: this.score, round: this.round, roundScore: this.roundScore, remaining: this.roundRemaining, chain: this.chain, bestChain: this.bestChain, totalCleared: this.totalCleared, tapCharge: this.tapCharge, totalTaps: this.totalTaps, chest: this.chest, chests: this.chests, active: { ...this.active }, activeTap: this.activeTap, analysis: this.analysis, actionStats: this.current?.stats || null, lastResult: this.lastResult, leaders: this.leaders().slice(0, 5), participants: this.users.size, queue: this.queue.slice(0, 4), queueUnits: this.queue.reduce((n, a) => addSafe(n, a.units), 0), log: this.log.slice(0, 7), history: this.history, paused: this.paused, live: { ...this.live }, settings: this.settings, rejected: this.rejected, votes: this.votes.size, sequence: this.sequence };
  }
  export() {
    return { version: 1, engine: this.engine.export(), settings: this.settings, score: this.score, round: this.round, roundScore: this.roundScore, roundRemaining: this.roundRemaining, bestChain: this.bestChain, totalCleared: this.totalCleared, tapCharge: this.tapCharge, totalTaps: this.totalTaps, chest: this.chest, chests: this.chests, users: [...this.users.values()], queue: this.queue, history: this.history, sequence: this.sequence, phase: this.phase, phaseRemaining: Math.max(0, this.phase.duration - (this.now - this.phase.start)), current: this.current, pendingHit: this.pendingHit, chain: this.chain, active: this.active, analysis: this.analysis, lastResult: this.lastResult };
  }
}
