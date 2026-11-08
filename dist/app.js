const PrintLive = (() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const scene = new PrinterScene(byId('machine'));
  const threshold = byId('threshold');
  const connect = byId('connect');
  const camera = byId('camera');
  const queue = [];
  const seen = new Set();
  const numberFormat = new Intl.NumberFormat('en-US');

  let busy = false;
  let jobNumber = 0;
  let testIndex = 0;

  function sample(paper, halo, portrait) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
      <rect width="240" height="240" fill="${paper}"/><circle cx="120" cy="116" r="91" fill="${halo}"/>
      <g fill="none" stroke="#ffffff" opacity=".55"><circle cx="120" cy="116" r="99"/><path d="M0 200h240M0 36h240M37 0v240m166-240v240"/></g>
      <path fill="#fff6db" d="m47 55 4 9 9 4-9 4-4 9-4-9-9-4 9-4zm144 45 3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/>
      ${portrait}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  const tests = [
    { name: '@miso.cat', gift: 'Rose', value: 1, url: sample('#8da486', '#d8dcb1', `
      <path d="M53 222q6-57 67-65 59 8 67 65" fill="#345a50" stroke="#27382f" stroke-width="4"/>
      <path d="M64 115Q57 77 70 46l41 35q11-4 21 0l35-35q15 35 11 72c7 28-16 51-58 52-42 0-66-23-56-55Z" fill="#e4a04f" stroke="#372d25" stroke-width="4" stroke-linejoin="round"/>
      <path d="m76 61 23 23-23 11Zm88 0-23 23 25 11Z" fill="#f3b59d"/>
      <path d="M74 139q13-10 45-8 34-2 47 8-14 27-46 28-33 0-46-28" fill="#ffdeb0"/>
      <path d="m108 88 8 19m6-20v19m12-18-6 19M89 125l-29-2m26 10-25 5m88-13 29-2m-25 10 25 5" stroke="#644329" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="94" cy="119" rx="6" ry="8" fill="#263024"/><ellipse cx="144" cy="119" rx="6" ry="8" fill="#263024"/>
      <path d="m113 134 7 6 7-6Z" fill="#51302d"/><path d="M120 139v4m0 0q-4 7-9 3m9-3q4 7 9 3" stroke="#51302d" stroke-width="2" fill="none"/>
      <path d="M98 171q23 11 45 0l-6 13-17 4-16-4Z" fill="#de723f"/><circle cx="120" cy="188" r="6" fill="#f8cb69"/>`) },
    { name: '@nova.orbit', gift: 'Star', value: 10, url: sample('#8078a9', '#c8badb', `
      <path d="M46 229q12-53 74-53 56 0 74 53" fill="#e8e1d2" stroke="#292d48" stroke-width="5"/>
      <path d="M86 174h66v20H86z" fill="#f19b6e" stroke="#292d48" stroke-width="4"/>
      <rect x="50" y="103" width="140" height="46" rx="13" fill="#f19b6e" stroke="#292d48" stroke-width="5"/>
      <rect x="62" y="56" width="116" height="125" rx="55" fill="#f6ecd8" stroke="#292d48" stroke-width="5"/>
      <rect x="75" y="80" width="90" height="76" rx="34" fill="#373960" stroke="#292d48" stroke-width="4"/>
      <path d="M92 106q11-16 28-16" stroke="#bcaee8" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="m128 104 5 10 10 4-10 4-5 10-4-10-10-4 10-4Z" fill="#f5d290"/>
      <circle cx="103" cy="127" r="3" fill="#f5d290"/><path d="M98 214h44" stroke="#292d48" stroke-width="5" stroke-linecap="round"/>`) },
    { name: '@ari.draws', gift: 'Heart', value: 5, url: sample('#cc8284', '#e9b8ac', `
      <path d="M50 227q6-46 70-60 63 13 70 60" fill="#664265" stroke="#3e2949" stroke-width="5"/>
      <path d="M64 136V99c0-35 25-53 55-53s57 19 57 57v45q-1 31-25 45H86q-22-14-22-57" fill="#45324e"/>
      <path d="M106 155h29v35q-13 10-29 0Z" fill="#bf7d66"/>
      <path d="M83 103q34-1 48-23 8 20 28 26v26q-4 39-38 42-35-2-38-42Z" fill="#e6ab8c"/>
      <path d="M88 118q9-8 22-1m20 0q12-7 22 0" fill="none" stroke="#5d3a45" stroke-width="3" stroke-linecap="round"/>
      <path d="M106 149q15 10 29 0" fill="none" stroke="#8c505c" stroke-width="3" stroke-linecap="round"/>
      <circle cx="101" cy="126" r="4" fill="#45324e"/><circle cx="141" cy="126" r="4" fill="#45324e"/>
      <path d="m77 79 15 3m-17 4 13 3" stroke="#f4d17f" stroke-width="3" stroke-linecap="round"/>
      <circle cx="86" cy="145" r="6" fill="none" stroke="#f4d17f" stroke-width="3"/><circle cx="156" cy="145" r="6" fill="none" stroke="#f4d17f" stroke-width="3"/>`) }
  ];

  function minimum(value) {
    return Math.max(1, Math.min(1000000, Math.floor(Number(value) || 1)));
  }

  try {
    threshold.value = minimum(localStorage.getItem('print-live-minimum'));
  } catch {
    threshold.value = 1;
  }

  threshold.addEventListener('change', () => {
    threshold.value = minimum(threshold.value);
    try {
      localStorage.setItem('print-live-minimum', threshold.value);
    } catch {
      // The active threshold still works when browser storage is disabled.
    }
  });

  function showQueue() {
    byId('queue-count').textContent = String(queue.length).padStart(2, '0');
    byId('queue-empty').hidden = queue.length > 0;
    byId('queue').replaceChildren(...queue.slice(0, 30).map((job) => {
      const row = document.createElement('li');
      const index = document.createElement('span');
      const name = document.createElement('span');
      index.textContent = String(job.number).padStart(2, '0');
      name.textContent = `${job.name} · ${job.gift}`;
      row.append(index, name);
      return row;
    }));
  }

  function enqueue(gift) {
    const initials = Array.from(gift.name.replace(/^@/, '').trim()).slice(0, 2).join('').toUpperCase();
    queue.push({ ...gift, initials: initials || '?', number: ++jobNumber });
    showQueue();
    if (!busy) void drawNext();
  }

  function loadImage(urls) {
    if (!urls.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      let index = 0;
      const timeout = setTimeout(() => finish(null), 5000);
      function finish(result) {
        clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        resolve(result);
      }
      function tryNext() {
        const url = urls[index++];
        if (url) image.src = url;
        else finish(null);
      }
      image.referrerPolicy = 'no-referrer';
      image.alt = '';
      image.onload = () => finish(image);
      image.onerror = tryNext;
      tryNext();
    });
  }

  function setProgress(percent) {
    byId('progress-value').textContent = `${percent}%`;
    byId('progress').value = percent;
  }

  function setMachine(label, active) {
    byId('machine-text').textContent = label;
    byId('machine-state').dataset.active = String(active);
  }

  function animate(job) {
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 850;
    let start;
    let lastPercent = -1;
    return new Promise((resolve) => {
      function step(now) {
        start ??= now;
        const progress = Math.min(1, (now - start) / duration);
        const percent = Math.floor(progress * 100);
        if (percent !== lastPercent) {
          setProgress(percent);
          lastPercent = percent;
        }
        scene.update(job, progress);
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  async function drawNext() {
    const current = queue.shift();
    if (!current) {
      busy = false;
      return;
    }
    busy = true;
    showQueue();
    setMachine('LOADING PAPER', true);
    setProgress(0);
    byId('job-label').textContent = current.demo ? 'TEST GIFT' : 'TIKTOK LIVE GIFT';
    byId('job-name').textContent = current.name;
    const details = `${current.gift} · ${numberFormat.format(current.value)} ♦`;
    byId('job-info').textContent = details;
    byId('job-portrait').textContent = current.initials;
    scene.update(current, 0);

    current.image = await loadImage(current.urls);
    if (current.image) byId('job-portrait').replaceChildren(current.image);
    else byId('job-info').textContent = `${details} · Avatar unavailable. Drawing initials.`;
    setMachine('DRAWING', true);
    await animate(current);
    setMachine('DRAWING COMPLETE', true);
    byId('job-label').textContent = current.demo ? 'TEST COMPLETE' : 'PORTRAIT COMPLETE';
    setTimeout(() => void drawNext(), 1800);
  }

  function textField(...values) {
    return values.find((value) => typeof value === 'string' && value.trim())?.trim();
  }

  function avatarUrls(...values) {
    const urls = new Set();
    for (const value of values.flat()) {
      if (typeof value !== 'string') continue;
      try {
        const url = new URL(value);
        if (url.protocol === 'https:' && !url.username && !url.password) urls.add(url.href);
      } catch {
        continue;
      }
    }
    return [...urls];
  }

  function receiveGift(event) {
    if (event?.event !== 'gift' || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    const gift = data.gift ?? {};
    const type = Number(data.giftType ?? gift.type ?? gift.giftType ?? gift.gift_type);
    const end = data.repeatEnd ?? gift.repeatEnd ?? gift.repeat_end;
    if (type === 1 && ![true, 1, '1', 'true'].includes(end)) return;
    if (type !== 1 && data.streaking === true) return;

    const repeats = Number(data.repeatCount ?? gift.repeat_count ?? 1);
    const units = Number(data.diamondCount ?? gift.diamondCount ?? gift.diamond_count ?? data.extendedGiftInfo?.diamond_count);
    const value = data.totalDiamonds != null ? Number(data.totalDiamonds) : units * repeats;
    if (!Number.isSafeInteger(value) || value < minimum(threshold.value)) return;

    const user = data.user ?? {};
    const handle = textField(data.uniqueId, user.uniqueId, user.displayId);
    const name = handle ? `@${handle.replace(/^@/, '')}` : (textField(data.nickname, user.nickname) ?? 'Spectator');
    const giftId = data.giftId ?? gift.gift_id ?? gift.id ?? '';
    const messageId = data.msgId ?? data.common?.msgId;
    const key = messageId ? `${messageId}/${giftId}` : '';
    if (key && seen.has(key)) return;
    if (key) {
      seen.add(key);
      if (seen.size > 500) seen.delete(seen.values().next().value);
    }

    const urls = avatarUrls(
      data.profilePictureUrl,
      user.profilePictureUrl,
      user.avatarThumb?.urlList,
      user.avatarThumb?.url_list,
      data.userDetails?.profilePictureUrls
    );
    enqueue({
      name: name.slice(0, 80), urls, value,
      gift: (textField(data.giftName, gift.name, data.extendedGiftInfo?.name) ?? 'Gift').slice(0, 80),
      demo: false
    });
  }

  function connectionState(label, connected, wantsConnection) {
    byId('connection-state').textContent = label;
    byId('connection-help').textContent = connected
      ? 'Eligible gifts received while the Print tab is open join the queue.'
      : 'Open TikFinity Desktop on this PC and connect it to your LIVE.';
    byId('status-dot').dataset.connected = String(connected);
    connect.firstChild.textContent = wantsConnection ? 'Disconnect TikFinity ' : 'Connect TikFinity ';
  }

  byId('demo').addEventListener('click', () => {
    const { url, ...test } = tests[testIndex % tests.length];
    testIndex += 1;
    enqueue({ ...test, urls: [url], demo: true, value: Math.max(test.value, minimum(threshold.value)) });
  });

  camera.addEventListener('click', () => {
    scene.closeup = !scene.closeup;
    scene.draw();
    camera.setAttribute('aria-pressed', String(scene.closeup));
    camera.lastElementChild.textContent = scene.closeup ? 'Printer view' : 'Paper view';
    byId('camera-name').textContent = scene.closeup ? 'CAMERA 02' : 'CAMERA 01';
  });

  scene.draw();
  return { receiveGift, connectionState };
})();
