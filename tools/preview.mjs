// Dev tool: validates sprite grids, prints world stats and renders PNG previews.
//   node tools/preview.mjs [seed]
// Output: tools/out/sprites.png, tools/out/map.png (centre crop), tools/out/full.png (whole map, 1 px/tile)
import fs from "node:fs";
import zlib from "node:zlib";
import { Raster, validateRows } from "../src/game/art/raster.js";
import { buildRasterAtlas, SWAY_LEVELS } from "../src/game/art/rasterAtlas.js";
import { generateWorld } from "../src/game/world/worldgen.js";
import { bakeChunk } from "../src/game/render/chunkBaker.js";
import { jitterX, jitterY, flipOf } from "../src/game/world/objectLayout.js";
import { Terrain, Obj, OBJ_INFO, TERRAIN_INFO } from "../src/game/world/tiles.js";
import { CHUNK, TILE } from "../src/game/config.js";
import { GRASS_GRIDS, DIRT_GRIDS, SAND_GRIDS, DIRT_LEGEND, SAND_LEGEND, grassLegend } from "../src/game/art/sprites/terrainSprites.js";
import * as T from "../src/game/art/sprites/treeSprites.js";
import * as Pr from "../src/game/art/sprites/propSprites.js";

fs.mkdirSync("tools/out", { recursive: true });

// ---------- PNG writer
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePNG(path, r, scale = 1) {
  const w = r.w * scale;
  const h = r.h * scale;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const si = (Math.floor(y / scale) * r.w + Math.floor(x / scale)) * 4;
      const di = y * (w * 4 + 1) + 1 + x * 4;
      raw[di] = r.data[si]; raw[di + 1] = r.data[si + 1]; raw[di + 2] = r.data[si + 2]; raw[di + 3] = r.data[si + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]));
}

// ---------- 1. validate every grid
const problems = [];
GRASS_GRIDS.forEach((g, i) => problems.push(...validateRows(g, grassLegend(0), `grass${i}`)));
DIRT_GRIDS.forEach((g, i) => problems.push(...validateRows(g, DIRT_LEGEND, `dirt${i}`)));
SAND_GRIDS.forEach((g, i) => problems.push(...validateRows(g, SAND_LEGEND, `sand${i}`)));
problems.push(...validateRows(T.PINE_ROWS, T.pineLegend, "pine"));
problems.push(...validateRows(T.PINE_YOUNG_ROWS, T.pineLegend, "pineYoung"));
problems.push(...validateRows(T.OAK_ROWS, T.TREE_LEGENDS.oak, "oak"));
problems.push(...validateRows(Pr.BERRY_BUSH_ROWS, Pr.bushLegend(), "bush"));
problems.push(...validateRows(Pr.STONE_A_ROWS, Pr.stoneLegend, "stoneA"));
problems.push(...validateRows(Pr.STONE_B_ROWS, Pr.stoneLegend, "stoneB"));
problems.push(...validateRows(Pr.STUMP_ROWS, Pr.stumpLegend, "stump"));
// non-16 heights/widths
const expect = (rows, w, h, n) => { if (rows.length !== h || rows[0].length !== w) problems.push(`${n}: size ${rows[0].length}x${rows.length}, expected ${w}x${h}`); };
GRASS_GRIDS.forEach((g, i) => expect(g, 16, 16, "grass" + i));
DIRT_GRIDS.forEach((g, i) => expect(g, 16, 16, "dirt" + i));
SAND_GRIDS.forEach((g, i) => expect(g, 16, 16, "sand" + i));
expect(T.PINE_ROWS, 16, 24, "pine"); expect(T.PINE_YOUNG_ROWS, 16, 16, "pineYoung"); expect(T.OAK_ROWS, 16, 20, "oak");
expect(Pr.BERRY_BUSH_ROWS, 16, 16, "bush"); expect(Pr.STONE_A_ROWS, 16, 16, "stoneA"); expect(Pr.STONE_B_ROWS, 16, 16, "stoneB"); expect(Pr.STUMP_ROWS, 16, 16, "stump");
console.log(problems.length ? "SPRITE PROBLEMS:\n" + problems.join("\n") : "All sprite grids valid.");

