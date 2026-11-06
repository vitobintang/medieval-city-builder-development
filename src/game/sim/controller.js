// Player interaction: build mode, placement ghosts, selection and demolition.
// Keeps all the "what does a click mean right now" logic in one place so the HUD
// and the renderer stay dumb.

import { BUILDING_DEFS, Building } from "../world/tiles.js";
import { TILE } from "../config.js";

export const Mode = Object.freeze({ NONE: "none", BUILD: "build", DEMOLISH: "demolish" });

export class Controller {
  constructor({ world, camera, village, onNotice = () => {}, onChange = () => {} }) {
    this.world = world;
    this.camera = camera;
    this.village = village;
    this.onNotice = onNotice;
    this.onChange = onChange;
    this.mode = Mode.NONE;
    this.buildType = Building.NONE;
    this.hover = null;
    this.ghost = null;
    this.selection = null;
  }

  // ------------------------------------------------------------ mode
  startBuild(type) {
    if (!BUILDING_DEFS[type]) return;
    this.mode = Mode.BUILD;
    this.buildType = type;
    this.selection = null;
    this.updateGhost();
    this.onChange();
  }

  startDemolish() {
    this.mode = this.mode === Mode.DEMOLISH ? Mode.NONE : Mode.DEMOLISH;
    this.buildType = Building.NONE;
    this.ghost = null;
    this.onChange();
  }

  cancel() {
    if (this.mode === Mode.NONE && !this.selection) return false;
    this.mode = Mode.NONE;
    this.buildType = Building.NONE;
    this.ghost = null;
    this.selection = null;
    this.onChange();
    return true;
  }

  setHover(tile) {
    this.hover = tile;
    if (this.mode === Mode.BUILD) this.updateGhost();
    else this.ghost = null;
  }

  /** Anchor the footprint so the cursor sits a little up from its bottom-centre. */
  updateGhost() {
    const def = BUILDING_DEFS[this.buildType];
    if (!def || !this.hover) {
      this.ghost = null;
      return;
    }
    const x = this.hover.x - Math.floor(def.w / 2);
    const y = this.hover.y - (def.h > 1 ? def.h - 1 : 0);
    const valid = this.world.canPlace(this.buildType, x, y) && this.affordable();
    this.ghost = { type: this.buildType, x, y, valid };
  }

  affordable() {
    const def = BUILDING_DEFS[this.buildType];
    if (!def) return false;
    if (def.limit && this.village.count(this.buildType) >= def.limit) return false;
    return this.village.canAfford(def.cost);
  }

  // ------------------------------------------------------------ clicks
  onClick(screenX, screenY, button) {
    const tile = this.camera.screenToTile(screenX, screenY);
    if (!this.world.inBounds(tile.x, tile.y)) return;

    if (button === 2) {
      if (this.cancel()) return;
      return;
    }

    if (this.mode === Mode.BUILD) {
      this.tryPlace(tile);
      return;
    }
    if (this.mode === Mode.DEMOLISH) {
      const b = this.world.buildingAt(tile.x, tile.y);
      if (!b) {
        this.onNotice("Nothing to demolish there.");
        return;
      }
      this.demolishAt(b);
      return;
    }

    // plain click: pick a villager, else a building, else clear
    const worldX = tile.x * TILE + TILE / 2;
    const worldY = tile.y * TILE + TILE;
    const v = this.village.villagerAtWorld(worldX, worldY);
    const b = this.world.buildingAt(tile.x, tile.y);
    if (v) {
      this.selection = { kind: "villager", villager: v };
      this.onNotice(`${v.name} the ${labelJob(v.job)}`);
    } else if (b) {
      this.selection = { kind: "building", building: b };
    } else {
      this.selection = null;
    }
    this.onChange();
  }

  demolishAt(b) {
    const def = BUILDING_DEFS[b.type];
    if (def.limit) {
      this.onNotice("The campfire can't be pulled down.");
      return;
    }
    this.village.demolish(b);
    if (this.selection && this.selection.building === b) this.selection = null;
    this.onNotice(`${def.name} dismantled — some materials recovered.`);
    this.onChange();
  }

  tryPlace(tile) {
    const def = BUILDING_DEFS[this.buildType];
    const x = tile.x - Math.floor(def.w / 2);
    const y = tile.y - (def.h > 1 ? def.h - 1 : 0);
    if (!this.world.canPlace(this.buildType, x, y)) {
      this.onNotice("That ground is too steep, wet or crowded.");
      return;
    }
    if (def.limit && this.village.count(this.buildType) >= def.limit) {
      this.onNotice(`You can only raise one ${def.name}.`);
      return;
    }
    if (!this.village.canAfford(def.cost)) {
      this.onNotice(`Not enough ${this.village.resources.wood < def.cost.wood ? "wood" : "stone"} for that.`);
      return;
    }
    const res = this.village.place(this.buildType, x, y);
    if (!res.ok) {
      this.onNotice(res.reason);
      return;
    }
    this.onNotice(`${def.name} staked out — your folk will build it.`);
    // stay in build mode for repeat placements, but refresh the ghost
    this.updateGhost();
    this.onChange();
  }

  /** Keyboard shortcuts shared by the HUD footer. */
  onKey(k, keymap) {
    if (k === "escape") return this.cancel();
    if (k === "x") return this.startDemolish();
    if (k === "delete" || k === "backspace") {
      const sel = this.selection;
      if (sel && sel.kind === "building" && !BUILDING_DEFS[sel.building.type].limit) {
        this.village.demolish(sel.building);
        this.selection = null;
        this.onChange();
        return true;
      }
    }
    if (keymap && keymap[k] != null) {
      this.startBuild(keymap[k]);
      return true;
    }
    return false;
  }
}

export function labelJob(job) {
  switch (job) {
    case "woodcutter": return "woodcutter";
    case "miner": return "stonecutter";
    case "farmer": return "farmer";
    case "builder": return "builder";
    default: return "settler";
  }
}
