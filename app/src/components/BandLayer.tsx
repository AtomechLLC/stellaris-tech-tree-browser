import { memo } from "react";
import type { BandGeometry } from "../lib/tree/layoutTree";

/**
 * Faint category-swimlane backgrounds, rendered as the FIRST child of
 * `.tree-canvas` so it pans/zooms with the cards via the single parent CSS
 * transform (no per-frame sync). Sits at `z-index:0` — BEHIND the edge layer
 * (z-index 1) and the cards (z-index 2) — and is `pointer-events:none` so it
 * never intercepts drags/hover.
 *
 * Each band draws an absolutely-positioned tinted rect spanning the full canvas
 * width at its `top`/`height`, plus a plain-text category label at its top-left.
 * `data-area` drives the tint + label color from the `--area-*` tokens (never a
 * hardcoded hex); `data-alt` alternates two tint strengths so adjacent bands of
 * the same area stay visually distinguishable.
 */

interface BandLayerProps {
  bands: BandGeometry[];
  /** Total canvas width (graph-space) — each band spans this fully. */
  width: number;
}

// Memoized: bands/width are stable across pan/zoom, so the band rects bail out
// of re-rendering on every imperative transform tick.
export const BandLayer = memo(function BandLayer({ bands, width }: BandLayerProps) {
  return (
    <div className="band-layer" aria-hidden="true">
      {bands.map((band, index) => (
        <div
          key={band.category}
          className="band"
          data-area={band.area}
          data-alt={index % 2}
          style={{
            top: `${band.top}px`,
            height: `${band.height}px`,
            width: `${width}px`,
          }}
        >
          {/* PLAIN TEXT category label (D-05) — never innerHTML. */}
          <span className="band__label">{band.label}</span>
        </div>
      ))}
    </div>
  );
});
