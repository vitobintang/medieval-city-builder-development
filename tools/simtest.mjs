// Headless village test + preview renderer.
//   node tools/simtest.mjs [seed] [minutes]
//
// 1. generates a world and runs the village simulation for a few in-game minutes,
//    printing resource/population milestones so balance regressions are obvious
// 2. renders the resulting village to tools/out/village.png with the exact same
//    sprite anchoring the browser renderer uses (ground, buildings, villagers)

import fs from "node:fs";
import { Raster } from "../src/game/art/raster.js";
import { buildRasterAtlas } from "../src/game/art/rasterAtlas.js";
import { generateWorld } from "../src/game/world/worldgen.js";
import { bakeChunk } from "../src/game/render/chunkBaker.js";
import { Village } from "../src/game/sim/village.js";
import { BUILDING_DEFS, Building, Terrain } from "../src/game/world/tiles.js";
import { CHUNK, TILE } from "../src/game/config.js";
import { jitterX, jitterY, flipOf } from "../src/game/world/objectLayout.js";
import { writePNG } from "./png.mjs";

fs.mkdirSync("tools/out", { recursive: true });
const seed = Number(process.argv[2] || 1234);
const minutes = Number(process.argv[3] || 6);

const ra = buildRasterAtlas();
const world = await generateWorld({ seed });
const village = new Village(world, { seed });
village.start();
const STEP = 1 / 20;

const report = () => {
  const r = village.resources;
  console.log(
    `t=${village.time.toFixed(0).padStart(3)}s pop=${String(village.villagers.length).padStart(2)}` +
      ` wood=${String(Math.floor(r.wood)).padStart(4)}/${village.storageCap.wood}` +
      ` stone=${String(Math.floor(r.stone)).padStart(4)}/${village.storageCap.stone}` +
      ` food=${String(Math.floor(r.food)).padStart(4)}` +
      ` happy=${(village.happiness * 100) | 0}%` +
      ` jobs=${jobLine()}`
  );
};
const jobLine = () => {
  const counts = {};
  for (const v of village.villagers) counts[v.job] = (counts[v.job] || 0) + 1;
  return Object.entries(counts).map(([k, n]) => `${k}:${n}`).join(" ");
};

// a plausible opening: the player builds a hut, a field and a cottage
function tryBuild(type, dx, dy) {
  const def = BUILDING_DEFS[type];
  for (let r = 2; r < 14; r++) {
    for (let a = 0; a < 18; a++) {
      const ang = (a / 18) * Math.PI * 2;
      const x = Math.round(world.startX + dx + Math.cos(ang) * r);
      const y = Math.round(world.startY + dy + Math.sin(ang) * r);
      const def2 = def;
      const ok = (() => {
        for (let j = 0; j < def2.h; j++)
          for (let i = 0; i < def2.w; i++) if (!world.canPlace(type, x, y)) return false;
        return true;
      })();
      if (!ok) continue;
      const res = village.place(type, x, y);
      if (res.ok) return res.building;
    }
  }
  return null;
}

const schedule = [
  [2, () => tryBuild(Building.WOODCUTTER, -3, -2)],
  [5, () => tryBuild(Building.FARM, 3, -3)],
  [26, () => tryBuild(Building.COTTAGE, -2, 3)],
  [70, () => tryBuild(Building.QUARRY, 4, 2)],
  [130, () => tryBuild(Building.LUMBER, -5, 4)],
];
let nextReport = 0;
const steps = Math.round(minutes * 60 / STEP);
report();
for (let i = 0; i < steps; i++) {
  for (const [at, fn] of schedule) {
    if (village.time >= at && !fn.done) {
      fn.done = true;
      const b = fn();
      console.log(`  [build] t=${village.time.toFixed(0)}s ${b ? BUILDING_DEFS[b.type].name : "FAILED"}`);
    }
  }
  village.tick(STEP);
  if (village.time >= nextReport) {
    nextReport += 30;
    report();
  }
}
console.log("journal:", village.events.slice(-6).join(" | "));

// ---------------------------------------------------------------- render
const cw = Math.ceil(world.width / CHUNK);
const ch = Math.ceil(world.height / CHUNK);
const ground = new Raster(cw * CHUNK * TILE, ch * CHUNK * TILE);
for (let cy = 0; cy < ch; cy++)
  for (let cx = 0; cx < cw; cx++) ground.blit(bakeChunk(world, ra, cx, cy), cx * CHUNK * TILE, cy * CHUNK * TILE);

