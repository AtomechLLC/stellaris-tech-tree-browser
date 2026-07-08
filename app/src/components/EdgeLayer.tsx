import { memo, useMemo } from "react";
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
  /** Currently selected tech key — its incident edges are drawn highlighted. */
  selectedKey?: string | null;
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

/**
 * Builds the combined SVG `d` for a set of edges, reusing ELK routing when
 * present and falling back to a straight elbow otherwise. Shared by the dim
 * base path (all edges) and the highlight path (the selected node's edges) so
 * both use identical geometry.
 */
function buildPath(
  edges: LayoutEdge[],
  nodeByKey: Map<string, LayoutNode>,
): string {
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
  return out.join(" ");
}

// Memoized: props (edges/nodes/width/height) are stable across pan/zoom, so the
// 613-path SVG bails out of re-rendering on every transform tick.
export const EdgeLayer = memo(function EdgeLayer({
  edges,
  nodes,
  width,
  height,
  selectedKey,
}: EdgeLayerProps) {
  const nodeByKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes]);

  // Perf: concatenate every edge into ONE path `d` string → a single <path> DOM
  // node instead of 613. The browser paints/composites one element far more
  // cheaply, which keeps pan/zoom smooth. All edges share one stroke style.
  // Memoized on [edges, nodes] only, so a selection change never rebuilds it.
  const d = useMemo(() => buildPath(edges, nodeByKey), [edges, nodeByKey]);

  // Highlight path: only the selected tech's incident edges (its prerequisites,
  // where `to === selectedKey`, AND its children/leadsTo, where `from ===
  // selectedKey`). Drawn on top of the base path as a solid thick gold line.
  // Rebuilt only when the selection (or layout) changes — pan/zoom don't.
  const highlightD = useMemo(() => {
    if (!selectedKey) return "";
    const incident = edges.filter(
      (e) => e.from === selectedKey || e.to === selectedKey,
    );
    if (incident.length === 0) return "";
    return buildPath(incident, nodeByKey);
  }, [edges, nodeByKey, selectedKey]);

  return (
    <svg
      className="edge-layer"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="presentation"
    >
      <path className="edge-layer__path" d={d} />
      {highlightD && <path className="edge-layer__path--highlight" d={highlightD} />}
    </svg>
  );
});
