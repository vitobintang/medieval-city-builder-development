// Procedural terrain-transition ("autotile") generator.
//
// Instead of hand-drawing dozens of blob tiles, a tile that sits next to a
// higher-priority terrain asks for an *overlay*: the neighbour's own texture,
// masked by a wobbly organic shoreline. The wobble is driven by WORLD coordinates,
// so the shoreline flows seamlessly across tile borders.

import { Raster } from "./raster.js";
import { hash01 } from "../core/rng.js";

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const NE = 16;
export const SE = 32;
export const SW = 64;
export const NW = 128;

const TS = 16;

function valueNoise1(x, salt) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(i, 0, salt);
  const b = hash01(i + 1, 0, salt);
  return a + (b - a) * u;
}

/** How deep (in pixels) the bleed reaches at a given world coordinate along an edge. */
const depthAt = (worldPos, salt) => 1.3 + valueNoise1(worldPos * 0.27, salt) * 2.5;

const FOAM = [232, 248, 255, 165];

/**
 * @param {Raster} src      neighbour texture that bleeds in
 * @param {number} mask     which of the 8 neighbours are that terrain
 * @param {number} tx,ty    tile coordinates (for world-continuous wobble)
 * @param {boolean} foam    draw white shoreline foam (when overlaying water)
 * @param {number} lip      <1 darkens the rim pixels of the bleed for definition
 */
export function makeEdgeOverlay(src, mask, tx, ty, foam, lip) {
  const covered = new Uint8Array(TS * TS);

  const sides = [
    { bit: N, along: tx, salt: 11, a0: !(mask & W) && !(mask & NW), a1: !(mask & E) && !(mask & NE), at: (a, o) => [a, o] },
    { bit: E, along: ty, salt: 12, a0: !(mask & N) && !(mask & NE), a1: !(mask & S) && !(mask & SE), at: (a, o) => [TS - 1 - o, a] },
    { bit: S, along: tx, salt: 13, a0: !(mask & W) && !(mask & SW), a1: !(mask & E) && !(mask & SE), at: (a, o) => [a, TS - 1 - o] },
    { bit: W, along: ty, salt: 14, a0: !(mask & N) && !(mask & NW), a1: !(mask & S) && !(mask & SW), at: (a, o) => [o, a] },
  ];

  for (const side of sides) {
    if (!(mask & side.bit)) continue;
    for (let a = 0; a < TS; a++) {
      let d = depthAt(side.along * TS + a, side.salt);
      // Round off the ends of a bleed run that doesn't continue into a neighbour.
      if (side.a0 && a < 4) d *= (a + 1) / 5;
      if (side.a1 && TS - 1 - a < 4) d *= (TS - a) / 5;
      for (let o = 0; o < TS; o++) {
        if (o + 0.5 >= d) break;
        const [px, py] = side.at(a, o);
        covered[py * TS + px] = 1;
      }
    }
  }

  // Convex corners where only the diagonal neighbour is the higher terrain.
  const corners = [
    { bit: NE, n: N, m: E, cx: TS - 1, cy: 0 },
    { bit: SE, n: S, m: E, cx: TS - 1, cy: TS - 1 },
    { bit: SW, n: S, m: W, cx: 0, cy: TS - 1 },
    { bit: NW, n: N, m: W, cx: 0, cy: 0 },
  ];
  for (const c of corners) {
    if (!(mask & c.bit) || mask & c.n || mask & c.m) continue;
    for (let y = 0; y < TS; y++)
      for (let x = 0; x < TS; x++) {
        const dx = x - c.cx;
        const dy = y - c.cy;
        if (dx * dx + dy * dy <= 11) covered[y * TS + x] = 1;
      }
  }

  const out = new Raster(TS, TS);
  const isCov = (x, y) => x >= 0 && y >= 0 && x < TS && y < TS && covered[y * TS + x] === 1;
  const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      const inside = isCov(x, y);
      const edgeNext = nbrs.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= TS || ny >= TS) return false;
        return isCov(nx, ny) !== inside;
      });
      if (inside) {
        const p = src.getPixel(x, y);
        if (edgeNext && lip < 1) {
          p[0] *= lip;
          p[1] *= lip;
          p[2] *= lip;
        }
        out.setPixel(x, y, p);
      } else if (foam && edgeNext) {
        out.setPixel(x, y, FOAM);
      }
    }
  }
  return out;
}
