import { EchoGame, EFFECTS, normalizeGift } from './public/engine.js';
import { WORLDS } from './public/worlds.js';
import { createDemoState, runDemo } from './public/demo.js';

export const DEFAULT_SETTINGS = {
  demo: true, autoAdvance: true, reconnect: false, relayUrl: 'ws://localhost:3000/ws',
  mappings: { cube: 'Rose', heal: 'Heart', pulse: 'Finger Heart', shield: 'Hand Hearts', boost: 'GG' },
};

export class ControlRoom {
  constructor({ settings = {}, progress = {}, onSignal = () => {}, onSave = () => {} } = {}) {
    const legacyMappings={...settings.mappings};
    if(!Object.hasOwn(legacyMappings,'heal')&&String(legacyMappings.shield||'').toLowerCase()==='heart')legacyMappings.shield='Hand Hearts';
    this.settings = { ...DEFAULT_SETTINGS, ...settings, mappings: { ...DEFAULT_SETTINGS.mappings, ...legacyMappings } };
    this.onSignal = onSignal; this.onSave = onSave;
    this.signals = []; this.signalSequence = 0; this.queue = []; this.energy = 0;
    this.view = 'game'; this.selectedWorld = 0; this.transition = null; this.finishAt = null;
    this.demoState = createDemoState(); this.resumePaused = false; this.now = 0;
    this.live = { state: 'disconnected', live: false, username: '', text: 'Relay disconnected' };
    this.game = new EchoGame({ progress, onEvent: event => this.gameEvent(event) });
    this.game.start();
  }
  signal(kind, data = {}) {
    const signal = { id: ++this.signalSequence, kind, ...data };
    this.signals.push(signal); if (this.signals.length > 20) this.signals.shift(); this.onSignal(signal);
  }
  gameEvent(event) {
    const game = this.game;
    this.signal(event.type, event);
    if (event.type === 'rescue') {
      const lastEchoTime = game.previous.at(-1)?.at || 0;
      this.finishAt = Math.min(game.duration, Math.max(game.time + 2.2, lastEchoTime + .3));
      this.onSave();
    }
    if (event.type === 'loop' || event.type === 'warp') { this.finishAt = null; this.demoState = createDemoState(); }
    if (event.type === 'rewind' && game.robot.rescued && game.loop >= 2 && this.settings.autoAdvance) {
      this.selectedWorld = (game.levelIndex + 1) % WORLDS.length;
      this.view = 'map'; this.resumePaused = false; game.paused = true;
      this.transition = { kind: 'warp', until: this.now + 3600, world: this.selectedWorld };
    }
  }
  effect(type, viewer = 'Host test') {
    if (!Object.hasOwn(EFFECTS, type)) return false;
    if (!this.queue.length && this.game.send(type, viewer)) return true;
    if (this.queue.length >= 1000) { this.signal('overflow'); return false; }
    this.queue.push({ type, viewer }); return true;
  }
  incoming(message, depth = 0) {
    if (!message || depth > 3) return;
    if (message.type === 'batch' && Array.isArray(message.events)) {
      for (const event of message.events.slice(0, 500)) this.incoming(event, depth + 1); return;
    }
    if (message.type === 'status') {
      this.live = { state: message.live ? 'live' : 'offline', live: !!message.live, username: String(message.username || '').replace(/^@/, ''), text: String(message.text || (message.live ? 'TikTok LIVE connected' : 'Account is not LIVE')) };
      return;
    }
    if (message.type === 'chat') {
      const route = String(message.text || '').trim().toLowerCase().replace(/^!/, '');
      this.game.vote(message.user?.id || message.user?.name || 'anonymous', route); return;
    }
    if (message.type === 'like') { this.addLikes(Number(message.count) || 1); return; }
    const gift = normalizeGift(message, this.settings.mappings);
    if (gift) {
      for (let i = 0; i < Math.min(gift.count, 1160); i++) this.effect(gift.type, gift.viewer);
      if (gift.count > 1160) this.signal('overflow');
    }
  }
  addLikes(count) {
    if (!Number.isFinite(count) || count <= 0) return;
    this.energy += Math.min(500, Math.floor(count));
    while (this.energy >= 100) { this.energy -= 100; this.effect('pulse', 'TEAM TAPS'); this.signal('team-jump'); }
  }
  command(command) {
    if (!command || typeof command !== 'object') throw Error('Invalid command');
    const game = this.game;
    switch (command.action) {
      case 'effect': return this.effect(command.effect, 'Host test');
      case 'likes': this.addLikes(20); break;
      case 'pause': if (this.view === 'game') game.paused = !game.paused; break;
      case 'reset':
        this.view = 'game'; this.transition = null; this.queue = []; this.finishAt = null; this.energy = 0;
        game.reset(); this.demoState = createDemoState(); this.signals = []; game.start(); this.signal('restart'); break;
      case 'demo': this.settings.demo = !!command.enabled; this.demoState = createDemoState(); this.onSave(); break;
      case 'autoAdvance': this.settings.autoAdvance = !!command.enabled; this.onSave(); break;
      case 'warp':
        if (!Number.isInteger(command.world) || !WORLDS[command.world]) throw Error('Invalid world');
        this.view = 'game'; this.transition = null; game.warp(command.world, { carryEchoes: true }); this.selectedWorld = command.world; break;
      case 'selectWorld':
        if (!Number.isInteger(command.world) || !WORLDS[command.world]) throw Error('Invalid world');
        this.selectedWorld = command.world; break;
      case 'map':
        if (command.open && this.view !== 'map') { this.resumePaused = game.paused; game.paused = true; this.view = 'map'; this.selectedWorld = game.levelIndex; this.transition = null; }
        else if (!command.open) { this.view = 'game'; game.paused = this.resumePaused; this.transition = null; }
        break;
      case 'vote': game.vote('host-vote', command.route); break;
      default: throw Error('Unknown command');
    }
    return true;
  }
  step(dt, now) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.now = now;
    if (this.transition && now >= this.transition.until) {
      const world = this.transition.world; this.transition = null; this.view = 'game'; this.game.warp(world, { carryEchoes: true });
    }
    if (this.view !== 'game') return;
    let remaining = Math.min(dt, .5);
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60); remaining -= step;
      if (this.settings.demo) runDemo(this.game, this.demoState);
      if (!this.game.paused && this.game.phase === 'running') {
        for (let i = 0; i < 4 && this.queue.length && this.game.recording.length < 160; i++) {
          const event = this.queue.shift(); this.game.send(event.type, event.viewer);
        }
      }
      this.game.step(step);
      if (this.finishAt !== null && this.game.robot.rescued && this.game.phase === 'running' && this.game.time >= this.finishAt) this.game.finishLoop();
      if (this.view !== 'game') break;
    }
  }
  snapshot() {
    const g = this.game, r = g.robot;
    return {
      protocol: 1, serverTime: Date.now(),
      game: {
        phase: g.phase, paused: g.paused, loop: g.loop, time: g.time, levelIndex: g.levelIndex, route: g.route,
        robot: { ...r, memories: [...r.memories], hazards: [...r.hazards] },
        previous: g.previous, recording: g.recording, effects: g.effects, nextEcho: g.nextEcho,
        rescues: g.rescues, gifts: g.gifts, echoes: g.echoes, completed: g.completed,
        transition: g.transition, outcome: g.outcome, lastStars: g.lastStars, progress: g.progress, checkpoint:g.checkpoint,parts:g.parts,runElapsed:g.runElapsed,
      },
      host: { ...this.settings, view: this.view, selectedWorld: this.selectedWorld },
      live: this.live, queued: this.queue.length, energy: this.energy, transition: this.transition, signals: this.signals, votes: g.voteCounts,
    };
  }
}
