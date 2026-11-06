// A* over the tile grid. Villagers use it to walk around woods, water and walls.
// The maps are small (160x160) and requests are rare (one per task), so a plain
// binary-heap A* is more than quick enough.

const SQRT2 = Math.SQRT2;
const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

class Heap {
  constructor() {
    this.items = [];
    this.prio = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, prio) {
    this.items.push(item);
    this.prio.push(prio);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prio[p] <= this.prio[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop() {
    const top = this.items[0];
    const lastI = this.items.pop();
    const lastP = this.prio.pop();
    if (this.items.length) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  swap(a, b) {
    const ti = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = ti;
    const tp = this.prio[a];
    this.prio[a] = this.prio[b];
    this.prio[b] = tp;
  }
}

/**
 * @returns {Array<{x:number,y:number}>|null} tile steps from start (exclusive)
 *          to goal (inclusive), or null when there is no route.
 */
export function findPath(world, sx, sy, gx, gy, { limit = 6000, canEnter = null } = {}) {
  if (!world.inBounds(gx, gy)) return null;
  const ok = canEnter || ((x, y) => world.walkable(x, y));
  if (!ok(gx, gy)) return null;
  if (sx === gx && sy === gy) return [];

  const W = world.width;
  const H = world.height;
  const gScore = new Float32Array(W * H).fill(Infinity);
  const cameFrom = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const start = sy * W + sx;
  const goal = gy * W + gx;
  const heur = (i) => {
    const dx = Math.abs((i % W) - gx);
    const dy = Math.abs(((i / W) | 0) - gy);
    return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
  };

  const open = new Heap();
  gScore[start] = 0;
  open.push(start, heur(start));
  let expanded = 0;

  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expanded > limit) return null;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    for (const [dx, dy, cost] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      if (!ok(nx, ny)) continue;
      // no slipping diagonally between two blocked tiles
      if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
      const g = gScore[cur] + cost;
      if (g < gScore[ni]) {
        gScore[ni] = g;
        cameFrom[ni] = cur;
        open.push(ni, g + heur(ni));
      }
    }
  }

  if (cameFrom[goal] < 0 && goal !== start) return null;
  const path = [];
  let node = goal;
  while (node !== start && node >= 0) {
    path.push({ x: node % W, y: (node / W) | 0 });
    node = cameFrom[node];
  }
  if (node !== start) return null;
  path.reverse();
  return path;
}
