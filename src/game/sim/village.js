// The village simulation: stores, buildings, and the villagers who work them.
//
// Plain data + small state machines, so it stays cheap at 20 ticks/second and
// easy to reason about:
//   - a villager is an agent with a job, a workplace and a walk path
//   - gatherers walk to a resource tile, harvest it, and carry goods home
//   - builders walk to whatever is under construction and speed it up
//   - the village tracks stores, housing, happiness and new arrivals

import { BUILDING_DEFS, Building, Obj, Terrain } from "../world/tiles.js";
import { TILE } from "../config.js";
import { findPath } from "./path.js";
import { mulberry32 } from "../core/rng.js";

export const START_RESOURCES = { wood: 80, stone: 20, food: 55 };
export const BASE_CAPACITY = 4; // folk the campfire alone supports

const WALK_SPEED = 2.5; // tiles per second
const CARRY = 5; // units per trip
const EAT_EVERY = 24; // seconds between meals (whole village)
const BASE_STORAGE = { wood: 140, stone: 140, food: 110 };

const NAMES = [
  "Alder", "Bram", "Cedric", "Dagny", "Elsa", "Fenwick", "Greta", "Hollis", "Ivo", "Jory",
  "Kestrel", "Lyra", "Maeve", "Nyle", "Orla", "Pip", "Quill", "Rowan", "Sable", "Tam",
  "Ulric", "Vesna", "Wren", "Yarrow", "Osric", "Maud", "Alfric", "Bettine", "Hedda", "Odo",
];

/** flavour lines, spoken as little speech bubbles */
const BARKS = {
  woodcutter: ["Timber!", "This one's ripe.", "Good straight grain.", "Mind the splinters!"],
  miner: ["Solid granite.", "Heave!", "Good seam of stone.", "That'll build a wall."],
  farmer: ["Just needs rain.", "Nearly ripe.", "Sowing the next row.", "Golden as a coin."],
  builder: ["Pass me that beam.", "Hold it steady!", "Nearly done here.", "A good strong joint."],
  forager: ["Ripe ones here!", "A good haul of berries.", "Mind the thorns.", "Sweet as honey."],
  idle: ["Lovely morning.", "Fine weather for it.", "Where shall I go?", "Supper soon?"],
  hungry: ["My belly's empty…", "We need food!", "Not a crumb left."],
  fullStore: ["No room left!", "The storehouse is full."],
};

let nextId = 1;

const pick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

/** Bottom-centre of a villager in world pixels (used for drawing and picking). */
export function folkFoot(v) {
  return { x: v.x * TILE, y: v.y * TILE };
}

export class Villager {
  constructor(id, x, y, rng) {
    this.id = id;
    this.name = NAMES[Math.floor(rng() * NAMES.length)];
    this.skin = Math.floor(rng() * 3);
    this.job = "idle";
    this.workplace = null;
    this.site = null; // construction site currently helped with
    this.home = null;
    this.x = x;
    this.y = y;
    this.dir = "down";
    this.frame = 2;
    this.animTime = rng();
    this.moving = false;
    this.speed = WALK_SPEED * (0.9 + rng() * 0.25);
    this.state = "idle";
    this.path = null;
    this.pathIdx = 0;
    this.timer = 0.3 + rng() * 1.5;
    this.carrying = null; // { kind, qty }
    this.target = null; // { x, y } resource tile being harvested
    this.workKind = null;
    this.arriveMode = null;
    this.bark = null;
    this.barkTimer = 0;
    this.raised = 0; // little "hello" hop when arriving
  }

  say(text, time = 3.5) {
    this.bark = text;
    this.barkTimer = time;
  }

  clearTask() {
    this.path = null;
    this.pathIdx = 0;
    this.moving = false;
    this.target = null;
    this.site = null;
    this.workKind = null;
    this.arriveMode = null;
    this.state = "idle";
  }

  /** Start walking to a tile. Returns false when no route exists. */
  walkTo(world, tx, ty, canEnter) {
    const ok = canEnter || ((x, y) => world.walkable(x, y));
    const sx = Math.floor(this.x);
    const sy = Math.floor(this.y);
    if (!ok(tx, ty)) return false;
    if (sx === tx && sy === ty) {
      this.path = [];
      this.pathIdx = 0;
      this.state = "walk";
      return true;
    }
    const path = findPath(world, sx, sy, tx, ty, { canEnter: ok });
    if (!path) return false;
    this.path = path;
    this.pathIdx = 0;
    this.state = "walk";
    return true;
  }

