import { DirectedGraph } from "graphology";
import type { TechSnapshot } from "../../types/tech-snapshot";
import { readThemeTokens, AREA_COLOR, type ThemeTokens } from "../sigma/theme";

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
 * Plan 02-03: each node also carries `areaColor` (the compound border
 * program's ring color, D-09) and a `color` fallback (image-background
 * fallback, D-12) — both sourced from the bridged CSS tokens, never a
 * hardcoded hex. `tokens` is an OPTIONAL param so existing call sites
 * (`buildGraph(snapshot)` from Plans 01/02) keep compiling unchanged; when
 * omitted, `readThemeTokens()` is only invoked lazily AND only when
 * `document` exists, so this function never touches getComputedStyle in a
 * headless vitest run (layout.test.ts/smoke.test.ts pass no tokens and run
 * in a DOM-less "node" test environment).
 *
 * Node `label` is always plain text (`tech.name`) — never injected as HTML
 * (D-05 / T-02-01 mitigation).
 */
export function buildGraph(snapshot: TechSnapshot, tokens?: ThemeTokens): DirectedGraph {
  const graph = new DirectedGraph();

  const resolvedTokens: ThemeTokens | undefined =
    tokens ?? (typeof document !== "undefined" ? readThemeTokens() : undefined);
  const areaColor = resolvedTokens ? AREA_COLOR(resolvedTokens) : undefined;
  const fallbackBg = resolvedTokens?.bg;

  // Derive the icon base path from the snapshot's OWN version (WR-02) so a
  // future game-patch snapshot needs no edit here — matches the parameterized
  // fetch and copy-data's dynamic version resolution (the project's
  // cheap-version-update goal). meta.gameVersion (e.g. "v4.5.0") equals the
  // data directory name copy-data.mjs writes under public/data/.
  const iconBase = `/data/${snapshot.meta.gameVersion}/icons`;

  for (const tech of Object.values(snapshot.techs)) {
    graph.addNode(tech.key, {
      label: tech.name,
      tier: tech.tier,
      area: tech.area,
      // Every tech has exactly one category (all category[] are length 1 in
      // the v4.5.0 corpus) — carried onto the node so swimlanes.ts can group
      // by category lane and TechCardOverlay can render the `Category – Tier`
      // line without re-reading the snapshot. Empty-string fallback keeps the
      // attribute a defined string even for a hypothetical categoryless tech.
      category: tech.category[0] ?? "",
      // Extra fields consumed by the zoom-in HTML card overlay (Task 3).
      name: tech.name,
      cost: tech.cost,
      weight: tech.weight,
      image: tech.icon ? `${iconBase}/${tech.icon}` : undefined,
      // Compact square tile size for the zoomed-out overview (Task 2). Bumped
      // slightly from the old 12 so the framed icon reads at overview zoom.
      size: 14,
      // x/y are owned by layout.ts (ELK layout, Plan 02-02 Task 2) — left
      // unset here; Sigma is only handed final coordinates after layoutGraph.
      x: 0,
      y: 0,
      // Image-background fallback color (D-12) — bridged from --color-bg,
      // not hardcoded. Undefined in a headless/no-tokens context (tests that
      // don't exercise the compound node program don't need this attribute).
      color: fallbackBg,
      // Area ring color consumed by the compound border program (Task 2,
      // D-09) — bridged from --area-physics/society/engineering via the
      // theme bridge (Pattern 4), never a literal.
      areaColor: areaColor ? areaColor[tech.area] : undefined,
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
