import { STORAGE_KEY, CARS, COLORS, CATEGORIES, GIFTS, newState, restoreState, stats, carDefinition, installPart, buyCar, receiveGift, saveBuild, newRun, advanceRun, rewardRun, partRequirements, RACES, raceDefinition, reputation } from './model.js';
import { initExpansion } from './expansion.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const fmt = value => Math.round(value).toLocaleString('en-US');
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const overlay = new URLSearchParams(location.search).has('overlay');
if (overlay) document.body.classList.add('overlay-mode');
let state = newState();
try { state = restoreState(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { /* A new garage also handles invalid or unavailable browser storage. */ }
let category = 'wheels', scene, activeRun = null, runProject = null, runProjectId = null, boostHeld = false, spaceBoost = false, soundEnabled = false, toastTimer, noticeTimer, savingAvailable = true, oldBest = null;
let channel, expansion;
try { channel = new BroadcastChannel('dream-garage'); } catch { /* Local storage events still synchronize completed changes. */ }
const project = () => state.projects[state.active];

function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3300); }
function notice(message) { $('#part-notice').textContent = message; $('#part-notice').classList.add('show'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#part-notice').classList.remove('show'), 2100); }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); savingAvailable = true; }
  catch { savingAvailable = false; }
  channel?.postMessage({ type: 'state', state });
  $('#save-status').textContent = savingAvailable ? 'Garage saved on this browser' : 'Storage unavailable · keep this tab open';
}
function commit({ rebuild = false } = {}) { persist(); render(); if (rebuild) scene?.setProject(project()); }
function animatedWallet() { const wallet = $('.wallet'); wallet.classList.remove('changed'); requestAnimationFrame(() => wallet.classList.add('changed')); }
function goalDetails() { const cat = CATEGORIES.find(c => c.id === state.goal.category); return { cat, item: cat.items[state.goal.level], installed: project().parts[cat.id] === state.goal.level, owned: project().owned[cat.id].includes(state.goal.level) }; }
function nextGoal() {
  const p = project(), currentCat = CATEGORIES.find(c => c.id === state.goal.category);
  const next = currentCat.items.findIndex((_, index) => index > p.parts[currentCat.id] && !p.owned[currentCat.id].includes(index));
  if (next > 0) { state.goal.level = next; return; }
  for (const cat of CATEGORIES) { const level = cat.items.findIndex((_, index) => index > 0 && !p.owned[cat.id].includes(index)); if (level > 0) { state.goal = { category: cat.id, level }; return; } }
}
function tryAutoInstall() {
  if (!state.autoInstall || activeRun || overlay) return;
  const goal = goalDetails();
  if (goal.installed) { nextGoal(); return; }
  const result = installPart(state, state.goal.category, state.goal.level);
  if (result.ok) { notice(`AUTO INSTALLED / ${result.item.name}`); nextGoal(); scene?.setProject(project()); }
}

function render() {
  const p = project(), def = carDefinition(p), s = stats(p);
  $('#credits').textContent = fmt(state.credits); $('#collection-count').textContent = state.collection.length;
  $('#car-brand').textContent = def.brand; $('#car-name').textContent = def.name; $('#car-meta').textContent = `${def.year} / ${def.type.toLowerCase()}`;
  $('#car-drive').textContent = def.drive; $('#car-class').textContent = s.hp > 470 ? 'S' : s.hp > 350 ? 'A' : s.hp > 260 ? 'B' : 'C';
  $('#car-name').title = def.name; $('#horsepower').textContent = s.hp; $('#weight').textContent = fmt(s.mass); $('#project-value').textContent = `₡ ${fmt(s.value)}`;
  const completed = CATEGORIES.filter(c => p.parts[c.id] > 0).length;
  $('#build-percent').textContent = `${completed} / ${CATEGORIES.length}`; $('#build-bar').style.width = `${completed / CATEGORIES.length * 100}%`;
  $('#build-status').textContent = completed >= 8 ? 'SIGNATURE BUILD' : 'STREET BUILD';
  $('.build-progress small').textContent = `${CATEGORIES.length} categories. Find your balance of power, grip, and style.`;
  $('#build-number').textContent = String(CARS.findIndex(c => c.id === p.carId) + 1).padStart(3, '0');
  $('.build-panel>.section-kicker>span').textContent = String(CARS.findIndex(c => c.id === p.carId) + 1).padStart(2, '0');
  const brakingDistance = (100 / 3.6) ** 2 / (2 * 9.81 * .8 * s.braking * Math.min(s.grip, 1.5));
  const bars = [ ['Power', Math.min(100, s.hp / 6), `${s.hp} hp`], ['Traction', Math.min(100, s.grip * 52), `${Math.round(s.grip * 100)}%`], ['Stability', Math.min(100, s.stability), `${Math.round(s.stability)} / 100`], ['Brakes / est. 100–0', Math.min(100, s.braking * 50), `${brakingDistance.toFixed(1)} m`] ];
  $('#stat-bars').innerHTML = bars.map(([name, value, label]) => `<div class="stat-line"><div><span>${name}</span><b>${label}</b></div><div class="segmented-bar">${Array.from({ length: 16 }, (_, i) => `<i class="${i < value / 100 * 16 ? 'filled' : ''}"></i>`).join('')}</div></div>`).join('');
  const installed = CATEGORIES.filter(c => p.parts[c.id] > 0);
  $('#installed-summary').innerHTML = installed.length ? installed.slice(-3).map(c => `<div class="installed-line">${icon('check')} ${esc(c.items[p.parts[c.id]].name)}</div>`).join('') : `<div class="installed-line">${icon('tool')}<span>A blank canvas. Make your first move.</span></div>`;
  $('#test-run').disabled = !!activeRun || !scene; $('#save-build').disabled = !!activeRun; $('#switch-car').disabled = !!activeRun;
  renderShop(); renderCommunity();
  $('#overlay-model').textContent = def.name.toUpperCase(); $('#overlay-hp').innerHTML = `${s.hp} <small>HP</small>`;
  $('#overlay-goal').textContent = `NEXT: ${goalDetails().item.name.toUpperCase()}`;
  expansion?.render();
}
function renderShop() {
  const p = project(), cat = CATEGORIES.find(c => c.id === category);
  $('#category-tabs').innerHTML = CATEGORIES.map(c => `<button class="category-tab ${category === c.id ? 'active' : ''}" role="tab" id="tab-${c.id}" aria-controls="parts-grid" aria-selected="${category === c.id}" tabindex="${category === c.id ? 0 : -1}" data-category="${c.id}">${icon(c.icon)}${c.short}</button>`).join('');
  $('#parts-grid').setAttribute('aria-labelledby', `tab-${category}`);
  $('#category-description').textContent = cat.description; $('#category-level').textContent = `INSTALLED / ${cat.items[p.parts[category]].spec}`;
  $('#paint-colors').hidden = category !== 'paint';
  if (category === 'paint') $('#paint-colors').innerHTML = COLORS.map(c => `<button class="color-swatch ${c.hex === p.color ? 'selected' : ''}" style="--swatch:${c.hex}" aria-label="Paint ${c.name}" aria-pressed="${c.hex === p.color}" title="${c.name}" data-color="${c.hex}" ${activeRun ? 'disabled' : ''}></button>`).join('') + `<span>${esc(COLORS.find(c => c.hex === p.color)?.name || 'Original color')} · colors included with any purchased finish</span>`;
  $('#parts-grid').innerHTML = cat.items.map((item, level) => {
    const installed = p.parts[category] === level, owned = p.owned[category].includes(level), affordable = state.credits >= item.cost;
    const missing = partRequirements(p, category, level);
    const preview = { ...p, parts: { ...p.parts, [category]: level } }, before = stats(p), after = stats(preview);
    const changes = [after.hp !== before.hp ? `${after.hp > before.hp ? '+' : ''}${after.hp - before.hp} HP` : '', Math.abs(after.grip - before.grip) > .001 ? `${after.grip > before.grip ? '+' : ''}${Math.round((after.grip - before.grip) * 100)}% GRIP` : '', after.mass !== before.mass ? `${after.mass > before.mass ? '+' : ''}${after.mass - before.mass} KG` : ''].filter(Boolean).join(' / ');
    return `<article class="part-card ${installed ? 'installed' : ''} tier-${level}"><span class="part-tag">${installed ? icon('check') + ' INSTALLED' : owned ? 'OWNED / READY TO FIT' : ['OEM / ORIGINAL', 'STREET / STAGE 01', 'PRO / STAGE 02', 'ELITE / STAGE 03'][level]}</span><div class="part-art"><img src="./assets/part-${category}.png" alt="${esc(cat.label)} component" loading="lazy" style="--tier:${level}"></div><h3>${esc(item.name)}</h3><p>${esc(item.detail)}</p><span class="part-delta">${installed ? item.spec : changes || item.spec}</span>${missing.length ? `<small class="part-requires">REQUIRES ${esc(missing.map(r => r.name).join(' + '))}</small>` : ''}<div class="part-price"><span>${owned ? level === 0 ? 'Included' : 'Owned' : `₡ ${fmt(item.cost)}`}</span>${level > 0 && !installed ? `<button class="goal-mini" data-goal="${level}" aria-label="Set ${esc(item.name)} as community goal" title="Set community goal" ${activeRun ? 'disabled' : ''}>${icon('target')}</button>` : ''}</div><button class="install-button" data-install="${level}" ${installed || activeRun ? 'disabled' : ''} aria-label="${installed ? 'Installed' : owned ? 'Fit' : 'Buy'} ${esc(item.name)}">${installed ? 'CURRENT SETUP' : missing.length ? 'CHECK REQUIREMENTS' : owned ? 'FIT PART' : affordable ? 'BUY & INSTALL' : 'FUND THIS PART'}${icon(installed ? 'check' : affordable || owned ? 'arrow' : 'target')}</button></article>`;
  }).join('');
}
function renderCommunity() {
  const { cat, item, installed, owned } = goalDetails();
  const cost = owned ? 0 : item.cost, funded = Math.min(state.credits, cost), percent = cost ? Math.min(100, state.credits / cost * 100) : 100;
  $('#goal-name').textContent = item.name; $('#goal-spec').textContent = item.spec; $('.goal-icon').innerHTML = icon(cat.icon);
  $('#goal-funded').textContent = fmt(funded); $('#goal-cost').textContent = fmt(cost); $('#goal-percent').textContent = `${Math.floor(percent)}%`; $('#goal-bar').style.width = `${percent}%`;
  $('#install-goal').innerHTML = `${installed ? 'ALREADY INSTALLED' : owned ? 'FIT OWNED UPGRADE' : state.credits >= cost ? 'INSTALL UPGRADE' : `NEEDS ₡ ${fmt(cost - state.credits)} MORE`} ${icon(installed ? 'check' : 'arrow')}`;
  $('#install-goal').disabled = installed || state.credits < cost || !!activeRun;
  const missing = partRequirements(project(), cat.id, state.goal.level);
  if (missing.length) { $('#install-goal').textContent = 'SUPPORTING PARTS REQUIRED'; $('#install-goal').disabled = true; $('#goal-spec').textContent = `Needs ${missing.map(r => r.name).join(' + ')}`; }
  $('#auto-install').checked = state.autoInstall; $('#auto-install').disabled = !!activeRun;
  $('#gift-count').textContent = `${fmt(state.totalGifts)} GIFTS`;
  $('#activity-feed').innerHTML = state.feed.length ? state.feed.slice(0, 8).map(f => `<div class="feed-item"><span class="feed-avatar">${icon({ gift: 'spark', part: 'tool', run: 'flag', save: 'save' }[f.kind])}</span><div><p>${esc(f.text)}</p><small>${f.kind === 'gift' ? 'SIMULATED GIFT' : f.kind === 'run' ? 'TEST TRACK' : f.kind === 'part' ? 'PART INSTALLED' : 'GARAGE UPDATE'}</small></div></div>`).join('') : '<p class="feed-empty">The workshop is quiet.<br>Send the first test gift or install a part.</p>';
  $('#contributors').innerHTML = state.contributors.length ? state.contributors.slice(0, 3).map((c, i) => `<div class="contributor"><span class="rank">0${i + 1}</span><span class="feed-avatar">${esc(c.name.slice(0, 2).toUpperCase())}</span><span>${esc(c.name)}</span><b>₡ ${fmt(c.credits)}</b></div>`).join('') : '<p class="feed-empty" style="margin-top:12px">Every build starts with a crew.</p>';
}
$('#gift-buttons').innerHTML = GIFTS.map(g => `<button class="gift-button" style="--gift-color:${g.color}" data-gift="${g.id}" aria-label="Simulate ${g.name} gift, add ${g.value} credits">${icon(g.icon)}<strong>${g.name}</strong><span>+${fmt(g.value)} ₡</span></button>`).join('');
$('#gift-buttons').addEventListener('click', event => {
  const button = event.target.closest('[data-gift]'); if (!button || overlay) return;
  const gift = receiveGift(state, button.dataset.gift, $('#viewer-name').value);
  if (gift) { tryAutoInstall(); commit(); animatedWallet(); toast(`${gift.name} received · +${fmt(gift.value)} workshop credits`); }
});
$('#category-tabs').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (button) { category = button.dataset.category; renderShop(); $(`#tab-${category}`).focus({ preventScroll: true }); } });
$('#category-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const index = CATEGORIES.findIndex(c => c.id === category);
  category = CATEGORIES[event.key === 'Home' ? 0 : event.key === 'End' ? CATEGORIES.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + CATEGORIES.length) % CATEGORIES.length].id;
  renderShop(); $(`#tab-${category}`).focus({ preventScroll: true });
});
function install(categoryId, level) {
  if (activeRun || overlay) return;
  const result = installPart(state, categoryId, level);
  if (!result.ok) { toast(result.reason); return; }
  if (state.goal.category === categoryId && state.goal.level === level) nextGoal();
  commit({ rebuild: true }); notice(`${result.item.name.toUpperCase()} / INSTALLED`);
  if (['turbo','ecu','cooling'].includes(categoryId)) { scene?.setView('engine'); updateViewButtons('engine'); }
}
function setGoal(level) { state.goal = { category, level }; tryAutoInstall(); commit(); toast(`Community goal: ${goalDetails().item.name}`); }
$('#parts-grid').addEventListener('click', event => {
  const goal = event.target.closest('[data-goal]'); if (goal && !activeRun) { setGoal(Number(goal.dataset.goal)); return; }
  const button = event.target.closest('[data-install]'); if (!button || activeRun) return;
  const level = Number(button.dataset.install), item = CATEGORIES.find(c => c.id === category).items[level];
  if (partRequirements(project(), category, level).length) { expansion?.showRequirements(category, level); return; }
  if (!project().owned[category].includes(level) && state.credits < item.cost) setGoal(level);
  else install(category, level);
});
$('#paint-colors').addEventListener('click', event => {
  const button = event.target.closest('[data-color]'); if (!button || activeRun || overlay) return;
  if (project().parts.paint === 0) { const result = installPart(state, 'paint', 1); if (!result.ok) { toast(result.reason); return; } }
  project().color = button.dataset.color; commit({ rebuild: true }); notice('NEW COLOR / NEW IDENTITY');
});
$('#install-goal').addEventListener('click', () => install(state.goal.category, state.goal.level));
$('#auto-install').addEventListener('change', event => { state.autoInstall = event.target.checked; tryAutoInstall(); commit(); });
function updateViewButtons(view) { $$('.view-button').forEach(b => b.classList.toggle('active', b.dataset.view === view)); }
$$('.view-button').forEach(button => button.addEventListener('click', () => { scene?.setView(button.dataset.view); updateViewButtons(button.dataset.view); }));
$('#auto-rotate').addEventListener('click', () => { if (scene) { scene.autoRotate = !scene.autoRotate; $('#auto-rotate').setAttribute('aria-pressed', scene.autoRotate); } });
$('#stream-view').addEventListener('click', () => { const url = new URL(location.href); url.searchParams.set('overlay', '1'); window.open(url.href, '_blank', 'noopener'); });

