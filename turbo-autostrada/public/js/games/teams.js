// 🔴🔵 JOCUL 3 – ECHIPE: fara linie de sosire. Castiga echipa cu cei mai multi metri castigati (tap-uri + gift-uri).
import { RULES } from '../rules.js';
import { t, TEAM_KEYS, norm } from '../i18n.js';
import * as M from '../math.js';
import { TEAM_COLORS, TEAM_CSS, TEAM_EMOJI } from './common.js';

const G = () => RULES.TEAMS;
const NT = () => Math.max(2, Math.min(4, G().COUNT));
const S = { score: [0, 0, 0, 0], count: [0, 0, 0, 0], topN: 0, win: -1, joinQueue: [], lists: [[], [], [], []] };
const teamWords = () => t('teamWords').slice(0, NT()).join(' / ');

function parseTeam(text) {
  const toks = norm(text || '').split(/[^\p{L}\p{N}\u{1F534}\u{1F535}\u{1F7E2}\u{1F7E1}]+/u).filter(Boolean);
  for (const tok of toks) for (let i = 0; i < NT(); i++) if (TEAM_KEYS[i].has(tok)) return i;
  for (let i = 0; i < NT(); i++) if ((text || '').includes(TEAM_EMOJI[i])) return i;
  return null;
}
const counts = () => S.count.slice(0, NT());
const smallest = () => { const c = counts(); let b = 0; for (let i = 1; i < c.length; i++) if (c[i] < c[b]) b = i; return b; };
function setTeam(api, p, team) {
  if (p.team != null) S.count[p.team]--;
  p.team = team; S.count[team]++;
  api.setLook(p, TEAM_COLORS[team], 0xf2f2f2);
}

