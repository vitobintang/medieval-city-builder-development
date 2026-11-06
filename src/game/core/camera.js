import { ZOOM_LEVELS, DEFAULT_ZOOM, ZOOM_SMOOTHING, TILE } from "../config.js";
import { clamp } from "./math.js";

/**
 * Pan & zoom camera. Position is the world-pixel point at the centre of the screen.
 * Zoom is css-pixels per sprite-pixel and eases toward integer "stops" so art stays crisp.
 * All screen coordinates here are CSS pixels (not device pixels).
 */
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = DEFAULT_ZOOM;
    this.targetZoom = DEFAULT_ZOOM;
    this.viewW = 800;
    this.viewH = 600;
    this.anchor = null; // screen point that stays fixed while zooming
    this.vx = 0; // inertia (css px/s)
    this.vy = 0;
    this.bounds = { w: 1, h: 1 };
  }

  setBounds(tilesW, tilesH) {
    this.bounds = { w: tilesW * TILE, h: tilesH * TILE };
  }

  resize(w, h) {
    this.viewW = w;
    this.viewH = h;
  }

  centerOnTile(tx, ty) {
    this.x = (tx + 0.5) * TILE;
    this.y = (ty + 0.5) * TILE;
    this.clampPosition();
  }

  screenToWorld(sx, sy) {
    return {
      x: this.x + (sx - this.viewW / 2) / this.zoom,
      y: this.y + (sy - this.viewH / 2) / this.zoom,
    };
  }

  screenToTile(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  }

  /** Top-left world coordinate of the viewport. */
  get left() {
    return this.x - this.viewW / 2 / this.zoom;
  }
  get top() {
    return this.y - this.viewH / 2 / this.zoom;
  }

  /** Move by a screen-space delta (drag). */
  panByScreen(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clampPosition();
  }

  /** Step the zoom stop in/out (dir = +1 in, -1 out), anchored at a screen point. */
  zoomStep(dir, sx, sy) {
    const idx = ZOOM_LEVELS.findIndex((z) => z >= this.targetZoom - 1e-6);
    const cur = idx < 0 ? ZOOM_LEVELS.length - 1 : idx;
    const next = clamp(cur + dir, 0, ZOOM_LEVELS.length - 1);
    this.targetZoom = ZOOM_LEVELS[next];
    this.anchor = { x: sx ?? this.viewW / 2, y: sy ?? this.viewH / 2 };
  }

  /** Continuous zoom used by pinch gestures. */
  zoomBy(factor, sx, sy) {
    const z = clamp(this.zoom * factor, ZOOM_LEVELS[0], ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
    this.anchor = { x: sx, y: sy };
    this.setZoomAnchored(z);
    this.targetZoom = z;
  }

  setZoomAnchored(z) {
    const a = this.anchor || { x: this.viewW / 2, y: this.viewH / 2 };
    const before = this.screenToWorld(a.x, a.y);
    this.zoom = z;
    this.x = before.x - (a.x - this.viewW / 2) / this.zoom;
    this.y = before.y - (a.y - this.viewH / 2) / this.zoom;
  }

  /** Snap a pinch-zoomed value to the nearest crisp stop. */
  snapZoom() {
    let best = ZOOM_LEVELS[0];
    for (const z of ZOOM_LEVELS) if (Math.abs(z - this.zoom) < Math.abs(best - this.zoom)) best = z;
    this.targetZoom = best;
  }

  update(dt) {
    if (this.zoom !== this.targetZoom) {
      const k = 1 - Math.exp(-dt * ZOOM_SMOOTHING);
      let z = this.zoom + (this.targetZoom - this.zoom) * k;
      if (Math.abs(z - this.targetZoom) < 0.01) z = this.targetZoom;
      this.setZoomAnchored(z);
    }
    if (Math.abs(this.vx) > 4 || Math.abs(this.vy) > 4) {
      this.panByScreen(this.vx * dt, this.vy * dt);
      const decay = Math.exp(-dt * 6);
      this.vx *= decay;
      this.vy *= decay;
    } else {
      this.vx = this.vy = 0;
    }
    this.clampPosition();
  }

  clampPosition() {
    this.x = clamp(this.x, 0, this.bounds.w);
    this.y = clamp(this.y, 0, this.bounds.h);
  }
}
