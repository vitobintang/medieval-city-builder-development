// Procedural starting-map generator.
//
// Pipeline (each stage yields to the browser so the loading bar can animate):
//   1. Elevation  : warped fractal noise, minus carved rivers, a guaranteed pond,
//                   and a ragged coastline; plus a gentle clearing for the village.
//   2. Terrain    : water / sand shore / meadow / bare earth patches.
//   3. Flora+rock : noise-driven pine & oak forests, scattered stones and stumps.
//   4. Resources  : guaranteed berry glades and stone outcrops near the start.

import { World } from "./world.js";
import { Terrain, Obj } from "./tiles.js";
import { Noise2D } from "../core/noise.js";
import { mulberry32 } from "../core/rng.js";
import { smoothstep, yieldFrame } from "../core/math.js";
import { MAP_W, MAP_H } from "../config.js";

const WATER_LEVEL = 0.17;
const BEACH_WIDTH = 0.05;

export async function generateWorld({ seed, width = MAP_W, height = MAP_H, onProgress = () => {} }) {
  const world = new World(width, height, seed);
  const rng = mulberry32(seed ^ 0x51ed270b);
  const noise = (k) => new Noise2D(seed * 31 + k * 977);
  const nWarp = noise(1), nElev = noise(2), nRiver = noise(3), nRiverW = noise(4), nPond = noise(5);
  const nCoast = noise(6), nBeach = noise(7), nDirt = noise(8), nForest = noise(9), nSpecies = noise(10);
  const nRock = noise(11), nTone = noise(12), nAutumn = noise(13);

  const cx = world.startX;
  const cy = world.startY;
  const dist = (x, y) => Math.hypot(x - cx, y - cy);

  // ------------------------------------------------------------ 1. elevation
  onProgress(0.02, "Shaping the land…");
  await yieldFrame();

  const pondAngle = rng() * Math.PI * 2;
  const pondDist = 21 + rng() * 6;
  const pondX = cx + Math.cos(pondAngle) * pondDist;
  const pondY = cy + Math.sin(pondAngle) * pondDist;
  const pondR = 6 + rng() * 2;

  const elev = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wx = x + nWarp.noise(x * 0.045, y * 0.045) * 9;
      const wy = y + nWarp.noise(x * 0.045 + 50, y * 0.045 + 50) * 9;
      let e = nElev.fbm01(wx / 52, wy / 52, 5);

      // rivers: carve a channel where a second noise field crosses zero
      const rv = Math.abs(nRiver.fbm(wx / 68, wy / 68, 3));
      const rw = 0.03 + 0.022 * (nRiverW.noise(x * 0.03, y * 0.03) * 0.5 + 0.5);
      e -= (1 - smoothstep(0, rw, rv)) * 0.3;

      // a guaranteed pond so every village has fresh water within reach
      const pd = Math.hypot(x - pondX, y - pondY);
      const pr = pondR * (0.85 + 0.3 * nPond.noise(x * 0.15, y * 0.15));
      e -= (1 - smoothstep(pr * 0.35, pr, pd)) * 0.6;

      // keep a calm green clearing at the map centre for the first settlers
      e += (1 - smoothstep(9, 20, dist(x, y))) * 0.5;

      // ragged coastline around the map edge
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y) + nCoast.noise(x * 0.08, y * 0.08) * 4;
      e -= (1 - smoothstep(2, 11, edge)) * 0.6;

      elev[y * width + x] = e;
    }
  }

  // ------------------------------------------------------------ 2. terrain
  onProgress(0.2, "Carving rivers and meadows…");
  await yieldFrame();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const e = elev[i];
      let t;
      if (e < WATER_LEVEL) t = Terrain.WATER;
      else if (e < WATER_LEVEL + BEACH_WIDTH + nBeach.noise(x * 0.12, y * 0.12) * 0.02) t = Terrain.SAND;
      else {
        t = Terrain.GRASS;
        const d = nDirt.fbm01(x / 13, y / 13, 3);
        const r = nRock.fbm01(x / 12, y / 12, 3);
        if (d > 0.79 || r > 0.8) t = Terrain.DIRT;
      }
      world.terrain[i] = t;
      world.variant[i] = Math.floor(rng() * 256);
    }
  }

  // ------------------------------------------------------------ 3. flora & rocks
  onProgress(0.45, "Planting the old forests…");
  await yieldFrame();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const t = world.terrain[i];
      let tone = 0;
      const toneN = nTone.fbm01(x / 26, y / 26, 2);
      if (toneN < 0.42) tone = 1;
      else if (toneN > 0.6) tone = 2;

      if (t === Terrain.GRASS || t === Terrain.DIRT) {
        const rockN = nRock.fbm01(x / 12, y / 12, 3);
        const f = nForest.fbm01(x / 20, y / 20, 4) - (1 - smoothstep(8, 22, dist(x, y))) * 0.5;
        const dens = smoothstep(0.47, 0.64, f);
        const isGrass = t === Terrain.GRASS;

        if (rockN > 0.82 && rng() < 0.3 + (rockN - 0.82) * 3) {
          world.obj[i] = rng() < 0.45 ? Obj.STONE_A : Obj.STONE_B;
        } else if (rng() < (isGrass ? dens * 0.9 + 0.012 : dens * 0.3)) {
          world.obj[i] = pickTree(x, y, dens, nSpecies, nAutumn, rng);
          tone = 1; // shaded forest floor
        } else if (isGrass && dens < 0.3 && rng() < 0.004) {
          world.obj[i] = Obj.STUMP;
        }
      }
      world.tone[i] = tone;
    }
  }

  // ------------------------------------------------------------ 4. resources
  onProgress(0.7, "Scattering berries and stone…");
  await yieldFrame();

  const area = width * height;
  // near the start: reachable first resources
  for (let k = 0; k < 4; k++) placeBerryGlade(world, rng, 10, 26);
  for (let k = 0; k < 3; k++) placeStoneOutcrop(world, rng, 14, 32);
  // the rest of the map
  const farBerries = Math.round(area / 2600);
  const farStone = Math.round(area / 3600);
  for (let k = 0; k < farBerries; k++) placeBerryGlade(world, rng, 26, 110);
  for (let k = 0; k < farStone; k++) placeStoneOutcrop(world, rng, 32, 110);

  onProgress(0.8, "Painting the world…");
  await yieldFrame();
  return world;
}

