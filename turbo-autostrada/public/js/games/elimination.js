// 💀 JOCUL 4 – ELIMINARE: fara linie de sosire. La fiecare taiere ultimii ies, pana raman finalistii; apoi FINALA.
import { RULES } from '../rules.js';
import { t } from '../i18n.js';
import * as M from '../math.js';

const G = () => RULES.ELIMINATION;
const S = { plan: null, cutsDone: 0, nextAt: 0, warned: false, final: false, lineD: 0 };
const GRACE = 12; // cine tocmai a intrat / a revenit nu poate fi scos la taierea din urmatoarele secunde
const plan = api => (api.phase === 'race' && S.plan) || M.elimPlan(G(), Math.max(2, api.players.size));
const cutSize = api => M.elimCut(api.unfinished.length, S.plan.finalists, S.plan.cuts - S.cutsDone);
const secondsToCut = api => Math.max(0, S.nextAt - api.elapsed);

function startFinal(api) {
  S.final = true;
  const alive = api.unfinished;
  if (S.plan.final > 0 && alive.length > 1) {
    api.phaseT = S.plan.final;
    if (alive[0]) api.banner(alive[0], '', t('final', { n: alive.length }));
    api.snd.sprint(); api.shake(0.4);
  } else api.endIn(2.5);
}
function doCut(api) {
  api.rankAll();
  const alive = api.unfinished, k = cutSize(api), el = api.elapsed;
  // ultimii k, dar nu cei abia intrati / reveniti (la ULTIMA taiere nu mai exista protectie: in finala intra exact finalistii)
  const victims = [], last = S.cutsDone + 1 >= S.plan.cuts;
  for (let i = alive.length - 1; i >= 0 && victims.length < k; i--) if (last || !(alive[i].graceUntil > el)) victims.push(alive[i]);
  for (const p of victims) { p.out = true; p.outAt = el; p.speed = 0; p.reviveCoins = 0; api.knockOut(p); }
  if (victims.length === 1) api.banner(victims[0], '', t('eliminatedOne'));
  else if (victims.length) api.banner(victims[0], '', t('eliminated', { n: victims.length }));
  api.shake(0.5); api.snd.eliminated();
  S.cutsDone++; S.warned = false; S.nextAt += G().EVERY;
  api.rankAll();
  if (S.cutsDone >= S.plan.cuts || api.unfinished.length <= S.plan.finalists) startFinal(api);
}
function revive(api, p) {
  const last = api.unfinished[api.unfinished.length - 1];
  p.out = false; p.outAt = 0; p.d = last ? Math.max(0, last.d - 2) : p.d; p.stumble = 0; p.pu.shield = Math.max(p.pu.shield, 3); p.graceUntil = api.elapsed + GRACE;
  api.toast(p, `<b>${api.esc(p.name)}</b><small>${t('revived')}</small>`, true); api.banner(p, '', '❤️ ' + t('revived').toUpperCase()); api.snd.revive();
  api.focusOn(p, 3); api.rankAll();
}