  /** Step along the path. Returns true while still walking. */
  advance(dt) {
    if (!this.path) return false;
    if (this.pathIdx >= this.path.length) {
      this.path = null;
      this.moving = false;
      return false;
    }
    const node = this.path[this.pathIdx];
    const tx = node.x + 0.5;
    const ty = node.y + 0.5;
    let dx = tx - this.x;
    let dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist <= step || dist < 1e-4) {
      this.x = tx;
      this.y = ty;
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) {
        this.path = null;
        this.moving = false;
        return false;
      }
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
    this.moving = true;
    if (Math.abs(dx) > Math.abs(dy) * 1.1) this.dir = dx > 0 ? "right" : "left";
    else if (Math.abs(dy) > 0.001) this.dir = dy > 0 ? "down" : "up";
    return true;
  }

  animate(dt) {
    this.animTime += dt;
    if (this.moving) this.frame = Math.floor(this.animTime * 7) % 2;
    else this.frame = 2;
    if (this.barkTimer > 0) {
      this.barkTimer -= dt;
      if (this.barkTimer <= 0) this.bark = null;
    }
    if (this.raised > 0) this.raised = Math.max(0, this.raised - dt);
  }
}

export class Village {
  constructor(world, { seed = 1, onEvent = () => {} } = {}) {
    this.world = world;
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.onEvent = onEvent;
    this.resources = { ...START_RESOURCES };
    this.villagers = [];
    this.events = [];
    this.floats = [];
    this.time = 0;
    this.regrowQueue = [];
    this.dirtyTiles = []; // tiles whose ground must be re-baked by the renderer
    this.eatTimer = 0;
    this.arrivalTimer = 6;
    this.starving = 0;
    this.happiness = 0.6;
    this.season = 0; // 0 spring, 1 summer, 2 autumn, 3 winter
    this.seasonLength = 120; // seconds
  }

  // ------------------------------------------------------------ bootstrap
  start() {
    const w = this.world;
    const spot = w.nearestWalkable(w.startX, w.startY, 12) || { x: w.startX, y: w.startY };
    const fire = this.place(Building.CAMPFIRE, spot.x, spot.y, { free: true, instant: true }).building;
    for (let i = 0; i < 3; i++) {
      const v = this.spawnVillager(spot, "idle");
      v.home = fire;
    }
    this.say("The first settlers make camp beside the fire.");
    return fire;
  }

  spawnVillager(near, job = "idle") {
    const w = this.world;
    const base = near || { x: w.startX, y: w.startY };
    const spot =
      w.nearestWalkable(base.x + Math.floor(this.rng() * 5) - 2, base.y + Math.floor(this.rng() * 5) - 2, 6) ||
      w.nearestWalkable(base.x, base.y, 8) || { x: base.x, y: base.y };
    const v = new Villager(nextId++, spot.x + 0.5, spot.y + 0.5, this.rng);
    v.job = job;
    v.dir = pick(this.rng, ["down", "left", "right", "up"]);
    this.villagers.push(v);
    return v;
  }

  // ------------------------------------------------------------ stores
  say(text) {
    this.events.push(text);
    if (this.events.length > 30) this.events.shift();
    this.onEvent(text);
  }

  float(worldX, worldY, text, color = "#ffe9a8") {
    this.floats.push({ x: worldX, y: worldY, text, color, life: 1.7 });
    if (this.floats.length > 30) this.floats.shift();
  }

  count(type) {
    return this.world.buildings.filter((b) => b.type === type).length;
  }

  get storageCap() {
    const cap = { ...BASE_STORAGE };
    for (const b of this.world.buildings) {
      if (b.state !== "done") continue;
      const add = BUILDING_DEFS[b.type].storage || 0;
      cap.wood += add;
      cap.stone += add;
      cap.food += Math.round(add * 0.5);
    }
    return cap;
  }

  get housing() {
    let n = BASE_CAPACITY;
    for (const b of this.world.buildings) {
      if (b.state !== "done") continue;
      n += BUILDING_DEFS[b.type].housing || 0;
    }
    return n;
  }

  addResource(kind, amount) {
    const cap = this.storageCap;
    const room = Math.max(0, (cap[kind] ?? 9999) - this.resources[kind]);
    const added = Math.min(room, amount);
    this.resources[kind] += added;
    return added;
  }

