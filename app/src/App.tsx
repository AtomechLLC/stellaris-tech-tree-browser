import { useCallback, useEffect, useState } from "react";
import type { DirectedGraph } from "graphology";
import { fetchSnapshot } from "./lib/data/fetchSnapshot";
import { buildGraph } from "./lib/graph/buildGraph";
import { layoutGraph } from "./lib/graph/layout";
import { TechTreeCanvas } from "./components/TechTreeCanvas";
import { Header } from "./components/Header";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { ErrorOverlay } from "./components/ErrorOverlay";
import { EmptyOverlay } from "./components/EmptyOverlay";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; graph: DirectedGraph; techCount: number };

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRetryToken((t) => t + 1);
  }, []);

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
        setState({
          status: "ready",
          graph,
          techCount: Object.keys(snapshot.techs).length,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  return (
    <div className="app-shell">
      <Header />
      {state.status === "loading" && <LoadingOverlay />}
      {state.status === "error" && <ErrorOverlay onRetry={retry} />}
      {state.status === "ready" && state.techCount === 0 && <EmptyOverlay />}
      {state.status === "ready" && state.techCount > 0 && (
        <TechTreeCanvas graph={state.graph} />
      )}
    </div>
  );
}
