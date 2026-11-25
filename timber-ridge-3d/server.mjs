import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { GiftLedger, avatarOf } from './gift-ledger.mjs';
import { CrowdBuffer } from './crowd-buffer.mjs';
import { sanitizeGiftMap, DEFAULT_GIFT_MAP } from './public/rules.js';
import fs from 'node:fs';

const COMMANDS = new Set(['tap', 'gift', 'follow', 'share', 'jump', 'buy', 'auto', 'level', 'respawn', 'reset']);
const nameOf = u => String(u?.nickname || u?.uniqueId || 'VIEWER').slice(0, 24);

export function createTimberServer({ connectionFactory = (username, options) => new TikTokLiveConnection(username, options), dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data') } = {}) {
  // host's gift list, shared by every game view (panel + OBS) and kept between streams
  const mapFile = path.join(dataDir, 'gift-map.json');
  let giftMap = DEFAULT_GIFT_MAP;
  try { giftMap = sanitizeGiftMap(JSON.parse(fs.readFileSync(mapFile, 'utf8'))); } catch {}
  const app = express(), server = http.createServer(app), clients = new Set();
  let connection = null, connecting = false, connected = false, username = '', message = 'Demo mode. Enter your username while you are LIVE.', generation = 0, viewers = 0;
  const crowd = new CrowdBuffer();
  let ledger = new GiftLedger();
  const status = () => ({ type: 'status', app: 'timber-ridge-2d', connected, connecting, username, message, viewers });
  const broadcast = data => {
    const packet = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      if (client.destroyed || client.writableEnded) { clients.delete(client); continue; }
      if (client.writableLength > 128 * 1024) { clients.delete(client); client.destroy(); continue; }
      client.write(packet);
    }
  };
  const setStatus = changes => {
    if ('connected' in changes) connected = changes.connected;
    if ('connecting' in changes) connecting = changes.connecting;
    if ('message' in changes) message = changes.message;
    broadcast(status());
  };

  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.get('/api/status', (_req, res) => res.json(status()));
  app.get('/api/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${JSON.stringify(status())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });
  app.use('/api', (req, res, next) => {
    if (req.method !== 'POST') return next();
    const origin = req.headers.origin;
    // Host controls are accepted only from the game's own local page.
    if (origin && origin !== `http://${req.headers.host}`) return res.status(403).json({ message: 'Open the host panel from the local game address.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ message: 'Cross-site commands are disabled.' });
    next();
  });

  app.get('/api/gift-map', (_req, res) => res.json({ map: giftMap }));
  app.post('/api/gift-map', (req, res) => {
    giftMap = sanitizeGiftMap(req.body?.map);
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(mapFile, JSON.stringify(giftMap, null, 2)); } catch (e) { console.warn('Could not save gift list:', e.message); }
    broadcast({ type: 'giftmap', map: giftMap });
    res.json({ map: giftMap });
  });

  // Host test buttons / garage: relayed to every open game view (host panel + OBS browser source).
  app.post('/api/command', (req, res) => {
    const b = req.body || {};
    if (!COMMANDS.has(b.cmd)) return res.status(400).json({ message: 'Unknown command.' });
    const cmd = { type: 'command', cmd: b.cmd };
    if (b.cmd === 'gift') { cmd.tier = Math.min(3, Math.max(0, Math.floor(Number(b.tier) || 0))); if (b.name) cmd.name = String(b.name).slice(0, 40); }
    if (b.cmd === 'buy') cmd.id = String(b.id || '').slice(0, 20);
    if (b.cmd === 'auto') cmd.value = !!b.value;
    if (b.cmd === 'level') cmd.level = Math.max(1, Math.floor(Number(b.level) || 1));
    broadcast({ type: 'batch', events: [cmd] });
    res.json({ ok: true });
  });

  async function disconnect() {
    generation++;
    const old = connection;
    connection = null; viewers = 0; crowd.clear(); ledger = new GiftLedger();
    setStatus({ connected: false, connecting: false, message: 'Disconnected. Demo mode is ready.' });
    if (old) { old.removeAllListeners(); try { await old.disconnect(); } catch {} }
  }

  app.post('/api/connect', async (req, res) => {
    const requested = String(req.body?.username || '').trim().replace(/^@/, '');
    if (!/^[\w.]{2,32}$/.test(requested)) return res.status(400).json({ ...status(), message: 'Enter a valid TikTok username.' });
    if (connecting || connected) return res.status(409).json({ ...status(), message: 'Disconnect the current session before starting another.' });
    username = requested; ledger = new GiftLedger();
    const session = ++generation;
    setStatus({ connecting: true, connected: false, message: `Connecting to @${username}…` });
    let candidate;
    try {
      candidate = connectionFactory(username, { enableExtendedGiftInfo: true, processInitialData: false, ...(process.env.TIKTOK_SIGN_API_KEY ? { signApiKey: process.env.TIKTOK_SIGN_API_KEY } : {}) });
      connection = candidate;
      const live = fn => d => { if (session === generation) fn(d); };
      candidate.on(WebcastEvent.LIKE, live(d => crowd.like(d.likeCount || 1, nameOf(d.user), avatarOf(d.user))));
      candidate.on(WebcastEvent.GIFT, live(d => { const gift = ledger.consume(d); if (gift) crowd.gift(gift); }));
      candidate.on(WebcastEvent.FOLLOW, live(d => crowd.social('follow', nameOf(d.user), avatarOf(d.user))));
      candidate.on(WebcastEvent.SHARE, live(d => crowd.social('share', nameOf(d.user), avatarOf(d.user))));
      candidate.on(WebcastEvent.CHAT, live(d => crowd.social('comment', nameOf(d.user), avatarOf(d.user), d.comment)));
      candidate.on(WebcastEvent.ROOM_USER, live(d => { viewers = Math.max(0, Math.floor(Number(d.viewerCount) || 0)); broadcast({ type: 'audience', viewers }); }));
      candidate.on(WebcastEvent.STREAM_END, live(() => setStatus({ connected: false, connecting: false, message: 'The LIVE has ended. Connect again when you go live.' })));
      candidate.on(ControlEvent.DISCONNECTED, live(() => setStatus({ connected: false, connecting: false, message: 'TikTok disconnected. Press connect to try again.' })));
      candidate.on(ControlEvent.ERROR, live(error => { console.warn('TikTok connector:', error?.info || error?.message || 'connection error'); setStatus({ message: 'TikTok reported a connection issue. If it disconnects, connect again.' }); }));
      await Promise.race([candidate.connect(), new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('Connection timed out. Make sure your account is LIVE, then retry.')), 25000); t.unref(); })]);
      if (session !== generation) { candidate.removeAllListeners(); await candidate.disconnect().catch(() => {}); return res.json(status()); }
      setStatus({ connected: true, connecting: false, message: `@${username} is LIVE. Taps drive the jeep, gifts power it up.` });
      res.json(status());
    } catch (error) {
      if (session === generation) {
        generation++; connection = null; candidate?.removeAllListeners();
        try { await candidate?.disconnect(); } catch {}
        setStatus({ connecting: false, connected: false, message: String(error?.message || 'Connection failed. Confirm your account is LIVE.').slice(0, 230) });
      }
      res.status(502).json(status());
    }
  });
  app.post('/api/disconnect', async (_req, res) => { await disconnect(); res.json(status()); });

  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));
  const flush = setInterval(() => { const events = crowd.flush(); if (events.length) broadcast({ type: 'batch', events }); }, 100); flush.unref();
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n'); }, 15000); heartbeat.unref();
  server.on('close', () => { clearInterval(flush); clearInterval(heartbeat); for (const c of clients) c.end(); clients.clear(); void disconnect(); });
  server.crowd = crowd;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createTimberServer();
  const port = Number(process.env.PORT) || 3341;
  server.listen(port, '127.0.0.1', () => {
    console.log(`TIMBER RIDGE 2D is ready: http://127.0.0.1:${port}\nBroadcast capture: http://127.0.0.1:${port}/?broadcast=1\nKeep this window open while playing.`);
    if (process.argv.includes('--open')) {
      const url = `http://127.0.0.1:${port}`;
      const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
      const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', () => {}); child.unref();
    }
  });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. The game may already be running.` : error); process.exitCode = 1; });
}