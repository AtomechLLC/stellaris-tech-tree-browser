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
  /** Edges for the dim base layer — may be viewport-CULLED for paint cost. */
  edges: LayoutEdge[];
  nodes: LayoutNode[];
  width: number;
  height: number;
  /** Currently selected tech key — its incident edges are drawn highlighted. */
  selectedKey?: string | null;
  /** FULL (uncalled) edge list for the selection highlight + ancestry chain —
   *  the prereq path must not break where the cull rect ends. Falls back to
   *  `edges` when omitted. */
  allEdges?: LayoutEdge[];
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
 * Obstacle-aware elbow: route source-right → target-left so the segment that
 * CROSSES intermediate columns runs at a Y with a clear row-gap, instead of
 * straight through the cards between the two. Because edges are drawn BEHIND the
 * cards, a straight run makes an edge appear to enter one card and exit the
 * next — reading as a connection to a card it only passes. Used for the
 * highlighted edges (the ones actually visible over the field).
 */
function routeAvoiding(from: LayoutNode, to: LayoutNode, nodes: LayoutNode[]): string {
  const sx = from.x + from.w;
  const syc = from.y + from.h / 2;
  const tx = to.x;
  const tyc = to.y + to.h / 2;
  const GUT = 24; // step into the column gutter on each side of the crossing

  // Backward / same-or-adjacent column with no room for a channel → simple elbow.
  const x1 = sx + GUT;
  const x2 = tx - GUT;
  if (x2 <= x1 + 1) return fallbackPath(from, to);

  // Cards whose x-span overlaps the crossing band [x1, x2] (excluding the two
  // endpoints) are the obstacles the horizontal run must clear.
  const blocks = nodes.filter(
    (n) => n !== from && n !== to && n.x < x2 && n.x + n.w > x1,
  );
  const clearAt = (y: number): boolean =>
    !blocks.some((n) => y >= n.y - 6 && y <= n.y + n.h + 6);

  // Prefer the target row, then the source row, then step outward from the
  // midpoint by a row pitch until a clear channel is found (else give up).
  const midY = (syc + tyc) / 2;
  const pitch = from.h + 24;
  const candidates: number[] = [tyc, syc, midY];
  for (let k = 1; k <= 8; k++) candidates.push(midY + k * pitch, midY - k * pitch);
  const y = candidates.find(clearAt) ?? tyc;

  return pointsToPath([
    { x: sx, y: syc },
    { x: x1, y: syc },
    { x: x1, y },
    { x: x2, y },
    { x: x2, y: tyc },
    { x: tx, y: tyc },
  ]);
}

/** The SVG `d` for a SINGLE edge — ELK routing if present, else an elbow. */
function edgePath(edge: LayoutEdge, nodeByKey: Map<string, LayoutNode>): string {
  if (edge.sections.length > 0) {
    return edge.sections
      .map((section) =>
        pointsToPath([
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ]),
      )
      .join(" ");
  }
  // No ELK routing — fall back to a straight elbow between the cards.
  const from = nodeByKey.get(edge.from);
  const to = nodeByKey.get(edge.to);
  return from && to ? fallbackPath(from, to) : "";
}

/**
 * Builds the combined SVG `d` for a set of edges (one <path> for all of them —
 * used by the dim base layer, where hundreds of edges must stay a single DOM
 * node for pan/zoom perf). NOTE: SVG `marker-end` only draws on the very last
 * vertex of a combined path, so this form CANNOT carry a per-edge arrowhead —
 * see `buildEdgePaths` for the highlighted, arrow-bearing edges.
 */
function buildPath(
  edges: LayoutEdge[],
  nodeByKey: Map<string, LayoutNode>,
): string {
  const out: string[] = [];
  for (const edge of edges) {
    const d = edgePath(edge, nodeByKey);
    if (d) out.push(d);
  }
  return out.join(" ");
}

/**
 * Builds ONE `d` string PER edge (keyed by from→to) so each can be rendered as
 * its own <path> with its own `marker-end`. This is what makes every
 * highlighted line show an arrowhead at its target — a single combined path
 * would only mark its final subpath. The highlight set is small (a node's
 * direct connections), so per-edge <path> elements cost nothing.
 */
