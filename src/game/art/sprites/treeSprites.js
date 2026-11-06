// Hand-drawn trees. All are bottom-anchored: the last non-shadow rows are the trunk
// base, which sits at the bottom-centre of the tile. Sprites are taller than a tile
// so a dense forest naturally overlaps itself and looks lush.
//
// Pine legend:   o outline  1 dark  2 mid  3 light  4 highlight
// Trunk legend:  k dark  t mid  T light      s soft ground shadow

import { P } from "../palette.js";

export const pineLegend = {
  ".": null,
  o: P.pine.o,
  1: P.pine[1],
  2: P.pine[2],
  3: P.pine[3],
  4: P.pine[4],
  k: P.trunk.k,
  t: P.trunk.t,
  T: P.trunk.T,
  s: P.shadow,
};

// 16 x 24 : a tall three-tier pine. Light comes from the upper left.
export const PINE_ROWS = [
  "................",
  ".......oo.......",
  "......o43o......",
  ".....o4321o.....",
  ".....o3321o.....",
  "....o433221o....",
  "...o43322211o...",
  "..o4332222111o..",
  "..o1111111111o..",
  "....o433221o....",
  "...o43332211o...",
  "..o4333222211o..",
  ".o433332222111o.",
  ".o111111111111o.",
  "...o43332211o...",
  "..o4333222211o..",
  ".o433332222111o.",
  "o43333322222111o",
  "o11111111111111o",
  "......otko......",
  "......otko......",
  "......otko......",
  ".....ottkko.....",
  "...ssssssssss...",
];

// 16 x 16 : a young two-tier pine (forest edges, regrowth).
export const PINE_YOUNG_ROWS = [
  "................",
  ".......oo.......",
  "......o43o......",
  ".....o4321o.....",
  "....o433221o....",
  "...o43332211o...",
  "..o1111111111o..",
  "....o433221o....",
  "...o43332211o...",
  "..o4333222211o..",
  ".o433332222111o.",
  ".o111111111111o.",
  "......otko......",
  "......otko......",
  ".....ottkko.....",
  "...ssssssssss...",
];

export const oakLegend = (pal) => ({
  ".": null,
  o: pal.o,
  5: pal[5],
  6: pal[6],
  7: pal[7],
  8: pal[8],
  k: P.trunk.k,
  t: P.trunk.t,
  T: P.trunk.T,
  s: P.shadow,
});

// 16 x 20 : a broad, round oak with a clumpy canopy.
export const OAK_ROWS = [
  "................",
  ".....oooooo.....",
  "...oo877776oo...",
  "..o8877776666o..",
  ".o887777766665o.",
  "o88777677666665o",
  "o87777666766655o",
  "o77766666665555o",
  "o76666666555555o",
  "o66666655555555o",
  ".o566655555555o.",
  "..o5555555555o..",
  "....oooooooo....",
  ".....ottkko.....",
  ".....ottkko.....",
  ".....ottkko.....",
  "....otttkkko....",
  "...ottttkkkko...",
  "..ssssssssssss..",
  "................",
];

export const TREE_LEGENDS = {
  pine: pineLegend,
  oak: oakLegend(P.oak),
  autumn: oakLegend(P.autumn),
};

/** Row index of the first trunk row (rows above it sway). */
export const TREE_ROOT_ROW = {
  PINE: 19,
  PINE_YOUNG: 12,
  OAK: 13,
};
