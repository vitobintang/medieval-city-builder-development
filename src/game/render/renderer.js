import { TILE, CHUNK, WATER_FRAME_TIME, WATER_FRAMES } from "../config.js";
import { Terrain, Obj } from "../world/tiles.js";
import { bakeChunk } from "./chunkBaker.js";
import { rasterToCanvas } from "../art/atlas.js";
import { jitterX, jitterY, flipOf } from "../world/objectLayout.js";
import { makeCloudCanvas, CLOUD_TEXEL, CLOUD_WIND } from "./clouds.js";
import { yieldFrame } from "../core/math.js";

const OCEAN = "#3f93d6";

/**
 * Draws the world each frame:
 *   1. animated water  2. baked ground chunks (incl. shorelines)  3. y-sorted objects
 *   (swaying trees)    4. hover/grid overlays   5. drifting cloud shadows
 * Everything is snapped to whole device pixels so the pixel art stays razor sharp.
 */
export class Renderer {
  constructor(canvas, atlas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.atlas = atlas.canvases;
    this.rasterAtlas = atlas.rasters;
    this.dpr = 1;
    this.world = null;
    this.chunks = null;
    this.chunksW = 0;
    this.chunksH = 0;
    this.showGrid = false;
    this.showClouds = true;
    this.cloudCanvas = makeCloudCanvas();
    this.cloudPattern = this.ctx.createPattern(this.cloudCanvas, "repeat");
  }

  resize(cssW, cssH, dpr) {
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(cssW * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssH * dpr));
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
  }

  /** Bake all ground chunks (with progress) then swap the new world in. */
  async setWorld(world, onProgress = () => {}, isStale = () => false) {
    const cw = Math.ceil(world.width / CHUNK);
    const ch = Math.ceil(world.height / CHUNK);
    const chunks = new Array(cw * ch);
    const total = cw * ch;
    for (let i = 0; i < total; i++) {
      chunks[i] = rasterToCanvas(bakeChunk(world, this.rasterAtlas, i % cw, Math.floor(i / cw)));
      if (i % 6 === 5) {
        onProgress(0.8 + 0.2 * (i / total));
        await yieldFrame();
        if (isStale()) return false;
      }
    }
    this.world = world;
    this.chunks = chunks;
    this.chunksW = cw;
    this.chunksH = ch;
    return true;
  }

  render(camera, time, hover) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, W, H);
    const world = this.world;
    if (!world) return;

    const s = camera.zoom * this.dpr; // device px per sprite px
    const left = camera.left;
    const top = camera.top;
    const viewWw = W / s;
    const viewWh = H / s;
    const sx = (wx) => Math.round((wx - left) * s);
    const sy = (wy) => Math.round((wy - top) * s);

    const tx0 = Math.max(0, Math.floor(left / TILE));
    const ty0 = Math.max(0, Math.floor(top / TILE));
    const tx1 = Math.min(world.width - 1, Math.floor((left + viewWw) / TILE));
    const ty1 = Math.min(world.height - 1, Math.floor((top + viewWh) / TILE));
    const A = this.atlas;

    // 1) animated water --------------------------------------------------
    const wf = time / WATER_FRAME_TIME;
    for (let ty = ty0; ty <= ty1; ty++) {
      const y0 = sy(ty * TILE);
      const hgt = sy((ty + 1) * TILE) - y0;
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * world.width + tx;
        if (world.terrain[i] !== Terrain.WATER) continue;
        const frame = Math.floor(wf + (tx + ty) * 0.3) % WATER_FRAMES;
        const x0 = sx(tx * TILE);
        ctx.drawImage(A.water[world.variant[i] & 1][frame], x0, y0, sx((tx + 1) * TILE) - x0, hgt);
      }
    }

    // 2) baked ground chunks --------------------------------------------
    const cx0 = Math.floor(tx0 / CHUNK);
    const cx1 = Math.floor(tx1 / CHUNK);
    const cy0 = Math.floor(ty0 / CHUNK);
    const cy1 = Math.floor(ty1 / CHUNK);
    const CS = CHUNK * TILE;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const x0 = sx(cx * CS);
        const y0 = sy(cy * CS);
        ctx.drawImage(this.chunks[cy * this.chunksW + cx], x0, y0, sx((cx + 1) * CS) - x0, sy((cy + 1) * CS) - y0);
      }
    }

    // 3) objects, row by row so lower rows overlap higher ones -----------
    const windAmp = 0.55 + 0.45 * Math.sin(time * 0.21);
    const rowEnd = Math.min(world.height - 1, ty1 + 3);
    const colStart = Math.max(0, tx0 - 1);
    const colEnd = Math.min(world.width - 1, tx1 + 1);
    for (let ty = ty0; ty <= rowEnd; ty++) {
      for (let tx = colStart; tx <= colEnd; tx++) {
        const i = ty * world.width + tx;
        const o = world.obj[i];
        if (o === Obj.NONE) continue;
        const def = A.objects[o];
        const v = world.variant[i];
        let level = 0;
        if (def.sway) {
          const g = Math.sin(time * 1.35 + tx * 0.19 + ty * 0.11 + v * 0.012) * windAmp;
          level = Math.max(0, Math.min(4, Math.round((0.25 + g * 0.75) * 2.2) + 2));
        }
        const spr = def.frames[flipOf(v)][level];
        const wx = tx * TILE + 8 - def.pivotX + jitterX(v, o);
        const wy = ty * TILE + TILE - spr.height + jitterY(v, o);
        const x0 = sx(wx);
        const y0 = sy(wy);
        ctx.drawImage(spr, x0, y0, sx(wx + spr.width) - x0, sy(wy + spr.height) - y0);
      }
    }

    // 4) grid + hover ----------------------------------------------------
    if (this.showGrid && s >= 2) {
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let tx = tx0; tx <= tx1 + 1; tx++) {
        const x = sx(tx * TILE) + 0.5;
        ctx.moveTo(x, sy(ty0 * TILE));
        ctx.lineTo(x, sy((ty1 + 1) * TILE));
      }
      for (let ty = ty0; ty <= ty1 + 1; ty++) {
        const y = sy(ty * TILE) + 0.5;
        ctx.moveTo(sx(tx0 * TILE), y);
        ctx.lineTo(sx((tx1 + 1) * TILE), y);
      }
      ctx.stroke();
    }
    if (hover && world.inBounds(hover.x, hover.y)) {
      const x0 = sx(hover.x * TILE);
      const y0 = sy(hover.y * TILE);
      const w = sx((hover.x + 1) * TILE) - x0;
      const h = sy((hover.y + 1) * TILE) - y0;
      ctx.fillStyle = "rgba(255, 244, 196, 0.16)";
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = "#fff4c4";
      ctx.lineWidth = Math.max(2, Math.round(this.dpr));
      ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
    }

    // 5) cloud shadows (soft, so smoothing on) ----------------------------
    if (this.showClouds) {
      const k = CLOUD_TEXEL * s;
      const ox = (-left + time * CLOUD_WIND.x) * s;
      const oy = (-top + time * CLOUD_WIND.y) * s;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.translate(ox, oy);
      ctx.scale(k, k);
      ctx.fillStyle = this.cloudPattern;
      ctx.fillRect(-ox / k, -oy / k, W / k, H / k);
      ctx.restore();
    }
  }
}
