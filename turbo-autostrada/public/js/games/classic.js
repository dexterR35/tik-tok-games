// 🏁 JOCUL 1 – CLASIC: toti alearga spre SOSIRE. Primii 3 la sosire castiga; daca expira timpul, cei mai departe.
import { RULES } from '../rules.js';
import { t } from '../i18n.js';
import * as M from '../math.js';
import { paceLine, toFinishLine, endWhenWinners } from './common.js';

const G = () => RULES.CLASSIC;
export default {
  id: 'classic', key: 'CLASSIC', hasFinish: true, skin: 'gold',
  enter() {}, leave() {},
  need: api => Math.max(0, G().MIN_RACERS - api.players.size),
  roundSeconds: () => G().ROUND_SECONDS,
  finishLength: (api, T, n) => M.finishLength(RULES, G(), T, n, api.obstPerM, api.coinsPerM),
  onFinish(api) { endWhenWinners(api, G()); },
  results: api => ({ podium: api.ranked.slice(0, 3), title: t('winners'), big: false }),
  lobbyMsg: () => t('writeAnything'),
  lobbyCount: (api, s) => t('startIn', { s }),
  chip: () => null,
  focusLines: (api, p) => `${toFinishLine(api, p)} • ${paceLine(api, p)}`,
  tips: () => t('tips'),
  nameTag: () => '',
};