const zoomIn = process.argv.includes("--zoom");
const focus =
  (zoomIn && world.buildings.filter((b) => b.type !== Building.CAMPFIRE).pop()) ||
  world.buildings.find((b) => b.type === Building.CAMPFIRE) ||
  { x: world.startX, y: world.startY };
const viewW = zoomIn ? 16 : 36;
const viewH = zoomIn ? 11 : 26;
const viewX0 = Math.max(0, Math.round(focus.x - viewW / 2) - 2);
const viewY0 = Math.max(0, Math.round(focus.y - viewH / 2) - 2);
const out = new Raster(viewW * TILE, viewH * TILE);
// water
for (let y = 0; y < viewH; y++)
  for (let x = 0; x < viewW; x++) {
    const wx = viewX0 + x;
    const wy = viewY0 + y;
    if (world.getTerrain(wx, wy) === Terrain.WATER) out.blit(ra.water[(wx + wy) & 1][0], x * TILE, y * TILE);
  }
out.blit(ground, -viewX0 * TILE, -viewY0 * TILE);

// entities sorted by the row their feet are on (same rule as the renderer)
const ents = [];
for (let ty = viewY0 - 3; ty < viewY0 + viewH + 3; ty++) {
  for (let tx = viewX0 - 2; tx < viewX0 + viewW + 2; tx++) {
    if (!world.inBounds(tx, ty)) continue;
    const i = world.idx(tx, ty);
    const o = world.obj[i];
    if (!o) continue;
    const s = ra.objects[o];
    if (!s) continue;
    const v = world.variant[i];
    ents.push({
      row: ty,
      draw: () => {
        const spr = s.frames[flipOf(v)][s.sway ? 2 : 0];
        out.blit(spr, (tx - viewX0) * TILE + 8 - s.pivotX + jitterX(v, o), (ty - viewY0) * TILE + TILE - spr.h + jitterY(v, o));
      },
    });
  }
}
for (const b of world.buildings) {
  const art = ra.buildings[b.type];
  const def = BUILDING_DEFS[b.type];
  const footW = def.w * TILE;
  const footH = def.h * TILE;
  ents.push({
    row: b.y + b.h - 1,
    draw: () => {
      const dx = (b.x - viewX0) * TILE + footW / 2 - art.pivotX;
      const dy = (b.y - viewY0) * TILE + footH - art.pivotY;
      const spr = art.frames[0];
      if (b.state === "done") out.blit(spr, dx, dy);
      else {
        // split the sprite so only the built part shows (as the renderer does)
        const visH = Math.max(1, Math.round(spr.h * Math.max(0.15, b.progress)));
        const cropped = new Raster(spr.w, visH);
        for (let y = 0; y < visH; y++)
          for (let x = 0; x < spr.w; x++) cropped.setPixel(x, y, spr.getPixel(x, spr.h - visH + y));
        out.blit(cropped, dx, dy + spr.h - visH);
        const scaf = ra.scaffolds[`${def.w}x${def.h}`];
        if (scaf) out.blit(scaf.raster, (b.x - viewX0) * TILE + footW / 2 - scaf.pivotX, (b.y - viewY0) * TILE + footH - scaf.pivotY);
      }
    },
  });
}
for (const v of village.villagers) {
  const set = ra.folk[v.job] || ra.folk.idle;
  const frames = set[v.dir] || set.down;
  const spr = frames[v.frame] || frames[2];
  ents.push({
    row: Math.floor(v.y),
    draw: () => {
      const footX = (v.x - viewX0) * TILE;
      const footY = (v.y - viewY0) * TILE + 3;
      const dx = Math.round(footX - spr.w / 2);
      const dy = Math.round(footY - spr.h + 2);
      out.blit(spr, dx, dy);
      if (v.carrying) {
        const cargo = ra.cargo[v.carrying.kind]?.[v.dir];
        if (cargo) out.blit(cargo, Math.round(footX - cargo.w / 2), Math.round(footY - cargo.h + 2));
      }
    },
  });
}
ents.sort((a, b) => a.row - b.row);
for (const e of ents) e.draw();

writePNG(zoomIn ? "tools/out/village-zoom.png" : "tools/out/village.png", out, zoomIn ? 6 : 2);
console.log("wrote tools/out/village.png", `(${out.w}x${out.h})`);
