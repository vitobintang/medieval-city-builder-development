import "./hud.css";
import { GAME_TITLE, TILE } from "../config.js";

/** Vanilla-DOM heads-up display: title/seed, minimap, tile inspector, loading screen. */
export class Hud {
  constructor(root, { onNewMap, onMinimapJump, onToggleGrid, onToggleClouds }) {
    this.root = root;
    this.mini = { canvas: null, base: null, world: null };
    this.lastInfo = "";

    const el = (html) => {
      const d = document.createElement("div");
      d.innerHTML = html.trim();
      return d.firstChild;
    };

    root.appendChild(el(`<div class="hf-vignette"></div>`));

    this.title = el(`
      <div class="hf-panel hf-title">
        <h1>${GAME_TITLE}</h1>
        <div class="sub">Phase 1 · The Living Land</div>
        <div class="hf-row"><label>Seed</label><input class="hf-input" spellcheck="false" /><button class="hf-btn" data-a="new">New map</button></div>
        <div class="hf-row"><button class="hf-btn" data-a="grid">Grid</button><button class="hf-btn on" data-a="clouds">Clouds</button><button class="hf-btn" data-a="home">Home</button></div>
      </div>`);
    root.appendChild(this.title);
    this.seedInput = this.title.querySelector("input");
    this.title.addEventListener("click", (e) => {
      const a = e.target?.dataset?.a;
      if (a === "new") onNewMap(this.seedInput.value.trim());
      if (a === "grid") e.target.classList.toggle("on", onToggleGrid());
      if (a === "clouds") e.target.classList.toggle("on", onToggleClouds());
      if (a === "home") this.onHome?.();
    });
    this.seedInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") onNewMap(this.seedInput.value.trim());
    });
    this.seedInput.addEventListener("keyup", (e) => e.stopPropagation());

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
      onMinimapJump(fx * this.mini.world.width, fy * this.mini.world.height);
    };
    let dragging = false;
    this.mini.canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      this.mini.canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.mini.canvas.addEventListener("pointermove", (e) => dragging && jump(e));
    this.mini.canvas.addEventListener("pointerup", () => (dragging = false));

    this.info = el(`<div class="hf-panel hf-info"><div class="k">Tile</div><div class="v" data-f="pos">–</div><div class="k" style="margin-top:4px">Ground</div><div class="v" data-f="ground">–</div><div class="k" style="margin-top:4px">Standing here</div><div class="v" data-f="obj">–</div></div>`);
    root.appendChild(this.info);
    this.f = {
      pos: this.info.querySelector('[data-f="pos"]'),
      ground: this.info.querySelector('[data-f="ground"]'),
      obj: this.info.querySelector('[data-f="obj"]'),
    };

    this.hints = el(`<div class="hf-panel hf-hints">Drag / WASD: pan · Wheel or Q/E: zoom · G: grid · H: home · N: new map</div>`);
    root.appendChild(this.hints);
    setTimeout(() => this.hints.classList.add("fade"), 9000);

    this.stats = el(`<div class="hf-panel hf-stats">–</div>`);
    root.appendChild(this.stats);

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

  setMinimap(world, baseCanvas) {
    this.mini.world = world;
    this.mini.base = baseCanvas;
  }

  /** Draw minimap + camera frustum rectangle. */
  drawMinimap(camera) {
    const { world, base } = this.mini;
    if (!world) return;
    const c = this.mini.canvas;
    const ctx = this.miniCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, c.width, c.height);
    const sx = c.width / (world.width * TILE);
    const sy = c.height / (world.height * TILE);
    const x = camera.left * sx;
    const y = camera.top * sy;
    const w = (camera.viewW / camera.zoom) * sx;
    const h = (camera.viewH / camera.zoom) * sy;
    ctx.strokeStyle = "#fff4c4";
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  setTileInfo(pos, ground, obj) {
    const key = pos + ground + obj;
    if (key === this.lastInfo) return;
    this.lastInfo = key;
    this.f.pos.textContent = pos;
    this.f.ground.textContent = ground;
    this.f.obj.textContent = obj;
  }

  setStats(text) {
    if (this.stats.textContent !== text) this.stats.textContent = text;
  }
}
