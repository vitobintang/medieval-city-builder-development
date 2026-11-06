// Hand-authored 16x16 ground textures + small ground decals.
// Every character maps to a colour through the legend next to the grid.

import { P } from "../palette.js";
import { Raster } from "../raster.js";

// ---------------------------------------------------------------- GRASS
// a = bright blade tip, b = base turf, c = dark blade, d = deep speck
export const grassLegend = (tone) => {
  const t = P.grassTones[tone];
  return { a: t.a, b: t.b, c: t.c, d: t.d };
};

export const GRASS_GRIDS = [
  [
    "bbbbbbbbbbbbbbbb",
    "bbbbcbbbbbbbabbb",
    "bbbcbcbbbbbbbbbb",
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbbbbcbbbb",
    "bbabbbbbbbcbcbbb",
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbcbbbbbbb",
    "bbbbbbbcbcbbbdbb",
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbbab",
    "bcbbbbbbbbbbbbbb",
    "cbcbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbabbbbbbb",
    "bbbbbdbbbbbbbbbb",
  ],
  [
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbabbbbbbbb",
    "bbbbbbbbbbbbcbbb",
    "bbcbbbbbbbbcbcbb",
    "bcbcbbbbbbbbbbbb",
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbbbabbbbb",
    "bbbbbcbbbbbbbbbb",
    "bbbbcbcbbbbbbbbb",
    "bdbbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbbcb",
    "bbbbabbbbbbbbcbc",
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbcbbbbbbb",
    "bbbbbbbcbcbbbabb",
    "bbbbbbbbbbbbbbbb",
  ],
  [
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbbbb",
    "bbbabbbbbbcbbbbb",
    "bbbbbbbbbcbcbbbb",
    "bbbbbbbbbbbbbbbb",
    "bbbcbbbbbbbbbbbb",
    "bbcbcbbbbbbbabbb",
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbcbbbbbbb",
    "bbbabbbcbcbbbbdb",
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbcbb",
    "bcbbbbbbbbbbcbcb",
    "cbcbbbbbabbbbbbb",
    "bbbbbbbbbbbbbbbb",
  ],
];

// ---------------------------------------------------------------- DIRT
// e = light crumb, f = base soil, g = dark clod, h = deep pebble shadow
export const DIRT_LEGEND = { e: P.dirt.e, f: P.dirt.f, g: P.dirt.g, h: P.dirt.h };

export const DIRT_GRIDS = [
  [
    "ffffffffffffffff",
    "ffefffffffffgfff",
    "fffffffgffffffff",
    "ffffffgggfffffef",
    "fffffffffffffffh",
    "ffgffffffeffffff",
    "fgggfffffffffgff",
    "ffffffffffffgggf",
    "ffffefffffffffff",
    "ffffffffgffffeff",
    "fffgfffggffffffg",
    "ffffffffffffffgg",
    "ffeffffffffgffff",
    "ffffffhffffffffe",
    "fffffffffgffffff",
    "ffgffffffffffgff",
  ],
  [
    "ffffffffffffffff",
    "ffffgffffffffeff",
    "fefffggfffffffff",
    "ffffffffffgffffh",
    "fffffffffgggffff",
    "ffffeffffffffgff",
    "ffgffffffffffffg",
    "fggggfffffefffff",
    "ffffffffffffffff",
    "ffffffgffffffgff",
    "fffeffggfffffggf",
    "fffffffffffffffg",
    "fgffffffeffffffe",
    "ffgfffffffffgfff",
    "ffffffffhfffffff",
    "ffffffffffffffff",
  ],
  [
    "ffffffffffffffff",
    "fffgfffffffeffff",
    "ffggffffffffffgf",
    "ffffffffefffffff",
    "fffffffffffgffff",
    "ffefffffffgggfff",
    "ffffffgfffffffff",
    "fffffgggfffffffh",
    "ffffffffffefffff",
    "gfffffffffffgfff",
    "ggffefffffffgggf",
    "fffffffffffffffg",
    "ffffgfffffeffffe",
    "fffggffffffffffg",
    "ffffffffffgffffg",
    "ffeffffffffffffg",
  ],
];

