import { Terrain, Obj, OBJ_INFO, BUILDING_DEFS, Building } from "./tiles.js";

/**
 * The tile grid. Plain typed arrays so it is cheap to store, scan and (later) save.
 * Index = y * width + x.
 *
 * Two layers live here:
 *  - the natural land (terrain / obj / tone / variant), generated once
 *  - the village (buildings + regrowth timers), mutated by the simulation
 */
export class World {
  constructor(width, height, seed) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    const n = width * height;
    this.terrain = new Uint8Array(n); // Terrain enum
    this.obj = new Uint8Array(n); // Obj enum
    this.tone = new Uint8Array(n); // grass tone 0 normal / 1 lush / 2 sunny
    this.variant = new Uint8Array(n); // random byte for visual variety
    this.buildingOf = new Int32Array(n).fill(-1); // building instance index, -1 = none
    this.regrow = new Float32Array(n); // seconds until a harvested tile recovers
    this.buildings = []; // Building instances (see sim/village.js)
    this.startX = Math.floor(width / 2);
    this.startY = Math.floor(height / 2);
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  idx(x, y) {
    return y * this.width + x;
  }

  getTerrain(x, y) {
    return this.inBounds(x, y) ? this.terrain[y * this.width + x] : Terrain.WATER;
  }

  getObj(x, y) {
    return this.inBounds(x, y) ? this.obj[y * this.width + x] : Obj.NONE;
  }

  setObj(x, y, o) {
    if (this.inBounds(x, y)) this.obj[y * this.width + x] = o;
  }

  buildingAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    const i = this.buildingOf[y * this.width + x];
    return i < 0 ? null : this.buildings[i];
  }

  /** Low structural walls, water and trees all stop a walker. */
  walkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    if (!TERRAIN_WALK[this.terrain[i]]) return false;
    if (this.buildingOf[i] >= 0) return false;
    const o = this.obj[i];
    return o === Obj.NONE ? true : !OBJ_INFO[o].blocks;
  }

  /** Can a building sit here? Flat dry ground, no water, no other building. */
  buildable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    if (!TERRAIN_BUILD[this.terrain[i]]) return false;
    return this.buildingOf[i] < 0;
  }

  /** Footprint check: true if a w*h building anchored at (x, y) fits. */
  canPlace(type, x, y) {
    const def = BUILDING_DEFS[type];
    if (!def || type === Building.NONE) return false;
    for (let j = 0; j < def.h; j++) {
      for (let i = 0; i < def.w; i++) {
        if (!this.buildable(x + i, y + j)) return false;
      }
    }
    // a little breathing room: don't hug the shoreline
    for (let j = -1; j <= def.h; j++) {
      for (let i = -1; i <= def.w; i++) {
        const edge = i < 0 || j < 0 || i >= def.w || j >= def.h;
        if (!edge) continue;
        if (this.getTerrain(x + i, y + j) === Terrain.WATER) return false;
      }
    }
    return true;
  }

  /** Trees and boulders standing inside a footprint get cleared. */
  clearFootprint(x, y, w, h) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!this.inBounds(x + i, y + j)) continue;
        this.obj[this.idx(x + i, y + j)] = Obj.NONE;
      }
    }
  }

  /** Register a placed building on the tile layer. */
  stampBuilding(b) {
    const idx = this.buildings.length;
    for (let j = 0; j < b.h; j++) {
      for (let i = 0; i < b.w; i++) {
        if (this.inBounds(b.x + i, b.y + j)) this.buildingOf[this.idx(b.x + i, b.y + j)] = idx;
      }
    }
    this.buildings.push(b);
    return b;
  }

  /** Nearest walkable tile to (x, y), searched in rings. */
  nearestWalkable(x, y, maxR = 10) {
    if (this.walkable(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
          if (this.walkable(x + i, y + j)) return { x: x + i, y: y + j };
        }
      }
    }
    return null;
  }
}

const TERRAIN_WALK = [];
TERRAIN_WALK[Terrain.WATER] = false;
TERRAIN_WALK[Terrain.SAND] = true;
TERRAIN_WALK[Terrain.DIRT] = true;
TERRAIN_WALK[Terrain.GRASS] = true;

const TERRAIN_BUILD = [];
TERRAIN_BUILD[Terrain.WATER] = false;
TERRAIN_BUILD[Terrain.SAND] = true;
TERRAIN_BUILD[Terrain.DIRT] = true;
TERRAIN_BUILD[Terrain.GRASS] = true;
