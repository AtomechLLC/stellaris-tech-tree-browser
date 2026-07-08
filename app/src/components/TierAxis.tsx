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

    // Derive each tier's representative graph-x once from the laid-out
    // nodes (min x per tier — ELK's tier-partition guarantees monotonic
    // columns, so min-x is a stable representative screen position for the
    // whole column, D-06).
    const minXByTier = new Map<number, number>();
    graph.forEachNode((_key, attrs) => {
      const tier = attrs.tier as number;
      const x = attrs.x as number;
      const current = minXByTier.get(tier);
      if (current === undefined || x < current) minXByTier.set(tier, x);
    });
    const tiers = [...minXByTier.entries()].sort((a, b) => a[0] - b[0]);

    function reproject() {
      setLabels(
        tiers.map(([tier, graphX]) => ({
          tier,
          screenX: sigma.graphToViewport({ x: graphX, y: 0 }).x,
        })),
      );
    }

    reproject();

    const camera = sigma.getCamera();
    camera.on("updated", reproject);
    sigma.on("resize", reproject);

    return () => {
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
