// Global tunables for the game. Keep magic numbers here.

/** Size of one tile in sprite pixels (art is authored at 16x16). */
export const TILE = 16;

/** World size in tiles. */
export const MAP_W = 160;
export const MAP_H = 160;

/** Terrain is baked into chunks of CHUNK x CHUNK tiles. */
export const CHUNK = 16;

/** Allowed camera zoom levels (screen pixels per sprite pixel). Integers keep pixels crisp. */
export const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8];
export const DEFAULT_ZOOM = 3;

/** Water animation: seconds per frame and number of frames. */
export const WATER_FRAME_TIME = 0.45;
export const WATER_FRAMES = 4;

/** Camera feel. */
export const KEY_PAN_SPEED = 620; // css px / second
export const ZOOM_SMOOTHING = 16;

export const GAME_TITLE = "Hearthfell";
