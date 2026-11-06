// A tiny, DOM-free RGBA raster. Sprites, tile textures and whole baked terrain
// chunks are all Rasters. Because it never touches <canvas>, the same code runs
// in the browser and in Node (see tools/preview.mjs).

export function parseColor(c) {
  if (c == null) return null;
  if (Array.isArray(c)) return c;
  let h = c.startsWith("#") ? c.slice(1) : c;
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

/** Check that a sprite grid is rectangular and uses only legend characters. */
export function validateRows(rows, legend, name = "sprite") {
  const problems = [];
  const w = rows[0].length;
  rows.forEach((row, y) => {
    if (row.length !== w) problems.push(`${name}: row ${y} has width ${row.length}, expected ${w}`);
    for (const ch of row) if (!(ch in legend)) problems.push(`${name}: row ${y} uses unknown char '${ch}'`);
  });
  return problems;
}

export class Raster {
  constructor(w, h, data) {
    this.w = w;
    this.h = h;
    this.data = data || new Uint8ClampedArray(w * h * 4);
  }

  /**
   * Build a raster from an array of equal-length strings. Each character is looked
   * up in `legend` (character -> css colour, or null for transparent).
   */
  static fromRows(rows, legend, name = "sprite") {
    const problems = validateRows(rows, legend, name);
    if (problems.length) console.warn(problems.join("\n"));
    const w = Math.max(...rows.map((r) => r.length));
    const r = new Raster(w, rows.length);
    const cache = {};
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (!(ch in cache)) cache[ch] = parseColor(legend[ch]);
        const col = cache[ch];
        if (col) r.setPixel(x, y, col);
      }
    }
    return r;
  }

  clone() {
    return new Raster(this.w, this.h, new Uint8ClampedArray(this.data));
  }

  getPixel(x, y) {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  setPixel(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3] === undefined ? 255 : c[3];
  }

  fill(c) {
    const col = parseColor(c);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.setPixel(x, y, col);
    return this;
  }

  /** Source-over alpha compositing of `src` onto this raster at (dx, dy). */
  blit(src, dx, dy) {
    const d = this.data;
    const s = src.data;
    for (let sy = 0; sy < src.h; sy++) {
      const y = dy + sy;
      if (y < 0 || y >= this.h) continue;
      for (let sx = 0; sx < src.w; sx++) {
        const x = dx + sx;
        if (x < 0 || x >= this.w) continue;
        const si = (sy * src.w + sx) * 4;
        const sa = s[si + 3];
        if (sa === 0) continue;
        const di = (y * this.w + x) * 4;
        const da = d[di + 3];
        if (sa === 255 || da === 0) {
          d[di] = s[si];
          d[di + 1] = s[si + 1];
          d[di + 2] = s[si + 2];
          d[di + 3] = sa;
        } else {
          const a = sa / 255;
          const ba = da / 255;
          const oa = a + ba * (1 - a);
          d[di] = (s[si] * a + d[di] * ba * (1 - a)) / oa;
          d[di + 1] = (s[si + 1] * a + d[di + 1] * ba * (1 - a)) / oa;
          d[di + 2] = (s[si + 2] * a + d[di + 2] * ba * (1 - a)) / oa;
          d[di + 3] = oa * 255;
        }
      }
    }
    return this;
  }

  flipH() {
    const out = new Raster(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) out.setPixel(this.w - 1 - x, y, this.getPixel(x, y));
    return out;
  }

  /**
   * Wind sway: every row above `rootRow` slides sideways, the further from the
   * root the more it moves. Output is padded by `pad` pixels on each side so the
   * canopy never gets clipped. This is how pine trees "sway in the wind" without
   * per-frame distortion cost - we pre-bake one frame per sway level.
   */
  sway(level, rootRow, pad = 2) {
    const out = new Raster(this.w + pad * 2, this.h);
    for (let y = 0; y < this.h; y++) {
      const f = Math.max(0, Math.min(1, (rootRow - y) / rootRow));
      const shift = Math.round(level * f);
      for (let x = 0; x < this.w; x++) {
        const px = this.getPixel(x, y);
        if (px[3] === 0) continue;
        out.setPixel(x + pad + shift, y, px);
      }
    }
    return out;
  }

  /** Pad with transparent pixels (used so un-swayed frames share the same size). */
  padded(pad) {
    const out = new Raster(this.w + pad * 2, this.h);
    out.blit(this, pad, 0);
    return out;
  }
}
