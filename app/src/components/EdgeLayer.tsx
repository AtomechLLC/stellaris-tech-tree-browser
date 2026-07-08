import { useMemo } from "react";
import type { LayoutEdge, LayoutNode } from "../lib/tree/layoutTree";

/**
 * SVG connector layer drawn inside `.tree-canvas` (so it pans/zooms with the
 * cards via the single parent CSS transform — no recompute on pan/zoom).
 * Sits BELOW the cards (lower z-index) and is `pointer-events:none`.
 *
 * Each edge is drawn as an orthogonal polyline from ELK's routing sections
 * (startPoint → bendPoints… → endPoint) → clean reference-style elbow
 * connectors. When an edge has no ELK routing, it falls back to an elbow from
 * the source card's right-center to the target card's left-center.
 */

interface EdgeLayerProps {
  edges: LayoutEdge[];
  nodes: LayoutNode[];
  width: number;
  height: number;
}

/** Builds an SVG path `d` string from a list of points as straight segments. */
function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return (
    `M ${first.x} ${first.y}` +
    rest.map((p) => ` L ${p.x} ${p.y}`).join("")
  );
}

/** Fallback elbow: source right-center → target left-center via a mid bend. */
function fallbackPath(from: LayoutNode, to: LayoutNode): string {
  const sx = from.x + from.w;
  const sy = from.y + from.h / 2;
  const tx = to.x;
  const ty = to.y + to.h / 2;
  const midX = (sx + tx) / 2;
  return pointsToPath([
    { x: sx, y: sy },
    { x: midX, y: sy },
    { x: midX, y: ty },
    { x: tx, y: ty },
  ]);
}

export function EdgeLayer({ edges, nodes, width, height }: EdgeLayerProps) {
  const paths = useMemo(() => {
    const nodeByKey = new Map(nodes.map((n) => [n.key, n]));
    const out: string[] = [];

    for (const edge of edges) {
      if (edge.sections.length > 0) {
        for (const section of edge.sections) {
          const points = [
            section.startPoint,
            ...(section.bendPoints ?? []),
            section.endPoint,
          ];
          out.push(pointsToPath(points));
        }
      } else {
        // No ELK routing — fall back to a straight elbow between the cards.
        const from = nodeByKey.get(edge.from);
        const to = nodeByKey.get(edge.to);
        if (from && to) out.push(fallbackPath(from, to));
      }
    }
    return out;
  }, [edges, nodes]);

  return (
    <svg
      className="edge-layer"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="presentation"
    >
      {paths.map((d, i) => (
        <path key={i} className="edge-layer__path" d={d} />
      ))}
    </svg>
  );
}
