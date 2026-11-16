export async function connectGame(onState, onConnection = () => {}) {
  let local = false;
  try { const response = await fetch('/api/health', { signal: AbortSignal.timeout(2500) }); if (response.ok) local = (await response.json()).game === 'prism-rush'; } catch {}
  if (local) {
    const stream = new EventSource('/api/events');
    stream.onmessage = e => { try { onState(JSON.parse(e.data)); onConnection(true); } catch {} };
    stream.onerror = () => onConnection(false);
    return { local: true, send: async command => {
      const response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Command failed'); return data;
    } };
  }
  let saved; try { saved = JSON.parse(localStorage.getItem('prism-rush-demo-v1')); } catch {}
  // Move search and target simulation run off the render thread in the hosted
  // edition too. Hundreds of candidate refills cannot stall Three.js frames.
  const worker = new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' });
  const pending = new Map(); let nextId = 0, latestSave = saved;
  const save = () => { if (latestSave) try { localStorage.setItem('prism-rush-demo-v1', JSON.stringify(latestSave)); } catch {} };
  await new Promise((ready, fail) => {
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === 'state') { onState(message.state); onConnection(true); ready(); }
      else if (message.type === 'save') { latestSave = message.saved; save(); }
      else if (message.type === 'reply') { const work = pending.get(message.id); if (work) { clearTimeout(work.timer); message.error ? work.reject(Error(message.error)) : work.resolve({ ok: true }); pending.delete(message.id); } }
    };
    worker.onerror = () => { onConnection(false); const error = Error('Demo simulation stopped. Reload the game to resume saved progress.'); fail(error); for (const work of pending.values()) { clearTimeout(work.timer); work.reject(error); } pending.clear(); };
    worker.postMessage({ type: 'init', saved });
  });
  addEventListener('pagehide', save);
  return { local: false, send: command => new Promise((resolve, reject) => {
    const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(Error('Game command timed out')); }, 10000);
    pending.set(id, { resolve, reject, timer }); worker.postMessage({ type: 'command', id, command });
  }) };
}
