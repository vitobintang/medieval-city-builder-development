// Enumerations for everything that can exist on the grid.

/**
 * Ground types. The numeric order is also the *blend priority*:
 * higher values bleed over lower ones (grass overlaps sand, sand overlaps water...).
 */
export const Terrain = Object.freeze({
  WATER: 0,
  SAND: 1,
  DIRT: 2,
  GRASS: 3,
});

export const TERRAIN_INFO = Object.freeze({
  [Terrain.WATER]: { name: "Water", walkable: false, buildable: false, color: "#3f93d6" },
  [Terrain.SAND]: { name: "Sandy Shore", walkable: true, buildable: true, color: "#e6cf93" },
  [Terrain.DIRT]: { name: "Bare Earth", walkable: true, buildable: true, color: "#a07a4c" },
  [Terrain.GRASS]: { name: "Meadow Grass", walkable: true, buildable: true, color: "#6fb540" },
});

/** Things standing on a tile (one per tile). */
export const Obj = Object.freeze({
  NONE: 0,
  PINE: 1,
  PINE_YOUNG: 2,
  OAK: 3,
  OAK_AUTUMN: 4,
  BERRY_BUSH: 5,
  STONE_A: 6,
  STONE_B: 7,
  STUMP: 8,
});

export const OBJ_INFO = Object.freeze({
  [Obj.PINE]: { name: "Pine Tree", kind: "tree", blocks: true, minimap: "#1f5c3b" },
  [Obj.PINE_YOUNG]: { name: "Young Pine", kind: "tree", blocks: true, minimap: "#2e7d47" },
  [Obj.OAK]: { name: "Oak Tree", kind: "tree", blocks: true, minimap: "#3b8a35" },
  [Obj.OAK_AUTUMN]: { name: "Autumn Oak", kind: "tree", blocks: true, minimap: "#cf6a2a" },
  [Obj.BERRY_BUSH]: { name: "Wild Berry Bush", kind: "bush", blocks: false, minimap: "#d62839" },
  [Obj.STONE_A]: { name: "Stone Deposit", kind: "stone", blocks: true, minimap: "#aab1bd" },
  [Obj.STONE_B]: { name: "Loose Boulders", kind: "stone", blocks: true, minimap: "#868d9a" },
  [Obj.STUMP]: { name: "Old Stump", kind: "prop", blocks: false, minimap: "#6e4524" },
});

export const isTree = (o) => o >= Obj.PINE && o <= Obj.OAK_AUTUMN;
