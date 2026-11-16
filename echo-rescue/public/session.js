import { EchoGame } from './engine.js';

export async function command(action, fields = {}) {
  const response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...fields }) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'Command failed'); return result;
}

export class GameSession {
  constructor({ onState = () => {}, onSignal = () => {}, onConnection = () => {} } = {}) {
    this.game = new EchoGame(); this.snapshot = null; this.lastReceived = 0; this.lastSignal = null; this.connected = null;
    this.source = new EventSource('/api/events');
    this.source.addEventListener('state', event => {
      const snapshot = JSON.parse(event.data), data = snapshot.game;
      this.lastReceived = performance.now(); this.targetRobot = data.robot;
      const boundary = this.game.levelIndex !== data.levelIndex || this.game.loop !== data.loop || data.time < this.game.time - 1;
      const x = this.game.robot.x, z = this.game.robot.z;
      Object.assign(this.game, data);
      this.game.robot = { ...data.robot, memories: new Set(data.robot.memories), hazards: new Set(data.robot.hazards) };
      if (!boundary && this.snapshot) { this.game.robot.x = x; this.game.robot.z = z; }
      this.serverGameTime = data.time; this.snapshot = snapshot;
      if (this.lastSignal !== null) for (const signal of snapshot.signals) if (signal.id > this.lastSignal) onSignal(signal);
      this.lastSignal = snapshot.signals.at(-1)?.id ?? this.lastSignal ?? 0;
      if(this.connected!==true){this.connected=true;onConnection(true);} onState(snapshot);
    });
    this.source.onerror = () => {if(this.connected!==false){this.connected=false;onConnection(false);}};
  }
  frame(now, dt) {
    if (!this.snapshot) return;
    const blend = 1 - Math.exp(-20 * dt), r = this.game.robot;
    r.x += (this.targetRobot.x - r.x) * blend; r.z += (this.targetRobot.z - r.z) * blend;
    const advancing = this.game.phase === 'running' && !this.game.paused && this.snapshot.host.view === 'game';
    this.game.time = Math.min(this.game.duration, this.serverGameTime + (advancing ? Math.min(.1, (now - this.lastReceived) / 1000) : 0));
  }
}
