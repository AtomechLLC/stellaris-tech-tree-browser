import { useCallback, useEffect, useState } from "react";
import type { TechSnapshot } from "./types/tech-snapshot";
import { fetchSnapshot } from "./lib/data/fetchSnapshot";
import { TechTree } from "./components/TechTree";
import { Header } from "./components/Header";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { ErrorOverlay } from "./components/ErrorOverlay";
import { EmptyOverlay } from "./components/EmptyOverlay";
import { ErrorBoundary } from "./components/ErrorBoundary";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: TechSnapshot; techCount: number };

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
      .then((snapshot) => {
        if (cancelled) return;
        // The one-shot ELK layout now runs inside <TechTree> (in its own
        // loading state) — App only fetches + shape-validates the snapshot and
        // hands it down. A fetch/parse throw falls into the catch below and
        // renders the error state, not a blank screen.
        setState({
          status: "ready",
          snapshot,
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

  const version =
    state.status === "ready"
      ? (state.snapshot.meta.versionLabel ?? state.snapshot.meta.gameVersion)
      : undefined;

  return (
    <div className="app-shell">
      <Header
        version={version}
        dataVersion={state.status === "ready" ? state.snapshot.meta.gameVersion : undefined}
      />
      {state.status === "loading" && <LoadingOverlay />}
      {state.status === "error" && <ErrorOverlay onRetry={retry} />}
      {state.status === "ready" && state.techCount === 0 && <EmptyOverlay />}
      {state.status === "ready" && state.techCount > 0 && (
        <ErrorBoundary
          fallback={(_error, reset) => (
            <ErrorOverlay
              onRetry={() => {
                reset();
                retry();
              }}
            />
          )}
        >
          <TechTree snapshot={state.snapshot} />
        </ErrorBoundary>
      )}
    </div>
  );
}
