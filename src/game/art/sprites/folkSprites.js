// Villagers: tiny 12x18 people, drawn per direction and per walk frame.
//
// The body is assembled from shaded boxes (same light direction as the trees)
// so every profession stays on-model; only the tunic colour, hat and the tool
// in hand change. Frames: 0/1 = walk cycle, 2 = standing.

import { Raster } from "../raster.js";
import { P } from "../palette.js";
import { px, rect, hline, vline, groundShadow, outlineAlpha } from "../pixel.js";

export const FOLK_W = 12;
export const FOLK_H = 18;

// body proportions, in sprite pixels
const HEAD_Y = 1;
const HEAD_H = 6;
const BODY_Y = 7;
const BODY_H = 6;
const LEG_Y = 13;
const FOOT_Y = 17;

const SKIN = P.folk.skin;
const SKIN_D = P.folk.skinShade;
const HAIR = P.folk.hair;
const HAIR_D = P.folk.hairDark;
const OUT = P.timber.o;
const BOOT = P.folk.boot;

/** Jobs each get their own tunic + hat so you can tell them apart at a glance. */
export const FOLK_JOBS = {
  woodcutter: { tunic: "#7d4a2a", tunic2: "#a8653a", hat: "hood", hatColor: "#4d7a3a", tool: "axe" },
  farmer: { tunic: "#a8862f", tunic2: "#cfae4b", hat: "straw", hatColor: P.thatch.s, tool: "hoe" },
  builder: { tunic: "#3f6d8a", tunic2: "#5e94b5", hat: "cap", hatColor: "#c45c3a", tool: "hammer" },
  forager: { tunic: "#6a8a3a", tunic2: "#8cb050", hat: "kerchief", hatColor: "#c45c3a", tool: "basket" },
  idle: { tunic: "#8b6a4a", tunic2: "#ab8763", hat: "none", hatColor: "#000000", tool: "none" },
};

/** Walk bob: the whole body lifts a pixel on alternating steps. */
const BOB = [0, 1, 0, 0];

function drawLegs(r, dir, frame, pants) {
  const y = LEG_Y;
  if (dir === "left" || dir === "right") {
    // profile: legs scissor back and forth
    const swing = [2, -2, 0, 0][frame];
    rect(r, 4 + swing, y, 2, 4, pants);
    hline(r, 4 + swing, FOOT_Y - 1, 3, BOOT);
    rect(r, 6 - swing, y, 2, 4, pants);
    hline(r, 6 - swing, FOOT_Y - 1, 3, BOOT);
  } else {
    const swing = frame === 0 ? 1 : 0;
    rect(r, 3, y, 2, 4 - swing, pants);
    hline(r, 3, FOOT_Y - 1 - swing, 3, BOOT);
    rect(r, 7, y, 2, 4 - swing, pants);
    hline(r, 7, FOOT_Y - 1 - swing, 3, BOOT);
  }
}

