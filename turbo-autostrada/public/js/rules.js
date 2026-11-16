// ⚙️ REGULILE JOCULUI – modifica aici cum vrei
// Sunt 4 JOCURI (classic / challenge / teams / elimination). Fiecare are blocul lui de setari mai jos
// (durata, lobby, numar minim / maxim de alergatori, reguli proprii) si poate suprascrie orice regula
// comuna in "RULES: { ... }" (ex: RULES: { TAP_COST_START: 2 } doar pentru acel joc).
// Verifica cifrele fara sa pornesti jocul:  node tools/balanta.mjs
export const RULES = {
  LANGUAGE: 'ro',          // ro, en, es, de, fr, it, pt, tr (se poate schimba si din config.json sau cu ?lang=en)
  // JOCUL: 'classic' | 'challenge' | 'teams' | 'elimination'  (sau in link: ?mode=challenge)
  MODE: 'classic',

  // =====================================================================================
  // 🏁 JOCUL 1 – CLASIC: toti alearga spre SOSIRE. Castiga primii 3 la sosire (sau cei mai departe cand expira timpul).
  CLASSIC: {
    ROUND_SECONDS: 150,     // timp maxim de cursa (2,5 minute: pe TikTok lumea intra si iese repede)
    LOBBY_SECONDS: 15,      // numaratoarea de la start
    PODIUM_SECONDS: 15,     // cat sta podiumul pe ecran
    MIN_RACERS: 1,          // merge si cu 1-2 oameni
    MAX_RACERS: 10000,      // cati alergatori exista in joc; peste limita, cei noi iau locul celor inactivi (vezi "MULTIME")
    WINNERS: 3,             // cursa se incheie cand au ajuns atatia la sosire
    END_AFTER_WINNERS: 3.5, // secunde de la ultimul castigator pana la podium
    // SOSIREA e pusa exact acolo unde ajunge, in ultima secunda, cineva care da GOAL_TAPS_PER_SEC tap-uri pe secunda
    // toata cursa (cu energia plina). Cu mai multi jucatori tinta creste: +GOAL_TAPS_PER_10X la fiecare x10 jucatori.
    // => fara tap / gift NIMENI nu ajunge; cine da mai mult decat tinta (sau trimite gift-uri) ajunge inainte de final.
    GOAL_TAPS_PER_SEC: 3.5,
    GOAL_TAPS_PER_10X: 1,
    RULES: {},
  },

  // =====================================================================================
  // 🎟️ JOCUL 2 – CHALLENGE: intra in cursa doar cine trimite gift-uri de cel putin TICKET_COINS monede (cumulat).
  // Ceilalti sunt fani: scriu #numarul unui concurent si tap-urile lor il ajuta.
  CHALLENGE: {
    ROUND_SECONDS: 150,     // 2,5 minute
    LOBBY_SECONDS: 20,      // lobby mai lung: lumea are timp sa cumpere bilet
    PODIUM_SECONDS: 15,
    MIN_RACERS: 2,          // cursa porneste cand sunt minim atatia concurenti
    MAX_RACERS: 60,
    WINNERS: 3,
    END_AFTER_WINNERS: 3.5,
    GOAL_TAPS_PER_SEC: 4.5, // tinta e mai sus: concurentii sunt ajutati de fani
    GOAL_TAPS_PER_10X: 1,
    TICKET_COINS: 5,        // ex: 5 trandafiri. Ce depaseste biletul NU se pierde: devine racheta.
    TICKET_EVERY_ROUND: true, // biletul e valabil o singura runda
    LATE_ENTRY_SECONDS: 60, // bilet cumparat in primele 60 s de cursa = intra acum; mai tarziu (sau cand e plin) = loc rezervat in runda urmatoare
    SUPPORT_FACTOR: 0.5,    // tap-urile fanilor fara bilet merg (la jumatate) la concurentul ales cu #numar
    DEFAULT_SUPPORT: 'last',// fan care nu a ales pe nimeni: 'last' = il ajuta pe ultimul, 'none' = tap-urile nu se numara
    DUEL_SECONDS: 30,       // in ultimele 30 s camera alterneaza intre primii 2 (head-to-head)
    RULES: {},
  },

  // =====================================================================================
  // 🔴🔵 JOCUL 3 – ECHIPE: fiecare alege echipa scriind culoarea. NU exista linie de sosire: cursa tine tot timpul,
  // castiga echipa cu cei mai multi metri CASTIGATI (tap-uri + gift-uri).
  TEAMS: {
    ROUND_SECONDS: 150,     // 2,5 minute
    LOBBY_SECONDS: 20,      // timp sa aleaga echipa
    PODIUM_SECONDS: 15,
    COUNT: 2,               // 2, 3 sau 4 echipe
    MIN_PER_TEAM: 1,        // cursa porneste cand fiecare echipa are macar atatia oameni (merge si 1 la 1)
    MAX_RACERS: 10000,
    BALANCE: 0.25,          // o echipa nu poate fi cu peste 25% mai mare decat cea mai mica (alegerea e redirectionata)
    // SCOR CORECT cand echipele nu sunt egale: se aduna doar cei mai buni N din fiecare echipa,
    // unde N = marimea celei mai mici echipe. Asa nu castiga echipa doar pentru ca are mai multi oameni.
    SCORE: 'topN',          // 'topN' (corect) sau 'sum' (toti metrii, ca inainte)
    RULES: {},
  },

  // =====================================================================================
  // 💀 JOCUL 4 – ELIMINARE: NU exista linie de sosire. La fiecare taiere ultimii sunt scosi, pana raman finalistii.
  // Durata se calculeaza singura din numarul de jucatori:
  //   taieri = cate trebuie ca fiecare sa scoata ~MIN_CUT_SHARE (maxim MAX_CUTS si maxim jucatori - finalisti);  durata = FIRST_AT + (taieri - 1) x EVERY + FINAL_SECONDS
  //   la fiecare taiere pleaca n x (1 - (finalisti / n)^(1 / taieri ramase))  => dupa ultima raman exact finalistii
  // Exemple: 2 jucatori = 1 taiere (duel), 4 = 2 taieri, 10 = 5 taieri, 10.000 = 8 taieri (~64% la fiecare).
  ELIMINATION: {
    LOBBY_SECONDS: 20,
    PODIUM_SECONDS: 15,
    MIN_RACERS: 2,          // merge de la 2 jucatori
    MAX_RACERS: 10000,
    FIRST_AT: 30,           // prima taiere dupa 30 s
    EVERY: 18,              // apoi la fiecare 18 s  (maxim: 30 + 7 x 18 + 30 = 186 s, ~3 minute; 10 jucatori = 132 s)
    MAX_CUTS: 8,
    MIN_CUT_SHARE: 0.25,    // fiecare taiere scoate cam minim 25% din cei ramasi => putine taieri mici (10 jucatori: 5 taieri, nu 7)
    FINALISTS: 3,           // cati raman in finala (cu putini jucatori: 2 la 4-5 jucatori, 1 la 2-3)
    FINAL_SECONDS: 30,      // finala: ultimii ramasi alearga inca 30 s; castiga cel mai din fata
    REVIVE_COINS: 10,       // eliminat? gift de 10+ monede = revii in cursa (monedele conteaza si ca racheta). Nu merge in finala.
    RULES: {},
  },

  // =====================================================================================
  // REGULI COMUNE (toate jocurile). Un joc le poate suprascrie in blocul lui, la "RULES: { }".

  // ---- VITEZA: toti alearga la fel. Doar tap-urile si gift-urile dau metri in plus.
  BASE_SPEED: 8,           // m/s, aceeasi pentru toti (cu energia plina)
  STUMBLE_SECONDS: 1.1,    // cat tine o impiedicare
  STUMBLE_SPEED: 2.5,      // viteza cat timp e impiedicat
  // cine intra in timpul cursei: 'idle' = pe "linia celor care nu fac nimic" (acolo unde ar fi fost daca intra la start si nu dadea tap)
  //                              'start' = de la START (foarte in spate) | 'pack' = in coada plutonului
  LATE_JOIN: 'idle',

  // ---- TAP-uri: +1 metru la fiecare N tap-uri ale aceluiasi om. N creste (tot mai greu).
  // N = TAP_COST_START + (metri deja castigati din tap-uri / TAP_COST_GROW_EVERY)
  TAP_COST_START: 3,
  TAP_COST_GROW_EVERY: 25,
  TAP_METERS: 1,
  MAX_TAPS_PER_EVENT: 50,   // protectie: un singur eveniment de like nu poate aduce mai mult
  FINAL_SPRINT_SECONDS: 30, // in ultimele 30 s tap-urile valoreaza dublu (la fel pentru toti)
  FINAL_SPRINT_MULT: 2,

  // ---- GIFT-uri: RACHETE. Fiecare racheta noua cere mai multe monede (cumulat pe runda):
  // 1, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610 ...
  // racheta de nivel L = ROCKET_METERS_BASE x ROCKET_GROWTH^(L-1) metri (4, 5, 6, 8, 10, 12 ...)
  // pragurile cresc mai repede decat rachetele => fiecare moneda valoreaza tot mai putin (cursa ramane reala)
  // exemple: 1 moneda = 6 m | 10 = 35 m | 100 = 156 m | 500 = 327 m | 1000 = 523 m | 5000 = 1043 m
  // Gift trimis pe podium (intre runde) NU se pierde: se aplica in runda urmatoare.
  ROCKET_THRESHOLDS: [1, 3, 5],   // primele praguri; urmatoarele = suma ultimelor doua
  ROCKET_METERS_BASE: 4,   // calibrat pentru runde de 2,5 min (la 5 min era 6): acelasi echilibru gift / tap, vezi tools/balanta.mjs
  ROCKET_GROWTH: 1.25,
  ROCKET_SPEED: 40,        // cat de repede zboara racheta (m/s in plus)
  TAP_BURST_SPEED: 5,      // cat de repede se consuma metrii din tap-uri (m/s in plus)

  SHIELD_MIN_COINS: 10,    // gift de 10+ monede = scut
  SHIELD_SECONDS: 8,
  SURPRISE_MIN_COINS: 500, // gift de 500+ monede = surpriza pentru toti
  FOLLOW_METERS: 3,        // o singura data pe live pentru fiecare om
  SHARE_METERS: 2,
  SHARE_MAX_PER_ROUND: 2,  // share-urile se numara de maxim atatea ori pe runda (altfel se poate face spam)
  COIN_METERS: 0.5,        // monedele de pe pista (in medie la fel pentru toti, desenati sau nu)

  // ⚡ ENERGIE: trebuie tap-uri continue. Fara tap-uri energia scade la jumatate la fiecare HALF_LIFE secunde.
  // Energie 1 = evita obstacolele in 95% din cazuri si alearga cu viteza intreaga; energie 0 = evita 70% si alearga cu 85%.
  FOCUS: {
    START: 0.6,       // energia la start
    HALF_LIFE: 8,     // secunde pana scade la jumatate (fara tap-uri)
    PER_TAP: 0.06,    // cat creste la un tap (~8 tap-uri de la 0.5 la 1)
    GIFT_REFILL: 1,   // un gift umple energia
    // ...si o tine PLINA inca atatea secunde pentru fiecare moneda (se aduna; ex. trandafir = 1 s, 30 monede = 30 s, 150 = toata cursa de 2,5 min).
    // Fara asta, cine trimite gift-uri dar nu da tap pierdea ~380 m doar din energie si ajungea in spatele celor care dau tap gratis.
    // Calibrat cu  node tools/balanta.mjs  (sectiunea "CORECTITUDINE"): 500 monede fara tap >= tap 6/s gratis, dar tap 10/s > 30 monede.
    GIFT_SECONDS_PER_COIN: 1,
    DODGE_MIN: 0.7,   // sansa de a evita un obstacol la energie 0 (sare / se apleaca / schimba banda)
    DODGE_MAX: 0.97,  // ... la energie 1
    SPEED_MIN: 0.85,  // viteza la energie 0 (fractiune din viteza de baza)
    TIRED_BELOW: 0.3, // sub acest prag robotul merge pe jos (obosit)
  },

  // ---- MULTIME (2 oameni sau 10.000+): in joc exista doar oamenii ACTIVI.
  // Cand pista e plina (MAX_RACERS al jocului), un om nou ia locul unuia care nu a facut nimic runda asta
  // (acela oricum ar fi fost pe "linia celor care nu fac nimic", deci daca revine intra exact acolo).
  // Daca toti sunt activi, cei noi asteapta in tribuna si intra runda urmatoare. Nimic nu se strica la 40.000 de spectatori.
  VIEWER_MEMORY: 60000,    // cati spectatori tine minte jocul (echipa aleasa, bilet, follow)
  IDLE_KICK_MINUTES: 10,   // cine nu a mai facut nimic de atatea minute iese la runda urmatoare
  // PERSONAJE: 'robot' = toti sunt roboti (cei din cadru animati, cu poza + nume; plutonul = acelasi robot, mai simplu de desenat)
  //            'simple' = toti sunt figurine simple
  CHARACTER: 'robot',
  MAX_VISIBLE: 24,         // cati jucatori cu poza + nume se deseneaza deodata (restul plutonului = aceeasi figurina, fara poza)
  PACK_VISIBLE: 220,       // cate siluete simple se deseneaza pentru restul plutonului (ca sa se vada ca sunt multi)
  LANES: 4,

  // ---- SUNET (sintetizat in joc, fara fisiere). Tasta M = mute. ?sound=0 il opreste.
  SOUND: { ENABLED: true, VOLUME: 0.5 },
  // ---- SERII de tap-uri (fara pauza mai mare de STREAK_GAP secunde)
  STREAK: { GAP: 1.5, FIRE_AT: 10, BOOST_AT: 30, BOOST_METERS: 3 },
  // ---- EVENIMENTE DE TRASEU: la fiecare runda se alege unul (sau 'none'); 'rain' = ploaie, 'tunnel' = tuneluri, 'roadworks' = santier cu bariere pe toata latimea
  ROUTE_EVENTS: ['none', 'rain', 'tunnel', 'roadworks'],
  ROADWORKS_EVERY: 8,      // o bariera pe toata latimea la fiecare N segmente
  // ---- SKIN-uri pentru castigatori (pana la finalul live-ului): 'gold' = Clasic / Echipe, 'flame' = Eliminare, 'crown' = Challenge
  SKINS: true,
  // ---- COMENZI din chat pentru tine si moderatori (config.json "moderators"): !mode classic|challenge|teams|elimination, !end, !pause, !resume, !lang en, !round 180, !next
  COMMANDS: true,
  // ---- TIKTOK: HUD-ul e asezat intre butoanele TikTok (sus = gazda / spectatori, jos-stanga = comentarii).
  // Imaginea 3D se muta cu TIKTOK_SAFE_SHIFT (fractiune din inaltime; + = in sus), ca personajele sa nu fie sub comentarii.
  // Verifica asezarea: http://localhost:3000/preview.html (sau butonul din panou)
  TIKTOK_SAFE: true,
  TIKTOK_SAFE_SHIFT: { lobby: 0.2, race: 0.14, podium: -0.14 },
  // ---- CAMERA "regizor": se plimba intre pluton, cate un jucator si lider
  CAMERA_PACK_SECONDS: 7,
  CAMERA_FOCUS_SECONDS: 5,
  CAMERA_LEADER_SECONDS: 5,
  CAMERA_GIFT: true,          // racheta (gift) = prim-plan centrat pe cine zboara; mai multi deodata = pe rand, rachetele mari primele
  CAMERA_RANDOM_CHANCE: 0.35, // dupa cadrul cu liderul: sansa de prim-plan pe un jucator la intamplare
  CAMERA_CROWD_SECONDS: 4,  // cu multi jucatori: cadru larg cu multimea din mijlocul plutonului (0 = oprit)
  CAMERA_CROWD_MIN: 40,     // de la cati alergatori apare cadrul cu multimea
};

