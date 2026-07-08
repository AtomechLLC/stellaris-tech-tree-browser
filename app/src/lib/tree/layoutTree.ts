import ELK from "elkjs/lib/elk.bundled.js";
import type {
  ElkNode,
  ElkExtendedEdge,
  ElkEdgeSection,
} from "elkjs/lib/elk.bundled.js";
import type { TechSnapshot, Tech } from "../../types/tech-snapshot";
import {
  CATEGORY_ORDER,
  CATEGORY_AREA,
  categoryLabel,
  type CategoryKey,
} from "../graph/categories";

/**
 * Zero-config in-process ELK instance (RESEARCH Pattern 3 / Pitfall 4): no
 * workerUrl/workerFactory. elk.bundled.js's fake-worker fallback runs the
 * layout computation on the main JS thread while still returning a Promise
 * (so `await` works unchanged) — this sidesteps the documented Vite +
 * real-Web-Worker bundling failure class. Do NOT wire a real Worker here.
 */
const elk = new ELK();

/**
 * A single positioned tech node in the computed layout. `(x, y)` is the
 * top-left corner in the shared canvas coordinate space (the same space the
 * `.tree-canvas` CSS transform operates in), so a `.tech-card` can be
 * positioned by `left:x; top:y` and an SVG edge drawn in the same units — no
 * projection, no per-frame sync.
 */
export interface LayoutNode {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tech: Tech;
  /**
   * Explore-mode only: this node has ≥1 shown-eligible child, so a chevron
   * toggle is rendered on its card. Unused by the banded map layout (which
   * leaves it undefined) — the map card renders no chevron.
   */
  expandable?: boolean;
  /**
   * Explore-mode only: this node is currently expanded (in `expandedKeys`), so
   * its chevron reads "open" and its children are visible below-right. Unused
   * by the map layout.
   */
  expanded?: boolean;
}

/**
 * A single routed prerequisite edge. `sections` is ELK's orthogonal edge
 * routing (each section carries a startPoint, optional bendPoints, and an
 * endPoint) — the SVG edge layer draws elbow connectors directly from these
 * bend points. `sections` is empty only when ELK returned no routing (the
 * renderer then falls back to a straight source-right → target-left elbow).
 */
export interface LayoutEdge {
  from: string;
  to: string;
  sections: ElkEdgeSection[];
}

/**
 * A single category swimlane band in the remapped layout. `top`/`height` bound
 * a contiguous horizontal strip (in the same canvas coordinate space as the
 * nodes) that holds exactly the techs of `category`; the band's top strip is
 * reserved for the `label`. `area` drives the faint background tint + label
 * color (via the `--area-*` tokens). Bands never overlap and stack in
 * CATEGORY_ORDER (grouped by area: physics → society → engineering).
 */
export interface BandGeometry {
  category: string;
  area: string;
  label: string;
  top: number;
  height: number;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** One band per non-empty (active) category, in CATEGORY_ORDER. */
  bands: BandGeometry[];
  /** Total layout extent (graph-space) — used to size `.tree-canvas`. */
  width: number;
  height: number;
}

// Banded-layout geometry constants. COL_W/ROW_H are derived from the card size
// so tier columns and stacked rows always clear the real DOM cards.
const COL_EXTRA = 110; // horizontal gutter between tier columns
const ROW_EXTRA = 20; // vertical gutter between stacked rows within a band
const BAND_LABEL_H = 30; // top strip of each band reserved for its label
const BAND_GAP = 44; // vertical gap between adjacent bands
const BAND_PAD_BOTTOM = 12; // padding below the last row inside a band
const TIER_COUNT = 6; // tiers 0..5

/**
 * Builds the ELK graph directly from the tech snapshot: one ELK child per
 * tech (sized to the real card so ELK spaces cards without overlap and pins
 * each into its tier column via partitioning), one ELK edge per prerequisite
 * pair where BOTH techs exist (dangling guard mirrors buildGraph's D-16
 * contract check). Root options request the layered LR layout with orthogonal
 * edge routing so ELK returns elbow bend points for the connectors.
 */
