import { useEffect } from "react";
import type { DirectedGraph } from "graphology";
import { SigmaContainer, useLoadGraph } from "@react-sigma/core";
import { createNodeImageProgram } from "@sigma/node-image";
import type { Settings } from "sigma/settings";

// Plain image node program for this slice (TREE-03 full-scale pan/zoom
// benchmark). The compound border+image ring (area color, D-09) is Plan
// 02-03's concern — a plain image node is correct here. `keepWithinCircle`
// (true is the package default) keeps icon art from spilling past the
// node's circular bounds without cropping the pictogram (contain semantics).
const NodeImageProgram = createNodeImageProgram({
  padding: 0.05,
});

// No edgeProgramClasses override and no `hideEdgesOnMove`/suppressing
// setting is configured below, so Sigma's default edge-line program renders
// all 613 prerequisite edges added by buildGraph.ts as-is (Plan 02-02,
// TREE-01). Edge color/opacity tokens (UI-SPEC Edge Visual Spec, D-12
// theming bridge) are Plan 02-03's scope.
const sigmaSettings: Partial<Settings> = {
  defaultNodeType: "image",
  nodeProgramClasses: { image: NodeImageProgram },
};

function GraphLoader({ graph }: { graph: DirectedGraph }) {
  const loadGraph = useLoadGraph();

  useEffect(() => {
    loadGraph(graph);
  }, [graph, loadGraph]);

  return null;
}

export function TechTreeCanvas({ graph }: { graph: DirectedGraph }) {
  return (
    <SigmaContainer settings={sigmaSettings} style={{ width: "100%", height: "100%" }}>
      <GraphLoader graph={graph} />
    </SigmaContainer>
  );
}
