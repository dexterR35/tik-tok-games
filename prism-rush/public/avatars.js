// Viewer photos for the HUD and for joker pieces. Photos come through the
// local server's /api/avatar proxy (same origin, so WebGL may draw them).
// Without a photo (demo viewers, hosted demo) a colored initials badge is used.
const cache = new Map();
let enabled = true;
export function setPhotosEnabled(value) { enabled = value; }
const hue = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };
const initials = name => String(name || '?').replace(/·.*$/, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

// Returns { canvas, ready } — the canvas is drawn immediately with initials
// and redrawn when the photo arrives; listeners are told to refresh.
export function avatarCanvas(id, person = {}, size = 128) {
  const key = `${id}:${size}:${person.photo ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const entry = { canvas, listeners: new Set(), photo: false };
  const draw = img => {
    const ctx = canvas.getContext('2d'), r = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save(); ctx.beginPath(); ctx.arc(r, r, r * .86, 0, Math.PI * 2); ctx.clip();
    if (img) { const s = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size); }
    else {
      const g = ctx.createLinearGradient(0, 0, size, size); g.addColorStop(0, `hsl(${hue(id)},70%,62%)`); g.addColorStop(1, `hsl(${(hue(id) + 40) % 360},70%,42%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#fff'; ctx.font = `${Math.round(size * .38)}px Lilita, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(initials(person.name || id), r, r * 1.06);
    }
    ctx.restore();
    // gold joker frame
    ctx.lineWidth = size * .09; ctx.strokeStyle = '#ffd25e'; ctx.beginPath(); ctx.arc(r, r, r * .86, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = size * .025; ctx.strokeStyle = '#8a4b00'; ctx.beginPath(); ctx.arc(r, r, r * .96, 0, Math.PI * 2); ctx.stroke();
    entry.listeners.forEach(fn => fn());
  };
  draw(null);
  if (enabled && person.photo) {
    const img = new Image();
    img.onload = () => { entry.photo = true; draw(img); };
    img.src = `/api/avatar?id=${encodeURIComponent(id)}`;
  }
  cache.set(key, entry);
  if (cache.size > 600) cache.delete(cache.keys().next().value);
  return entry;
}

// DOM badge: <span class="ava"> with the photo or initials.
export function avatarEl(id, person = {}, cls = '') {
  const el = document.createElement('span'); el.className = `ava ${cls}`.trim();
  if (!id) { el.textContent = '♡'; el.classList.add('empty'); return el; }
  el.style.setProperty('--h', hue(id));
  el.textContent = initials(person.name || id);
  if (enabled && person.photo) {
    const img = new Image(); img.alt = ''; img.decoding = 'async';
    img.onload = () => { el.textContent = ''; el.append(img); };
    img.src = `/api/avatar?id=${encodeURIComponent(id)}`;
  }
  return el;
}
// Puts a badge into a container only when the person changed (renders run
// 20 times a second; this keeps photos from reloading or flickering).
export function setAvatar(container, id, person = {}, cls = '') {
  const key = `${id || ''}|${person.photo ? 1 : 0}|${person.name || ''}`;
  if (container.dataset.ava === key) return;
  container.dataset.ava = key; container.replaceChildren(avatarEl(id, person, cls));
}