function buildElkGraph(techs: Tech[], cardW: number, cardH: number): ElkNode {
  const children: ElkNode[] = [];
  // Only techs in this (possibly filtered) set are laid out — edges to any tech
  // outside the set are dropped so ELK never references a missing node.
  const present = new Set(techs.map((t) => t.key));

  for (const tech of techs) {
    children.push({
      id: tech.key,
      width: cardW,
      height: cardH,
      layoutOptions: {
        // Pins this node into its tier column — requires the root's
        // `elk.partitioning.activate: "true"` below, or it is silently
        // ignored (RESEARCH Pattern 2 Gotcha). Tier comes from the game's
        // own `tier` field (D-06), not edge-inferred.
        "elk.partitioning.partition": String(tech.tier),
      },
    });
  }

  const edges: ElkExtendedEdge[] = [];
  let edgeIndex = 0;
  for (const tech of techs) {
    for (const prereqKey of tech.prerequisites) {
      // D-07: every prerequisite is a real DAG edge (prereq -> dependent).
      // A prereq outside the active set (filtered out) is simply skipped —
      // not a contract violation. A prereq that exists nowhere in the corpus
      // never happens for a valid tech.json (SCHEMA.md D-16 strict-fail); the
      // caller logs those, so here we only include edges whose endpoints are
      // both in the laid-out set.
      if (present.has(prereqKey)) {
        edges.push({
          id: `e${edgeIndex++}`,
          sources: [prereqKey],
          targets: [tech.key],
        });
      }
    }
  }

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT", // tier 0 (left) -> tier 5 (right), per D-06
      "elk.partitioning.activate": "true",
      // Disabling separate-connected-components keeps a single GLOBAL tier
      // ordering across the whole DAG (the tech graph has many disconnected
      // leaf components; the default repacks them side-by-side and breaks
      // global tier monotonicity). Carried over from the old layout.ts,
      // verified against the real 678-node/613-edge corpus.
      "elk.separateConnectedComponents": "false",
      // Perf tuning from the old layout.ts: solving the full graph as one
      // layered problem is expensive; thoroughness=1 keeps crossing-min
      // iterations low (~6.5s vs ~26-32s at default) with identical
      // partition correctness (02-02-SUMMARY D-08 benchmark).
      "elk.layered.thoroughness": "1",
      // Orthogonal routing so ELK returns elbow bend points for connectors —
      // the SVG edge layer draws reference-style elbows from these.
      "elk.edgeRouting": "ORTHOGONAL",
      // Generous spacing (cards are ~230x92) so tier columns are readable and
      // cards never overlap.
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "24",
    },
    children,
    edges,
  };
}

/** The category key a tech belongs to (its first category, or ""). */
function categoryOf(tech: Tech): string {
  return tech.category[0] ?? "";
}

/**
 * Computes the banded tech-tree layout. ELK's layered LR layout is run purely
 * to get a good vertical ORDER per node (crossing-minimized) — its absolute
 * positions are then discarded and every node is REMAPPED into a category
 * swimlane band: x is tier-aligned globally (`tier * COL_W`), and within each
 * (band, tier) the nodes stack by their ELK y so related techs stay near each
 * other. Bands stack in CATEGORY_ORDER (grouped by area: physics → society →
 * engineering), each with a reserved top strip for its label. Returns node
 * top-left positions + card sizes + band geometry + the total extent, all in
 * one shared coordinate space.
 *
 * Because positions no longer match ELK's routing, every edge is returned with
 * `sections: []` — the SVG edge layer then draws a clean source-right →
 * target-left elbow between the remapped positions.
 *
 * `cardW`/`cardH` MUST match the rendered `.tech-card` size so positions line
 * up with the DOM cards exactly. `activeCategories` (optional) restricts the
 * layout to just those categories — so "re-pack" on a subset lays out and
 * bands only the visible categories, closing the gaps.
 */
