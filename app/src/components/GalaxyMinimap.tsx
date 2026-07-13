import { useEffect, useRef } from "react";
import type { SavGalaxy } from "../lib/empire/savLoad";

/**
 * Galaxy minimap for the Saved Empire sidebar — shows where the selected
 * empire's territory sits in the galaxy (inspired by stellarmaps, which draws
 * full polygon borders; at minimap scale soft per-system tint blobs read the
 * same and cost nothing).
 *
 * One <canvas>, redrawn whenever the selected empire changes:
 *   - hyperlanes: very faint web (gives the galaxy its shape)
 *   - every system: dim dot
 *   - other empires' systems: soft per-owner-hue blobs (a low-key mosaic of
 *     every border, so the selected empire reads IN CONTEXT)
 *   - selected empire's systems: bright gold blobs + solid cores
 *
 * X is flipped (drawn as -x) to match the in-game galaxy map orientation —
 * the same convention stellarmaps uses (processSystemCoordinates.ts).
 */

/** Stable, well-separated hue per country id (golden-angle hop). */
function ownerHue(id: number): number {
  return (id * 137.508) % 360;
}

/**
 * Path a 4-point star: a diamond whose edges curve INWARD (astroid/sparkle).
 * Points sit at distance r on the axes; each edge is a quadratic curve whose
 * control point is pulled toward the center (q << r), bowing it in.
 * `longBottom` stretches the bottom point into one long spike (~1.9r) — the
 * ARC SHIP signature only; waystations stay symmetric. `outline` strokes the
 * shape in white — used for the selected empire only.
 */
function star4(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rotDeg = 0,
  outline = false,
  longBottom = false,
) {
  const q = r * 0.2;
  const bottom = longBottom ? r * 1.9 : r;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotDeg * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(q, -q, r, 0);
  ctx.quadraticCurveTo(q, q, 0, bottom);
  ctx.quadraticCurveTo(-q, q, -r, 0);
  ctx.quadraticCurveTo(-q, -q, 0, -r);
  ctx.closePath();
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw one nomad marker: waystation = small symmetric star; arc ship = the
 *  long-spiked star twice — second copy rotated 45° and slightly smaller. */
function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: "waystation" | "arcship",
  outline = false,
) {
  if (kind === "waystation") {
    star4(ctx, x, y, 3.5, 0, outline);
  } else {
    star4(ctx, x, y, 5.5, 0, outline, true);
    star4(ctx, x, y, 3.9, 45, outline, true);
  }
}

export function GalaxyMinimap({ galaxy, ownerId }: { galaxy: SavGalaxy; ownerId: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Defensive: a galaxy object from an older savLoad shape (e.g. held in state
  // across a hot reload) may lack `markers` — degrade to none, don't crash.
  const markers = galaxy.markers ?? [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssSize = canvas.clientWidth || 236;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(cssSize * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const select =
      getComputedStyle(document.documentElement).getPropertyValue("--color-select").trim() || "#ffd23f";

    // Fit the galaxy into the square with a small margin. Scale by the max
    // absolute coordinate so (0,0) — the galactic core — stays centered.
    let maxAbs = 1;
    for (const s of galaxy.systems) {
      maxAbs = Math.max(maxAbs, Math.abs(s.x), Math.abs(s.y));
    }
    const half = cssSize / 2;
    const scale = (half - 8) / maxAbs;
    // -x: in-game map orientation (stellarmaps flips the same way).
    const X = (s: { x: number }) => half + -s.x * scale;
    const Y = (s: { y: number }) => half + s.y * scale;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize, cssSize);

    // Hyperlane web — barely-there, just enough to shape the galaxy.
    ctx.strokeStyle = "rgba(148, 163, 184, 0.10)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const [a, b] of galaxy.lanes) {
      const sa = galaxy.systems[a];
      const sb = galaxy.systems[b];
      if (!sa || !sb) continue;
      ctx.moveTo(X(sa), Y(sa));
      ctx.lineTo(X(sb), Y(sb));
    }
    ctx.stroke();

    // Territory mosaic: every owned system gets a soft blob in its owner's
    // hue, EXCEPT the selected empire (drawn brighter, after, on top).
    for (const s of galaxy.systems) {
      if (s.ownerId === null || s.ownerId === ownerId) continue;
      ctx.fillStyle = `hsla(${ownerHue(s.ownerId)}, 60%, 55%, 0.16)`;
      ctx.beginPath();
      ctx.arc(X(s), Y(s), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // All systems: dim star-field dots.
    ctx.fillStyle = "rgba(203, 213, 225, 0.30)";
    for (const s of galaxy.systems) {
      ctx.fillRect(X(s) - 0.5, Y(s) - 0.5, 1, 1);
    }

    // Nomad markers, other empires: faded into the background exactly like
    // the territory mosaic — they only light up when their nomad is selected.
    for (const m of markers) {
      if (m.ownerId === ownerId) continue;
      ctx.fillStyle = `hsla(${ownerHue(m.ownerId)}, 60%, 55%, 0.16)`;
      drawMarker(ctx, X(m), Y(m), m.kind);
    }

    // Selected empire: gold glow blobs + solid cores, so it pops.
    if (ownerId !== null) {
      const mine = galaxy.systems.filter((s) => s.ownerId === ownerId);
      ctx.fillStyle = select;
      ctx.globalAlpha = 0.28;
      for (const s of mine) {
        ctx.beginPath();
        ctx.arc(X(s), Y(s), 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const s of mine) {
        ctx.beginPath();
        ctx.arc(X(s), Y(s), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Selected empire's nomad structures — full gold with a white outline,
      // drawn last (on top).
      for (const m of markers) {
        if (m.ownerId === ownerId) drawMarker(ctx, X(m), Y(m), m.kind, true);
      }
    }
  }, [galaxy, ownerId]);

  const ownedCount =
    ownerId === null ? 0 : galaxy.systems.reduce((n, s) => n + (s.ownerId === ownerId ? 1 : 0), 0);
  const wayCount = markers.reduce(
    (n, m) => n + (m.ownerId === ownerId && m.kind === "waystation" ? 1 : 0),
    0,
  );
  const arcCount = markers.reduce(
    (n, m) => n + (m.ownerId === ownerId && m.kind === "arcship" ? 1 : 0),
    0,
  );
  const parts: string[] = [];
  if (ownedCount > 0) parts.push(`${ownedCount} system${ownedCount === 1 ? "" : "s"}`);
  if (arcCount > 0) parts.push(`${arcCount} arc ship${arcCount === 1 ? "" : "s"}`);
  if (wayCount > 0) parts.push(`${wayCount} waystation${wayCount === 1 ? "" : "s"}`);

  return (
    <div className="empire-minimap">
      <canvas ref={canvasRef} className="empire-minimap__canvas" aria-label="Galaxy minimap" />
      <div className="empire-minimap__caption">
        {ownerId === null ? "Galaxy" : parts.length > 0 ? parts.join(" · ") : "No systems owned"}
      </div>
    </div>
  );
}