function miniCar(p) {
  const muscle = p.carId === 'atlas', exotic = p.carId === 'vanta';
  return `<div class="mini-car" style="--car-color:${p.color}"><svg viewBox="0 0 290 130" aria-hidden="true"><ellipse cx="146" cy="103" rx="125" ry="8" fill="#10170e"/><path d="M22 86 29 65 81 58 ${exotic ? '107 39 183 37 221 58' : muscle ? '111 32 174 32 211 59' : '108 33 174 34 215 60'} 262 65 270 90 248 94a24 24 0 0 0-48 0H89a24 24 0 0 0-48 0L22 94Z" fill="currentColor"/><path d="m91 58 22-20h56l34 22Z" fill="#304441"/><path d="m144 38 1 22" stroke="#71866a" stroke-width="4"/><path d="m26 75 29-2m181 0 27 3" stroke="#e7edd5" stroke-width="5"/><path d="M89 79h109" stroke="#273323" stroke-width="2"/><g fill="#111a13" stroke="#79846d" stroke-width="4"><circle cx="65" cy="94" r="20"/><circle cx="224" cy="94" r="20"/></g><g fill="#8e9d82"><circle cx="65" cy="94" r="10"/><circle cx="224" cy="94" r="10"/></g>${p.parts.aero ? '<path d="M249 57V39h27v5h-21v13" fill="#273423"/>' : ''}</svg></div>`;
}
function modal(content) { expansion?.beforeModal(); $('#modal-content').innerHTML = `<div class="modal-inner">${content}</div>`; if (!$('#modal').open) $('#modal').showModal(); }
const closeButton = `<button class="close-modal" data-close aria-label="Close dialog">${icon('close')}</button>`;
function showroom() {
  if (activeRun || overlay) return;
  modal(`<div class="modal-heading"><div><span class="eyebrow">THE DREAM COLLECTION</span><h2>A garage worth building.</h2><p>Keep your projects. Start something new. Every car has a story.</p></div>${closeButton}</div><div class="car-grid">${CARS.map(def => {
    const owned = Object.hasOwn(state.projects, def.id), selected = state.active === def.id;
    const p = state.projects[def.id] || { carId: def.id, color: def.color, parts: { aero: 0 } };
    return `<article class="car-option">${miniCar(p)}<span class="eyebrow">${def.year} / ${def.drive}</span><h3>${def.name}</h3><p>${def.type}<br>${def.hp} HP STOCK · ${fmt(def.mass)} KG</p><button class="button ${selected ? 'secondary' : 'primary'}" data-car="${def.id}" ${selected ? 'disabled' : ''}>${selected ? 'CURRENT PROJECT' : owned ? 'OPEN PROJECT' : `BUY PROJECT / ₡ ${fmt(def.price)}`}</button></article>`;
  }).join('')}</div><h3 class="collection-heading">COMMUNITY BUILDS <span style="color:#9fb889">/ ${state.collection.length}</span></h3>${state.collection.length ? `<div class="collection-list">${[...state.collection].reverse().map((build, index) => `<article class="saved-build"><span class="build-color" style="--build-color:${build.project.color}"></span><div><h3>${esc(build.name)}</h3><p>${esc(carDefinition(build.project).name)} / ${stats(build.project).hp} HP<br>${build.project.best ? `${build.project.best.toFixed(2)} s / 400 m` : 'Not yet tested'}</p><small>${esc(build.contributors.length ? `Built with ${build.contributors.map(c => c.name).join(', ')}` : 'Built by the host')}</small></div><button class="text-button" data-build="${state.collection.length - 1 - index}">View ↗</button></article>`).join('')}</div>` : '<p class="feed-empty" style="margin-top:18px">Your collection starts with this project. Tune your car, test it, then save your build.</p>'}`);
}
$('#nav-showroom').addEventListener('click', showroom); $('#switch-car').addEventListener('click', showroom);
$('#nav-garage').addEventListener('click', () => { $('#modal').close(); $('.garage-stage').scrollIntoView({ block: 'center', behavior: 'smooth' }); });
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) $('#modal').close(); });
$('#modal-content').addEventListener('click', event => {
  if (event.target.closest('[data-close]')) $('#modal').close();
  const carButton = event.target.closest('[data-car]');
  if (carButton && !activeRun) { const result = buyCar(state, carButton.dataset.car); if (!result.ok) { toast(result.reason); return; } nextGoal(); commit({ rebuild: true }); scene?.setView('hero'); updateViewButtons('hero'); $('#modal').close(); notice('NEW PROJECT / MAKE IT YOURS'); }
  const saved = event.target.closest('[data-build]');
  if (saved) {
    const build = state.collection[Number(saved.dataset.build)], s = stats(build.project);
    modal(`<div class="modal-heading"><div><span class="eyebrow">COMMUNITY SHOWROOM</span><h2>${esc(build.name)}</h2><p>${esc(carDefinition(build.project).name)} · ${esc(new Date(build.date).toLocaleDateString('en-GB'))}</p></div>${closeButton}</div><div style="max-width:420px;margin:auto">${miniCar(build.project)}</div><div class="save-stats"><div><strong>${s.hp}</strong><span>HORSEPOWER</span></div><div><strong>${fmt(s.mass)}</strong><span>WEIGHT / KG</span></div><div><strong>${build.project.best?.toFixed(2) || '—'}</strong><span>BEST 400 M / S</span></div></div><div class="collection-list">${CATEGORIES.map(c => `<div class="installed-line">${icon(c.icon)}${esc(c.items[build.project.parts[c.id]].name)}</div>`).join('')}</div><p class="traction-tip">${esc(build.contributors.length ? `Build crew: ${build.contributors.map(c => `${c.name} (₡ ${fmt(c.credits)})`).join(', ')}` : 'A host-built project. Saved for the next late night.')}</p><button class="button secondary" data-back-showroom>Back to showroom</button>`);
  }
  if (event.target.closest('[data-back-showroom]')) showroom();
  if (event.target.closest('[data-run-again]')) { $('#modal').close(); startRun(); }
});
$('#save-build').addEventListener('click', () => {
  if (activeRun || overlay) return; const s = stats(project());
  modal(`<div class="save-form"><div class="modal-heading"><div><span class="eyebrow">GIVE THE BUILD A NAME</span><h2>Made by the crew.</h2><p>Save this setup, its track record, and your contributors.</p></div>${closeButton}</div><form id="save-form"><label for="build-name" class="viewer-label">BUILD NAME</label><input class="text-input" id="build-name" name="build-name" maxlength="30" required value="${esc(carDefinition(project()).name)} / Night Shift"><div class="save-stats"><div><strong>${s.hp}</strong><span>HORSEPOWER</span></div><div><strong>${CATEGORIES.filter(c => project().parts[c.id]).length} / ${CATEGORIES.length}</strong><span>UPGRADED</span></div></div><button class="button primary" type="submit">${icon('save')} SAVE TO SHOWROOM</button></form></div>`);
});
$('#modal-content').addEventListener('submit', event => {
  if (event.target.id !== 'save-form') return; event.preventDefault();
  const build = saveBuild(state, $('#build-name').value); commit(); $('#modal').close(); toast(`${build.name} saved to your showroom.`);
});
$('#how-it-works').addEventListener('click', () => modal(`<div class="modal-heading"><div><span class="eyebrow">WELCOME TO THE NIGHT SHIFT</span><h2>Your community. Your dream car.</h2></div>${closeButton}</div><div class="help-content"><div class="help-step"><span>01</span><div><h3>Start with a blank canvas.</h3><p>Your Kaze KS-92 and ₡ 2,600 are ready. Pick parts, try finishes, and make it yours. Purchased parts can be swapped for free.</p></div></div><div class="help-step"><span>02</span><div><h3>Let the crew build it.</h3><p>Enter a viewer name and send a simulated Spark, Toolbox, or Rocket. They add credits to the shared fund. The target icon on any part makes it the community goal. Auto install buys one funded goal each time a gift arrives.</p></div></div><div class="help-step"><span>03</span><div><h3>Put the build to the test.</h3><p>Run the 400 m sprint to earn ₡ 400, every time. More power helps at speed; tires and suspension help at launch. Hold Space or the nitrous button for a burst if you installed a bottle. Save the result in your showroom, then choose another project.</p></div></div><div class="help-step"><span>04</span><div><h3>Explore the district.</h3><p>The map leads to the parts depot, paint booth, tuning lab, test strip, and showroom. Tune 13 categories; bigger turbos need an ECU and cooling. Complete contracts for credits and reputation, then unlock the 800 m event at REP 2. Service the engine after hard runs.</p></div></div><p>Progress is saved in this browser. The vertical preview mirrors this tab on the same browser, including test runs. This prototype uses simulated events and fictional credits. Real TikTok LIVE integration is not connected.</p></div>`));

