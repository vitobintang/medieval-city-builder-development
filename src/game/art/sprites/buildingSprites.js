// Procedurally drawn buildings. Rather than hand-authoring a grid per building
// (and another per roof colour) the walls and roofs are assembled from shaded
// boxes, which keeps every building on-model and lets roofs be recoloured.
//
// Every building sprite uses the same anchor model as the trees:
//   - x: centred on the footprint (sprite is PAD wider on each side so roofs
//        and shadows can overhang)
//   - y: the bottom row of the footprint sits at pivotY = ROOF + h*TILE, with a
//        few rows of contact shadow below that
//
//   row 0 ...................... roof apex
//   row ROOF - 2 ............... eaves
//   row ROOF ................... top of the walls
//   row ROOF + h*TILE - 1 ...... ground line (pivotY)
//   below ...................... doorstep glow / contact shadow

import { Raster } from "../raster.js";
import { P } from "../palette.js";
import { px, rect, hline, vline, col, groundShadow, outlineAlpha } from "../pixel.js";
import { TILE } from "../../config.js";
import { mulberry32 } from "../../core/rng.js";
import { Building } from "../../world/tiles.js";

export const ROOF = 20; // roof height in pixels
const SKIRT = 6; // rows of contact shadow under the footprint
const PAD = 4; // sprite overhang on each side

export const ROOF_STYLES = {
  thatch: { c: P.thatch.q, d: P.thatch.r, e: P.thatch.s, f: P.thatch.S, edge: P.thatch.q },
  tile: { c: P.tile.c, d: P.tile.d, e: P.tile.e, f: P.tile.f, edge: P.tile.c },
  slate: { c: P.slate.c, d: P.slate.d, e: P.slate.e, f: P.slate.f, edge: P.slate.c },
};

