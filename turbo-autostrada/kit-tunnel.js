// TUNEL-KIT: publica pagina cu asset-uri (public/kit) pe internet printr-un link https://....trycloudflare.com
// Nu are nevoie de joc pornit. Inchide fereastra ca sa opresti linkul.
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(__dirname, 'public', 'kit');
const PORT = 3100;
const LOCAL = `http://127.0.0.1:${PORT}`;
const isWin = process.platform === 'win32';
const exe = path.join(__dirname, 'tools', isWin ? 'cloudflared.exe' : 'cloudflared');
const BIN = isWin ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
                  : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

if (!fs.existsSync(path.join(KIT, 'index.html'))) {
  console.log('\n  ❌ Nu gasesc kitul in ' + KIT);
  console.log('  Dezarhiveaza turbostrada-kit.zip in folderul public\\kit (acolo trebuie sa fie index.html).\n');
  process.exit(1);
}

const app = express();
app.use(express.static(KIT, { maxAge: '1h' }));
const server = http.createServer(app);
server.on('error', e => { console.log('\n  ❌ Portul ' + PORT + ' e ocupat (' + e.code + '). Inchide alta fereastra TUNEL-KIT si incearca din nou.\n'); process.exit(1); });

async function ensureBinary() {
  if (fs.existsSync(exe)) return;
  console.log('  Descarc cloudflared (o singura data, ~40 MB)...');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  const r = await fetch(BIN);
  if (!r.ok) throw new Error('descarcare esuata: ' + r.status);
  fs.writeFileSync(exe, Buffer.from(await r.arrayBuffer()));
  if (!isWin) fs.chmodSync(exe, 0o755);
}

server.listen(PORT, '127.0.0.1', async () => {
  console.log('\n  🎨 Kitul ruleaza local: ' + LOCAL + '/');
  try { await ensureBinary(); } catch (e) { console.log('\n  ❌ Nu am putut descarca cloudflared:', e.message, '\n'); return; }
  console.log('  Pornesc tunelul...');
  const cp = spawn(exe, ['tunnel', '--no-autoupdate', '--url', LOCAL], { stdio: ['ignore', 'pipe', 'pipe'] });
  let shown = false;
  const onData = d => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(String(d));
    if (m && !shown) {
      shown = true;
      console.log('\n  ✅ LINK PUBLIC PENTRU KIT:\n');
      console.log('     ' + m[0] + '/\n');
      console.log('  Trimite linkul cui vrei. Merge cat timp fereastra asta e deschisa.');
      console.log('  Linkul se schimba la fiecare pornire. (Daca primul acces da eroare, asteapta 10-20 s.)\n');
    }
  };
  cp.stdout.on('data', onData); cp.stderr.on('data', onData);
  cp.on('exit', code => { console.log('  Tunel oprit (' + code + ').'); process.exit(0); });
  process.on('SIGINT', () => cp.kill());
});
