import { useEffect } from "react";
import type { DirectedGraph } from "graphology";
import { SigmaContainer, useLoadGraph } from "@react-sigma/core";
import type { Settings } from "sigma/settings";
import { NodeCompoundProgram } from "../lib/sigma/nodeProgram";
import { readThemeTokens } from "../lib/sigma/theme";
import { TierAxis } from "./TierAxis";
import { Legend } from "./Legend";

const NODE_TYPE = "techNode";

/**
 * Bridges CSS tokens into Sigma settings once, at module load (D-12,
 * RESEARCH Pattern 4) — edge/label colors and the compound node program are
 * all sourced from tokens.css, never a hardcoded hex. Edge opacity (UI-SPEC
 * Edge Visual Spec: --color-edge @ 0.5 opacity) is baked into an rgba()
 * string derived from the bridged hex, since Sigma's edge-line program reads
 * a single CSS-color-format `color` value per edge/setting — there is no
 * separate opacity setting to combine with a hex color.
 */
function buildSigmaSettings(): Partial<Settings> {
  const tokens = readThemeTokens();
  const edgeColorWithOpacity = hexToRgba(tokens.edge, 0.5);

  return {
    defaultNodeType: NODE_TYPE,
    nodeProgramClasses: { [NODE_TYPE]: NodeCompoundProgram },
    defaultEdgeColor: edgeColorWithOpacity,
    labelColor: { color: tokens.text },
    labelFont: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    // Sigma's default zoom-based label hiding is accepted as-is (D-10) — no
    // renderLabels/labelRenderedSizeThreshold override needed.
  };
}

/**
 * Alpha-composites a hex token into an `rgba()` string. Robust to token drift
 * (WR-01): expands 3-digit shorthand and, for any value that is NOT a plain
 * 3-/6-digit hex (a named color, an already-rgb() token, a future dark-theme
 * value), returns it verbatim rather than emitting `rgba(NaN, NaN, NaN, a)` —
 * the edge then renders at full opacity in that color, a graceful degradation
 * instead of a broken (black/blank) edge layer.
 */
function hexToRgba(hex: string, alpha: number): string {
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function GraphLoader({ graph }: { graph: DirectedGraph }) {
  const loadGraph = useLoadGraph();

  useEffect(() => {
    loadGraph(graph);
  }, [graph, loadGraph]);

  return null;
}

export function TechTreeCanvas({ graph }: { graph: DirectedGraph }) {
  return (
    <div className="canvas-region">
      <SigmaContainer
        settings={buildSigmaSettings()}
        style={{ width: "100%", height: "100%" }}
      >
        <GraphLoader graph={graph} />
        <TierAxis />
      </SigmaContainer>
      <Legend />
    </div>
  );
}
