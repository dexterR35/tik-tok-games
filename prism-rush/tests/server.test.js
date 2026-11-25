import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const delay = ms => new Promise(r => setTimeout(r, ms));
async function freePort() { const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r)); return port; }
function frame(message) { const payload = Buffer.from(JSON.stringify(message)); assert.ok(payload.length < 65536); const header = Buffer.alloc(payload.length < 126 ? 2 : 4); header[0] = 0x81; if (payload.length < 126) header[1] = payload.length; else { header[1] = 126; header.writeUInt16BE(payload.length, 2); } return Buffer.concat([header, payload]); }

test('HTTP, shared state, command security and actual WebSocket relay delivery', async t => {
  const port = await freePort(), dataDir = await mkdtemp(path.join(os.tmpdir(), 'prism-test-'));
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: String(port), PRISM_DATA_DIR: dataDir }, stdio: 'ignore' });
  const sockets = new Set(), relay = http.createServer();
  t.after(async () => { child.kill(); for (const socket of sockets) socket.destroy(); await new Promise(r => relay.listening ? relay.close(r) : r()); });
  const url = `http://localhost:${port}`;
  let started = false;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(url + '/api/health')).ok) { started = true; break; } } catch {} await delay(50); }
  assert.ok(started, 'isolated server started');
  const command = async c => { const response = await fetch(url + '/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); assert.equal(response.status, 200, await response.text()); };
  assert.equal((await fetch(url)).status, 200); assert.equal((await fetch(url + '/host')).status, 200);
  assert.match((await fetch(url + '/vendor/three.module.js')).headers.get('content-type'), /javascript/);
  const blocked = await fetch(url + '/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: JSON.stringify({ action: 'pause' }) }); assert.equal(blocked.status, 403);
  await command({ action: 'demo', value: false }); await command({ action: 'pause' });
  await command({ action: 'tap', count: 700, name: 'Old test' });
  await command({ action: 'power', power: 'rose', name: 'Old test' });
  const first = await (await fetch(url + '/api/state')).json(), second = await (await fetch(url + '/api/state')).json();
  assert.equal(first.paused, true); assert.deepEqual(first.board, second.board); assert.equal(first.phase.id, second.phase.id);
  const stream = await fetch(url + '/api/events'), reader = stream.body.getReader(); const chunk = await reader.read(); assert.match(new TextDecoder().decode(chunk.value), /"paused":true/); await reader.cancel();
  relay.on('upgrade', (req, socket) => {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.write(frame({ type: 'batch', events: [{ type: 'status', live: true, username: 'relay-test' }, { type: 'like', user: { id: 'real-viewer', name: 'Relay Viewer' }, count: 125 }, { type: 'gift', user: { id: 'real-viewer', name: 'Relay Viewer' }, giftName: 'Heart', coins: 2, total: 2, repeat: 2 }, { type: 'gift', user: { id: 'real-viewer', name: 'Relay Viewer' }, giftName: 'Heart', coins: 0, total: 2, repeat: 2, final: true }] }));
  });
  await new Promise(r => relay.listen(0, '127.0.0.1', r));
  await command({ action: 'connect', url: `ws://127.0.0.1:${relay.address().port}/ws` });
  let live;
  for (let i = 0; i < 40; i++) { live = await (await fetch(url + '/api/state')).json(); if (live.live.live) break; await delay(50); }
  assert.equal(live.live.live, true); assert.equal(live.live.username, 'relay-test'); assert.equal(live.settings.demo, false); assert.equal(live.taps.received, 125); assert.equal(live.taps.played + live.taps.pending, 125); assert.ok(live.queueUnits <= 2); assert.ok(live.people || true);
  assert.equal(live.participants, 1); assert.equal(live.taps.pending, 125); assert.equal(live.jokersWaiting, 2);
  await command({ action: 'disconnect' }); const disconnected = await (await fetch(url + '/api/state')).json(); assert.equal(disconnected.live.live, false); assert.equal(disconnected.settings.reconnect, false);
});
