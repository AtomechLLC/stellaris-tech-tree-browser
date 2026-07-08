import type { DirectedGraph } from "graphology";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";

/**
 * Post-layout Y-remap grouping nodes into three horizontal area bands
 * (physics / society / engineering).
 *
 * ELK has no native swim-lane mechanism for this axis (RESEARCH Pitfall 3 /
 * Open Q2) — `elk.partitioning` only covers the tier (x) column axis.
 * ELK's own computed `y` optimizes purely for edge-crossing minimization
 * within a layer and has no awareness of `area`; this function discards
 * that global-y meaning while PRESERVING each node's *relative* y-order
 * within its own area group (a stable sort by ELK's y), then offsets each
 * group into a fixed, non-overlapping vertical band. x is left untouched —
 * it is authoritative from ELK's tier-partitioned layout.
 *
 * Per RESEARCH Open Q2's recommendation: implement the sort-stable remap
 * first (simplest, preserves ELK's crossing-minimization quality); only add
 * a secondary sort if the real 678-node render looks poor. (See SUMMARY for
 * the visual-inspection verdict recorded for this plan.)
 */

// Claude's Discretion (CONTEXT.md): area ordering top-to-bottom and the
// vertical band height/gap. Physics/society/engineering order matches the
// order the game itself lists the three research areas in.
const AREA_ORDER = ["physics", "society", "engineering"] as const;
const BAND_HEIGHT = 4000; // graph-space units per area band
const BAND_GAP = 400; // gap between adjacent bands so rings never touch across areas

export function remapAreaBands(graph: DirectedGraph, elkResult: ElkNode): void {
  const elkNodesById = new Map((elkResult.children ?? []).map((child) => [child.id, child]));

  // Group node keys by area, carrying ELK's own computed y for stable sort.
  const groups = new Map<string, { key: string; elkY: number }[]>();
  graph.forEachNode((key) => {
    const area = graph.getNodeAttribute(key, "area") as string;
    const elkChild = elkNodesById.get(key);
    const elkY = elkChild?.y ?? 0;
    const list = groups.get(area);
    if (list) {
      list.push({ key, elkY });
    } else {
      groups.set(area, [{ key, elkY }]);
    }
  });

  AREA_ORDER.forEach((area, bandIndex) => {
    const members = groups.get(area);
    if (!members) return;

    // Stable sort by ELK's own y — preserves crossing-minimization ordering
    // within this area's group.
    members.sort((a, b) => a.elkY - b.elkY);

    const bandTop = bandIndex * (BAND_HEIGHT + BAND_GAP);
    const minElkY = Math.min(...members.map((m) => m.elkY));
    const maxElkY = Math.max(...members.map((m) => m.elkY));
    const elkSpan = maxElkY - minElkY || 1;

    for (const { key, elkY } of members) {
      // Normalize this node's relative position within its area group's ELK
      // y-span, then scale into this band's fixed height.
      const relative = (elkY - minElkY) / elkSpan;
      const y = bandTop + relative * BAND_HEIGHT;

      const elkChild = elkNodesById.get(key);
      const x = elkChild?.x ?? 0;

      graph.setNodeAttribute(key, "x", x);
      graph.setNodeAttribute(key, "y", y);
    }
  });
}
