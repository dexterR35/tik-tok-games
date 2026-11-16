// TURBOSTRADA / HIGHWAY TURBO – server local
// Conecteaza jocul la TikTok LIVE si trimite evenimentele (chat, tap, gift, follow, share) catre joc.
import express from 'express';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = path.join(__dirname, 'config.json');
const baseCfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
// 4 LIVE-uri, 4 jocuri: `node server.js lives/clasic.json` porneste un joc separat (cont TikTok, port, joc, clasamente proprii).
// Setarile din fisierul live-ului le suprascriu pe cele din config.json. Fara fisier = un singur joc, ca inainte.
const liveArg = (process.argv[2] || '').endsWith('.json') ? process.argv[2] : '';
const liveCfg = liveArg ? JSON.parse(fs.readFileSync(path.resolve(__dirname, liveArg), 'utf8')) : {};
const cfg = { ...baseCfg, ...liveCfg, signApiKey: liveCfg.signApiKey || baseCfg.signApiKey || '' };
const LIVE_NAME = liveArg ? path.basename(liveArg, '.json') : ''; // ex: 'clasic'
const PORT = Number(process.env.PORT || cfg.port || 3000);
const USERNAME = ((liveArg ? process.argv[3] : process.argv[2]) || cfg.tiktokUsername || '').replace(/^@/, '').trim();
const ADMINS = new Set([USERNAME, ...(cfg.moderators || [])].map(u => String(u).replace(/^@/, '').trim().toLowerCase()).filter(Boolean));
const isAdmin = u => ADMINS.has(String(u.uniqueId || '').toLowerCase());

// --- loguri: fiecare eveniment intr-un fisier pe zi (pentru calibrare dupa live)
const logDir = path.join(__dirname, 'logs', LIVE_NAME); fs.mkdirSync(logDir, { recursive: true }); // fiecare live are logurile lui
let logStream = null, logDay = '';
function logEvent(obj) {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== logDay) { logDay = day; if (logStream) logStream.end(); logStream = fs.createWriteStream(path.join(logDir, `events-${day}.jsonl`), { flags: 'a' }); logStream.on('error', e => console.log('[log]', e.message)); }
  logStream.write(JSON.stringify({ t: Date.now(), ...obj }) + '\n');
}

