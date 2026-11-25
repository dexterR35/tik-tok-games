const $ = id => document.getElementById(id), format = n => n.toLocaleString('en-US');
let state, initialized = false;
async function command(c) {
  try {
    const response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'Command failed');
    $('feedback').textContent = 'Command applied.'; $('feedback').style.color = '#b6ffcf';
  } catch (e) { $('feedback').textContent = e.message; $('feedback').style.color = '#ffb7bb'; }
}
function render(s) {
  state = s;
  $('connection').classList.toggle('on-air', s.live.live);
  $('connection').querySelector('strong').textContent = s.live.text;
  $('server-status').textContent = s.live.live ? 'TIKTOK LIVE' : s.live.state === 'connected' ? 'RELAY CONNECTED · NOT LIVE' : 'GAME SERVER ONLINE';
  $('score').textContent = format(s.score);
  $('round').textContent = `${s.level.n} / ${format(s.level.tapsUsed)}`;
  $('level-goals').textContent = `World ${s.level.world + 1} · ${s.level.worldName}${s.level.hard ? ' · HARD' : ''} · ${s.level.status} · ${s.level.goals.map(g => `${g.type === 'collect' ? ['red', 'orange', 'yellow', 'green', 'blue', 'purple'][g.color] : g.type === 'power' ? g.kind : g.type} ${g.have}/${g.target}`).join(' · ')} · 3★ ≤ ${format(s.level.par.three)} taps · 2★ ≤ ${format(s.level.par.two)} taps · median ${format(s.level.par.median)} taps`;
  $('queue').textContent = `${format(s.taps.received)} / ${format(s.taps.played)} / ${format(s.taps.pending)}`; $('chests').textContent = `${format(s.queueUnits)} · ${format(s.jokersWaiting)}`;
  $('pause').textContent = s.paused ? '▶ Resume reactor' : 'Ⅱ Pause reactor';
  if (!initialized) { $('relay-url').value = s.settings.relayUrl; for (const [key, value] of Object.entries(s.settings.mappings)) $(`map-${key}`).value = value; $('jump-level').value = String(s.level.n); initialized = true; }
  $('log').replaceChildren();
  for (const event of s.log) { const row = document.createElement('div'), time = document.createElement('time'), text = document.createElement('span'); time.textContent = new Date(event.at).toLocaleTimeString('en-GB'); text.textContent = event.text; row.className = event.type; row.append(time, text); $('log').append(row); }
  $('limits').textContent = `${s.participants} participants · ${s.votes} color votes · ${s.rejected} rejected actions · queue limit 512 groups`;
  $('winners').replaceChildren();
  for (const winner of s.history) { const row = document.createElement('div'), trophy = document.createElement('b'), name = document.createElement('span'), badge = document.createElement('small'), points = document.createElement('b'); trophy.textContent = '♛'; name.textContent = winner.name; badge.textContent = `LEVEL ${winner.level} · ${'★'.repeat(winner.stars)}${'☆'.repeat(3 - winner.stars)} · ${format(winner.tapsUsed)} taps · top tapper ${winner.heroes?.tapper?.name || '—'} · top gifter ${winner.heroes?.gifter?.name || '—'}`; name.append(badge); points.textContent = format(winner.score); row.append(trophy, name, points); $('winners').append(row); }
  if (!s.history.length) $('winners').textContent = 'MVPs appear after the first completed level.';
}
let local = false;
try { const response = await fetch('/api/health'); if (response.ok) local = (await response.json()).game === 'prism-rush'; } catch {}
if (!local) { $('host-notice').hidden = false; $('connection').querySelector('strong').textContent = 'Hosted demo · local host controls unavailable'; document.querySelectorAll('button,input,select').forEach(el => el.disabled = true); }
else {
  const stream = new EventSource('/api/events'); stream.onmessage = e => render(JSON.parse(e.data));
  stream.onerror = () => { $('connection').querySelector('strong').textContent = 'Game server disconnected · retrying…'; };
  $('relay-form').addEventListener('submit', e => { e.preventDefault(); const mappings = {}; for (const power of ['rose', 'meteor', 'prism', 'supernova']) mappings[power] = $(`map-${power}`).value; command({ action: 'connect', url: $('relay-url').value, mappings }); });
  $('disconnect').onclick = () => command({ action: 'disconnect' });
  $('pause').onclick = () => command({ action: 'pause' });
  $('finish').onclick = () => command({ action: 'finish' });
  $('jump').onclick = () => command({ action: 'setLevel', level: Number($('jump-level').value) });
  $('restart').onclick = () => command({ action: 'restartLevel' });
  $('skip').onclick = () => command({ action: 'skipLevel' });
  document.querySelectorAll('[data-test]').forEach(button => button.onclick = () => command(button.dataset.test.startsWith('tap') ? { action: 'tap', count: button.dataset.test === 'tap500' ? 500 : 50, name: $('name').value } : { action: 'power', power: button.dataset.test, name: $('name').value }));
}
