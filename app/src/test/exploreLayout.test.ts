import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TechSnapshot, Tech } from "../types/tech-snapshot";
import {
  layoutExplore,
  layoutFocus,
  EXPLORE_BUCKETS,
  bucketKey,
} from "../lib/tree/exploreLayout";

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
const BUCKET_KEYS = new Set(EXPLORE_BUCKETS.map((b) => bucketKey(b.id)));

describe("layoutExplore: collapsible forward tech tree with bucket roots", () => {
  it("collapsed → only the synthetic bucket cards, no tech nodes, no edges", () => {
    const snapshot = loadRealSnapshot();

    const layout = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);

    const bucketNodes = layout.nodes.filter((n) => n.bucket);
    const techNodes = layout.nodes.filter((n) => n.tech);

    // Exactly the buckets appear, one per bucket id, and each carries no tech.
    expect(bucketNodes.length).toBe(EXPLORE_BUCKETS.length);
    expect(new Set(bucketNodes.map((n) => n.key))).toEqual(BUCKET_KEYS);
    for (const n of bucketNodes) expect(n.tech).toBeUndefined();

    // No individual tech roots when collapsed — every root is bucketed.
    expect(techNodes.length).toBe(0);
    // Nothing expanded → no edges.
    expect(layout.edges.length).toBe(0);
  });

  it("collapsed layout is the bucket cards, one-per-row in column 0, in display order", () => {
    const snapshot = loadRealSnapshot();
    const layout = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);

    layout.nodes.forEach((node, i) => {
      expect(node.x).toBe(0); // depth 0 → column 0
      expect(node.y).toBe(i * ROW_H); // one row each, top→bottom
      expect(node.w).toBe(CARD_W);
      expect(node.h).toBe(CARD_H);
    });

    // Every collapsed node is a bucket, in EXPLORE_BUCKETS display order
    // ([Empire Starting Techs] first).
    expect(layout.nodes.every((n) => n.bucket)).toBe(true);
    expect(layout.nodes.map((n) => n.bucket!.id)).toEqual(
      EXPLORE_BUCKETS.map((b) => b.id),
    );
    expect(layout.nodes[0].bucket!.id).toBe("starting");
  });

  it("buckets group every root + all repeatables; starting → [Empire Starting Techs], repeatables → [Repeatable]", () => {
    const snapshot = loadRealSnapshot();
    const all = Object.values(snapshot.techs);
    const roots = all.filter((t) => t.prerequisites.length === 0);
    // Non-repeatable roots are what the root-partition covers; repeatables are
    // pulled out wholesale (root or not) into [Repeatable].
    const nonRepeatableRoots = roots.filter((t) => !t.flags.isRepeatable);
    // ALL starting techs (root or not) go in [Empire Starting Techs].
    const allStarting = all.filter((t) => t.flags.isStarting);
    const allRepeatables = all.filter((t) => t.flags.isRepeatable);

    // Expand every bucket; each bucket's grouped members are its edge targets.
    const expanded = layoutExplore(
      snapshot,
      new Set(BUCKET_KEYS),
      undefined,
      CARD_W,
      CARD_H,
    );
    const targetsFrom = (key: string) => {
      const s = new Set<string>();
      for (const e of expanded.edges) if (e.from === key) s.add(e.to);
      return s;
    };
    const grouped = new Set<string>();
    for (const def of EXPLORE_BUCKETS)
      for (const k of targetsFrom(bucketKey(def.id))) grouped.add(k);

    // Every non-repeatable root is grouped somewhere.
    for (const t of nonRepeatableRoots) expect(grouped.has(t.key)).toBe(true);
    // Every starting tech (incl. ones with prerequisites) → [Empire Starting
    // Techs], and only those.
    const startingGrouped = targetsFrom(bucketKey("starting"));
    expect(startingGrouped.size).toBe(allStarting.length);
    for (const t of allStarting) expect(startingGrouped.has(t.key)).toBe(true);
    // Every repeatable (root or not) → [Repeatable], and only those.
    const repeatableGrouped = targetsFrom(bucketKey("repeatable"));
    expect(repeatableGrouped.size).toBe(allRepeatables.length);
    for (const t of allRepeatables) expect(repeatableGrouped.has(t.key)).toBe(true);
    // [Standard] holds only weight>0 members; [Event] only weight===0.
    for (const k of targetsFrom(bucketKey("standard")))
      expect(snapshot.techs[k].weight).toBeGreaterThan(0);
    for (const k of targetsFrom(bucketKey("event")))
      expect(snapshot.techs[k].weight).toBe(0);
  });

  it("a non-empty bucket is expandable; expanding reveals its roots to the right with edges", () => {
    const snapshot = loadRealSnapshot();

    const collapsed = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);
    // [Event] is always populated in v4.5.0 — a stable target for the test.
    const eventKey = bucketKey("event");
    const eventCollapsed = collapsed.nodes.find((n) => n.key === eventKey)!;
    expect(eventCollapsed.bucket!.count).toBeGreaterThan(0);
    expect(eventCollapsed.expandable).toBe(true);
    expect(eventCollapsed.expanded).toBe(false); // expandable but not yet open

    const expanded = layoutExplore(
      snapshot,
      new Set([eventKey]),
      undefined,
      CARD_W,
      CARD_H,
    );
    expect(expanded.nodes.length).toBeGreaterThan(collapsed.nodes.length);

    const eventNode = expanded.nodes.find((n) => n.key === eventKey)!;
    expect(eventNode.expanded).toBe(true);

    // Its grouped roots appear one column to the right (depth 1), reached by an
    // edge from the bucket, and each edge falls back to a plain elbow (no ELK).
    const eventEdges = expanded.edges.filter((e) => e.from === eventKey);
    expect(eventEdges.length).toBeGreaterThan(0);
    for (const e of eventEdges) {
      expect(e.sections).toEqual([]);
      const child = expanded.nodes.find((n) => n.key === e.to)!;
      expect(child.x).toBe(COL_W); // depth 1
    }
  });

  it("dedups multi-parent techs — each key appears at most once when fully expanded", () => {
    const snapshot = loadRealSnapshot();
    // Expand every tech AND every bucket (full spanning tree) — strongest dedup.
    const allKeys = new Set([...Object.keys(snapshot.techs), ...BUCKET_KEYS]);
    const layout = layoutExplore(snapshot, allKeys, undefined, CARD_W, CARD_H);

    const seen = new Set<string>();
    for (const node of layout.nodes) {
      expect(seen.has(node.key)).toBe(false); // never twice
      seen.add(node.key);
    }
    expect(layout.nodes.length).toBe(seen.size);
  });

  it("collapse removes an expanded bucket's revealed roots", () => {
    const snapshot = loadRealSnapshot();
    const eventKey = bucketKey("event");
    const expanded = layoutExplore(snapshot, new Set([eventKey]), undefined, CARD_W, CARD_H);
    const collapsed = layoutExplore(snapshot, new Set(), undefined, CARD_W, CARD_H);

    expect(collapsed.nodes.length).toBeLessThan(expanded.nodes.length);
    expect(collapsed.edges.length).toBe(0);
  });

  it("respects the category filter — only shown-eligible techs appear (buckets always show)", () => {
    const snapshot = loadRealSnapshot();
    const active = new Set(["computing"]);
    // Expand everything so any leaked non-computing tech would surface.
    const allKeys = new Set([...Object.keys(snapshot.techs), ...BUCKET_KEYS]);
    const layout = layoutExplore(snapshot, allKeys, active, CARD_W, CARD_H);

    for (const node of layout.nodes) {
      if (node.bucket) continue; // bucket cards are category-agnostic chrome
      expect(categoryOf(node.tech!)).toBe("computing");
    }
    // Edges only connect two shown nodes (tech or bucket).
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

describe("layoutFocus: a tech's dependency neighborhood", () => {
  const childrenOf = (snapshot: TechSnapshot) => {
    const m = new Map<string, string[]>();
    for (const t of Object.values(snapshot.techs)) {
      for (const p of t.prerequisites) {
        const b = m.get(p);
        if (b) b.push(t.key);
        else m.set(p, [t.key]);
      }
    }
    return m;
  };

  it("centers the focus, with prerequisites to the LEFT and direct dependents to the RIGHT", () => {
    const snapshot = loadRealSnapshot();
    const kids = childrenOf(snapshot);
    const focus = Object.values(snapshot.techs).find(
      (t) => t.prerequisites.length > 0 && (kids.get(t.key)?.length ?? 0) > 0,
    )!;
    expect(focus).toBeDefined();

    const layout = layoutFocus(snapshot, focus.key, new Set([focus.key]), CARD_W, CARD_H);
    const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
    const focusNode = byKey.get(focus.key)!;
    expect(focusNode).toBeDefined();

    // Every existing direct prerequisite is shown, left of the focus.
    for (const p of focus.prerequisites) {
      if (!snapshot.techs[p]) continue;
      const pn = byKey.get(p);
      expect(pn).toBeDefined();
      expect(pn!.x).toBeLessThan(focusNode.x);
    }
    // Every direct dependent is shown, right of the focus.
    for (const d of kids.get(focus.key)!) {
      const dn = byKey.get(d);
      expect(dn).toBeDefined();
      expect(dn!.x).toBeGreaterThan(focusNode.x);
    }
    // Edges flow prereq → focus → dependent, and no bands.
    expect(layout.edges.some((e) => e.to === focus.key)).toBe(true);
    expect(layout.edges.some((e) => e.from === focus.key)).toBe(true);
    expect(layout.bands).toEqual([]);
  });

  it("includes the FULL recursive prerequisite ancestry (not just direct prereqs)", () => {
    const snapshot = loadRealSnapshot();
    // A tech whose prerequisite itself has a prerequisite → ancestry depth ≥ 2.
    const focus = Object.values(snapshot.techs).find((t) =>
      t.prerequisites.some(
        (p) => (snapshot.techs[p]?.prerequisites.length ?? 0) > 0,
      ),
    )!;
    const layout = layoutFocus(snapshot, focus.key, new Set([focus.key]), CARD_W, CARD_H);
    const keys = new Set(layout.nodes.map((n) => n.key));

    // BFS the real ancestry; every ancestor must appear as a node.
    const seen = new Set<string>([focus.key]);
    const queue = [focus.key];
    let depthTwoSeen = false;
    while (queue.length > 0) {
      const k = queue.shift()!;
      for (const p of snapshot.techs[k]?.prerequisites ?? []) {
        if (!snapshot.techs[p] || seen.has(p)) continue;
        seen.add(p);
        queue.push(p);
        expect(keys.has(p)).toBe(true);
        if (k !== focus.key) depthTwoSeen = true; // an ancestor-of-an-ancestor
      }
    }
    expect(depthTwoSeen).toBe(true);
  });

  it("returns an empty layout for an unknown focus key (defensive)", () => {
    const snapshot = loadRealSnapshot();
    const layout = layoutFocus(snapshot, "tech_does_not_exist", new Set(), CARD_W, CARD_H);
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });

  it("expanding a dependent (single-click) reveals more nodes WITHOUT hiding any", () => {
    const snapshot = loadRealSnapshot();
    const kids = childrenOf(snapshot);
    // focus whose direct dependent itself has dependents (so expanding it adds nodes).
    let focus, dep;
    for (const t of Object.values(snapshot.techs)) {
      const d = (kids.get(t.key) ?? []).find((k) => (kids.get(k)?.length ?? 0) > 0);
      if (d) { focus = t; dep = d; break; }
    }
    expect(focus && dep).toBeTruthy();

    const collapsed = layoutFocus(snapshot, focus!.key, new Set([focus!.key]), CARD_W, CARD_H);
    const expanded = layoutFocus(snapshot, focus!.key, new Set([focus!.key, dep!]), CARD_W, CARD_H);
    const cKeys = new Set(collapsed.nodes.map((n) => n.key));
    const eKeys = new Set(expanded.nodes.map((n) => n.key));

    expect(cKeys.has(dep!)).toBe(true); // the dependent shows before expansion
    expect(expanded.nodes.length).toBeGreaterThan(collapsed.nodes.length); // expand adds nodes
    for (const k of cKeys) expect(eKeys.has(k)).toBe(true); // nothing hidden (superset)
  });
});