// --- memorie intre live-uri: clasamente saptamanale / lunare / all-time + titluri
const dataDir = path.join(__dirname, 'data', LIVE_NAME); fs.mkdirSync(dataDir, { recursive: true }); // si clasamentele lui
const statsPath = path.join(dataDir, 'stats.json');
let stats = { players: {} };
// Clasamentele nu se pierd: se scriu intai in .tmp si abia apoi inlocuiesc fisierul (o cadere de curent nu lasa fisierul pe jumatate),
// iar varianta anterioara ramane ca .bak. Daca stats.json e totusi stricat, se ia .bak-ul, iar fisierul stricat se pastreaza alaturi.
function loadStats() {
  for (const p of [statsPath, statsPath + '.bak']) {
    if (!fs.existsSync(p)) continue;
    try { const s = JSON.parse(fs.readFileSync(p, 'utf8')); if (s && typeof s.players === 'object') { if (p !== statsPath) console.log('  ⚠ stats.json era stricat: am refacut clasamentele din stats.json.bak'); return s; } } catch {}
    try { fs.copyFileSync(p, p + '.stricat-' + Date.now()); } catch {}
  }
  return { players: {} };
}
stats = loadStats();
let saveTimer = null;
function saveStatsNow() {
  clearTimeout(saveTimer); saveTimer = null;
  try {
    fs.writeFileSync(statsPath + '.tmp', JSON.stringify(stats));
    if (fs.existsSync(statsPath)) fs.copyFileSync(statsPath, statsPath + '.bak');
    fs.renameSync(statsPath + '.tmp', statsPath);
  } catch (e) { console.log('[stats] nu am putut salva:', e.message); }
}
const saveStats = () => { if (!saveTimer) saveTimer = setTimeout(saveStatsNow, 1000); }; // mai multe runde rapide = o singura scriere
const weekKey = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7)); const w1 = new Date(x.getFullYear(), 0, 4); return x.getFullYear() + '-W' + String(1 + Math.round(((x - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7)).padStart(2, '0'); };
const monthKey = d => new Date(d).toISOString().slice(0, 7);
function applyRound(r) {
  // r = { mode, results: [{id, name, avatar, rank, meters, coins, finished}], biggestGift: {id, coins} }
  const now = Date.now(), wk = weekKey(now), mk = monthKey(now), pts = [10, 6, 4, 3, 2, 1];
  const num = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  // runda vine de la fereastra jocului: date curate, ca o eroare in joc sa nu strice clasamentele (NaN, nume uriase etc.)
  const list = (Array.isArray(r.results) ? r.results : []).slice(0, 300)
    .filter(x => x && x.id != null && String(x.id).length <= 64)
    .map(x => ({ id: String(x.id), name: String(x.name || x.id).slice(0, 24), avatar: typeof x.avatar === 'string' ? x.avatar.slice(0, 1000) : '', rank: Math.floor(num(x.rank)) || 999, meters: num(x.meters), coins: num(x.coins) }));
  if (r.biggestGift) r.biggestGift = { id: String(r.biggestGift.id || ''), coins: num(r.biggestGift.coins) };
  for (const x of list) {
    const P = stats.players[x.id] || (stats.players[x.id] = { name: x.name, avatar: '', wins: 0, podiums: 0, races: 0, meters: 0, coins: 0, best: 0, week: {}, month: {}, titles: [] });
    P.name = x.name; P.seen = now; if (x.avatar && x.avatar.startsWith('/avatar')) P.avatar = x.avatar;
    P.races++; P.meters += x.meters || 0; P.coins += x.coins || 0;
    const p = x.rank <= 6 ? pts[x.rank - 1] : 0;
    if (x.rank === 1) P.wins++; if (x.rank <= 3) P.podiums++;
    P.week[wk] = (P.week[wk] || 0) + p; P.month[mk] = (P.month[mk] || 0) + p;
    if ((x.coins || 0) > P.best) P.best = x.coins;
    if (x.rank === 1 && r.mode === 'challenge' && !P.titles.includes('challenge')) P.titles.push('challenge');
    if (P.wins >= 3 && !P.titles.includes('hat')) P.titles.push('hat');
  }
  if (r.biggestGift && r.biggestGift.coins >= 100) { const P = stats.players[r.biggestGift.id]; if (P && !P.titles.includes('whale')) P.titles.push('whale'); }
  // curatare: pastram doar ultimele 8 saptamani / 6 luni
  for (const P of Object.values(stats.players)) { for (const k of Object.keys(P.week)) if (k < weekKey(now - 56 * 864e5)) delete P.week[k]; for (const k of Object.keys(P.month)) if (k < monthKey(now - 180 * 864e5)) delete P.month[k]; }
  // fisierul nu creste la nesfarsit: peste 5000 de oameni, ies cei fara victorii / titluri / puncte, incepand cu cei vazuti cel mai demult
  const ids = Object.keys(stats.players);
  if (ids.length > 5000) {
    const weak = ids.filter(id => { const P = stats.players[id]; return !P.wins && !P.titles.length && !Object.keys(P.week).length && !Object.keys(P.month).length; }).sort((a, b) => (stats.players[a].seen || 0) - (stats.players[b].seen || 0));
    for (const id of weak.slice(0, ids.length - 5000)) delete stats.players[id];
  }
  saveStats();
}
function boards() {
  const now = Date.now(), wk = weekKey(now), mk = monthKey(now), all = Object.entries(stats.players);
  const top = (f, n = 5) => all.map(([id, P]) => ({ id, name: P.name, avatar: P.avatar, v: f(P), wins: P.wins, titles: P.titles })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, n);
  return { week: top(P => P.week[wk] || 0), month: top(P => P.month[mk] || 0), all: top(P => P.wins * 10 + P.podiums * 3), titles: Object.fromEntries(all.filter(([, P]) => P.titles.length).map(([id, P]) => [id, P.titles])) };
}

const app = express();
// linkul pentru Studio are cheia in adresa: "no-referrer" impiedica trimiterea adresei catre alte site-uri
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); next(); });
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use('/vendor/fonts', express.static(path.join(__dirname, 'node_modules/@fontsource')));