// ---------- 2. sprite sheet
const ra = buildRasterAtlas();
const sheet = new Raster(16 * 24, 16 * 7).fill("#6fb540");
let sx = 0;
const put = (r, row) => { sheet.blit(r, sx, row * 24); sx += r.w + 2; };
const rowAt = (n) => { sx = 0; return n; };
let row = rowAt(0);
ra.grass.forEach((tone) => tone.forEach((r) => put(r, row)));
row = rowAt(1); ra.dirt.forEach((r) => put(r, row)); ra.sand.forEach((r) => put(r, row));
row = rowAt(2); ra.water.forEach((p) => p.forEach((r) => put(r, row)));
row = rowAt(3); Object.values(ra.decals).forEach((r) => put(r, row));
row = rowAt(4);
for (const o of [Obj.PINE, Obj.PINE_YOUNG, Obj.OAK, Obj.OAK_AUTUMN, Obj.BERRY_BUSH, Obj.STONE_A, Obj.STONE_B, Obj.STUMP]) put(ra.objects[o].frames[0][ra.objects[o].sway ? 2 : 0], row);
writePNG("tools/out/sprites.png", sheet, 4);

// sway strip
const sway = new Raster(5 * 22, 26).fill("#6fb540");
SWAY_LEVELS.forEach((_, i) => sway.blit(ra.objects[Obj.PINE].frames[0][i], i * 21, 0));
writePNG("tools/out/sway.png", sway, 6);

// ---------- 3. world
const seed = Number(process.argv[2] || 1234);
const t0 = Date.now();
const world = await generateWorld({ seed });
console.log(`worldgen ${Date.now() - t0}ms  seed=${seed}`);
const counts = {}; const oc = {};
for (let i = 0; i < world.terrain.length; i++) { counts[world.terrain[i]] = (counts[world.terrain[i]] || 0) + 1; oc[world.obj[i]] = (oc[world.obj[i]] || 0) + 1; }
const total = world.terrain.length;
for (const [k, v] of Object.entries(counts)) console.log(TERRAIN_INFO[k].name.padEnd(14), ((v / total) * 100).toFixed(1) + "%");
for (const [k, v] of Object.entries(oc)) if (+k) console.log(OBJ_INFO[k].name.padEnd(14), v);

const t1 = Date.now();
const cw = Math.ceil(world.width / CHUNK), ch = Math.ceil(world.height / CHUNK);
const ground = new Raster(cw * CHUNK * TILE, ch * CHUNK * TILE);
for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) ground.blit(bakeChunk(world, ra, cx, cy), cx * CHUNK * TILE, cy * CHUNK * TILE);
console.log(`bake ${Date.now() - t1}ms`);

function compose(x0, y0, x1, y1) {
  const out = new Raster((x1 - x0) * TILE, (y1 - y0) * TILE);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (world.terrain[world.idx(x, y)] === Terrain.WATER) out.blit(ra.water[(x + y) & 1][0], (x - x0) * TILE, (y - y0) * TILE);
  const g = new Raster(out.w, out.h);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) g.setPixel(x, y, ground.getPixel(x + x0 * TILE, y + y0 * TILE));
  out.blit(g, 0, 0);
  for (let y = y0; y < y1 + 2 && y < world.height; y++) for (let x = x0; x < x1; x++) {
    const i = world.idx(x, y); const o = world.obj[i]; if (!o) continue;
    const s = ra.objects[o]; const v = world.variant[i];
    out.blit(s.frames[flipOf(v)][s.sway ? 2 : 0], (x - x0) * TILE + 8 - s.pivotX + jitterX(v, o), (y - y0) * TILE + TILE - s.pivotY + jitterY(v, o));
  }
  return out;
}
const cx0 = world.startX - 36, cy0 = world.startY - 22;
writePNG("tools/out/map.png", compose(cx0, cy0, cx0 + 72, cy0 + 44), 2);

// 1px/tile overview
const full = new Raster(world.width, world.height);
for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
  const i = world.idx(x, y); const o = world.obj[i];
  const c = o ? OBJ_INFO[o].minimap : TERRAIN_INFO[world.terrain[i]].color;
  full.setPixel(x, y, [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255]);
}
writePNG("tools/out/full.png", full, 4);
console.log("wrote tools/out/*.png");
