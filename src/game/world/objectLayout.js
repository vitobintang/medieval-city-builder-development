// Deterministic per-object visual placement derived from the tile's variant byte,
// so renderer and tools agree and no allocation happens per frame.

import { Obj } from "./tiles.js";

const MAX_JITTER_X = {
  [Obj.PINE]: 3,
  [Obj.PINE_YOUNG]: 3,
  [Obj.OAK]: 3,
  [Obj.OAK_AUTUMN]: 3,
  [Obj.BERRY_BUSH]: 1,
  [Obj.STONE_A]: 0,
  [Obj.STONE_B]: 0,
  [Obj.STUMP]: 1,
};
const MAX_JITTER_Y = {
  [Obj.PINE]: 1,
  [Obj.PINE_YOUNG]: 1,
  [Obj.OAK]: 1,
  [Obj.OAK_AUTUMN]: 1,
};

/** Horizontal pixel nudge so trees don't sit on a rigid grid. */
export function jitterX(variant, obj) {
  const m = MAX_JITTER_X[obj] || 0;
  if (!m) return 0;
  const v = ((variant >> 1) % 7) - 3;
  return v > m ? m : v < -m ? -m : v;
}

export function jitterY(variant, obj) {
  const m = MAX_JITTER_Y[obj] || 0;
  if (!m) return 0;
  const v = ((variant >> 4) % 3) - 1;
  return v > m ? m : v < -m ? -m : v;
}

/** 0 or 1: mirror the sprite for variety. */
export function flipOf(variant) {
  return variant & 1;
}
