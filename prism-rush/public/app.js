import { connectGame } from './transport.js';
import { ReactorScene } from './scene.js';
import { POWERS } from './room.js';
const $ = id => document.getElementById(id);
const format = n => Math.floor(n).toLocaleString('en-US');
const params = new URLSearchParams(location.search);
if (params.has('capture') || location.pathname === '/capture') document.body.classList.add('capture');
const fit = () => { $('game').style.setProperty('--scale', document.querySelector('.cabinet').clientWidth / 540); };
new ResizeObserver(fit).observe(document.querySelector('.cabinet')); fit();
let state, transport, scene, displayScore = 0, lastPhase = -1, lastEvent = 0, bannerUntil = 0, soundEnabled = false, audio, lastUiTime = 0;
let pendingTaps = 0, tapTimer, tapPulse;
function tone(frequency, duration = .12, volume = .045, offset = 0) {
  if (!soundEnabled) return;
  try {
    audio ||= new AudioContext(); const osc = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + offset;
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, start); osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, start + duration);
    gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(.0001, start + duration); osc.connect(gain).connect(audio.destination); osc.start(start); osc.stop(start + duration + .01);
  } catch {}
}
function showBanner(text) { $('banner').textContent = text; $('banner').classList.add('show'); bannerUntil = performance.now() + 3200; }
function render(s) {
  state = s; scene?.update(s);
  $('round').textContent = String(s.round).padStart(2, '0');
  const seconds = Math.ceil(s.remaining); $('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('best').replaceChildren(document.createTextNode(String(Math.max(1, s.bestChain))), Object.assign(document.createElement('span'), { textContent: '×' }));
  $('cleared').textContent = format(s.totalCleared);
  $('taps').textContent = s.tapCharge; $('tap-fill').style.width = `${s.tapCharge}%`;
  $('chest-number').textContent = String(s.chests + 1).padStart(2, '0'); $('chest-count').textContent = s.chest; $('chest-fill').style.width = `${s.chest / 5}%`;
  $('queue-status').textContent = s.queueUnits ? `${format(s.queueUnits)} POWERS QUEUED` : 'AUTO PLAY';
  const analysis = s.analysis;
  $('pilot-label').textContent = analysis ? analysis.kind === 'move' ? `${analysis.scanned} SWAPS CHECKED · ${analysis.strong} FOUR+ OPTIONS` : `${analysis.scanned} TARGETS CHECKED · ${s.active.label.toUpperCase()}` : 'REACTOR AUTOPILOT';
  $('pilot-name').textContent = s.active.type === 'auto' ? 'Finding the next cascade' : `${s.active.name}${s.active.source === 'host' ? ' · TEST' : ''}`;
  $('pilot-avatar').textContent = POWERS[s.active.type]?.icon || '↗';
  $('pilot-tag').textContent = analysis ? `+${format(analysis.points)}` : 'AUTO';
  $('pilot-tag').title = 'Exact seeded cascade forecast in points';
  $('plan-kind').textContent = analysis?.kind === 'move' ? 'LEGAL SWAPS' : analysis?.voted ? 'VIEWER COLOR VOTE' : 'POWER TARGETS';
  $('plan-scanned').textContent = analysis ? format(analysis.scanned) : '—';
  $('plan-points').textContent = analysis ? `+${format(analysis.points)}` : '—';
  $('plan-strong').textContent = analysis?.kind === 'move' ? `${analysis.strong} / ${analysis.legal}` : 'POWER';
  $('plan-chain').textContent = analysis ? `${analysis.waves}× / ${analysis.cleared} gems` : '—';
  $('plan-outcome').textContent = s.lastResult ? `${s.lastResult.name}: +${format(s.lastResult.points)} actual · ${s.lastResult.cleared} gems · ${s.lastResult.waves}× chain` : 'Exact seeded forecast · score + power creation.';
  $('mode').classList.toggle('on-air', s.live.live);
  $('mode').replaceChildren(Object.assign(document.createElement('i')), document.createTextNode(s.live.live ? 'LIVE' : s.settings.demo ? 'DEMO' : 'LOCAL'));
  $('mode').title = s.live.text;
  $('pause-cover').classList.toggle('show', s.paused); $('pause').textContent = s.paused ? '▶' : 'Ⅱ';
  $('leader').textContent = s.leaders[0]?.name || 'Be the first';
  $('leader-score').textContent = s.leaders[0] ? `${format(s.leaders[0].roundScore)} points` : 'Your cascade. Your crown.';
  $('participant-count').textContent = `${s.participants} PLAYERS`;
  const list = $('ranking'); list.replaceChildren();
  for (const [i, p] of s.leaders.entries()) { const li = document.createElement('li'); for (const [tag, value] of [['span', String(i + 1).padStart(2, '0')], ['span', p.name], ['b', format(p.roundScore)]]) { const el = document.createElement(tag); el.textContent = value; li.append(el); } list.append(li); }
  if (!s.leaders.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Your name could be here.'; list.append(li); }
  const phase = s.phase;
  if (phase.id !== lastPhase) {
    lastPhase = phase.id;
    if (phase.type === 'explode') {
      $('board-message').textContent = `+${format(phase.points)} POINTS${phase.births.length ? ` · ${phase.births[0].special.toUpperCase()} CREATED` : ''}`;
      tone(230 + Math.min(phase.chain, 12) * 55, .18, .045);
      if (phase.chain >= 2) {
        const callout = $('chain-callout'); callout.querySelector('span').textContent = phase.chain >= 5 ? 'MEGA CASCADE' : 'CASCADE'; callout.querySelector('strong').textContent = `${phase.chain}×`; callout.classList.remove('visible'); void callout.offsetWidth; callout.classList.add('visible');
      }
    } else if (phase.type === 'power') { $('board-message').textContent = `${POWERS[phase.power].name.toUpperCase()} INCOMING`; tone(160, .4, .06); }
    else if (phase.type === 'shuffle') $('board-message').textContent = 'REFORGING · NEW MOVES INCOMING';
    else if (phase.type === 'idle') $('board-message').textContent = 'MATCH. BURST. REPEAT.';
    if (phase.type === 'winner') { $('winner-name').textContent = phase.winner.name; $('winner-points').textContent = `${format(phase.winner.score)} PTS`; $('winner-badge').textContent = phase.winner.badge; [440, 554, 659, 880].forEach((f, i) => tone(f, .3, .04, i * .13)); }
  }
  $('winner').classList.toggle('show', phase.type === 'winner');
  for (const event of [...s.log].reverse()) if (event.id > lastEvent) { if (['chest', 'warning', 'result'].includes(event.type)) showBanner(event.text); lastEvent = Math.max(lastEvent, event.id); }
  if (s.activeTap && s.now - s.activeTap.at < 2000) $('tap-caption').textContent = `${s.activeTap.name} is charging the next smart move`;
  else $('tap-caption').textContent = 'Tap the board · 100 taps → your best move';
}
function frame(time, fps, ratio, calls) {
  if (state) { displayScore += (state.score - displayScore) * .14; if (state.score - displayScore < 1) displayScore = state.score; const text = format(displayScore); $('score').textContent = text; $('score').style.fontSize = text.length > 12 ? '28px' : text.length > 10 ? '34px' : '42px'; }
  if (time > bannerUntil) $('banner').classList.remove('show');
  if (time - lastUiTime > 1000) { $('fps').textContent = fps; $('quality-label').textContent = `${ratio.toFixed(1)}× RES · ${calls} DRAWS`; lastUiTime = time; }
}
try { scene = new ReactorScene($('viewport'), frame); }
catch (e) { $('error-cover').hidden = false; console.error('WebGL startup:', e); }
transport = await connectGame(render, connected => { $('disconnect').hidden = connected; });
$('environment').textContent = transport.local ? 'LOCAL EDITION' : 'HOSTED DEMO';
$('demo-notice').textContent = transport.local ? 'Test actions use the name above. Demo viewers are labeled. H opens the TikTok relay controls.' : 'Hosted demo · saved in this browser. To connect TikTok, use START.bat in the local edition.';
async function send(command) { try { $('test-error').textContent = ''; await transport.send({ ...command, name: $('viewer-name').value || 'Host test' }); } catch (e) { $('test-error').textContent = e.message; showBanner(e.message); } }
document.querySelectorAll('[data-power]').forEach(button => button.addEventListener('click', () => send({ action: 'power', power: button.dataset.power })));
document.querySelector('[data-command="tap"]').addEventListener('click', () => send({ action: 'tap', count: 25 }));
function tap(event) {
  pendingTaps++; scene?.tap(event?.clientX,event?.clientY);
  $('tap-surface').classList.add('is-tapping'); clearTimeout(tapPulse); tapPulse = setTimeout(() => $('tap-surface').classList.remove('is-tapping'),150);
  if (!tapTimer) tapTimer = setTimeout(() => { const count = pendingTaps; pendingTaps = 0; tapTimer = null; send({ action: 'tap', count }); },120);
}
$('tap-surface').addEventListener('click', () => tap());
$('viewport').setAttribute('role','button'); $('viewport').setAttribute('tabindex','0'); $('viewport').setAttribute('aria-label','Tap the gem board to charge a smart move');
$('viewport').addEventListener('pointerup', e => { if (e.button === 0) tap(e); });
$('viewport').addEventListener('keydown', e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); tap(); } });
$('pause').addEventListener('click', () => send({ action: 'pause' }));
async function fullscreen() { try { if (document.fullscreenElement) { await document.exitFullscreen(); document.body.classList.remove('capture'); if (params.has('capture')) document.body.classList.add('capture'); } else { document.body.classList.add('capture'); await document.documentElement.requestFullscreen(); } } catch { document.body.classList.toggle('capture'); } fit(); }
$('fullscreen').addEventListener('click', fullscreen);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !params.has('capture')) document.body.classList.remove('capture'); fit(); });
$('sound').addEventListener('click', async () => { soundEnabled = !soundEnabled; $('sound').style.color = soundEnabled ? '#a3ffce' : '#c4b3dc'; $('sound').ariaLabel = soundEnabled ? 'Mute sound' : 'Enable sound'; if (soundEnabled) { audio ||= new AudioContext(); await audio.resume(); tone(550, .15); } });
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
  if (e.target.tagName === 'BUTTON' && ['Space','Enter'].includes(e.code)) return;
  if (e.key.toLowerCase() === 'f') fullscreen();
  if (e.key.toLowerCase() === 'h') window.open('/host.html', 'prism-host', 'width=1000,height=850');
  if (e.code === 'Space') { e.preventDefault(); send({ action: 'pause' }); }
  if (['1', '2', '3', '4'].includes(e.key)) send({ action: 'power', power: ['rose', 'meteor', 'prism', 'supernova'][Number(e.key) - 1] });
  if (e.key.toLowerCase() === 't') send({ action: 'tap', count: 25 });
});