// ---- un joc isi poate suprascrie regulile comune: activateGame('teams') aplica RULES.TEAMS.RULES peste cele comune
export const GAME_KEYS = { classic: 'CLASSIC', challenge: 'CHALLENGE', teams: 'TEAMS', elimination: 'ELIMINATION' };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function deepAssign(dst, src) { for (const k in src) { if (isObj(src[k]) && isObj(dst[k])) deepAssign(dst[k], src[k]); else dst[k] = isObj(src[k]) ? deepAssign({}, src[k]) : Array.isArray(src[k]) ? [...src[k]] : src[k]; } return dst; }
const GAME_BLOCKS = new Set(Object.values(GAME_KEYS));
let common = null; // copia regulilor comune, ca sa putem reveni cand se schimba jocul
function snapshotCommon() { const c = {}; for (const k in RULES) if (!GAME_BLOCKS.has(k)) c[k] = isObj(RULES[k]) ? deepAssign({}, RULES[k]) : Array.isArray(RULES[k]) ? [...RULES[k]] : RULES[k]; return c; }
export function activateGame(mode) {
  if (!common) common = snapshotCommon();
  deepAssign(RULES, common);
  const G = RULES[GAME_KEYS[mode] || 'CLASSIC'];
  deepAssign(RULES, G.RULES || {});
  return G;
}
// o regula comuna schimbata din panou: se tine minte ca regula comuna (si se aplica imediat)
export function setCommonRule(path, value) {
  if (!common) common = snapshotCommon();
  const keys = path.split('.');
  for (const root of [common, RULES]) { let o = root; for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]]; o[keys[keys.length - 1]] = value; }
}
