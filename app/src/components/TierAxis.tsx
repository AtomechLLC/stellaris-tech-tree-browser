import { useEffect, useState } from "react";
import { useSigma } from "@react-sigma/core";

interface TierLabel {
  tier: number;
  screenX: number;
}

/**
 * Camera-synced tier-axis header (D-09/TREE-04): re-projects each tier
 * column's representative graph-x to a screen-x on every camera update
 * (pan/zoom) and on resize, so the tier-axis strip stays aligned with the
 * actual rendered node columns without ever recomputing layout (D-10 — pure
 * camera-transform re-projection, no re-layout, no per-frame React work
 * beyond this cheap coordinate conversion).
 */
export function TierAxis() {
  const sigma = useSigma();
  const [labels, setLabels] = useState<TierLabel[]>([]);

  useEffect(() => {
    const graph = sigma.getGraph();
    const camera = sigma.getCamera();

    // Each tier's representative graph-x = min x per tier (ELK's tier-partition
    // guarantees monotonic columns, so min-x is a stable column anchor, D-06).
    // Recomputed whenever the graph's node set changes rather than once on
    // mount, so the axis is correct regardless of whether nodes are already
    // loaded when this effect runs or arrive afterward via GraphLoader — no
    // reliance on sibling-effect ordering (WR-04).
    let anchors: Array<[number, number]> = [];
    let rafId = 0;

    function reproject() {
      setLabels(
        anchors.map(([tier, graphX]) => ({
          tier,
          screenX: sigma.graphToViewport({ x: graphX, y: 0 }).x,
        })),
      );
    }

    function recomputeAnchors() {
      const minXByTier = new Map<number, number>();
      graph.forEachNode((_key, attrs) => {
        const tier = attrs.tier as number;
        const x = attrs.x as number;
        const current = minXByTier.get(tier);
        if (current === undefined || x < current) minXByTier.set(tier, x);
      });
      anchors = [...minXByTier.entries()].sort((a, b) => a[0] - b[0]);
      reproject();
    }

    // Coalesce the burst of per-node "nodeAdded" events from a graph import
    // into a single recompute on the next frame (O(n), not O(n^2)).
    function scheduleRecompute() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        recomputeAnchors();
      });
    }

    recomputeAnchors();
    graph.on("nodeAdded", scheduleRecompute);
    graph.on("cleared", scheduleRecompute);
    camera.on("updated", reproject);
    sigma.on("resize", reproject);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      graph.removeListener("nodeAdded", scheduleRecompute);
      graph.removeListener("cleared", scheduleRecompute);
      camera.removeListener("updated", reproject);
      sigma.removeListener("resize", reproject);
    };
  }, [sigma]);

  return (
    <div className="tier-axis" role="presentation">
      {labels.map(({ tier, screenX }) => (
        <span
          key={tier}
          className="tier-axis__label"
          style={{ left: `${screenX}px` }}
        >
          Tier {tier}
        </span>
      ))}
    </div>
  );
}
