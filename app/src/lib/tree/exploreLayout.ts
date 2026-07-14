import type { TechSnapshot, Tech } from "../../types/tech-snapshot";
import { CATEGORY_INDEX } from "../graph/categories";
import { isPerkKey } from "./perks";
import { isSourceKey } from "./eventSources";
import type {
  TreeLayout,
  LayoutNode,
  LayoutEdge,
  BucketId,
} from "./layoutTree";

/**
 * Explore-mode layout (UC2): a collapsible FORWARD tech tree.
 *
 * Unlike `layoutTree` (the banded swimlane map, which runs ELK asynchronously),
 * this is a PURE, SYNCHRONOUS layout with NO ELK — cheap enough to recompute on
 * every expand/collapse via `useMemo`. It opens collapsed at the entry-point
 * roots and reveals what each one unlocks as you expand it.
 *
 * ROOT MODEL (quick 260708-6bk): the raw no-prerequisite set is ~178 techs —
 * far too long to open on. Only the ~28 genuine *starting* techs (isStarting)
 * are realistic empire-start entry points, so those stay real roots. Every
 * OTHER no-prerequisite tech is grouped under one of five synthetic "bucket"
 * root cards — [Insight] (pre-FTL), [Dangerous], [Repeatable], [Archaeology],
 * [Event] — so the initial column is 28 + 5 = 33 rows. Expanding a bucket
 * reveals its grouped roots one column to the right (later reveal), each of
 * which then expands normally into its own unlocks.
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

/** Stable key prefix for the synthetic bucket root nodes (never a real tech). */
export const BUCKET_KEY_PREFIX = "bucket:";
export const bucketKey = (id: BucketId): string => `${BUCKET_KEY_PREFIX}${id}`;

/**
 * Techs discovered by DELVING THE SHROUD — the contents of the game's
 * `00_shroud_tech.txt` (weight 0, granted by Shroud events). Most require
 * `tech_psionic_aura` or `tech_titans`, so they're pulled into the bucket
 * wholesale rather than by root-only bucketing.
 */
const SHROUD_TECH_KEYS = new Set<string>([
  "tech_psionic_aura",
  "tech_aura_intensification",
  "tech_psionic_suppression",
  "tech_aura_resonation",
  "tech_materiality_engine",
  "tech_psionic_bombers",
  "tech_psionic_lightning",
  "tech_psionic_disruptor",
  "tech_zro_launcher",
]);

const isShroudTech = (t: Tech): boolean => SHROUD_TECH_KEYS.has(t.key);

interface BucketDef {
  id: BucketId;
  label: string;
  descriptor: string;
  /** Predicate matched against a root (no-prerequisite) tech. */
  match: (tech: Tech) => boolean;
  /**
   * OVERLAY bucket: a complete flat index of every matching tech (root or not),
   * rendered as DUPLICATE cards. Its techs are NOT removed from the tree — they
   * keep their natural forward-dependency position — so they're reachable both
   * via this bucket and via the tree. `bucketOf` skips overlay buckets so a
   * matching root still lands in its normal ([Standard]/[Event]/…) bucket.
   */
  overlay?: boolean;
}

/**
 * The explore buckets, in ASSIGNMENT order (first-match), so a tech matching
 * several (e.g. a starting tech that's also rare) lands in the first —
 * [Empire Starting Techs] wins for any start tech, then the more specific
 * signals, then [Standard] catches everything that still appears in the normal
 * research pool (weight > 0), and [Event] is the final catch-all (weight 0 —
 * only handed out by events / special conditions). DISPLAY order is separate
 * (EXPLORE_BUCKETS_DISPLAY below) — [Standard] must sit near the end HERE or
 * its weight>0 rule would swallow the specific buckets, but it displays right
 * under [Empire Starting Techs].
 *
 * [Repeatable] is special: it collects EVERY repeatable-upgrade tech (weapon /
 * armor / shield / economy), root or not — handled directly in
 * buildExploreGraph, not via first-match here — so all of them group together
 * instead of hiding as tier-5 leaves deep in the tree.
 */