export async function layoutTree(
  snapshot: TechSnapshot,
  cardW: number,
  cardH: number,
  activeCategories?: Set<string>,
): Promise<TreeLayout> {
  const COL_W = cardW + COL_EXTRA;
  const ROW_H = cardH + ROW_EXTRA;

  const allTechs = Object.values(snapshot.techs);

  // Log dangling prerequisites once over the full corpus (contract check,
  // SCHEMA.md D-16) — independent of any active-category filtering below.
  for (const tech of allTechs) {
    for (const prereqKey of tech.prerequisites) {
      if (!snapshot.techs[prereqKey]) {
        console.error(
          `layoutTree: dangling prerequisite reference "${prereqKey}" on tech "${tech.key}" — contract violation (SCHEMA.md D-16)`,
        );
      }
    }
  }

  // Filter to the active categories (default = all) BEFORE building the ELK
  // graph, so a re-pack on a subset lays out only those techs.
  const techs =
    activeCategories && activeCategories.size > 0
      ? allTechs.filter((t) => activeCategories.has(categoryOf(t)))
      : allTechs;

  const elkGraph = buildElkGraph(techs, cardW, cardH);
  const result = (await elk.layout(elkGraph)) as ElkNode;

  // ELK y per node — used only as the intra-(band, tier) stacking ORDER.
  const elkY = new Map<string, number>();
  for (const child of result.children ?? []) {
    elkY.set(child.id, child.y ?? 0);
  }

  // Group the laid-out techs by category.
  const byCategory = new Map<string, Tech[]>();
  for (const tech of techs) {
    const cat = categoryOf(tech);
    const bucket = byCategory.get(cat);
    if (bucket) bucket.push(tech);
    else byCategory.set(cat, [tech]);
  }

  const nodes: LayoutNode[] = [];
  const bands: BandGeometry[] = [];
  let cursorY = 0;

  // Iterate categories in CATEGORY_ORDER (area-grouped) so bands stack
  // physics → society → engineering; skip empty categories.
  for (const category of CATEGORY_ORDER) {
    const bandTechs = byCategory.get(category);
    if (!bandTechs || bandTechs.length === 0) continue;

    const area = CATEGORY_AREA[category as CategoryKey];
    const contentTop = cursorY + BAND_LABEL_H;
    let contentH = 0;

    for (let tier = 0; tier < TIER_COUNT; tier++) {
      const tierTechs = bandTechs
        .filter((t) => t.tier === tier)
        .sort((a, b) => (elkY.get(a.key) ?? 0) - (elkY.get(b.key) ?? 0));

      tierTechs.forEach((tech, rowIndex) => {
        nodes.push({
          key: tech.key,
          x: tier * COL_W,
          y: contentTop + rowIndex * ROW_H,
          w: cardW,
          h: cardH,
          tech,
        });
      });

      contentH = Math.max(contentH, tierTechs.length * ROW_H);
    }

    const bandHeight = BAND_LABEL_H + contentH + BAND_PAD_BOTTOM;
    bands.push({
      category,
      area,
      label: categoryLabel(category),
      top: cursorY,
      height: bandHeight,
    });

    cursorY = cursorY + bandHeight + BAND_GAP;
  }

  // Positions are remapped from ELK's, so its bend points are stale — drop all
  // routing and let the edge layer draw elbows between the new positions.
  const present = new Set(nodes.map((n) => n.key));
  const edges: LayoutEdge[] = [];
  for (const tech of techs) {
    for (const prereqKey of tech.prerequisites) {
      if (present.has(prereqKey) && present.has(tech.key)) {
        edges.push({ from: prereqKey, to: tech.key, sections: [] });
      }
    }
  }

  return {
    nodes,
    edges,
    bands,
    width: TIER_COUNT * COL_W,
    height: cursorY,
  };
}
