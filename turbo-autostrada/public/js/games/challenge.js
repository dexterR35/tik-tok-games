// 🎟️ JOCUL 2 – CHALLENGE: intra in cursa doar cine are bilet (gift-uri). Ceilalti sunt fani si isi ajuta concurentul cu tap-uri.
import { RULES } from '../rules.js';
import { t } from '../i18n.js';
import * as M from '../math.js';
import { paceLine, toFinishLine, endWhenWinners } from './common.js';

const G = () => RULES.CHALLENGE;
const S = { bibSeq: 0, pot: 0, hintAt: 0, duelOn: false, reserve: [], bibs: new Map() };
const byBib = n => S.bibs.get(n) || null;
// alegerea fanului (#numar) e valabila doar in runda in care a fost facuta
const supportOf = (api, vw) => (vw.supRound === api.round && vw.supportId && api.players.get(vw.supportId)) || null;

function enterRacer(api, vw, extra, ev) {
  const p = api.enter(vw, { silent: true, keepCarry: true });
  if (!p) return null;
  p.bib = ++S.bibSeq; S.bibs.set(p.bib, p); S.pot += G().TICKET_COINS;
  vw.reserved = false; vw.carry = 0;
  api.toast(p, `<b>#${p.bib} ${api.esc(p.name)}</b><small>${t('ticketIn')}</small>`, true);
  api.banner(p, '', t('ticketBanner', { bib: p.bib }));
  // ce a platit peste pretul biletului nu se pierde: devine racheta
  if (extra > 0) api.applyGift(p, { type: 'gift', user: ev?.user, giftName: ev?.giftName || 'Gift', coins: extra, total: extra, repeat: 1, final: ev ? ev.final !== false : true });
  return p;
}
function reserve(api, vw, extra) {
  vw.reserved = true; vw.carry = (vw.carry || 0) + extra;
  if (!S.reserve.includes(vw)) S.reserve.push(vw);
  api.toast(vw, `<b>${api.esc(vw.name)}</b><small>${t('ticketReserved')}</small>`, true);
}