function pickTree(x, y, dens, nSpecies, nAutumn, rng) {
  const sp = nSpecies.fbm01(x / 17, y / 17, 2);
  const edgeness = 1 - dens;
  let pine = sp < 0.48;
  if (rng() < 0.13) pine = !pine; // mixed woodland
  if (pine) return rng() < 0.08 + edgeness * 0.5 ? Obj.PINE_YOUNG : Obj.PINE;
  return nAutumn.fbm01(x / 14, y / 14, 2) > 0.6 ? Obj.OAK_AUTUMN : Obj.OAK;
}

function randomSpot(world, rng, minD, maxD, accept) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const a = rng() * Math.PI * 2;
    const d = minD + rng() * (maxD - minD);
    const x = Math.round(world.startX + Math.cos(a) * d);
    const y = Math.round(world.startY + Math.sin(a) * d);
    if (x < 4 || y < 4 || x >= world.width - 4 || y >= world.height - 4) continue;
    if (accept(world.terrain[world.idx(x, y)], x, y)) return [x, y];
  }
  return null;
}

/** A sunny glade: clears trees and sprinkles berry bushes. */
function placeBerryGlade(world, rng, minD, maxD) {
  const spot = randomSpot(world, rng, minD, maxD, (t) => t === Terrain.GRASS);
  if (!spot) return;
  const [bx, by] = spot;
  const R = 3;
  for (let y = by - R; y <= by + R; y++) {
    for (let x = bx - R; x <= bx + R; x++) {
      if (!world.inBounds(x, y)) continue;
      const i = world.idx(x, y);
      const d = Math.hypot(x - bx, y - by);
      if (d > R + 0.2 || world.terrain[i] === Terrain.WATER || world.terrain[i] === Terrain.SAND) continue;
      if (d < R - 0.8) {
        // clear a glade around the bushes
        const o = world.obj[i];
        if (o >= Obj.PINE && o <= Obj.OAK_AUTUMN) world.obj[i] = Obj.NONE;
        if (world.terrain[i] === Terrain.GRASS && world.tone[i] === 1) world.tone[i] = 0;
      }
      if (world.obj[i] === Obj.NONE && world.terrain[i] === Terrain.GRASS && d < R - 0.4 && rng() < 0.62 - d * 0.14) {
        world.obj[i] = Obj.BERRY_BUSH;
      }
    }
  }
}

/** A rocky outcrop: bare earth ringed with boulders and a big central deposit. */
function placeStoneOutcrop(world, rng, minD, maxD) {
  const spot = randomSpot(world, rng, minD, maxD, (t) => t === Terrain.GRASS || t === Terrain.DIRT);
  if (!spot) return;
  const [sx, sy] = spot;
  const R = 3 + Math.floor(rng() * 2);
  for (let y = sy - R; y <= sy + R; y++) {
    for (let x = sx - R; x <= sx + R; x++) {
      if (!world.inBounds(x, y)) continue;
      const i = world.idx(x, y);
      const t = world.terrain[i];
      if (t === Terrain.WATER || t === Terrain.SAND) continue;
      const d = Math.hypot(x - sx, y - sy) + (rng() - 0.5);
      if (d > R) continue;
      if (rng() < 0.9 - d * 0.14) world.terrain[i] = Terrain.DIRT;
      const o = world.obj[i];
      if (o >= Obj.PINE && o <= Obj.OAK_AUTUMN) world.obj[i] = Obj.NONE;
      if (rng() < 0.7 - d * 0.16) world.obj[i] = d < R * 0.5 ? Obj.STONE_A : Obj.STONE_B;
    }
  }
}
