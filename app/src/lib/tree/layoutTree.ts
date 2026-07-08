import ELK from "elkjs/lib/elk.bundled.js";
import type {
  ElkNode,
  ElkExtendedEdge,
  ElkEdgeSection,
} from "elkjs/lib/elk.bundled.js";
import type { TechSnapshot, Tech } from "../../types/tech-snapshot";

/**
 * Zero-config in-process ELK instance (RESEARCH Pattern 3 / Pitfall 4): no
 * workerUrl/workerFactory. elk.bundled.js's fake-worker fallback runs the
 * layout computation on the main JS thread while still returning a Promise
 * (so `await` works unchanged) — this sidesteps the documented Vite +
 * real-Web-Worker bundling failure class. Do NOT wire a real Worker here.
 */
const elk = new ELK();

/**
 * A single positioned tech node in the computed layout. `(x, y)` is the
 * top-left corner in the shared canvas coordinate space (the same space the
 * `.tree-canvas` CSS transform operates in), so a `.tech-card` can be
 * positioned by `left:x; top:y` and an SVG edge drawn in the same units — no
 * projection, no per-frame sync.
 */
export interface LayoutNode {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tech: Tech;
}

/**
 * A single routed prerequisite edge. `sections` is ELK's orthogonal edge
 * routing (each section carries a startPoint, optional bendPoints, and an
 * endPoint) — the SVG edge layer draws elbow connectors directly from these
 * bend points. `sections` is empty only when ELK returned no routing (the
 * renderer then falls back to a straight source-right → target-left elbow).
 */
export interface LayoutEdge {
  from: string;
  to: string;
  sections: ElkEdgeSection[];
}

export interface TreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** Total layout extent (graph-space) — used to size `.tree-canvas`. */
  width: number;
  height: number;
}

/**
 * Builds the ELK graph directly from the tech snapshot: one ELK child per
 * tech (sized to the real card so ELK spaces cards without overlap and pins
 * each into its tier column via partitioning), one ELK edge per prerequisite
 * pair where BOTH techs exist (dangling guard mirrors buildGraph's D-16
 * contract check). Root options request the layered LR layout with orthogonal
 * edge routing so ELK returns elbow bend points for the connectors.
 */
function buildElkGraph(snapshot: TechSnapshot, cardW: number, cardH: number): ElkNode {
  const children: ElkNode[] = [];
  const techs = Object.values(snapshot.techs);

  for (const tech of techs) {
    children.push({
      id: tech.key,
      width: cardW,
      height: cardH,
      layoutOptions: {
        // Pins this node into its tier column — requires the root's
        // `elk.partitioning.activate: "true"` below, or it is silently
        // ignored (RESEARCH Pattern 2 Gotcha). Tier comes from the game's
        // own `tier` field (D-06), not edge-inferred.
        "elk.partitioning.partition": String(tech.tier),
      },
    });
  }

  const edges: ElkExtendedEdge[] = [];
  let edgeIndex = 0;
  for (const tech of techs) {
    for (const prereqKey of tech.prerequisites) {
      // D-07: every prerequisite is a real DAG edge (prereq -> dependent).
      // Guard against a dangling reference the same way buildGraph did — a
      // valid tech.json never hits this (SCHEMA.md D-16 strict-fail), so
      // surface loudly rather than silently emit a broken edge.
      if (snapshot.techs[prereqKey]) {
        edges.push({
          id: `e${edgeIndex++}`,
          sources: [prereqKey],
          targets: [tech.key],
        });
      } else {
        console.error(
          `layoutTree: dangling prerequisite reference "${prereqKey}" on tech "${tech.key}" — contract violation (SCHEMA.md D-16)`,
        );
      }
    }
  }

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT", // tier 0 (left) -> tier 5 (right), per D-06
      "elk.partitioning.activate": "true",
      // Disabling separate-connected-components keeps a single GLOBAL tier
      // ordering across the whole DAG (the tech graph has many disconnected
      // leaf components; the default repacks them side-by-side and breaks
      // global tier monotonicity). Carried over from the old layout.ts,
      // verified against the real 678-node/613-edge corpus.
      "elk.separateConnectedComponents": "false",
      // Perf tuning from the old layout.ts: solving the full graph as one
      // layered problem is expensive; thoroughness=1 keeps crossing-min
      // iterations low (~6.5s vs ~26-32s at default) with identical
      // partition correctness (02-02-SUMMARY D-08 benchmark).
      "elk.layered.thoroughness": "1",
      // Orthogonal routing so ELK returns elbow bend points for connectors —
      // the SVG edge layer draws reference-style elbows from these.
      "elk.edgeRouting": "ORTHOGONAL",
      // Generous spacing (cards are ~230x92) so tier columns are readable and
      // cards never overlap.
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "24",
    },
    children,
    edges,
  };
}

/**
 * Computes the full tech-tree layout once: ELK's layered LR layout pins tier
 * columns (from the game's `tier` field) and orthogonally routes every
 * prerequisite edge. Returns node top-left positions + card sizes + edge bend
 * points + the total extent, all in one shared coordinate space. The renderer
 * places DOM cards and draws SVG edges from this directly; pan/zoom is a
 * single CSS transform over that space, so this never re-runs on pan/zoom.
 *
 * `cardW`/`cardH` MUST match the rendered `.tech-card` size so positions line
 * up with the DOM cards exactly.
 */
export async function layoutTree(
  snapshot: TechSnapshot,
  cardW: number,
  cardH: number,
): Promise<TreeLayout> {
  const elkGraph = buildElkGraph(snapshot, cardW, cardH);
  const result = (await elk.layout(elkGraph)) as ElkNode;

  const nodes: LayoutNode[] = (result.children ?? []).map((child) => ({
    key: child.id,
    x: child.x ?? 0,
    y: child.y ?? 0,
    w: child.width ?? cardW,
    h: child.height ?? cardH,
    tech: snapshot.techs[child.id],
  }));

  const edges: LayoutEdge[] = (result.edges ?? []).map((edge) => ({
    from: edge.sources[0],
    to: edge.targets[0],
    sections: edge.sections ?? [],
  }));

  return {
    nodes,
    edges,
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
}
