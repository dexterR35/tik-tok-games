import http from 'node:http';
import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room, cleanAvatar } from './public/room.js';
import { openGameWindow } from './game-window.js';

const project = fileURLToPath(new URL('./', import.meta.url));
const root = path.join(project, 'public');
const dataDir = process.env.PRISM_DATA_DIR || path.join(project, 'data');
const port = Number(process.env.PORT || 4328);
await mkdir(dataDir, { recursive: true });
let saved;
try { const data = JSON.parse(await readFile(path.join(dataDir, 'session.json'), 'utf8')); if ([1, 2, 3].includes(data.version)) saved = data; } catch {}
const room = new Room({ saved });
const streams = new Set();
let relay, generation = 0, retry, timeout, writes = Promise.resolve(), stopping = false;
function save() {
  const data = JSON.stringify(room.export());
  writes = writes.catch(() => {}).then(async () => {
    const dest = path.join(dataDir, 'session.json');
    await writeFile(dest + '.tmp', data); await rename(dest + '.tmp', dest);
  }).catch(e => console.error('Session save failed:', e.message));
  return writes;
}
function disconnect(preserve = false) {
  generation++; clearTimeout(retry); clearTimeout(timeout);
  if (relay) { relay.onclose = null; relay.close(); relay = null; }
  room.live = { state: 'disconnected', live: false, username: '', text: 'Relay disconnected' };
  if (!preserve) { room.settings.reconnect = false; save(); }
}
function connect() {
  disconnect(true); const mine = generation;
  room.prepareLive(); room.settings.reconnect = true;
  room.live = { state: 'connecting', live: false, username: '', text: 'Connecting to TikTok relay…' }; save();
  try { relay = new WebSocket(room.settings.relayUrl); }
  catch (e) { room.live = { ...room.live, state: 'error', text: e.message }; return; }
  timeout = setTimeout(() => { if (mine === generation && relay.readyState === 0) relay.close(); }, 8000);
  relay.onopen = () => { if (mine !== generation) return; clearTimeout(timeout); room.live = { ...room.live, state: 'connected', text: 'Relay connected · waiting for account LIVE status' }; };
  relay.onmessage = event => {
    if (mine !== generation || typeof event.data !== 'string' || event.data.length > 2_000_000) return;
    try { room.incoming(JSON.parse(event.data)); } catch (e) { room.emit('warning', `Relay packet ignored: ${e.message}`); }
  };
  relay.onerror = () => {};
  relay.onclose = () => {
    if (mine !== generation || stopping) return;
    clearTimeout(timeout); room.live = { ...room.live, state: 'lost', live: false, text: 'Relay unavailable · retrying in 5 seconds' };
    retry = setTimeout(connect, 5000);
  };
}
// Viewer photos: the relay sends TikTok CDN links. Browsers cannot draw
// cross-origin photos into WebGL, so this server fetches them (TikTok image
// hosts only, https, no redirects, images up to 500 KB, 400 cached).
const avatars = new Map();
async function avatar(res, id) {
  const url = cleanAvatar(room.users.get(id)?.avatar);
  if (!url) { res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end(); }
  try {
    let hit = avatars.get(url);
    if (!hit) {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !/^image\/(jpeg|png|webp|gif)/.test(type) || Number(r.headers.get('content-length') || 0) > 5e5) throw Error('bad image');
      const body = Buffer.from(await r.arrayBuffer()); if (body.length > 5e5) throw Error('too large');
      hit = { type, body }; if (avatars.size >= 400) avatars.delete(avatars.keys().next().value); avatars.set(url, hit);
    }
    res.writeHead(200, { 'Content-Type': hit.type, 'Cache-Control': 'max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.end(hit.body);
  } catch { res.writeHead(502, { 'Cache-Control': 'no-store' }); res.end(); }
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const server = http.createServer(async (req, res) => {
  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`];
  if (!hosts.includes(req.headers.host)) return json(res, 403, { error: 'Local connections only' });
  if (req.headers.origin && !hosts.some(host => req.headers.origin === `http://${host}`)) return json(res, 403, { error: 'Cross-origin command blocked' });
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, game: 'prism-rush', version: 1, release: '3.0.0' });
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, room.snapshot());
    if (req.method === 'GET' && url.pathname === '/api/avatar') return avatar(res, String(url.searchParams.get('id') || ''));
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`data: ${JSON.stringify(room.snapshot())}\n\n`); streams.add(res);
      req.on('close', () => streams.delete(res)); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/command') {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON is required' });
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 16384) return json(res, 413, { error: 'Command too large' }); }
      const command = JSON.parse(body);
      if (command.action === 'connect') {
        const relayUrl = new URL(String(command.url || ''));
        if (!['ws:', 'wss:'].includes(relayUrl.protocol) || relayUrl.username || relayUrl.password) throw Error('Use a ws:// or wss:// relay URL without embedded credentials');
        if (command.mappings) room.command({ action: 'settings', mappings: command.mappings });
        room.settings.relayUrl = relayUrl.href; connect();
      } else if (command.action === 'disconnect') disconnect();
      else if (room.command(command) === false) return json(res, 409, { error: 'Power queue full or participant limit reached' });
      save(); return json(res, 200, { ok: true });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
    let pathname = decodeURIComponent(url.pathname);
    if (['/', '/capture'].includes(pathname)) pathname = '/index.html';
    if (pathname === '/host') pathname = '/host.html';
    const target = path.resolve(root, '.' + pathname), relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return json(res, 403, { error: 'Forbidden' });
    if (!(await stat(target)).isFile()) return json(res, 404, { error: 'Not found' });
    const content = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (e) { json(res, req.url.startsWith('/api/') ? 400 : 404, { error: req.url.startsWith('/api/') ? e.message : 'Not found' }); }
});
let previous = Date.now();
const tick = setInterval(() => {
  const now = Date.now(); room.step((now - previous) / 1000, now); previous = now;
  const message = `data: ${JSON.stringify(room.snapshot())}\n\n`;
  for (const stream of streams) if (!stream.destroyed && stream.writableLength < 500_000) stream.write(message);
}, 50);
const autosave = setInterval(save, 5000);
server.listen(port, '127.0.0.1', () => {
  console.log(`PRISM RUSH:    http://localhost:${port}/`);
  console.log(`HOST CONTROLS: http://localhost:${port}/host`);
  console.log('Capture at 1080 × 1920. F fullscreen · H host controls · Space pause.');
  if (process.argv.includes('--open')) openGameWindow(`http://localhost:${port}/`);
  if (room.settings.reconnect) connect();
});
server.on('error', async e => {
  clearInterval(tick); clearInterval(autosave);
  if (e.code === 'EADDRINUSE' && process.argv.includes('--open')) {
    try { const response = await fetch(`http://localhost:${port}/api/health`); const value = await response.json(); if (value.game === 'prism-rush' && value.version === 1) { openGameWindow(`http://localhost:${port}/`); return; } } catch {}
  }
  console.error(e.message); process.exitCode = 1;
});
async function shutdown() {
  if (stopping) return; stopping = true;
  clearInterval(tick); clearInterval(autosave); disconnect(true);
  for (const stream of streams) stream.end();
  await save(); server.close(); server.closeIdleConnections();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
