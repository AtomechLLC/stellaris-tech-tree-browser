import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TechSnapshot } from "../types/tech-snapshot";
import { layoutTree } from "../lib/tree/layoutTree";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Card size handed to ELK — must match the rendered `.tech-card`.
const CARD_W = 230;
const CARD_H = 92;

function loadRealSnapshot(): TechSnapshot {
  // Reads the real, full-scale copied snapshot from disk (D-08: benchmark
  // against the real 678-node graph, not a sample). `pretest` runs
  // copy-data first so this fixture exists before the test runs.
  const path = join(__dirname, "..", "..", "public", "data", "v4.5.0", "tech.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as TechSnapshot;
}

describe("layoutTree: ELK tier-partitioned LR layout + orthogonal edge routing", () => {
  // ELK's layered layout at the real 678-node/613-edge scale takes several
  // seconds on the main thread (D-08 one-shot cost) — well above vitest's
  // default 5s timeout, so each layoutTree-exercising test gets headroom.
  const LAYOUT_TEST_TIMEOUT = 30_000;

  it("positions every tech (node count == tech count)", async () => {
    const snapshot = loadRealSnapshot();
    const techCount = Object.keys(snapshot.techs).length;

    const layout = await layoutTree(snapshot, CARD_W, CARD_H);

    expect(layout.nodes.length).toBe(techCount);
    // Every node carries a real tech + card size and a finite position.
    for (const node of layout.nodes) {
      expect(node.tech).toBeDefined();
      expect(node.tech.key).toBe(node.key);
      expect(node.w).toBe(CARD_W);
      expect(node.h).toBe(CARD_H);
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  }, LAYOUT_TEST_TIMEOUT);

  it("orders x by tier (tier 0 leftmost, monotonic tier->x)", async () => {
    const snapshot = loadRealSnapshot();

    const layout = await layoutTree(snapshot, CARD_W, CARD_H);

    const tierOf = new Map(layout.nodes.map((n) => [n.key, n.tech.tier]));
    // Compare min/max x per tier: every tier's rightmost card sits left of
    // (or level with) the next tier's leftmost card — global tier columns.
    const minXByTier = new Map<number, number>();
    const maxXByTier = new Map<number, number>();
    for (const node of layout.nodes) {
      const tier = tierOf.get(node.key)!;
      const curMin = minXByTier.get(tier);
      if (curMin === undefined || node.x < curMin) minXByTier.set(tier, node.x);
      const curMax = maxXByTier.get(tier);
      if (curMax === undefined || node.x > curMax) maxXByTier.set(tier, node.x);
    }
    for (let tier = 0; tier < 5; tier++) {
      if (minXByTier.has(tier + 1)) {
        expect(maxXByTier.get(tier)!).toBeLessThanOrEqual(minXByTier.get(tier + 1)!);
      }
    }
  }, LAYOUT_TEST_TIMEOUT);

  it("routes edges only between existing techs (no dangling references)", async () => {
    const snapshot = loadRealSnapshot();

    const layout = await layoutTree(snapshot, CARD_W, CARD_H);

    // 613 prerequisite edges across the full corpus (all endpoints exist).
    expect(layout.edges.length).toBe(613);
    const keys = new Set(layout.nodes.map((n) => n.key));
    for (const edge of layout.edges) {
      expect(keys.has(edge.from)).toBe(true);
      expect(keys.has(edge.to)).toBe(true);
    }
  }, LAYOUT_TEST_TIMEOUT);

  it("returns orthogonal edge routing (bend points) for connectors", async () => {
    const snapshot = loadRealSnapshot();

    const layout = await layoutTree(snapshot, CARD_W, CARD_H);

    // At least some edges must carry ELK routing sections with start/end
    // points — the SVG layer draws elbow connectors from these.
    const withSections = layout.edges.filter((e) => e.sections.length > 0);
    expect(withSections.length).toBeGreaterThan(0);
    const section = withSections[0].sections[0];
    expect(Number.isFinite(section.startPoint.x)).toBe(true);
    expect(Number.isFinite(section.startPoint.y)).toBe(true);
    expect(Number.isFinite(section.endPoint.x)).toBe(true);
    expect(Number.isFinite(section.endPoint.y)).toBe(true);
  }, LAYOUT_TEST_TIMEOUT);
});
