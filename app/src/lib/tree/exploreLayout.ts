import type { TechSnapshot, Tech } from "../../types/tech-snapshot";
import { CATEGORY_INDEX } from "../graph/categories";
import type { TreeLayout, LayoutNode, LayoutEdge } from "./layoutTree";

/**
 * Explore-mode layout (UC2): a collapsible FORWARD tech tree.
 *
 * Unlike `layoutTree` (the banded swimlane map, which runs ELK asynchronously),
 * this is a PURE, SYNCHRONOUS layout with NO ELK — cheap enough to recompute on
 * every expand/collapse via `useMemo`. It opens collapsed at the entry-point
 * techs (roots = techs with no prerequisites) and reveals what each one unlocks
 * as you expand it.
 *
 * The tech graph is a DAG (a tech can have multiple prerequisites), but Explore
 * renders it as a spanning TREE: a global `visited` set dedups, so each tech
 * shows exactly once — at its first reveal in DFS pre-order. This keeps the
 * "expand one thing, see its unlocks" mental model clean without duplicating a
 * multi-parent tech into several rows.
 *
 * Returns the SAME `TreeLayout` shape as `layoutTree` (with `bands: []`, since
 * bands are map-only), so the renderer reuses the exact same cards + EdgeLayer +
 * viewport transform. Each node carries `expandable`/`expanded` so the card can
 * show a chevron toggle.
 */

// Geometry: one column per depth, one row per visited node. Derived from the
// card size so columns/rows always clear the real DOM cards (mirrors the map's
// COL_EXTRA/ROW_EXTRA intent, tuned tighter for a single-tree reading flow).
const COL_EXTRA = 90; // horizontal gutter between depth columns
const ROW_EXTRA = 16; // vertical gutter between stacked rows

/** The category key a tech belongs to (its first category, or ""). */
function categoryOf(tech: Tech): string {
  return tech.category[0] ?? "";
}

/**
 * A tech is "shown-eligible" only if its category is active. `active` defaults
 * to "all" — an empty/undefined set OR a set covering every category means no
 * filtering (matches how the map treats a full active set as unfiltered).
 */
function isShown(tech: Tech, active: Set<string> | undefined): boolean {
  if (!active || active.size === 0) return true;
  return active.has(categoryOf(tech));
}

/**
 * Precomputed, snapshot-derived structure that's independent of the expand
 * state: the reverse-prerequisite map (childrenByKey) + the sorted root list.
 * Memoized module-side keyed by snapshot identity so repeated expand/collapse
 * recomputes only cheaply reuse it.
 */
interface ExploreGraph {
  /** tech key → the techs whose `prerequisites` include it (its unlocks). */
  childrenByKey: Map<string, Tech[]>;
  /** entry-point techs (no prerequisites), sorted (tier, categoryIndex, name). */
  roots: Tech[];
}

const graphCache = new WeakMap<TechSnapshot, ExploreGraph>();

/** Stable sort key: tier, then category rank (CATEGORY_INDEX), then name. */
function compareTechs(a: Tech, b: Tech): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  const ca = CATEGORY_INDEX[categoryOf(a)] ?? 99;
  const cb = CATEGORY_INDEX[categoryOf(b)] ?? 99;
  if (ca !== cb) return ca - cb;
  return a.name.localeCompare(b.name);
}

function buildExploreGraph(snapshot: TechSnapshot): ExploreGraph {
  const cached = graphCache.get(snapshot);
  if (cached) return cached;

  const techs = Object.values(snapshot.techs);
  const childrenByKey = new Map<string, Tech[]>();
  const roots: Tech[] = [];

  for (const tech of techs) {
    if (tech.prerequisites.length === 0) {
      roots.push(tech);
      continue;
    }
    for (const prereqKey of tech.prerequisites) {
      // Only wire an edge to a prereq that actually exists (dangling refs are a
      // contract violation the map layout already logs — here we skip silently
      // so an orphaned edge never references a missing node).
      if (!snapshot.techs[prereqKey]) continue;
      const bucket = childrenByKey.get(prereqKey);
      if (bucket) bucket.push(tech);
      else childrenByKey.set(prereqKey, [tech]);
    }
  }

  roots.sort(compareTechs);
  // Sort each child bucket too so a node's revealed unlocks appear in the same
  // stable (tier, category, name) order every time.
  for (const bucket of childrenByKey.values()) bucket.sort(compareTechs);

  const graph: ExploreGraph = { childrenByKey, roots };
  graphCache.set(snapshot, graph);
  return graph;
}

/**
 * Builds the collapsible explore layout for the current expand state.
 *
 * @param snapshot     the full tech snapshot
 * @param expandedKeys the set of tech keys currently expanded (open)
 * @param active       active category filter (default all → no filtering)
 * @param cardW/cardH  card size — MUST match the rendered `.tech-card` so
 *                     positions line up with the DOM cards exactly
 */
export function layoutExplore(
  snapshot: TechSnapshot,
  expandedKeys: Set<string>,
  active: Set<string> | undefined,
  cardW: number,
  cardH: number,
): TreeLayout {
  const COL_W = cardW + COL_EXTRA;
  const ROW_H = cardH + ROW_EXTRA;

  const { childrenByKey, roots } = buildExploreGraph(snapshot);

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  // GLOBAL visited set — the DAG is rendered as a spanning tree, so each tech
  // appears once, at its first reveal (DFS pre-order).
  const visited = new Set<string>();
  let rowIndex = 0;

  /** Shown-eligible children of a tech, in stable sorted order. */
  const shownChildren = (tech: Tech): Tech[] =>
    (childrenByKey.get(tech.key) ?? []).filter((c) => isShown(c, active));

  /**
   * DFS pre-order: emit this node as a row, then (if expanded) recurse into its
   * shown-eligible, not-yet-visited children — each one column to the right.
   */
  const walk = (tech: Tech, depth: number): void => {
    if (visited.has(tech.key)) return;
    visited.add(tech.key);

    const children = shownChildren(tech);
    const expandable = children.length > 0;
    const expanded = expandedKeys.has(tech.key);

    nodes.push({
      key: tech.key,
      x: depth * COL_W,
      y: rowIndex * ROW_H,
      w: cardW,
      h: cardH,
      tech,
      expandable,
      expanded: expandable ? expanded : undefined,
    });
    rowIndex += 1;

    if (!expanded) return;
    for (const child of children) {
      if (visited.has(child.key)) continue;
      // Edge parent → child in the visible spanning tree. `sections: []` so the
      // EdgeLayer draws its source-right → target-left elbow (same as the map).
      edges.push({ from: tech.key, to: child.key, sections: [] });
      walk(child, depth + 1);
    }
  };

  for (const root of roots) {
    if (!isShown(root, active)) continue;
    walk(root, 0);
  }

  // Extent: enough to size `.tree-canvas` around every emitted row/column.
  let maxRight = 0;
  let maxBottom = 0;
  for (const n of nodes) {
    maxRight = Math.max(maxRight, n.x + n.w);
    maxBottom = Math.max(maxBottom, n.y + n.h);
  }

  return {
    nodes,
    edges,
    bands: [], // bands are map-only
    width: maxRight,
    height: maxBottom,
  };
}
