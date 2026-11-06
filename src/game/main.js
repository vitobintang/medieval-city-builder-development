// Game bootstrap: wires world generation, camera, input, renderer, the village
// simulation and the HUD together, then runs the loop.

import { buildAtlas } from "./art/atlas.js";
import { Camera } from "./core/camera.js";
import { Input } from "./core/input.js";
import { GameLoop } from "./core/loop.js";
import { seedFromString } from "./core/rng.js";
import { generateWorld } from "./world/worldgen.js";
import { BUILD_ORDER } from "./world/tiles.js";
import { Renderer } from "./render/renderer.js";
import { buildMinimapCanvas } from "./render/minimap.js";
import { Hud } from "./ui/hud.js";
import { Village } from "./sim/village.js";
import { Controller } from "./sim/controller.js";
import { TILE } from "./config.js";

function parseSeed(text) {
  if (/^\d+$/.test(text)) return Number(text) >>> 0;
  return seedFromString(text);
}

const NEW_SEED = () => String(Math.floor(Math.random() * 900000) + 100000);

export function startGame(container) {
  container.classList.add("hf-root");
  const canvas = document.createElement("canvas");
  canvas.className = "hf-canvas";
  container.appendChild(canvas);

  const camera = new Camera();
  const atlas = buildAtlas();
  const renderer = new Renderer(canvas, atlas);
  let world = null;
  let village = null;
  let controller = null;
  let destroyed = false;
  let token = 0;

  const hud = new Hud(container, {
    onNewMap: (text) => loadWorld(text || NEW_SEED()),
    onMinimapJump: (tx, ty) => camera.centerOnTile(tx, ty),
    onToggleGrid: () => (renderer.showGrid = !renderer.showGrid),
    onToggleClouds: () => (renderer.showClouds = !renderer.showClouds),
    onPickBuild: (type) => {
      if (!controller) return;
      if (controller.mode === "build" && controller.buildType === type) controller.cancel();
      else controller.startBuild(type);
      refreshPanels();
    },
    onHoverBuild: () => {},
    onDemolish: () => {
      controller?.startDemolish();
      refreshPanels();
    },
  });
  hud.onHome = () => world && camera.centerOnTile(world.startX, world.startY);

  const keymap = {};
  BUILD_ORDER.forEach((type, i) => {
    keymap[i < 9 ? String(i + 1) : "0"] = type;
  });

  const input = new Input(canvas, camera, {
    onKey: (k) => {
      if (k === "g") renderer.showGrid = !renderer.showGrid;
      if (k === "h") hud.onHome();
      if (k === "n") loadWorld(NEW_SEED());
      if (!controller) return;
      if (controller.onKey(k, keymap)) refreshPanels();
      if (k === "b") hud.setNotice("Build menu: press 1-9 or 0, or click a card.");
    },
    onClick: (sx, sy, button, e) => {
      if (!controller) return;
      // ctrl/shift-click demolishes straight away, like most builders
      if (e && (e.ctrlKey || e.metaKey) && button === 0) {
        const tile = camera.screenToTile(sx, sy);
        const b = world.buildingAt(tile.x, tile.y);
        if (b) controller.demolishAt(b);
        refreshPanels();
        return;
      }
      controller.onClick(sx, sy, button);
      refreshPanels();
    },
    onPointerMove: () => {},
  });

  /** Push controller state into the HUD panels. */
  function refreshPanels() {
    if (!controller || !village) return;
    hud.setAffordability(village, controller);
    hud.setInspector({ controller, village });
    canvas.classList.toggle("hf-building", controller.mode === "build");
    canvas.classList.toggle("hf-demolishing", controller.mode === "demolish");
  }

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
    village = new Village(w, { seed, onEvent: () => hud.setJournal(village.events) });
    controller = new Controller({
      world: w,
      camera,
      village,
      onNotice: (text) => hud.setNotice(text),
      onChange: () => refreshPanels(),
    });
    village.start();
    hud.setJournal(village.events);

    camera.setBounds(w.width, w.height);
    camera.centerOnTile(w.startX, w.startY);
    hud.setMinimap(w, buildMinimapCanvas(w));
    hud.setResources(village, 0);
    refreshPanels();
    hud.setLoading(1, "Welcome to the vale.");
    setTimeout(() => !stale() && hud.hideLoading(), 250);
    hud.setNotice("Press 1 for a woodcutter's hut, 3 for a forager, 4 for a wheat field.");
  }

  let fps = 60;
  let statTimer = 0;
  let panelTimer = 0;
  const dirtyTiles = [];

  const loop = new GameLoop({
    step: 1 / 20,
    update: (dt) => {
      if (!village) return;
      village.tick(dt);
    },
    frame: (dt, time) => {
      input.update(dt);
      camera.update(dt);

      if (world && input.mouse.inside) {
        const tile = camera.screenToTile(input.mouse.x, input.mouse.y);
        if (world.inBounds(tile.x, tile.y)) {
          controller?.setHover(tile);
          if (!controller?.selection) {
            hud.setInspector({ controller, village });
          }
        } else {
          controller?.setHover(null);
        }
      } else {
        controller?.setHover(null);
      }

      renderer.render(camera, time, {
        village,
        hover: controller?.hover,
        ghost: controller?.ghost,
        selection: controller?.selection,
      });

      // harvested tiles need their ground re-baked (stumps, cleared stone)
      if (village && village.dirtyTiles.length) {
        dirtyTiles.push(...village.dirtyTiles);
        village.dirtyTiles.length = 0;
        renderer.refreshTiles(dirtyTiles);
        dirtyTiles.length = 0;
      }

      if (village) {
        hud.drawMinimap(camera, village);
        hud.setResources(village, village.season);
        hud.setJournal(village.events);
        hud.setInspector({ controller, village });
      }

      fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
      statTimer += dt;
      if (statTimer > 0.25) {
        statTimer = 0;
        hud.setStats(`${Math.round(fps)} fps · zoom ${camera.targetZoom}×`);
      }
      panelTimer += dt;
      if (panelTimer > 0.5 && village) {
        panelTimer = 0;
        hud.setAffordability(village, controller);
      }
    },
  });
  loop.start();

  const initial = new URLSearchParams(window.location.search).get("seed") || NEW_SEED();
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