function drawHead(r, dir, job, dy) {
  const y = HEAD_Y + dy;
  const cx = 6;
  if (dir === "down" || dir === "up") {
    const hx = cx - 3;
    rect(r, hx, y + 1, 6, 5, SKIN);
    px(r, hx, y + 1, SKIN_D);
    if (dir === "down") {
      // eyes + a little blush
      px(r, hx + 1, y + 3, P.folk.eye);
      px(r, hx + 4, y + 3, P.folk.eye);
      px(r, hx + 1, y + 4, "#e8a17c");
      px(r, hx + 4, y + 4, "#e8a17c");
      // hair fringe
      rect(r, hx, y, 6, 2, HAIR);
      hline(r, hx, y, 6, HAIR_D);
    } else {
      // back of the head
      rect(r, hx, y, 6, 4, HAIR);
      hline(r, hx, y, 6, HAIR_D);
      rect(r, hx + 1, y + 2, 4, 1, HAIR_D);
    }
  } else {
    // profile: face looks to the right, mirrored by the caller for "left"
    const hx = cx - 3;
    rect(r, hx, y + 1, 6, 5, SKIN);
    rect(r, hx, y + 1, 2, 5, SKIN_D); // far side of the face in shade
    px(r, hx + 4, y + 3, P.folk.eye);
    px(r, hx + 5, y + 4, "#e8a17c");
    rect(r, hx, y, 6, 2, HAIR);
    hline(r, hx, y, 6, HAIR_D);
    rect(r, hx, y + 2, 2, 2, HAIR); // sideburn / fringe
  }
  // headwear
  const hx = cx - 3;
  switch (job.hat) {
    case "hood":
      hline(r, hx - 1, y, 8, job.hatColor);
      hline(r, hx - 1, y + 1, 8, job.hatColor);
      px(r, hx - 1, y + 2, job.hatColor);
      px(r, hx + 6, y + 2, job.hatColor);
      break;
    case "straw":
      hline(r, hx - 2, y + 1, 10, job.hatColor);
      hline(r, hx - 1, y, 8, job.hatColor);
      hline(r, hx + 1, y - 1, 4, job.hatColor);
      px(r, hx + 2, y - 1, "#f5d991");
      break;
    case "cap":
      hline(r, hx, y, 6, job.hatColor);
      hline(r, hx, y + 1, 6, job.hatColor);
      if (dir === "right" || dir === "down") hline(r, hx + 5, y + 1, 3, job.hatColor);
      if (dir === "left") hline(r, hx - 2, y + 1, 3, job.hatColor);
      break;
    case "kerchief":
      hline(r, hx - 1, y, 8, job.hatColor);
      hline(r, hx, y + 1, 6, job.hatColor);
      px(r, hx - 2, y + 2, job.hatColor);
      break;
    default:
      hline(r, hx, y, 6, HAIR);
      hline(r, hx, y + 1, 6, HAIR_D);
  }
}

/** Draw the tool the villager carries, so jobs read at a glance. */
function drawTool(r, dir, job) {
  const hx = dir === "left" ? 1 : 9;
  const hy = BODY_Y + 2;
  switch (job.tool) {
    case "axe": {
      // shaft on the shoulder, head above
      for (let i = 0; i < 6; i++) px(r, hx + (dir === "left" ? i - 1 : -i + 1), hy - i + 1, P.thatch.r);
      const ax = dir === "left" ? hx - 3 : hx + 2;
      rect(r, ax, hy - 5, 3, 2, P.stone.l);
      px(r, ax, hy - 5, P.stone.h);
      break;
    }
    case "hoe":
      for (let i = 0; i < 7; i++) px(r, hx, hy - i + 1, P.thatch.r);
      hline(r, hx + (dir === "left" ? -2 : 1), hy - 5, 3, P.stone.m);
      break;
    case "hammer":
      vline(r, hx, hy - 2, 5, P.thatch.r);
      rect(r, hx - 1, hy - 4, 3, 2, P.stone.m);
      px(r, hx - 1, hy - 4, P.stone.l);
      break;
    case "basket":
      rect(r, hx + (dir === "left" ? -2 : 0), hy + 2, 4, 3, P.thatch.r);
      px(r, hx + (dir === "left" ? -1 : 1), hy + 1, P.berry.R);
      px(r, hx + (dir === "left" ? -2 : 2), hy + 1, P.berry.R);
      break;
    default:
      break;
  }
}

