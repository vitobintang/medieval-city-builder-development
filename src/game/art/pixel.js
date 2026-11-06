// Drawing helpers for the big, procedural sprites (buildings, villagers).
//
// Trees and props are hand-authored character grids; buildings and people are
// assembled from a few shaded boxes instead, because they need many variants
// (roof styles, directions, walk frames) that must stay consistent. Everything
// here writes into a plain Raster so it still runs outside the browser.

import { parseColor } from "./raster.js";

const COLOR_CACHE = new Map();

/** Parse + memoise a css colour into an RGBA tuple. */
export function col(c) {
  if (c == null) return null;
  if (Array.isArray(c)) return c;
  let v = COLOR_CACHE.get(c);
  if (!v) {
    v = parseColor(c);
    COLOR_CACHE.set(c, v);
  }
  return v;
}

/** Darken / lighten a css hex colour by `amount` (-1..1). */
export function shade(hex, amount) {
  const [r, g, b] = parseColor(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `#${((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, "0")}`;
}

/** True if (x, y) is inside the raster. */
export const inside = (r, x, y) => x >= 0 && y >= 0 && x < r.w && y < r.h;

export function px(r, x, y, c) {
  if (!c || !inside(r, x, y)) return;
  r.setPixel(x, y, col(c));
}

export function rect(r, x, y, w, h, c) {
  const cc = col(c);
  if (!cc) return;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(r, x + i, y + j, cc);
}

export function hline(r, x, y, w, c) {
  rect(r, x, y, w, 1, c);
}

export function vline(r, x, y, h, c) {
  rect(r, x, y, 1, h, c);
}

/** 1px outline around a rect (drawn inside its bounds). */
export function rectOutline(r, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  hline(r, x, y, w, c);
  hline(r, x, y + h - 1, w, c);
  vline(r, x, y, h, c);
  vline(r, x + w - 1, y, h, c);
}

/**
 * Right/bottom edge shading: the "3D" rim of a box, light coming from the
 * upper left. `d` is the shaded colour, `l` the lit one.
 */
export function bevel(r, x, y, w, h, l, d) {
  vline(r, x, y, h, l);
  hline(r, x, y, w, l);
  vline(r, x + w - 1, y, h, d);
  hline(r, x, y + h - 1, w, d);
}

/** Fill everything currently transparent with `c` inside a rect. */
export function fillHoles(r, x, y, w, h, c) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (!inside(r, i, j)) continue;
      if (r.getPixel(i, j)[3] === 0) px(r, i, j, c);
    }
  }
}

/** Soft contact shadow under a footprint (dithered, so it reads at any zoom). */
export function groundShadow(r, x, y, w, h, c) {
  const cc = col(c);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      // round the corners off
      const edgeX = Math.min(i, w - 1 - i);
      const edgeY = Math.min(j, h - 1 - j);
      if (edgeX + edgeY < 1) continue;
      if (edgeX === 0 && j % 2) continue; // dithered rim
      if (j === h - 1 && i % 2) continue;
      px(r, x + i, y + j, cc);
    }
  }
}

/**
 * Outline the silhouette of a sprite.
 * `minAlpha` ignores faint pixels (soft ground shadows), so the outline hugs the
 * solid artwork instead of ringing the shadow.
 */
export function outlineAlpha(r, c, { skipRows = 0, minAlpha = 1 } = {}) {
  const cc = col(c);
  const snap = new Uint8Array(r.data);
  const solid = (x, y) => {
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) return 0;
    return snap[(y * r.w + x) * 4 + 3] >= minAlpha ? 1 : 0;
  };
  for (let y = skipRows; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (snap[(y * r.w + x) * 4 + 3] !== 0) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) px(r, x, y, cc);
    }
  }
  return r;
}
