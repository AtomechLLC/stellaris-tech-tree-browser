import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TechSnapshot } from "../types/tech-snapshot";
import { buildGraph } from "../lib/graph/buildGraph";
import { layoutGraph } from "../lib/graph/layout";
import { CATEGORY_AREA, CATEGORY_ORDER, type CategoryKey } from "../lib/graph/categories";

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

describe("layoutGraph: ELK tier-partition + category-swimlane Y-remap (TREE-02)", () => {
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

  it("preserves area order (all physics.y < all society.y < all engineering.y)", async () => {
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

    // Area order is authoritative: physics on top, then society, then
    // engineering — every node in an earlier area sits strictly above every
    // node in a later area.
    const order = ["physics", "society", "engineering"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      const current = yRangeByArea.get(order[i])!;
      const next = yRangeByArea.get(order[i + 1])!;
      expect(current.max).toBeLessThanOrEqual(next.min);
    }
  }, LAYOUT_TEST_TIMEOUT);

  it("groups every node into its 13-category swimlane, lanes non-overlapping in y", async () => {
    const snapshot = loadRealSnapshot();
    const graph = buildGraph(snapshot);

    const geometry = await layoutGraph(graph);

    // Lane geometry covers all 13 categories in CATEGORY_ORDER.
    expect(geometry.map((g) => g.category)).toEqual([...CATEGORY_ORDER]);

    // Lanes are non-overlapping and monotonically stacked downward.
    for (let i = 0; i < geometry.length - 1; i++) {
      const current = geometry[i];
      const next = geometry[i + 1];
      expect(current.top + current.height).toBeLessThanOrEqual(next.top);
    }

    // Every node's y lands within its own category lane's [top, top+height].
    const laneByCategory = new Map(geometry.map((g) => [g.category, g]));
    graph.forEachNode((_key, attrs) => {
      const category = attrs.category as CategoryKey;
      const y = attrs.y as number;
      const lane = laneByCategory.get(category);
      expect(lane).toBeDefined();
      expect(y).toBeGreaterThanOrEqual(lane!.top);
      expect(y).toBeLessThanOrEqual(lane!.top + lane!.height);
    });

    // Each lane's parent area matches CATEGORY_AREA (nesting is correct).
    for (const lane of geometry) {
      expect(lane.area).toBe(CATEGORY_AREA[lane.category]);
    }
  }, LAYOUT_TEST_TIMEOUT);

  it("keeps x equal to ELK's tier-partitioned x (swimlane touches only y)", async () => {
    const snapshot = loadRealSnapshot();
    const graph = buildGraph(snapshot);

    await layoutGraph(graph);

    // Monotonic tier→x still holds after the y-only swimlane remap.
    const minXByTier = new Map<number, number>();
    const maxXByTier = new Map<number, number>();
    graph.forEachNode((_key, attrs) => {
      const tier = attrs.tier as number;
      const x = attrs.x as number;
      const curMin = minXByTier.get(tier);
      if (curMin === undefined || x < curMin) minXByTier.set(tier, x);
      const curMax = maxXByTier.get(tier);
      if (curMax === undefined || x > curMax) maxXByTier.set(tier, x);
    });
    for (let tier = 0; tier < 5; tier++) {
      if (minXByTier.has(tier + 1)) {
        expect(maxXByTier.get(tier)!).toBeLessThanOrEqual(minXByTier.get(tier + 1)!);
      }
    }
  }, LAYOUT_TEST_TIMEOUT);
});
