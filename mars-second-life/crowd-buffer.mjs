import { validCount } from './public/rules.js';

// Fixed-size accumulator flushed every 100 ms. However big the audience, one tick carries at most
// 1 like event (top 20 tappers), 40 gifts, 20 follows, 20 shares and 30 comments.
const LIMITS = { likers: 20, gifts: 40, follows: 20, shares: 20, comments: 30 };

export class CrowdBuffer {
  constructor() { this.clear(); this.receivedLikes = 0; this.receivedGifts = 0; }

  clear() {
    this.likes = 0; this.likers = new Map();
    this.gifts = new Map(); this.follows = []; this.shares = []; this.comments = [];
  }

  like(count, user = 'THE CROWD', avatar = null) {
    count = validCount(count);
    if (!count) return;
    this.likes += count; this.receivedLikes += count;
    const name = String(user).slice(0, 24);
    const old = this.likers.get(name);
    if (old || this.likers.size < 500) this.likers.set(name, { c: (old?.c || 0) + count, a: avatar || old?.a || null });
  }

  gift(event) {
    const count = validCount(event.count, 1e6);
    if (!count) return;
    this.receivedGifts += count;
    const coins = Math.max(1, Math.floor(Number(event.coins) || 1));
    const gname = String(event.name || 'Gift').slice(0, 40);
    let key = `${event.user}|${coins}|${gname}`;
    if (!this.gifts.has(key) && this.gifts.size >= LIMITS.gifts) key = `THE CROWD|${coins}|${gname}`;
    const old = this.gifts.get(key);
    const user = key.startsWith('THE CROWD|') ? 'THE CROWD' : String(event.user || 'VIEWER').slice(0, 24);
    this.gifts.set(key, { type: 'gift', user, avatar: old?.avatar || event.avatar || null, coins, count: (old?.count || 0) + count, name: gname });
  }

  social(kind, user, avatar = null, text = '') {
    const list = kind === 'follow' ? this.follows : kind === 'share' ? this.shares : this.comments;
    const limit = kind === 'follow' ? LIMITS.follows : kind === 'share' ? LIMITS.shares : LIMITS.comments;
    if (list.length >= limit) return;
    const ev = { type: kind, user: String(user || 'VIEWER').slice(0, 24), avatar };
    if (kind === 'comment') ev.text = String(text || '').slice(0, 80);
    list.push(ev);
  }

  flush() {
    const events = [];
    if (this.likes) {
      const users = [...this.likers].sort((a, b) => b[1].c - a[1].c).slice(0, LIMITS.likers).map(([n, v]) => [n, v.c, v.a]);
      events.push({ type: 'like', count: this.likes, users });
    }
    events.push(...this.gifts.values(), ...this.follows, ...this.shares, ...this.comments);
    this.clear();
    return events;
  }
}
