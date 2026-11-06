// Browser-side atlas: converts the pure Raster sprites into <canvas> elements
// that can be drawn quickly with drawImage.

import { Raster } from "./raster.js";
import { buildRasterAtlas } from "./rasterAtlas.js";

export function rasterToCanvas(r) {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  const ctx = c.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
  return c;
}

function convert(node) {
  if (node instanceof Raster) return rasterToCanvas(node);
  if (Array.isArray(node)) return node.map(convert);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = convert(v);
    return out;
  }
  return node;
}

/** Build everything once at startup. Returns both the raster and canvas forms. */
export function buildAtlas() {
  const rasters = buildRasterAtlas();
  return { rasters, canvases: convert(rasters) };
}