  canAfford(cost) {
    return this.resources.wood >= (cost.wood || 0) && this.resources.stone >= (cost.stone || 0);
  }

  // ------------------------------------------------------------ building
  place(type, x, y, { free = false, instant = false } = {}) {
    const def = BUILDING_DEFS[type];
    if (!def) return { ok: false, reason: "Unknown building" };
    if (def.limit && this.count(type) >= def.limit) return { ok: false, reason: `You can only raise one ${def.name}` };
    if (!this.world.canPlace(type, x, y)) return { ok: false, reason: "There's no room here" };
    if (!free && !this.canAfford(def.cost)) return { ok: false, reason: "Not enough wood or stone" };
    if (!free) {
      this.resources.wood -= def.cost.wood || 0;
      this.resources.stone -= def.cost.stone || 0;
    }
    const b = {
      id: this.world.buildings.length,
      type,
      x,
      y,
      w: def.w,
      h: def.h,
      state: instant || def.buildTime <= 0 ? "done" : "building",
      progress: instant || def.buildTime <= 0 ? 1 : 0,
      bob: this.rng() * 6.28,
      placedAt: this.time,
    };
    this.world.clearFootprint(x, y, def.w, def.h);
    this.world.stampBuilding(b);
    this.say(`${def.name}: works begun.`);
    this.reassign();
    return { ok: true, building: b };
  }

  demolish(b) {
    const w = this.world;
    for (const v of this.villagers) {
      if (v.workplace === b) {
        v.workplace = null;
        v.clearTask();
      }
      if (v.site === b) v.site = null;
      if (v.home === b) v.home = null;
    }
    w.buildings = w.buildings.filter((x) => x !== b);
    w.buildings.forEach((x, i) => (x.id = i));
    w.buildingOf.fill(-1);
    for (const bb of w.buildings) {
      for (let j = 0; j < bb.h; j++) {
        for (let i = 0; i < bb.w; i++) {
          if (w.inBounds(bb.x + i, bb.y + j)) w.buildingOf[w.idx(bb.x + i, bb.y + j)] = bb.id;
        }
      }
    }
    const def = BUILDING_DEFS[b.type];
    this.addResource("wood", Math.round((def.cost.wood || 0) * 0.4));
    this.addResource("stone", Math.round((def.cost.stone || 0) * 0.4));
    this.say(`${def.name} dismantled.`);
    this.reassign();
  }

  /** A walkable tile just outside the footprint, for drop-off and standing. */
  doorOf(b) {
    const w = this.world;
    const cands = [];
    for (let i = 0; i < b.w; i++) cands.push([b.x + i, b.y + b.h]);
    for (let j = 0; j < b.h; j++) cands.push([b.x - 1, b.y + j], [b.x + b.w, b.y + j]);
    for (let i = 0; i < b.w; i++) cands.push([b.x + i, b.y - 1]);
    for (const [x, y] of cands) if (w.walkable(x, y)) return { x, y };
    return w.nearestWalkable(b.x + Math.floor(b.w / 2), b.y + b.h, 10) || { x: b.x, y: b.y + b.h };
  }

  // ------------------------------------------------------------ jobs
  /**
   * Hand out the job slots. Villagers who already hold a slot keep it, so a
   * finished house doesn't scramble the whole village; anyone left over stays
   * on as a builder while there is something under construction.
   */
  reassign() {
    const slots = [];
    for (const b of this.world.buildings) {
      if (b.state !== "done") continue;
      for (const j of BUILDING_DEFS[b.type].jobs || []) {
        for (let i = 0; i < j.count; i++) slots.push({ b, job: j.job, taken: null });
      }
    }
    // pass 1: keep existing appointments
    for (const v of this.villagers) {
      if (!v.workplace) continue;
      const slot = slots.find((s) => !s.taken && s.b === v.workplace && s.job === v.job);
      if (slot) slot.taken = v;
    }
    // pass 2: fill what is left, most-recent arrivals first
    const unassigned = this.villagers.filter((v) => !slots.some((s) => s.taken === v));
    for (const slot of slots) {
      if (slot.taken) continue;
      const v = unassigned.shift();
      if (!v) break;
      slot.taken = v;
      v.workplace = slot.b;
      v.job = slot.job;
      v.clearTask();
      v.timer = 0.3 + this.rng();
    }
    const hasSite = this.world.buildings.some((b) => b.state === "building");
    for (const v of unassigned) {
      v.workplace = null;
      v.job = hasSite ? "builder" : "idle";
      v.clearTask();
      v.timer = 0.3 + this.rng();
    }
  }

