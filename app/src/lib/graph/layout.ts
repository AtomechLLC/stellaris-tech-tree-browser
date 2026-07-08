import type { DirectedGraph } from "graphology";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import { remapSwimlanes, type LaneGeometry } from "./swimlanes";

// Zero-config in-process ELK instance (RESEARCH Pattern 3 / Pitfall 4): no
// workerUrl/workerFactory. elk.bundled.js's fake-worker fallback runs the
// layout computation on the main JS thread while still returning a Promise
// (so `await` works unchanged) — this sidesteps the documented Vite +
// real-Web-Worker bundling failure class. Do NOT wire a real Worker here.
const elk = new ELK();

const TIER_NODE_WIDTH = 32;
const TIER_NODE_HEIGHT = 32;

function buildElkGraph(graph: DirectedGraph): ElkNode {
  const children: ElkNode[] = [];
  graph.forEachNode((key, attrs) => {
    children.push({
      id: key,
      width: TIER_NODE_WIDTH,
      height: TIER_NODE_HEIGHT,
      layoutOptions: {
        // Pins this node into its tier column (D-06) — requires the root's
        // `elk.partitioning.activate: "true"` below, or this is silently
        // ignored (RESEARCH Pattern 2 Gotcha).
        "elk.partitioning.partition": String(attrs.tier as number),
      },
    });
  });

  const edges: ElkExtendedEdge[] = [];
  let edgeIndex = 0;
  graph.forEachEdge((_edgeKey, _attrs, source, target) => {
    edges.push({
      id: `e${edgeIndex++}`,
      sources: [source],
      targets: [target],
    });
  });

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT", // tier 0 (left) -> tier 5 (right), per D-06
      "elk.partitioning.activate": "true",
      // GOTCHA discovered against the real 678-node/613-edge corpus (not
      // documented in Eclipse ELK's reference docs, found via benchmarking):
      // ELK's default `separateConnectedComponents: true` lays out each
      // disconnected connected-component of the graph independently and
      // then repacks them side by side — this REORDERS components and
      // silently breaks global tier-partition monotonicity (tier-0 nodes
      // ended up to the right of tier-5 nodes in one connected-component
      // group). The tech DAG has many disconnected components (leaf techs
      // with no shared ancestry), so this must be disabled to keep a single
      // global tier-column ordering across the whole graph.
      "elk.separateConnectedComponents": "false",
      // Disabling separateConnectedComponents makes ELK solve the full
      // 678-node graph as one layered-layout problem, which is far more
      // expensive than the (broken) default. `thoroughness` controls
      // crossing-minimization iteration count; benchmarked at the real
      // full-scale corpus: default (~7) ~= 26-32s, thoroughness=1 ~= 6.5s
      // with identical monotonic-partition correctness. Recorded in
      // 02-02-SUMMARY.md's D-08 benchmark.
      "elk.layered.thoroughness": "1",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.nodeNode": "40",
    },
    children,
    edges,
  };
}

/**
 * Computes the tech tree layout once (D-08): tier columns pinned by ELK's
 * partitioning feature (from the game's own `tier` field, not edge-inferred
 * — D-06), then a post-layout category-swimlane Y-remap (swimlanes.ts — ELK
 * has no native swim-lane mechanism for this axis). Writes final x/y back onto
 * the graphology graph's node attributes; Sigma renders these as fixed
 * coordinates and never re-invokes this function on pan/zoom.
 *
 * Returns the computed per-lane geometry (13 category lanes) so the lane axis
 * + background overlay (CategoryAxis) can project lane centers/extents; the
 * same geometry is also stashed module-side in swimlanes.ts (getLaneGeometry).
 *
 * Do NOT import graphology-layout / forceAtlas2 anywhere near this module —
 * it would overwrite ELK's computed x/y (RESEARCH Anti-Pattern).
 */
export async function layoutGraph(graph: DirectedGraph): Promise<LaneGeometry[]> {
  const elkGraph = buildElkGraph(graph);
  const result = await elk.layout(elkGraph);

  // x is authoritative from ELK (tier-partitioned); y is remapped into
  // fixed category lanes by remapSwimlanes, which also writes x through
  // unchanged onto the graphology graph and returns the lane geometry.
  return remapSwimlanes(graph, result as ElkNode);
}
