import { useCallback, useEffect, useRef, useState } from "react";
import type { TechSnapshot } from "./types/tech-snapshot";
import {
  fetchSnapshot,
  fetchVersionManifest,
  resolveDataVersion,
  VERSION_PREF_KEY,
  type VersionEntry,
} from "./lib/data/fetchSnapshot";
import { TechTree, type TechTreeHandle } from "./components/TechTree";
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
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [retryToken, setRetryToken] = useState(0);
  // TechTree lives outside Header in the tree, but the header's What's-new
  // panel needs to trigger a jump — imperative handle bridges the two siblings.
  const techTreeRef = useRef<TechTreeHandle>(null);
  const onJumpToTech = useCallback((key: string) => {
    techTreeRef.current?.jumpToTech(key);
  }, []);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRetryToken((t) => t + 1);
  }, []);

  // Version selector: persist the choice (returning users keep it; first-time
  // visitors default to latest), stamp it into the URL (`?ver=` — shareable,
  // and it wins over the stored preference on load), then hard-reload. A full
  // reload (rather than re-fetch + re-layout in place) keeps every downstream
  // consumer of the snapshot — layout, URL restore, Saved Empire state —
  // trivially consistent, and switching versions is a rare, deliberate act.
  const onSelectVersion = useCallback((dir: string) => {
    try {
      localStorage.setItem(VERSION_PREF_KEY, dir);
    } catch {
      /* storage unavailable — the URL param below still carries the choice */
    }
    const url = new URL(window.location.href);
    url.searchParams.set("ver", dir);
    if (url.href === window.location.href) window.location.reload();
    else window.location.href = url.href;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Discover available versions, then load the preferred/latest one.
        const manifest = await fetchVersionManifest();
        if (cancelled) return;
        if (manifest) setVersions(manifest.versions);
        const snapshot = await fetchSnapshot(resolveDataVersion(manifest));
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
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
      }
    })();

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
        versions={versions}
        onSelectVersion={onSelectVersion}
        onJumpToTech={state.status === "ready" ? onJumpToTech : undefined}
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
          <TechTree ref={techTreeRef} snapshot={state.snapshot} />
        </ErrorBoundary>
      )}
    </div>
  );
}
