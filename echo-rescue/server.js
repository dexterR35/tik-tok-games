import http from 'node:http';
import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ControlRoom } from './control-room.js';
import { EFFECTS } from './public/engine.js';
import { openGameWindow } from './game-window.js';

const project = fileURLToPath(new URL('./', import.meta.url));
const root = path.join(project, 'public');
const dataDir = process.env.ECHO_DATA_DIR || path.join(project, 'data');
const port = Number(process.env.PORT || 4317);
await mkdir(dataDir, { recursive: true });
const readJSON = async name => { try { return JSON.parse(await readFile(path.join(dataDir, name), 'utf8')); } catch { return {}; } };
let saveWork = Promise.resolve();
let room;
function save() {
  const settings = JSON.stringify(room.settings), progress = JSON.stringify(room.game.progress);
  saveWork = saveWork.catch(() => {}).then(async () => {
    for (const [name, contents] of [['settings.json', settings], ['progress.json', progress]]) {
      await writeFile(path.join(dataDir, name + '.tmp'), contents); await rename(path.join(dataDir, name + '.tmp'), path.join(dataDir, name));
    }
  }).catch(error => console.error('Could not save game settings:', error.message));
}
room = new ControlRoom({ settings: await readJSON('settings.json'), progress: await readJSON('progress.json'), onSave: save });
const streams = new Set();
let relay = null, relayGeneration = 0, retryTimer, relayTimeout;

function disconnectRelay(savePreference = true) {
  ++relayGeneration; clearTimeout(retryTimer); clearTimeout(relayTimeout);
  if (relay) { relay.onclose = null; relay.close(); relay = null; }
  room.live = { state: 'disconnected', live: false, username: '', text: 'Relay disconnected' };
  if (savePreference) { room.settings.reconnect = false; save(); }
}
function connectRelay() {
  disconnectRelay(false); const generation = relayGeneration;
  room.settings.demo = false; room.settings.reconnect = true; save();
  room.live = { state: 'connecting', live: false, username: '', text: 'Connecting to TikTok relay' };
  try { relay = new WebSocket(room.settings.relayUrl); }
  catch (error) { room.live.state = 'error'; room.live.text = error.message; return; }
  relayTimeout = setTimeout(() => { if (generation === relayGeneration && relay?.readyState === WebSocket.CONNECTING) relay.close(); }, 8000);
  relay.onopen = () => { clearTimeout(relayTimeout); if (generation !== relayGeneration) return; room.live.state = 'connected'; room.live.text = 'Relay connected; waiting for TikTok status'; };
  relay.onmessage = event => {
    if (generation !== relayGeneration || typeof event.data !== 'string' || event.data.length > 2_000_000) return;
    try { room.incoming(JSON.parse(event.data)); } catch { /* Invalid relay messages are ignored. */ }
  };
  relay.onerror = () => {};
  relay.onclose = () => {
    clearTimeout(relayTimeout); if (generation !== relayGeneration) return;
    room.live = { ...room.live, state: 'lost', live: false, text: 'Relay unavailable. Retrying in 5 seconds.' };
    retryTimer = setTimeout(connectRelay, 5000);
  };
}

function configureRelay(command) {
  const url = new URL(String(command.url || ''));
  if (!['ws:', 'wss:'].includes(url.protocol)) throw Error('Use a ws:// or wss:// relay URL');
  const mappings = {}, seen = new Set();
  for (const type of Object.keys(EFFECTS)) {
    mappings[type] = String(command.mappings?.[type] ?? room.settings.mappings[type]).slice(0, 200);
    for (const name of mappings[type].split(',').map(name => name.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean)) {
      if (seen.has(name)) throw Error('Each gift name can map to only one effect'); seen.add(name);
    }
  }
  room.settings.relayUrl = url.href; room.settings.mappings = mappings; connectRelay();
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
const server = http.createServer(async (req, res) => {
  if (!allowedHosts.has(req.headers.host)) return json(res, 403, { error: 'Local connections only' });
  const origin = req.headers.origin;
  if (origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin)) return json(res, 403, { error: 'Cross-origin access is not allowed' });
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, game: 'echo-rescue', version: 4 });
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, room.snapshot());
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`event: state\ndata: ${JSON.stringify(room.snapshot())}\n\n`); streams.add(res);
      req.on('close', () => streams.delete(res)); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/command') {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON is required' });
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 16384) return json(res, 413, { error: 'Command too large' }); }
      const command = JSON.parse(body);
      if (command.action === 'connect') configureRelay(command);
      else if (command.action === 'disconnect') disconnectRelay();
      else room.command(command);
      return json(res, 200, { ok: true });
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD, POST' }); return res.end(); }
    let pathname = decodeURIComponent(url.pathname);
    if (['/', '/play', '/play.html', '/capture'].includes(pathname)) pathname = '/index.html';
    if (['/host', '/panel.html'].includes(pathname)) pathname = '/host.html';
    const target = path.resolve(root, '.' + pathname), relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403); return res.end('Forbidden'); }
    if (!(await stat(target)).isFile()) { res.writeHead(404); return res.end('Not found'); }
    const content = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (req.url?.startsWith('/api/')) json(res, 400, { error: error.message });
    else { res.writeHead(404); res.end('Not found'); }
  }
});
let previousTick = performance.now(), frames = 0;
const ticker = setInterval(() => {
  const now = performance.now(); room.step((now - previousTick) / 1000, Date.now()); previousTick = now;
  if (++frames % 2) return;
  const message = `event: state\ndata: ${JSON.stringify(room.snapshot())}\n\n`;
  for (const response of streams) if (!response.destroyed && response.writableLength < 2_000_000) response.write(message);
}, 1000 / 40);
server.on('error', async error => {
  clearInterval(ticker);
  if (error.code === 'EADDRINUSE' && process.argv.includes('--open')) {
    try { const response = await fetch(`http://localhost:${port}/api/health`); const body = await response.json(); if (body.game === 'echo-rescue' && body.version === 4) { openGameWindow(`http://localhost:${port}/`); return; } } catch {}
  }
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Close the old Echo Rescue server first.` : error.message); process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`ECHO RESCUE GAME: http://localhost:${port}/`);
  console.log(`HOST CONTROLS:    http://localhost:${port}/host`);
  console.log('Capture the game window. H opens host controls. F enters fullscreen.');
  if (process.argv.includes('--open')) openGameWindow(`http://localhost:${port}/`);
  if (room.settings.reconnect) connectRelay();
});
async function shutdown() {
  clearInterval(ticker); disconnectRelay(false); for (const response of streams) response.end();
  await saveWork; server.close();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
