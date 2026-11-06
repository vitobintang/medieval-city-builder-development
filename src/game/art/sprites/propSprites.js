// Hand-drawn 16x16 props: berry bush, stone deposits, stump.

import { P } from "../palette.js";

// ---------------------------------------------------------------- BERRY BUSH
// o outline  5/6/7/8 leaf dark->light  R berry  s shadow
export const bushLegend = (withBerries = true) => ({
  ".": null,
  o: P.oak.o,
  5: "#2a7433",
  6: "#3f9a3a",
  7: "#68bd43",
  8: "#9ddb5a",
  R: withBerries ? P.berry.R : "#3f9a3a",
  s: P.shadow,
});

export const BERRY_BUSH_ROWS = [
  "................",
  "................",
  "................",
  "....oooooooo....",
  "...o88777666o...",
  "..o8R7776R665o..",
  ".o877R7666R655o.",
  ".o77R766R66655o.",
  ".o7R66R666R655o.",
  ".o666666R65555o.",
  ".o666665555555o.",
  ".o555555555555o.",
  "..oooooooooooo..",
  "...ssssssssss...",
  "................",
  "................",
];

// ---------------------------------------------------------------- STONES
// o outline  k dark  m mid  l light  h highlight  g moss  s shadow
export const stoneLegend = {
  ".": null,
  o: P.stone.o,
  k: P.stone.k,
  m: P.stone.m,
  l: P.stone.l,
  h: P.stone.h,
  g: P.stone.g,
  G: P.stone.G,
  s: P.shadow,
};

// A big grey boulder: the quarry-able "stone deposit".
export const STONE_A_ROWS = [
  "................",
  "................",
  "................",
  "......oooooo....",
  "....oolhhhlmoo..",
  "...olhhhhllmmko.",
  "..olhhhllllmmkko",
  "..olhhllllmmmkko",
  ".oolllllmmmmkkko",
  ".olllllmmmmmkkko",
  ".ommmmmmmmmkkkko",
  ".okmmmmmmkkkkkko",
  "..ookkkkkkkkkoo.",
  "...sssssssssss..",
  "................",
  "................",
];

// Two smaller rocks: scattered loose boulders.
export const STONE_B_ROWS = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "...oooo.........",
  "..olhhhoo.......",
  ".olhhllmmo......",
  ".olhllmmmko.oooo",
  ".olllmmmmkoolhmo",
  ".ommmmmkkkoolmko",
  "..okkkkkkkokkkko",
  "...ooooooooooooo",
  "...ssssssssssss.",
  "................",
];

// ---------------------------------------------------------------- STUMP
export const stumpLegend = {
  ".": null,
  o: P.oak.o,
  k: P.trunk.k,
  t: P.trunk.t,
  T: P.trunk.T,
  s: P.shadow,
};

export const STUMP_ROWS = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "......oooooo....",
  ".....oTTttTTo...",
  ".....oTtkktTo...",
  ".....oTTttTTo...",
  "......ottkkto...",
  "......ottkkko...",
  ".....ssssssss...",
  "................",
];
