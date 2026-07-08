import { createNodeImageProgram } from "@sigma/node-image";

/**
 * Compact SQUARE icon-tile node program — the zoomed-OUT LOD substrate
 * (Task 2 of quick 260707-we6). The rich reference-style HTML cards
 * (TechCardOverlay) take over when zoomed IN; this program is what the whole
 * tree reads as when scanned from far out, so it is intentionally small,
 * square, and framed in the tech's AREA color.
 *
 * Why a single image program (not the old image+border compound):
 * `@sigma/node-border` only draws a CIRCULAR stroke, which cannot frame a
 * square tile — so the circular ring is dropped here. `@sigma/node-image`'s
 * own `colorAttribute` background provides the area-colored frame instead:
 * with `drawingMode: "background"` the node's `areaColor` fills the tile and
 * the padded icon sits on top of it, reading as an icon on an area-colored
 * square.
 *
 * Per-node attributes consumed (set by buildGraph.ts):
 * - `areaColor` — the square frame/background color (bridged from --area-*)
 * - `image`     — the tech's WebP icon URL
 * - `label`     — the localized tech name (plain text, D-05)
 *
 * NOTE: `objectFit` is NOT a valid option in @sigma/node-image@3.0.0 (only
 * drawingMode/keepWithinCircle/padding/colorAttribute/imageAttribute exist) —
 * do not re-add it. Square rendering hinges on `keepWithinCircle: false`.
 */

/** Icon inset inside the tile — larger padding = thicker area-colored frame. */
const TILE_PADDING = 0.12;

export const NodeCompoundProgram = createNodeImageProgram({
  // Square tile instead of the default circular clip — the headline of Task 2.
  keepWithinCircle: false,
  // `areaColor` fills the tile as a background; the icon is drawn padded on top.
  drawingMode: "background",
  colorAttribute: "areaColor",
  padding: TILE_PADDING,
});
