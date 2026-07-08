import { DirectedGraph } from "graphology";
import type { TechSnapshot } from "../../types/tech-snapshot";

/**
 * Builds a graphology DirectedGraph from the tech snapshot.
 *
 * This plan (02-01) places nodes on a deterministic placeholder grid only —
 * there is no ELK layout yet. Real tier-column + area-band layout is Plan
 * 02-02. Prerequisite edges are intentionally NOT added yet either (also
 * Plan 02-02's scope) — this slice proves full-scale node rendering + pan/
 * zoom, not the final DAG structure.
 *
 * Node `label` is always plain text (`tech.name`) — never injected as HTML
 * (D-05 / T-02-01 mitigation).
 */
export function buildGraph(snapshot: TechSnapshot): DirectedGraph {
  const graph = new DirectedGraph();

  // Track how many nodes have been placed in each tier so far, to space
  // siblings out vertically. PLACEHOLDER GRID — replaced by ELK layout in
  // Plan 02.
  const tierCounts = new Map<number, number>();

  const TIER_COLUMN_WIDTH = 300;
  const SIBLING_ROW_HEIGHT = 40;

  for (const tech of Object.values(snapshot.techs)) {
    const indexInTier = tierCounts.get(tech.tier) ?? 0;
    tierCounts.set(tech.tier, indexInTier + 1);

    graph.addNode(tech.key, {
      label: tech.name,
      tier: tech.tier,
      area: tech.area,
      image: tech.icon ? `/data/v4.5.0/icons/${tech.icon}` : undefined,
      size: 12,
      x: tech.tier * TIER_COLUMN_WIDTH,
      y: indexInTier * SIBLING_ROW_HEIGHT,
      color: "#F7F8FA",
    });
  }

  return graph;
}
