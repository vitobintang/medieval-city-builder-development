import { Terrain, Obj } from "./tiles.js";

/**
 * The tile grid. Plain typed arrays so it is cheap to store, scan and (later) save.
 * Index = y * width + x.
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
}
