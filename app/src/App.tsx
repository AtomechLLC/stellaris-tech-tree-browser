import { useEffect, useState, type CSSProperties } from "react";
import type { DirectedGraph } from "graphology";
import { fetchSnapshot } from "./lib/data/fetchSnapshot";
import { buildGraph } from "./lib/graph/buildGraph";
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
      .then((snapshot) => {
        if (cancelled) return;
        const graph = buildGraph(snapshot);
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