// ---------------------------------------------------------------- SAND
export const SAND_LEGEND = { e: P.sand.e, f: P.sand.f, g: P.sand.g, h: P.sand.h };

export const SAND_GRIDS = [
  [
    "ffffffffffffffff",
    "ffffefffffffffff",
    "fffffffffgggffff",
    "ffffffffffffffef",
    "fgggffffffffffff",
    "ffffffffefffffff",
    "ffffffffffffgfff",
    "fffeffffffgggfff",
    "ffffffffffffffff",
    "ffffffgggfffffef",
    "fefffffffffffffh",
    "ffffffffffffffff",
    "ffffgggfffefffff",
    "fffffffffffffggf",
    "fffefffffffffffh",
    "ffffffffffffffff",
  ],
  [
    "ffffffffffffffff",
    "fffffffgggfffffe",
    "ffefffffffffffff",
    "ffffffffffffffff",
    "fffgggfffffffeff",
    "ffffffffefffffff",
    "ffffffffffggfffh",
    "ffefffffffffffff",
    "ffffffffffffffff",
    "fgggfffffefffggf",
    "ffffffffffffffff",
    "ffffefffffgffffe",
    "fffffffffffffffg",
    "ffffggggffffffff",
    "ffffffffffffffff",
    "ffefffffffefffff",
  ],
];

// ---------------------------------------------------------------- WATER
// Water is procedural: a base colour plus ripple dashes that drift sideways per frame.
// Because the ripple positions wrap every 16px, 4 frames of +4px loop perfectly.
const RIPPLES = [
  // pattern A: [x, y, length]
  [[2, 2, 4], [10, 5, 3], [5, 9, 4], [12, 13, 3]],
  // pattern B
  [[8, 1, 3], [1, 6, 4], [11, 10, 4], [4, 14, 3]],
];
const SPARKS = [
  [[4, 3], [13, 9]],
  [[9, 7], [2, 12]],
];

export function makeWaterFrame(pattern, frame, frames = 4) {
  const r = new Raster(16, 16).fill(P.water.base);
  const shift = (frame * 16) / frames;
  const light = [...hexToRgb(P.water.light), 255];
  const dark = [...hexToRgb(P.water.dark), 255];
  const spark = [...hexToRgb(P.water.spark), 255];
  for (const [rx, ry, len] of RIPPLES[pattern]) {
    for (let i = 0; i < len; i++) {
      const x = (rx + i + shift) % 16;
      r.setPixel(x, ry, light);
      // darker trough under the crest, one pixel shorter for a rolling look
      if (i < len - 1) r.setPixel((x + 1) % 16, (ry + 1) % 16, dark);
    }
  }
  // twinkles come and go
  const s = SPARKS[pattern][frame % 2];
  r.setPixel(s[0], s[1], spark);
  return r;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------- DECALS (tiny ground details)
const flowerLegend = (petal) => ({
  ".": null,
  p: petal,
  c: P.flower.center,
  g: P.flower.stem,
});
const FLOWER_ROWS = [".p.", "pcp", ".g."];

export const DECAL_DEFS = {
  flowerWhite: { rows: FLOWER_ROWS, legend: flowerLegend(P.flower.white) },
  flowerYellow: { rows: FLOWER_ROWS, legend: flowerLegend(P.flower.yellow) },
  flowerPink: { rows: FLOWER_ROWS, legend: flowerLegend(P.flower.pink) },
  flowerBlue: { rows: FLOWER_ROWS, legend: flowerLegend(P.flower.blue) },
  tallGrass: {
    rows: ["a...a", "c.a.c", "cdcdc"],
    legend: { ".": null, a: P.grassTones[0].a, c: P.grassTones[0].d, d: P.grassTones[1].d },
  },
  mushroom: {
    rows: [".r.", "rwr", ".s."],
    legend: { ".": null, r: P.mushroom.cap, w: P.mushroom.dot, s: P.mushroom.stem },
  },
  pebbles: {
    rows: ["lm.", ".kk"],
    legend: { ".": null, l: P.stone.l, m: P.stone.m, k: P.stone.k },
  },
  shell: {
    rows: ["wp", "p."],
    legend: { ".": null, w: "#fff6e6", p: "#f2c9b8" },
  },
};
