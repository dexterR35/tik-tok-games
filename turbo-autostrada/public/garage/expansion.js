import { CATEGORIES, CONTRACTS, RACES, reputation, stats, carDefinition, claimContract, applyTune, normalizeTune, serviceCar, recordDyno, partRequirements, powerCurve } from './model.js';
import { DistrictView, DESTINATIONS } from './district.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const close = `<button class="close-modal" data-close aria-label="Close dialog">${icon('close')}</button>`;
const headline = (kicker, title, text) => `<div class="modal-heading"><div><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${text}</p></div>${close}</div>`;

export function initExpansion(api) {
  const { getState, getScene, commit, modal, toast, selectCategory, isBusy } = api;
  let mapView, dynoTimer, selectedDestination = 'workshop', labTune;
  const p = () => getState().projects[getState().active];
  $('.icon-library defs').insertAdjacentHTML('beforeend', `
    <symbol id="i-map" viewBox="0 0 24 24"><path d="m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3zm6-3v17m8-14v17"/></symbol>
    <symbol id="i-tire" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="7" ry="10"/><ellipse cx="12" cy="12" rx="3" ry="6"/><path d="m6 5 3 2m-4 5h4m-3 7 3-2m9-12-3 2m4 5h-4m3 7-3-2"/></symbol>
    <symbol id="i-exhaust" viewBox="0 0 24 24"><path d="M2 10h5l3-3h8v10h-8l-3-3H2m16-5h4v6h-4m-5-8v10"/></symbol>
    <symbol id="i-brake" viewBox="0 0 24 24"><circle cx="11" cy="12" r="9"/><circle cx="11" cy="12" r="3"/><path d="M17 5h5v11h-5zM7 6l1 2M4 13h2m3 5 1-2m4-10-1 2"/></symbol>
    <symbol id="i-gear" viewBox="0 0 24 24"><path d="m9 3 1-2h4l1 3 3 1 3-1 2 4-2 2v4l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-4L1 8l2-4 3 1z"/><circle cx="12" cy="12" r="4"/></symbol>
    <symbol id="i-chip" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4M9 9h6v6H9z"/></symbol>
    <symbol id="i-cooling" viewBox="0 0 24 24"><path d="M3 5h18v15H3zm3 0V2h4v3m-3 3v9m5-9v9m5-9v9M1 9h2m18 6h2"/></symbol>
    <symbol id="i-light" viewBox="0 0 24 24"><path d="M4 5h6a8 8 0 0 1 0 14H4zm2 3v8m10-9 6-2m-5 7h6m-7 5 6 2"/></symbol>`);
  if (api.overlay) return { render() {}, beforeModal() {} };
  $('.main-nav').insertAdjacentHTML('beforeend', `<button class="nav-button" id="nav-district">${icon('map')}District</button><button class="nav-button" id="nav-lab">${icon('turbo')}Tuning lab</button>`);
  $('.topbar').insertAdjacentHTML('afterend', `<div class="career-strip"><div><span class="district-dot"></span>AFTER HOURS <b>/</b> PORTSIDE DISTRICT 07 <span class="shift-tag">NIGHT SHIFT</span></div><button id="career-contracts">REP <strong id="rep-level">01</strong><span class="xp-track"><i id="xp-progress"></i></span><span id="rep-xp">0 / 300</span><span id="contracts-ready"></span></button><span class="career-weather">17°C <b>·</b> CLEAR SKIES <b>·</b> CLOSED COURSE</span></div>`);
  $('.garage-stage').insertAdjacentHTML('beforeend', `<div class="station-toolbar"><button data-station-action="map">${icon('map')}<span>DISTRICT MAP</span></button><button data-station-action="lab">${icon('turbo')}<span>TUNING LAB</span></button><button data-station-action="events">${icon('flag')}<span>EVENTS</span></button></div><div class="station-plaque"><span id="station-label">THE WORKSHOP</span><b>01 / SIX DESTINATIONS</b></div>`);
  $('.project-actions').insertAdjacentHTML('beforebegin', `<section class="health-card"><div><span>ENGINE CONDITION</span><strong id="condition-value">100%</strong></div><div class="progress-track"><i id="condition-bar"></i></div><button class="text-button" id="service-car">${icon('tool')}<span>Full service</span><b id="service-cost">READY</b></button></section>`);
  $('.station-toolbar').querySelectorAll('button').forEach(button => { button.setAttribute('aria-label', button.textContent.trim()); button.title = button.textContent.trim(); });
  $('.community-panel').dataset.panel = 'crew';
  $('.community-panel').insertAdjacentHTML('afterbegin', `<div class="community-switch"><button class="active" data-community="crew">THE CREW</button><button data-community="contracts">CONTRACTS <span id="contract-badge">0</span></button></div>`);
  $('.local-save').insertAdjacentHTML('beforebegin', `<section class="contracts-body"><div class="contract-cover"><span>PORTSIDE / AFTER HOURS</span><h2>Earn your place.</h2><p>Build smarter. Drive harder.<br>Workshop work pays, too.</p></div><div id="contract-list"></div></section>`);
  $('.community-switch').addEventListener('click', event => { const button = event.target.closest('[data-community]'); if (!button) return; $('.community-panel').dataset.panel = button.dataset.community; $('.community-switch').querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button)); });
  $('#career-contracts').addEventListener('click', () => { $('.community-switch [data-community="contracts"]').click(); $('.community-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#contract-list').addEventListener('click', event => { const button = event.target.closest('[data-claim]'); if (!button || isBusy()) return; const result = claimContract(getState(), button.dataset.claim); if (result.ok) { commit(); toast(`Contract complete / +₡ ${result.contract.reward} / +${result.contract.xp} REP`); } else toast(result.reason); });
  $('#service-car').addEventListener('click', () => { if (isBusy()) return; const result = serviceCar(getState()); if (result.ok) { commit({ rebuild: true }); toast(`Full service / ₡ ${result.cost}. Engine condition restored.`); } else toast(result.reason); });
  $('#nav-district').addEventListener('click', openMap); $('#nav-lab').addEventListener('click', openLab);
  $('.station-toolbar').addEventListener('click', event => { const action = event.target.closest('[data-station-action]')?.dataset.stationAction; if (action === 'map') openMap(); if (action === 'lab') openLab(); if (action === 'events') openEvents(); });
  $('#modal').addEventListener('close', cleanup);
  $('#modal-content').addEventListener('click', event => {
    const destination = event.target.closest('[data-destination]'); if (destination) chooseDestination(destination.dataset.destination);
    if (event.target.closest('[data-travel]')) travel(selectedDestination);
    if (event.target.closest('[data-apply-tune]') && !isBusy()) { applyTune(getState(), labTune); commit({ rebuild: true }); getScene().setStation('dyno'); toast('Setup applied. Time to test the numbers.'); }
    if (event.target.closest('[data-dyno]')) runDyno();
    const eventButton = event.target.closest('[data-race]'); if (eventButton) { const race = RACES.find(r => r.id === eventButton.dataset.race); if (!race || reputation(getState()) < race.level) return; getState().race = race.id; commit(); api.startRun(); }
    const partButton = event.target.closest('[data-catalog-category]'); if (partButton) { $('#modal').close(); selectCategory(partButton.dataset.catalogCategory); $('.tuning-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    const fundButton = event.target.closest('[data-fund-part]'); if (fundButton) { getState().goal = { category: fundButton.dataset.fundPart, level: Number(fundButton.dataset.level) }; commit(); $('#modal').close(); toast('Community target set. Fit the supporting parts before installing.'); }
  });
  $('#modal-content').addEventListener('input', event => { if (event.target.matches('[data-tune]')) { labTune = Object.fromEntries([...$('#modal-content').querySelectorAll('[data-tune]')].map(input => [input.dataset.tune, Number(input.value)])); renderCurve(); } });
  function cleanup() { mapView?.dispose(); mapView = null; clearInterval(dynoTimer); dynoTimer = null; if (getScene()) getScene().dynoActive = false; }
  function render() {
    const state = getState(), current = p();
    $('#rep-level').textContent = String(reputation(state)).padStart(2, '0'); $('#rep-xp').textContent = `${state.xp % 300} / 300 XP`; $('#xp-progress').style.width = `${state.xp % 300 / 3}%`;
    const ready = CONTRACTS.filter(c => !state.claimed.includes(c.id) && c.progress(state, current) >= c.target).length;
    $('#contracts-ready').textContent = ready ? `${ready} CONTRACT${ready > 1 ? 'S' : ''} READY` : 'EARN REP THROUGH CONTRACTS'; $('#contract-badge').textContent = ready;
    $('#condition-value').textContent = `${Math.round(current.condition)}%`; $('#condition-bar').style.width = `${current.condition}%`;
    const cost = Math.ceil((100 - current.condition) * 12); $('#service-cost').textContent = cost ? `₡ ${cost}` : 'READY'; $('#service-car').disabled = isBusy() || !cost;
    const dest = DESTINATIONS.find(d => d.id === state.station) || DESTINATIONS[0]; $('#station-label').textContent = dest.name.toUpperCase();
    $('.bay-heading p').textContent = state.station === 'paint' ? 'A fresh finish. A new identity.' : state.station === 'dyno' ? 'Small adjustments. Measurable differences.' : 'One garage. Everyone’s vision.';
    const race = RACES.find(r => r.id === state.race) || RACES[0]; $('.run-reward').innerHTML = `${race.distance} m ${race.id === 'sprint' ? 'sprint' : 'highway pull'} <span>Earn ₡ ${race.reward} / run</span>`;
    $('#contract-list').innerHTML = CONTRACTS.map(c => { const claimed = state.claimed.includes(c.id), progress = Math.min(c.target, c.progress(state, current)), complete = progress >= c.target; return `<article class="contract-item ${claimed ? 'claimed' : ''}"><div class="contract-meta"><span>${claimed ? 'COMPLETED' : complete ? 'READY TO CLAIM' : 'WORKSHOP CONTRACT'}</span><b>+${c.xp} REP</b></div><h3>${c.name}</h3><p>${c.text}</p><div class="contract-progress"><i style="width:${progress / c.target * 100}%"></i></div><button data-claim="${c.id}" ${claimed || !complete || isBusy() ? 'disabled' : ''}>${claimed ? icon('check') + ' CLAIMED' : complete ? 'CLAIM REWARD' : `${progress} / ${c.target} OBJECTIVES`}<strong>₡ ${fmt(c.reward)}</strong></button></article>`; }).join('');
  }
  function openMap() {
    if (isBusy()) return;
    selectedDestination = getState().station;
    modal(`${headline('PORTSIDE DISTRICT / SIX PLACES TO BUILD YOUR STORY', 'The city is your workshop.', 'Explore the district. Find the next part of your build.')}<div class="district-layout"><div class="district-map" id="district-map"><span class="map-coordinate">GRID 07 / PORTSIDE<br>DRAG TO ORBIT · SCROLL TO ZOOM</span><div class="map-loading">Opening district…</div></div><aside class="district-detail"><div class="map-destinations">${DESTINATIONS.map((d,i) => `<button data-destination="${d.id}"><span>0${i+1}</span>${icon(d.icon)}<b>${d.name}</b></button>`).join('')}</div><div id="destination-detail"></div></aside></div>`);
    mapView = new DistrictView($('#district-map'), chooseDestination); const view = mapView;
    mapView.ready.then(() => { if (mapView === view) $('.map-loading')?.remove(); }); chooseDestination(selectedDestination);
  }
  function chooseDestination(id) {
    const destination = DESTINATIONS.find(d => d.id === id); if (!destination || !$('#destination-detail')) return;
    selectedDestination = id; mapView?.select(id);
    $('.map-destinations').querySelectorAll('button').forEach(b => b.classList.toggle('selected', b.dataset.destination === id));
    $('#destination-detail').innerHTML = `<div class="destination-photo"></div><span class="eyebrow">${destination.type}</span><h3>${destination.name}</h3><p>${destination.detail}</p><button class="button primary" data-travel>${destination.action}${icon('arrow')}</button>`;
  }
  function travel(id) {
    if (isBusy()) return; getState().station = id; commit(); $('#modal').close(); getScene().setStation(id);
    if (id === 'parts') openCatalog(); else if (id === 'dyno') openLab(); else if (id === 'track') openEvents(); else if (id === 'showroom') api.showroom();
    else { if (id === 'paint') selectCategory('paint'); getScene().setView('hero'); $('.garage-stage').scrollIntoView({ behavior: 'smooth', block: 'start' }); toast(id === 'paint' ? 'Color Theory / paint booth lights on.' : 'Welcome back to the workshop.'); }
  }
  function openCatalog() {
    modal(`${headline('PARTS DEPOT / IN STOCK', 'The right part changes everything.', '13 categories. 39 purchasable upgrades. Your existing parts stay yours.')}<div class="catalog-grid">${CATEGORIES.map(c => `<button class="catalog-tile" data-catalog-category="${c.id}"><img src="./assets/part-${c.id}.png" alt="${c.label}"><span>${c.label}</span><small>${c.items[p().parts[c.id]].name}</small><b>${p().owned[c.id].length-1} / 3 OWNED ${icon('arrow')}</b></button>`).join('')}</div>`);
  }
  function openEvents() {
    if (isBusy()) return;
    modal(`${headline('DOCKSIDE STRIP / CLOSED COURSE', 'Built in the bay. Proven here.', 'Earn credits and reputation on every completed run. Gifts are optional.')}<div class="event-grid">${RACES.map((race,i) => { const locked = reputation(getState()) < race.level; return `<article class="event-card event-${race.id}"><div class="event-image"><span>${i ? 'TOP SPEED / THERMAL ENDURANCE' : 'ACCELERATION / LAUNCH CONTROL'}</span><strong>${race.distance}<small>METERS</small></strong></div><div class="event-body"><span class="eyebrow">${locked ? `REPUTATION LEVEL ${race.level} REQUIRED` : 'EVENT AVAILABLE'}</span><h3>${race.name}</h3><p>${race.detail}</p><div class="event-rewards"><span>₡ ${race.reward}</span><span>+${race.xp} REP</span><span>FREE ENTRY</span></div><button class="button ${locked ? 'secondary' : 'primary'}" data-race="${race.id}" ${locked ? 'disabled' : ''}>${locked ? 'COMPLETE CONTRACTS TO UNLOCK' : 'ENTER EVENT'}${icon('arrow')}</button></div></article>`; }).join('')}</div>`);
  }
  function openLab() {
    if (isBusy()) return; labTune = { ...p().tune };
    modal(`${headline('THE TUNING LAB / LIVE SETUP', 'Find the sweet spot.', 'Power is a number. A balanced setup is a build.')}<div class="lab-layout"><div class="dyno-chart"><div class="dyno-chart-head"><span>ENGINE PERFORMANCE</span><b id="dyno-status">ESTIMATED CURVE</b></div><div class="dyno-legend"><span>POWER / HP</span><span>TORQUE / NM</span></div><div id="dyno-graph"></div><div class="dyno-readings" id="dyno-readings"></div><div class="dyno-run-progress"><i id="dyno-run-progress"></i></div><button class="button secondary" data-dyno>${icon('turbo')}RUN DYNO / 5 SECONDS <span>${p().dynoDone ? 'FREE RECHECK' : '+60 REP FIRST SESSION'}</span></button><p class="lab-note">A simplified gameplay dyno. Curves are calculated from this build’s engine, tune, and condition.</p></div><div class="setup-controls"><span class="eyebrow">SETUP SHEET / ${esc(carDefinition(p()).name.toUpperCase())}</span>${[
      ['boost','Boost pressure',.8,1.2,.01,'Higher boost adds heat. Cooling keeps it consistent.'],
      ['gearing','Final drive',.85,1.15,.01,'Short ratios add wheel torque when you have grip to spare; long ratios save shifts and raise top speed.'],
      ['camber','Camber',0,6,.5,'A little angle steadies the car and uses the tires better; too much costs grip.'],
      ['stance','Extra drop',0,40,5,'Fine-tune the stance below your installed spring height.'],
    ].map(([id,label,min,max,step,help]) => `<label class="setup-range"><div><span>${label}</span><output id="tune-${id}"></output></div><input type="range" data-tune="${id}" min="${min}" max="${max}" step="${step}" value="${labTune[id]}" aria-label="${label}"><small>${help}</small></label>`).join('')}<div class="balance-note" id="balance-note"></div><button class="button primary" data-apply-tune>APPLY SETUP ${icon('check')}</button></div></div>`);
    renderCurve();
  }
  function renderCurve() {
    if (!$('#dyno-graph')) return; labTune = normalizeTune(labTune);
    const candidate = { ...p(), tune: labTune }, s = stats(candidate), maxHp = Math.ceil(s.hp / 100) * 100;
    const points = Array.from({ length: 35 }, (_,i) => { const rpm = 1500 + i / 34 * 6500; const power = s.hp * powerCurve(rpm / 8000); /* the same curve the run physics uses */ return { x: 44 + i/34*410, y: 210 - power/maxHp*170, torque: power*7127/rpm }; });
    const path = points.map((v,i) => `${i?'L':'M'}${v.x.toFixed(1)} ${v.y.toFixed(1)}`).join(' ');
    const torquePath = points.map((v,i) => `${i?'L':'M'}${v.x.toFixed(1)} ${(210 - v.torque/(maxHp*1.7)*170).toFixed(1)}`).join(' ');
    $('#dyno-graph').innerHTML = `<svg viewBox="0 0 490 250" role="img" aria-label="Estimated horsepower and torque curves"><defs><linearGradient id="power-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c6e78b" stop-opacity=".24"/><stop offset="1" stop-color="#c6e78b" stop-opacity="0"/></linearGradient></defs>${[0,1,2,3,4].map(i => `<path d="M44 ${40+i*42.5}H455" stroke="#3b4938" stroke-width=".7"/><text x="5" y="${44+i*42.5}" fill="#7f9473" font-size="9">${Math.round(maxHp-i*maxHp/4)}</text><text x="462" y="${44+i*42.5}" fill="#b39c78" font-size="8">${Math.round((maxHp-i*maxHp/4)*1.7)}</text>`).join('')}<path d="${path}L454 210H44Z" fill="url(#power-fill)"/><path d="${torquePath}" fill="none" stroke="#d3a56e" stroke-width="2" stroke-dasharray="5 4"/><path d="${path}" fill="none" stroke="#c6e78b" stroke-width="3"/>${[2000,4000,6000,8000].map((n,i) => `<text x="${60+i*124}" y="233" fill="#8da17f" font-size="9">${n}</text>`).join('')}<text x="225" y="249" fill="#637c53" font-size="8">ENGINE RPM</text></svg>`;
    $('#dyno-readings').innerHTML = `<div><strong>${s.hp}<small>HP</small></strong><span>AT THE CRANK</span></div><div><strong>${Math.round(s.hp*s.delivery)}<small>WHP</small></strong><span>AT THE WHEELS</span></div><div><strong>${Math.round(s.maxSpeed)}<small>KM/H</small></strong><span>GEARING LIMIT</span></div>`;
    for (const [id,value] of Object.entries(labTune)) $(`#tune-${id}`).textContent = id === 'boost' ? `${value.toFixed(2)}×` : id === 'gearing' ? `${value.toFixed(2)} / ${value > 1.02 ? 'SHORT' : value < .98 ? 'LONG' : 'BALANCED'}` : id === 'camber' ? `−${value.toFixed(1)}°` : `−${value} MM`;
    $('#balance-note').innerHTML = `${icon(s.hp > 320 && p().parts.tires < 2 ? 'tire' : s.heatRate > 2.2 ? 'cooling' : 'check')}<span>${s.hp > 320 && p().parts.tires < 2 ? 'This power level needs more tire. Semi-slicks will improve your launch.' : s.heatRate > 2.2 ? 'Heat is building quickly. Fit more cooling before a long highway pull.' : 'A balanced setup. Keep an eye on engine condition after each run.'}</span>`;
  }
  function runDyno() {
    if (dynoTimer || isBusy()) return;
    applyTune(getState(), labTune); commit({ rebuild: true }); getScene().dynoActive = true;
    const button = $('[data-dyno]'); button.disabled = true; $('[data-apply-tune]').disabled = true; const start = performance.now();
    dynoTimer = setInterval(() => {
      if (!$('#dyno-run-progress')) { cleanup(); return; }
      const t = Math.min(1,(performance.now()-start)/5000); $('#dyno-run-progress').style.width = `${t*100}%`; $('#dyno-status').textContent = `DYNO PULL / ${Math.round(1500+t*6500)} RPM`;
      if (t >= 1) { clearInterval(dynoTimer); dynoTimer = null; getScene().dynoActive = false; const xp = recordDyno(getState()); commit(); $('#dyno-status').textContent = 'PULL COMPLETE / SETUP RECORDED'; button.disabled = false; button.innerHTML = `${icon('turbo')}RUN DYNO / 5 SECONDS <span>FREE RECHECK</span>`; $('[data-apply-tune]').disabled = false; toast(`Dyno complete / ${stats(p()).hp} HP${xp ? ` / +${xp} REP` : ''}`); }
    },100);
  }
  function showRequirements(category, level) {
    const cat = CATEGORIES.find(c => c.id === category), item = cat.items[level], missing = partRequirements(p(), category, level);
    modal(`${headline('BUILD COMPATIBILITY / SUPPORTING PARTS', 'Build the foundation first.', `${esc(item.name)} needs these supporting upgrades to run safely.`)}<div class="requirement-grid">${missing.map(r => `<article><img src="./assets/part-${r.category}.png" alt="${esc(r.name)}"><h3>${esc(r.name)}</h3><p>Required at this level or higher.</p><button class="button secondary" data-catalog-category="${r.category}">VIEW IN PARTS SHOP ${icon('arrow')}</button></article>`).join('')}</div><button class="button primary" style="margin-top:24px" data-fund-part="${category}" data-level="${level}">SET ${esc(item.name.toUpperCase())} AS COMMUNITY GOAL</button>`);
  }
  render(); return { render, beforeModal: cleanup, openMap, openLab, openEvents, showRequirements };
}
