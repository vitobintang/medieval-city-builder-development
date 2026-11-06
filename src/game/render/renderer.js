import { TILE, CHUNK, WATER_FRAME_TIME, WATER_FRAMES } from "../config.js";
import { Terrain, Obj, BUILDING_DEFS } from "../world/tiles.js";
import { bakeChunk } from "./chunkBaker.js";
import { rasterToCanvas } from "../art/atlas.js";
import { jitterX, jitterY, flipOf } from "../world/objectLayout.js";
import { makeCloudCanvas, CLOUD_TEXEL, CLOUD_WIND } from "./clouds.js";
import { yieldFrame } from "../core/math.js";

const OCEAN = "#3f93d6";
const FIRE_FRAME_TIME = 0.22;

/**
 * Draws the world each frame:
 *   1. animated water
 *   2. baked ground chunks (incl. shorelines)
 *   3. entities, row by row so lower rows overlap higher ones:
 *        natural objects, buildings, villagers, floating "+5 wood" text
 *   4. overlays: grid, hover, build ghost, selection
 *   5. drifting cloud shadows
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
    // scratch lists reused every frame (no allocation in the hot loop)
    this.rowBuildings = [];
    this.rowFolk = [];
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

  /** Re-bake only the chunks that contain the given tile indices (harvested tiles). */
  refreshTiles(indices) {
    if (!this.world || !this.chunks || !indices || !indices.length) return;
    const world = this.world;
    const touched = new Set();
    for (const i of indices) {
      const x = i % world.width;
      const y = (i / world.width) | 0;
      touched.add(Math.floor(y / CHUNK) * this.chunksW + Math.floor(x / CHUNK));
    }
    for (const c of touched) {
      this.chunks[c] = rasterToCanvas(bakeChunk(world, this.rasterAtlas, c % this.chunksW, Math.floor(c / this.chunksW)));
    }
  }

  render(camera, time, state = {}) {
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
    const A = this.atlas;

    const tx0 = Math.max(0, Math.floor(left / TILE));
    const ty0 = Math.max(0, Math.floor(top / TILE));
    const tx1 = Math.min(world.width - 1, Math.floor((left + viewWw) / TILE));
    const ty1 = Math.min(world.height - 1, Math.floor((top + viewWh) / TILE));

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

    // 3) entities, row by row -------------------------------------------
    const rowEnd = Math.min(world.height - 1, ty1 + 4);
    const colStart = Math.max(0, tx0 - 2);
    const colEnd = Math.min(world.width - 1, tx1 + 2);
    const windAmp = 0.55 + 0.45 * Math.sin(time * 0.21);
    const village = state.village;
    const selection = state.selection;

    // bucket buildings + villagers by the row their feet are on
    const rowB = this.rowBuildings;
    const rowF = this.rowFolk;
    rowB.length = rowEnd - ty0 + 1;
    rowF.length = rowEnd - ty0 + 1;
    for (let i = 0; i < rowB.length; i++) {
      rowB[i] = rowB[i] || [];
      rowF[i] = rowF[i] || [];
      rowB[i].length = 0;
      rowF[i].length = 0;
    }
    for (const b of world.buildings) {
      const base = b.y + b.h - 1;
      if (base < ty0 - 3 || base > rowEnd) continue;
      if (b.x + b.w < colStart || b.x > colEnd) continue;
      const slot = rowB[base - ty0];
      if (slot) slot.push(b);
    }
    if (village) {
      for (const v of village.villagers) {
        const base = Math.floor(v.y);
        if (base < ty0 - 2 || base > rowEnd) continue;
        if (v.x < colStart || v.x > colEnd) continue;
        const slot = rowF[base - ty0];
        if (slot) slot.push(v);
      }
    }

    // draw one entity sprite anchored by its bottom-centre
    const blit = (spr, wx, wy) => {
      const x0 = sx(wx);
      const y0 = sy(wy);
      ctx.drawImage(spr, x0, y0, sx(wx + spr.width) - x0, sy(wy + spr.height) - y0);
    };

    for (let ty = ty0; ty <= rowEnd; ty++) {
      // natural objects on this row
      for (let tx = colStart; tx <= colEnd; tx++) {
        const i = ty * world.width + tx;
        const o = world.obj[i];
        if (o === Obj.NONE) continue;
        const def = A.objects[o];
        if (!def) continue;
        const v = world.variant[i];
        let level = 0;
        if (def.sway) {
          const g = Math.sin(time * 1.35 + tx * 0.19 + ty * 0.11 + v * 0.012) * windAmp;
          level = Math.max(0, Math.min(4, Math.round((0.25 + g * 0.75) * 2.2) + 2));
        }
        const spr = def.frames[flipOf(v)][level];
        blit(spr, tx * TILE + 8 - def.pivotX + jitterX(v, o), ty * TILE + TILE - spr.height + jitterY(v, o));
      }

      // buildings whose footprint ends on this row
      const bs = rowB[ty - ty0];
      if (bs) {
        for (const b of bs) this.drawBuilding(b, sx, sy, time);
      }

      // villagers standing on this row
      const fs = rowF[ty - ty0];
      if (fs) {
        for (const v of fs) this.drawFolk(v, sx, sy);
      }
    }

    // floating resource numbers
    if (village && village.floats.length) {
      ctx.font = `${Math.max(10, Math.round(7 * s))}px "Pixelify Sans", monospace`;
      ctx.textAlign = "center";
      for (const f of village.floats) {
        const alpha = Math.min(1, f.life / 0.6);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#2b1a0c";
        ctx.fillText(f.text, sx(f.x) + 1, sy(f.y) + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, sx(f.x), sy(f.y));
      }
      ctx.globalAlpha = 1;
    }

    // 4) overlays --------------------------------------------------------
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

    // build ghost: the building at 60%, a tinted footprint and a working radius
    const ghost = state.ghost;
    if (ghost) {
      const def = BUILDING_DEFS[ghost.type];
      if (def) {
        const tint = ghost.valid ? "rgba(120, 220, 110, 0.28)" : "rgba(230, 90, 70, 0.34)";
        const okTile = "rgba(150, 235, 130, 0.42)";
        const badTile = "rgba(230, 90, 70, 0.42)";
        for (let j = 0; j < def.h; j++) {
          for (let i = 0; i < def.w; i++) {
            const gx = ghost.x + i;
            const gy = ghost.y + j;
            const x0 = sx(gx * TILE);
            const y0 = sy(gy * TILE);
            const w = sx((gx + 1) * TILE) - x0;
            const h = sy((gy + 1) * TILE) - y0;
            ctx.fillStyle = tint;
            ctx.fillRect(x0, y0, w, h);
            // per-tile marker: green where it fits, red where the ground is bad
            const good = world.buildable(gx, gy);
            const inset = Math.max(2, Math.round(w * 0.22));
            ctx.fillStyle = good ? okTile : badTile;
            ctx.fillRect(x0 + inset, y0 + inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2));
          }
        }
        // working radius for gathering buildings, drawn dotted
        if (def.radius) {
          const rcx = sx((ghost.x + def.w / 2) * TILE);
          const rcy = sy((ghost.y + def.h / 2) * TILE);
          ctx.beginPath();
          ctx.ellipse(rcx, rcy, def.radius * TILE * s, def.radius * TILE * s * 0.62, 0, 0, Math.PI * 2);
          ctx.strokeStyle = ghost.valid ? "rgba(200, 255, 170, 0.55)" : "rgba(255, 176, 160, 0.55)";
          ctx.setLineDash([Math.max(3, s * 2), Math.max(3, s * 2)]);
          ctx.lineWidth = Math.max(1, this.dpr);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const art = A.buildings[ghost.type];
        if (art) {
          const spr = art.frames[0];
          ctx.globalAlpha = 0.62;
          const footW = def.w * TILE;
          const footH = def.h * TILE;
          blit(spr, ghost.x * TILE + footW / 2 - art.pivotX, ghost.y * TILE + footH - art.pivotY);
          ctx.globalAlpha = 1;
        }
        // footprint outline
        const ox = sx(ghost.x * TILE);
        const oy = sy(ghost.y * TILE);
        ctx.strokeStyle = ghost.valid ? "#c9f7a6" : "#ffb0a0";
        ctx.lineWidth = Math.max(2, Math.round(this.dpr));
        ctx.strokeRect(ox + 1, oy + 1, sx((ghost.x + def.w) * TILE) - ox - 2, sy((ghost.y + def.h) * TILE) - oy - 2);
      }
    }

    // hover tile
    const hover = state.hover;
    if (hover && world.inBounds(hover.x, hover.y) && !ghost) {
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

    // selection ring on a building or villager
    if (selection) {
      ctx.strokeStyle = "#ffe9a8";
      ctx.lineWidth = Math.max(2, Math.round(this.dpr * 1.5));
      if (selection.kind === "building") {
        const b = selection.building;
        const x0 = sx(b.x * TILE);
        const y0 = sy(b.y * TILE);
        ctx.setLineDash([Math.max(4, s * 2), Math.max(3, s)]);
        ctx.strokeRect(x0 + 2, y0 + 2, sx((b.x + b.w) * TILE) - x0 - 4, sy((b.y + b.h) * TILE) - y0 - 4);
        ctx.setLineDash([]);
      } else if (selection.kind === "villager") {
        const v = selection.villager;
        const cx = sx(v.x * TILE);
        const groundY = sy(v.y * TILE + 3);
        const r = Math.max(4, s * 4);
        ctx.beginPath();
        ctx.ellipse(cx, groundY, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        // little marker above the head
        const bob = Math.sin(time * 4) * s * 0.6;
        const y = sy(v.y * TILE - 24) + bob;
        ctx.beginPath();
        ctx.moveTo(cx, y + s * 4);
        ctx.lineTo(cx - s * 3, y);
        ctx.lineTo(cx + s * 3, y);
        ctx.closePath();
        ctx.fillStyle = "#ffe9a8";
        ctx.fill();
        ctx.stroke();
      }
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

  /** A building: finished art, or scaffolding + a partial build. */
  drawBuilding(b, sx, sy, time) {
    const ctx = this.ctx;
    const A = this.atlas;
    const def = BUILDING_DEFS[b.type];
    const art = A.buildings[b.type];
    if (!def || !art) return;
    const footW = def.w * TILE;
    const footH = def.h * TILE;
    const drawX = b.x * TILE + footW / 2 - art.pivotX;
    const drawY = b.y * TILE + footH - art.pivotY;
    const x0 = sx(drawX);
    const y0 = sy(drawY);
    const dw = sx(drawX + art.w) - x0;
    const dh = sy(drawY + art.h) - y0;

    if (b.state === "done") {
      const spr = art.frames.length > 1 ? art.frames[Math.floor(time / FIRE_FRAME_TIME) % art.frames.length] : art.frames[0];
      ctx.drawImage(spr, x0, y0, dw, dh);
    } else {
      // the building rises out of the ground as it is built
      const prog = Math.max(0.12, b.progress);
      const visH = Math.round(art.h * prog);
      const srcY = art.h - visH;
      const scale = dh / art.h;
      ctx.drawImage(art.frames[0], 0, srcY, art.w, visH, x0, y0 + Math.round(srcY * scale), dw, Math.round(visH * scale));
      const scaf = A.scaffolds[`${def.w}x${def.h}`];
      if (scaf) {
        const scX = b.x * TILE + footW / 2 - scaf.pivotX;
        const scY = b.y * TILE + footH - scaf.pivotY;
        ctx.drawImage(scaf.raster, sx(scX), sy(scY), sx(scX + scaf.raster.w) - sx(scX), sy(scY + scaf.raster.h) - sy(scY));
      }
      // progress bar
      const barW = footW * 0.8;
      const bx = sx(b.x * TILE + footW / 2 - barW / 2);
      const by = sy(b.y * TILE + footH - 40);
      const bw = Math.max(6, sx(barW) - sx(0));
      const bh = Math.max(3, Math.round(this.dpr * 3));
      ctx.fillStyle = "rgba(20,12,4,0.75)";
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = "#8ccb4c";
      ctx.fillRect(bx, by, Math.round(bw * b.progress), bh);
    }
  }

  /** A villager, standing on their tile, hauling anything they picked up. */
  drawFolk(v, sx, sy) {
    const ctx = this.ctx;
    const set = this.atlas.folk[v.job] || this.atlas.folk.idle;
    const frames = set[v.dir] || set.down;
    const spr = frames[v.frame] || frames[2];
    const footX = v.x * TILE;
    const footY = v.y * TILE + 3;
    const drawX = footX - spr.width / 2;
    const drawY = footY - spr.height + 2;
    const x0 = sx(drawX);
    const y0 = sy(drawY);
    ctx.drawImage(spr, x0, y0, sx(drawX + spr.width) - x0, sy(drawY + spr.height) - y0);

    // goods being carried home
    if (v.carrying) {
      const group = this.atlas.cargo[v.carrying.kind];
      const cargo = group && group[v.dir];
      if (cargo) {
        const cw = cargo.width;
        const ch = cargo.height;
        const cxDraw = footX - cw / 2;
        const cyDraw = footY - ch + 2;
        ctx.drawImage(cargo, sx(cxDraw), sy(cyDraw), sx(cxDraw + cw) - sx(cxDraw), sy(cyDraw + ch) - sy(cyDraw));
      }
    }

    if (v.bark) {
      const cx = sx(footX);
      const by = sy(drawY) - Math.round(this.dpr * 4);
      ctx.font = `${Math.max(9, Math.round(6 * (this.dpr * 1.6)))}px "Pixelify Sans", monospace`;
      const tw = ctx.measureText(v.bark).width;
      const padX = Math.round(this.dpr * 3);
      const bh = Math.round(this.dpr * 12);
      ctx.fillStyle = "rgba(248, 240, 214, 0.94)";
      ctx.fillRect(cx - tw / 2 - padX, by - bh, tw + padX * 2, bh);
      ctx.strokeStyle = "#2b1a0c";
      ctx.lineWidth = Math.max(1, this.dpr);
      ctx.strokeRect(cx - tw / 2 - padX, by - bh, tw + padX * 2, bh);
      ctx.fillStyle = "#2b1a0c";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(v.bark, cx, by - bh / 2 + 1);
      ctx.textBaseline = "alphabetic";
    }
  }
}