/** One villager frame: job definition + facing + walk frame. */
export function drawVillager(jobName, dir = "down", frame = 2) {
  const job = FOLK_JOBS[jobName] || FOLK_JOBS.idle;
  const r = new Raster(FOLK_W + 4, FOLK_H + 4);
  const ox = 2;
  const oy = 2;

  const dy = BOB[frame] ? 1 : 0;
  groundShadow(r, ox + 1, oy + FOOT_Y, FOLK_W - 2, 3, P.shadow);

  const inner = new Raster(FOLK_W, FOLK_H + 2);
  const pants = P.timber.k;

  drawLegs(inner, dir, frame, pants);
  if (dir === "up") {
    // back view: arms hidden behind the body
    rect(inner, 2, BODY_Y, 8, BODY_H, job.tunic);
    hline(inner, 2, BODY_Y, 8, job.tunic2);
  } else {
    rect(inner, 2, BODY_Y, 8, BODY_H, job.tunic);
    hline(inner, 2, BODY_Y, 8, job.tunic2);
    vline(inner, 2, BODY_Y, BODY_H, job.tunic2);
    vline(inner, 9, BODY_Y, BODY_H, P.timber.k);
    // belt
    hline(inner, 2, BODY_Y + 4, 8, P.folk.belt);
    px(inner, 6, BODY_Y + 4, P.thatch.s);
    // swinging arms
    const armY = BODY_Y + 1 + (frame === 0 ? 1 : 0);
    rect(inner, 1, armY, 2, 4, job.tunic2);
    rect(inner, 9, armY + (frame === 0 ? -1 : 0), 2, 4, job.tunic);
    px(inner, 1, armY + 3, SKIN);
    px(inner, 10, armY + 3, SKIN);
  }

  drawHead(inner, dir, job, dy);
  if (dir !== "up") drawTool(inner, dir, job);

  const finalRaster = dir === "left" ? inner.flipH() : inner;
  r.blit(finalRaster, ox, oy);
  outlineAlpha(r, OUT, { minAlpha: 120 });
  return r;
}

/**
 * What a loaded villager carries: a bundle behind the shoulders. Drawn on top of
 * the body so hauling is visible at a glance.
 */
export function drawCargo(jobName, dir, kind) {
  const r = new Raster(FOLK_W + 4, FOLK_H + 4);
  const ox = 2;
  const oy = 2;
  const cx = ox + 6;
  // the load rides at chest/back height, below the head
  const y = oy + (dir === "up" ? 9 : 10);
  const colours = {
    wood: { base: P.timber.t, light: P.timber.T, dark: P.timber.k },
    stone: { base: P.stone.m, light: P.stone.l, dark: P.stone.k },
    food: { base: P.thatch.r, light: P.thatch.s, dark: P.thatch.q },
  };
  const c = colours[kind] || colours.wood;
  if (kind === "wood") {
    // a bound bundle of logs under one arm
    for (let i = 0; i < 3; i++) {
      const bx = cx - 5 + i * 2;
      vline(r, bx, y - 1, 4, i % 2 ? c.light : c.base);
      px(r, bx, y - 1, c.light);
      px(r, bx, y + 2, c.dark);
    }
    hline(r, cx - 5, y + 1, 9, "#8a5c1c"); // rope
  } else if (kind === "stone") {
    rect(r, cx - 3, y, 7, 3, c.base);
    hline(r, cx - 3, y, 7, c.light);
    hline(r, cx - 3, y + 2, 7, c.dark);
    px(r, cx - 1, y + 1, c.light);
  } else {
    // a heaped basket of produce
    rect(r, cx - 3, y + 1, 7, 3, c.base);
    hline(r, cx - 3, y + 1, 7, c.light);
    px(r, cx - 2, y, P.berry.R);
    px(r, cx + 1, y, P.crop.J);
    px(r, cx + 2, y, P.berry.R);
  }
  outlineAlpha(r, OUT, { minAlpha: 120 });
  void jobName;
  return r;
}

export const FOLK_DIRS = ["down", "left", "right", "up"];
export const FOLK_FRAMES = 3;

/** Pre-build every (job, direction, frame) combination the renderer needs. */
export function buildFolkAtlas() {
  const out = {};
  for (const job of Object.keys(FOLK_JOBS)) {
    out[job] = {};
    for (const dir of FOLK_DIRS) {
      out[job][dir] = [];
      for (let f = 0; f < FOLK_FRAMES; f++) out[job][dir].push(drawVillager(job, dir, f));
    }
  }
  return out;
}

/** Cargo sprites, indexed by [kind][dir]. */
export function buildCargoAtlas() {
  const out = {};
  for (const kind of ["wood", "stone", "food"]) {
    out[kind] = {};
    for (const dir of FOLK_DIRS) out[kind][dir] = drawCargo("idle", dir, kind);
  }
  return out;
}