export default {
  id: 'challenge', key: 'CHALLENGE', hasFinish: true, skin: 'crown',
  state: S,
  // la intrarea in joc pista se goleste: in Challenge alearga doar cei cu bilet
  enter(api) { for (const p of [...api.players.values()]) api.removePlayer(p); S.bibSeq = 0; S.pot = 0; S.duelOn = false; S.bibs.clear(); },
  leave(api) { for (const p of api.players.values()) p.bib = undefined; S.bibs.clear(); },
  need: api => Math.max(0, G().MIN_RACERS - api.players.size),
  roundSeconds: () => G().ROUND_SECONDS,
  finishLength: (api, T, n) => M.finishLength(RULES, G(), T, n, api.obstPerM, api.coinsPerM),
  canJoin: () => false, // nu se intra din chat, doar cu bilet

  // tot ce face un spectator FARA bilet
  onViewerEvent(api, vw, ev) {
    if (api.players.has(vw.id)) return false;
    const C = G();
    if (ev.type === 'gift') {
      const c = Math.max(0, ev.coins || 0);
      if (!c) return true;
      if (vw.reserved) { vw.carry = (vw.carry || 0) + c; api.toast(vw, `<b>${api.esc(vw.name)}</b><small>${t('giftNext')}</small>`, true); return true; }
      vw.ticket = (vw.ticket || 0) + c;
      if (vw.ticket < C.TICKET_COINS) { api.toast(vw, `<b>${api.esc(vw.name)}</b><small>${t('ticketProgress', { n: vw.ticket, t: C.TICKET_COINS })}</small>`, true); return true; }
      const extra = vw.ticket - C.TICKET_COINS; vw.ticket = 0;
      const open = api.phase === 'lobby' || (api.phase === 'race' && api.elapsed <= C.LATE_ENTRY_SECONDS);
      if (!(open && api.players.size < C.MAX_RACERS && enterRacer(api, vw, extra, ev))) reserve(api, vw, extra);
      return true;
    }
    if (ev.type === 'chat') {
      // doar "#3" (oriunde in mesaj) sau un mesaj care e DOAR numarul ("3"); "e 3 dimineata" nu mai schimba concurentul
      const txt = ev.text || '', m = /#\s*(\d{1,3})(?!\d)/.exec(txt) || /^\s*(\d{1,3})\s*[!.]*\s*$/.exec(txt);
      const tgt = m && byBib(+m[1]);
      if (tgt) { if (supportOf(api, vw) !== tgt) { if (vw.supRound !== api.round) vw.fanTaps = 0; vw.supportId = tgt.id; vw.supRound = api.round; api.fansOf(tgt).add(vw.id); api.floatText(tgt, `📣 ${tgt.fans.size} ${t('fans')}`, '#7cff6b'); } }
      else if (api.now() - S.hintAt > 8000) { S.hintAt = api.now(); api.ticker(`${api.esc(vw.name)}: ${api.fillTip(t('tips_challenge')[0])}`); }
      return true;
    }
    if (ev.type === 'like' && api.phase === 'race') {
      let tgt = supportOf(api, vw);
      if ((!tgt || tgt.finished) && C.DEFAULT_SUPPORT === 'last') tgt = api.unfinished[api.unfinished.length - 1]; // implicit: il ajuta pe ultimul
      if (!tgt || tgt.finished) return true;
      const n = Math.min(Math.max(ev.count || 1, 1), RULES.MAX_TAPS_PER_EVENT);
      if (vw.supRound !== api.round) { vw.supRound = api.round; vw.fanTaps = 0; vw.supportId = null; }
      api.fansOf(tgt).add(vw.id); vw.fanTaps = (vw.fanTaps || 0) + n; tgt.fanTaps += n;
      if (!tgt.topFan || tgt.topFan === vw || vw.fanTaps > (tgt.topFan.fanTaps || 0)) tgt.topFan = vw;
      const g = api.addTaps(tgt, n * C.SUPPORT_FACTOR, true);
      if (g) api.floatText(tgt, `📣 +${g} m`, '#7cff6b', g * 3);
      api.markActive(tgt);
    }
    return true;
  },
  onRaceStart() { S.duelOn = false; },
  onFinish(api) { endWhenWinners(api, G()); },
  onLeave(api, p) { if (p.bib) S.bibs.delete(p.bib); },
  // dupa podium: biletele expira, cei cu loc rezervat intra primii
  onNewRound(api) {
    if (G().TICKET_EVERY_ROUND) { for (const p of [...api.players.values()]) api.removePlayer(p); S.bibSeq = 0; S.bibs.clear(); }
    S.pot = 0; S.duelOn = false;
    const q = S.reserve; S.reserve = [];
    for (const vw of q) { if (api.players.size < G().MAX_RACERS && !api.players.has(vw.id)) { if (!enterRacer(api, vw, vw.carry || 0, null)) S.reserve.push(vw); } else if (!api.players.has(vw.id)) S.reserve.push(vw); }
  },
  // DUEL: in ultimele secunde camera alterneaza intre primii 2
  camera(api) {
    const f = api.unfinished;
    if (api.phase !== 'race' || api.phaseT > G().DUEL_SECONDS || f.length < 2) return null;
    if (!S.duelOn) { S.duelOn = true; api.banner(f[0], `vs ${api.esc(f[1].name)}`, t('duel')); api.snd.sprint(); }
    return Math.floor(api.time / 3) % 2 ? f[1] : f[0];
  },
  results: api => ({ podium: api.ranked.slice(0, 3), title: t('modes').challenge + ' • ' + t('winners'), big: true }),
  lobbyMsg: () => t('lobbyChallenge', { t: G().TICKET_COINS }),
  chip: () => ({ text: (S.pot ? `🏆 ${t('pot')}: ${S.pot * 10} ${t('glory')}` : `🎟️ ${G().TICKET_COINS} 🪙`) + (S.reserve.length ? ` • ⏭ ${S.reserve.length}` : '') }),
  focusLines: (api, p) => `${toFinishLine(api, p)} • ${paceLine(api, p)}`,
  extraLines: (api, p) => `<br>📣 ${p.fans ? p.fans.size : 0} ${t('fans')}` + (p.topFan ? ` • ${t('topFan')}: <b>${api.esc(p.topFan.name)}</b>` : ''),
  tips: () => [...t('tips_challenge'), ...t('tips').slice(1, 4)],
  nameTag: p => (p.bib ? '#' + p.bib + ' ' : ''),
  simJoin(api, user) { const C = G().TICKET_COINS; return { type: 'gift', user, giftName: 'Rose', coins: C, total: C, repeat: C, final: true }; },
};
