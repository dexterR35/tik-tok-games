// 🔊 Sunet sintetizat (Web Audio) – fara fisiere externe
export class Sound {
  constructor(volume = 0.5) {
    this.vol = volume; this.ctx = null; this.master = null; this.muted = false; this.engine = null; this.ready = false;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.vol; this.master.connect(this.ctx.destination);
    // motor: zgomot filtrat + bas cu inaltime variabila
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const ng = c.createGain(); ng.gain.value = 0;
    noise.connect(lp).connect(ng).connect(this.master); noise.start();
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 55;
    const og = c.createGain(); og.gain.value = 0;
    const olp = c.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 220;
    osc.connect(olp).connect(og).connect(this.master); osc.start();
    this.engine = { ng, og, osc, lp };
    this.ready = true;
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  get active() { return !!this.ctx && this.ctx.state === 'running'; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.05); }
  // intensitate 0..1 (viteza liderului), on = in cursa
  setEngine(intensity, on) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, k = on ? intensity : 0;
    this.engine.ng.gain.setTargetAtTime(0.05 * k + (on ? 0.012 : 0), t, 0.2);
    this.engine.og.gain.setTargetAtTime(0.045 * k + (on ? 0.01 : 0), t, 0.2);
    this.engine.osc.frequency.setTargetAtTime(45 + 90 * k, t, 0.3);
    this.engine.lp.frequency.setTargetAtTime(250 + 900 * k, t, 0.3);
  }
  tone(freq, dur, { type = 'sine', gain = 0.25, attack = 0.005, decay = dur, slide = 0, delay = 0 } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { gain = 0.3, from = 400, to = 4000, delay = 0 } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + delay;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t);
  }
  // ---- efecte
  tap() { this.tone(900 + Math.random() * 300, 0.06, { type: 'square', gain: 0.05 }); }
  coin() { this.tone(1320, 0.08, { gain: 0.08 }); this.tone(1760, 0.12, { gain: 0.08, delay: 0.06 }); }
  rocket() { this.noise(0.9, { gain: 0.35, from: 200, to: 3500 }); this.tone(220, 0.8, { type: 'sawtooth', gain: 0.12, slide: 600 }); }
  bonk() { this.tone(140, 0.25, { type: 'triangle', gain: 0.35, slide: -90 }); this.noise(0.12, { gain: 0.2, from: 1500, to: 300 }); }
  gift(big) { const n = [1046, 1318, 1568, 2093]; n.slice(0, big ? 4 : 2).forEach((f, i) => this.tone(f, 0.25, { gain: 0.16, delay: i * 0.09 })); }
  ding() { this.tone(1568, 0.3, { gain: 0.12 }); }
  count(final) { final ? this.tone(880, 0.6, { type: 'square', gain: 0.2 }) : this.tone(440, 0.15, { type: 'square', gain: 0.15 }); }
  horn() { [1, 1.25, 1.5].forEach((m, i) => this.tone(180 * m, 0.9, { type: 'sawtooth', gain: 0.12, delay: 0 })); }
  fanfare() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, i === 6 ? 1.2 : 0.22, { type: 'triangle', gain: 0.2, delay: i * 0.17 })); }
  lead() { this.tone(660, 0.12, { gain: 0.15 }); this.tone(990, 0.25, { gain: 0.15, delay: 0.1 }); }
  shield() { this.tone(330, 0.5, { type: 'sine', gain: 0.15, slide: 660 }); }
  eliminated() { this.tone(200, 0.5, { type: 'sawtooth', gain: 0.2, slide: -120 }); this.noise(0.4, { gain: 0.2, from: 800, to: 100 }); }
  warn() { [0, 0.25].forEach(d => this.tone(520, 0.12, { type: 'square', gain: 0.12, delay: d })); }
  sprint() { [0, 0.12, 0.24].forEach((d, i) => this.tone(600 + i * 200, 0.15, { type: 'square', gain: 0.14, delay: d })); }
  streak() { this.noise(0.25, { gain: 0.25, from: 300, to: 2500 }); }
  meteor() { this.noise(0.7, { gain: 0.4, from: 3000, to: 100 }); this.tone(60, 0.7, { type: 'sine', gain: 0.4, slide: -30, delay: 0.5 }); }
  revive() { [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.2, { gain: 0.15, delay: i * 0.08 })); }
  whoosh() { this.noise(0.35, { gain: 0.2, from: 500, to: 2500 }); }
}