let audio;
function engineSound() {
  if (audio) return audio;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const context = new AudioContext(), filter = context.createBiquadFilter(), gain = context.createGain();
  filter.type = 'lowpass'; filter.frequency.value = 420; gain.gain.value = 0; filter.connect(gain); gain.connect(context.destination);
  const oscillators = [1, 1.5, 2].map((ratio, index) => { const osc = context.createOscillator(); osc.type = index === 2 ? 'triangle' : 'sawtooth'; osc.frequency.value = 32 * ratio; osc.connect(filter); osc.start(); return { osc, ratio }; });
  audio = { context, filter, gain, oscillators }; return audio;
}
$('#sound').addEventListener('click', async () => {
  try {
    const sound = engineSound(); if (!sound) { toast('Engine audio is unavailable in this browser.'); return; }
    await sound.context.resume(); soundEnabled = !soundEnabled; $('#sound').setAttribute('aria-pressed', soundEnabled); $('#sound').setAttribute('aria-label', soundEnabled ? 'Mute engine sound' : 'Enable engine sound'); $('.sound-off').hidden = soundEnabled;
  } catch { toast('Engine audio could not start.'); }
});
function startRun() {
  if (activeRun || !scene || overlay) return;
  const race = raceDefinition(state.race);
  if (reputation(state) < race.level) { toast(`This event unlocks at reputation level ${race.level}. Complete contracts to gain rep.`); return; }
  $('#modal').close(); activeRun = newRun(race.id); runProject = JSON.parse(JSON.stringify(project())); runProjectId = state.active; oldBest = race.id === 'highway' ? project().bestHighway : project().best; boostHeld = false;
  lastTime = performance.now();
  $('.run-top>span').textContent = `${race.distance} M / ${race.name.toUpperCase()}`;
  scene.setRun(activeRun); document.body.classList.add('is-running'); $('#run-hud').hidden = false;
  $('.garage-stage').scrollIntoView({ block: 'start', behavior: 'smooth' });
  $('#boost').disabled = !runProject.parts.nitrous; $('#boost').innerHTML = runProject.parts.nitrous ? 'NITROUS <span>HOLD SPACE</span>' : 'NO NITROUS <span>INSTALL A BOTTLE</span>';
  runHud(activeRun);
  render(); channel?.postMessage({ type: 'run', run: activeRun, project: runProject });
}
$('#test-run').addEventListener('click', startRun);
document.addEventListener('keydown', event => { if (event.code === 'Space' && !overlay && (spaceBoost || (activeRun && !['INPUT', 'TEXTAREA'].includes(event.target.tagName)))) { event.preventDefault(); boostHeld = true; spaceBoost = true; } });
document.addEventListener('keyup', event => { if (event.code === 'Space') { if (spaceBoost) event.preventDefault(); boostHeld = false; spaceBoost = false; } }, true);
window.addEventListener('blur', () => { boostHeld = false; spaceBoost = false; });
$('#boost').addEventListener('pointerdown', event => { event.preventDefault(); boostHeld = true; });
document.addEventListener('pointerup', () => boostHeld = false); document.addEventListener('pointercancel', () => boostHeld = false);
$('#boost').addEventListener('keydown', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); boostHeld = true; } });
$('#boost').addEventListener('keyup', () => boostHeld = false);
function runHud(run) {
  $('#run-time').textContent = `${run.time.toFixed(2)} s`; $('#run-speed').textContent = Math.round(run.speed * 3.6);
  const race = raceDefinition(run.race);
  $('#run-distance').textContent = `${Math.floor(run.distance)} / ${race.distance} M`; $('#run-progress').style.width = `${run.distance / race.distance * 100}%`;
  $('#run-traction').textContent = run.temperature > 112 ? `ENGINE HOT / ${Math.round(run.temperature)}°C` : run.boosting ? 'NITROUS ACTIVE' : run.slip > .3 && run.speed < 22 ? 'WHEELSPIN / MORE GRIP HELPS' : `FULL THROTTLE / ${Math.round(run.temperature)}°C`;
  const s = stats(runProject || project());
  if (s.nitrousHp) { $('#boost').disabled = run.nitrousUsed >= s.nitrousSeconds; $('#boost').innerHTML = `${run.nitrousUsed >= s.nitrousSeconds ? 'BOTTLE EMPTY' : 'NITROUS'} <span>${Math.max(0, s.nitrousSeconds - run.nitrousUsed).toFixed(1)} S LEFT</span>`; }
}
function finishRun() {
  const run = activeRun, p = runProject, s = stats(p), personalBest = oldBest === null || run.time < oldBest, race = raceDefinition(activeRun.race);
  rewardRun(state, run, runProjectId); activeRun = null; runProject = null; boostHeld = false;
  scene.setRun(null); document.body.classList.remove('is-running'); $('#run-hud').hidden = true; updateViewButtons('hero'); tryAutoInstall(); commit(); animatedWallet();
  channel?.postMessage({ type: 'run-end' });
  modal(`<div class="modal-heading"><div><span class="eyebrow">${race.distance} M / ${race.name.toUpperCase()} ${personalBest ? ' / PERSONAL BEST' : ''}</span><h2 class="results-heading">${run.time.toFixed(2)} SECONDS.</h2><p class="results-name">${esc(carDefinition(p).name)} · ${s.hp} HP · ${fmt(s.mass)} KG</p></div>${closeButton}</div><div class="result-grid"><div class="result-stat"><strong>${run.zeroTo100?.toFixed(2) || '—'} <small>S</small></strong><small>0–100 KM/H</small></div><div class="result-stat"><strong>${Math.round(run.speed * 3.6)} <small>KM/H</small></strong><small>FINISH SPEED</small></div><div class="result-stat"><strong>${Math.round(run.temperature)}°C</strong><small>FINISH TEMPERATURE</small></div></div><p class="traction-tip">${s.hp > 280 && p.parts.tires < 2 ? 'Workshop tip: more grip will help this engine put its power down. Try semi-slick tires.' : run.temperature > 105 ? 'Workshop tip: a cooling upgrade will help this engine maintain its power through a long pull.' : 'A clean run. Try a new setup in the tuning lab and chase your personal best.'} Condition: ${Math.round(project().condition)}%.</p><div class="result-reward"><span>Track reward / +${race.xp} REP · no gifts needed</span><strong>+ ₡ ${race.reward}</strong></div><div class="result-actions"><button class="button secondary" data-close>BACK TO WORKSHOP</button><button class="button primary" data-run-again>${icon('flag')} RUN IT AGAIN</button></div>`);
}
let lastTime = performance.now(), lastBroadcast = 0;
function frame(now) {
  // Integrate small physics steps against elapsed time even when the browser throttles rendering.
  const elapsed = Math.min((now - lastTime) / 1000, 60); lastTime = now;
  if (activeRun && !overlay) {
    let remaining = elapsed;
    while (remaining > 0 && !activeRun.finished) { const step = Math.min(remaining, .02); advanceRun(activeRun, runProject, step, boostHeld); remaining -= step; }
    runHud(activeRun);
    if (now - lastBroadcast > 120) { channel?.postMessage({ type: 'run', run: activeRun, project: runProject }); lastBroadcast = now; }
    if (activeRun.finished) finishRun();
  }
  if (audio) {
    const targetVolume = soundEnabled && document.visibilityState === 'visible' ? activeRun ? .045 : .015 : 0;
    audio.gain.gain.setTargetAtTime(targetVolume, audio.context.currentTime, .08);
    const speed = activeRun?.speed || 0, rpm = activeRun ? 2300 + ((speed * 135) % 3900) : 850 + Math.sin(now / 500) * 35;
    audio.oscillators.forEach(({ osc, ratio }) => osc.frequency.setTargetAtTime(rpm / 30 * ratio, audio.context.currentTime, .04));
    audio.filter.frequency.setTargetAtTime(activeRun ? 600 + speed * 20 : 260, audio.context.currentTime, .1);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function externalState(raw) {
  if (activeRun && !overlay) return;
  const previous = JSON.stringify(project()); state = restoreState(raw); render();
  if (JSON.stringify(project()) !== previous) scene?.setProject(project());
}
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY && event.newValue) { try { externalState(JSON.parse(event.newValue)); } catch { /* Ignore malformed changes from another tab. */ } } });
if (channel) channel.onmessage = event => {
  const message = event.data;
  if (message.type === 'state') externalState(message.state);
  if (message.type === 'request-state' && !overlay) { channel.postMessage({ type: 'state', state }); if (activeRun) channel.postMessage({ type: 'run', run: activeRun, project: runProject }); }
  if (message.type === 'run' && overlay) {
    const starting = !activeRun; activeRun = message.run; runProject = message.project;
    if (starting) { document.body.classList.add('is-running'); $('#run-hud').hidden = false; scene?.setProject(runProject); }
    scene?.setRun(activeRun); runHud(activeRun);
  }
  if (message.type === 'run-end' && overlay) { activeRun = null; runProject = null; scene?.setRun(null); scene?.setProject(project()); document.body.classList.remove('is-running'); $('#run-hud').hidden = true; }
};
render();
try {
  const { GarageScene } = await import('./scene.js'); scene = new GarageScene($('#scene')); await scene.ready; scene.setProject(project());
  expansion = initExpansion({ getState: () => state, getScene: () => scene, isBusy: () => !!activeRun, commit, modal, toast, selectCategory: id => { category = id; renderShop(); }, startRun, showroom, overlay });
  scene.setStation(state.station);
  if (overlay) { scene.camera.position.set(-10.7, 5.7, 11.8); scene.controls.maxDistance = 19; channel?.postMessage({ type: 'request-state' }); }
  $('#scene-loading').hidden = true; render();
} catch (error) {
  console.error('Dream Garage renderer:', error);
  $('#scene-loading').innerHTML = '<div style="max-width:270px;padding:25px;line-height:1.8;text-align:center">The 3D workshop could not start.<br>Enable WebGL / hardware acceleration in your browser, then reload. Your garage progress is safe.</div>';
  $('#test-run').disabled = true;
}
