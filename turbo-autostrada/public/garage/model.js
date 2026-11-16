// The simulation deliberately uses fictional workshop credits, never TikTok Coins.
export const STORAGE_KEY = 'dream-garage.v1';
export const CARS = [
  { id: 'kaze', name: 'Kaze KS-92', brand: 'KAZE MOTOR WORKS', year: '1992', type: 'JAPANESE STREET COUPE', price: 0, hp: 205, mass: 1260, drive: 'RWD', rear: .50, color: '#b6d255', shape: 0 },
  { id: 'vanta', name: 'Vanta RX-7X', brand: 'VANTA AUTOMOTIVE', year: '2007', type: 'MID-ENGINE SUPERCAR', price: 8000, hp: 330, mass: 1390, drive: 'RWD', rear: .57, color: '#e26f43', shape: 1 },
  { id: 'atlas', name: 'Atlas GT-68', brand: 'ATLAS PERFORMANCE', year: '1968', type: 'AMERICAN MUSCLE', price: 14000, hp: 390, mass: 1620, drive: 'RWD', rear: .46, color: '#7f9cae', shape: 2 },
];
export const COLORS = [
  { name: 'Acid olive', hex: '#b6d255' }, { name: 'Signal orange', hex: '#ed6c32' },
  { name: 'Arctic white', hex: '#dde3df' }, { name: 'Midnight plum', hex: '#79518f' },
  { name: 'Pacific blue', hex: '#399bbc' }, { name: 'Carbon black', hex: '#282d32' },
];
export const CATEGORIES = [
  { id: 'paint', label: 'Paint & finish', short: 'Paint', icon: 'paint', description: 'A new identity, down to the last reflection.', items: [
    { name: 'Factory paint', cost: 0, detail: 'Original satin finish', spec: 'SATIN' },
    { name: 'Studio gloss', cost: 200, detail: 'Deep color. High-gloss clear coat.', spec: 'GLOSS' },
    { name: 'Pearl metallic', cost: 600, detail: 'Metallic flakes and a layered pearl finish.', spec: 'METALLIC' },
    { name: 'Stealth carbon', cost: 1000, detail: 'Dark carbon hood. Satin bodywork.', spec: 'CARBON HOOD' },
  ] },
  { id: 'wheels', label: 'Wheels & tires', short: 'Wheels', icon: 'wheel', description: 'Power means nothing without grip.', items: [
    { name: 'Factory 16”', cost: 0, detail: 'Everyday tires. Original five-spoke rims.', spec: 'STOCK GRIP' },
    { name: 'Street forged', cost: 500, detail: '18” silver alloys with sport tires.', spec: '+14% GRIP' },
    { name: 'Track bronze', cost: 1100, detail: '19” bronze split-spoke rims. Semi-slicks.', spec: '+28% GRIP' },
    { name: 'Competition', cost: 1800, detail: 'Lightweight black rims. Racing slicks.', spec: '+42% GRIP' },
  ] },
  { id: 'aero', label: 'Body kits', short: 'Body kit', icon: 'aero', description: 'Built to cut through the night.', items: [
    { name: 'Factory body', cost: 0, detail: 'Clean lines. No added downforce.', spec: 'ORIGINAL' },
    { name: 'Street lip', cost: 1200, detail: 'Front splitter, side skirts, ducktail.', spec: '+6% STABILITY' },
    { name: 'Widebody', cost: 2200, detail: 'Wide fenders and a raised rear wing.', spec: '+12% STABILITY' },
    { name: 'Time attack', cost: 3400, detail: 'Big wing, deep splitter, rear diffuser.', spec: '+18% STABILITY' },
  ] },
  { id: 'suspension', label: 'Suspension', short: 'Suspension', icon: 'spring', description: 'Find your stance. Keep your composure.', items: [
    { name: 'Factory springs', cost: 0, detail: 'Comfortable ride at original height.', spec: 'STANDARD' },
    { name: 'Sport springs', cost: 800, detail: 'Lower by 25 mm. Sharper launch.', spec: '−25 MM' },
    { name: 'Street coilovers', cost: 1400, detail: 'Lower by 45 mm. Balanced damping.', spec: '−45 MM' },
    { name: 'Race coilovers', cost: 2200, detail: 'Lower by 60 mm. Maximum control.', spec: '−60 MM' },
  ] },
  { id: 'turbo', label: 'Turbo & engine', short: 'Turbo', icon: 'turbo', description: 'More boost. More possibilities.', items: [
    { name: 'Factory engine', cost: 0, detail: 'Naturally aspirated. Ready for a new life.', spec: 'STOCK POWER' },
    { name: 'Stage 1 turbo', cost: 2000, detail: 'Street turbo, intake, and ECU tune.', spec: '+85 HP' },
    { name: 'Stage 2 turbo', cost: 3400, detail: 'Bigger intercooler. Forged internals.', spec: '+175 HP' },
    { name: 'Stage 3 turbo', cost: 5200, detail: 'Big turbo. Full race engine. Needs grip.', spec: '+290 HP' },
  ] },
  { id: 'nitrous', label: 'Nitrous', short: 'Nitrous', icon: 'bottle', description: 'Save a little extra for the finish line.', items: [
    { name: 'No nitrous', cost: 0, detail: 'All engine, all the way.', spec: 'UNAVAILABLE' },
    { name: 'Street bottle', cost: 900, detail: 'A 4-second, 65 hp shot. Refilled each run.', spec: '+65 HP BURST' },
    { name: 'Dual system', cost: 1700, detail: 'A 5-second, 110 hp shot.', spec: '+110 HP BURST' },
    { name: 'Race injection', cost: 2600, detail: 'A 6-second, 160 hp shot.', spec: '+160 HP BURST' },
  ] },
];
// Every category keeps stable IDs so existing browser saves migrate without losing parts.
CATEGORIES.splice(2, 0, { id: 'tires', label: 'Tire compounds', short: 'Tires', icon: 'tire', description: 'Match your rubber to the power you are making.', items: [
  { name: 'Road compound', cost: 0, detail: 'Quiet all-season rubber. A starting point.', spec: 'ROAD' },
  { name: 'Sport compound', cost: 450, detail: 'Sticky street rubber. Better launches.', spec: '+12% GRIP' },
  { name: 'Semi-slicks', cost: 950, detail: 'Track-ready tread with a wide contact patch.', spec: '+24% GRIP' },
  { name: 'Drag radials', cost: 1600, detail: 'Maximum straight-line traction.', spec: '+36% GRIP' },
] });
CATEGORIES.push(
  { id: 'exhaust', label: 'Exhaust systems', short: 'Exhaust', icon: 'exhaust', description: 'Let the engine breathe. Give the build a voice.', items: [
    { name: 'Factory exhaust', cost: 0, detail: 'Original muffler and tailpipes.', spec: 'STOCK' },
    { name: 'Cat-back', cost: 650, detail: 'Polished tips. A freer-flowing exhaust.', spec: '+12 HP' },
    { name: 'Titanium system', cost: 1300, detail: 'Blue-burnt titanium with a lighter muffler.', spec: '+24 HP / −8 KG' },
    { name: 'Race side-exit', cost: 2100, detail: 'Short, light, and unapologetically loud.', spec: '+38 HP / −14 KG' },
  ] },
  { id: 'brakes', label: 'Brake packages', short: 'Brakes', icon: 'brake', description: 'Stopping power is a performance upgrade, too.', items: [
    { name: 'Factory brakes', cost: 0, detail: 'Original discs and sliding calipers.', spec: 'STANDARD' },
    { name: 'Sport pads', cost: 500, detail: 'Better bite with orange calipers.', spec: '+15% BRAKING' },
    { name: 'Big brake kit', cost: 1250, detail: 'Drilled rotors and red six-piston calipers.', spec: '+32% BRAKING' },
    { name: 'Carbon ceramics', cost: 2600, detail: 'Gold calipers. Low weight. Serious stopping.', spec: '+52% BRAKING' },
  ] },
  { id: 'transmission', label: 'Transmission', short: 'Gearbox', icon: 'gear', description: 'Find the right ratio for the next stretch of road.', items: [
    { name: 'Factory 5-speed', cost: 0, detail: 'Original gearing and clutch.', spec: '5 SPEED' },
    { name: 'Sport clutch', cost: 750, detail: 'A stronger clutch with faster engagement.', spec: '+3% DELIVERY' },
    { name: 'Close-ratio 6', cost: 1650, detail: 'Six speeds. Shorter gaps. More pull.', spec: '+6% DELIVERY' },
    { name: 'Sequential', cost: 3100, detail: 'Race transmission and lightning-fast shifts.', spec: '+9% DELIVERY' },
  ] },
  { id: 'ecu', label: 'Engine management', short: 'ECU', icon: 'chip', description: 'Build the brains before you turn up the boost.', items: [
    { name: 'Factory ECU', cost: 0, detail: 'Conservative factory calibration.', spec: 'FACTORY MAP' },
    { name: 'Street remap', cost: 550, detail: 'Revised fuel and ignition maps.', spec: '+18 HP' },
    { name: 'Standalone ECU', cost: 1250, detail: 'Full boost control and live engine data.', spec: '+36 HP' },
    { name: 'Motorsport ECU', cost: 2400, detail: 'Race calibration with intelligent protection.', spec: '+55 HP' },
  ] },
  { id: 'cooling', label: 'Cooling systems', short: 'Cooling', icon: 'cooling', description: 'Power is only useful while you can keep it cool.', items: [
    { name: 'Factory radiator', cost: 0, detail: 'Enough cooling for a stock street engine.', spec: 'STOCK COOLING' },
    { name: 'Alloy radiator', cost: 700, detail: 'A larger aluminum core and electric fans.', spec: '−18% HEAT' },
    { name: 'Bar-plate cooler', cost: 1400, detail: 'A big intercooler and improved coolant flow.', spec: '−36% HEAT' },
    { name: 'Race cooling', cost: 2200, detail: 'Oil cooler, ducting, and a full racing core.', spec: '−54% HEAT' },
  ] },
  { id: 'lighting', label: 'Lighting & details', short: 'Lights', icon: 'light', description: 'Make the night shift your own.', items: [
    { name: 'Factory lights', cost: 0, detail: 'Original headlights. Classic and understated.', spec: 'OEM WHITE' },
    { name: 'Ice white LEDs', cost: 350, detail: 'Crisp headlights and a clean light signature.', spec: 'ICE WHITE' },
    { name: 'Amber street', cost: 750, detail: 'Warm headlights with amber underglow.', spec: 'AMBER GLOW' },
    { name: 'Neon signature', cost: 1400, detail: 'Lime lighting and a subtle underbody glow.', spec: 'ACID LIME' },
  ] },
);
CATEGORIES.find(c => c.id === 'wheels').items.forEach((item, level) => { item.detail = ['Original five-spoke rims. 16 inch.', '18 inch forged silver alloys.', '19 inch bronze split-spoke rims.', 'Ultralight black competition rims.'][level]; item.spec = level ? `−${level * 9} KG / FORGED` : 'FACTORY ALLOY'; });
CATEGORIES.find(c => c.id === 'wheels').label = 'Wheels & rims';
CATEGORIES.find(c => c.id === 'turbo').items[2].requires = { cooling: 1, ecu: 1 };
CATEGORIES.find(c => c.id === 'turbo').items[3].requires = { cooling: 2, ecu: 2 };
CATEGORIES.find(c => c.id === 'nitrous').items[3].requires = { ecu: 2 };

