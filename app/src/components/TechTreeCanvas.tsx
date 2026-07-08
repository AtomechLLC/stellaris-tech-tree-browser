import { useEffect } from "react";
import type { DirectedGraph } from "graphology";
import { SigmaContainer, useLoadGraph, useSigma } from "@react-sigma/core";
import type { Settings } from "sigma/settings";
import { NodeCompoundProgram } from "../lib/sigma/nodeProgram";
import { readThemeTokens } from "../lib/sigma/theme";
import { TierAxis } from "./TierAxis";
import { TechCardOverlay } from "./TechCardOverlay";
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
    // Sigma measures the container synchronously during React's commit, before
    // the browser performs the flex-layout pass that sizes `.canvas-region` —
    // so it can read a 0-width container and throw "Sigma: Container has no
    // width", crashing the whole subtree. Allowing an invalid container lets
    // Sigma construct anyway and auto-resize once the container gains real
    // dimensions (Sigma listens for resize). Documented fix for this
    // construction-timing race in a CSS-flex layout.
    allowInvalidContainer: true,
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
  const sigma = useSigma();

  useEffect(() => {
    loadGraph(graph);
    // Sigma may have constructed against a 0-sized container
    // (allowInvalidContainer) and stayed at a 1x1 canvas. This effect runs
    // post-layout, when `.canvas-region` has its real flex dimensions, so
    // force Sigma to re-measure and resize its canvases to fill it — then
    // reframe the camera so the whole tree is visible. A second pass on the
    // next frame covers the case where flex layout settles a tick later.
    function fit() {
      sigma.resize();
      sigma.getCamera().animatedReset({ duration: 0 });
    }
    fit();
    const raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
  }, [graph, loadGraph, sigma]);

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
        <TechCardOverlay graph={graph} />
      </SigmaContainer>
      <Legend />
    </div>
  );
}
