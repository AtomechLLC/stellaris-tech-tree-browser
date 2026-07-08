import { DirectedGraph } from "graphology";
import type { TechSnapshot } from "../../types/tech-snapshot";

/**
 * Builds a graphology DirectedGraph from the tech snapshot.
 *
 * Plan 02-02: adds every prerequisite relationship as a real directed edge
 * (prerequisite -> dependent, D-07) — 613 edges across the full 678-tech
 * corpus, with the 88 multi-parent techs connecting to ALL their parents
 * (true DAG, not tree-flattened). x/y are no longer assigned here — the
 * placeholder grid from Plan 02-01 is removed; layout.ts (ELK tier-partition
 * + area-band Y-remap) now owns node position and sets x/y before render.
 *
 * Node `label` is always plain text (`tech.name`) — never injected as HTML
 * (D-05 / T-02-01 mitigation).
 */
export function buildGraph(snapshot: TechSnapshot): DirectedGraph {
  const graph = new DirectedGraph();

  for (const tech of Object.values(snapshot.techs)) {
    graph.addNode(tech.key, {
      label: tech.name,
      tier: tech.tier,
      area: tech.area,
      image: tech.icon ? `/data/v4.5.0/icons/${tech.icon}` : undefined,
      size: 12,
      // x/y are owned by layout.ts (ELK layout, Plan 02-02 Task 2) — left
      // unset here; Sigma is only handed final coordinates after layoutGraph.
      x: 0,
      y: 0,
      color: "#F7F8FA",
    });
  }

  for (const tech of Object.values(snapshot.techs)) {
    for (const prereqKey of tech.prerequisites) {
      // D-07: every prerequisite is a real DAG edge, including OR-alternatives
      // (already flattened upstream by the pipeline per SCHEMA.md).
      if (graph.hasNode(prereqKey)) {
        graph.addEdge(prereqKey, tech.key);
      } else {
        // SCHEMA.md's D-16 strict-fail policy guarantees this never occurs
        // in a valid tech.json — surface loudly rather than silently skip,
        // since it signals a contract violation between pipeline and app.
        console.error(
          `buildGraph: dangling prerequisite reference "${prereqKey}" on tech "${tech.key}" — contract violation (SCHEMA.md D-16)`,
        );
      }
    }
  }

  return graph;
}
