import { TERRAIN_INFO, OBJ_INFO } from "../world/tiles.js";

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** One pixel per tile. Returns a canvas that the HUD scales up with pixelated rendering. */
export function buildMinimapCanvas(world) {
  const c = document.createElement("canvas");
  c.width = world.width;
  c.height = world.height;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(world.width, world.height);
  for (let i = 0; i < world.terrain.length; i++) {
    const o = world.obj[i];
    const [r, g, b] = rgb(o ? OBJ_INFO[o].minimap : TERRAIN_INFO[world.terrain[i]].color);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
