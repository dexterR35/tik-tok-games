(() => {
  'use strict';

  const get = id => document.getElementById(id);
  const game = ArcadeGames;
  const scene = new ArcadeScene(get('arena-scene'));
  const choices = [...document.querySelectorAll('.game-choice')];
  const scoreRows = new Map();
  const seenEvents = new Set();
  const inputQueue = [];
  const inputsPerFrame = 64;
  const queueLimit = 1024;
  const raidViewers = get('raid-viewers');
  const demos = ['ana.live', 'miso.cat', 'nova.orbit', 'you.demo'].map(handle => ({
    key: `demo:${handle}`, name: `@${handle}`, initials: handle.slice(0, 2).toUpperCase()
  }));
  const formatter = new Intl.NumberFormat('en-US');
  const socketUrl = 'ws://localhost:21213/';
  const rounds = new Map();
  let mode = '';
  let round = null;
  let ranked = [];
  let frame = 0;
  let nextUi = 0;
  let nextDemo = 0;
  let demoStep = 0;
  let lastGift = null;
  let socket = null;
  let retry = 0;
  let wantsConnection = false;
  let connected = false;
  let liveViewers = 0;

  const running = () => round !== null && round.ended === null;

  function updateViewerCount(count) {
    liveViewers = count;
    syncRaidEstimate();
  }

  function syncRaidEstimate() {
    const locked = running() && round.raidViewers;
    get('raid-auto').textContent = locked
      ? `Sized for ${formatter.format(locked)} ${locked === 1 ? 'viewer' : 'viewers'}`
      : liveViewers ? `Auto · ${formatter.format(liveViewers)} LIVE viewers` : 'Auto uses the LIVE count';
  }

  function syncControls() {
    const active = running();
    for (const choice of choices) {
      const selected = choice.dataset.mode === mode;
      choice.setAttribute('aria-selected', String(selected));
      choice.tabIndex = selected ? 0 : -1;
    }
    get('start-demo').hidden = active;
    get('start-live').hidden = active;
    get('start-live').disabled = !connected;
    get('end-round').hidden = !active;
    get('demo-controls').hidden = !active || !round.demo;
    get('raid-settings').hidden = !game.isRaid(mode);
    raidViewers.disabled = active;
    syncRaidEstimate();
    get('controls-help').textContent = active
      ? (round.demo ? 'The demo plays automatically. Switching tabs ends the round.' : 'Viewers join with !join, a tap, or a gift. Switching tabs ends the round.')
      : (connected ? 'Start the round when you are ready for viewers to join.' : 'Connect TikFinity Desktop to your LIVE to play with viewers.');
  }

  function rowFor(player) {
    if (!scoreRows.has(player.key)) {
      const item = document.createElement('li');
      const cells = ['rank-position', 'rank-avatar', 'rank-name', 'rank-score'].map(className => {
        const span = document.createElement('span');
        span.className = className;
        item.append(span);
        return span;
      });
      const [position, avatar, name, score] = cells;
      avatar.textContent = player.initials;
      avatar.style.setProperty('--player', player.color);
      name.textContent = player.name;
      scoreRows.set(player.key, { item, position, avatar, score });
    }
    return scoreRows.get(player.key);
  }

  function updateUi(now) {
    const info = game.modes[mode];
    const remaining = round ? Math.max(0, Math.ceil((round.deadline - (round.ended ?? now)) / 1000)) : info.seconds;
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');
    get('round-time').textContent = `${minutes}:${seconds}`;
    get('round-state').textContent = round ? (running() ? (round.demo ? 'DEMO' : 'LIVE') : 'FINISHED') : 'READY';
    const count = round?.players.size ?? 0;
    const countLabel = count === 1 ? '1 player' : `${formatter.format(count)} players`;
    get('arena-metric').textContent = countLabel;
    get('player-count').textContent = formatter.format(count);
    const note = round?.result || (running() && !round.demo && count === 0 ? 'Type !join in chat or tap to join the round.' : info.objective);
    if (get('arena-note').textContent !== note) get('arena-note').textContent = note;

    ranked = round ? game.rankings(round) : [];
    const items = ranked.slice(0, 6).map((player, index) => {
      const row = rowFor(player);
      row.position.textContent = String(index + 1).padStart(2, '0');
      const score = mode === 'race' ? Math.min(game.raceGoal, player.score) : player.score;
      row.score.textContent = `${formatter.format(Math.floor(score))}${info.suffix}`;
      if (player.picture && row.avatar.firstChild !== player.picture) row.avatar.replaceChildren(player.picture);
      return row.item;
    });
    get('rankings').replaceChildren(...items);
    get('rank-empty').hidden = count > 0;
  }

  function updateGift(now) {
    const alert = get('arena-flash');
    alert.hidden = !lastGift || now - lastGift.at >= 1600;
    if (!alert.hidden) alert.textContent = `${lastGift.player.name} · ${lastGift.label}`;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    if (mode === 'print') return;
    const now = performance.now();
    const active = running();
    if (active && round.demo && now >= nextDemo) {
      const actor = demos[demoStep % demos.length];
      const kind = demoStep % 5 === 2 ? 'gift' : 'like';
      receive({ actor, kind, count: kind === 'gift' ? 25 : 5 + (demoStep % 4) * 3 }, now);
      demoStep += 1;
      nextDemo = now + 850;
    }
    drainInputs(inputsPerFrame);
    if (running() && !inputQueue.length) game.tick(round, now);
    const justFinished = active && !running();
    if (justFinished) syncControls();
    if (now >= nextUi || justFinished) {
      updateUi(now);
      nextUi = now + 150;
    }
    scene.draw(mode, round, ranked, now);
    updateGift(now);
    const settling = round?.ended != null && now - round.ended < 450;
    if (running() || settling || (lastGift && now - lastGift.at < 1600)) schedule();
  }

  function loadPicture(player) {
    if (player.avatarAttempted || !player.avatar) return;
    player.avatarAttempted = true;
    const image = new Image();
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    let index = 0;
    const timeout = setTimeout(stop, 5000);
    function stop() {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
    }
    function tryNext() {
      const url = player.avatar[index++];
      if (url) image.src = url;
      else stop();
    }
    image.onerror = tryNext;
    image.onload = () => {
      stop();
      player.picture = image;
      nextUi = 0;
      schedule();
    };
    tryNext();
  }

  function receive(event, now = performance.now()) {
    if (!running() || now >= round.deadline) return;
    if (inputQueue.length >= queueLimit) drainInputs(inputsPerFrame);
    if (running()) inputQueue.push({ event, now });
    else syncControls();
    schedule();
  }

  function drainInputs(limit = queueLimit) {
    // Use arrival times so a backlog cannot move a hit past the deadline.
    for (const { event, now } of inputQueue.splice(0, limit)) {
      if (!running()) break;
      const player = game.apply(round, event, now);
      if (player) {
        loadPicture(player);
        if (event.kind === 'gift') lastGift = round.effect;
      }
    }
    if (!running()) inputQueue.length = 0;
  }

  function finishRound(now) {
    drainInputs();
    game.tick(round, now);
    game.finish(round, now);
  }

  function selectMode(next) {
    if (next === mode) return;
    if (running()) {
      finishRound(performance.now());
    }
    mode = next;
    round = rounds.get(mode) ?? null;
    lastGift = null;
    scoreRows.clear();
    document.body.dataset.game = mode;
    const isPrint = mode === 'print';
    get('print-panel').hidden = !isPrint;
    get('game-panel').hidden = isPrint;
    syncControls();
    if (isPrint) return;
    get('game-panel').setAttribute('aria-labelledby', `tab-${mode}`);
    const info = game.modes[mode];
    get('game-label').textContent = info.label;
    get('game-title').textContent = info.title;
    get('rule-like').textContent = info.like;
    get('rule-gift').textContent = info.gift;
    get('score-unit').textContent = info.unit;
    get('arena-scene').setAttribute('aria-label', info.canvasLabel);
    nextUi = 0;
    schedule();
  }

  function start(demo) {
    if (mode === 'print' || running() || (!demo && !connected)) return;
    const now = performance.now();
    const viewers = positive(raidViewers.value) || (demo ? demos.length : liveViewers || 1);
    round = game.create(mode, demo, now, viewers);
    rounds.set(mode, round);
    scoreRows.clear();
    lastGift = null;
    nextUi = 0;
    if (demo) {
      nextDemo = now + 850;
      demoStep = 0;
      for (const actor of demos) receive({ actor, kind: 'join', count: 0 }, now);
    }
    syncControls();
    get('end-round').focus();
    schedule();
  }

  function textField(...values) {
    return values.find(value => typeof value === 'string' && value.trim())?.trim();
  }

  function positive(value) {
    const count = Number(value);
    return Number.isSafeInteger(count) && count > 0 ? count : 0;
  }

  function actorFrom(data) {
    const user = data.user ?? {};
    const handle = textField(data.uniqueId, user.uniqueId, user.displayId)?.replace(/^@/, '');
    const nickname = textField(data.nickname, user.nickname);
    const id = data.userId ?? user.id ?? user.userId;
    if (!handle && !nickname && !id) return null;
    const name = (handle ? `@${handle}` : nickname || `Spectator ${id}`).slice(0, 60);
    const key = handle ? `handle:${handle.toLowerCase()}` : id ? `id:${id}` : `name:${nickname.toLowerCase()}`;
    const initials = Array.from(name.replace(/^@/, '')).slice(0, 2).join('').toUpperCase();
    const candidates = [data.profilePictureUrl, user.profilePictureUrl, user.avatarThumb?.urlList, user.avatarThumb?.url_list, data.userDetails?.profilePictureUrls];
    const urls = new Set();
    for (const candidate of candidates.flat()) {
      if (typeof candidate !== 'string') continue;
      try {
        const url = new URL(candidate);
        if (url.protocol === 'https:' && !url.username && !url.password) urls.add(url.href);
      } catch {
        continue;
      }
    }
    return { key, name, initials, avatar: urls.size ? [...urls] : null };
  }

  function decode(message) {
    const { event, data } = message ?? {};
    if (!data || !['chat', 'like', 'gift'].includes(event)) return null;
    const actor = actorFrom(data);
    if (!actor) return null;
    let kind = event;
    let count = 0;
    let dedupeId = data.msgId ?? data.common?.msgId;
    if (kind === 'chat') {
      const command = textField(data.comment, data.content)?.toLowerCase();
      if (mode === 'duel' && ['!red', '!rosu'].includes(command)) actor.team = 'red';
      else if (mode === 'duel' && ['!blue', '!albastru'].includes(command)) actor.team = 'blue';
      else if (!['!join', '!intru'].includes(command)) return null;
      kind = 'join';
    } else if (kind === 'like') {
      count = positive(data.likeCount ?? data.count ?? 1);
      if (!count) return null;
    } else {
      const gift = data.gift ?? {};
      const type = Number(data.giftType ?? gift.type ?? gift.giftType ?? gift.gift_type);
      const end = data.repeatEnd ?? gift.repeatEnd ?? gift.repeat_end;
      if ((type === 1 && ![true, 1, '1', 'true'].includes(end)) || data.streaking === true) return null;
      const repeat = positive(data.repeatCount ?? gift.repeat_count) || 1;
      const value = positive(data.diamondCount ?? gift.diamondCount ?? gift.diamond_count ?? data.extendedGiftInfo?.diamond_count) || 1;
      count = positive(data.totalDiamonds) || value * repeat;
      if (type === 1 && data.groupId && data.groupId !== '0') dedupeId = `series:${data.groupId}`;
      if (dedupeId) dedupeId = `${dedupeId}/${data.giftId ?? gift.gift_id ?? gift.id ?? ''}`;
    }
    if (dedupeId) {
      const key = `${data.common?.roomId ?? data.roomId ?? ''}/${kind}/${actor.key}/${dedupeId}`;
      if (seenEvents.has(key)) return null;
      seenEvents.add(key);
      if (seenEvents.size > 1000) seenEvents.delete(seenEvents.values().next().value);
    }
    return { kind, actor, count: Math.min(count, 500) };
  }

  function connectionState(label, ready = false) {
    connected = ready;
    if (!ready) updateViewerCount(0);
    get('live-dot').dataset.connected = String(ready);
    get('live-status').textContent = label;
    get('hub-status').textContent = `TikFinity · ${label}`;
    get('hub-dot').dataset.connected = String(ready);
    get('live-connect').textContent = wantsConnection ? 'Disconnect TikFinity' : 'Connect TikFinity';
    PrintLive.connectionState(label, ready, wantsConnection);
    syncControls();
  }

  function connect() {
    connectionState('Connecting…');
    let connection;
    try {
      connection = new WebSocket(socketUrl);
    } catch {
      wantsConnection = false;
      connectionState('Unavailable');
      return;
    }
    socket = connection;
    const timeout = setTimeout(() => connection.close(), 5000);
    connection.addEventListener('open', () => {
      clearTimeout(timeout);
      if (connection === socket) connectionState('Connected', true);
    });
    connection.addEventListener('message', ({ data }) => {
      if (connection !== socket || typeof data !== 'string') return;
      let message;
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      if (message?.event === 'roomUser' && message.data?.viewerCount != null) {
        updateViewerCount(positive(message.data.viewerCount));
      } else if (message?.event === 'streamEnd') {
        updateViewerCount(0);
      } else if (mode === 'print') {
        PrintLive.receiveGift(message);
      } else if (running() && !round.demo) {
        const event = decode(message);
        if (event) receive(event);
      }
    });
    connection.addEventListener('close', () => {
      clearTimeout(timeout);
      if (connection !== socket) return;
      socket = null;
      connectionState('Reconnecting…');
      retry = setTimeout(connect, 3000);
    });
  }

  function toggleConnection() {
    wantsConnection = !wantsConnection;
    if (wantsConnection) connect();
    else {
      clearTimeout(retry);
      const previous = socket;
      socket = null;
      previous?.close();
      connectionState('Disconnected');
    }
  }

  function selectFromUrl() {
    const requested = location.hash.slice(1);
    selectMode(Object.hasOwn(game.modes, requested) ? requested : 'print');
  }

  function openTab(tab) {
    selectMode(tab.dataset.mode);
    if (location.hash !== `#${mode}`) location.hash = mode;
  }

  get('live-connect').addEventListener('click', toggleConnection);
  get('connect').addEventListener('click', toggleConnection);
  window.addEventListener('hashchange', selectFromUrl);
  choices.forEach((choice, index) => {
    choice.addEventListener('click', () => openTab(choice));
    choice.addEventListener('keydown', event => {
      const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: choices.length - 1 };
      if (!Object.hasOwn(keys, event.key)) return;
      event.preventDefault();
      const next = choices[(keys[event.key] + choices.length) % choices.length];
      openTab(next);
      next.focus();
    });
  });
  get('start-demo').addEventListener('click', () => start(true));
  get('start-live').addEventListener('click', () => start(false));
  get('end-round').addEventListener('click', () => {
    if (!running()) return;
    finishRound(performance.now());
    syncControls();
    get('start-demo').focus();
    nextUi = 0;
    schedule();
  });
  get('demo-tap').addEventListener('click', () => {
    if (round?.demo) receive({ actor: demos[3], kind: 'like', count: 10 });
  });
  get('demo-gift').addEventListener('click', () => {
    if (round?.demo) receive({ actor: demos[3], kind: 'gift', count: 25 });
  });
  const stream = get('stream');
  stream.addEventListener('click', () => {
    document.body.classList.add('arcade-stream');
    stream.setAttribute('aria-pressed', 'true');
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !document.body.classList.contains('arcade-stream')) return;
    document.body.classList.remove('arcade-stream');
    stream.setAttribute('aria-pressed', 'false');
    stream.focus();
  });

  selectFromUrl();
})();
