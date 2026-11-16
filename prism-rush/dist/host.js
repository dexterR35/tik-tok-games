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
  const sec = Math.ceil(s.remaining); $('round').textContent = `${s.round} / ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  $('queue').textContent = format(s.queueUnits); $('chests').textContent = format(s.chests);
  $('pause').textContent = s.paused ? '▶ Resume reactor' : 'Ⅱ Pause reactor';
  $('auto').checked = s.settings.auto; $('demo').checked = s.settings.demo;
  if (!initialized) { $('relay-url').value = s.settings.relayUrl; for (const [key, value] of Object.entries(s.settings.mappings)) $(`map-${key}`).value = value; $('round-seconds').value = String(s.settings.roundSeconds); initialized = true; }
  $('log').replaceChildren();
  for (const event of s.log) { const row = document.createElement('div'), time = document.createElement('time'), text = document.createElement('span'); time.textContent = new Date(event.at).toLocaleTimeString('en-GB'); text.textContent = event.text; row.className = event.type; row.append(time, text); $('log').append(row); }
  $('limits').textContent = `${s.participants} participants · ${s.votes} color votes · ${s.rejected} rejected actions · queue limit 512 groups`;
  $('winners').replaceChildren();
  for (const winner of s.history) { const row = document.createElement('div'), trophy = document.createElement('b'), name = document.createElement('span'), badge = document.createElement('small'), points = document.createElement('b'); trophy.textContent = '♛'; name.textContent = winner.name; badge.textContent = `ROUND ${winner.round} · ${winner.badge}`; name.append(badge); points.textContent = format(winner.score); row.append(trophy, name, points); $('winners').append(row); }
  if (!s.history.length) $('winners').textContent = 'Champions appear after the first round.';
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
  $('auto').onchange = e => command({ action: 'auto', value: e.target.checked });
  $('demo').onchange = e => command({ action: 'demo', value: e.target.checked });
  $('save-settings').onclick = () => command({ action: 'settings', roundSeconds: Number($('round-seconds').value) });
  document.querySelectorAll('[data-test]').forEach(button => button.onclick = () => command(button.dataset.test === 'tap' ? { action: 'tap', count: 100, name: $('name').value } : { action: 'power', power: button.dataset.test, name: $('name').value }));
}