// --- proxy pentru pozele de profil (ca sa poata fi desenate in joc fara erori CORS)
const avatarCache = new Map();
app.get('/avatar', async (req, res) => {
  const url = String(req.query.u || '');
  let host = '';
  try { const u = new URL(url); if (u.protocol !== 'https:') throw 0; host = u.hostname; } catch { return res.status(400).end(); }
  // doar serverele de poze TikTok (si subdomeniile lor); "eviltiktok.com" nu trece
  if (!/(^|\.)(tiktokcdn|tiktokcdn-us|tiktokcdn-eu|ibyteimg|byteimg|muscdn|tiktok)\.(com|net)$/.test(host)) return res.status(403).end();
  try {
    let hit = avatarCache.get(url);
    if (!hit) {
      // fara redirectionari (nu poate fi pacalit sa ceara altceva), doar imagini, maxim 2 MB
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
      const type = r.headers.get('content-type') || '';
      // pozele de profil au cateva zeci de KB: maxim 500 KB pe poza si ~400 poze in memorie (inainte: pana la 1,6 GB daca cineva abuza prin tunel)
      if (!r.ok || !/^image\//.test(type) || Number(r.headers.get('content-length') || 0) > 5e5) return res.status(502).end();
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 5e5) return res.status(502).end();
      hit = { type, buf };
      if (avatarCache.size > 400) avatarCache.delete(avatarCache.keys().next().value);
      avatarCache.set(url, hit);
    }
    res.set('Content-Type', hit.type).set('Cache-Control', 'public, max-age=86400').send(hit.buf);
  } catch { res.status(502).end(); }
});

// link public (TUNEL.bat)
let tunnelUrl = '';
app.post('/api/tunnel', express.json(), (req, res) => {
  const a = req.socket.remoteAddress || '';
  if (req.headers['cf-connecting-ip'] || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(a)) return res.status(403).end();
  tunnelUrl = String(req.body?.url || '');
  for (const c of wss.clients) if (c.trusted && c.readyState === 1) c.send(JSON.stringify({ type: 'tunnel', url: tunnelUrl, liveLink: liveLink() })); // linkul cu cheie: doar ferestrele de incredere
  res.json({ ok: true, liveLink: liveLink() });
  console.log(tunnelUrl ? '  🌍 Link public: ' + tunnelUrl : '  🌍 Tunel oprit');
});
app.disable('x-powered-by');
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 }); // mesaje uriase sunt refuzate
let status = { live: false, username: USERNAME, language: cfg.language || '', mode: cfg.mode || '', lockMode: !!cfg.lockMode, liveName: LIVE_NAME, text: USERNAME ? 'Se conecteaza la @' + USERNAME + '…' : 'Mod simulare (fara username TikTok)' };

// un spectator cu internet slab nu are voie sa umple memoria serverului: daca ramane mult in urma, sare peste mesaje,
// iar daca se blocheaza de tot, e deconectat (pagina lui se reconecteaza singura). Ferestrele locale nu sunt afectate.
function sendTo(c, msg) {
  if (c.readyState !== 1) return;
  if (!c.trusted && c.bufferedAmount > 16e6) { c.terminate(); return; }
  if (!c.trusted && c.bufferedAmount > 4e6) return;
  c.send(msg);
}
function sendAll(msg) { for (const c of wss.clients) sendTo(c, msg); }
// Evenimentele din live (chat, tap, gift, follow, share) se strang 50 ms si pleaca intr-un singur pachet.
// Tap-urile aceluiasi om din acel interval se aduna intr-un singur eveniment. Cu 10.000 de spectatori asta inseamna
// ~20 de mesaje pe secunda in loc de sute, deci jocul nu se ineaca.
const BATCHED = new Set(['chat', 'like', 'gift', 'follow', 'share']);
let queue = [], likeIdx = new Map();
function flushQueue() {
  if (!queue.length) return;
  const msg = JSON.stringify(queue.length === 1 ? queue[0] : { type: 'batch', events: queue });
  queue = []; likeIdx = new Map();
  sendAll(msg);
}
setInterval(flushQueue, 50);
function broadcast(obj) {
  if (obj.type && !['status', 'boards', 'state', 'tunnel'].includes(obj.type)) logEvent(obj);
  if (BATCHED.has(obj.type)) {
    const id = obj.user && obj.user.id;
    if (obj.type === 'like' && id) { const prev = likeIdx.get(id); if (prev) { prev.count += obj.count || 1; return; } obj = { ...obj, count: obj.count || 1 }; likeIdx.set(id, obj); }
    queue.push(obj);
    return;
  }
  flushQueue(); // pastreaza ordinea: intai ce era in asteptare, apoi comanda / statusul
  sendAll(JSON.stringify(obj));
}
function setStatus(s) { status = { ...status, ...s }; broadcast({ type: 'status', ...status }); console.log('[status]', status.text); }