export default {
  id: 'elimination', key: 'ELIMINATION', hasFinish: false, skin: 'flame',
  state: S,
  enter() { S.plan = null; S.final = false; }, leave() {},
  need: api => Math.max(0, G().MIN_RACERS - api.players.size),
  // durata se calculeaza din numarul de jucatori (vezi rules.js)
  roundSeconds: (api, n) => M.elimPlan(G(), Math.max(2, n)).seconds,
  canJoin: api => !(api.phase === 'race' && S.final), // in finala nu mai intra nimeni
  onJoin(api, p) { if (api.phase === 'race') p.graceUntil = api.elapsed + GRACE; },
  onRaceStart(api) { S.plan = M.elimPlan(G(), Math.max(2, api.players.size)); S.cutsDone = 0; S.nextAt = G().FIRST_AT; S.warned = false; S.final = false; S.lineD = 0; },
  onPlayerEvent(api, p, vw, ev) {
    if (!p.out) return false;
    // eliminat: doar un gift il poate readuce (monedele conteaza si ca racheta); in finala gift-ul se pastreaza pentru runda urmatoare
    if (ev.type === 'gift' && (ev.coins || 0) > 0) {
      // in finala, sau cu mai putin de GRACE secunde pana la ULTIMA taiere (unde nu exista protectie), revenirea l-ar scoate imediat:
      // monedele (si cele strânse deja spre revenire) se pastreaza pentru runda urmatoare, nu se pierd
      const lastCutSoon = S.plan && S.cutsDone + 1 >= S.plan.cuts && secondsToCut(api) < GRACE;
      if (api.phase !== 'race' || S.final || lastCutSoon) { const c = ev.coins + (p.reviveCoins || 0); p.reviveCoins = 0; api.keepForNextRound(p, c); return true; }
      p.reviveCoins = (p.reviveCoins || 0) + ev.coins;
      if (p.reviveCoins >= G().REVIVE_COINS) { const c = p.reviveCoins; p.reviveCoins = 0; revive(api, p); api.applyGift(p, { ...ev, coins: c, total: Math.max(c, ev.total || 0), final: true }); }
      else api.toast(p, `<b>${api.esc(p.name)}</b><small>${t('reviveProgress', { n: p.reviveCoins, t: G().REVIVE_COINS })}</small>`, true);
    }
    return true;
  },
  tick(api) {
    if (S.final || !S.plan) return;
    const alive = api.unfinished;
    if (alive.length <= S.plan.finalists) { startFinal(api); return; }
    const left = secondsToCut(api);
    if (left <= 5 && !S.warned) {
      S.warned = true; api.snd.warn();
      const danger = alive.slice(-cutSize(api)).slice(-3).reverse();
      if (danger.length) api.toast(danger[0], `<b>${t('danger')}</b><small>${danger.map(p => api.esc(p.name)).join(', ')}</small>`, true);
      api.shake(0.15);
    }
    if (left <= 0) doCut(api);
  },
  // linia rosie: intre ultimul salvat si primul din zona de eliminare
  onRank(api) {
    if (api.phase !== 'race' || S.final || !S.plan) { S.lineD = 0; return; }
    const a = api.unfinished, k = cutSize(api), i = a.length - k;
    S.lineD = i > 0 && i < a.length ? (a[i - 1].d + a[i].d) / 2 : 0;
  },
  dangerLine: api => (api.phase === 'race' && !S.final ? S.lineD : 0),
  results: api => ({ podium: api.ranked.slice(0, 3), title: t('modes').elimination + ' • ' + t('winners'), big: true }),
  lobbyMsg(api) { const P = plan(api); return t('lobbyElim', { every: G().EVERY }) + (api.players.size >= 2 ? `<br><small>${t('elimPlan', { cuts: P.cuts, f: P.finalists })}</small>` : ''); },
  chip(api) {
    if (api.phase !== 'race' || !S.plan) return { text: '💀 ' + t('modes').elimination };
    const n = api.unfinished.length;
    if (S.final) return { text: t('finalChip', { n }), danger: true };
    return { text: t('elimNext', { n: cutSize(api), s: Math.ceil(secondsToCut(api)) }) + ' • ' + t('alive', { n: api.short(n) }), danger: secondsToCut(api) <= 5 };
  },
  focusLines(api, p) {
    if (p.out) return t('outRevive', { c: G().REVIVE_COINS });
    if (S.final || !S.lineD) return t('alive', { n: api.unfinished.length });
    const gap = p.d - S.lineD;
    if (gap >= 0) return t('safe', { m: Math.max(1, Math.round(gap)) });
    const mult = api.sprintOn() ? RULES.FINAL_SPRINT_MULT : 1;
    return t('redZone', { m: Math.ceil(-gap), taps: Math.ceil(M.tapsForMeters(RULES, Math.ceil(-gap), p.dashes, p.tapAcc) / mult) });
  },
  tips: () => [...t('tips_elimination'), t('tips')[1], t('tips')[3], t('tips')[4]],
  nameTag: () => '',
  fill: s => s.replace('{every}', G().EVERY).replace('{revive}', G().REVIVE_COINS),
};