  /** Closest harvestable tile of a kind within a building's working radius. */
  findResource(b, kind) {
    const w = this.world;
    const def = BUILDING_DEFS[b.type];
    const R = def.radius || 10;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const isTarget = (o) =>
      kind === "tree"
        ? o >= Obj.PINE && o <= Obj.OAK_AUTUMN
        : kind === "berry"
          ? o === Obj.BERRY_BUSH
          : o === Obj.STONE_A || o === Obj.STONE_B;
    let best = null;
    let bestD = Infinity;
    const pool = [];
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const x = Math.round(cx + i);
        const y = Math.round(cy + j);
        if (!w.inBounds(x, y)) continue;
        const idx = w.idx(x, y);
        if (w.buildingOf[idx] >= 0) continue;
        if (!isTarget(w.obj[idx])) continue;
        const d = Math.hypot(x - cx, y - cy);
        pool.push({ x, y, d });
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    if (!best) return null;
    // spread the crew out a little instead of all felling one tree
    if (pool.length > 1 && this.rng() < 0.35) {
      const near = pool.filter((p) => p.d <= bestD + 6);
      const chosen = pick(this.rng, near);
      return { x: chosen.x, y: chosen.y };
    }
    return best;
  }

  /** Somewhere a villager can stand to reach a resource tile. */
  approachTile(t) {
    const w = this.world;
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of around) if (w.walkable(t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy };
    return w.nearestWalkable(t.x, t.y, 6);
  }

