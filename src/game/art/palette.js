// The medieval colour palette. Every sprite legend pulls from here so the whole
// game shares one consistent, cozy, saturated-but-earthy look.

export const P = {
  // --- Grass in three tones (normal, lush/shaded, sunny/dry). a=highlight b=base c=tuft d=deep
  grassTones: [
    { a: "#8ccb4c", b: "#6fb540", c: "#5aa03a", d: "#468a34" },
    { a: "#80c44e", b: "#66ad40", c: "#52993a", d: "#3f8433" },
    { a: "#9dd152", b: "#80bd44", c: "#6aa83c", d: "#539235" },
  ],

  // --- Bare earth
  dirt: { e: "#b99363", f: "#a07a4c", g: "#86643d", h: "#6d4f31" },

  // --- Beach sand
  sand: { e: "#f6e7b6", f: "#e6cf93", g: "#d2b676", h: "#b89a5c" },

  // --- Water
  water: { base: "#3f93d6", dark: "#3079bf", light: "#69b8ee", spark: "#d9f3ff", foam: "#e8f8ff" },

  // --- Pine foliage + trunk
  pine: { o: "#12291c", 1: "#1f5c3b", 2: "#2e7d47", 3: "#43a052", 4: "#74c864" },
  trunk: { k: "#4a2c1a", t: "#6e4524", T: "#94622f" },

  // --- Oak foliage (summer + autumn)
  oak: { o: "#1c3b1d", 5: "#2d7a35", 6: "#44993a", 7: "#6fbb41", 8: "#a2dc5c" },
  autumn: { o: "#4a1f14", 5: "#a8402a", 6: "#cf6a2a", 7: "#eb9a32", 8: "#f7cd55" },

  // --- Berry bush
  berry: { R: "#d62839", r: "#8f1d2c", p: "#ff7a88" },

  // --- Stone
  stone: { o: "#2b2f38", k: "#5a606d", m: "#868d9a", l: "#aab1bd", h: "#d3d9e2", g: "#5f8f45", G: "#86b858" },

  // --- Soft ground shadow
  shadow: "#0b1a1038",

  // --- Flowers / small decor
  flower: {
    white: "#f7f3e8",
    yellow: "#f9d949",
    pink: "#ee79a8",
    blue: "#7a96f2",
    center: "#f4a823",
    stem: "#3e8a35",
  },
  mushroom: { cap: "#d8352f", dot: "#fff3e0", stem: "#efe6cf" },
};
