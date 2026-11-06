import { mulberry32 } from "../core/rng.js";

// Soft drifting cloud shadows: a small seamless (periodic) noise texture, drawn
// as a repeating pattern in world space and slowly scrolled by the wind.

export const CLOUD_TEXEL = 20; // world pixels per texture pixel
export const CLOUD_WIND = { x: 7, y: 2.5 }; // world px / second

export function makeCloudCanvas(seed = 7, size = 64) {
  const rand = mulberry32(seed);
  const octaves = [4, 8, 16];
  const lattices = octaves.map((n) => Float32Array.from({ length: n * n }, () => rand()));
  const sample = (lat, n, x, y) => {
    const fx = (x / size) * n;
    const fy = (y / size) * n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const g = (ix, iy) => lat[(((iy % n) + n) % n) * n + (((ix % n) + n) % n)];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };

  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = sample(lattices[0], 4, x, y) * 0.55 + sample(lattices[1], 8, x, y) * 0.3 + sample(lattices[2], 16, x, y) * 0.15;
      const a = Math.max(0, Math.min(1, (v - 0.52) * 4.5));
      const i = (y * size + x) * 4;
      img.data[i] = 8;
      img.data[i + 1] = 24;
      img.data[i + 2] = 48;
      img.data[i + 3] = a * 58;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
