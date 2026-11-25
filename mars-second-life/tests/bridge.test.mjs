import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMarsServer } from '../server.mjs';
import { GiftLedger } from '../gift-ledger.mjs';
import { CrowdBuffer } from '../crowd-buffer.mjs';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

test('test gift command is relayed to game views', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mars-'));
  const server = createMarsServer({ dataDir, connectionFactory: () => new EventEmitter() });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  await reader.read(); // initial status
  const r = await fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'gift', user: 'luna', loc: 'studio', coins: 30, name: 'Doughnut' }) });
  assert.equal(r.status, 200);
  const { value } = await reader.read();
  const msg = JSON.parse(new TextDecoder().decode(value).replace(/^data: /, ''));
  assert.equal(msg.events[0].loc, 'studio');
  assert.equal(msg.events[0].user, 'luna');
  ctrl.abort(); server.close();
});

test('cross-site commands are refused', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mars-'));
  const server = createMarsServer({ dataDir });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ cmd: 'reset' }) });
  assert.equal(r.status, 403);
  server.close();
});

test('streak gifts count once and different gifts stay apart', () => {
  const ledger = new GiftLedger(), crowd = new CrowdBuffer();
  const u = { uniqueId: 'a', userId: '1' };
  for (const rep of [1, 2, 3]) { const g = ledger.consume({ user: u, giftId: 5, repeatCount: rep, giftType: 1, groupId: 'g', giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 1 } }); if (g) crowd.gift(g); }
  crowd.gift({ user: 'a', coins: 1, count: 1, name: 'TikTok' });
  const ev = crowd.flush();
  assert.equal(ev.length, 2);
  assert.equal(ev.find(e => e.name === 'Rose').count, 3);
});
