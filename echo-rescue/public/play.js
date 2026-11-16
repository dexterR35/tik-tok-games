import { WorldRenderer } from './renderer3d.js';
import { GameSession, command } from './session.js';
import { WORLDS } from './worlds.js';
import { EFFECTS, MAX_HEARTS } from './engine.js';

const $ = id => document.getElementById(id);
const shell = $('gameShell');
let renderer, session, connected = false, lastUI = 0, lastFrame = performance.now(), mappingKey = '', timelineKey = '';
let shoutUntil = 0, awakeTimer, sound = false, audio, lastBoundary = '', lastView = '';
const capture = new URLSearchParams(location.search).has('capture');
if (capture) shell.classList.add('capture');
function message(text) { $('gameMessage').textContent = text; $('gameMessage').hidden = !text; }
try { renderer = new WorldRenderer($('gameCanvas')); renderer.setBroadcastMode(); }
catch (error) { message('3D graphics could not start. Enable hardware acceleration in your browser, then reopen the game.'); throw error; }

function sfx(type, echo = false) {
  if (!sound) return;
  try {
    audio ||= new AudioContext(); audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime;
    const frequency = { cube: 180, heal:620, pulse: 340, shield: 520, boost: 670, rescue: 880, memory: 720, rewind: 130, damage: 90, warp: 450 }[type] || 260;
    oscillator.type = type === 'damage' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency * (echo ? 1.25 : 1), time);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * (type === 'damage' ? .5 : 1.5), time + .2);
    gain.gain.setValueAtTime(.045, time); gain.gain.exponentialRampToValueAtTime(.001, time + .3);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(time + .35);
  } catch {}
}
async function send(action, fields) { try { await command(action, fields); } catch (error) { message(error.message); setTimeout(() => { if (connected) message(''); }, 2500); } }
function signal(signal) {
  const g = session.game;
  if (signal.kind === 'effect') {
    const event = signal.event; renderer.burst(event); sfx(event.type, event.echo);
    $('shoutViewer').textContent = event.echo ? `${event.viewer}'s echo` : event.viewer;
    $('shoutAction').textContent = event.echo ? `ECHO ${EFFECTS[event.type].short}!` : { cube:event.banked?'SPARE PART +1':'BRIDGE PIECE +1',heal:event.storedLife?'LIFE STORED +1':'HEALTH +1', pulse: 'GRAVITY JUMP!', shield: 'SHIELD +6s!', boost: 'TURBO +4s!' }[event.type];
    $('shoutIcon').textContent = event.echo ? '↺' : { cube: '⬡',heal:'♥', pulse: '↑', shield: '✧', boost: 'ϟ' }[event.type];
    $('giftShout').style.setProperty('--signal', event.echo ? '#cbb4ff' : EFFECTS[event.type].color);
    shoutUntil = performance.now() + 2200;
  }
  if (['loop', 'warp', 'restart'].includes(signal.kind)) { renderer.resetCamera(g); if (signal.kind === 'warp') renderer.warp(); timelineKey = ''; }
  if (signal.kind === 'memory') { renderer.burst({ type: 'boost', x: signal.x }); sfx('memory'); }
  if (signal.kind === 'checkpoint') { $('shoutViewer').textContent='PROGRESS SAVED';$('shoutAction').textContent='CHECKPOINT!';$('shoutIcon').textContent='⚑';$('giftShout').style.setProperty('--signal','#c9ed9d');shoutUntil=performance.now()+1800;sfx('memory'); }
  if (signal.kind === 'revive') { $('shoutViewer').textContent='STORED LIFE USED';$('shoutAction').textContent='BACK IN THE GAME!';$('shoutIcon').textContent='♥';$('giftShout').style.setProperty('--signal','#ffb1bd');shoutUntil=performance.now()+1800;sfx('heal'); }
  if (signal.kind === 'rescue') { renderer.burst({ type: 'boost', x: g.robot.x }); sfx('rescue'); }
  if (signal.kind === 'damage') { shell.classList.remove('hit-flash'); void shell.offsetWidth; shell.classList.add('hit-flash'); setTimeout(() => shell.classList.remove('hit-flash'), 450); sfx('damage'); }
  if (['rewind', 'warp'].includes(signal.kind)) sfx(signal.kind);
}
session = new GameSession({
  onState(snapshot) {
    const boundary = `${snapshot.game.levelIndex}:${snapshot.game.loop}`;
    if (boundary !== lastBoundary) { renderer.resetCamera(session.game); lastBoundary = boundary; }
  },
  onSignal: signal,
  onConnection(value) { connected = value; if (value) message(''); else message('RECONNECTING TO THE GAME…'); },
});

