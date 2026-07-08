import { createNodeBorderProgram } from "@sigma/node-border";
import { createNodeImageProgram } from "@sigma/node-image";
import { createNodeCompoundProgram } from "sigma/rendering";

/**
 * Compound icon + area-ring node program (D-09, RESEARCH Pattern 1).
 *
 * Sigma v3 has no built-in "ring around an image" node type: `@sigma/node-image`
 * renders the tech's WebP icon but its `color` option is a fill/tint fallback
 * only (no stroke); `@sigma/node-border` renders a stroke/ring but no image.
 * The two are combined into one registered node type via sigma core's
 * `createNodeCompoundProgram`, which is the documented pattern from sigma's
 * own storybook example for exactly this combination.
 *
 * Per-node attributes this compound program consumes (set by buildGraph.ts):
 * - `areaColor` — the 2-3px ring stroke color (bridged from --area-* tokens)
 * - `color`     — the image-background fallback (bridged from --color-bg)
 * - `image`     — the tech's WebP icon URL
 * - `label`     — the localized tech name (plain text, D-05)
 */
const NodeBorderRingProgram = createNodeBorderProgram({
  borders: [
    // Ring: ~3px stroke in the tech's area color (UI-SPEC Node Visual Spec).
    { size: { value: 3, mode: "pixels" }, color: { attribute: "areaColor" } },
    // Fill the remainder with the node's fallback background color.
    { size: { fill: true }, color: { attribute: "color" } },
  ],
});

const NodeImageIconProgram = createNodeImageProgram({
  padding: 0.05, // small inset so the ring stays visible around the icon
  objectFit: "contain", // never crop the pictogram (UI-SPEC Node Visual Spec)
  drawingMode: "background", // color is a fallback background, not a tint
});

export const NodeCompoundProgram = createNodeCompoundProgram([
  NodeBorderRingProgram,
  NodeImageIconProgram,
]);
