import { Sim } from '../public/sim.js';
const rows = [];
for (const wave of [1, 3, 5, 10]) for (const crowd of [0, 4, 8, 16]) for (const gift of [0, 100, 1000]) {
  const s = new Sim({wave}); s.autoUpgrade = false;
  for (let i = 0; i < crowd; i++) s.comment(`audit_${i}`, '!join');
  let peak = 0, wallDamage = 0, previous = s.wallHp, gifted = false;
  for (let tick = 0; tick < 180 * 60; tick++) {
    if (crowd && tick % 6 === 0) s.tap(1, `audit_${Math.floor(tick / 6) % crowd}`);
    s.update(1 / 60);
    if (!gifted && gift && s.waveT >= 18) { s.gift({ coins: gift, name: '', user: 'audit_gift' }); gifted = true; }
    peak = Math.max(peak, s.zombies.filter(z => z.hp > 0).length);
    wallDamage += Math.max(0, previous - s.wallHp); previous = s.wallHp;
    if (s.state === 'clear' || s.state === 'fallen') break;
  }
  rows.push({ wave, crowd, gift, result: s.state, seconds: Math.round(s.waveT), peakHorde: peak, wallPercent: Math.round(s.wallHp / s.stats.wallHp * 100), wallDamage: Math.round(wallDamage), kills: s.session.kills, total: s.queue.length });
}
console.table(rows);
