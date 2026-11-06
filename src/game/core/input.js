import { KEY_PAN_SPEED } from "../config.js";

/**
 * Mouse / touch / keyboard input -> camera commands.
 *  - drag (left, middle or right button) or one-finger drag to pan, with inertia
 *  - wheel or +/- (and Q/E) to zoom toward the cursor, pinch on touch
 *  - WASD / arrows to pan (hold Shift to hurry)
 * Events that are not camera-related are surfaced through `handlers`.
 */
export class Input {
  constructor(canvas, camera, handlers = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.handlers = handlers;
    this.mouse = { x: -1, y: -1, inside: false };
    this.keys = new Set();
    this.pointers = new Map();
    this.drag = null;
    this.pinch = null;
    this.off = [];

    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this.off.push(() => target.removeEventListener(type, fn, opts));
    };

    on(canvas, "pointerdown", (e) => this.onDown(e));
    on(window, "pointermove", (e) => this.onMove(e));
    on(window, "pointerup", (e) => this.onUp(e));
    on(window, "pointercancel", (e) => this.onUp(e));
    on(canvas, "pointerleave", () => (this.mouse.inside = false));
    on(canvas, "wheel", (e) => this.onWheel(e), { passive: false });
    on(canvas, "contextmenu", (e) => e.preventDefault());
    on(window, "keydown", (e) => this.onKey(e, true));
    on(window, "keyup", (e) => this.onKey(e, false));
    on(window, "blur", () => this.keys.clear());
  }

  destroy() {
    this.off.forEach((f) => f());
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.camera.vx = this.camera.vy = 0;
    if (this.pointers.size === 1) {
      this.drag = { id: e.pointerId, sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, lt: performance.now(), button: e.button };
    } else if (this.pointers.size === 2) {
      this.drag = null;
      this.pinch = { dist: this.pinchDist() };
    }
  }

  onMove(e) {
    const p = this.local(e);
    if (e.target === this.canvas) {
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.inside = true;
    } else if (!this.pointers.has(e.pointerId)) {
      this.mouse.inside = false; // over a HUD panel
    }
    this.handlers.onPointerMove?.(p, e);
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, p);

    if (this.pinch && this.pointers.size >= 2) {
      const d = this.pinchDist();
      const c = this.pinchCenter();
      this.camera.zoomBy(d / this.pinch.dist, c.x, c.y);
      this.pinch.dist = d;
      return;
    }
    const d = this.drag;
    if (d && d.id === e.pointerId) {
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 4) d.moved = true;
      if (d.moved) {
        const now = performance.now();
        const dt = Math.max(1, now - d.lt) / 1000;
        const dx = p.x - d.lx;
        const dy = p.y - d.ly;
        this.camera.panByScreen(dx, dy);
        this.camera.vx = this.camera.vx * 0.6 + (dx / dt) * 0.4;
        this.camera.vy = this.camera.vy * 0.6 + (dy / dt) * 0.4;
        d.lt = now;
      }
      d.lx = p.x;
      d.ly = p.y;
    }
  }

  onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const d = this.drag;
    if (d && d.id === e.pointerId) {
      if (!d.moved) this.handlers.onClick?.(d.sx, d.sy, d.button, e);
      else if (performance.now() - d.lt > 80) this.camera.vx = this.camera.vy = 0; // paused before release
    }
    this.pointers.delete(e.pointerId);
    if (this.pinch && this.pointers.size < 2) {
      this.pinch = null;
      this.camera.snapZoom();
    }
    if (this.pointers.size === 0) this.drag = null;
  }

  pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }

  pinchCenter() {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  onWheel(e) {
    e.preventDefault();
    const p = this.local(e);
    this.camera.zoomStep(e.deltaY < 0 ? 1 : -1, p.x, p.y);
  }

  onKey(e, down) {
    if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (down) {
      this.keys.add(k);
      if (e.repeat) return;
      if (k === "=" || k === "+" || k === "e") this.camera.zoomStep(1);
      if (k === "-" || k === "_" || k === "q") this.camera.zoomStep(-1);
      this.handlers.onKey?.(k);
    } else {
      this.keys.delete(k);
    }
  }

  /** Called every frame: apply held-key panning. */
  update(dt) {
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.has("a") || k.has("arrowleft")) dx -= 1;
    if (k.has("d") || k.has("arrowright")) dx += 1;
    if (k.has("w") || k.has("arrowup")) dy -= 1;
    if (k.has("s") || k.has("arrowdown")) dy += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      const speed = KEY_PAN_SPEED * (k.has("shift") ? 2.2 : 1);
      this.camera.panByScreen((-dx / len) * speed * dt, (-dy / len) * speed * dt);
    }
  }
}
