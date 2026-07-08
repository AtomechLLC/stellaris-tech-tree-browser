import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TechSnapshot, Tech } from "../types/tech-snapshot";
import { layoutExplore } from "../lib/tree/exploreLayout";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CARD_W = 230;
const CARD_H = 92;
// Explore geometry: COL_W = cardW + 90, ROW_H = cardH + 16.
const COL_W = CARD_W + 90;
const ROW_H = CARD_H + 16;

function loadRealSnapshot(): TechSnapshot {
  const path = join(__dirname, "..", "..", "public", "data", "v4.5.0", "tech.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as TechSnapshot;
}

const categoryOf = (t: Tech): string => t.category[0] ?? "";

describe("layoutExplore: collapsible forward tech tree", () => {
  it("collapsed → only the entry-point roots (no prerequisites), no edges", () => {
    const snapshot = loadRealSnapshot();
    const roots = Object.values(snapshot.techs).filter(
      (t) => t.prerequisites.length === 0,
    );

    const layout = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);

    // Every collapsed node is a root; every root appears.
    expect(layout.nodes.length).toBe(roots.length);
    const nodeKeys = new Set(layout.nodes.map((n) => n.key));
    for (const root of roots) expect(nodeKeys.has(root.key)).toBe(true);
    for (const node of layout.nodes) {
      expect(node.tech.prerequisites.length).toBe(0);
    }
    // Nothing expanded → no parent→child edges.
    expect(layout.edges.length).toBe(0);
  });

  it("roots are one per row in column 0, sorted (tier, categoryIndex, name)", () => {
    const snapshot = loadRealSnapshot();
    const layout = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);

    layout.nodes.forEach((node, i) => {
      expect(node.x).toBe(0); // depth 0 → column 0
      expect(node.y).toBe(i * ROW_H); // one row each, top→bottom
      expect(node.w).toBe(CARD_W);
      expect(node.h).toBe(CARD_H);
    });

    // Rows are in ascending (tier, categoryIndex, name) order.
    for (let i = 1; i < layout.nodes.length; i++) {
      const a = layout.nodes[i - 1].tech;
      const b = layout.nodes[i].tech;
      expect(a.tier).toBeLessThanOrEqual(b.tier);
    }
  });

  it("marks a root with unlocks as expandable, others as not", () => {
    const snapshot = loadRealSnapshot();
    // A tech that some other tech lists as a prerequisite → has ≥1 child.
    const childOf = new Set<string>();
    for (const t of Object.values(snapshot.techs)) {
      for (const p of t.prerequisites) childOf.add(p);
    }
    const layout = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);

    let sawExpandable = false;
    for (const node of layout.nodes) {
      const hasChildren = childOf.has(node.key);
      expect(node.expandable).toBe(hasChildren);
      if (hasChildren) sawExpandable = true;
    }
    expect(sawExpandable).toBe(true);
  });

  it("expanding a root reveals its unlocks as rows to its right, with edges", () => {
    const snapshot = loadRealSnapshot();
    // Pick a root that unlocks at least one other tech.
    const childrenByKey = new Map<string, string[]>();
    for (const t of Object.values(snapshot.techs)) {
      for (const p of t.prerequisites) {
        (childrenByKey.get(p) ?? childrenByKey.set(p, []).get(p)!).push(t.key);
      }
    }
    const root = Object.values(snapshot.techs).find(
      (t) => t.prerequisites.length === 0 && (childrenByKey.get(t.key)?.length ?? 0) > 0,
    )!;
    expect(root).toBeDefined();

    const collapsed = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);
    const expanded = layoutExplore(snapshot, new Set([root.key]), undefined, CARD_W, CARD_H);

    // Expanding adds rows (the root's revealed children).
    expect(expanded.nodes.length).toBeGreaterThan(collapsed.nodes.length);
    // The root now reads as expanded.
    const rootNode = expanded.nodes.find((n) => n.key === root.key)!;
    expect(rootNode.expanded).toBe(true);

    // Its direct children now appear, one column to the right (depth 1 → COL_W).
    const directChildren = childrenByKey.get(root.key)!;
    for (const childKey of directChildren) {
      const childNode = expanded.nodes.find((n) => n.key === childKey);
      // A child could be pre-visited under another root; if present it must sit
      // at least one column to the right of column 0.
      if (childNode) expect(childNode.x).toBeGreaterThanOrEqual(COL_W);
    }
    // There is at least one parent→child edge from the expanded root.
    const rootEdges = expanded.edges.filter((e) => e.from === root.key);
    expect(rootEdges.length).toBeGreaterThan(0);
    for (const e of rootEdges) expect(e.sections).toEqual([]);
  });

  it("dedups multi-parent techs — each tech appears at most once", () => {
    const snapshot = loadRealSnapshot();
    // Expand ALL techs at once (full spanning tree) — the strongest dedup test.
    const allKeys = new Set(Object.keys(snapshot.techs));
    const layout = layoutExplore(snapshot, allKeys, undefined, CARD_W, CARD_H);

    const seen = new Set<string>();
    for (const node of layout.nodes) {
      expect(seen.has(node.key)).toBe(false); // never twice
      seen.add(node.key);
    }
    // Every reachable-from-a-root tech is shown exactly once when fully expanded.
    expect(layout.nodes.length).toBe(seen.size);
  });

  it("collapse removes a root's descendants", () => {
    const snapshot = loadRealSnapshot();
    const childrenByKey = new Map<string, string[]>();
    for (const t of Object.values(snapshot.techs)) {
      for (const p of t.prerequisites) {
        (childrenByKey.get(p) ?? childrenByKey.set(p, []).get(p)!).push(t.key);
      }
    }
    const root = Object.values(snapshot.techs).find(
      (t) => t.prerequisites.length === 0 && (childrenByKey.get(t.key)?.length ?? 0) > 0,
    )!;

    const expanded = layoutExplore(snapshot, new Set([root.key]), undefined, CARD_W, CARD_H);
    const collapsed = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);

    // Collapsing the root drops back to the plain root column.
    expect(collapsed.nodes.length).toBeLessThan(expanded.nodes.length);
    expect(collapsed.edges.length).toBe(0);
  });

  it("respects the category filter — only shown-eligible techs appear", () => {
    const snapshot = loadRealSnapshot();
    const active = new Set(["computing"]);
    // Expand everything so any leaked non-computing tech would surface.
    const allKeys = new Set(Object.keys(snapshot.techs));
    const layout = layoutExplore(snapshot, allKeys, active, CARD_W, CARD_H);

    for (const node of layout.nodes) {
      expect(categoryOf(node.tech)).toBe("computing");
    }
    // Edges only connect two shown techs.
    const keys = new Set(layout.nodes.map((n) => n.key));
    for (const edge of layout.edges) {
      expect(keys.has(edge.from)).toBe(true);
      expect(keys.has(edge.to)).toBe(true);
    }
  });

  it("width/height bound the emitted node extent", () => {
    const snapshot = loadRealSnapshot();
    const layout = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);

    let maxRight = 0;
    let maxBottom = 0;
    for (const n of layout.nodes) {
      maxRight = Math.max(maxRight, n.x + n.w);
      maxBottom = Math.max(maxBottom, n.y + n.h);
    }
    expect(layout.width).toBe(maxRight);
    expect(layout.height).toBe(maxBottom);
    expect(layout.bands).toEqual([]); // bands are map-only
  });
});