export default {
  id: 'teams', key: 'TEAMS', hasFinish: false, skin: 'gold',
  state: S, parseTeam,
  enter(api) {
    S.count = [0, 0, 0, 0]; S.score = [0, 0, 0, 0]; S.win = -1;
    api.$('#teamsBar').innerHTML = [...Array(NT()).keys()].map(i => `<div class="tseg" style="--c:${TEAM_CSS[i]}"><span class="te">${TEAM_EMOJI[i]}</span><span class="tn"></span><span class="ts"></span></div>`).join('');
    for (const p of api.players.values()) { p.team = undefined; const vw = api.viewers.get(p.id); const want = vw && vw.team != null && vw.team < NT() ? vw.team : null; setTeam(api, p, want != null && M.teamAllows(counts(), want, G().BALANCE) ? want : smallest()); }
  },
  leave(api) { api.$('#teamsBar').innerHTML = ''; for (const p of api.players.values()) { p.team = undefined; api.restoreLook(p); } S.count = [0, 0, 0, 0]; },
  // cursa porneste cand fiecare echipa are oameni
  need() { let n = 0; for (const c of counts()) n += Math.max(0, G().MIN_PER_TEAM - c); return n; },
  roundSeconds: () => G().ROUND_SECONDS,
  onViewerEvent(api, vw, ev) { if (ev.type === 'chat') { const pick = parseTeam(ev.text); if (pick !== null) { vw.team = pick; vw.pickedNow = true; } } return false; },
  onJoin(api, p, vw) {
    const want = vw.team != null && vw.team < NT() ? vw.team : null;
    const ok = want != null && M.teamAllows(counts(), want, G().BALANCE);
    p.teamFull = want != null && !ok;
    setTeam(api, p, ok ? want : smallest());
    S.joinQueue.push(p);
  },
  onLeave(api, p) { if (p.team != null) { S.count[p.team]--; p.team = undefined; } },
  // in lobby poti schimba echipa (daca ramane echilibrat); in cursa nu
  onPlayerEvent(api, p, vw) {
    if (vw.pickedNow) { vw.pickedNow = false; if (api.phase === 'lobby' && vw.team !== p.team && vw.team < NT()) { S.count[p.team]--; const ok = M.teamAllows(counts(), vw.team, G().BALANCE); S.count[p.team]++; if (ok) setTeam(api, p, vw.team); } }
    return false;
  },
  joinToasts(api) {
    const q = S.joinQueue; if (!q.length) return;
    const byT = [0, 0, 0, 0]; for (const p of q) if (p.team != null) byT[p.team]++;
    const last = q[q.length - 1];
    if (last.team != null) {
      if (q.length === 1) api.toast(last, `<b>${api.esc(last.name)}</b><small>${TEAM_EMOJI[last.team]} ${last.teamFull ? t('teamFull', { team: t('teamNames')[last.team] }) : t('joinTeam', { team: t('teamNames')[last.team] })}</small>`);
      else api.toast(last, `<b>${byT.slice(0, NT()).map((n, i) => n ? TEAM_EMOJI[i] + ' +' + n : '').filter(Boolean).join('  ')}</b><small>${api.esc(last.name)}…</small>`);
    }
    q.length = 0;
  },
  // scorul: metrii CASTIGATI de cei mai buni N din fiecare echipa (N = cea mai mica echipa) – corect si cand echipele nu sunt egale
  onRank(api) {
    const L = S.lists; for (const l of L) l.length = 0;
    for (const p of api.ranked) if (p.team != null) L[p.team].push(p.earned);
    for (let i = 0; i < NT(); i++) L[i].sort((a, b) => b - a);
    const r = M.teamScores(L.slice(0, NT()), G().SCORE);
    S.topN = r.n; for (let i = 0; i < 4; i++) S.score[i] = r.scores[i] || 0;
  },
  results(api) {
    // la egalitate nu castiga automat prima echipa (Rosii): decid toti metrii echipei, apoi cel mai bun jucator, apoi tragere la sorti
    const sc = S.score.slice(0, NT()), top = Math.max(...sc);
    let tied = [...sc.keys()].filter(i => sc[i] === top);
    const sumOf = i => S.lists[i].reduce((a, b) => a + b, 0), bestOf = i => S.lists[i][0] || 0;
    for (const f of [sumOf, bestOf]) if (tied.length > 1) { const m = Math.max(...tied.map(f)); tied = tied.filter(i => f(i) === m); }
    S.win = tied[(Math.random() * tied.length) | 0];
    const podium = api.ranked.filter(p => p.team === S.win).sort((a, b) => b.earned - a.earned).slice(0, 3);
    return { podium, title: TEAM_EMOJI[S.win] + ' ' + t('teamWins', { team: t('teamNames')[S.win] }), big: true, sub: sc.map((v, i) => TEAM_EMOJI[i] + ' ' + Math.round(v) + ' m').join('  ') };
  },
  lobbyMsg: () => t('lobbyTeams', { teams: teamWords() }),
  chip: () => ({ text: '🔴🔵 ' + (G().SCORE === 'topN' && S.topN > 0 && Math.max(...counts()) > S.topN ? t('teamTop', { n: S.topN }) : t('modes').teams) }),
  hud(api) {
    const tot = S.score.slice(0, NT()).reduce((a, b) => a + b, 0) || 1;
    [...api.$('#teamsBar').children].forEach((el, i) => {
      el.style.flexGrow = Math.max(0.12, S.score[i] / tot);
      el.querySelector('.tn').textContent = t('teamNames')[i] + ` (${api.short(S.count[i])})`;
      el.querySelector('.ts').textContent = api.fmtM(S.score[i]);
    });
  },
  focusLines: (api, p) => p.team == null ? '' : `${TEAM_EMOJI[p.team]} ${t('teamContrib', { team: t('teamNames')[p.team], m: Math.round(p.earned) })}`,
  tips: () => [...t('tips_teams'), t('tips')[1], t('tips')[3], t('tips')[4]],
  nameTag: p => (p.team != null ? TEAM_EMOJI[p.team] + ' ' : ''),
  fill: s => s.replace('{teams}', teamWords()),
  simText: () => t('teamWords')[(Math.random() * NT()) | 0],
};