function timeline(g) {
  const key = `${g.levelIndex}:${g.loop}:${g.recording.length}:${g.previous.length}`; if (key === timelineKey) return; timelineKey = key;
  for (const [id, events] of [['nowLane', g.recording], ['echoLane', g.previous]]) {
    $(id).replaceChildren();
    for (const event of events) { const pip = document.createElement('i'); pip.className = 'memory-pip'; pip.style.left = `${Math.min(99, event.at / g.duration * 100)}%`; pip.style.setProperty('--pip', EFFECTS[event.type].color); $(id).append(pip); }
  }
}
function update(now) {
  if (!session.snapshot) return;
  const state = session.snapshot, g = session.game, r = g.robot, world = g.level, map = state.host.view === 'map';
  shell.style.setProperty('--world', WORLDS[map ? state.host.selectedWorld : g.levelIndex].color);
  if (lastView !== state.host.view) { renderer.setMapView(map, state.host.selectedWorld); lastView = state.host.view; }
  renderer.selectedWorld = state.host.selectedWorld;
  shell.classList.toggle('map-view', map); $('mapHud').hidden = !map;
  $('playMode').textContent = state.host.demo ? 'DEMO' : state.live.live ? `● LIVE @${state.live.username}` : state.live.state === 'disconnected' ? 'WAITING FOR LIVE' : 'RELAY · ' + state.live.state.toUpperCase();
  $('playMode').classList.toggle('live', state.live.live && !state.host.demo);
  $('rescues').textContent = `${g.rescues} ${g.rescues === 1 ? 'RESCUE' : 'RESCUES'}`;
  $('levelName').textContent = `WORLD ${g.levelIndex + 1} · ${world.name.toUpperCase()}`;
  $('loop').textContent = String(g.loop).padStart(2, '0');
  $('clock').textContent = g.paused ? 'Ⅱ' : String(Math.ceil(g.remaining)).padStart(2, '0');
  $('clock').parentElement.classList.toggle('urgent', g.remaining < 15);
  $('hearts').textContent = '♥'.repeat(r.hearts) + '♡'.repeat(MAX_HEARTS - r.hearts);
  $('lifeReserve').textContent=r.reserves?`+${r.reserves} STORED`:'';
  $('shards').textContent = `${r.memories.size}/3`;
  $('stars').textContent = `⬡ ${g.builtPieces}/${g.totalPieces}${g.parts?` +${g.parts}`:''}`;
  $('routeFill').style.width=`${Math.min(100,r.x/g.goal*100)}%`;
  $('distance').textContent=`ROUTE ${Math.min(100,Math.floor(r.x/g.goal*100))}%`;
  const shield=Math.max(0,Math.ceil(r.shieldUntil-g.time)),boost=Math.max(0,Math.ceil(r.boostUntil-g.time));
  $('buffs').textContent=[shield?`SHIELD ${shield}s`:'',boost?`TURBO ${boost}s`:''].filter(Boolean).join(' · ')||`CHECKPOINT ${g.checkpoints.filter(x=>x<=g.checkpoint).length}/${g.checkpoints.length}`;
  $('objective').textContent = r.rescued ? 'PORTAL REACHED!' : r.waiting ? 'BUILD A BRIDGE OR JUMP!' : 'GET E-07 TO THE PORTAL!';
  $('botBubble').hidden = !r.waiting || map || g.phase !== 'running';
  if (r.waiting) {
    const gap=g.nextGap,n=gap?gap.pieces-g.pieceSet(gap,true).size:0;$('botBubble').textContent=n?`Need ${n} more ${n===1?'piece':'pieces'}!`:'Bridge landing…';
    const p = renderer.screenPosition(r.x, r.z), rect = shell.getBoundingClientRect();
    $('botBubble').style.left = `${Math.max(rect.width * .27, Math.min(rect.width * .73, p.x))}px`;
    $('botBubble').style.top = `${Math.max(rect.height * .32, Math.min(rect.height * .52, p.y - rect.width * .15))}px`;
  }
  $('giftShout').hidden = now > shoutUntil || map;
  const next = g.nextEchoEvent;
  $('echoLabel').textContent = next ? `NEXT ECHO IN ${Math.max(0, next.at - g.time).toFixed(1)}s` : 'EVERY GIFT HAPPENS TWICE';
  $('echoSub').textContent = next ? `${next.viewer} · ${EFFECTS[next.type].name}` : 'Your help returns next loop!';
  $('tapValue').textContent = `${state.energy}%`; $('tapFill').style.width = `${state.energy}%`;
  $('tapButton').disabled = !state.host.demo;
  document.querySelectorAll('[data-effect]').forEach(button => button.disabled = !state.host.demo);
  const newMappings = JSON.stringify(state.host.mappings);
  if (newMappings !== mappingKey) { mappingKey = newMappings; document.querySelectorAll('[data-gift]').forEach(label => label.textContent = (state.host.mappings[label.dataset.gift].split(',')[0].trim() || 'GIFT').toUpperCase()); }
  timeline(g);
  const result = !map && (g.phase === 'rewinding' || r.rescued || g.paused);
  $('roundResult').hidden = !result;
  if (result) {
    $('resultIcon').textContent = r.rescued ? '✦' : g.paused ? 'Ⅱ' : '↺';
    $('resultTitle').textContent = r.rescued ? 'RESCUED!' : g.paused ? 'PAUSED' : r.hearts === 0 ? 'TRY AGAIN!' : 'REWIND!';
    $('resultNote').textContent = r.rescued ? 'Your gifts return for the next adventure.' : g.paused ? 'The host will resume the game.' : g.checkpoint>65?`Checkpoint saved! ${g.recording.length} actions return as ghosts.`:`${g.recording.length} actions are coming back as ghosts!`;
    $('resultStars').textContent = r.rescued ? '✦'.repeat(g.lastStars) + '✧'.repeat(3 - g.lastStars) : '';
  }
  if (map) {
    $('mapWorld').textContent = WORLDS[state.host.selectedWorld].name.toUpperCase();
    const seconds = state.transition ? Math.max(1, Math.ceil((state.transition.until - state.serverTime) / 1000)) : null;
    $('warpCount').textContent = seconds ?? '✧'; $('warpNote').textContent = seconds ? 'WARP DRIVE CHARGING' : 'SELECT A WORLD';
    const rect = shell.getBoundingClientRect();
    document.querySelectorAll('.warp-node').forEach((node, index) => {
      const p = renderer.mapPosition(index); node.style.left = `${Math.max(rect.width * .2, Math.min(rect.width * .8, p.x))}px`;
      node.style.top = `${Math.max(rect.height * .25, Math.min(rect.height * .76, p.y))}px`; node.classList.toggle('selected', index === state.host.selectedWorld);
    });
  }
}