function mix(hex, amount) {
  const [r, g, b] = col(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `#${((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, "0")}`;
}

/** Canvas + landmark shared by every building of a given footprint. */
function layout(w, h) {
  const W = w * TILE + PAD * 2;
  const H = ROOF + h * TILE + SKIRT;
  const ground = ROOF + h * TILE - 1;
  return {
    r: new Raster(W, H),
    W,
    H,
    ground,
    cx: W / 2,
    x0: PAD + 1,
    x1: W - PAD - 2,
    wallTop: ROOF,
  };
}

/**
 * Extra blank rows above the roof so chimneys, spires and smoke can rise above
 * the ridge line. Everything else is drawn into a body raster and blitted down
 * by HEAD, which keeps the drawing code free of offsets.
 */
export const HEAD = 10;

function compose(body, extras) {
  const out = new Raster(body.w, body.h + HEAD);
  out.blit(body, 0, HEAD);
  if (extras) extras(out);
  return out;
}

// ---------------------------------------------------------------- roof

/**
 * A hip roof: a widening span from a short ridge down to the eaves, with
 * shingle dashes, a lit left plane and a shaded right plane so it matches the
 * light direction of the trees.
 */
function drawRoof(r, x0, x1, style, { y0 = 0, h = ROOF, overhang = 4 } = {}) {
  const s = ROOF_STYLES[style] || ROOF_STYLES.thatch;
  const cx = (x0 + x1) / 2;
  const halfW = (x1 - x0) / 2 + overhang;
  const yBottom = y0 + h;

  for (let y = y0; y < yBottom; y++) {
    const t = (y - y0) / Math.max(1, h - 1);
    const hw = 1.5 + (halfW - 1.5) * Math.pow(t, 0.75);
    const left = Math.round(cx - hw);
    const right = Math.round(cx + hw);
    for (let x = left; x <= right; x++) {
      let c = x < cx ? s.e : s.d;
      if (x < cx && (cx - x) / hw > 0.6) c = s.f; // brightest strip
      if (x <= left + 1 || x >= right - 1) c = s.edge;
      if (x < left + 3 && x > left + 1 && y % 2 === 0) c = mix(s.edge, 0.15); // rim light
      // shingles
      if (y % 3 === 0 && (x + (y & 4 ? 2 : 0)) % 5 === 1) c = s.c;
      else if (y % 3 === 2 && x % 5 === 3) c = mix(s.e, -0.22);
      px(r, x, y, c);
    }
  }
  // ridge cap
  hline(r, Math.round(cx) - 2, y0, 4, s.f);
  px(r, Math.round(cx) - 3, y0, s.c);
  px(r, Math.round(cx) + 2, y0, s.c);

  // eave rim + shadow band on the wall below
  for (let x = Math.round(cx - halfW) - 1; x <= Math.round(cx + halfW) + 1; x++) {
    px(r, x, yBottom, s.edge);
    px(r, x, yBottom + 1, mix(s.edge, -0.3));
  }
}

// ---------------------------------------------------------------- walls

/** Plaster-and-timber front wall filling x0..x1, y0..y1. */
function drawWall(r, x0, x1, y0, y1, rand, scheme = "plaster") {
  const light = scheme === "timber" ? P.timber.T : P.plaster.l;
  const mid = scheme === "timber" ? P.timber.t : P.plaster.m;
  const beam = P.timber.k;
  const w = x1 - x0 + 1;
  const hgt = y1 - y0 + 1;

  rect(r, x0, y0, w, hgt, mid);
  hline(r, x0, y0, w, light);
  hline(r, x0, y0 + 1, w, mix(light, -0.08));
  // daub texture
  for (let i = 0; i < w; i += 3) {
    if (rand() < 0.45) vline(r, x0 + i, y0 + 4, Math.max(1, hgt - 8), scheme === "timber" ? P.timber.k : P.plaster.k);
  }
  // corner posts + top plate
  rect(r, x0, y0, 2, hgt, beam);
  rect(r, x1 - 1, y0, 2, hgt, beam);
  hline(r, x0, y0 + 2, w, beam);
  // diagonal braces either side
  const brace = (ax, ay, dx, dy, len) => {
    for (let i = 0; i < len; i++) px(r, ax + dx * i, ay + dy * i, beam);
  };
  if (w >= 28) {
    brace(x0 + 2, y1 - 12, 1, -1, 8);
    brace(x0 + 2, y1 - 4, 1, 0, 9);
    brace(x1 - 2, y1 - 12, -1, -1, 8);
    brace(x1 - 2, y1 - 4, -1, 0, 9);
  }
  // stone footing
  rect(r, x0, y1 - 2, w, 3, P.stone.m);
  hline(r, x0, y1 - 2, w, P.stone.l);
  hline(r, x0, y1, w, P.stone.k);
}

/** Arched plank door; the warm crack of light underneath makes it feel lived in. */
function drawDoor(r, cx, yBottom, { w = 9, h = 15, lit = true } = {}) {
  const x0 = Math.round(cx - w / 2);
  const y0 = yBottom - h + 1;
  rect(r, x0 - 1, y0 - 1, w + 2, h + 1, P.timber.k);
  for (let y = 0; y < h; y++) {
    const inset = y < 3 ? 3 - y : 0;
    for (let x = x0 + inset; x <= x0 + w - 1 - inset; x++) {
      let c = P.timber.t;
      if ((x - x0) % 3 === 0) c = P.timber.T;
      if (x === x0 + w - 1 - inset) c = P.timber.k;
      if (y === Math.floor(h * 0.45)) c = P.timber.k;
      px(r, x, y0 + y, c);
    }
  }
  px(r, x0 + w - 3, y0 + Math.floor(h * 0.6), P.timber.u);
  if (lit) {
    hline(r, x0 + 2, yBottom + 1, w - 4, P.glow.w);
    hline(r, x0 + 2, yBottom + 2, w - 4, mix(P.glow.w, -0.3));
  }
}

/** Window with a cross mullion; `glow` makes it warm. */
function drawWindow(r, x, y, w = 6, h = 7, glow = true) {
  rect(r, x - 1, y - 1, w + 2, h + 2, P.timber.k);
  rect(r, x, y, w, h, glow ? P.glow.w : "#3a4a5c");
  if (glow) rect(r, x + 1, y + h - 3, w - 2, 2, mix(P.glow.w, 0.4));
  else hline(r, x, y + 1, w, "#5c7288");
  hline(r, x, y + Math.floor(h / 2), w, P.timber.k);
  vline(r, x + Math.floor(w / 2), y, h, P.timber.k);
  hline(r, x - 1, y + h + 1, w + 2, P.timber.T);
}

// ---------------------------------------------------------------- props

function barrel(r, x, y) {
  rect(r, x, y - 6, 5, 7, P.timber.t);
  hline(r, x, y - 6, 5, P.timber.T);
  hline(r, x, y - 4, 5, P.timber.k);
  hline(r, x, y - 1, 5, P.timber.k);
  px(r, x, y - 7, P.timber.T);
  px(r, x + 4, y - 7, P.timber.u);
}

function crate(r, x, y, s = 6) {
  rect(r, x, y - s + 1, s, s, P.timber.T);
  hline(r, x, y - s + 1, s, P.timber.u);
  hline(r, x, y, s, P.timber.k);
  vline(r, x, y - s + 1, s, P.timber.k);
  vline(r, x + s - 1, y - s + 1, s, P.timber.k);
}

function logPile(r, x, y, n = 3) {
  for (let i = 0; i < n; i++) {
    const yy = y - 3 * Math.floor(i / 2) - 2;
    const xx = x + (i % 2) * 7;
    rect(r, xx, yy - 2, 7, 3, P.timber.t);
    hline(r, xx, yy - 2, 7, P.timber.T);
    px(r, xx, yy - 1, P.timber.u);
    px(r, xx + 6, yy - 1, P.timber.k);
  }
}

function lantern(r, x, y) {
  vline(r, x, y - 9, 9, P.timber.k);
  rect(r, x - 1, y - 12, 4, 4, P.timber.k);
  rect(r, x, y - 11, 2, 2, P.glow.W);
}

function chimney(r, x, y, h = 12) {
  rect(r, x, y - h, 5, h + 3, P.stone.m);
  vline(r, x, y - h, h + 3, P.stone.l);
  vline(r, x + 4, y - h, h + 3, P.stone.k);
  hline(r, x, y - h, 5, P.stone.k);
  hline(r, x + 1, y - h + 1, 3, P.stone.o);
}

// ---------------------------------------------------------------- buildings

/** Walls + door + windows + roof, with optional extras drawn in front. */
function drawHouse(w, h, opts) {
  const {
    scheme = "plaster",
    roof = "thatch",
    door = true,
    windows = 2,
    glow = true,
    chimneyAt = null,
    extras = null,
    seed = 1,
  } = opts;
  const rand = mulberry32(seed * 7919 + w * 131 + h * 17);
  const g = layout(w, h);
  const { r, W, ground, cx, x0, x1, wallTop } = g;

  groundShadow(r, PAD, ground - 1, W - PAD * 2, SKIRT + 1, P.shadow);
  drawWall(r, x0, x1, wallTop, ground, rand, scheme);

  const winY = wallTop + 9;
  if (door) drawDoor(r, cx, ground, { glow, w: 9, h: 16 });
  if (windows >= 2) {
    drawWindow(r, cx - 14, winY, 6, 7, glow);
    drawWindow(r, cx + 8, winY, 6, 7, glow);
  } else if (windows === 1) {
    drawWindow(r, cx - 3, winY, 6, 7, glow);
  }

  drawRoof(r, x0, x1, roof, { overhang: 4 });
  if (extras) extras(r, g);
  outlineAlpha(r, P.timber.o, { minAlpha: 120 });
  const out = compose(r, (o) => {
    if (chimneyAt != null) {
      // sits on the roof slope near the ridge, poking up above it
      chimney(o, PAD + chimneyAt, HEAD + 11, 15);
      // a wisp of smoke
      px(o, PAD + chimneyAt + 2, HEAD - 2, "rgba(230,230,230,0.45)");
      px(o, PAD + chimneyAt + 3, HEAD - 5, "rgba(230,230,230,0.3)");
    }
  });
  return { raster: out, pivotY: ground + 1 + HEAD };
}

/** Open-sided work shelter: posts, thatch roof, tools inside. */
function drawShelter(w, h, { roof = "thatch", props = null, seed = 3 } = {}) {
  const rand = mulberry32(seed);
  const g = layout(w, h);
  const { r, W, ground, x0, x1 } = g;

  groundShadow(r, PAD, ground - 1, W - PAD * 2, SKIRT + 1, P.shadow);
  // packed earth floor
  rect(r, x0, ground - 7, x1 - x0 + 1, 8, P.dirt.f);
  for (let i = 0; i < 14; i++) {
    px(r, x0 + 2 + Math.floor(rand() * (x1 - x0 - 3)), ground - 6 + Math.floor(rand() * 6), rand() < 0.5 ? P.dirt.g : P.dirt.e);
  }
  // rough plank back wall, open at the front like a saw pit
  for (let x = x0; x <= x1; x += 3) vline(r, x, ROOF + 3, ground - ROOF - 2, rand() < 0.4 ? P.timber.k : P.timber.t);
  for (let i = 0; i < 16; i++) {
    px(r, x0 + 2 + Math.floor(rand() * (x1 - x0 - 3)), ROOF + 4 + Math.floor(rand() * (ground - ROOF - 6)), P.timber.k);
  }
  hline(r, x0, ROOF + 3, x1 - x0 + 1, P.timber.k);
  // a pair of worked beams leaning against the back wall
  for (let i = 0; i < 14; i++) px(r, x0 + 4 + i, ground - 3 - i, P.timber.T);
  for (let i = 0; i < 10; i++) vline(r, x1 - 6 - i, ground - 4 - i, 4, P.timber.u);
  // corner posts reaching up to the eaves
  const postTop = ROOF + 2;
  rect(r, x0, postTop, 2, ground - postTop + 1, P.timber.k);
  rect(r, x1 - 1, postTop, 2, ground - postTop + 1, P.timber.k);
  vline(r, x0 + 2, postTop, ground - postTop + 1, P.timber.t);
  // cross beam under the eaves
  hline(r, x0, ROOF + 1, x1 - x0 + 1, P.timber.T);
  hline(r, x0, ground - 13, x1 - x0 + 1, P.timber.T);

  if (props) props(r, g);
  drawRoof(r, x0 - 1, x1 + 1, roof, { y0: 0, h: ROOF, overhang: 5 });
  outlineAlpha(r, P.timber.o, { minAlpha: 120 });
  return { raster: compose(r), pivotY: ground + 1 + HEAD };
}

/** The campfire: warm ground glow, stone ring, crossed logs, three-frame flame. */
function drawCampfire(frame) {
  const r = new Raster(26, 28);
  const cx = 13;
  const ground = 20;

  // warm light pooling on the grass
  for (let y = ground - 6; y <= ground + 3; y++) {
    for (let x = cx - 10; x <= cx + 10; x++) {
      const d = Math.hypot((x - cx) * 0.9, (y - ground + 1) * 1.5);
      if (d > 9) continue;
      const a = Math.round(46 * (1 - d / 9));
      px(r, x, y, [255, 168, 66, a]);
    }
  }
  groundShadow(r, 5, ground - 3, 16, 6, P.shadow);

  // ring of stones
  const stones = [[4, 16], [7, 18], [12, 18], [17, 18], [20, 16], [18, 15], [6, 15]];
  for (const [sx, sy] of stones) {
    rect(r, sx, sy, 3, 2, P.stone.m);
    px(r, sx, sy, P.stone.l);
    px(r, sx + 2, sy + 1, P.stone.k);
  }
  // crossed logs, ends glowing
  for (let i = 0; i < 11; i++) {
    px(r, 6 + i, 17 - Math.round(i * 0.18), i % 3 === 0 ? P.timber.k : P.timber.t);
    px(r, 6 + i, 18 - Math.round(i * 0.18), P.timber.k);
  }
  for (let i = 0; i < 9; i++) {
    px(r, 19 - i, 18 - Math.round(i * 0.12), i % 3 === 0 ? P.timber.t : P.timber.u);
  }
  px(r, 7, 16, "#ff9a3c");
  px(r, 18, 17, "#ffb335");

  // flame: a tapered, licking blade of fire with a bright core
  const H = 13 - [0, 2, 1][frame % 3];
  const sway = [0, 1, -1][frame % 3];
  const baseY = 17;
  for (let i = 0; i < H; i++) {
    const t = i / (H - 1); // 0 at the base, 1 at the tip
    const y = baseY - i;
    const half = Math.max(0, 4.1 * Math.pow(1 - t, 0.62));
    const off = Math.round(sway * t * t * 2 + Math.sin(t * 5.5 + frame) * 0.9);
    const x0 = Math.round(cx - half + off);
    const x1 = Math.round(cx + half + off);
    for (let x = x0; x <= x1; x++) {
      const edge = Math.min(x - x0, x1 - x);
      let c = "#d24d16";
      if (edge >= 1 || t < 0.25) c = "#f27b21";
      if ((edge >= 2 && t < 0.8) || t < 0.18) c = "#ffb335";
      if (t < 0.42 && Math.abs(x - cx - off) <= Math.max(0, half - 2.2)) c = "#ffe9a8";
      px(r, x, y, c);
    }
  }
  // tip flick + stray embers
  px(r, cx + Math.round(sway * 2), baseY - H - 1, "#ffb335");
  if (frame % 2 === 0) px(r, cx + 4 + Math.round(sway), baseY - H + 2, "#ff9a3c");
  px(r, cx - 6, 14 - frame, "#ff9a3c");
  outlineAlpha(r, "#4a1f0c", { minAlpha: 120 });
  return { raster: compose(r), pivotY: ground + HEAD };
}

/** Woodcutter's chopping block with an axe and a stack of logs. */
function drawWoodcutter() {
  const r = new Raster(20, 24);
  const ground = 19;
  groundShadow(r, 3, ground - 2, 15, 5, P.shadow);
  logPile(r, 3, ground - 1, 4);
  rect(r, 9, 11, 7, 7, P.timber.t);
  hline(r, 9, 11, 7, P.timber.T);
  hline(r, 9, 12, 7, P.timber.u);
  vline(r, 15, 11, 7, P.timber.k);
  hline(r, 9, 17, 7, P.timber.k);
  rect(r, 10, 13, 3, 3, P.timber.T);
  // axe
  for (let i = 0; i < 7; i++) px(r, 8 + i, 12 - i, P.thatch.r);
  rect(r, 14, 4, 4, 3, P.stone.l);
  px(r, 14, 4, P.stone.h);
  px(r, 17, 5, P.stone.k);
  outlineAlpha(r, P.timber.o, { minAlpha: 120 });
  return { raster: compose(r), pivotY: ground + HEAD };
}

/** Quarry: a dug pit, cut blocks and a pick. */
function drawQuarry() {
  const r = new Raster(20, 22);
  const ground = 17;
  groundShadow(r, 2, ground - 2, 16, 5, P.shadow);
  rect(r, 3, 9, 14, 8, P.dirt.g);
  rect(r, 4, 8, 12, 2, P.dirt.f);
  for (let i = 0; i < 10; i++) px(r, 4 + ((i * 5) % 11), 11 + ((i * 3) % 5), P.dirt.h);
  rect(r, 10, 9, 6, 6, P.stone.l);
  hline(r, 10, 9, 6, P.stone.h);
  vline(r, 15, 9, 6, P.stone.m);
  hline(r, 10, 14, 6, P.stone.k);
  rect(r, 4, 11, 4, 4, P.stone.m);
  px(r, 4, 11, P.stone.l);
  for (let i = 0; i < 7; i++) px(r, 4 + i, 8 - i, P.thatch.r);
  rect(r, 10, 0, 5, 2, P.stone.m);
  px(r, 10, 0, P.stone.h);
  px(r, 14, 1, P.stone.k);
  outlineAlpha(r, P.stone.o, { minAlpha: 120 });
  return { raster: compose(r), pivotY: ground + HEAD };
}

/** Tilled wheat field: furrows of ripe wheat with a scarecrow. */
function drawFarm() {
  const W = 2 * TILE + PAD * 2;
  const H = 2 * TILE + SKIRT;
  const r = new Raster(W, H);
  const rand = mulberry32(4242);
  const ground = 2 * TILE;
  const x0 = PAD + 1;
  const x1 = PAD + 2 * TILE - 2;
  groundShadow(r, PAD - 1, ground - 4, 2 * TILE + 2, 5, P.shadow);

  // turned soil, slightly warm
  rect(r, x0, 1, x1 - x0 + 1, ground - 2, "#a3805a");
  for (let y = 1; y < ground - 1; y++) {
    for (let x = x0; x <= x1; x++) {
      const q = rand();
      if (q < 0.11) px(r, x, y, P.crop.soilDark);
      else if (q < 0.19) px(r, x, y, "#b89770");
    }
  }
  // furrows with wheat planted along them
  for (let fy = 5; fy < ground - 3; fy += 6) {
    rect(r, x0, fy + 3, x1 - x0 + 1, 1, P.crop.soilDark);
    for (let x = x0; x <= x1; x++) {
      const sway = (x + fy) % 4 === 0 ? 1 : 0;
      vline(r, x, fy, 3, P.crop.i);
      px(r, x + sway, fy - 1, P.crop.j);
      px(r, x, fy + 1, P.crop.J);
      if ((x + fy) % 3 === 0) px(r, x + sway, fy - 2, P.crop.J);
      if ((x * 7 + fy) % 11 === 0) px(r, x + sway, fy - 2, "#e2ee9a");
    }
  }
  // low fence along the top edge, overhanging the sides a little
  for (let x = x0 - 1; x <= x1 + 1; x += 6) {
    vline(r, x, 0, 4, P.timber.t);
    px(r, x, 0, P.timber.T);
  }
  hline(r, x0 - 1, 1, x1 - x0 + 3, P.timber.T);
  hline(r, x0 - 1, 3, x1 - x0 + 3, P.timber.t);
  // scarecrow watching over the rows
  const sx = x1 - 5;
  vline(r, sx, 7, 12, P.timber.k);
  hline(r, sx - 4, 9, 9, P.timber.k);
  rect(r, sx - 4, 8, 4, 3, P.cloth.g);
  rect(r, sx - 3, 7, 2, 2, P.cloth.y);
  px(r, sx - 1, 6, P.thatch.s);
  // a basket of the first harvest by the corner
  rect(r, x0 + 1, ground - 5, 4, 3, P.thatch.r);
  px(r, x0 + 2, ground - 6, P.berry.R);
  px(r, x0 + 4, ground - 6, P.crop.J);
  outlineAlpha(r, P.timber.o, { minAlpha: 120 });
  return { raster: compose(r), pivotY: ground - 1 + HEAD };
}

/** Market stalls with striped awnings, crates and produce. */
function drawMarket() {
  const w = 3;
  const h = 2;
  const g = layout(w, h);
  const { r, ground, W } = g;
  groundShadow(r, PAD, ground - 2, W - PAD * 2, SKIRT + 1, P.shadow);
  const tents = [
    { x: PAD + 1, y: ground - 2, w: 16, a: P.cloth.g },
    { x: PAD + 28, y: ground - 1, w: 14, a: P.cloth.y },
  ];
  for (const t of tents) {
    const top = t.y - 29;
    vline(r, t.x, top + 9, t.y - top - 9, P.timber.k);
    vline(r, t.x + t.w - 1, top + 9, t.y - top - 9, P.timber.k);
    for (let y = top; y < top + 9; y++) {
      const inset = Math.max(0, 3 - ((y - top) >> 1));
      for (let x = t.x - inset; x <= t.x + t.w - 1 + inset; x++) {
        const stripe = Math.floor((x + (y - top)) / 3) % 2 === 0;
        px(r, x, y, stripe ? t.a : "#f0e3bc");
      }
    }
    hline(r, t.x - 3, top + 9, t.w + 6, P.timber.k);
    // counter + wares
    rect(r, t.x, t.y - 8, t.w, 3, P.timber.T);
    hline(r, t.x, t.y - 8, t.w, P.timber.u);
    hline(r, t.x, t.y - 6, t.w, P.timber.k);
    for (let i = 0; i < 5; i++) {
      px(r, t.x + 1 + i * 3, t.y - 9, i % 2 ? P.berry.R : P.crop.J);
      if (i % 2 === 0) px(r, t.x + 2 + i * 3, t.y - 9, P.berry.p);
    }
    // hanging pennants between the tents
    hline(r, t.x, top + 10, t.w, P.timber.k);
  }
  crate(r, PAD + 19, ground - 1, 6);
  barrel(r, PAD + 25, ground - 1);
  outlineAlpha(r, P.timber.o, { minAlpha: 120 });
  return { raster: compose(r), pivotY: ground + 1 + HEAD };
}

/** A chapel: tall slate roof, stone buttresses, a bell tower and spire. */
function drawChapel() {
  const w = 2;
  const h = 3;
  const g = layout(w, h);
  const { r, W, ground, cx, x0, x1, wallTop } = g;
  const rand = mulberry32(31);
  groundShadow(r, PAD, ground - 1, W - PAD * 2, SKIRT + 1, P.shadow);
  drawWall(r, x0, x1, wallTop, ground, rand, "plaster");
  drawDoor(r, cx, ground, { w: 11, h: 22, lit: true });
  for (const wy of [wallTop + 9, wallTop + 30]) {
    drawWindow(r, cx - 15, wy, 5, 8, true);
    drawWindow(r, cx + 10, wy, 5, 8, true);
  }
  // corner buttresses with stone caps
  for (const bx of [x0 + 2, x1 - 4]) {
    rect(r, bx, wallTop + 3, 3, ground - wallTop - 6, P.plaster.l);
    vline(r, bx + 2, wallTop + 3, ground - wallTop - 6, P.plaster.k);
    rect(r, bx - 1, ground - 5, 5, 4, P.stone.m);
    hline(r, bx - 1, ground - 5, 5, P.stone.l);
    hline(r, bx - 1, ground - 2, 5, P.stone.k);
  }
  drawRoof(r, x0, x1, "slate", { overhang: 5 });
  outlineAlpha(r, P.timber.o, { minAlpha: 120 });

  const out = compose(r, (o) => {
    const tw = 12;
    const tx = Math.round(cx - tw / 2);
    const base = HEAD + ROOF + 8;
    const top = HEAD + 4;
    // stone tower
    rect(o, tx, top + 10, tw, base - top - 10, P.plaster.m);
    vline(o, tx, top + 10, base - top - 10, P.plaster.l);
    vline(o, tx + tw - 1, top + 10, base - top - 10, P.plaster.k);
    hline(o, tx, base - 2, tw, P.stone.m);
    hline(o, tx, base - 1, tw, P.stone.k);
    // belfry opening with a bell inside
    rect(o, tx + 3, top + 14, 6, 9, "#2c3742");
    rect(o, tx + 4, top + 19, 4, 3, P.glow.w);
    px(o, tx + 5, top + 18, P.glow.W);
    // slate spire
    for (let i = 0; i < 10; i++) {
      const hw = Math.round((10 - i) * 0.4);
      for (let x = tx + 5 - hw; x <= tx + 6 + hw; x++) px(o, x, top + 9 - i, i % 3 === 0 ? P.slate.d : P.slate.e);
    }
    // cross finial
    vline(o, tx + 5, top - 4, 5, P.thatch.S);
    hline(o, tx + 4, top - 3, 3, P.thatch.S);
  });
  return { raster: out, pivotY: ground + 1 + HEAD };
}

/** Tavern: a wide two-storey house with a hanging sign and a lantern. */
function drawTavern() {
  const res = drawHouse(3, 2, {
    scheme: "plaster",
    roof: "tile",
    windows: 2,
    seed: 47,
    extras: (r, g) => {
      const { cx, x0, x1, ground, wallTop } = g;
      // upper storey band + two more windows
      hline(r, x0, wallTop + 22, x1 - x0 + 1, P.timber.k);
      drawWindow(r, cx - 16, wallTop + 27, 6, 6, true);
      drawWindow(r, cx + 10, wallTop + 27, 6, 6, true);
      // hanging sign
      vline(r, x1 - 7, wallTop + 4, 3, P.timber.k);
      hline(r, x1 - 7, wallTop + 4, 8, P.timber.k);
      rect(r, x1 - 5, wallTop + 6, 7, 6, P.cloth.g);
      px(r, x1 - 3, wallTop + 8, P.cloth.y);
      px(r, x1 - 2, wallTop + 10, P.cloth.G);
      // barrels and a lantern by the door
      barrel(r, x0 + 1, ground - 1);
      barrel(r, x1 - 8, ground - 1);
      lantern(r, cx - 9, ground - 2);
    },
  });
  return res;
}

/** Wooden storehouse on stone stilts. */
function drawStorehouse() {
  const res = drawHouse(2, 2, {
    scheme: "timber",
    roof: "tile",
    windows: 1,
    seed: 23,
    extras: (r, g) => {
      barrel(r, g.x0 + 1, g.ground - 1);
      barrel(r, g.x1 - 6, g.ground - 1);
      crate(r, g.x0 + 5, g.ground - 1, 5);
      // raised floor boards
      hline(r, g.x0, g.ground - 3, g.x1 - g.x0 + 1, P.timber.T);
    },
  });
  return res;
}

/** Every building, keyed by the Building enum. */
export const BUILDING_ART = {
  [Building.CAMPFIRE]: { w: 1, h: 1, frames: 3, draw: drawCampfire },
  [Building.WOODCUTTER]: { w: 1, h: 1, frames: 1, draw: drawWoodcutter },
  [Building.QUARRY]: { w: 1, h: 1, frames: 1, draw: drawQuarry },
  [Building.FARM]: { w: 2, h: 2, frames: 1, draw: drawFarm },
  [Building.COTTAGE]: {
    w: 2,
    h: 2,
    frames: 1,
    draw: () =>
      drawHouse(2, 2, {
        scheme: "plaster",
        roof: "thatch",
        windows: 2,
        seed: 11,
        extras: (r, g) => {
          barrel(r, g.x1 - 5, g.ground - 1);
          crate(r, g.x0 + 1, g.ground - 1, 5);
          // window boxes
          rect(r, g.cx - 15, g.wallTop + 17, 8, 2, P.flower.pink);
          px(r, g.cx - 13, g.wallTop + 16, P.flower.white);
          px(r, g.cx - 9, g.wallTop + 16, P.flower.yellow);
        },
      }),
  },
  [Building.LUMBER]: {
    w: 2,
    h: 2,
    frames: 1,
    draw: () =>
      drawShelter(2, 2, {
        seed: 5,
        props: (r, g) => {
          logPile(r, g.x0 + 1, g.ground - 1, 6);
          // sawhorse
          hline(r, g.x1 - 12, g.ground - 7, 9, P.timber.T);
          vline(r, g.x1 - 10, g.ground - 7, 5, P.timber.k);
          vline(r, g.x1 - 5, g.ground - 7, 5, P.timber.k);
        },
      }),
  },
  [Building.FORAGER]: {
    w: 1,
    h: 1,
    frames: 1,
    draw: () =>
      drawShelter(1, 1, {
        seed: 9,
        props: (r, g) => {
          // baskets of berries and a bundle of herbs hanging from the beam
          const bx = g.x0 + 2;
          rect(r, bx, g.ground - 4, 5, 3, P.thatch.r);
          px(r, bx + 1, g.ground - 5, P.berry.R);
          px(r, bx + 3, g.ground - 5, P.berry.R);
          px(r, bx + 2, g.ground - 5, P.berry.p);
          rect(r, g.x1 - 6, g.ground - 4, 4, 3, P.thatch.r);
          px(r, g.x1 - 5, g.ground - 5, P.crop.J);
          vline(r, g.x1 - 5, g.ground - 12, 4, P.oak[6]);
          vline(r, g.x1 - 3, g.ground - 13, 4, P.oak[5]);
          px(r, g.x1 - 5, g.ground - 8, P.berry.R);
        },
      }),
  },
  [Building.STOREHOUSE]: { w: 2, h: 2, frames: 1, draw: drawStorehouse },
  [Building.TAVERN]: { w: 3, h: 2, frames: 1, draw: drawTavern },
  [Building.MARKET]: { w: 3, h: 2, frames: 1, draw: drawMarket },
  [Building.CHAPEL]: { w: 2, h: 3, frames: 1, draw: drawChapel },
};

/** Build the {frames, pivotX, pivotY, tilesW, tilesH} entry the renderer expects. */
export function makeBuildingSprite(id) {
  const def = BUILDING_ART[id];
  if (!def) return null;
  const frames = [];
  let pivotY = 0;
  for (let f = 0; f < def.frames; f++) {
    const out = def.draw(f);
    frames.push(out.raster);
    pivotY = out.pivotY;
  }
  const first = frames[0];
  return {
    frames,
    w: first.w,
    h: first.h,
    pivotX: first.w / 2,
    pivotY,
    tilesW: def.w,
    tilesH: def.h,
  };
}

/** Scaffolding drawn over a footprint that is still going up. */
export function drawScaffold(w, h) {
  const W = w * TILE + 8;
  const H = ROOF + h * TILE;
  const r = new Raster(W, H);
  const top = ROOF - 6;
  const bottom = H - 2;
  for (const x of [2, 4, W - 5, W - 3]) vline(r, x, top, bottom - top, x % 2 ? P.timber.t : P.timber.T);
  for (let y = top; y < bottom; y += 9) {
    hline(r, 2, y, W - 4, P.timber.T);
    hline(r, 2, y + 1, W - 4, P.timber.t);
    for (let x = 3; x < W - 3; x += 7) px(r, x, y + 2, P.timber.k);
  }
  for (let i = 0; i < bottom - top; i += 2) {
    px(r, 5 + (i % 8), top + i, P.timber.k);
    px(r, W - 6 - (i % 8), top + i, P.timber.k);
  }
  // ladder
  vline(r, W - 9, top, bottom - top, P.thatch.r);
  vline(r, W - 6, top, bottom - top, P.thatch.r);
  for (let y = top + 2; y < bottom; y += 4) hline(r, W - 9, y, 4, P.thatch.r);
  return { raster: r, pivotX: W / 2, pivotY: H - 1 };
}

