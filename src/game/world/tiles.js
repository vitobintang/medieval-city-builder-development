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

/**
 * Constructed buildings (one footprint per instance). Numeric ids are stable and
 * used directly as indices into arrays, so append new buildings at the end.
 */
export const Building = Object.freeze({
  NONE: 0,
  CAMPFIRE: 1,
  WOODCUTTER: 2,
  QUARRY: 3,
  FARM: 4,
  COTTAGE: 5,
  LUMBER: 6,
  STOREHOUSE: 7,
  TAVERN: 8,
  MARKET: 9,
  CHAPEL: 10,
  FORAGER: 11,
});

/**
 * Every building the player can raise.
 *  - cost        resources spent on placement
 *  - buildTime   seconds of work before it is finished
 *  - housing     extra townsfolk it can house
 *  - storage     extra room for wood/stone/food
 *  - jobs        how many of which trade work here
 *  - gather      what its workers harvest from the land
 *  - radius      how far its workers will look for something to harvest
 */
export const BUILDING_DEFS = Object.freeze({
  [Building.CAMPFIRE]: {
    name: "Campfire",
    blurb: "The heart of the settlement. Settlers gather here and new folk arrive.",
    w: 1, h: 1, cost: { wood: 0, stone: 0 }, buildTime: 0, housing: 2,
    storage: 0, jobs: [], gather: null, radius: 0, happiness: 0.05, limit: 1,
  },
  [Building.WOODCUTTER]: {
    name: "Woodcutter's Hut",
    blurb: "One woodcutter fells nearby trees and hauls the logs home.",
    w: 1, h: 1, cost: { wood: 20, stone: 0 }, buildTime: 6, housing: 0,
    storage: 20, jobs: [{ job: "woodcutter", count: 1 }], gather: "tree", radius: 12, happiness: 0,
  },
  [Building.QUARRY]: {
    name: "Quarry",
    blurb: "A stonecutter breaks up boulders and carts the blocks back.",
    w: 1, h: 1, cost: { wood: 25, stone: 10 }, buildTime: 7, housing: 0,
    storage: 20, jobs: [{ job: "miner", count: 1 }], gather: "stone", radius: 12, happiness: 0,
  },
  [Building.FARM]: {
    name: "Wheat Field",
    blurb: "Two tiles of tilled earth. A farmer grows food through the year.",
    w: 2, h: 2, cost: { wood: 20, stone: 0 }, buildTime: 8, housing: 0,
    storage: 30, jobs: [{ job: "farmer", count: 1 }], gather: "farm", radius: 0, happiness: 0,
  },
  [Building.FORAGER]: {
    name: "Forager's Hut",
    blurb: "A forager picks wild berries and mushrooms from the hedgerows.",
    w: 1, h: 1, cost: { wood: 15, stone: 0 }, buildTime: 5, housing: 0,
    storage: 15, jobs: [{ job: "forager", count: 1 }], gather: "berry", radius: 11, happiness: 0,
  },
  [Building.COTTAGE]: {
    name: "Cottage",
    blurb: "A snug timber home. Raises the population the village can support.",
    w: 2, h: 2, cost: { wood: 30, stone: 10 }, buildTime: 9, housing: 3,
    storage: 0, jobs: [], gather: null, radius: 0, happiness: 0.02,
  },
  [Building.LUMBER]: {
    name: "Lumber Camp",
    blurb: "A busy yard with two woodcutters working the woods around it.",
    w: 2, h: 2, cost: { wood: 45, stone: 15 }, buildTime: 12, housing: 0,
    storage: 40, jobs: [{ job: "woodcutter", count: 2 }], gather: "tree", radius: 16, happiness: 0,
  },
  [Building.STOREHOUSE]: {
    name: "Storehouse",
    blurb: "Dry, raised floors and room for a great deal more timber and stone.",
    w: 2, h: 2, cost: { wood: 50, stone: 25 }, buildTime: 12, housing: 0,
    storage: 350, jobs: [], gather: null, radius: 0, happiness: 0.02,
  },
  [Building.TAVERN]: {
    name: "Tavern",
    blurb: "A warm hearth, ale and gossip. Keeps the village in good spirits.",
    w: 3, h: 2, cost: { wood: 70, stone: 30 }, buildTime: 16, housing: 0,
    storage: 60, jobs: [], gather: null, radius: 0, happiness: 0.16,
  },
  [Building.MARKET]: {
    name: "Market",
    blurb: "Striped awnings and traders' stalls. Folk come from miles around.",
    w: 3, h: 2, cost: { wood: 80, stone: 40 }, buildTime: 18, housing: 0,
    storage: 80, jobs: [], gather: null, radius: 0, happiness: 0.12,
  },
  [Building.CHAPEL]: {
    name: "Chapel",
    blurb: "A slate spire above the roofs. Blesses the village and lifts hearts.",
    w: 2, h: 3, cost: { wood: 90, stone: 60 }, buildTime: 22, housing: 0,
    storage: 0, jobs: [], gather: null, radius: 0, happiness: 0.22,
  },
});

/** Build order shown in the toolbar. */
export const BUILD_ORDER = [
  Building.WOODCUTTER,
  Building.QUARRY,
  Building.FORAGER,
  Building.FARM,
  Building.COTTAGE,
  Building.LUMBER,
  Building.STOREHOUSE,
  Building.TAVERN,
  Building.MARKET,
  Building.CHAPEL,
];
