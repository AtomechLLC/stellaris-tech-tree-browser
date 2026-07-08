import { useEffect, useState } from "react";
import { useSigma } from "@react-sigma/core";
import { getLaneGeometry } from "../lib/graph/swimlanes";
import { categoryLabel, CATEGORY_INDEX } from "../lib/graph/categories";

interface ProjectedLane {
  category: string;
  area: string;
  /** Viewport y of the lane's top edge. */
  topY: number;
  /** Viewport y of the lane's bottom edge. */
  bottomY: number;
  /** Viewport y of the lane's center (label anchor). */
  centerY: number;
  /** Alternating flag for the subtle striped background. */
  striped: boolean;
}

/**
 * Camera-synced category-swimlane axis (quick 260707-we6 Task 4). Modeled on
 * TierAxis.tsx: re-projects the 13 lanes' graph-space geometry
 * (getLaneGeometry from swimlanes.ts) to viewport Y on every camera "updated"
 * and on "resize", rAF-coalesced. Pure re-projection — never re-runs layout.
 *
 * Renders, on the LEFT edge, each category's display label at its lane center,
 * plus faint alternating background bands spanning each lane's top→bottom Y.
 */
export function CategoryAxis() {
  const sigma = useSigma();
  const [lanes, setLanes] = useState<ProjectedLane[]>([]);

  useEffect(() => {
    const camera = sigma.getCamera();
    let rafId = 0;

    function reproject() {
      const geometry = getLaneGeometry();
      // Lane geometry is populated by layoutGraph() before the graph is handed
      // to Sigma; if it is somehow empty (no layout yet) render nothing rather
      // than throw.
      if (geometry.length === 0) {
        setLanes((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      setLanes(
        geometry.map((lane) => {
          // Project the lane's top and bottom graph-y (x=0 — labels/bands live
          // on the left axis strip) to viewport y.
          const topY = sigma.graphToViewport({ x: 0, y: lane.top }).y;
          const bottomY = sigma.graphToViewport({ x: 0, y: lane.top + lane.height }).y;
          const centerY = sigma.graphToViewport({ x: 0, y: lane.center }).y;
          return {
            category: lane.category,
            area: lane.area,
            topY,
            bottomY,
            centerY,
            striped: CATEGORY_INDEX[lane.category] % 2 === 1,
          };
        }),
      );
    }

    function schedule() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        reproject();
      });
    }

    reproject();
    camera.on("updated", reproject);
    sigma.on("resize", reproject);
    // Recompute once more after mount in case layout/geometry settles a tick
    // later than this effect (parallels TierAxis's nodeAdded coalescing).
    schedule();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      camera.removeListener("updated", reproject);
      sigma.removeListener("resize", reproject);
    };
  }, [sigma]);

  return (
    <>
      {/* Background bands span the full width; labels sit on the left strip. */}
      <div className="category-bands" role="presentation">
        {lanes.map((lane) => (
          <div
            key={lane.category}
            className={`category-band${lane.striped ? " category-band--striped" : ""}`}
            data-area={lane.area}
            style={{
              top: `${lane.topY}px`,
              height: `${Math.max(0, lane.bottomY - lane.topY)}px`,
            }}
          />
        ))}
      </div>
      <div className="category-axis" role="presentation">
        {lanes.map((lane) => (
          <span
            key={lane.category}
            className="category-axis__label"
            data-area={lane.area}
            style={{ top: `${lane.centerY}px` }}
          >
            {categoryLabel(lane.category)}
          </span>
        ))}
      </div>
    </>
  );
}
