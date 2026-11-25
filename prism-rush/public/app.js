import { connectGame } from './transport.js';
import { ReactorScene } from './scene.js';
import { POWERS, JOKER_POINTS } from './room.js';
import { setAvatar, avatarEl, setPhotosEnabled } from './avatars.js';
import { COLOR_NAMES, levelSpec, worldOf, LEVELS_PER_WORLD } from './levels.js';
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
const GEM = ['#f43878', '#ff8835', '#ffca35', '#42d999', '#31bff5', '#a669f0'];
const short = n => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(Math.floor(n));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function goalChip(goal) {
  const chip = el('div', `goal${goal.have >= goal.target ? ' done' : ''}`), icon = el('span', 'gi');
  if (goal.type === 'collect') { icon.classList.add('gem'); icon.style.background = GEM[goal.color]; chip.title = `Collect ${goal.target} ${COLOR_NAMES[goal.color]} gems`; }
  else if (goal.type === 'ice') { icon.textContent = '❄'; icon.style.background = '#6cc8f5'; chip.title = 'Break every ice layer'; }
  else if (goal.type === 'score') { icon.textContent = '★'; icon.style.background = '#f0a020'; chip.title = 'Reach the target score'; }
  else { icon.textContent = { beam: '⇆', nova: '✺', prism: '◈' }[goal.kind]; icon.style.background = { beam: '#f08a3c', nova: '#e8664a', prism: '#9d6bf0' }[goal.kind]; chip.title = `Create ${goal.target} ${goal.kind}${goal.target > 1 ? 's' : ''}`; }
  const value = goal.type === 'score' ? `${short(goal.have)}/${short(goal.target)}` : `${goal.have}/${goal.target}`;
  chip.append(icon, el('span', 'gv', value)); return chip;
}
let goalSignature = '', lastGoalHave = [];
function renderGoals(goals, target, bump = false) {
  target.replaceChildren(...goals.map((g, i) => { const chip = goalChip(g); if (bump && lastGoalHave[i] !== undefined && g.have > lastGoalHave[i]) chip.classList.add('bump'); return chip; }));
}
// ---------- Roadmap (Candy Crush style winding path) ----------
const NODE_GAP = 108, FOCUS_Y = 560;
const nodeX = k => 270 + Math.sin(k * 1.05) * 150;
let mapOpen = false, mapPhase = -1, mapTimer;
function buildMap(s, focus, tokenAt) {
  const first = Math.max(1, focus - 6), last = focus + 6, top = 140, height = (last - first) * NODE_GAP + 2 * top;
  const yOf = k => top + (last - k) * NODE_GAP, world = worldOf(focus);
  $('roadmap').style.setProperty('--accent', world.accent);
  $('map-world').textContent = `WORLD ${world.index + 1} · ${world.name.toUpperCase()}`;
  const total = Object.values(s.levelStars || {}).reduce((a, b) => a + b, 0);
  $('map-stars').textContent = `${total} ★ collected · ${Object.keys(s.levelStars || {}).length} levels beaten`;
  const points = []; for (let k = first; k <= last; k++) points.push([nodeX(k), yOf(k)]);
  const curve = pts => pts.map((p, i) => { if (!i) return `M${p[0]},${p[1]}`; const a = pts[i - 2] || pts[i - 1], b = pts[i - 1], c = p, d = pts[i + 1] || p; return `C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (d[0] - b[0]) / 6},${c[1] - (d[1] - b[1]) / 6} ${c[0]},${c[1]}`; }).join(' ');
  const svg = $('map-path'); svg.setAttribute('width', 540); svg.setAttribute('height', height); svg.setAttribute('viewBox', `0 0 540 ${height}`);
  const doneUntil = Math.min(last, Math.max(first, s.unlocked)) - first + 1;
  svg.innerHTML = `<path class="road" d="${curve(points)}"/><path class="lane" d="${curve(points)}"/>${doneUntil > 1 ? `<path class="lane done" d="${curve(points.slice(0, doneUntil))}"/>` : ''}`;
  const nodes = $('map-nodes'); nodes.replaceChildren();
  for (let k = first; k <= last; k++) {
    const spec = levelSpec(k), stars = s.levelStars?.[k] || 0;
    const node = el('div', `map-node${k < s.unlocked && stars ? ' done' : ''}${k === s.level.n ? ' current' : ''}${k > s.unlocked ? ' locked' : ''}${spec.hard ? ' hard' : ''}`, String(k));
    node.style.left = `${nodeX(k)}px`; node.style.top = `${yOf(k)}px`;
    node.title = `Level ${k} · ${spec.goals.map(g => g.type === 'collect' ? `${g.target} ${COLOR_NAMES[g.color]}` : g.type === 'ice' ? `${g.target} ice` : g.type === 'score' ? `${format(g.target)} pts` : `${g.target} ${g.kind}`).join(' + ')} · ~${format(spec.par.median)} taps`;
    if (stars) { const row = el('span', 'node-stars'); row.innerHTML = '★'.repeat(stars) + `<span class="off">${'★'.repeat(3 - stars)}</span>`; node.append(row); }
    nodes.append(node);
    const h = s.heroes?.[k];
    for (const [kind, dx] of [['tapper', -46], ['gifter', 46]]) {
      const hero = h?.[kind]; if (!hero) continue;
      const bubble = el('div', `map-hero${kind === 'gifter' ? ' gift' : ''}`); bubble.title = `${kind === 'gifter' ? 'Top gifter' : 'Top tapper'} · ${hero.name}`;
      bubble.style.left = `${nodeX(k) + dx}px`; bubble.style.top = `${yOf(k) + 14}px`; bubble.append(avatarEl(hero.id, s.people?.[hero.id] || { name: hero.name })); nodes.append(bubble);
    }
    if ((k - 1) % LEVELS_PER_WORLD === 0) { const w = worldOf(k), sign = el('div', 'map-sign', `WORLD ${w.index + 1} · ${w.name.toUpperCase()}`); sign.style.top = `${yOf(k) + NODE_GAP / 2}px`; sign.style.background = w.accent; nodes.append(sign); }
  }
  const place = (k, animate) => {
    const scroll = $('map-scroll'), token = $('map-token');
    scroll.style.transition = token.style.transition = animate ? '' : 'none';
    scroll.style.transform = `translateY(${FOCUS_Y - yOf(k)}px)`;
    token.style.left = `${nodeX(k)}px`; token.style.top = `${yOf(k)}px`;
  };
  place(tokenAt, false);
  return place;
}
function showMap(s, animate) {
  const phase = s.phase;
  if (animate) {
    const to = phase.to, place = buildMap(s, to, phase.from);
    clearTimeout(mapTimer); mapTimer = setTimeout(() => place(to, true), 650);
    const spec = levelSpec(to);
    $('map-foot').replaceChildren(document.createTextNode(`Next stop · Level ${to}${spec.hard ? ' ☠' : ''} · 3★ in ≤ ${format(spec.par.three)} taps`));
    const h = phase.heroes;
    if (h && (h.tapper || h.gifter)) {
      const row = el('div', 'map-heroes-foot');
      for (const [kind, label] of [['tapper', 'top tapper'], ['gifter', 'top gifter']]) { const hero = h[kind]; if (!hero) continue; const item = el('span'), ph = el('span', 'mh'); ph.append(avatarEl(hero.id, s.people?.[hero.id] || { name: hero.name })); item.append(ph, document.createTextNode(`${hero.name} · ${label}`)); row.append(item); }
      $('map-foot').append(row);
    }
    [523, 659, 784].forEach((f, i) => tone(f, .16, .035, .7 + i * .12));
  } else {
    buildMap(s, s.level.n, s.level.n);
    $('map-foot').textContent = `You are here · Level ${s.level.n} · ${format(s.level.tapsUsed)} taps so far`;
  }
}
function render(s) {
  const previous = state; state = s; scene?.update(s);
  const L = s.level, playing = L.status === 'playing';
  $('level-number').textContent = L.n; $('hard-tag').hidden = !L.hard;
  $('world-name').textContent = `WORLD ${L.world + 1} · ${L.worldName.toUpperCase()}`;
  $('moves').textContent = format(L.tapsUsed);
  $('moves').parentElement.classList.toggle('free', !playing);
  // Stars are kept by finishing in few taps: 3★ up to par.three taps, 2★ up to par.two.
  const limit = Math.max(1, Math.round(L.par.two * 1.3)), complete = L.status === 'complete';
  $('star-fill').style.width = `${Math.min(1, L.tapsUsed / limit) * 100}%`;
  $('star-3').style.left = `${L.par.three / limit * 100}%`; $('star-2').style.left = `${L.par.two / limit * 100}%`; $('star-1').style.left = '97%';
  $('star-3').classList.toggle('on', L.starsNow >= 3); $('star-2').classList.toggle('on', L.starsNow >= 2); $('star-1').classList.toggle('on', true);
  $('star-3').title = `3 stars: finish in ≤ ${format(L.par.three)} taps`; $('star-2').title = `2 stars: ≤ ${format(L.par.two)} taps`;
  $('par-text').textContent = L.starsNow >= 3 ? `3★ ≤ ${format(L.par.three)} TAPS` : L.starsNow === 2 ? `2★ ≤ ${format(L.par.two)} TAPS` : '1★ · FINISH IT!';
  void complete;
  const signature = `${L.n}:${L.attempt}:${L.goals.map(g => g.have).join(',')}`;
  if (signature !== goalSignature) { const sameLevel = goalSignature.startsWith(`${L.n}:${L.attempt}:`); renderGoals(L.goals, $('goals'), sameLevel); lastGoalHave = L.goals.map(g => g.have); goalSignature = signature; }
  $('team-score').textContent = format(s.score);
  $('taps-received').textContent = format(s.taps.received); $('taps-played').textContent = format(s.taps.played); $('taps-pending').textContent = format(s.taps.pending);
  $('tap-fill').style.width = `${s.taps.received ? s.taps.played / s.taps.received * 100 : 0}%`;
  $('queue-status').textContent = s.queueUnits ? `${format(s.queueUnits)} GIFTS QUEUED` : s.taps.pending ? `${format(s.taps.pending)} TAPS WAITING` : 'TAP TO PLAY';
  const P = s.people || {}, tt = L.topTapper, tg = L.topGifter;
  setAvatar($('top-tapper-photo'), tt?.id, P[tt?.id]); $('top-tapper').textContent = tt?.name || 'Tap to take it'; $('top-tapper-count').textContent = tt ? `${format(tt.value)} taps played this level` : 'every tap = 1 move';
  setAvatar($('top-gifter-photo'), tg?.id, P[tg?.id]); $('top-gifter').textContent = tg?.name || 'Send a gift'; $('top-gifter-count').textContent = tg ? `${format(tg.value)} gift${tg.value > 1 ? 's' : ''} this level` : 'your photo becomes a joker';
  $('turbo').hidden = s.speed <= 1; $('turbo').textContent = `⚡ ${s.speed.toFixed(1)}× TURBO`;
  const analysis = s.analysis;
  const scanned = analysis ? analysis.kind === 'pending' ? 'A WAITING LINE EXPLODES' : analysis.kind === 'tap' ? `RANDOM SWAP OF ${analysis.legal} LEGAL` : analysis.kind === 'move' ? `${analysis.scanned} SWAPS CHECKED${analysis.swaps > 1 ? ` · ${analysis.swaps} AT ONCE` : ` · ${analysis.strong} FOUR+`}` : `${analysis.scanned} TARGETS CHECKED${analysis.count > 1 ? ` · ${analysis.count} METEORS` : ''}` : '';
  const busy = s.active.type !== 'wait';
  $('pilot-label').textContent = busy && analysis ? scanned : s.jokersWaiting ? `${s.jokersWaiting} 🃏 JOKERS WAITING TO DROP` : 'EVERY TAP = 1 MOVE';
  $('pilot-name').textContent = !busy ? 'Waiting for your tap ♡' : s.active.type === 'tap' ? `${s.active.name} · 1 tap = 1 move` : `${s.active.name}${s.active.source === 'host' ? ' · TEST' : ''} · ${POWERS[s.active.type]?.name || ''}${s.active.stepsLeft ? ` · ${s.active.stepsLeft} auto step${s.active.stepsLeft > 1 ? 's' : ''} left` : ''}`;
  setAvatar($('pilot-avatar'), busy ? s.active.userId : null, P[s.active.userId]);
  $('pilot-tag').textContent = busy && analysis ? `+${format(analysis.points)}` : 'TAP!';
  $('pilot-tag').title = 'Exact seeded cascade forecast in points';
  $('plan-kind').textContent = analysis?.kind === 'tap' ? 'RANDOM TAP MOVE' : analysis?.kind === 'move' ? (analysis.swaps > 1 ? `${analysis.swaps}-SWAP COMBO` : 'LEGAL SWAPS') : analysis?.voted ? 'VIEWER COLOR VOTE' : 'POWER TARGETS';
  $('plan-scanned').textContent = analysis ? format(analysis.scanned) : '—';
  $('plan-points').textContent = analysis ? `+${format(analysis.points)}` : '—';
  $('plan-strong').textContent = analysis?.kind === 'move' ? `${analysis.strong} / ${analysis.legal}` : 'POWER';
  $('plan-chain').textContent = analysis ? `${analysis.waves}× / ${analysis.cleared} gems` : '—';
  $('plan-outcome').textContent = s.lastResult ? `${s.lastResult.name}: +${format(s.lastResult.points)} actual · ${s.lastResult.cleared} gems · ${s.lastResult.waves}× chain${s.lastResult.swaps > 1 ? ` · ${s.lastResult.swaps} at once` : ''}` : 'Exact seeded forecast · goals first, then score.';
  $('mode').classList.toggle('on-air', s.live.live);
  $('mode').replaceChildren(Object.assign(document.createElement('i')), document.createTextNode(s.live.live ? 'LIVE' : s.settings.demo ? 'DEMO' : 'LOCAL'));
  $('mode').title = s.live.text;
  $('pause-cover').classList.toggle('show', s.paused); $('pause').textContent = s.paused ? '▶' : 'Ⅱ';
  $('participant-count').textContent = `${s.participants} PLAYERS`;
  const list = $('ranking'); list.replaceChildren();
  for (const [i, p] of s.leaders.entries()) { const li = document.createElement('li'); for (const [tag, value] of [['span', String(i + 1).padStart(2, '0')], ['span', p.name], ['b', format(p.roundScore)]]) li.append(el(tag, '', value)); list.append(li); }
  if (!s.leaders.length) list.append(el('li', 'empty', 'Your name could be here.'));
  const phase = s.phase;
  if (phase.id !== lastPhase) {
    lastPhase = phase.id;
    if (phase.type === 'explode') {
      for (const j of phase.jokers || []) jokerPop(j);
      $('board-message').textContent = `+${format(phase.points)} POINTS${phase.births.length ? ` · ${phase.births[0].special === 'row' || phase.births[0].special === 'column' ? 'BEAM' : phase.births[0].special.toUpperCase()} CREATED` : ''}${phase.iceHit?.length ? ` · ${phase.iceHit.length} ICE` : ''}`;
      tone(230 + Math.min(phase.chain, 12) * 55, .18, .045);
      if (phase.chain >= 2) {
        const callout = $('chain-callout'); callout.querySelector('span').textContent = phase.chain >= 5 ? 'MEGA CASCADE' : 'CASCADE'; callout.querySelector('strong').textContent = `${phase.chain}×`; callout.classList.remove('visible'); void callout.offsetWidth; callout.classList.add('visible');
      }
    } else if (phase.type === 'power') { $('board-message').textContent = `${POWERS[phase.power].name.toUpperCase()}${phase.indices?.length > 1 ? ` ×${phase.indices.length}` : ''} INCOMING`; tone(160, .4, .06); }
    else if (phase.type === 'swap') $('board-message').textContent = phase.swaps?.length > 1 ? `${phase.swaps.length} SWAPS AT ONCE!` : 'MATCH. BURST. REPEAT.';
    else if (phase.type === 'shuffle') $('board-message').textContent = 'REFORGING · NEW MOVES INCOMING';
    else if (phase.type === 'idle') $('board-message').textContent = s.taps.pending || s.queueUnits ? 'MATCH. BURST. REPEAT.' : 'TAP TO PLAY · 1 TAP = 1 MOVE';
    else if (phase.type === 'levelIntro') {
      $('intro-world').textContent = `WORLD ${L.world + 1} · ${L.worldName.toUpperCase()}`; $('intro-level').textContent = L.n; $('intro-hard').hidden = !L.hard;
      $('intro-attempt').textContent = `3★ IN ≤ ${format(L.par.three)} TAPS · 2★ IN ≤ ${format(L.par.two)} TAPS`;
      renderGoals(L.goals, $('intro-goals')); tone(440, .25, .04); tone(660, .3, .04, .18);
    } else if (phase.type === 'levelComplete') {
      const r = phase.result; $('done-world').textContent = `WORLD ${worldOf(r.level).index + 1} · ${r.world.toUpperCase()}`; $('done-level').textContent = r.level;
      $('big-stars').querySelectorAll('i').forEach((star, i) => { star.classList.remove('on'); void star.offsetWidth; star.classList.toggle('on', i < r.stars); });
      $('done-score').textContent = `${format(r.levelScore)} PTS`;
      $('done-finale').textContent = `Finished in ${format(r.tapsUsed)} tap${r.tapsUsed === 1 ? "" : "s"} · 3★ par ${format(r.par.three)} · 2★ par ${format(r.par.two)}`;
      const box = $('done-heroes'); box.replaceChildren();
      for (const [key, label, unit] of [['tapper', '♡ TOP TAPPER', 'taps'], ['mvp', '♛ LEVEL MVP', 'points'], ['gifter', '🎁 TOP GIFTER', 'gifts']]) {
        const h = r.heroes?.[key], card = el('div', `done-hero ${key}`), photo = el('div', 'hp');
        photo.append(avatarEl(h?.id, P[h?.id] || { name: h?.name }));
        card.append(photo, el('span', '', label), el('b', '', h?.name || (key === 'gifter' ? 'No gifts yet' : 'The crew')), el('small', '', h ? `${format(h.value)} ${unit}` : key === 'gifter' ? 'Gift → your photo on the board' : ''));
        box.append(card);
      }
      [523, 659, 784, 1046].forEach((f, i) => tone(f, .3, .045, i * .13));
      confettiRain($('level-complete'));
    }
    if (phase.type === 'roadmap') { showMap(s, true); mapPhase = phase.id; }
  }
  for (const [id, type] of [['level-intro', 'levelIntro'], ['level-complete', 'levelComplete']]) $(id).classList.toggle('show', phase.type === type);
  const showRoadmap = phase.type === 'roadmap' || mapOpen;
  if (mapOpen && phase.type !== 'roadmap' && previous?.phase.type === 'roadmap') showMap(s, false);
  $('roadmap').classList.toggle('show', showRoadmap);
  for (const event of [...s.log].reverse()) if (event.id > lastEvent) { if (['chest', 'warning', 'result', 'joker'].includes(event.type) && lastEvent) showBanner(event.text); lastEvent = Math.max(lastEvent, event.id); }
  if (s.activeTap && s.now - s.activeTap.at < 2000) $('tap-caption').textContent = `${s.activeTap.name} +${s.activeTap.count} tap${s.activeTap.count > 1 ? 's' : ''} → ${s.activeTap.count} move${s.activeTap.count > 1 ? 's' : ''}`;
  else $('tap-caption').textContent = 'Tap the screen to play · gifts drop 🃏 jokers with your photo';
}
// Floating "+500 name" where a joker exploded.
// Board cell centre in the 540 x 960 frame (orthographic camera: 9.1 units = 452 px).
const CELL = { x: i => 8 + 240 + (i % 7 - 3) * 1.25 * 452 / 9.1, y: i => 29 + 226 - (3.5 - Math.floor(i / 7)) * 1.05 * 452 / 9.1 };
function jokerPop(j) {
  const pop = el('div', 'joker-pop', `🃏 +${JOKER_POINTS} ${j.name}`);
  pop.style.left = `${22 + CELL.x(j.index)}px`; pop.style.top = `${269 + CELL.y(j.index)}px`;
  $('game').append(pop); setTimeout(() => pop.remove(), 1400); tone(880, .2, .05); tone(1175, .25, .04, .08);
}
function toggleMap(force) { mapOpen = force ?? !mapOpen; if (mapOpen && state) showMap(state, false); if (state) $('roadmap').classList.toggle('show', mapOpen || state.phase.type === 'roadmap'); }
function frame(time, fps, ratio, calls) {
  if (state) { const target = state.level.score; if (target < displayScore) displayScore = target; displayScore += (target - displayScore) * .14; if (target - displayScore < 1) displayScore = target; $('score').textContent = format(displayScore); }
  if (time > bannerUntil) $('banner').classList.remove('show');
  if (time - lastUiTime > 1000) { $('fps').textContent = fps; $('quality-label').textContent = `${ratio.toFixed(1)}× RES · ${calls} DRAWS`; lastUiTime = time; }
}
// Celebration confetti over the level-complete card (the 3D board is blurred behind it).
function confettiRain(host) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  host.querySelector('.confetti')?.remove();
  const layer = el('div', 'confetti'), colors = ['#f43878', '#ff8835', '#ffca35', '#42d999', '#31bff5', '#a669f0', '#fff3c4'];
  for (let i = 0; i < 90; i++) {
    const bit = document.createElement('i'), r = Math.random;
    bit.style.cssText = `--x:${(r() * 100).toFixed(1)}%;--c:${colors[i % colors.length]};--d:${(r() * 1.8).toFixed(2)}s;--t:${(2.4 + r() * 2.2).toFixed(2)}s;--sway:${(r() * 120 - 60).toFixed(0)}px;--spin:${(r() * 1440 - 720).toFixed(0)}deg;--w:${(6 + r() * 6).toFixed(0)}px`;
    if (i % 5 === 0) bit.className = 'round';
    layer.append(bit);
  }
  host.prepend(layer); setTimeout(() => layer.remove(), 7000);
}
try { scene = new ReactorScene($('viewport'), frame); }
catch (e) { $('error-cover').hidden = false; console.error('WebGL startup:', e); }
transport = await connectGame(render, connected => { $('disconnect').hidden = connected; });
$('environment').textContent = transport.local ? 'LOCAL EDITION' : 'HOSTED DEMO'; setPhotosEnabled(transport.local);
$('demo-notice').textContent = transport.local ? 'Manual test actions use the name above. The board waits for input. H opens the TikTok relay controls.' : 'Hosted demo · saved in this browser. To connect TikTok, use START.bat in the local edition.';
async function send(command) { try { $('test-error').textContent = ''; await transport.send({ ...command, name: $('viewer-name').value || 'Host test' }); } catch (e) { $('test-error').textContent = e.message; showBanner(e.message); } }
document.querySelectorAll('[data-power]').forEach(button => button.addEventListener('click', () => send({ action: 'power', power: button.dataset.power })));
document.querySelector('[data-command="tap"]').addEventListener('click', () => send({ action: 'tap', count: 1 }));
function tap(event) {
  pendingTaps++; scene?.tap(event?.clientX,event?.clientY);
  $('tap-surface').classList.add('is-tapping'); clearTimeout(tapPulse); tapPulse = setTimeout(() => $('tap-surface').classList.remove('is-tapping'),150);
  if (!tapTimer) tapTimer = setTimeout(() => { const count = pendingTaps; pendingTaps = 0; tapTimer = null; send({ action: 'tap', count }); },120);
}
$('tap-surface').addEventListener('click', () => tap());
$('viewport').setAttribute('role','button'); $('viewport').setAttribute('tabindex','0'); $('viewport').setAttribute('aria-label','Tap the gem board: every tap plays one move');
$('viewport').addEventListener('pointerup', e => { if (e.button === 0) tap(e); });
$('viewport').addEventListener('keydown', e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); tap(); } });
$('pause').addEventListener('click', () => send({ action: 'pause' }));
$('map-button').addEventListener('click', () => toggleMap());
$('level-label').addEventListener('click', () => toggleMap());
$('roadmap').addEventListener('click', () => { if (mapOpen) toggleMap(false); });
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => send({ action: button.dataset.level })));
async function fullscreen() { try { if (document.fullscreenElement) { await document.exitFullscreen(); document.body.classList.remove('capture'); if (params.has('capture')) document.body.classList.add('capture'); } else { document.body.classList.add('capture'); await document.documentElement.requestFullscreen(); } } catch { document.body.classList.toggle('capture'); } fit(); }
$('fullscreen').addEventListener('click', fullscreen);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !params.has('capture')) document.body.classList.remove('capture'); fit(); });
$('sound').addEventListener('click', async () => { soundEnabled = !soundEnabled; $('sound').style.color = soundEnabled ? '#a3ffce' : '#c4b3dc'; $('sound').ariaLabel = soundEnabled ? 'Mute sound' : 'Enable sound'; if (soundEnabled) { audio ||= new AudioContext(); await audio.resume(); tone(550, .15); } });
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
  if (e.target.tagName === 'BUTTON' && ['Space','Enter'].includes(e.code)) return;
  if (e.key.toLowerCase() === 'f') fullscreen();
  if (e.key.toLowerCase() === 'm') toggleMap();
  if (e.key === 'Escape' && mapOpen) toggleMap(false);
  if (e.key.toLowerCase() === 'h') window.open('/host.html', 'prism-host', 'width=1000,height=850');
  if (e.code === 'Space') { e.preventDefault(); send({ action: 'pause' }); }
  if (['1', '2', '3', '4'].includes(e.key)) send({ action: 'power', power: ['rose', 'meteor', 'prism', 'supernova'][Number(e.key) - 1] });
  if (e.key.toLowerCase() === 't') send({ action: 'tap', count: 1 });
});
