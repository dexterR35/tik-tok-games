import { Room } from './room.js';
let room, previous;
self.onmessage = event => {
  const message = event.data;
  if (message.type === 'init') {
    room = new Room({ saved: message.saved }); room.settings.reconnect = false;
    room.live.text = 'Hosted demo · local edition required for TikTok'; previous = Date.now();
    self.postMessage({ type: 'state', state: room.snapshot() });
    let ticks = 0;
    setInterval(() => {
      const now = Date.now(); room.step((now - previous) / 1000, now); previous = now;
      self.postMessage({ type: 'state', state: room.snapshot() });
      if (++ticks % 100 === 0) self.postMessage({ type: 'save', saved: room.export() });
    }, 50);
  } else if (message.type === 'command') {
    try {
      if (['connect', 'disconnect'].includes(message.command.action)) throw Error('TikTok relay connection requires the local edition. Run START.bat and open localhost:4328/host.');
      if (room.command(message.command) === false) throw Error('Queue full or participant limit reached');
      self.postMessage({ type: 'reply', id: message.id, ok: true });
      self.postMessage({ type: 'state', state: room.snapshot() }); self.postMessage({ type: 'save', saved: room.export() });
    } catch (error) { self.postMessage({ type: 'reply', id: message.id, error: error.message }); }
  }
};