export const EXPLORE_BUCKETS: BucketDef[] = [
  {
    id: "starting",
    label: "Empire Starting Techs",
    descriptor: "Techs your empire begins with",
    match: (t) => t.flags.isStarting,
  },
  {
    id: "repeatable",
    label: "Repeatable",
    descriptor: "Repeatable upgrade techs",
    match: (t) => t.flags.isRepeatable,
  },
  {
    id: "dangerous",
    label: "Dangerous",
    descriptor: "Dangerous techs (also in the tree)",
    match: (t) => t.flags.isDangerous,
    overlay: true,
  },
  {
    id: "insight",
    label: "Insight",
    descriptor: "Pre-FTL insight techs",
    match: (t) => t.flags.isInsight,
  },
  {
    id: "archaeology",
    label: "Archaeology",
    descriptor: "Archaeostudies techs",
    match: (t) => (t.category[0] ?? "") === "archaeostudies",
  },
  {
    id: "ambition",
    label: "Ambition",
    descriptor: "Crisis-perk techs, grouped by their ascension perk",
    // Holds the synthetic ascension-perk parent cards (perks.ts). Each perk card
    // then expands to the techs gated behind that perk. Real techs never match.
    match: (t) => isPerkKey(t.key),
  },
  {
    id: "shroud",
    label: "Shroud",
    descriptor: "Techs delved from the Shroud",
    match: (t) => isShroudTech(t),
  },
  {
    id: "standard",
    label: "Standard",
    descriptor: "In the normal research pool",
    match: (t) => t.weight > 0, // drawn randomly once its tier unlocks
  },
  {
    id: "event",
    label: "Event",
    descriptor: "Event & special techs (not randomly drawn)",
    match: () => true, // catch-all — must be last
  },
];

/** Bucket cards in DISPLAY order: the two everyone reads first ([Empire
 *  Starting Techs], [Standard]) on top, the rest as assigned. Ids not listed
 *  keep their EXPLORE_BUCKETS order after the listed ones (stable sort). */
const BUCKET_DISPLAY_ORDER: BucketId[] = ["starting", "standard"];
export const EXPLORE_BUCKETS_DISPLAY: BucketDef[] = [...EXPLORE_BUCKETS].sort((a, b) => {
  const rank = (d: BucketDef) => {
    const i = BUCKET_DISPLAY_ORDER.indexOf(d.id);
    return i === -1 ? BUCKET_DISPLAY_ORDER.length : i;
  };
  return rank(a) - rank(b);
});

/**
 * First-match TREE bucket id for a root (no-prerequisite) tech (never null).
 * Overlay buckets are skipped so a matching root still gets a real tree home
 * (e.g. a dangerous root falls through to [Standard]/[Event]).
 */
function bucketOf(tech: Tech): BucketId {
  for (const def of EXPLORE_BUCKETS) if (!def.overlay && def.match(tech)) return def.id;
  return "event"; // unreachable — the last def matches everything
}

