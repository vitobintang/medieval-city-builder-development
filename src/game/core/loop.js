/**
 * Classic fixed-timestep game loop.
 *  - `update(step)` runs at a steady rate (the simulation: villagers, seasons, production...)
 *  - `frame(dt, time)` runs once per display frame (camera, input, rendering).
 */
export class GameLoop {
  constructor({ update = () => {}, frame = () => {}, step = 1 / 20 } = {}) {
    this.update = update;
    this.frame = frame;
    this.step = step;
    this.running = false;
    this.acc = 0;
    this.time = 0;
    this.last = 0;
    this.raf = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  tick(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25; // tab was hidden; don't spiral
    this.time += dt;
    this.acc += dt;
    while (this.acc >= this.step) {
      this.update(this.step);
      this.acc -= this.step;
    }
    this.frame(dt, this.time);
    this.raf = requestAnimationFrame(this.tick);
  }
}