export const RACES = [
  { id: 'sprint', name: 'Dockside Sprint', distance: 400, reward: 400, xp: 60, level: 1, detail: 'A clean launch. A quarter mile. Your first benchmark.' },
  { id: 'highway', name: 'Midnight Express', distance: 800, reward: 650, xp: 90, level: 2, detail: 'A longer pull where power, gearing, and cooling count.' },
];
export const CONTRACTS = [
  { id: 'first-build', name: 'From the ground up', text: 'Fit 3 upgrades and complete a test run.', reward: 650, xp: 120, progress: (s, p) => Math.min(3, upgradedCount(p)) + Math.min(1, p.runs), target: 4 },
  { id: 'grip', name: 'Grip before boost', text: 'Fit semi-slicks and sport suspension or better.', reward: 550, xp: 100, progress: (s, p) => Math.min(2, p.parts.tires) + Math.min(1, p.parts.suspension), target: 3 },
  { id: 'dyno', name: 'Know your numbers', text: 'Complete your first dyno session.', reward: 350, xp: 80, progress: (s, p) => p.dynoDone ? 1 : 0, target: 1 },
  { id: 'balanced', name: 'Supporting cast', text: 'Fit an ECU, cooling, brakes, and a turbo.', reward: 900, xp: 160, progress: (s, p) => ['ecu', 'cooling', 'brakes', 'turbo'].filter(id => p.parts[id] > 0).length, target: 4 },
  { id: 'nightshift', name: 'The night shift', text: 'Upgrade 8 categories and run 400 m under 14 seconds.', reward: 1500, xp: 220, progress: (s, p) => Math.min(8, upgradedCount(p)) + (p.best && p.best < 14 ? 1 : 0), target: 9 },
];
export const upgradedCount = project => CATEGORIES.filter(c => project.parts[c.id] > 0).length;
export const reputation = state => 1 + Math.floor(state.xp / 300);
export const raceDefinition = id => RACES.find(r => r.id === id) || RACES[0];
export function partRequirements(project, category, level) {
  const item = CATEGORIES.find(c => c.id === category)?.items[level];
  return Object.entries(item?.requires || {}).filter(([id, required]) => project.parts[id] < required).map(([id, required]) => ({ category: id, level: required, name: CATEGORIES.find(c => c.id === id).items[required].name }));
}
export const GIFTS = [
  { id: 'spark', name: 'Spark', value: 100, icon: 'spark', color: '#e1bd6a' },
  { id: 'toolbox', name: 'Toolbox', value: 500, icon: 'tool', color: '#90bacb' },
  { id: 'rocket', name: 'Rocket', value: 1500, icon: 'rocket', color: '#c0db76' },
];
const copy = value => JSON.parse(JSON.stringify(value));
const count = (value, max = 1e9) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
export const carDefinition = project => CARS.find(c => c.id === project.carId) || CARS[0];
export function newProject(carId = 'kaze') {
  const def = CARS.find(c => c.id === carId) || CARS[0];
  return { carId: def.id, color: def.color, parts: Object.fromEntries(CATEGORIES.map(c => [c.id, 0])), owned: Object.fromEntries(CATEGORIES.map(c => [c.id, [0]])), spent: 0, runs: 0, best: null, bestHighway: null, condition: 100, dynoDone: false, tune: { boost: 1, gearing: 1, camber: 0, stance: 0 } };
}
export function newState() {
  return { version: 2, credits: 2600, active: 'kaze', projects: { kaze: newProject() }, collection: [], contributors: [], feed: [], goal: { category: 'turbo', level: 1 }, autoInstall: false, totalGifts: 0, totalRuns: 0, xp: 0, claimed: [], station: 'workshop', race: 'sprint' };
}
export function normalizeProject(raw, carId) {
  const project = newProject(carId);
  if (!raw || typeof raw !== 'object') return project;
  project.color = /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : project.color;
  for (const cat of CATEGORIES) {
    const owned = Array.isArray(raw.owned?.[cat.id]) ? raw.owned[cat.id].filter(n => Number.isInteger(n) && n >= 0 && n <= 3) : [];
    project.owned[cat.id] = [...new Set([0, ...owned])];
    const part = raw.parts?.[cat.id];
    project.parts[cat.id] = project.owned[cat.id].includes(part) ? part : 0;
  }
  project.spent = count(raw.spent);
  project.runs = count(raw.runs);
  project.best = Number.isFinite(raw.best) && raw.best > 0 ? raw.best : null;
  project.bestHighway = Number.isFinite(raw.bestHighway) && raw.bestHighway > 0 ? raw.bestHighway : null;
  project.condition = Number.isFinite(raw.condition) ? Math.min(100, Math.max(60, raw.condition)) : 100;
  project.dynoDone = !!raw.dynoDone;
  project.tune = normalizeTune(raw.tune);
  return project;
}
export function restoreState(raw) {
  const state = newState();
  if (!raw || ![1, 2].includes(raw.version)) return state;
  state.credits = count(raw.credits);
  for (const def of CARS) if (Object.hasOwn(raw.projects || {}, def.id)) state.projects[def.id] = normalizeProject(raw.projects[def.id], def.id);
  state.active = Object.hasOwn(state.projects, raw.active) ? raw.active : 'kaze';
  state.collection = (Array.isArray(raw.collection) ? raw.collection : []).slice(-30).filter(s => s && CARS.some(c => c.id === s.project?.carId)).map(s => ({ name: String(s.name || 'Untitled build').slice(0, 30), project: normalizeProject(s.project, s.project.carId), date: String(s.date || '').slice(0, 30), contributors: (Array.isArray(s.contributors) ? s.contributors : []).slice(0, 3).map(c => ({ name: String(c.name || 'Guest').slice(0, 24), credits: count(c.credits) })) }));
  state.contributors = (Array.isArray(raw.contributors) ? raw.contributors : []).slice(0, 100).filter(c => c && typeof c.name === 'string').map(c => ({ name: c.name.slice(0, 24), credits: count(c.credits) }));
  state.feed = (Array.isArray(raw.feed) ? raw.feed : []).slice(0, 20).filter(f => f && typeof f.text === 'string').map(f => ({ text: f.text.slice(0, 180), kind: ['gift', 'part', 'run', 'save'].includes(f.kind) ? f.kind : 'save', time: count(f.time, 1e14) }));
  if (CATEGORIES.some(c => c.id === raw.goal?.category) && [1, 2, 3].includes(raw.goal?.level)) state.goal = copy(raw.goal);
  state.autoInstall = !!raw.autoInstall;
  state.totalGifts = count(raw.totalGifts); state.totalRuns = count(raw.totalRuns);
  state.xp = count(raw.xp ?? state.totalRuns * 60);
  state.claimed = Array.isArray(raw.claimed) ? [...new Set(raw.claimed.filter(id => CONTRACTS.some(c => c.id === id)))] : [];
  state.station = ['workshop', 'paint', 'parts', 'dyno', 'track', 'showroom'].includes(raw.station) ? raw.station : 'workshop';
  state.race = RACES.some(r => r.id === raw.race) ? raw.race : 'sprint';
  if (raw.version === 1) {
    const migrate = p => {
      p.parts.tires = p.parts.wheels; p.owned.tires = [...p.owned.wheels];
      const support = Math.max(0, p.parts.turbo - 1);
      for (const id of ['ecu', 'cooling']) { const level = Math.max(support, id === 'ecu' && p.parts.nitrous === 3 ? 2 : 0); if (level) { p.parts[id] = level; p.owned[id] = [...new Set([...p.owned[id], level])]; } }
    };
    Object.values(state.projects).forEach(migrate); state.collection.forEach(s => migrate(s.project));
  }
  return state;
}
const clampNumber = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.min(high, Math.max(low, Number(value))) : fallback;
export function normalizeTune(raw) { return { boost: clampNumber(raw?.boost, .8, 1.2, 1), gearing: clampNumber(raw?.gearing, .85, 1.15, 1), camber: clampNumber(raw?.camber, 0, 6, 0), stance: clampNumber(raw?.stance, 0, 40, 0) }; }
export function applyTune(state, tune) { state.projects[state.active].tune = normalizeTune(tune); addFeed(state, 'A new setup was dialed in at the tuning lab.', 'part'); }
export function stats(project) {
  const def = carDefinition(project), p = project.parts, tune = normalizeTune(project.tune);
  const hp = Math.round((def.hp + [0, 85, 175, 290][p.turbo] * tune.boost + p.ecu * 18 + [0, 12, 24, 38][p.exhaust]) * (.82 + (project.condition ?? 100) * .0018));
  return { hp, mass: def.mass + p.turbo * 12 + p.nitrous * 8 - p.wheels * 9 + p.aero * 4 - [0, 3, 8, 14][p.exhaust] - p.brakes * 2,
    grip: 1 + p.wheels * .02 + p.tires * .12 + p.suspension * .045 - tune.camber ** 2 * .0015, stability: Math.min(100, 55 + p.suspension * 7 + p.aero * 6 + tune.camber * 2.5), transmission: p.transmission, rear: def.rear ?? .5,
    drag: .39 + p.aero * .002, downforce: p.aero * .9, nitrousHp: [0, 65, 110, 160][p.nitrous], nitrousSeconds: p.nitrous ? 3 + p.nitrous : 0,
    value: (def.price || 2000) + project.spent, braking: 1 + [0, .15, .32, .52][p.brakes], delivery: .82 + p.transmission * .025,
    heatRate: Math.max(.35, 1 + p.turbo * .65 + (p.turbo ? (tune.boost - 1) * 6 : 0)) * (1 - p.cooling * .18), cooling: p.cooling, gearing: tune.gearing,
    maxSpeed: (220 + hp * .13) / tune.gearing, boost: tune.boost, condition: project.condition ?? 100 };
}
export function addFeed(state, text, kind) { state.feed.unshift({ text, kind, time: Date.now() }); state.feed = state.feed.slice(0, 20); }
export function installPart(state, category, level) {
  const cat = CATEGORIES.find(c => c.id === category);
  if (!cat || !Number.isInteger(level) || !cat.items[level]) return { ok: false, reason: 'Unknown part.' };
  const project = state.projects[state.active], item = cat.items[level];
  if (project.parts[category] === level) return { ok: false, reason: 'Already installed.' };
  const candidate = { ...project, parts: { ...project.parts, [category]: level } };
  for (const c of CATEGORIES) {
    const missing = partRequirements(candidate, c.id, candidate.parts[c.id]);
    if (missing.length) return { ok: false, reason: `${c.items[candidate.parts[c.id]].name} needs ${missing.map(r => r.name).join(' and ')}.`, missing };
  }
  const owned = project.owned[category].includes(level), price = owned ? 0 : item.cost;
  if (state.credits < price) return { ok: false, reason: `You need ${price - state.credits} more credits.` };
  state.credits -= price; project.spent += price;
  if (!owned) project.owned[category].push(level);
  project.parts[category] = level;
  addFeed(state, `${item.name} installed on ${carDefinition(project).name}.`, 'part');
  return { ok: true, item, price };
}
export function buyCar(state, carId) {
  const def = CARS.find(c => c.id === carId);
  if (!def) return { ok: false, reason: 'Unknown car.' };
  if (!Object.hasOwn(state.projects, carId)) {
    if (state.credits < def.price) return { ok: false, reason: `You need ${def.price - state.credits} more credits.` };
    state.credits -= def.price; state.projects[carId] = newProject(carId);
    addFeed(state, `${def.name} arrived in the garage.`, 'save');
  }
  state.active = carId;
  return { ok: true };
}
export function receiveGift(state, giftId, viewerName) {
  const gift = GIFTS.find(g => g.id === giftId);
  if (!gift) return null;
  const name = String(viewerName || 'GuestDriver').trim().slice(0, 24) || 'GuestDriver';
  state.credits = Math.min(1e9, state.credits + gift.value); state.totalGifts++;
  let contributor = state.contributors.find(c => c.name === name);
  if (!contributor) { contributor = { name, credits: 0 }; state.contributors.push(contributor); }
  contributor.credits += gift.value;
  state.contributors.sort((a, b) => b.credits - a.credits); state.contributors = state.contributors.slice(0, 100);
  addFeed(state, `${name} sent ${gift.name} · +${gift.value} credits`, 'gift');
  return gift;
}
export function saveBuild(state, name) {
  const project = state.projects[state.active];
  const snapshot = { name: String(name || carDefinition(project).name).trim().slice(0, 30) || carDefinition(project).name, project: copy(project), date: new Date().toISOString(), contributors: copy(state.contributors.slice(0, 3)) };
  state.collection.push(snapshot); state.collection = state.collection.slice(-30);
  addFeed(state, `${snapshot.name} added to the showroom.`, 'save');
  return snapshot;
}
// ---------------------------------------------------------------------------------------------------------------
// LONGITUDINAL PHYSICS (SI units). Newton: m·a = F_drive − F_drag − F_roll.
//   engine  : torque T(x) ∝ 1 − ((x − .5)/.8)², x = rpm / redline; power P(x) = P_peak · powerCurve(x) ∝ x·T(x),
//             peak power at x ≈ .82, ~88% left at the redline. Power is never created:
//             gearing only decides WHERE on the curve the engine works and when it must shift.
//   gearbox : N gears; in gear k the redline is reached at vTop · gearTop(k, N). Each upshift cuts drive for SHIFT_TIME.
//   tires   : rear-wheel drive. The driven axle carries the static rear share of the weight plus the load that
//             acceleration transfers to it:  N_rear = W·(rear + a·h/(g·L)).  With F = μ·N_rear and a = F/m this solves to
//             F_max = (m·g + downforce) · μ·rear / (1 − μ·h/L),  μ = MU · grip.   (mid-engine = more rear weight = better launch)
//             A stable chassis (suspension, aero, a little camber) keeps the tires evenly loaded and uses more of that
//             limit: usable = F_max · (GRIP_USE + (1 − GRIP_USE) · stability/100). Extra power never slows the car;
//             it only spins the wheels (drive = min(engine, usable)).
//   drag    : ½·ρ·Cd·A·v²        roll: Crr·m·g
//   heat    : dT/dt = HEAT_GAIN · heatRate · load − (T − T0) · (COOL_BASE + COOL_PART · cooling) · (1 + v / AIRFLOW_V)
export const PHYSICS = { G: 9.81, RHO: 1.225, AREA: 2.1, MU: .95, CG: .20, ROLL: .12, GRIP_USE: .88, HEAT_GAIN: 2.4, T0: 68, T_HOT: 112, HOT_LOSS: .012, HOT_MIN: .65, COOL_BASE: .03, COOL_PART: .012, AIRFLOW_V: 60, MAX_STEP: .01 };
export const GEARBOX = { gears: [5, 5, 6, 6], shift: [.26, .19, .13, .07] }; // by transmission level
export const gearTop = (k, n) => Math.pow(k / n, .85);
// engine torque (relative) at rpm fraction x, and the fraction of peak power it gives (power = torque × rpm)
export const torqueCurve = x => Math.max(0, 1 - ((x - .5) / .8) ** 2);
export const PEAK_RPM = (2 + Math.sqrt(4 + 12 * .39)) / 6;            // root of d(x·T)/dx = 0  →  ≈ .824
const PEAK_POWER = PEAK_RPM * torqueCurve(PEAK_RPM);
export const powerCurve = x => x <= 0 ? 0 : x * torqueCurve(x) / PEAK_POWER;
export function advanceRun(run, project, dt, boost = false, audienceAssist = 0) {
  if (run.finished) return run;
  const C = PHYSICS, s = stats(project);
  // Any dt is simulated in full, in sub-steps of at most MAX_STEP (before: time beyond 0.05 s was silently dropped).
  let left = Math.max(0, Math.min(Number(dt) || 0, 5));
  while (left > 1e-12 && !run.finished) { const h = Math.min(left, C.MAX_STEP); stepRun(run, s, h, boost, audienceAssist); left -= h; }
  return run;
}
function stepRun(run, s, h, boost, audienceAssist) {
  const C = PHYSICS, level = Math.min(3, Math.max(0, s.transmission | 0)), n = GEARBOX.gears[level], vTop = s.maxSpeed / 3.6;
  const assistance = Math.min(.32, Math.max(0, Number(audienceAssist) || 0));
  const useBoost = !!boost && s.nitrousHp > 0 && run.nitrousUsed < s.nitrousSeconds;
  // gearbox: the lowest gear whose redline is still above the current speed; an upshift interrupts drive
  let gear = Math.min(n, Math.max(1, run.gear ?? 1));
  if (gear < n && run.speed >= vTop * gearTop(gear, n)) { while (gear < n && run.speed >= vTop * gearTop(gear, n)) gear++; run.shiftLeft = GEARBOX.shift[level]; }
  while (gear > 1 && run.speed < .85 * vTop * gearTop(gear - 1, n)) gear--; // only after a real loss of speed (hysteresis: no shift hunting)
  run.gear = gear;
  const shifting = (run.shiftLeft ?? 0) > 0, x = run.speed / (vTop * gearTop(gear, n));
  // heat follows the engine load; airflow at speed helps the radiator
  const load = shifting ? .3 : .35 + .65 * powerCurve(Math.min(x, 1)) + (useBoost ? .7 : 0);
  run.temperature = (run.temperature ?? C.T0) + (C.HEAT_GAIN * s.heatRate * load - Math.max(0, (run.temperature ?? C.T0) - C.T0) * (C.COOL_BASE + s.cooling * C.COOL_PART) * (1 + run.speed / C.AIRFLOW_V)) * h;
  const thermalFactor = run.temperature > C.T_HOT ? Math.max(C.HOT_MIN, 1 - (run.temperature - C.T_HOT) * C.HOT_LOSS) : 1;
  // F = P / v = P_peak · T(x) / (PEAK_POWER · v_gear): finite at standstill (no 0/0), it is simply the engine torque through the gear
  const powerForce = shifting ? 0 : (s.hp + (useBoost ? s.nitrousHp : 0)) * 745.7 * thermalFactor * (1 + assistance) * s.delivery * torqueCurve(x) / (PEAK_POWER * vTop * gearTop(gear, n));
  const downforce = .5 * C.RHO * s.downforce * run.speed ** 2;
  const mu = C.MU * s.grip * (1 + assistance * .5);
  const tireForce = (s.mass * C.G + downforce) * mu * s.rear / (1 - Math.min(.8, mu * C.CG)) * (C.GRIP_USE + (1 - C.GRIP_USE) * Math.min(100, s.stability) / 100);
  const slip = powerForce > tireForce ? 1 - tireForce / powerForce : 0;
  const driveForce = Math.min(powerForce, tireForce);
  const dragForce = .5 * C.RHO * s.drag * C.AREA * run.speed ** 2;
  const acceleration = Math.max(shifting ? -3 : 0, (driveForce - dragForce - s.mass * C.ROLL) / s.mass);
  const previousSpeed = run.speed, previousDistance = run.distance;
  run.speed = Math.max(0, Math.min(vTop * (1 + assistance), run.speed + acceleration * h)); run.distance += (previousSpeed + run.speed) * .5 * h; run.time += h;
  run.slip = slip; run.boosting = useBoost; run.rpm = Math.min(1.05, x); run.shifting = shifting;
  if (shifting) run.shiftLeft = Math.max(0, run.shiftLeft - h);
  if (useBoost) run.nitrousUsed += h;
  if (run.zeroTo100 === null && run.speed >= 100 / 3.6 && run.speed > previousSpeed) run.zeroTo100 = run.time - h + h * ((100 / 3.6 - previousSpeed) / (run.speed - previousSpeed));
  const target = raceDefinition(run.race).distance;
  if (run.distance >= target || run.time >= 60) {
    if (run.distance >= target && run.distance > previousDistance) run.time -= h * (run.distance - target) / (run.distance - previousDistance);
    run.finished = true; run.distance = Math.min(target, run.distance); run.boosting = false;
  }
}
export function newRun(race = 'sprint') { return { race: raceDefinition(race).id, speed: 0, distance: 0, time: 0, zeroTo100: null, nitrousUsed: 0, slip: 0, boosting: false, finished: false, temperature: PHYSICS.T0, gear: 1, shiftLeft: 0, rpm: 0, shifting: false }; }
export function rewardRun(state, run, projectId = state.active) {
  if (!run.finished || run.rewarded || !Object.hasOwn(state.projects, projectId)) return 0;
  run.rewarded = true;
  const project = state.projects[projectId], race = raceDefinition(run.race), reward = race.reward;
  state.credits += reward; state.totalRuns++; project.runs++; state.xp += race.xp;
  const bestKey = race.id === 'highway' ? 'bestHighway' : 'best';
  if (project[bestKey] === null || run.time < project[bestKey]) project[bestKey] = run.time;
  project.condition = Math.max(60, project.condition - (2 + Math.max(0, run.temperature - 100) * .12 + (project.parts.turbo ? (project.tune.boost - 1) * 5 : 0)));
  addFeed(state, `${carDefinition(project).name} ran ${race.distance} m in ${run.time.toFixed(2)} s · +${reward} credits`, 'run');
  return reward;
}
export function claimContract(state, id) {
  const contract = CONTRACTS.find(c => c.id === id), p = state.projects[state.active];
  if (!contract || state.claimed.includes(id)) return { ok: false, reason: 'This contract has already been claimed.' };
  if (contract.progress(state, p) < contract.target) return { ok: false, reason: 'Finish the contract objectives first.' };
  state.claimed.push(id); state.credits += contract.reward; state.xp += contract.xp;
  addFeed(state, `${contract.name} complete · +${contract.reward} credits / +${contract.xp} rep`, 'save');
  return { ok: true, contract };
}
export function serviceCar(state) {
  const p = state.projects[state.active], cost = Math.ceil((100 - p.condition) * 12);
  if (!cost) return { ok: false, reason: 'This car is already in perfect condition.' };
  if (state.credits < cost) return { ok: false, reason: `Service needs ${cost - state.credits} more credits.` };
  state.credits -= cost; p.condition = 100; addFeed(state, `Full service complete · ${cost} credits`, 'part'); return { ok: true, cost };
}
export function recordDyno(state) { const p = state.projects[state.active]; const xp = p.dynoDone ? 0 : 60; p.dynoDone = true; state.xp += xp; addFeed(state, `Dyno: ${stats(p).hp} hp at the crank / ${Math.round(stats(p).hp * stats(p).delivery)} hp at the wheels`, 'run'); return xp; }
