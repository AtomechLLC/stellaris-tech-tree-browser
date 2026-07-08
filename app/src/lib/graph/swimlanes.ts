import type { DirectedGraph } from "graphology";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import {
  CATEGORY_ORDER,
  CATEGORY_AREA,
  CATEGORY_INDEX,
  type CategoryKey,
} from "./categories";

/**
 * Post-layout Y-remap grouping nodes into 13 horizontal CATEGORY swimlanes,
 * nested within the 3 research areas (physics / society / engineering),
 * generalizing the former 3-band area remap (areaBands.ts).
 *
 * ELK has no native swim-lane mechanism for this axis (RESEARCH Pitfall 3 /
 * Open Q2) — `elk.partitioning` only covers the tier (x) column axis. ELK's
 * own computed `y` optimizes purely for edge-crossing minimization within a
 * layer and has no awareness of `area`/`category`; this function discards that
 * global-y meaning while PRESERVING each node's *relative* y-order within its
 * own category lane (a stable sort by ELK's y), then offsets each lane into a
 * fixed, non-overlapping vertical slot. x is left untouched — it is
 * authoritative from ELK's tier-partitioned layout.
 *
 * Unlike the fixed-height area bands, each lane's HEIGHT scales to its member
 * count (with a MIN floor) so biology (121 techs) gets room while
 * archaeostudies / psionics (24 each) aren't vertically stretched.
 *
 * ── Tuning knobs (graph-space units) ─────────────────────────────────────
 */
/** Vertical pixels-per-graph-unit allotted to each node in a lane. */
const PER_NODE = 60;
/** Minimum lane height so tiny lanes still read as a band (graph units). */
const MIN_LANE = 400;
/** Gap between adjacent lanes within the same area. */
const LANE_GAP = 120;
/** Extra gap inserted between two different areas (added on top of LANE_GAP). */
const AREA_GAP = 320;

/** One swimlane's geometry in graph-space, consumed by CategoryAxis (Task 4). */
export interface LaneGeometry {
  category: CategoryKey;
  area: string;
  /** Top edge of the lane's vertical slot (graph-space y). */
  top: number;
  /** Height of the lane's vertical slot (graph-space units). */
  height: number;
  /** Vertical center of the lane (graph-space y) — label anchor. */
  center: number;
}

// Module-level store of the most recently computed lane geometry. The layout
// is a one-shot computation (App.tsx runs it once inside the loading state),
// so a single module-level snapshot is sufficient for the axis/background
// overlay to read via getLaneGeometry() after layout completes. Kept here
// (not React state) because it is pure derived layout data, not UI state.
let laneGeometry: LaneGeometry[] = [];

/** Returns the lane geometry computed by the last remapSwimlanes() call. */
export function getLaneGeometry(): LaneGeometry[] {
  return laneGeometry;
}

/**
 * Remaps every node's y into its category swimlane and returns (and stores)
 * the computed per-lane geometry. Area order top→bottom follows
 * CATEGORY_ORDER's grouping (physics → society → engineering), which the
 * layout tests assert.
 */
export function remapSwimlanes(graph: DirectedGraph, elkResult: ElkNode): LaneGeometry[] {
  const elkNodesById = new Map((elkResult.children ?? []).map((child) => [child.id, child]));

  // Group node keys by category, carrying ELK's own computed y for stable sort.
  const groups = new Map<string, { key: string; elkY: number }[]>();
  graph.forEachNode((key) => {
    const category = graph.getNodeAttribute(key, "category") as string;
    const elkChild = elkNodesById.get(key);
    const elkY = elkChild?.y ?? 0;
    const list = groups.get(category);
    if (list) {
      list.push({ key, elkY });
    } else {
      groups.set(category, [{ key, elkY }]);
    }
  });

  const geometry: LaneGeometry[] = [];
  let cursor = 0; // running top edge as we stack lanes downward
  let prevArea: string | null = null;

  for (const category of CATEGORY_ORDER) {
    const area = CATEGORY_AREA[category];
    const members = groups.get(category) ?? [];

    // Insert the between-lane gap, plus an extra area gap when the area changes.
    if (prevArea !== null) {
      cursor += LANE_GAP;
      if (area !== prevArea) cursor += AREA_GAP;
    }
    prevArea = area;

    const height = Math.max(MIN_LANE, members.length * PER_NODE);
    const top = cursor;
    const center = top + height / 2;

    if (members.length > 0) {
      // Stable sort by ELK's own y — preserves crossing-minimization ordering
      // within this lane's group.
      members.sort((a, b) => a.elkY - b.elkY);

      const minElkY = Math.min(...members.map((m) => m.elkY));
      const maxElkY = Math.max(...members.map((m) => m.elkY));
      const elkSpan = maxElkY - minElkY || 1;

      // Inset so nodes don't sit exactly on the lane's top/bottom edge.
      const inset = Math.min(height * 0.12, PER_NODE / 2);
      const usable = Math.max(height - inset * 2, 1);

      for (const { key, elkY } of members) {
        const relative = (elkY - minElkY) / elkSpan;
        const y = top + inset + relative * usable;

        const elkChild = elkNodesById.get(key);
        const x = elkChild?.x ?? 0;

        graph.setNodeAttribute(key, "x", x);
        graph.setNodeAttribute(key, "y", y);
      }
    }

    geometry.push({ category, area, top, height, center });
    cursor = top + height;
  }

  // Sort geometry by CATEGORY_ORDER rank for deterministic, stable output
  // (the loop already produces this order, but be explicit for consumers).
  geometry.sort((a, b) => CATEGORY_INDEX[a.category] - CATEGORY_INDEX[b.category]);

  laneGeometry = geometry;
  return geometry;
}
