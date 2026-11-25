import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createCityServer } from '../server.mjs';
import { ASSET_IDS } from '../public/assets.js';

test('local server serves game, asset library, atlas and matching manifest', async t => {
  const server = createCityServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /cameraMode/);
  const library = await fetch(`${base}/assets.html`); assert.equal(library.status, 200);
  const manifest = await (await fetch(`${base}/assets/manifest.json`)).json(); assert.deepEqual(manifest.cells, ASSET_IDS);
  const png = await fetch(`${base}/assets/${manifest.image}`); assert.equal(png.headers.get('content-type'), 'image/png');
  const data = Buffer.from(await png.arrayBuffer()); assert.equal(data.readUInt32BE(16), manifest.layout.width); assert.equal(data.readUInt32BE(20), manifest.layout.height);
  assert.equal(data[25], 6, 'PNG has RGBA channels');
  const cycle = manifest.animation;
  const animation = Buffer.from(await (await fetch(`${base}/assets/${cycle.image}`)).arrayBuffer());
  assert.equal(animation.readUInt32BE(16), cycle.width); assert.equal(animation.readUInt32BE(20), cycle.height);
  assert.equal(animation[25], 6); assert.equal(cycle.frames, 48);
  const invalid = await fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'unknown' }) });
  assert.equal(invalid.status, 400);
});

test('comment and selected gift-action previews are relayed with source labels over SSE', async t => {
  const server = createCityServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`, controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000); t.after(() => clearTimeout(timer));
  const stream = await fetch(`${base}/api/events`, { signal: controller.signal }), reader = stream.body.getReader();
  await reader.read();
  const post = payload => fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal((await post({ cmd: 'comment', user: 'tester', text: '!join', source: 'demo' })).status, 200);
  assert.equal((await post({ cmd: 'gift', user: 'tester', name: 'Unsaved draft', action: 'recruit' })).status, 200);
  let text = ''; const decoder = new TextDecoder();
  while (!text.includes('recruit')) { const chunk = await reader.read(); assert.ok(!chunk.done); text += decoder.decode(chunk.value); }
  assert.match(text, /"text":"!join"/); assert.match(text, /"source":"demo"/); assert.match(text, /"action":"recruit"/);
  controller.abort(); await reader.cancel().catch(() => {});
});
