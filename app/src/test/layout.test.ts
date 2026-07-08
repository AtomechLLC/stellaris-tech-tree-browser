import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TechSnapshot } from "../types/tech-snapshot";
import { buildGraph } from "../lib/graph/buildGraph";
// RED (Task 1): layoutGraph does not exist yet until Task 2 creates
// app/src/lib/graph/layout.ts — this import fails to resolve, which is the
// intended failing state until Task 2 completes.
import { layoutGraph } from "../lib/graph/layout";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadRealSnapshot(): TechSnapshot {
  // Reads the real, full-scale copied snapshot from disk (D-08: benchmark
  // against the real 678-node graph, not a sample). `pretest` runs
  // copy-data first so this fixture exists before the test runs.
  const path = join(__dirname, "..", "..", "public", "data", "v4.5.0", "tech.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as TechSnapshot;
}

describe("buildGraph: prerequisite edges (TREE-01 true DAG)", () => {
  it("adds all 613 prerequisite edges across the full 678-tech corpus", () => {
    const snapshot = loadRealSnapshot();
    const graph = buildGraph(snapshot);

    expect(graph.order).toBe(678);
    expect(graph.size).toBe(613);
  });

  it("connects a known multi-parent tech to ALL of its parents (not tree-flattened)", () => {
    const snapshot = loadRealSnapshot();
    const graph = buildGraph(snapshot);

    // tech_growth_chamber_1 has 5 prerequisites in the real v4.5.0 corpus —
    // the max fan-in multi-parent tech (verified against pipeline/data).
    const key = "tech_growth_chamber_1";
    const tech = snapshot.techs[key];
    expect(tech).toBeDefined();
    expect(tech.prerequisites.length).toBeGreaterThan(1);

    expect(graph.inDegree(key)).toBe(tech.prerequisites.length);
    for (const prereqKey of tech.prerequisites) {
      expect(graph.hasEdge(prereqKey, key)).toBe(true);
    }
  });
});

describe("layoutGraph: ELK tier-partition + area-band Y-remap (TREE-02)", () => {
  // ELK's layered layout at the real 678-node/613-edge scale takes several
  // seconds on the main thread (D-08 one-shot cost, benchmarked and recorded
  // in the plan SUMMARY) — well above vitest's default 5s test timeout, so
  // each layoutGraph-exercising test here is given explicit headroom.
  const LAYOUT_TEST_TIMEOUT = 20_000;

  it("places tier-0 nodes strictly left of tier-5 nodes (monotonic tier->x)", async () => {
    const snapshot = loadRealSnapshot();
    const graph = buildGraph(snapshot);

    await layoutGraph(graph);

    const tier0Key = Object.values(snapshot.techs).find((t) => t.tier === 0)?.key;
    const tier5Key = Object.values(snapshot.techs).find((t) => t.tier === 5)?.key;
    expect(tier0Key).toBeDefined();
    expect(tier5Key).toBeDefined();

    const tier0X = graph.getNodeAttribute(tier0Key!, "x") as number;
    const tier5X = graph.getNodeAttribute(tier5Key!, "x") as number;
    expect(tier0X).toBeLessThan(tier5X);

    // Full monotonicity: every node's x must be non-decreasing as tier
    // increases — compare min-x-per-tier across all six tiers.
    const minXByTier = new Map<number, number>();
    graph.forEachNode((_key, attrs) => {
      const tier = attrs.tier as number;
      const x = attrs.x as number;
      const current = minXByTier.get(tier);
      if (current === undefined || x < current) minXByTier.set(tier, x);
    });
    const maxXByTier = new Map<number, number>();
    graph.forEachNode((_key, attrs) => {
      const tier = attrs.tier as number;
      const x = attrs.x as number;
      const current = maxXByTier.get(tier);
      if (current === undefined || x > current) maxXByTier.set(tier, x);
    });
    for (let tier = 0; tier < 5; tier++) {
      expect(maxXByTier.get(tier)!).toBeLessThanOrEqual(minXByTier.get(tier + 1)!);
    }
  }, LAYOUT_TEST_TIMEOUT);

  it("groups nodes into three disjoint area bands (physics/society/engineering)", async () => {
    const snapshot = loadRealSnapshot();
    const graph = buildGraph(snapshot);

    await layoutGraph(graph);

    const yRangeByArea = new Map<string, { min: number; max: number }>();
    graph.forEachNode((_key, attrs) => {
      const area = attrs.area as string;
      const y = attrs.y as number;
      const range = yRangeByArea.get(area);
      if (!range) {
        yRangeByArea.set(area, { min: y, max: y });
      } else {
        range.min = Math.min(range.min, y);
        range.max = Math.max(range.max, y);
      }
    });

    expect(yRangeByArea.size).toBe(3);
    const ranges = [...yRangeByArea.entries()].sort((a, b) => a[1].min - b[1].min);

    // Each area's y-range must not overlap the next area's y-range.
    for (let i = 0; i < ranges.length - 1; i++) {
      const [, current] = ranges[i];
      const [, next] = ranges[i + 1];
      expect(current.max).toBeLessThanOrEqual(next.min);
    }
  }, LAYOUT_TEST_TIMEOUT);
});