function buildEdgePaths(
  edges: LayoutEdge[],
  nodeByKey: Map<string, LayoutNode>,
  nodes: LayoutNode[],
): { key: string; d: string }[] {
  const out: { key: string; d: string }[] = [];
  for (const edge of edges) {
    let d: string;
    if (edge.sections.length > 0) {
      d = edgePath(edge, nodeByKey);
    } else {
      // No ELK routing (the banded map) — route AROUND intervening cards so a
      // highlighted edge never appears to pass through a tech it doesn't use.
      const from = nodeByKey.get(edge.from);
      const to = nodeByKey.get(edge.to);
      d = from && to ? routeAvoiding(from, to, nodes) : "";
    }
    if (d) out.push({ key: `${edge.from}->${edge.to}`, d });
  }
  return out;
}

// Memoized: props (edges/nodes/width/height) are stable across pan/zoom, so the
// 613-path SVG bails out of re-rendering on every transform tick.
export const EdgeLayer = memo(function EdgeLayer({
  edges,
  nodes,
  width,
  height,
  selectedKey,
  allEdges,
}: EdgeLayerProps) {
  const nodeByKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes]);
  const highlightSource = allEdges ?? edges;

  // Perf: concatenate every edge into ONE path `d` string → a single <path> DOM
  // node instead of 613. The browser paints/composites one element far more
  // cheaply, which keeps pan/zoom smooth. All edges share one stroke style.
  // Memoized on [edges, nodes] only, so a selection change never rebuilds it.
  const d = useMemo(() => buildPath(edges, nodeByKey), [edges, nodeByKey]);

  // Highlight paths for the selected tech, three layers:
  //  • incoming — direct prereq → selected edges (bright gold, arrowhead)
  //  • outgoing — selected → dependent edges (bright gold, arrowhead)
  //  • ancestry — the REST of the recursive prerequisite chain back to the
  //    roots (dimmer gold), so "how do I reach this tech" reads at a glance,
  //    not just its immediate neighbors.
  // All drawn on top of the dim base path; rebuilt only on selection/layout.
  const { incoming, outgoing, ancestry } = useMemo(() => {
    if (!selectedKey) return { incoming: [], outgoing: [], ancestry: [] };
    // BFS backward over prereq edges (edge.from = prereq, edge.to = dependent).
    const byTo = new Map<string, LayoutEdge[]>();
    for (const e of highlightSource) {
      const arr = byTo.get(e.to);
      if (arr) arr.push(e);
      else byTo.set(e.to, [e]);
    }
    const chain: LayoutEdge[] = [];
    const seen = new Set<string>([selectedKey]);
    const queue = [selectedKey];
    while (queue.length > 0) {
      const k = queue.shift()!;
      for (const e of byTo.get(k) ?? []) {
        chain.push(e);
        if (!seen.has(e.from)) {
          seen.add(e.from);
          queue.push(e.from);
        }
      }
    }
    return {
      incoming: buildEdgePaths(
        chain.filter((e) => e.to === selectedKey),
        nodeByKey,
        nodes,
      ),
      outgoing: buildEdgePaths(
        highlightSource.filter((e) => e.from === selectedKey),
        nodeByKey,
        nodes,
      ),
      ancestry: buildEdgePaths(
        chain.filter((e) => e.to !== selectedKey),
        nodeByKey,
        nodes,
      ),
    };
  }, [highlightSource, nodeByKey, nodes, selectedKey]);

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
      </defs>
      {/* Dim base layer — every edge in ONE path for pan/zoom perf. No arrowhead:
          a combined path can only mark its final subpath, so directional arrows
          live on the per-edge highlight paths below instead. */}
      <path className="edge-layer__path" d={d} />
      {/* Deep prerequisite chain (dimmer gold, under the direct edges) — the
          full "path to reach this tech" back to its roots. */}
      {ancestry.map((e) => (
        <path
          key={`anc:${e.key}`}
          className="edge-layer__path--ancestry"
          d={e.d}
          markerEnd="url(#edge-arrow)"
        />
      ))}
      {/* Each highlighted edge is its OWN path so every one carries an arrowhead
          at its TARGET end — dependency flow reads on every line, both prereq →
          selected and selected → dependent (not just the last). */}
      {outgoing.map((e) => (
        <path
          key={`out:${e.key}`}
          className="edge-layer__path--highlight"
          d={e.d}
          markerEnd="url(#edge-arrow)"
        />
      ))}
      {incoming.map((e) => (
        <path
          key={`in:${e.key}`}
          className="edge-layer__path--highlight"
          d={e.d}
          markerEnd="url(#edge-arrow)"
        />
      ))}
    </svg>
  );
});
