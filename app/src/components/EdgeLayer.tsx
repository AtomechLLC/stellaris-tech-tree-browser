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

  // Highlight paths for the selected tech's incident edges, split by direction so
  // only the INCOMING ones (a dependency → the selected tech, `to === selectedKey`)
  // carry an arrowhead pointing at the selected tech. Outgoing edges (selected →
  // its dependents) are highlighted the same gold but without a head. Both drawn
  // on top of the dim base path. Rebuilt only when selection/layout changes.
  const { incomingD, outgoingD } = useMemo(() => {
    if (!selectedKey) return { incomingD: "", outgoingD: "" };
    const incoming = edges.filter((e) => e.to === selectedKey);
    const outgoing = edges.filter((e) => e.from === selectedKey);
    return {
      incomingD: incoming.length ? buildPath(incoming, nodeByKey) : "",
      outgoingD: outgoing.length ? buildPath(outgoing, nodeByKey) : "",
    };
  }, [edges, nodeByKey, selectedKey]);

  return (
    <svg
      className="edge-layer"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="presentation"
    >
      <defs>
        {/* Arrowhead for the selected tech's incoming dependency edges. Sized in
            stroke-width units (default markerUnits) so it scales with the line. */}
        <marker
          id="edge-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <path className="edge-layer__arrowhead" d="M0 0 L10 5 L0 10 Z" />
        </marker>
        {/* Dimmer arrowhead for every (unselected) dependency line — a small
            triangle right where the line meets the target card. */}
        <marker
          id="edge-arrow-base"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path className="edge-layer__arrowhead--base" d="M0 0 L10 5 L0 10 Z" />
        </marker>
      </defs>
      <path className="edge-layer__path" d={d} markerEnd="url(#edge-arrow-base)" />
      {/* Both directions get an arrowhead at the TARGET end, so every selected
          line shows dependency flow: prereq → selected, and selected → dependent. */}
      {outgoingD && (
        <path
          className="edge-layer__path--highlight"
          d={outgoingD}
          markerEnd="url(#edge-arrow)"
        />
      )}
      {incomingD && (
        <path
          className="edge-layer__path--highlight"
          d={incomingD}
          markerEnd="url(#edge-arrow)"
        />
      )}
    </svg>
  );
});