// cine poate trimite comenzi: ferestrele de pe acest PC (localhost) sau cine stie parola panoului (config.json "panelPassword")
const PANEL_PASSWORD = String(cfg.panelPassword || '');
const sha = x => crypto.createHash('sha256').update(String(x)).digest();
// cheia pentru sursa "Link" din LIVE Studio (prin tunel): noua la fiecare pornire, apare doar in fereastra TUNEL si in panoul de pe acest PC
// Cu tunel cu adresa fixa ("tunnelHostname" in config.json) cheia ramane aceeasi intre porniri, ca linkul din Studio sa nu trebuiasca schimbat.
// Ea sta in data/<live>/live-key.txt; o schimbi stergand fisierul (si repornind), de exemplu daca linkul a ajuns la cine nu trebuie.
const LIVE_KEY = (() => {
  if (!cfg.tunnelHostname) return crypto.randomBytes(12).toString('base64url');
  const kp = path.join(dataDir, 'live-key.txt');
  try { const k = fs.readFileSync(kp, 'utf8').trim(); if (k.length >= 16) return k; } catch {}
  const k = crypto.randomBytes(18).toString('base64url');
  try { fs.writeFileSync(kp, k); } catch {}
  return k;
})();
const keyOk = x => typeof x === 'string' && x.length > 0 && crypto.timingSafeEqual(sha(x), sha(LIVE_KEY));
const liveLink = () => (tunnelUrl ? tunnelUrl + '/?live=1&key=' + LIVE_KEY : '');
const passOk = x => !!PANEL_PASSWORD && crypto.timingSafeEqual(sha(x), sha(PANEL_PASSWORD));
// dupa 8 parole gresite de la aceeasi adresa, adresa e blocata 15 minute (nu se poate ghici parola prin incercari)
const fails = new Map();
const blocked = ip => { const f = fails.get(ip); return f && f.n >= 8 && Date.now() - f.at < 15 * 60000; };
function noteFail(ip) { const f = fails.get(ip) || { n: 0, at: 0 }; if (Date.now() - f.at > 15 * 60000) f.n = 0; f.n++; f.at = Date.now(); fails.set(ip, f); if (fails.size > 5000) fails.delete(fails.keys().next().value); }
let activeWin = null; // fereastra de joc activa
const MAX_VIEWERS = Math.max(1, Number(cfg.maxViewers) || 100);
// conexiunile moarte (laptop inchis, net picat) se curata la 30 s, altfel raman agatate si primesc mesaje degeaba
setInterval(() => { for (const c of wss.clients) { if (!c.isAlive) { c.terminate(); continue; } c.isAlive = false; try { c.ping(); } catch {} } }, 30000);
wss.on('connection', (ws, req) => {
  // fereastra activa s-a inchis: celelalte (in asteptare) pot prelua
  ws.on('close', () => { if (ws === activeWin) { activeWin = null; const msg = JSON.stringify({ type: 'release' }); for (const c of wss.clients) if (c.trusted && c.readyState === 1) c.send(msg); } });
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => {});
  const addr = req.socket.remoteAddress || '';
  const viaTunnel = !!(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']);
  const ip = String(req.headers['cf-connecting-ip'] || addr);
  // un site strain deschis in Chrome-ul tau se poate conecta si el la ws://127.0.0.1 (are tot adresa localhost):
  // de aceea "de incredere" inseamna si pagina venita de la acest server (sau fara Origin, ex. LIVE Studio / scripturi locale)
  const origin = String(req.headers.origin || '');
  const localOrigin = !origin || ['localhost', '127.0.0.1', '[::1]'].some(h => origin === `http://${h}:${PORT}`);
  ws.trusted = !viaTunnel && localOrigin && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);
  // prea multi spectatori prin tunel: nu mai primim altii (ferestrele locale si cei cu parola intra oricum)
  if (!ws.trusted) { let n = 0; for (const c of wss.clients) if (!c.trusted) n++; if (n > MAX_VIEWERS) { ws.close(1013, 'prea multi spectatori'); return; } }
  ws.send(JSON.stringify({ type: 'status', ...status }));
  ws.send(JSON.stringify({ type: 'boards', ...boards() }));
  ws.send(JSON.stringify({ type: 'tunnel', url: ws.trusted ? tunnelUrl : '', liveLink: ws.trusted ? liveLink() : '' }));
  ws.send(JSON.stringify({ type: 'hello', trusted: ws.trusted, needPassword: !ws.trusted, passwordSet: !!PANEL_PASSWORD }));
  ws.on('message', raw => {
    try {
      const m = JSON.parse(raw);
      if (!m) return;
      if (m.type === 'auth') {
        if (!ws.trusted) { if (blocked(ip)) { ws.send(JSON.stringify({ type: 'auth', ok: false, blocked: true })); return; } if (passOk(m.password) || keyOk(m.liveKey)) { ws.trusted = true; fails.delete(ip); } else { noteFail(ip); console.log('[panou] parola gresita de la', ip); } }
        ws.send(JSON.stringify({ type: 'auth', ok: ws.trusted })); return;
      }
      if (!ws.trusted) return; // spectatorii prin tunel doar privesc
      if (m.type === 'sim' && m.event) broadcast(m.event);
      if (m.type === 'control') broadcast(m);
      if (m.type === 'state') { for (const c of wss.clients) if (c !== ws && c.trusted && c.readyState === 1) c.send(raw.toString()); } // spectatorii prin tunel nu vad panoul
      // UNA singura fereastra de joc e activa; serverul decide (fara curse intre ferestre).
      // Sursa din LIVE Studio (?live) are prioritate: o fereastra obisnuita nu i-o ia, decat la click explicit.
      if (m.type === 'claim') {
        const cur = activeWin && activeWin !== ws && activeWin.readyState === 1 ? activeWin : null;
        if (cur && cur.live && !m.live && !m.force) { ws.send(JSON.stringify({ type: 'active', id: cur.winId })); return; }
        ws.winId = String(m.id || ''); ws.live = !!m.live; activeWin = ws;
        const msg = JSON.stringify({ type: 'active', id: ws.winId });
        for (const c of wss.clients) if (c.trusted && c.readyState === 1) c.send(msg);
      }
      // rezultatul unei runde se accepta doar de la fereastra de joc ACTIVA (o fereastra ramasa deschisa in alt loc nu poate dubla clasamentele)
      if (m.type === 'round' && activeWin && activeWin.readyState === 1 && ws !== activeWin) return;
      if (m.type === 'round') { applyRound(m); logEvent({ type: 'round', mode: m.mode, n: (m.results || []).length }); broadcast({ type: 'boards', ...boards() }); }
    } catch {}
  });
});

