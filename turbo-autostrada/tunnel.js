// TUNEL: face jocul accesibil pe internet printr-un link https (pentru LIVE Studio, prieteni, moderatori).
// Porneste cu TUNEL.bat dupa START.bat. Inchide fereastra ca sa opresti tunelul.
//
// Doua feluri de tunel:
//  1) RAPID (implicit, fara cont): link https://....trycloudflare.com, nou la fiecare pornire. Cloudflare il da doar pentru teste:
//     fara garantie ca ramane pornit si maxim 200 de cereri deodata.
//  2) FIX (recomandat pentru live-uri): cont Cloudflare gratuit + domeniul tau. Pui in config.json (sau in lives/x.json):
//        "tunnelToken": "eyJ...",              <- din Cloudflare: Networks > Tunnels > Create > Cloudflared > token-ul din comanda
//        "tunnelHostname": "joc.domeniul-tau.ro"  <- Public hostname-ul tunelului, cu Service = http://127.0.0.1:3000 (portul jocului)
//     Linkul nu se mai schimba, iar linkul pentru LIVE Studio il pui o singura data.
// In ambele cazuri, daca tunelul cade, porneste singur din nou.
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } };
const cfg = readJson(path.join(__dirname, 'config.json'));
const liveArg = (process.argv[2] || '').endsWith('.json') ? process.argv[2] : '';
const liveCfg = liveArg ? readJson(path.resolve(__dirname, liveArg)) : {};
const PORT = Number(liveCfg.port || cfg.port || 3000); // TUNEL.bat lives/clasic.json = tunel pentru live-ul acela
// tunelul fix: pentru un live anume se ia DOAR din fisierul lui (un token = o adresa = un singur joc)
const fixed = liveArg ? liveCfg : cfg;
const TOKEN = String(fixed.tunnelToken || '').trim();
const HOST = String(fixed.tunnelHostname || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const NAMED = !!(TOKEN && HOST);
const LOCAL = `http://127.0.0.1:${PORT}`; // nu 'localhost': pe Windows poate merge pe IPv6 si da 502
const isWin = process.platform === 'win32';
const exe = path.join(__dirname, 'tools', isWin ? 'cloudflared.exe' : 'cloudflared');
const URLS = {
  win32: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
  linux: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
};
if ((fixed.tunnelToken || fixed.tunnelHostname) && !NAMED) console.log('\n  ⚠ Pentru tunelul fix trebuie AMBELE: "tunnelToken" si "tunnelHostname". Pornesc tunelul rapid.\n');

async function ensureBinary() {
  if (fs.existsSync(exe)) return;
  console.log('  Descarc cloudflared (o singura data, ~40 MB)...');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  const r = await fetch(URLS[process.platform] || URLS.linux);
  if (!r.ok) throw new Error('descarcare esuata: ' + r.status);
  const tmp = exe + '.download';
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  fs.renameSync(tmp, exe); // o descarcare intrerupta nu lasa un .exe stricat
  if (!isWin) fs.chmodSync(exe, 0o755);
}

async function tellServer(url) {
  try { const r = await fetch(`${LOCAL}/api/tunnel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(5000) }); return (await r.json()).liveLink || ''; } catch { return ''; }
}
// copiaza in clipboard (Windows)
function copy(text) { try { if (isWin) { const c = spawn('clip'); c.on('error', () => {}); c.stdin.end(text); } } catch {} }
const up = async () => { try { return (await fetch(LOCAL + '/panel.html', { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; } };

let currentUrl = '', lastLiveLink = '', cp = null, stopping = false, restartMs = 2000, restartTimer = null;

async function announce(u) {
  currentUrl = u;
  console.log('\n  ✅ TUNEL PORNIT' + (NAMED ? ' (adresa fixa)' : '') + '\n');
  console.log('  🎮 Jocul (pentru prieteni, doar privesc):  ' + u + '/');
  console.log('  🎛️  Panoul de control (cere parola):        ' + u + '/panel.html');
  if (fs.existsSync(path.join(__dirname, 'public', 'kit', 'index.html'))) console.log('  🎨 Kitul de asset-uri:                     ' + u + '/kit/');
  console.log('  🔑 Parola panoului: config.json -> "panelPassword"' + (cfg.panelPassword || liveCfg.panelPassword ? '' : '  (NU E SETATA: panoul de la distanta nu va merge)'));
  if (!NAMED) console.log('\n  Linkul se schimba la fiecare pornire. Pentru un link fix vezi CITESTE.md -> "Link fix pentru LIVE Studio".');
  console.log('  Inchide fereastra ca sa opresti tunelul.\n');
  const link = await tellServer(u);
  if (!link) return;
  const studioChanged = !!lastLiveLink && link !== lastLiveLink;
  lastLiveLink = link;
  console.log('  🎥 LINK PENTRU TIKTOK LIVE STUDIO (sursa Link, 1080 x 1920) - deja copiat, lipeste cu Ctrl+V:\n');
  console.log('     ' + link + '\n');
  if (studioChanged) console.log('  ⚠ LINKUL PENTRU STUDIO S-A SCHIMBAT (tunel sau joc repornit): pune-l pe cel nou in LIVE Studio (sursa Link -> Proprietati).\n');
  console.log('  ⚠ Nu da acest link nimanui: cine il are poate controla jocul.' + (NAMED ? ' Ca sa-l schimbi: sterge data\\...\\live-key.txt si reporneste jocul.' : ' Se schimba la fiecare pornire.') + '\n');
  copy(link);
}

function startTunnel() {
  restartTimer = null;
  console.log('  Pornesc tunelul ' + (NAMED ? 'fix (' + HOST + ')' : 'rapid') + ' catre ' + LOCAL + ' ...');
  // tokenul merge prin variabila de mediu, nu in linia de comanda (nu apare in lista de procese)
  const args = NAMED ? ['tunnel', '--no-autoupdate', 'run'] : ['tunnel', '--no-autoupdate', '--url', LOCAL];
  const env = NAMED ? { ...process.env, TUNNEL_TOKEN: TOKEN } : process.env;
  const child = cp = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true });
  let shown = false;
  const startedAt = Date.now();
  const onData = d => {
    const text = String(d);
    if (shown) return;
    if (NAMED) {
      if (/Registered tunnel connection/i.test(text)) { shown = true; announce('https://' + HOST); }
      else if (/Unauthorized|invalid.*token|token.*invalid/i.test(text)) console.log('  ❌ Cloudflare nu accepta tokenul. Verifica "tunnelToken" din config.json.');
      return;
    }
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
    if (m) { shown = true; announce(m[0]); }
  };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  child.on('error', e => console.log('  ❌ Nu pot porni cloudflared:', e.message));
  child.on('exit', code => {
    if (child !== cp) return;
    cp = null;
    if (stopping) return;
    if (!NAMED) { currentUrl = ''; tellServer(''); }
    if (Date.now() - startedAt > 120000) restartMs = 2000; // a mers macar 2 minute: repornim repede
    console.log(`\n  ⚠ Tunelul s-a oprit (${code}). Repornesc in ${Math.round(restartMs / 1000)} s...`);
    restartTimer = setTimeout(startTunnel, restartMs);
    restartMs = Math.min(30000, restartMs * 2);
  });
}

(async () => {
  if (!(await up())) {
    console.log('\n  ❌ Serverul jocului NU ruleaza pe ' + LOCAL + '. Porneste START.bat si lasa-l deschis.');
    console.log('  Astept serverul... (Ctrl+C ca sa renunti)\n');
    while (!(await up())) await new Promise(r => setTimeout(r, 2000));
    console.log('  ✅ Serverul a pornit.');
  }
  try { await ensureBinary(); } catch (e) { console.log('\n  ❌ Nu am putut descarca cloudflared:', e.message, '\n'); process.exit(1); }
  startTunnel();
  // serverul jocului a fost repornit: afla din nou linkul (altfel panoul si LIVE Studio nu-l mai stiu)
  let wasUp = true;
  setInterval(async () => {
    const ok = await up();
    if (!ok && wasUp) console.log('\n  ⚠ Serverul jocului s-a oprit: linkul da 502 pana repornesti START.bat.');
    if (ok && !wasUp) { console.log('  ✅ Serverul a revenit.'); if (currentUrl) announce(currentUrl); }
    wasUp = ok;
  }, 5000);
  const stop = () => { stopping = true; clearTimeout(restartTimer); tellServer('').finally(() => { try { cp && cp.kill(); } catch {} setTimeout(() => process.exit(0), 300); }); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('SIGBREAK', stop); process.on('SIGHUP', stop);
})();