// Geometry: one column per depth, one row per visited node. Derived from the
// card size so columns/rows always clear the real DOM cards (mirrors the map's
// COL_EXTRA/ROW_EXTRA intent, tuned tighter for a single-tree reading flow).
export const COL_EXTRA = 90; // horizontal gutter between depth columns
export const ROW_EXTRA = 16; // vertical gutter between stacked rows

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
  const cat = categoryOf(tech);
  if (cat === "") return true; // category-less synthetic nodes (perk parents) always show
  return active.has(cat);
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
  /** Every root (no-prereq) tech grouped by bucket id, sorted (tier, cat, name). */
  bucketRoots: Map<BucketId, Tech[]>;
  /** Overlay buckets → ALL matching techs (root or not), sorted. Rendered as a
   *  flat duplicate index; these techs also appear in the tree. */
  overlayMembers: Map<BucketId, Tech[]>;
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
  const bucketRoots = new Map<BucketId, Tech[]>();
  for (const def of EXPLORE_BUCKETS) bucketRoots.set(def.id, []);
  const overlayMembers = new Map<BucketId, Tech[]>();
  for (const def of EXPLORE_BUCKETS) if (def.overlay) overlayMembers.set(def.id, []);

  for (const tech of techs) {
    // Overlay index captures EVERY dangerous tech (root or not) up front, so the
    // [Dangerous] card stays complete even for techs also pulled (repeatable/
    // shroud) or nested deep in the tree.
    if (tech.flags.isDangerous) overlayMembers.get("dangerous")!.push(tech);

    // A tech pulled ENTIRELY into its own bucket below (repeatable / shroud) is
    // otherwise never wired as anyone's child — but it must still appear next to
    // its event/dig-site SOURCE parent (as a duplicate; it also lives in its
    // bucket). Wire that one source edge before the pull so the source parent is
    // never left childless.
    if (tech.flags.isRepeatable || isShroudTech(tech)) {
      const srcPrereq = tech.prerequisites.find(isSourceKey);
      if (srcPrereq && snapshot.techs[srcPrereq]) {
        const arr = childrenByKey.get(srcPrereq);
        if (arr) arr.push(tech);
        else childrenByKey.set(srcPrereq, [tech]);
      }
    }

    // Repeatable upgrades group under [Repeatable] regardless of prerequisites,
    // and are pulled ENTIRELY out of the browse tree (they're terminal tier-5
    // leaves — grouping them beats scattering them as deep children).
    if (tech.flags.isRepeatable) {
      bucketRoots.get("repeatable")!.push(tech);
      continue;
    }
    // Shroud-delve techs group ENTIRELY into their bucket regardless of
    // prerequisites (most have some) — like repeatables. (Ambition is an OVERLAY,
    // so its techs stay in the tree; they're indexed above, not pulled here.)
    if (isShroudTech(tech)) {
      bucketRoots.get("shroud")!.push(tech);
      continue;
    }
    // EVERY starting tech goes in [Empire Starting Techs] — including ones with
    // prerequisites (e.g. Starbase Construction, New Worlds Protocol), since the
    // empire begins with them researched. Unlike repeatables they are NOT pulled
    // out of the tree: they fall through to the wiring below so their own
    // dependents stay reachable, and the spanning-tree `visited` set dedups.
    if (tech.flags.isStarting) {
      bucketRoots.get("starting")!.push(tech);
    } else if (tech.prerequisites.length === 0) {
      // Every other root is bucketed (the rest by weight into [Standard]/[Event])
      // so the initial Explore column is just the handful of bucket cards.
      bucketRoots.get(bucketOf(tech))!.push(tech);
      continue;
    }
    for (const prereqKey of tech.prerequisites) {
      // Only wire an edge to a prereq that actually exists (dangling refs are a
      // contract violation the map layout already logs — here we skip silently
      // so an orphaned edge never references a missing node).
      const prereq = snapshot.techs[prereqKey];
      if (!prereq) continue;
      // Repeatables live ONLY in the [Repeatable] bucket — never wire a tree edge
      // into one, so expanding the bucket shows them as flat leaves (and nothing
      // is revealed "under" a repeatable in the browse tree).
      if (prereq.flags.isRepeatable) continue;
      // Same for the pulled-out Shroud set: keep them flat leaves inside their
      // bucket (never reveal dependents under one). Ambition is an overlay, so it
      // is NOT skipped here — its techs keep their normal tree children.
      if (isShroudTech(prereq)) continue;
      const bucket = childrenByKey.get(prereqKey);
      if (bucket) bucket.push(tech);
      else childrenByKey.set(prereqKey, [tech]);
    }
  }

  for (const arr of bucketRoots.values()) arr.sort(compareTechs);
  for (const arr of overlayMembers.values()) arr.sort(compareTechs);
  // Sort each child bucket too so a node's revealed unlocks appear in the same
  // stable (tier, category, name) order every time.
  for (const bucket of childrenByKey.values()) bucket.sort(compareTechs);

  const graph: ExploreGraph = { childrenByKey, bucketRoots, overlayMembers };
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

  const { childrenByKey, bucketRoots, overlayMembers } = buildExploreGraph(snapshot);

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
    // Event / dig-site source parents auto-expand (their granted tech always
    // shows, no chevron) and PAIR with that tech on the same row instead of
    // pushing it a row down — the source reads as a label on the tech's row.
    const isSource = isSourceKey(tech.key);
    const expanded = isSource ? expandable : expandedKeys.has(tech.key);
    // A source pairs its FIRST granted tech on its own row (doesn't consume a
    // separate row); the first child, walked next, lands on this same row.
    const pairFirst = isSource && expanded && children.length > 0;

    nodes.push({
      key: tech.key,
      x: depth * COL_W,
      y: rowIndex * ROW_H,
      w: cardW,
      h: cardH,
      tech,
      expandable: isSource ? false : expandable,
      expanded: isSource ? undefined : expandable ? expanded : undefined,
    });
    if (!pairFirst) rowIndex += 1;

    if (!expanded) return;

    if (isSource) {
      // Show EVERY granted tech next to the source — even one that already
      // appears in another tree. A tech not yet visited renders as its real,
      // walkable node; one already shown elsewhere renders as a DUPLICATE leaf
      // (bucket-scoped key kept OUT of `visited`) so the event↔tech pairing is
      // never suppressed by the spanning-tree dedupe.
      for (const child of children) {
        if (visited.has(child.key)) {
          const dupKey = `${tech.key}#${child.key}`;
          edges.push({ from: tech.key, to: dupKey, sections: [] });
          nodes.push({
            key: dupKey,
            x: (depth + 1) * COL_W,
            y: rowIndex * ROW_H,
            w: cardW,
            h: cardH,
            tech: child,
            expandable: false,
          });
          rowIndex += 1;
        } else {
          edges.push({ from: tech.key, to: child.key, sections: [] });
          walk(child, depth + 1);
        }
      }
      return;
    }

    for (const child of children) {
      if (visited.has(child.key)) continue;
      // Edge parent → child in the visible spanning tree. `sections: []` so the
      // EdgeLayer draws its source-right → target-left elbow (same as the map).
      edges.push({ from: tech.key, to: child.key, sections: [] });
      walk(child, depth + 1);
    }
  };

  // The synthetic bucket root cards (in EXPLORE_BUCKETS_DISPLAY order), each
  // grouping its shown-eligible roots — including [Empire Starting Techs]. A
  // bucket carries no `tech`; the renderer branches on `bucket` to draw a
  // BucketCard. When expanded, its grouped roots are revealed one column to the
  // right (depth 1) and walk normally into their own unlocks.
  for (const def of EXPLORE_BUCKETS_DISPLAY) {
    const source = def.overlay ? overlayMembers.get(def.id) : bucketRoots.get(def.id);
    const assigned = (source ?? []).filter((t) => isShown(t, active));
    const key = bucketKey(def.id);
    const expandable = assigned.length > 0;
    const expanded = expandedKeys.has(key);

    nodes.push({
      key,
      x: 0,
      y: rowIndex * ROW_H,
      w: cardW,
      h: cardH,
      bucket: {
        id: def.id,
        label: def.label,
        descriptor: def.descriptor,
        count: assigned.length,
      },
      expandable,
      expanded: expandable ? expanded : undefined,
    });
    rowIndex += 1;

    if (!expandable || !expanded) continue;
    if (def.overlay) {
      // Overlay bucket → a flat DUPLICATE index. Each tech also lives in the tree
      // (its natural position), so give the duplicate a bucket-scoped node key and
      // do NOT touch `visited` — that keeps the tree copy intact.
      for (const tech of assigned) {
        edges.push({ from: key, to: `${key}#${tech.key}`, sections: [] });
        nodes.push({
          key: `${key}#${tech.key}`,
          x: COL_W,
          y: rowIndex * ROW_H,
          w: cardW,
          h: cardH,
          tech,
          expandable: false,
        });
        rowIndex += 1;
      }
      continue;
    }
    for (const root of assigned) {
      if (visited.has(root.key)) continue;
      edges.push({ from: key, to: root.key, sections: [] });
      walk(root, 1);
    }
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

/**
 * Focus layout (quick 260708-7fx): the full dependency neighborhood of ONE tech,
 * for "jump to this tech and see everything around it" — find-in-explore and
 * double-click-from-map. Lays out, as REAL cards with connecting edges:
 *   • the focus tech, centered;
 *   • its ENTIRE recursive prerequisite tree fanned out to the LEFT, layered by
 *     longest-path distance so every prerequisite sits in a column left of
 *     everything that needs it;
 *   • the techs that depend on it, fanned out to the RIGHT — the focus's direct
 *     dependents always, plus the dependents of any node the user has EXPANDED
 *     (single-click) via `expandedForward`, so the forward tree grows in place
 *     without hiding anything. Double-click instead RE-FOCUSES (new center).
 * Pure + synchronous (no ELK); same TreeLayout shape as the other layouts, so
 * the renderer reuses the exact same cards + EdgeLayer + viewport transform.
 */
export function layoutFocus(
  snapshot: TechSnapshot,
  focusKey: string,
  expandedForward: Set<string>,
  cardW: number,
  cardH: number,
): TreeLayout {
  const empty: TreeLayout = {
    nodes: [],
    edges: [],
    bands: [],
    width: 0,
    height: 0,
  };
  const focus = snapshot.techs[focusKey];
  if (!focus) return empty;

  const COL_W = cardW + COL_EXTRA;
  const ROW_H = cardH + ROW_EXTRA;
  const { childrenByKey } = buildExploreGraph(snapshot);

  // Longest-path distance (in prerequisite hops) from the focus to each
  // recursive ancestor. Longest-path layering guarantees a prereq is always in a
  // column left of every tech that needs it. Cycle-guarded via a path set (the
  // tech graph is a DAG, but never loop forever if the data isn't).
  const dist = new Map<string, number>([[focusKey, 0]]);
  const relax = (key: string, guard: Set<string>): void => {
    const tech = snapshot.techs[key];
    if (!tech || guard.has(key)) return;
    guard.add(key);
    const d = dist.get(key)!;
    for (const p of tech.prerequisites) {
      if (!snapshot.techs[p]) continue;
      if (d + 1 > (dist.get(p) ?? -1)) dist.set(p, d + 1);
      relax(p, guard);
    }
    guard.delete(key);
  };
  relax(focusKey, new Set());

  const focusCol = Math.max(...dist.values()); // deepest ancestor → column 0

  // Column per node: ancestors + focus from `dist` (left of / at focusCol).
  const colOf = new Map<string, number>();
  for (const [key, d] of dist) colOf.set(key, focusCol - d);

  // Forward reveal: place the direct dependents of the focus AND of every node
  // the user has expanded, each one column to the right of its parent. BFS so
  // columns strictly increase along the forward (dependency) direction. The
  // focus is always treated as expanded so its dependents show immediately.
  const forwardQueue: string[] = [];
  for (const key of colOf.keys()) {
    if (key === focusKey || expandedForward.has(key)) forwardQueue.push(key);
  }
  while (forwardQueue.length > 0) {
    const parent = forwardQueue.shift()!;
    const parentCol = colOf.get(parent)!;
    for (const child of childrenByKey.get(parent) ?? []) {
      if (colOf.has(child.key)) continue; // already placed (ancestor/focus/other)
      colOf.set(child.key, parentCol + 1);
      if (expandedForward.has(child.key)) forwardQueue.push(child.key);
    }
  }

  // Group keys by column, stable-sort each, then stack it centered on y = 0.
  const byCol = new Map<number, string[]>();
  for (const [key, col] of colOf) {
    const bucket = byCol.get(col);
    if (bucket) bucket.push(key);
    else byCol.set(col, [key]);
  }

  const nodes: LayoutNode[] = [];
  let minY = Infinity;
  for (const [col, keys] of byCol) {
    keys.sort((a, b) => {
      const ta = snapshot.techs[a];
      const tb = snapshot.techs[b];
      return ta && tb ? compareTechs(ta, tb) : a.localeCompare(b);
    });
    const n = keys.length;
    keys.forEach((key, i) => {
      const tech = snapshot.techs[key];
      if (!tech) return;
      const y = (i - (n - 1) / 2) * ROW_H;
      minY = Math.min(minY, y);
      nodes.push({ key, x: col * COL_W, y, w: cardW, h: cardH, tech });
    });
  }
  // Normalise y so the topmost card sits at 0 (the canvas has no negative space).
  const shift = Number.isFinite(minY) ? -minY : 0;
  for (const node of nodes) node.y += shift;

  // Edges: for every placed node, an edge from each of its prerequisites that is
  // ALSO placed. This single rule draws both the ancestry tree (left) and the
  // forward dependent tree (right), since a dependent lists its parent as a
  // prereq. `sections: []` → EdgeLayer draws its own elbow.
  const placed = new Set(colOf.keys());
  const edges: LayoutEdge[] = [];
  for (const key of placed) {
    const tech = snapshot.techs[key];
    if (!tech) continue;
    for (const p of tech.prerequisites) {
      if (placed.has(p)) edges.push({ from: p, to: key, sections: [] });
    }
  }

  let width = 0;
  let height = 0;
  for (const node of nodes) {
    width = Math.max(width, node.x + node.w);
    height = Math.max(height, node.y + node.h);
  }
  return { nodes, edges, bands: [], width, height };
}
