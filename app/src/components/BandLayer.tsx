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

/**
 * A tiling SVG data-URI: the section name in 25%-opaque white, rotated 30°, used
 * as a repeating watermark behind the band. Inline data-URI (CSP-safe, no
 * external request); the text is plain (no user HTML). Tiled via
 * `background-repeat: repeat` on the band.
 */
function watermarkBg(label: string): string {
  const text = label.toUpperCase();
  const F = 72; // font size (large, per request)
  const L = 10; // letter spacing
  const charW = F * 0.66; // generous bold-uppercase advance estimate
  const textW = text.length * charW + Math.max(0, text.length - 1) * L;
  const rad = Math.PI / 6; // 30°
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Size the tile to the ROTATED text's bounding box (+margin) so the whole word
  // always fits — no clipping — and the tile tiles cleanly.
  const margin = F * 0.9;
  const w = Math.ceil(textW * cos + F * sin + margin * 2);
  const h = Math.ceil(textW * sin + F * cos + margin * 2);
  const cx = w / 2;
  const cy = h / 2;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
    `<text x='${cx}' y='${cy}' text-anchor='middle' dominant-baseline='central' ` +
    `transform='rotate(-30 ${cx} ${cy})' ` +
    `font-family='-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' ` +
    `font-size='${F}' font-weight='700' letter-spacing='${L}' ` +
    `fill='rgba(255,255,255,0.25)'>${text}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
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
            backgroundImage: watermarkBg(band.label),
          }}
        >
          {/* PLAIN TEXT category label (D-05) — never innerHTML. */}
          <span className="band__label">{band.label}</span>
        </div>
      ))}
    </div>
  );
});