  nearestSite() {
    let best = null;
    let bestCrew = Infinity;
    for (const b of this.world.buildings) {
      if (b.state !== "building") continue;
      const crew = this.villagers.filter((v) => v.site === b).length;
      if (crew < bestCrew) {
        bestCrew = crew;
        best = b;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ tick
  tick(dt) {
    this.time += dt;
    this.season = Math.floor(this.time / this.seasonLength) % 4;
    this.updateConstruction(dt);
    for (const v of this.villagers) this.think(v, dt);
    this.updateRegrow(dt);
    this.updateFood(dt);
    this.updateGrowth(dt);
    this.updateHappiness(dt);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y -= dt * 4;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
  }

  updateConstruction(dt) {
    for (const b of this.world.buildings) {
      if (b.state !== "building") continue;
      const def = BUILDING_DEFS[b.type];
      const crew = this.villagers.filter((v) => v.site === b && v.state === "work").length;
      // builders speed a site up, but a site never stalls completely
      const rate = (0.55 + crew * 0.75) / Math.max(1, def.buildTime);
      b.progress = Math.min(1, b.progress + dt * rate);
      if (b.progress >= 1) {
        b.state = "done";
        for (const v of this.villagers) if (v.site === b) v.clearTask();
        this.say(`${def.name} is finished!`);
        this.reassign();
      }
    }
  }

  updateRegrow(dt) {
    const w = this.world;
    for (let i = this.regrowQueue.length - 1; i >= 0; i--) {
      const e = this.regrowQueue[i];
      e.t -= dt;
      if (e.t > 0) continue;
      this.regrowQueue.splice(i, 1);
      if (w.obj[e.i] !== Obj.NONE && w.obj[e.i] !== Obj.STUMP) continue;
      if (w.buildingOf[e.i] >= 0) continue;
      const t = w.terrain[e.i];
      if (t !== Terrain.GRASS && t !== Terrain.DIRT) continue;
      if (e.kind === "stone") {
        w.obj[e.i] = this.rng() < 0.4 ? Obj.STONE_A : Obj.STONE_B;
      } else if (e.kind === "berry") {
        w.obj[e.i] = Obj.BERRY_BUSH;
        w.tone[e.i] = 0;
      } else {
        w.obj[e.i] = this.rng() < 0.5 ? Obj.PINE_YOUNG : Obj.OAK;
        w.tone[e.i] = 1;
      }
      this.dirtyTiles.push(e.i);
    }
  }

  updateFood(dt) {
    this.eatTimer += dt;
    while (this.eatTimer >= EAT_EVERY) {
      this.eatTimer -= EAT_EVERY;
      const eaters = this.villagers.length;
      if (!eaters) continue;
      if (this.resources.food >= eaters) {
        this.resources.food -= eaters;
      } else {
        this.resources.food = 0;
        this.starving = 6;
        for (const v of this.villagers) if (this.rng() < 0.3) v.say(pick(this.rng, BARKS.hungry));
        if (this.starving < 5.9) this.say("The stores are empty — folk go hungry.");
      }
    }
    if (this.starving > 0) this.starving = Math.max(0, this.starving - dt);
  }

  updateGrowth(dt) {
    // newcomers only turn up when there is a roof, a good mood and food to spare
    if (this.villagers.length >= this.housing) return;
    const surplus = this.resources.food - this.villagers.length * 5;
    if (surplus < 8 || this.happiness < 0.42) {
      this.arrivalTimer = Math.max(this.arrivalTimer, 5);
      return;
    }
    this.arrivalTimer -= dt;
    if (this.arrivalTimer > 0) return;
    this.arrivalTimer = 26 + (1 - this.happiness) * 30;
    const fire = this.world.buildings.find((b) => b.type === Building.CAMPFIRE);
    const v = this.spawnVillager(fire ? { x: fire.x, y: fire.y + 1 } : null, "idle");
    v.home = fire || null;
    v.say("I've come to settle!");
    v.raised = 1;
    this.say(`${v.name} joins the village.`);
    this.reassign();
  }

  updateHappiness(dt) {
    let target = 0.5;
    for (const b of this.world.buildings) {
      if (b.state !== "done") continue;
      target += BUILDING_DEFS[b.type].happiness || 0;
    }
    if (this.resources.food > this.villagers.length * 5) target += 0.1;
    if (this.resources.food <= 0) target -= 0.34;
    if (this.villagers.length > this.housing) target -= 0.2;
    if (this.villagers.filter((v) => v.job === "idle").length > this.villagers.length * 0.7) target -= 0.06;
    target = Math.max(0, Math.min(1, target));
    this.happiness += (target - this.happiness) * Math.min(1, dt * 0.7);
  }

  // ------------------------------------------------------------ villager AI
  think(v, dt) {
    v.animate(dt);
    if (v.state === "walk") {
      if (v.advance(dt)) return;
      this.arrive(v);
      return;
    }
    if (v.state === "work") {
      v.timer -= dt;
      if (v.timer <= 0) this.finishWork(v);
      return;
    }
    v.timer -= dt;
    if (v.timer > 0) return;
    this.chooseTask(v);
  }

  chooseTask(v) {
    // 1) builders head for whatever is going up
    if (v.job === "builder") {
      const site = this.nearestSite();
      if (site) {
        const spot = this.siteSpot(site);
        if (this.goto(v, spot.x, spot.y, "build", site)) return;
      }
      v.job = "idle";
      v.workplace = null;
    }

    // 2) unemployed folk look for a trade
    if (!v.workplace || v.workplace.state !== "done") {
      v.workplace = null;
      const trade = this.pickTradeOrIdle(v);
      if (trade === "idle") {
        if (this.rng() < 0.15) v.say(pick(this.rng, BARKS.idle));
        this.wander(v);
        return;
      }
      v.job = trade;
      v.workplace = this.workplaceFor(v);
      if (!v.workplace) {
        v.job = "idle";
        this.wander(v);
        return;
      }
    }

    const b = v.workplace;
    const def = BUILDING_DEFS[b.type];

    if (def.gather === "farm") {
      const spots = [];
      for (let j = 0; j < b.h; j++)
        for (let i = 0; i < b.w; i++)
          if (this.world.inBounds(b.x + i, b.y + j)) spots.push({ x: b.x + i, y: b.y + j });
      const s = pick(this.rng, spots);
      this.goto(v, s.x, s.y, "farm", null, this.fieldWalk(b));
      return;
    }

    if (def.gather === "tree" || def.gather === "stone" || def.gather === "berry") {
      if (v.carrying) {
        const door = this.doorOf(b);
        this.goto(v, door.x, door.y, "deposit", null);
        return;
      }
      const res = this.findResource(b, def.gather);
      if (!res) {
        if (this.rng() < 0.03) v.say("Nothing left to gather here.");
        v.timer = 2.5;
        this.wander(v);
        return;
      }
      const spot = this.approachTile(res);
      if (!spot) {
        v.timer = 2;
        return;
      }
      if (this.goto(v, spot.x, spot.y, "harvest", null)) v.target = res;
      return;
    }

    // a workplace with no trade to do (tavern, market, chapel): hang about
    this.wander(v);
  }

  /** A trade that still has a free slot somewhere, or "idle". */
  pickTradeOrIdle(v) {
    for (const b of this.world.buildings) {
      if (b.state !== "done") continue;
      for (const j of BUILDING_DEFS[b.type].jobs || []) {
        const crew = this.villagers.filter((w) => w !== v && w.workplace === b && w.job === j.job).length;
        if (crew < j.count) return j.job;
      }
    }
    return "idle";
  }

  workplaceFor(v) {
    for (const b of this.world.buildings) {
      if (b.state !== "done") continue;
      const job = (BUILDING_DEFS[b.type].jobs || []).find((j) => j.job === v.job);
      if (!job) continue;
      const crew = this.villagers.filter((w) => w !== v && w.workplace === b && w.job === v.job).length;
      if (crew < job.count) return b;
    }
    return null;
  }

  /** Fields are worked by walking over the crop rows themselves. */
  fieldWalk(b) {
    const w = this.world;
    return (x, y) =>
      (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) || w.walkable(x, y);
  }

  /** A walkable tile beside a construction site, varied so crews spread out. */
  siteSpot(b) {
    const w = this.world;
    const spots = [];
    for (let i = 0; i < b.w; i++) spots.push([b.x + i, b.y + b.h], [b.x + i, b.y - 1]);
    for (let j = 0; j < b.h; j++) spots.push([b.x - 1, b.y + j], [b.x + b.w, b.y + j]);
    const free = spots.filter(([x, y]) => w.walkable(x, y));
    if (free.length) {
      const [x, y] = pick(this.rng, free);
      return { x, y };
    }
    return this.doorOf(b);
  }

  /** Path toward a tile; on arrival run `mode`. */
  goto(v, tx, ty, mode, site, canEnter) {
    if (!v.walkTo(this.world, tx, ty, canEnter)) {
      v.state = "idle";
      v.timer = 1.5;
      return false;
    }
    v.arriveMode = mode;
    v.site = site || null;
    return true;
  }

  arrive(v) {
    const mode = v.arriveMode;
    v.arriveMode = null;
    if (mode === "harvest" && v.target) {
      const o = this.world.getObj(v.target.x, v.target.y);
      const trees = o >= Obj.PINE && o <= Obj.OAK_AUTUMN;
      const stones = o === Obj.STONE_A || o === Obj.STONE_B;
      const berries = o === Obj.BERRY_BUSH;
      if (!trees && !stones && !berries) {
        v.target = null;
        v.state = "idle";
        v.timer = 0.25;
        return;
      }
      v.workKind = trees ? "tree" : stones ? "stone" : "berry";
      v.state = "work";
      v.timer = trees ? 3.4 : stones ? 4 : 2.6;
      // face the tile being worked
      const dx = v.target.x + 0.5 - v.x;
      const dy = v.target.y + 0.5 - v.y;
      if (Math.abs(dx) > Math.abs(dy)) v.dir = dx > 0 ? "right" : "left";
      else if (Math.abs(dy) > 0.2) v.dir = dy > 0 ? "down" : "up";
      if (this.rng() < 0.35) v.say(pick(this.rng, BARKS[v.workKind === "tree" ? "woodcutter" : v.workKind === "stone" ? "miner" : "forager"]));
      return;
    }
    if (mode === "farm") {
      v.workKind = "farm";
      v.state = "work";
      v.timer = 4.5 + this.rng() * 2;
      if (this.rng() < 0.3) v.say(pick(this.rng, BARKS.farmer));
      return;
    }
    if (mode === "deposit") {
      this.deposit(v);
      return;
    }
    if (mode === "build") {
      v.workKind = "build";
      v.state = "work";
      v.timer = 3.5 + this.rng() * 2;
      if (this.rng() < 0.25) v.say(pick(this.rng, BARKS.builder));
      return;
    }
    v.state = "idle";
    v.timer = 3 + this.rng() * 5;
  }

  finishWork(v) {
    const w = this.world;
    if (v.workKind === "farm") {
      const seasonBonus = [1, 1.2, 1.35, 0.5][this.season];
      const gain = this.addResource("food", Math.round(6 * seasonBonus));
      if (gain > 0) this.float(v.x * TILE, v.y * TILE - 20, `+${gain} food`, "#c6d46a");
      else if (this.rng() < 0.4) v.say(pick(this.rng, BARKS.fullStore));
      v.workKind = null;
      v.state = "idle";
      v.timer = 1.2;
      return;
    }
    if (v.workKind === "build") {
      v.state = "idle";
      v.timer = 0.4;
      return;
    }
    if (v.target) {
      const i = w.idx(v.target.x, v.target.y);
      const o = w.obj[i];
      if (o >= Obj.PINE && o <= Obj.OAK_AUTUMN) {
        w.obj[i] = Obj.STUMP;
        this.regrowQueue.push({ i, t: 80 + this.rng() * 60, kind: "tree" });
        v.carrying = { kind: "wood", qty: CARRY };
        this.dirtyTiles.push(i);
      } else if (o === Obj.STONE_A || o === Obj.STONE_B) {
        w.obj[i] = Obj.NONE;
        this.regrowQueue.push({ i, t: 120 + this.rng() * 70, kind: "stone" });
        v.carrying = { kind: "stone", qty: CARRY };
        this.dirtyTiles.push(i);
      } else if (o === Obj.BERRY_BUSH) {
        w.obj[i] = Obj.NONE;
        this.regrowQueue.push({ i, t: 45 + this.rng() * 35, kind: "berry" });
        v.carrying = { kind: "food", qty: 6 };
        this.dirtyTiles.push(i);
      }
      v.target = null;
      v.workKind = null;
    }
    v.state = "idle";
    v.timer = 0.15;
  }

  deposit(v) {
    if (!v.carrying) {
      v.state = "idle";
      v.timer = 0.8;
      return;
    }
    const { kind, qty } = v.carrying;
    const gained = this.addResource(kind, qty);
    const colour = kind === "wood" ? "#f5d991" : kind === "stone" ? "#dfe6ef" : "#c6d46a";
    if (gained > 0) this.float(v.x * TILE, v.y * TILE - 20, `+${gained} ${kind}`, colour);
    else if (this.rng() < 0.5) v.say(pick(this.rng, BARKS.fullStore));
    v.carrying = null;
    v.state = "idle";
    v.timer = 0.5 + this.rng() * 0.7;
  }

  /** Idle folk drift toward the campfire and mill about nearby. */
  wander(v) {
    const w = this.world;
    const fire = w.buildings.find((b) => b.type === Building.CAMPFIRE) || v.workplace;
    const cx = fire ? fire.x + fire.w / 2 : Math.floor(v.x);
    const cy = fire ? fire.y + fire.h / 2 : Math.floor(v.y);
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = this.rng() * Math.PI * 2;
      const d = 1.5 + this.rng() * 6;
      const tx = Math.round(cx + Math.cos(a) * d);
      const ty = Math.round(cy + Math.sin(a) * d);
      if (w.walkable(tx, ty)) {
        if (this.goto(v, tx, ty, "idle", null)) return;
      }
    }
    v.state = "idle";
    v.timer = 3 + this.rng() * 5;
  }

  // ------------------------------------------------------------ picking
  /** Villager under a world-pixel point (they are ~16x20px tall). */
  villagerAtWorld(wx, wy) {
    let best = null;
    let bestD = 12;
    for (const v of this.villagers) {
      const fx = v.x * TILE;
      const fy = v.y * TILE;
      if (wy > fy + 4 || wy < fy - 22) continue;
      const d = Math.abs(wx - fx);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  villagerById(id) {
    return this.villagers.find((v) => v.id === id) || null;
  }

  /** Lines for the building inspector. */
  buildingSummary(b) {
    const def = BUILDING_DEFS[b.type];
    const lines = [def.blurb];
    if (b.state === "building") lines.push(`Under construction — ${Math.round(b.progress * 100)}%`);
    if (def.housing) lines.push(`Housing +${def.housing}`);
    if (def.storage) lines.push(`Storage +${def.storage}`);
    if (def.jobs && def.jobs.length) {
      const total = def.jobs.reduce((n, j) => n + j.count, 0);
      const filled = this.villagers.filter((v) => v.workplace === b).length;
      lines.push(`Workers ${filled}/${total}`);
    }
    return lines;
  }
}
