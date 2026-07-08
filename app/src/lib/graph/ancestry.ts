import type { Tech } from "../../types/tech-snapshot";
import { CATEGORY_AREA, type CategoryKey } from "./categories";

/**
 * Recursive prerequisite-ancestry walk for the selection drill-down panel
 * (quick 260708-4io). Pure + cycle-guarded so it's unit-testable independent of
 * the DOM: given a selected tech, it walks `tech.prerequisites` transitively via
 * a key→Tech map and records, for each ancestor, its minimum hop distance
 * (`depth`) from the selected tech and whether the current category filter
 * HIDES it (`hidden`).
 *
 * The selected tech itself is the root at depth 0 and is never marked hidden
 * (you selected it, so it's on screen). `depth` is the SHORTEST path length: a
 * tech reachable via both a 1-hop and a 3-hop chain is recorded at depth 1, so
 * the panel's depth-columns place each ancestor as close to the selection as it
 * can reach it.
 */

/** One node in the resolved ancestry tree. */
export interface AncestryNode {
  key: string;
  tech: Tech;
  /** Minimum hops from the selected tech (0 = the selected tech itself). */
  depth: number;
  /** True when the current category filter hides this tech's category. */
  hidden: boolean;
}

/** The category key a tech belongs to (its first category, or ""). */
function categoryOf(tech: Tech): string {
  return tech.category[0] ?? "";
}

/** Whether the active-category filter hides this tech (its category is off). */
function isHidden(tech: Tech, active: Set<string>): boolean {
  return !active.has(categoryOf(tech));
}

/**
 * BFS the prerequisite ancestry of `rootKey`, recording each reachable tech at
 * its minimum depth. Cycle-guarded (a `visited` set ensures each key is
 * enqueued once, so a prereq cycle can never loop forever). Returns the nodes
 * ordered by ascending depth (root first), which is a stable order the panel
 * can bucket into depth-columns.
 *
 * `active` is the set of currently-shown category keys; a node whose category
 * is absent is flagged `hidden` (the filter removed it, but the drill-down
 * still surfaces it).
 */
export function computeAncestry(
  rootKey: string,
  active: Set<string>,
  techByKey: Map<string, Tech>,
): AncestryNode[] {
  const root = techByKey.get(rootKey);
  if (!root) return [];

  const nodes: AncestryNode[] = [];
  const visited = new Set<string>([rootKey]);
  // BFS queue of [key, depth]; BFS guarantees first visit == minimum depth.
  let frontier: string[] = [rootKey];
  let depth = 0;

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const key of frontier) {
      const tech = techByKey.get(key);
      if (!tech) continue;
      nodes.push({
        key,
        tech,
        depth,
        // The selected tech (depth 0) is on-screen by definition — never hidden.
        hidden: depth === 0 ? false : isHidden(tech, active),
      });
      for (const prereqKey of tech.prerequisites) {
        if (visited.has(prereqKey)) continue; // cycle / already-shallower guard
        if (!techByKey.has(prereqKey)) continue; // dangling ref — skip
        visited.add(prereqKey);
        next.push(prereqKey);
      }
    }
    frontier = next;
    depth += 1;
  }

  return nodes;
}

/**
 * True when at least one of the selected tech's recursive ancestors is hidden
 * by the current filter — the trigger for mounting the drill-down panel. (No
 * hidden ancestor → nothing the tree view is missing → no panel.)
 */
export function hasHiddenAncestor(nodes: AncestryNode[]): boolean {
  return nodes.some((n) => n.hidden);
}

/**
 * Buckets ancestry nodes into depth-columns for the panel layout: index 0 holds
 * the deepest ancestors (leftmost column) and the last index holds the selected
 * tech (rightmost), so rendering the array left→right reads deepest-prereq →
 * selection. Empty depths are skipped so columns stay contiguous.
 */
export function ancestryColumns(nodes: AncestryNode[]): AncestryNode[][] {
  if (nodes.length === 0) return [];
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  const byDepth: AncestryNode[][] = [];
  // depth === maxDepth (deepest) first → depth 0 (selected) last.
  for (let d = maxDepth; d >= 0; d--) {
    const col = nodes.filter((n) => n.depth === d);
    if (col.length > 0) byDepth.push(col);
  }
  // The area colour token key for a category, for the panel's left border.
  return byDepth;
}

/** Resolve a tech's area color token key via its category (panel left border). */
export function areaOf(tech: Tech): string {
  const cat = categoryOf(tech) as CategoryKey;
  return CATEGORY_AREA[cat] ?? tech.area;
}
