import { describe, expect, it } from "vitest";
import type { Tech } from "../types/tech-snapshot";
import {
  computeAncestry,
  hasHiddenAncestor,
  ancestryColumns,
} from "../lib/graph/ancestry";

/**
 * Unit coverage for the recursive prerequisite-ancestry helper (quick
 * 260708-4io). Exercises the pure logic — min-hop depth, filter-hidden flags,
 * cycle safety, dangling-ref safety, and the depth-column bucketing — with
 * small synthetic techs (no ELK / DOM needed).
 */

/** Minimal Tech factory — only the fields the ancestry walk reads matter. */
function tech(
  key: string,
  category: string,
  prerequisites: string[] = [],
  tier = 0,
): Tech {
  return {
    key,
    area: "physics",
    category: [category],
    tier,
    cost: 0,
    weight: 0,
    prerequisites,
    unlocks: { grants: [], leadsTo: [] },
    dlc: null,
    flags: {
      isRare: false,
      isDangerous: false,
      isRepeatable: false,
      isStarting: false,
      isInsight: false,
    },
    name: key,
    description: null,
    icon: null,
    gate: null,
  };
}

function mapOf(...techs: Tech[]): Map<string, Tech> {
  return new Map(techs.map((t) => [t.key, t]));
}

describe("computeAncestry: recursive prerequisite walk", () => {
  it("records the selected tech at depth 0 and never marks it hidden", () => {
    const techByKey = mapOf(tech("root", "computing"));
    const nodes = computeAncestry("root", new Set<string>(), techByKey);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].key).toBe("root");
    expect(nodes[0].depth).toBe(0);
    // Even with an empty active set (its own category hidden), the root is on
    // screen by definition — never flagged hidden.
    expect(nodes[0].hidden).toBe(false);
  });

  it("walks prerequisites transitively and records min-hop depth", () => {
    // grandparent -> parent -> root  (linear chain)
    const techByKey = mapOf(
      tech("root", "computing", ["parent"]),
      tech("parent", "computing", ["grandparent"]),
      tech("grandparent", "computing", []),
    );
    const nodes = computeAncestry("root", new Set(["computing"]), techByKey);
    const depthByKey = new Map(nodes.map((n) => [n.key, n.depth]));

    expect(depthByKey.get("root")).toBe(0);
    expect(depthByKey.get("parent")).toBe(1);
    expect(depthByKey.get("grandparent")).toBe(2);
    expect(nodes).toHaveLength(3);
  });

  it("records the SHORTEST path when a tech is reachable via two chains", () => {
    // root depends on both `mid` (1 hop) and `deep`; `mid` also depends on
    // `deep`. `deep` is reachable at depth 1 (direct) and depth 2 (via mid) →
    // recorded at the minimum, depth 1.
    const techByKey = mapOf(
      tech("root", "computing", ["mid", "deep"]),
      tech("mid", "computing", ["deep"]),
      tech("deep", "computing", []),
    );
    const nodes = computeAncestry("root", new Set(["computing"]), techByKey);
    const deep = nodes.find((n) => n.key === "deep");

    expect(deep?.depth).toBe(1);
    // No duplicate entries for the diamond join.
    expect(nodes.filter((n) => n.key === "deep")).toHaveLength(1);
  });

  it("flags ancestors whose category is hidden by the active filter", () => {
    const techByKey = mapOf(
      tech("root", "computing", ["hiddenParent"]),
      tech("hiddenParent", "particles", []),
    );
    // "particles" is NOT in the active set → hiddenParent is hidden.
    const nodes = computeAncestry("root", new Set(["computing"]), techByKey);
    const parent = nodes.find((n) => n.key === "hiddenParent");

    expect(parent?.hidden).toBe(true);
    expect(hasHiddenAncestor(nodes)).toBe(true);
  });

  it("reports no hidden ancestor when every ancestor's category is active", () => {
    const techByKey = mapOf(
      tech("root", "computing", ["parent"]),
      tech("parent", "particles", []),
    );
    const nodes = computeAncestry(
      "root",
      new Set(["computing", "particles"]),
      techByKey,
    );

    expect(hasHiddenAncestor(nodes)).toBe(false);
  });

  it("is cycle-safe (a prerequisite cycle terminates, no duplicates)", () => {
    // a -> b -> a  (a depends on b, b depends on a) — a malformed cycle.
    const techByKey = mapOf(
      tech("a", "computing", ["b"]),
      tech("b", "computing", ["a"]),
    );
    const nodes = computeAncestry("a", new Set(["computing"]), techByKey);

    // Both visited exactly once; the walk terminates.
    expect(nodes.map((n) => n.key).sort()).toEqual(["a", "b"]);
    expect(nodes.find((n) => n.key === "a")?.depth).toBe(0);
    expect(nodes.find((n) => n.key === "b")?.depth).toBe(1);
  });

  it("skips dangling prerequisite references without throwing", () => {
    const techByKey = mapOf(tech("root", "computing", ["ghost"]));
    const nodes = computeAncestry("root", new Set(["computing"]), techByKey);

    // "ghost" isn't in the map → skipped; only the root remains.
    expect(nodes.map((n) => n.key)).toEqual(["root"]);
  });

  it("returns empty for an unknown root key", () => {
    const techByKey = mapOf(tech("root", "computing"));
    expect(computeAncestry("nope", new Set<string>(), techByKey)).toEqual([]);
  });
});

describe("ancestryColumns: depth bucketing (deepest → selected)", () => {
  it("orders columns deepest-first, selected tech last", () => {
    const techByKey = mapOf(
      tech("root", "computing", ["parent"]),
      tech("parent", "computing", ["grandparent"]),
      tech("grandparent", "computing", []),
    );
    const nodes = computeAncestry("root", new Set(["computing"]), techByKey);
    const cols = ancestryColumns(nodes);

    // Three depths → three columns; leftmost is the deepest ancestor, rightmost
    // is the selected tech (depth 0).
    expect(cols).toHaveLength(3);
    expect(cols[0].map((n) => n.key)).toEqual(["grandparent"]);
    expect(cols[cols.length - 1].map((n) => n.key)).toEqual(["root"]);
  });

  it("groups same-depth ancestors into one column", () => {
    const techByKey = mapOf(
      tech("root", "computing", ["p1", "p2"]),
      tech("p1", "computing", []),
      tech("p2", "computing", []),
    );
    const nodes = computeAncestry("root", new Set(["computing"]), techByKey);
    const cols = ancestryColumns(nodes);

    // depth 1 column holds both parents; depth 0 holds the root.
    expect(cols).toHaveLength(2);
    expect(cols[0].map((n) => n.key).sort()).toEqual(["p1", "p2"]);
    expect(cols[1].map((n) => n.key)).toEqual(["root"]);
  });

  it("returns empty for empty input", () => {
    expect(ancestryColumns([])).toEqual([]);
  });
});
