// Bakes the *static ground layer* of a CHUNK x CHUNK block of tiles into a single
// Raster: ground textures, organic terrain transitions and tiny decals.
// Water itself is NOT baked (it animates) - only the shoreline overlays above it are.

import { Raster } from "../art/raster.js";
import { makeEdgeOverlay, N, E, S, W, NE, SE, SW, NW } from "../art/edges.js";
import { Terrain, Obj } from "../world/tiles.js";
import { CHUNK, TILE } from "../config.js";
import { hashInt } from "../core/rng.js";

const NEIGHBOURS = [
  [0, -1, N], [1, 0, E], [0, 1, S], [-1, 0, W],
  [1, -1, NE], [1, 1, SE], [-1, 1, SW], [-1, -1, NW],
];

// How much the rim of a bleed darkens (gives grass edges a crisp little outline).
const LIP = { [Terrain.SAND]: 1, [Terrain.DIRT]: 0.9, [Terrain.GRASS]: 0.84 };

export function groundRaster(ra, terrain, variantHash, tone) {
  switch (terrain) {
    case Terrain.GRASS: return ra.grass[tone][variantHash % ra.grass[tone].length];
    case Terrain.DIRT: return ra.dirt[variantHash % ra.dirt.length];
    case Terrain.SAND: return ra.sand[variantHash % ra.sand.length];
    default: return null;
  }
}

const FLOWERS = ["flowerWhite", "flowerYellow", "flowerPink", "flowerBlue", "flowerWhite", "flowerYellow"];

function pickDecal(terrain, r) {
  if (terrain === Terrain.GRASS) {
    if (r < 0.05) return FLOWERS[Math.floor((r / 0.05) * FLOWERS.length) % FLOWERS.length];
    if (r < 0.13) return "tallGrass";
    if (r < 0.137) return "mushroom";
  } else if (terrain === Terrain.DIRT) {
    if (r < 0.1) return "pebbles";
  } else if (terrain === Terrain.SAND) {
    if (r < 0.035) return "pebbles";
    if (r < 0.06) return "shell";
  }
  return null;
}

export function bakeChunk(world, ra, cx, cy) {
  const size = CHUNK * TILE;
  const out = new Raster(size, size);

  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = cx * CHUNK + lx;
      const y = cy * CHUNK + ly;
      if (!world.inBounds(x, y)) continue;
      const i = world.idx(x, y);
      const t = world.terrain[i];
      const tone = world.tone[i];
      const h = hashInt(x, y, world.seed);
      const px = lx * TILE;
      const py = ly * TILE;

      // 1) base ground
      const base = groundRaster(ra, t, h >>> 4, tone);
      if (base) out.blit(base, px, py);

      // 2) transitions from higher-priority neighbours
      const masks = [0, 0, 0, 0];
      for (const [dx, dy, bit] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!world.inBounds(nx, ny)) continue;
        const nt = world.terrain[world.idx(nx, ny)];
        if (nt > t) masks[nt] |= bit;
      }
      let blended = false;
      for (let b = t + 1; b <= Terrain.GRASS; b++) {
        if (!masks[b]) continue;
        const src = groundRaster(ra, b, h >>> 6, tone);
        const overlay = makeEdgeOverlay(src, masks[b], x, y, t === Terrain.WATER, LIP[b] ?? 1);
        out.blit(overlay, px, py);
        blended = true;
      }

      // 3) decals (only on clean, un-blended, empty tiles; kept off the tile rim)
      if (!blended && t !== Terrain.WATER && world.obj[i] === Obj.NONE) {
        const name = pickDecal(t, (hashInt(x, y, world.seed + 77) >>> 8) / 16777216);
        if (name) {
          const d = ra.decals[name];
          const ox = 2 + ((h >>> 12) % Math.max(1, TILE - 4 - d.w));
          const oy = 2 + ((h >>> 18) % Math.max(1, TILE - 4 - d.h));
          out.blit(d, px + ox, py + oy);
        }
      }
    }
  }
  return out;
}
