// Game bootstrap: wires world generation, camera, input, renderer, HUD and the loop.

import { buildAtlas } from "./art/atlas.js";
import { Camera } from "./core/camera.js";
import { Input } from "./core/input.js";
import { GameLoop } from "./core/loop.js";
import { seedFromString } from "./core/rng.js";
import { generateWorld } from "./world/worldgen.js";
import { TERRAIN_INFO, OBJ_INFO, Obj } from "./world/tiles.js";
import { Renderer } from "./render/renderer.js";
import { buildMinimapCanvas } from "./render/minimap.js";
import { Hud } from "./ui/hud.js";
import { TILE } from "./config.js";

function parseSeed(text) {
  if (/^\d+$/.test(text)) return Number(text) >>> 0;
  return seedFromString(text);
}

export function startGame(container) {
  container.classList.add("hf-root");
  const canvas = document.createElement("canvas");
  canvas.className = "hf-canvas";
  container.appendChild(canvas);

  const camera = new Camera();
  const atlas = buildAtlas();
  const renderer = new Renderer(canvas, atlas);
  let world = null;
  let destroyed = false;
  let token = 0;

  const hud = new Hud(container, {
    onNewMap: (text) => loadWorld(text ? text : String(Math.floor(Math.random() * 900000) + 100000)),
    onMinimapJump: (tx, ty) => camera.centerOnTile(tx, ty),
    onToggleGrid: () => (renderer.showGrid = !renderer.showGrid),
    onToggleClouds: () => (renderer.showClouds = !renderer.showClouds),
  });
  hud.onHome = () => world && camera.centerOnTile(world.startX, world.startY);

  const input = new Input(canvas, camera, {
    onKey: (k) => {
      if (k === "g") renderer.showGrid = !renderer.showGrid;
      if (k === "h") hud.onHome();
      if (k === "n") loadWorld(String(Math.floor(Math.random() * 900000) + 100000));
    },
  });

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.resize(w, h);
    renderer.resize(w, h, window.devicePixelRatio || 1);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  async function loadWorld(seedText) {
    const my = ++token;
    const stale = () => destroyed || my !== token;
    const seed = parseSeed(seedText);
    hud.setSeed(seedText);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("seed", seedText);
      window.history.replaceState(null, "", url);
    } catch {
      /* sandboxed iframes may block this; harmless */
    }
    hud.setLoading(0, "Waking the land…");
    const w = await generateWorld({
      seed,
      onProgress: (p, msg) => !stale() && hud.setLoading(p, msg),
    });
    if (stale()) return;
    hud.setLoading(0.8, "Painting the world…");
    const ok = await renderer.setWorld(w, (p) => !stale() && hud.setLoading(p), stale);
    if (!ok || stale()) return;
    world = w;
    camera.setBounds(w.width, w.height);
    camera.centerOnTile(w.startX, w.startY);
    hud.setMinimap(w, buildMinimapCanvas(w));
    hud.setLoading(1, "Welcome to the vale.");
    setTimeout(() => !stale() && hud.hideLoading(), 250);
  }

  let fps = 60;
  let statTimer = 0;
  const loop = new GameLoop({
    update: () => {
      /* simulation tick lives here in later phases */
    },
    frame: (dt, time) => {
      input.update(dt);
      camera.update(dt);
      let hover = null;
      if (world && input.mouse.inside) {
        hover = camera.screenToTile(input.mouse.x, input.mouse.y);
        if (world.inBounds(hover.x, hover.y)) {
          const i = world.idx(hover.x, hover.y);
          const o = world.obj[i];
          hud.setTileInfo(`${hover.x}, ${hover.y}`, TERRAIN_INFO[world.terrain[i]].name, o === Obj.NONE ? "Nothing" : OBJ_INFO[o].name);
        } else {
          hover = null;
        }
      }
      renderer.render(camera, time, hover);
      if (world) hud.drawMinimap(camera);
      fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
      statTimer += dt;
      if (statTimer > 0.4) {
        statTimer = 0;
        hud.setStats(`${Math.round(fps)} fps · zoom ${camera.targetZoom}× · ${(camera.zoom * TILE) | 0}px tiles`);
      }
    },
  });
  loop.start();

  const initial = new URLSearchParams(window.location.search).get("seed") || String(Math.floor(Math.random() * 900000) + 100000);
  loadWorld(initial);

  return {
    destroy() {
      destroyed = true;
      loop.stop();
      input.destroy();
      ro.disconnect();
      container.innerHTML = "";
      container.classList.remove("hf-root");
    },
  };
}
