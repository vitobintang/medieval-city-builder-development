// Builds every sprite as a pure Raster. A thin browser wrapper (atlas.js) turns
// these into canvases; the Node preview tool uses them directly.

import { Raster } from "./raster.js";
import { Obj } from "../world/tiles.js";
import { WATER_FRAMES } from "../config.js";
import {
  GRASS_GRIDS, DIRT_GRIDS, SAND_GRIDS, DIRT_LEGEND, SAND_LEGEND, grassLegend,
  makeWaterFrame, DECAL_DEFS,
} from "./sprites/terrainSprites.js";
import {
  PINE_ROWS, PINE_YOUNG_ROWS, OAK_ROWS, TREE_LEGENDS, TREE_ROOT_ROW,
} from "./sprites/treeSprites.js";
import {
  BERRY_BUSH_ROWS, bushLegend, STONE_A_ROWS, STONE_B_ROWS, stoneLegend, STUMP_ROWS, stumpLegend,
} from "./sprites/propSprites.js";

/** Sway levels baked per tree. Index 2 is "perfectly still". */
export const SWAY_LEVELS = [-2, -1, 0, 1, 2];
const PAD = 2;

function treeSet(rows, legend, rootRow, name) {
  const base = Raster.fromRows(rows, legend, name);
  const flipped = base.flipH();
  const make = (r) => SWAY_LEVELS.map((l) => (l === 0 ? r.padded(PAD) : r.sway(l, rootRow, PAD)));
  return {
    sway: true,
    frames: [make(base), make(flipped)],
    pivotX: (base.w + PAD * 2) / 2,
    pivotY: base.h,
  };
}

function propSet(rows, legend, name, flippable = true) {
  const base = Raster.fromRows(rows, legend, name);
  const a = [base.padded(PAD)];
  const b = [(flippable ? base.flipH() : base).padded(PAD)];
  return { sway: false, frames: [a, b], pivotX: (base.w + PAD * 2) / 2, pivotY: base.h };
}

export function buildRasterAtlas() {
  const grass = [0, 1, 2].map((tone) =>
    GRASS_GRIDS.map((g, i) => Raster.fromRows(g, grassLegend(tone), `grass${tone}.${i}`))
  );
  const dirt = DIRT_GRIDS.map((g, i) => Raster.fromRows(g, DIRT_LEGEND, `dirt${i}`));
  const sand = SAND_GRIDS.map((g, i) => Raster.fromRows(g, SAND_LEGEND, `sand${i}`));
  const water = [0, 1].map((p) =>
    Array.from({ length: WATER_FRAMES }, (_, f) => makeWaterFrame(p, f, WATER_FRAMES))
  );

  const decals = {};
  for (const [name, def] of Object.entries(DECAL_DEFS)) decals[name] = Raster.fromRows(def.rows, def.legend, name);

  const objects = {
    [Obj.PINE]: treeSet(PINE_ROWS, TREE_LEGENDS.pine, TREE_ROOT_ROW.PINE, "pine"),
    [Obj.PINE_YOUNG]: treeSet(PINE_YOUNG_ROWS, TREE_LEGENDS.pine, TREE_ROOT_ROW.PINE_YOUNG, "pineYoung"),
    [Obj.OAK]: treeSet(OAK_ROWS, TREE_LEGENDS.oak, TREE_ROOT_ROW.OAK, "oak"),
    [Obj.OAK_AUTUMN]: treeSet(OAK_ROWS, TREE_LEGENDS.autumn, TREE_ROOT_ROW.OAK, "oakAutumn"),
    [Obj.BERRY_BUSH]: propSet(BERRY_BUSH_ROWS, bushLegend(true), "berryBush"),
    [Obj.STONE_A]: propSet(STONE_A_ROWS, stoneLegend, "stoneA", false),
    [Obj.STONE_B]: propSet(STONE_B_ROWS, stoneLegend, "stoneB", false),
    [Obj.STUMP]: propSet(STUMP_ROWS, stumpLegend, "stump"),
  };

  return { grass, dirt, sand, water, decals, objects };
}
