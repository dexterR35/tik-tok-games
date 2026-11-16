// cele 4 jocuri. Fiecare fisier are regulile si pasii lui (intrare, cursa, final, podium); motorul 3D e comun (game.js).
import classic from './classic.js';
import challenge from './challenge.js';
import teams from './teams.js';
import elimination from './elimination.js';
export const GAMES = { classic, challenge, teams, elimination };
export const MODES = Object.keys(GAMES);
