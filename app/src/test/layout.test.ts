import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TechSnapshot, Tech } from "../types/tech-snapshot";
import { layoutTree } from "../lib/tree/layoutTree";
import { CATEGORY_ORDER, CATEGORY_AREA } from "../lib/graph/categories";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Card size handed to ELK — must match the rendered `.tech-card`.
const CARD_W = 230;
const CARD_H = 92;
// Tier column width in the banded remap: `cardW + COL_EXTRA` (COL_EXTRA=110).
const COL_W = CARD_W + 110;

function loadRealSnapshot(): TechSnapshot {
  // Reads the real, full-scale copied snapshot from disk (D-08: benchmark
  // against the real 678-node graph, not a sample). `pretest` runs
  // copy-data first so this fixture exists before the test runs.
  const path = join(__dirname, "..", "..", "public", "data", "v4.5.0", "tech.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as TechSnapshot;
}

const categoryOf = (t: Tech): string => t.category[0] ?? "";

describe("layoutTree: category swimlane bands + tier-aligned columns", () => {
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

  it("aligns x to tier columns (x === tier * COL_W)", async () => {
    const snapshot = loadRealSnapshot();

    const layout = await layoutTree(snapshot, CARD_W, CARD_H);

    for (const node of layout.nodes) {
      expect(node.x).toBe(node.tech.tier * COL_W);
    }
    // Width spans all six tier columns.
    expect(layout.width).toBe(6 * COL_W);
  }, LAYOUT_TEST_TIMEOUT);

  it("groups each category into a contiguous, non-overlapping y-band", async () => {
    const snapshot = loadRealSnapshot();

    const layout = await layoutTree(snapshot, CARD_W, CARD_H);

    // One band per non-empty category.
    const nonEmptyCats = new Set(layout.nodes.map((n) => categoryOf(n.tech)));
    expect(layout.bands.length).toBe(nonEmptyCats.size);

    // Bands stack in CATEGORY_ORDER, never overlap, and each band's y-range
    // wholly contains all of its category's card rows.
    const orderIndex = new Map(CATEGORY_ORDER.map((c, i) => [c, i] as const));
    for (let i = 1; i < layout.bands.length; i++) {
      const prev = layout.bands[i - 1];
      const band = layout.bands[i];
      // CATEGORY_ORDER preserved (area order: physics → society → engineering).
      expect(orderIndex.get(prev.category as never)!).toBeLessThan(
        orderIndex.get(band.category as never)!,
      );
      // Non-overlapping and monotonically increasing top.
      expect(band.top).toBeGreaterThanOrEqual(prev.top + prev.height);
      // Band carries its area + a plain-text label.
      expect(band.area).toBe(CATEGORY_AREA[band.category as never]);
      expect(band.label.length).toBeGreaterThan(0);
    }

    // Every node sits within its own category's band (contiguous grouping).
    const bandByCat = new Map(layout.bands.map((b) => [b.category, b] as const));
    for (const node of layout.nodes) {
      const band = bandByCat.get(categoryOf(node.tech))!;
      expect(band).toBeDefined();
      expect(node.y).toBeGreaterThanOrEqual(band.top);
      expect(node.y + node.h).toBeLessThanOrEqual(band.top + band.height);
    }
  }, LAYOUT_TEST_TIMEOUT);

  it("preserves area order (physics bands above society above engineering)", async () => {
    const snapshot = loadRealSnapshot();

    const layout = await layoutTree(snapshot, CARD_W, CARD_H);

    const areaRank: Record<string, number> = {
      physics: 0,
      society: 1,
      engineering: 2,
    };
    for (let i = 1; i < layout.bands.length; i++) {
      expect(areaRank[layout.bands[i].area]).toBeGreaterThanOrEqual(
        areaRank[layout.bands[i - 1].area],
      );
    }
  }, LAYOUT_TEST_TIMEOUT);

  it("routes edges only between existing techs, all as elbow fallbacks", async () => {
    const snapshot = loadRealSnapshot();

    const layout = await layoutTree(snapshot, CARD_W, CARD_H);

    // 613 prerequisite edges across the full corpus (all endpoints exist).
    expect(layout.edges.length).toBe(613);
    const keys = new Set(layout.nodes.map((n) => n.key));
    for (const edge of layout.edges) {
      expect(keys.has(edge.from)).toBe(true);
      expect(keys.has(edge.to)).toBe(true);
      // Banded positions invalidate ELK's routing → every edge is a fallback
      // elbow (empty sections) drawn by the edge layer between new positions.
      expect(edge.sections).toEqual([]);
    }
  }, LAYOUT_TEST_TIMEOUT);

  it("lays out only the active categories when filtered (re-pack subset)", async () => {
    const snapshot = loadRealSnapshot();

    const active = new Set(["computing", "industry"]);
    const layout = await layoutTree(snapshot, CARD_W, CARD_H, active);

    // Only the two active categories' techs + bands appear.
    const cats = new Set(layout.nodes.map((n) => categoryOf(n.tech)));
    expect([...cats].sort()).toEqual(["computing", "industry"]);
    expect(layout.bands.map((b) => b.category).sort()).toEqual([
      "computing",
      "industry",
    ]);
    // Bands close up: the first band starts at 0, the second directly follows.
    expect(layout.bands[0].top).toBe(0);
    // Every remaining edge connects two active-category techs.
    const keys = new Set(layout.nodes.map((n) => n.key));
    for (const edge of layout.edges) {
      expect(keys.has(edge.from)).toBe(true);
      expect(keys.has(edge.to)).toBe(true);
    }
  }, LAYOUT_TEST_TIMEOUT);
});