WORLDS.forEach((world, index) => {
  const node = document.createElement('button'); node.className = 'warp-node'; node.textContent = `${index + 1} · ${world.name}`; node.style.setProperty('--planet', world.color);
  node.setAttribute('aria-label', `Warp to ${world.name}`); node.onclick = () => send('warp', { world: index }); $('mapNodes').append(node);
});
renderer.onPickWorld = world => send('warp', { world });
document.querySelectorAll('[data-effect]').forEach(button => button.onclick = () => send('effect', { effect: button.dataset.effect }));
$('tapButton').onclick = () => send('likes');
function openHost() { window.open('/host', 'echo-rescue-host', 'width=760,height=900'); }
function fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else shell.requestFullscreen().catch(() => {}); }
function menu(value) { $('gameMenu').hidden = !value; }
$('menuButton').onclick = () => menu(true);
$('continueButton').onclick = () => { if (session.snapshot?.game.paused && session.snapshot?.host.view === 'game') send('pause'); menu(false); };
$('pauseButton').onclick = () => send('pause'); $('mapButton').onclick = () => { send('map', { open: session.snapshot?.host.view !== 'map' }); menu(false); };
$('hostButton').onclick = openHost; $('fullscreenButton').onclick = fullscreen;
$('soundButton').onclick = () => { sound = !sound; $('soundButton').setAttribute('aria-label', sound ? 'Mute game sound' : 'Enable game sound'); if (sound) sfx('shield'); };
function awake() { shell.classList.add('ui-awake'); shell.classList.remove('idle-cursor'); clearTimeout(awakeTimer); awakeTimer = setTimeout(() => { shell.classList.remove('ui-awake'); shell.classList.add('idle-cursor'); }, 2800); }
document.addEventListener('pointermove', awake); awake();
document.addEventListener('keydown', event => {
  if (event.repeat) return;
  if (event.key === 'Escape') menu($('gameMenu').hidden);
  if (capture) return;
  if (event.code === 'Space') { event.preventDefault(); send('pause'); }
  if (event.key.toLowerCase() === 'h') openHost();
  if (event.key.toLowerCase() === 'f') fullscreen();
  if (event.key.toLowerCase() === 'm') send('map', { open: session.snapshot?.host.view !== 'map' });
  if (['1', '2', '3', '4', '5'].includes(event.key)) send('effect', { effect: ['cube', 'heal', 'pulse', 'shield', 'boost'][Number(event.key) - 1] });
});
document.addEventListener('echo-renderer-lost', () => message('Graphics interrupted. Reopen the game window.'));
function frame(now) {
  const dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
  session.frame(now, dt); renderer.draw(session.game, now / 1000, dt);
  if (now - lastUI > 70) { update(now); lastUI = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
