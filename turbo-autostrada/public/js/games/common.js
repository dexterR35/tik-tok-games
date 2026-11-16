// bucati folosite de mai multe jocuri
import { RULES } from '../rules.js';
import { t } from '../i18n.js';
import * as M from '../math.js';

export const TEAM_COLORS = [0xff3047, 0x2e7bff, 0x22c55e, 0xffc800], TEAM_CSS = ['#ff3047', '#2e7bff', '#22c55e', '#ffc800'], TEAM_EMOJI = ['🔴', '🔵', '🟢', '🟡'];

// linia "ajunge la timp?" pentru jocurile cu sosire: calculeaza cat ii lipseste daca NU mai da tap de acum incolo
export function paceLine(api, p) {
  const short = api.metersShort(p);
  if (short <= 0) return t('onPace');
  const mult = api.sprintOn() ? RULES.FINAL_SPRINT_MULT : 1;
  const taps = Math.ceil(M.tapsForMeters(RULES, short, p.dashes, p.tapAcc) / mult);
  // monedele: cate trebuie cu tot cu energia plina pe care o da gift-ul (nu doar rachetele)
  const coins = M.coinsToCover(RULES, short, p.coinsRound, Math.max(0, api.phaseT), p.focus, api.obstPerM, api.coinsPerM, p.focusLock || 0, 5000);
  return coins > 3000 ? t('tooFar') : t('needMore', { m: Math.ceil(short), taps: taps > 9999 ? '—' : taps, coins });
}
export const toFinishLine = (api, p) => t('toFinish', { m: Math.max(0, Math.round(api.FINISH - p.d)) });

// regula comuna de final pentru jocurile cu sosire: cand au ajuns WINNERS (sau toti), cursa se incheie
export function endWhenWinners(api, G) { if (api.finishCount >= Math.min(G.WINNERS, api.racers()) ) api.endIn(G.END_AFTER_WINNERS); }
