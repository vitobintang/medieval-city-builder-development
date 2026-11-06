import "./hud.css";
import { GAME_TITLE, TILE } from "../config.js";
import { BUILDING_DEFS, BUILD_ORDER, Building } from "../world/tiles.js";
import { labelJob } from "../sim/controller.js";

const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];

/** Tiny inline pixel icons for the resource bar (keeps the HUD dependency-free). */
const ICONS = {
  wood: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="1" y="6" width="14" height="5" fill="#6e4524"/><rect x="1" y="6" width="14" height="1" fill="#94622f"/><rect x="1" y="10" width="14" height="1" fill="#4a2c1a"/><rect x="12" y="7" width="3" height="3" fill="#b8823f"/><rect x="13" y="8" width="1" height="1" fill="#94622f"/></svg>`,
  stone: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="2" y="6" width="12" height="8" fill="#868d9a"/><rect x="2" y="6" width="12" height="2" fill="#aab1bd"/><rect x="3" y="8" width="4" height="3" fill="#d3d9e2"/><rect x="10" y="9" width="3" height="3" fill="#5a606d"/></svg>`,
  food: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="7" y="2" width="2" height="11" fill="#93ad3f"/><rect x="4" y="4" width="8" height="3" fill="#c6d46a"/><rect x="3" y="7" width="10" height="3" fill="#93ad3f"/><rect x="5" y="10" width="6" height="2" fill="#6f8c33"/></svg>`,
  folk: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="6" y="2" width="4" height="4" fill="#e8b98a"/><rect x="6" y="1" width="4" height="2" fill="#6e4524"/><rect x="5" y="6" width="6" height="6" fill="#3f6d8a"/><rect x="6" y="12" width="2" height="3" fill="#3b2614"/><rect x="9" y="12" width="2" height="3" fill="#3b2614"/></svg>`,
  smile: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="3" y="3" width="10" height="10" fill="#f2c46a"/><rect x="5" y="6" width="2" height="2" fill="#2b1a0c"/><rect x="9" y="6" width="2" height="2" fill="#2b1a0c"/><rect x="5" y="10" width="6" height="1" fill="#2b1a0c"/></svg>`,
};

/** Vanilla-DOM heads-up display: resources, build menu, inspector, journal. */
export class Hud {
  constructor(root, handlers = {}) {
    this.root = root;
    this.handlers = handlers;
    this.mini = { canvas: null, base: null, world: null };
    this.lastInfo = "";
    this.lastRes = "";
    this.cards = new Map();
    this.buildButtons = new Map();
    this.noticeTimer = 0;

    const el = (html) => {
      const d = document.createElement("div");
      d.innerHTML = html.trim();
      return d.firstChild;
    };
    this.el = el;

    root.appendChild(el(`<div class="hf-vignette"></div>`));

    // ---------------------------------------------------------- title
    this.title = el(`
      <div class="hf-panel hf-title">
        <h1>${GAME_TITLE}</h1>
        <div class="sub">Phase 2 · A Village Rises</div>
        <div class="hf-row"><label>Seed</label><input class="hf-input" spellcheck="false" /><button class="hf-btn" data-a="new">New map</button></div>
        <div class="hf-row"><button class="hf-btn" data-a="grid">Grid</button><button class="hf-btn on" data-a="clouds">Clouds</button><button class="hf-btn" data-a="home">Home</button></div>
      </div>`);
    root.appendChild(this.title);
    this.seedInput = this.title.querySelector("input");
    this.title.addEventListener("click", (e) => {
      const a = e.target?.dataset?.a;
      if (a === "new") handlers.onNewMap?.(this.seedInput.value.trim());
      if (a === "grid") e.target.classList.toggle("on", handlers.onToggleGrid?.());
      if (a === "clouds") e.target.classList.toggle("on", handlers.onToggleClouds?.());
      if (a === "home") this.onHome?.();
    });
    this.seedInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") handlers.onNewMap?.(this.seedInput.value.trim());
    });
    this.seedInput.addEventListener("keyup", (e) => e.stopPropagation());

    // ---------------------------------------------------------- resources
    this.resourcesBar = el(`
      <div class="hf-panel hf-res">
        <div class="hf-chip" data-r="wood">${ICONS.wood}<b>0</b><i>/0</i></div>
        <div class="hf-chip" data-r="stone">${ICONS.stone}<b>0</b><i>/0</i></div>
        <div class="hf-chip" data-r="food">${ICONS.food}<b>0</b><i>/0</i></div>
        <div class="hf-sep"></div>
        <div class="hf-chip" data-r="folk">${ICONS.folk}<b>0</b><i>/0</i></div>
        <div class="hf-chip" data-r="smile">${ICONS.smile}<b>0%</b></div>
        <div class="hf-chip season" data-r="season"><span>Spring</span></div>
      </div>`);
    root.appendChild(this.resourcesBar);
    this.res = {};
    for (const key of ["wood", "stone", "food", "folk", "smile", "season"]) {
      const node = this.resourcesBar.querySelector(`[data-r="${key}"]`);
      this.res[key] = { node, value: node.querySelector("b") || node.querySelector("span"), cap: node.querySelector("i") };
    }

    // ---------------------------------------------------------- minimap
    this.minimapPanel = el(`<div class="hf-panel hf-minimap"><canvas width="176" height="176"></canvas></div>`);
    root.appendChild(this.minimapPanel);
    this.mini.canvas = this.minimapPanel.querySelector("canvas");
    this.miniCtx = this.mini.canvas.getContext("2d");
    this.miniCtx.imageSmoothingEnabled = false;
    const jump = (e) => {
      if (!this.mini.world) return;
      const r = this.mini.canvas.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      handlers.onMinimapJump?.(fx * this.mini.world.width, fy * this.mini.world.height);
    };
    let dragging = false;
    this.mini.canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      this.mini.canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.mini.canvas.addEventListener("pointermove", (e) => dragging && jump(e));
    this.mini.canvas.addEventListener("pointerup", () => (dragging = false));

    // ---------------------------------------------------------- build menu
    this.buildPanel = el(`<div class="hf-panel hf-build"><div class="hf-build-title">Build</div><div class="hf-cards"></div></div>`);
    root.appendChild(this.buildPanel);
    const cardWrap = this.buildPanel.querySelector(".hf-cards");
    BUILD_ORDER.forEach((type, i) => {
      const def = BUILDING_DEFS[type];
      const card = el(`
        <button class="hf-card" data-type="${type}">
          <span class="key">${i < 9 ? i + 1 : 0}</span>
          <span class="nm">${def.name}</span>
          <span class="cost"><em class="w">${def.cost.wood}</em><em class="s">${def.cost.stone}</em></span>
          <span class="size">${def.w}×${def.h}</span>
        </button>`);
      card.addEventListener("click", () => handlers.onPickBuild?.(type));
      card.addEventListener("pointerenter", () => handlers.onHoverBuild?.(type));
      card.addEventListener("pointerleave", () => handlers.onHoverBuild?.(null));
      cardWrap.appendChild(card);
      this.buildButtons.set(type, card);
    });
    this.buildPanel.appendChild(
      el(`<div class="hf-build-foot"><span class="hf-btn small" data-a="demolish">Demolish (X)</span><span class="hint">Esc cancels</span></div>`)
    );
    this.buildPanel.addEventListener("click", (e) => {
      if (e.target?.dataset?.a === "demolish") handlers.onDemolish?.();
    });

    // ---------------------------------------------------------- inspector
    this.info = el(`<div class="hf-panel hf-info"></div>`);
    root.appendChild(this.info);

    // ---------------------------------------------------------- journal + hints
    this.journal = el(`<div class="hf-panel hf-journal"><div class="hf-journal-title">Village journal</div><div class="hf-journal-body"></div></div>`);
    root.appendChild(this.journal);
    this.journalBody = this.journal.querySelector(".hf-journal-body");

    this.hints = el(
      `<div class="hf-panel hf-hints">Drag / WASD: pan · Wheel: zoom · 1-9/0: build · X: demolish · Esc: cancel · Click a villager to meet them</div>`
    );
    root.appendChild(this.hints);
    setTimeout(() => this.hints.classList.add("fade"), 12000);

    this.stats = el(`<div class="hf-panel hf-stats">–</div>`);
    root.appendChild(this.stats);

    // ---------------------------------------------------------- toast
    this.toast = el(`<div class="hf-toast"></div>`);
    root.appendChild(this.toast);

    // ---------------------------------------------------------- loading
    this.loading = el(`
      <div class="hf-loading">
        <h2>${GAME_TITLE}</h2>
        <div class="hf-bar"><div></div></div>
        <div class="msg">Waking the land…</div>
      </div>`);
    root.appendChild(this.loading);
    this.bar = this.loading.querySelector(".hf-bar > div");
    this.msg = this.loading.querySelector(".msg");
  }

  // ------------------------------------------------------------ loading
  setLoading(progress, text) {
    this.loading.classList.remove("hidden");
    this.bar.style.width = Math.round(progress * 100) + "%";
    if (text) this.msg.textContent = text;
  }

  hideLoading() {
    this.loading.classList.add("hidden");
  }

  setSeed(seed) {
    this.seedInput.value = String(seed);
  }

  // ------------------------------------------------------------ minimap
  setMinimap(world, baseCanvas) {
    this.mini.world = world;
    this.mini.base = baseCanvas;
  }

  drawMinimap(camera, village) {
    const { world, base } = this.mini;
    if (!world) return;
    const c = this.mini.canvas;
    const ctx = this.miniCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, c.width, c.height);
    // buildings show up as bright little squares
    if (village) {
      const kx = c.width / world.width;
      const ky = c.height / world.height;
      for (const b of world.buildings) {
        ctx.fillStyle = b.state === "done" ? "#ffe9a8" : "#c9f7a6";
        ctx.fillRect(Math.floor(b.x * kx), Math.floor(b.y * ky), Math.max(1, Math.ceil(b.w * kx)), Math.max(1, Math.ceil(b.h * ky)));
      }
      for (const v of village.villagers) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(Math.floor(v.x * kx), Math.floor(v.y * ky), 1, 1);
      }
    }
    const sx = c.width / (world.width * TILE);
    const sy = c.height / (world.height * TILE);
    ctx.strokeStyle = "#fff4c4";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      Math.round(camera.left * sx),
      Math.round(camera.top * sy),
      Math.round((camera.viewW / camera.zoom) * sx),
      Math.round((camera.viewH / camera.zoom) * sy)
    );
  }

  // ------------------------------------------------------------ resources
  setResources(village, seasonIndex) {
    const { resources } = village;
    const cap = village.storageCap;
    const chips = [
      ["wood", resources.wood, cap.wood],
      ["stone", resources.stone, cap.stone],
      ["food", resources.food, cap.food],
      ["folk", village.villagers.length, village.housing],
    ];
    for (const [key, value, max] of chips) {
      const chip = this.res[key];
      const v = Math.floor(value);
      if (chip.node.dataset.v !== String(v)) {
        chip.node.dataset.v = String(v);
        chip.value.textContent = v;
      }
      if (chip.cap) {
        const capText = "/" + Math.floor(max);
        if (chip.cap.textContent !== capText) chip.cap.textContent = capText;
      }
      // warn when a store is nearly full or the village is out of food
      const low = key === "food" && value <= 0;
      const full = key !== "folk" && value >= max - 0.5;
      chip.node.classList.toggle("bad", low);
      chip.node.classList.toggle("full", full);
      chip.node.classList.toggle("over", key === "folk" && value > max);
    }
    const pct = Math.round(village.happiness * 100);
    const smile = this.res.smile;
    if (smile.node.dataset.v !== String(pct)) {
      smile.node.dataset.v = String(pct);
      smile.value.textContent = pct + "%";
    }
    smile.node.classList.toggle("bad", pct < 35);
    const season = this.res.season;
    const sName = SEASONS[seasonIndex % 4];
    if (season.value?.textContent !== sName) season.value.textContent = sName;
    season.node.dataset.season = String(seasonIndex % 4);
  }

  /** Grey out build cards that can't be afforded yet. */
  setAffordability(village, controller) {
    for (const [type, card] of this.buildButtons) {
      const def = BUILDING_DEFS[type];
      const poor = !village.canAfford(def.cost);
      const limited = def.limit && village.count(type) >= def.limit;
      card.classList.toggle("poor", poor || limited);
      card.classList.toggle("active", controller.mode === "build" && controller.buildType === type);
      card.classList.toggle("locked", !!limited);
    }
    const demo = this.buildPanel.querySelector('[data-a="demolish"]');
    if (demo) demo.classList.toggle("on", controller.mode === "demolish");
  }

  // ------------------------------------------------------------ inspector
  setInspector(state) {
    const { controller, village } = state;
    const sel = controller.selection;
    let html = "";
    if (sel?.kind === "villager") {
      const v = sel.villager;
      const job = labelJob(v.job);
      const place = v.workplace ? BUILDING_DEFS[v.workplace.type].name : "—";
      const doing =
        v.state === "work" ? workingWord(v.job) : v.state === "walk" ? "walking" : v.carrying ? "hauling goods" : "resting";
      html = `
        <div class="hf-insp-head"><span class="hf-avatar job-${v.job}"></span><div><div class="hf-insp-name">${v.name}</div><div class="hf-insp-job">${job}</div></div></div>
        <div class="hf-kv"><span>Doing</span><b>${doing}</b></div>
        <div class="hf-kv"><span>Workplace</span><b>${place}</b></div>
        ${v.carrying ? `<div class="hf-kv"><span>Carrying</span><b>${v.carrying.qty} ${v.carrying.kind}</b></div>` : ""}
        <div class="hf-insp-note">${v.bark || quoteFor(v)}</div>`;
    } else if (sel?.kind === "building") {
      const b = sel.building;
      const def = BUILDING_DEFS[b.type];
      const lines = village.buildingSummary(b);
      html = `
        <div class="hf-insp-head"><span class="hf-avatar bldg"></span><div><div class="hf-insp-name">${def.name}</div><div class="hf-insp-job">${b.state === "done" ? "Working" : "Under construction"}</div></div></div>
        <div class="hf-insp-lines">${lines.map((l) => `<div>${l}</div>`).join("")}</div>
        ${b.state === "building" ? `<div class="hf-prog"><div style="width:${Math.round(b.progress * 100)}%"></div></div>` : ""}
        ${def.limit ? "" : `<button class="hf-btn small wide" data-a="demolish-sel">Dismantle</button>`}`;
    } else {
      html = `
        <div class="hf-insp-head"><span class="hf-avatar"></span><div><div class="hf-insp-name">The Vale</div><div class="hf-insp-job">${village.villagers.length} souls</div></div></div>
        <div class="hf-kv"><span>Housing</span><b>${village.villagers.length}/${village.housing}</b></div>
        <div class="hf-kv"><span>Buildings</span><b>${controller.world.buildings.length}</b></div>
        <div class="hf-kv"><span>Unemployed</span><b>${village.villagers.filter((v) => v.job === "idle").length}</b></div>
        <div class="hf-insp-note">Click a villager or a building to look closer.</div>`;
    }
    if (html !== this.lastInfo) {
      this.lastInfo = html;
      this.info.innerHTML = html;
    }
  }

  setNotice(text) {
    this.toast.textContent = text;
    this.toast.classList.add("show");
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.toast.classList.remove("show"), 2600);
  }

  setJournal(events) {
    const last = events.slice(-5).reverse();
    const html = last.map((e, i) => `<div class="hf-event${i === 0 ? " fresh" : ""}">${e}</div>`).join("");
    if (html !== this.lastJournal) {
      this.lastJournal = html;
      this.journalBody.innerHTML = html;
    }
  }

  setStats(text) {
    if (this.stats.textContent !== text) this.stats.textContent = text;
  }
}

function workingWord(job) {
  if (job === "woodcutter") return "felling a tree";
  if (job === "miner") return "quarrying stone";
  if (job === "farmer") return "tending the field";
  if (job === "builder") return "raising a building";
  return "working";
}

function quoteFor(v) {
  const quotes = {
    idle: "“Where shall I go?”",
    woodcutter: "“Good straight grain here.”",
    farmer: "“Just needs a little rain.”",
    miner: "“Solid granite.”",
    builder: "“Pass me that beam.”",
  };
  return quotes[v.job] || "“Lovely morning.”";
}

export { ICONS, SEASONS };
