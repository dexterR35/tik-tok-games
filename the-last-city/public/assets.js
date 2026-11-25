// Atlas cells are sliced and alpha-trimmed once, never scanned in the render loop.
export const ASSET_IDS = ['castle', 'cottage', 'windmill', 'barracks', 'pines', 'oak', 'tower', 'cannon', 'archer', 'captain', 'worker', 'mage', 'walker', 'runner', 'brute', 'boss'];
export class AssetAtlas {
  constructor() { this.ready = false; this.error = ''; this.sprites = new Map(); }
  async load(url = '/assets/kingdom-atlas.png') {
    try {
      const img = new Image(); img.src = url; await img.decode();
      for (let i = 0; i < ASSET_IDS.length; i++) {
        const left = Math.round(i % 4 * img.width / 4), top = Math.round(Math.floor(i / 4) * img.height / 4);
        const right = Math.round((i % 4 + 1) * img.width / 4), bottom = Math.round((Math.floor(i / 4) + 1) * img.height / 4);
        const cv = document.createElement('canvas'); cv.width = right - left; cv.height = bottom - top;
        const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, left, top, cv.width, cv.height, 0, 0, cv.width, cv.height);
        const data = c.getImageData(0, 0, cv.width, cv.height).data;
        let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (data[(y * cv.width + x) * 4 + 3] > 48) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        if (x1 <= x0 || y1 <= y0) throw new Error(`Empty sprite: ${ASSET_IDS[i]}`);
        this.sprites.set(ASSET_IDS[i], { img: cv, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      }
      this.ready = true;
    } catch (e) { this.error = e.message; console.warn('Atlas unavailable; using procedural art.', e); }
    return this;
  }
  draw(ctx, id, x, y, width, { flip = false, bob = 0, lean = 0, alpha = 1 } = {}) {
    const s = this.sprites.get(id); if (!s) return false;
    const h = width * s.h / s.w;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y + bob); ctx.rotate(lean); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, -width / 2, -h, width, h); ctx.restore(); return true;
  }
}
