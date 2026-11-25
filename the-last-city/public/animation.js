export const ANIMATION_ROWS = ['walker', 'runner', 'brute', 'boss', 'worker', 'archer'];
export const WALK_CYCLE_DISTANCE = { walker: 42, runner: 60, brute: 48, boss: 58, worker: 44 };
export const walkFrame = (kind, distance = 0, offset = 0) => Math.floor(Math.max(0, distance) / (WALK_CYCLE_DISTANCE[kind] || 44) * 8 + offset) % 8;
// Bow is released at frame five. Wind-up and recovery follow simulated time, not render FPS.
export const archerFrame = (stage, t) => stage === 'windup' ? Math.min(4, 1 + Math.floor(t / 0.045)) : stage === 'recover' ? Math.min(7, 5 + Math.floor(t / 0.09)) : 0;

export class AnimationAtlas {
  constructor() { this.ready = false; this.error = ''; this.rows = new Map(); }
  async load(url = '/assets/character-cycles.png') {
    try {
      const img = new Image(); img.src = url; await img.decode();
      for (let row = 0; row < ANIMATION_ROWS.length; row++) {
        const frames = []; let x0 = Infinity, y0 = Infinity, x1 = 0, y1 = 0;
        for (let f = 0; f < 8; f++) {
          const left = Math.round(f * img.width / 8), right = Math.round((f + 1) * img.width / 8);
          const top = Math.round(row * img.height / 6), bottom = Math.round((row + 1) * img.height / 6);
          const cv = document.createElement('canvas'); cv.width = right - left; cv.height = bottom - top;
          const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, left, top, cv.width, cv.height, 0, 0, cv.width, cv.height);
          const data = c.getImageData(0, 0, cv.width, cv.height).data; let baseline = 0, pixels = 0;
          for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (data[(y * cv.width + x) * 4 + 3] > 80) {
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); baseline = Math.max(baseline, y); pixels++;
          }
          if (pixels < 50) throw new Error(`Missing animation frame ${row}:${f}`);
          frames.push({ cv, baseline });
        }
        this.rows.set(ANIMATION_ROWS[row], { frames, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      }
      this.ready = true;
    } catch (e) { this.error = e.message; console.warn('Character cycles unavailable:', e); }
    return this;
  }
  draw(c, kind, frame, x, y, width, flip = false) {
    const row = this.rows.get(kind); if (!row) return false;
    const f = row.frames[((frame % 8) + 8) % 8], s = width / row.w;
    c.save(); c.translate(x, y); if (flip) c.scale(-1, 1);
    c.drawImage(f.cv, row.x0, row.y0, row.w, row.h, -width / 2, -(f.baseline - row.y0) * s, width, row.h * s);
    c.restore(); return true;
  }
}
