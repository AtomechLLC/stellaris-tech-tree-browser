import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TechSnapshot } from "../types/tech-snapshot";
import type { SavedEmpire } from "../lib/empire/savLoad";
import { buildTechLite, classifyEmpire, type Bucket } from "../lib/empire/classifyEmpire";

/**
 * Saved Empire tab (spike 005) — left panel. Loads a `.sav` client-side, lists
 * empires, and on selection classifies every tech into four buckets, handing the
 * `bucketMap` up to <TechTree> which recolors the cards. Pure spike UI: minimal
 * chrome, a "sample save" affordance for quick testing.
 */

const BUCKETS: { key: Bucket; label: string; hint: string }[] = [
  { key: "researched", label: "Researched", hint: "thick border" },
  { key: "available", label: "Available now", hint: "lit up" },
  { key: "reachable", label: "Reachable later", hint: "faded" },
  { key: "never", label: "Never", hint: "greyscale" },
];

interface EmpirePanelProps {
  snapshot: TechSnapshot;
  onBuckets: (
    buckets: Map<string, Bucket> | null,
    counts: Record<Bucket, number> | null,
    empireName: string | null,
  ) => void;
}

export function EmpirePanel({ snapshot, onBuckets }: EmpirePanelProps) {
  const version = snapshot.meta.gameVersion;
  const [empires, setEmpires] = useState<SavedEmpire[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ counts: Record<Bucket, number>; falseNever: number; total: number } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  // Gates ship in the snapshot (tech.json `gate` field) — build the classifier
  // input directly, no fetch.
  const techLite = useMemo(() => buildTechLite(snapshot), [snapshot]);

  const handleBytes = useCallback(async (bytes: Uint8Array) => {
    setLoading(true);
    setError(null);
    try {
      // Lazy-load the parser (jomini + fflate) only when a save is actually
      // loaded, so they're a separate chunk — not in the main bundle.
      const { loadEmpiresFromSav } = await import("../lib/empire/savLoad");
      const { empires: emp } = await loadEmpiresFromSav(bytes);
      setEmpires(emp);
      const firstPlayer = emp.find((e) => e.playerName) ?? emp[0];
      setSelectedId(firstPlayer ? firstPlayer.id : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEmpires(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // classify whenever the selection (or data) changes
  const selected = empires?.find((e) => e.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) {
      onBuckets(null, null, null);
      setResult(null);
      return;
    }
    const r = classifyEmpire(techLite, selected);
    onBuckets(r.buckets, r.counts, selected.name);
    setResult({
      counts: r.counts,
      falseNever: r.falseNeverResearched.length,
      total: r.counts.researched + r.counts.available + r.counts.reachable + r.counts.never,
    });
  }, [techLite, selected, onBuckets]);

  const onFile = (f: File | undefined) => {
    if (f) f.arrayBuffer().then((b) => handleBytes(new Uint8Array(b)));
  };
  const loadSample = async () => {
    setLoading(true);
    setError(null);
    try {
      const buf = await fetch(`/data/${version}/sample.sav`).then((r) => {
        if (!r.ok) throw new Error("no sample save available");
        return r.arrayBuffer();
      });
      await handleBytes(new Uint8Array(buf));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  };

  const players = empires?.filter((e) => e.playerName) ?? [];
  const others = empires?.filter((e) => !e.playerName && /^[A-Za-z]/.test(e.name)) ?? [];

  return (
    <aside className="empire-panel">
      <div className="empire-panel__title">Saved Empire</div>

      <>
          <div
            className="empire-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileRef.current?.click()}
          >
            Drop a <code>.sav</code> here or click to choose
            <input
              ref={fileRef}
              type="file"
              accept=".sav"
              hidden
              onChange={(e) => onFile(e.target.files?.[0] ?? undefined)}
            />
          </div>
          {/* Dev-only convenience: the sample save is a gitignored local file, so
              hide this button in production builds (the drop-zone is the real entry). */}
          {import.meta.env.DEV && (
            <button type="button" className="empire-panel__sample" onClick={loadSample} disabled={loading}>
              {loading ? "Parsing…" : "▶ Load sample save"}
            </button>
          )}

          {error && <div className="empire-panel__error">{error}</div>}

          {empires && (
            <label className="empire-panel__pick">
              Empire
              <select value={selectedId ?? ""} onChange={(e) => setSelectedId(Number(e.target.value))}>
                <optgroup label="Players">
                  {players.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.researchedCount})
                    </option>
                  ))}
                </optgroup>
                {others.length > 0 && (
                  <optgroup label="Other empires">
                    {others.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.researchedCount})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          )}

          {selected && (
            <div className="empire-identity">
              {chip(selected.authority?.replace("auth_", "") ?? "?")}
              {selected.origin ? chip(selected.origin.replace("origin_", "")) : null}
              {selected.ethics.map((x) => chip(x.replace("ethic_", "")))}
            </div>
          )}

          <div className="empire-legend">
            {BUCKETS.map((b) => (
              <div key={b.key} className="empire-legend__row" data-bucket={b.key}>
                <span className="empire-legend__swatch" />
                <span className="empire-legend__label">{b.label}</span>
                <span className="empire-legend__hint">{b.hint}</span>
                <span className="empire-legend__count">{result ? result.counts[b.key] : "—"}</span>
              </div>
            ))}
          </div>

          {result && (
            <div className="empire-panel__validation" data-warn={result.falseNever > 0 ? "" : undefined}>
              {result.total}/{techLite.length} techs · integrity{" "}
              {result.falseNever === 0 ? "ok" : `FAIL(${result.falseNever})`}
            </div>
          )}
      </>
    </aside>
  );
}

function chip(text: string) {
  return (
    <span key={text} className="empire-chip">
      {text}
    </span>
  );
}
