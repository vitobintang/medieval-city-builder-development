# Hearthfell — a medieval pixel colony sim

A cozy, procedurally generated medieval valley where you stake out buildings and
watch settlers fell trees, quarry stone, farm and haul the goods home. Vanilla
JS game core (canvas 2D, no engine) mounted from a tiny React shell.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # single-file build in dist/
```

## Playing

| Input | Action |
| --- | --- |
| drag / WASD / arrows | pan the map |
| wheel, `Q`/`E`, `+`/`-` | zoom |
| `1`…`9`, `0` or the build menu | pick a building, then click the map to place it |
| `X` | demolish mode (click a building to dismantle it, half the materials come back) |
| `Esc` / right click | cancel build mode and clear the selection |
| click a villager / building | open them in the inspector |
| `G` · `H` · `N` | grid · recentre · new map |

Settlers arrive while there is housing, food to spare and a decent mood. Each
gathering building employs a fixed number of workers from the population, and any
leftovers pitch in as builders until the current site is finished.

**Buildings** — campfire (start), woodcutter's hut, quarry, forager's hut, wheat
field, cottage, lumber camp, storehouse, tavern, market, chapel. Gathering
buildings only harvest within their working radius (shown as a dotted ring while
placing), and felled trees / broken boulders grow back in time.

## Code map

```
src/game/
  art/            hand-drawn and procedural pixel art
    sprites/      terrain, trees, props, buildings, villagers (all pure Rasters)
    pixel.js      drawing helpers (rects, bevels, silhouettes)
  core/           camera, input, loop, rng, math
  world/          tile grid, world generation, building definitions
  sim/            village simulation: villagers, jobs, resources; A* pathing
  render/         chunk baking, renderer, minimap, clouds
  ui/             DOM heads-up display (resources, build menu, inspector, journal)
```

Everything in `art/` and `sim/` is DOM-free so it can be exercised from Node:

```bash
npm run art            # sprite validation + map/sprites PNGs in tools/out
npm run sim 1234 10    # run the village headlessly, writes tools/out/village.png
npm run sim 1234 10 -- --zoom   # close-up of the finished village
```