function userOf(u) {
  u = u || {};
  const pic = u.profilePicture || u.avatarThumb || {};
  return {
    id: String(u.uniqueId || u.userId || 'anonim'),
    name: String(u.nickname || u.uniqueId || 'anonim').slice(0, 24),
    avatar: (pic.url && pic.url[0]) || (pic.urlList && pic.urlList[0]) || ''
  };
}

// --- conexiunea TikTok LIVE
const streaks = new Map(); // serii de gift-uri in curs: cheie -> { rep, at, user, name, diamonds }
// o serie care nu mai primeste nimic 12 s se considera incheiata (TikTok nu trimite mereu "sfarsit"): se da puterea finala si se elibereaza memoria
setInterval(() => {
  const now = Date.now();
  for (const [key, st] of streaks) {
    // seria inchisa de noi ramane tinuta minte inca 60 s: daca TikTok trimite totusi mai tarziu actualizari / "sfarsit",
    // se numara doar ce e NOU (altfel toata seria s-ar numara a doua oara)
    if (st.closed) { if (now - st.at > 60000) streaks.delete(key); continue; }
    if (now - st.at > 12000) { st.closed = true; st.at = now; broadcast({ type: 'gift', user: st.user, giftName: st.name, coins: 0, total: st.rep * st.diamonds, repeat: st.rep, final: true }); }
  }
}, 4000);
let conn = null, retryMs = 5000, retryTimer = null, connGen = 0;
// O SINGURA reconectare programata la un moment dat, iar conexiunea veche e inchisa si "surzita" inainte de cea noua.
// Altfel, dupa o cadere, doua conexiuni paralele ar trimite fiecare gift de doua ori in joc.
function scheduleReconnect(ms, st) {
  clearTimeout(retryTimer);
  if (st) setStatus({ live: false, ...st });
  retryTimer = setTimeout(connectTikTok, ms);
}
function dropConnection() {
  const old = conn; conn = null;
  if (!old) return;
  try { old.removeAllListeners(); } catch {}
  old.on?.('error', () => {}); // o eroare tarzie a conexiunii vechi nu are voie sa opreasca serverul
  try { old.disconnect().catch(() => {}); } catch {}
}
// acelasi gift poate veni de doua ori (mai ales imediat dupa o reconectare): il numaram o singura data
const seenMsg = new Set();
function firstTime(d) {
  const id = d && d.common && d.common.msgId != null ? String(d.common.msgId) : '';
  if (!id) return true;
  if (seenMsg.has(id)) return false;
  seenMsg.add(id); if (seenMsg.size > 5000) seenMsg.delete(seenMsg.values().next().value);
  return true;
}
async function connectTikTok() {
  if (!USERNAME) return;
  clearTimeout(retryTimer); retryTimer = null;
  dropConnection();
  const gen = ++connGen;
  const c = conn = new TikTokLiveConnection(USERNAME, cfg.signApiKey ? { signApiKey: cfg.signApiKey } : {});
  const on = (ev, fn) => c.on(ev, d => { if (gen !== connGen) return; try { fn(d); } catch (e) { console.log('[tiktok ' + ev + ']', e?.message || e); } });

  on(WebcastEvent.CHAT, d => broadcast({ type: 'chat', user: userOf(d.user), text: String(d.comment || '').slice(0, 120), admin: isAdmin(d.user || {}) }));
  on(WebcastEvent.LIKE, d => broadcast({ type: 'like', user: userOf(d.user), count: Math.min(500, Number(d.likeCount) || 1) }));
  on(WebcastEvent.FOLLOW, d => broadcast({ type: 'follow', user: userOf(d.user) }));
  on(WebcastEvent.SHARE, d => broadcast({ type: 'share', user: userOf(d.user) }));
  on(WebcastEvent.GIFT, d => {
    if (!firstTime(d)) return;
    const user = userOf(d.user);
    const g = d.giftDetails || {};
    const diamonds = Math.max(1, Number(g.diamondCount) || 1);
    const rep = Math.max(1, Number(d.repeatCount) || 1);
    const name = String(g.giftName || 'Gift').slice(0, 40);
    if (Number(g.giftType) === 1) {
      // gift in serie (streak): trimitem doar diferenta, iar la final puterea speciala
      // Daca numaratoarea e mai mica decat ultima vazuta, e o serie NOUA (cea veche nu a mai trimis "sfarsit"): se numara de la zero,
      // altfel monedele din seria noua s-ar pierde.
      const key = user.id + ':' + d.giftId;
      const st = streaks.get(key);
      const last = st && (rep > st.rep || (rep === st.rep && (!st.closed || d.repeatEnd))) ? st.rep : 0;
      const delta = rep - last;
      // continuarea (sau "sfarsitul" intarziat) al unei serii pe care am inchis-o deja; acelasi numar fara "sfarsit" = gift nou (ex. inca un trandafir)
      const late = !!(st && st.closed && (rep > st.rep || (rep === st.rep && d.repeatEnd)));
      if (st && rep < st.rep && !st.closed) broadcast({ type: 'gift', user, giftName: st.name, coins: 0, total: st.rep * st.diamonds, repeat: st.rep, final: true }); // inchide seria veche (scut / surpriza)
      if (d.repeatEnd) streaks.delete(key); else streaks.set(key, { rep, at: Date.now(), user, name, diamonds, closed: late });
      if (late && !delta) return; // nimic nou
      broadcast({ type: 'gift', user, giftName: name, coins: delta * diamonds, total: rep * diamonds, repeat: rep, final: !!d.repeatEnd && !late });
    } else {
      broadcast({ type: 'gift', user, giftName: name, coins: rep * diamonds, total: rep * diamonds, repeat: rep, final: true });
    }
  });
  on(WebcastEvent.STREAM_END, () => { console.log('[tiktok] LIVE-ul s-a incheiat'); });
  on(ControlEvent.DISCONNECTED, () => { retryMs = 5000; scheduleReconnect(retryMs, { lost: true, text: '⚠ Conexiunea cu LIVE a picat – reconectare in 5s' }); });
  c.on(ControlEvent.ERROR, e => { if (gen === connGen) console.log('[tiktok error]', e?.message || e); });

  try {
    const st = await c.connect();
    if (gen !== connGen) return; // intre timp a pornit alta conexiune
    setStatus({ live: true, lost: false, text: '🔴 LIVE conectat: @' + USERNAME }); retryMs = 5000;
    console.log('Conectat la roomId', st.roomId);
  } catch (e) {
    if (gen !== connGen) return;
    console.log('[tiktok]', e?.message || e);
    scheduleReconnect(retryMs, { text: `⚠ Nu esti LIVE sau conexiunea a esuat – reincerc in ${Math.round(retryMs / 1000)}s` });
    retryMs = Math.min(30000, retryMs * 1.5);
  }
}

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  ❌ Portul ${PORT} e deja folosit. Probabil serverul vechi inca ruleaza (alta fereastra START.bat).`);
    console.log('  Inchide fereastra veche sau ruleaza STOP.bat, apoi porneste din nou.');
    console.log('  Alternativ, schimba "port" in config.json (ex: 3001) si in fisierele JOC-*.bat.\n');
  } else console.log('[server]', e);
  process.exit(1);
});
const HOST = cfg.allowLan ? '0.0.0.0' : '127.0.0.1'; // implicit serverul nu e vizibil in reteaua locala; linkul public merge doar prin TUNEL.bat
server.listen(PORT, HOST, () => {
  console.log('\n  🏁 TURBOSTRADA ruleaza!');
  if (LIVE_NAME) console.log(`\n  LIVE "${LIVE_NAME}" • joc: ${cfg.mode || 'classic'}${cfg.lockMode ? ' (fix)' : ''} • cont: ${USERNAME ? '@' + USERNAME : '(simulare – pune tiktokUsername in ' + liveArg + ')'}`);
  console.log('  Joc:        http://localhost:' + PORT);
  console.log('  Panou:      http://localhost:' + PORT + '/panel.html\n');
  connectTikTok();
});

// --- un live nu se opreste din cauza unei erori neasteptate: eroarea se noteaza in logs/server-errors.log si serverul merge mai departe
const errLog = path.join(__dirname, 'logs', 'server-errors.log');
function noteCrash(kind, e) {
  const line = `${new Date().toISOString()} [${LIVE_NAME || 'principal'}] ${kind}: ${e && e.stack || e}\n`;
  console.log('\n  ⚠ ' + kind + ' (serverul merge mai departe): ' + (e && e.message || e));
  try { fs.appendFileSync(errLog, line); } catch {}
}
process.on('uncaughtException', e => noteCrash('eroare', e));
process.on('unhandledRejection', e => noteCrash('promisiune respinsa', e));
// la inchidere (Ctrl+C, STOP.bat cu taskkill fara /f) se salveaza clasamentele inainte de iesire
let closing = false;
function shutdown() {
  if (closing) return; closing = true;
  console.log('\n  Opresc serverul si salvez clasamentele...');
  saveStatsNow();
  try { logStream && logStream.end(); } catch {}
  dropConnection();
  for (const c of wss.clients) try { c.close(1001); } catch {}
  server.close();
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown); process.on('SIGBREAK', shutdown); process.on('SIGHUP', shutdown); // SIGHUP = fereastra neagra inchisa din X
