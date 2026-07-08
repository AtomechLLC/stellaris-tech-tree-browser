import { useEffect, useState, type CSSProperties } from "react";
import type { DirectedGraph } from "graphology";
import { fetchSnapshot } from "./lib/data/fetchSnapshot";
import { buildGraph } from "./lib/graph/buildGraph";
import { layoutGraph } from "./lib/graph/layout";
import { TechTreeCanvas } from "./components/TechTreeCanvas";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; graph: DirectedGraph };

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchSnapshot()
      .then(async (snapshot) => {
        if (cancelled) return;
        const graph = buildGraph(snapshot);
        // D-08: layout is computed once here, inside the loading state,
        // before the graph is ever handed to Sigma — this is the one-shot
        // elkjs computation (tier partition + area-band Y-remap); pan/zoom
        // never re-invokes it. A throw here falls into the catch below and
        // renders the existing error state, not a blank screen.
        await layoutGraph(graph);
        if (cancelled) return;
        setState({ status: "ready", graph });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div style={centeredStyle}>
        <p>Loading…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div style={centeredStyle}>
        <p>Couldn&apos;t load the tech tree: {state.message}</p>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <TechTreeCanvas graph={state.graph} />
    </div>
  );
}

const centeredStyle: CSSProperties = {
  height: "100vh",
  width: "100vw",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "sans-serif",
};
