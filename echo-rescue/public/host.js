import { GameSession, command } from './session.js';
import { WORLDS } from './worlds.js';
import { EFFECTS } from './engine.js';
const $ = id => document.getElementById(id);
let initialized = false, latest, feedKey = '';
async function send(action, fields = {}) {
  try { await command(action, fields); $('hostMessage').textContent = 'Applied to the running game.'; $('hostMessage').className = ''; }
  catch (error) { $('hostMessage').textContent = error.message; $('hostMessage').className = 'error'; }
}
new GameSession({
  onConnection(connected) { if (!connected) { $('hostMessage').textContent = 'Game server disconnected. Start START.bat.'; $('hostMessage').className = 'error'; } },
  onState(state) {
    latest = state; const g = state.game;
    if (!initialized) {
      initialized = true; $('relayUrl').value = state.host.relayUrl;
      for (const type of Object.keys(EFFECTS)) $(`map-${type}`).value = state.host.mappings[type];
      $('world').value = String(g.levelIndex); $('hostMessage').textContent = 'Connected to the shared game session.';
    }
    $('currentWorld').textContent = `World ${g.levelIndex + 1}: ${WORLDS[g.levelIndex].name}`;
    $('currentRound').textContent = `${state.host.view === 'map' ? 'Warp map' : g.paused ? 'Paused' : 'Playing'} · Loop ${g.loop} · ${Math.ceil(WORLDS[g.levelIndex].duration - g.time)}s · ${g.robot.hearts} hearts · ${Math.floor(g.robot.x/WORLDS[g.levelIndex].length*100)}% of course`;
    $('rescues').textContent = g.rescues; $('actions').textContent = g.gifts; $('echoes').textContent = g.echoes; $('queued').textContent = state.queued;
    $('pause').textContent = g.paused ? 'Resume' : 'Pause'; $('map').textContent = state.host.view === 'map' ? 'Return to game' : 'World map';
    $('demo').checked = state.host.demo; $('autoAdvance').checked = state.host.autoAdvance;
    $('liveStatus').textContent = state.host.demo ? 'DEMO CREW ACTIVE · All viewer actions are simulated.' : state.live.text;
    const key = state.signals.at(-1)?.id;
    if (feedKey !== key) {
      feedKey = key; $('feed').replaceChildren();
      for (const signal of state.signals.slice(-10).reverse()) {
        const row = document.createElement('p');
        if (signal.kind === 'effect') { const e = signal.event; const name = document.createElement('b'); name.textContent = `${e.echo ? '↺ ' : ''}${e.viewer}`; row.append(name, document.createTextNode(` · ${EFFECTS[e.type].name}${e.echo ? ' echo' : ''}`)); }
        else row.textContent = ({ rescue: '✦ Robot rescued', memory: '◆ Memory shard recovered', loop: '↺ New echo loop', warp: '✧ Warped to the next world', 'team-jump': '♥ Team taps charged a jump', damage: 'Robot took a hit', restart: 'Session restarted', rewind: 'Rewinding the room' })[signal.kind] || signal.kind;
        $('feed').append(row);
      }
    }
  },
});
WORLDS.forEach((world, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = `${index + 1} · ${world.name}`; $('world').append(option); });
$('captureUrl').value = `${location.origin}/?capture=1`;
$('pause').onclick = () => send('pause'); $('restart').onclick = () => send('reset');
$('map').onclick = () => send('map', { open: latest?.host.view !== 'map' });
$('demo').onchange = event => send('demo', { enabled: event.target.checked });
$('autoAdvance').onchange = event => send('autoAdvance', { enabled: event.target.checked });
$('warp').onclick = () => send('warp', { world: Number($('world').value) });
$('likes').onclick = () => send('likes');
document.querySelectorAll('[data-effect]').forEach(button => button.onclick = () => send('effect', { effect: button.dataset.effect }));
document.querySelectorAll('[data-route]').forEach(button => button.onclick = () => send('vote', { route: button.dataset.route }));
$('connect').onclick = () => send('connect', { url: $('relayUrl').value.trim(), mappings: Object.fromEntries(Object.keys(EFFECTS).map(type => [type, $(`map-${type}`).value.trim()])) });
$('disconnect').onclick = () => send('disconnect');
