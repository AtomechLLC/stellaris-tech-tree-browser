import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TechSnapshot } from "../types/tech-snapshot";
import type { SavedEmpire, SavGalaxy } from "../lib/empire/savLoad";
import { buildTechLite, classifyEmpire, type Bucket } from "../lib/empire/classifyEmpire";
import { GalaxyMinimap } from "./GalaxyMinimap";
import { dataUrl } from "../lib/data/paths";
import { parsePdxText, stripPdxCodes } from "../lib/pdxText";

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
    empire: SavedEmpire | null,
  ) => void;
}

export function EmpirePanel({ snapshot, onBuckets }: EmpirePanelProps) {
  const version = snapshot.meta.gameVersion;
  const [empires, setEmpires] = useState<SavedEmpire[] | null>(null);
  const [galaxy, setGalaxy] = useState<SavGalaxy | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the docked "all settings" window (right side) is open. Persists
  // across empire swaps — the panel just re-reads the newly-selected empire.
  const [showSettings, setShowSettings] = useState(false);
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
      const { empires: emp, galaxy: gal } = await loadEmpiresFromSav(bytes);
      setEmpires(emp);
      setGalaxy(gal);
      const firstPlayer = emp.find((e) => e.playerName) ?? emp[0];
      setSelectedId(firstPlayer ? firstPlayer.id : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEmpires(null);
      setGalaxy(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // classify whenever the selection (or data) changes
  const selected = empires?.find((e) => e.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) {
      onBuckets(null, null, null, null);
      setResult(null);
      return;
    }
    const r = classifyEmpire(techLite, selected);
    onBuckets(r.buckets, r.counts, selected.name, selected);
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
      const buf = await fetch(dataUrl(`${version}/sample.sav`)).then((r) => {
        // A missing sample falls through to the SPA's index.html (200, html) —
        // catch that here so the error says what's wrong, not "invalid zip data".
        if (!r.ok || (r.headers.get("content-type") ?? "").includes("text/html")) {
          throw new Error("no sample save available");
        }
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
                      {stripPdxCodes(e.name)} ({e.researchedCount})
                    </option>
                  ))}
                </optgroup>
                {others.length > 0 && (
                  <optgroup label="Other empires">
                    {others.map((e) => (
                      <option key={e.id} value={e.id}>
                        {stripPdxCodes(e.name)} ({e.researchedCount})
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

          {/* Galaxy minimap — where the selected empire's territory sits.
              Swapping empires re-highlights (ownerId drives the redraw). */}
          {galaxy && selected && <GalaxyMinimap galaxy={galaxy} ownerId={selected.id} />}

          {selected && (
            <button
              type="button"
              className="empire-panel__settings-btn"
              aria-pressed={showSettings}
              onClick={() => setShowSettings((v) => !v)}
            >
              {showSettings ? "Hide all settings" : "View all settings"}
            </button>
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

      {/* Docked "all settings" window — fixed to the viewport's right edge, so
          its position is independent of this aside's DOM location. Reads the
          currently-selected empire, so swapping empires updates it live. */}
      {showSettings && selected && (
        <EmpireSettingsPanel
          empire={selected}
          iconBase={dataUrl(`${version}/icons`)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </aside>
  );
}

/** Strips a known id prefix, unslugs, and Title-Cases a raw Stellaris id
 *  (e.g. `ethic_fanatic_militarist` → "Fanatic Militarist"). No localisation
 *  for these lives in the snapshot, so this humanizes the raw key. */
function humanize(id: string): string {
  return id
    .replace(/^(auth_|origin_|ethic_|civic_|ap_|sp_)/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Renders save text with Paradox color codes as colored spans (e.g. a
 *  rainbow multiplayer nickname); plain text passes through untouched. */
function PdxName({ raw }: { raw: string }) {
  const segments = parsePdxText(raw);
  return (
    <>
      {segments.map((s, i) =>
        s.color ? (
          <span key={i} style={{ color: s.color }}>
            {s.text}
          </span>
        ) : (
          s.text
        ),
      )}
    </>
  );
}

/** One settings chip: game icon + name. `iconOnly` (ethics) drops the text —
 *  players read these at a glance — keeping it as the tooltip; if the icon
 *  fails to load the text comes back so the chip is never empty. */
function SettingsChip({
  id,
  text,
  iconBase,
  iconOnly = false,
}: {
  id: string | null;
  text: string;
  iconBase: string;
  iconOnly?: boolean;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const showIcon = id !== null && !iconFailed;
  return (
    <span className="empire-chip" data-icon-only={iconOnly && showIcon ? "" : undefined} title={text}>
      {showIcon && (
        <img src={`${iconBase}/_${id}.webp`} alt={text} loading="lazy" onError={() => setIconFailed(true)} />
      )}
      {(!iconOnly || !showIcon) && text}
    </span>
  );
}

/** Right-docked window listing every setting of the selected empire. */
function EmpireSettingsPanel({
  empire,
  iconBase,
  onClose,
}: {
  empire: SavedEmpire;
  iconBase: string;
  onClose: () => void;
}) {
  // Chips carry the raw id so they can show the game's icon — the pipeline
  // emits `_<id>.webp` for civic_* / ap_* / auth_* / origin_* / ethic_*.
  // Ethics render icon-only (name in the tooltip): players know these well.
  const rows: {
    label: string;
    iconOnly?: boolean;
    items: { id: string | null; text: string }[];
  }[] = [
    {
      label: "Authority",
      items: empire.authority ? [{ id: empire.authority, text: humanize(empire.authority) }] : [],
    },
    { label: "Origin", items: empire.origin ? [{ id: empire.origin, text: humanize(empire.origin) }] : [] },
    { label: "Ethics", iconOnly: true, items: empire.ethics.map((e) => ({ id: e, text: humanize(e) })) },
    { label: "Civics", items: empire.civics.map((c) => ({ id: c, text: humanize(c) })) },
    { label: "Ascension Perks", items: (empire.perks ?? []).map((p) => ({ id: p, text: humanize(p) })) },
  ];
  return (
    <aside className="empire-settings" aria-label={`${stripPdxCodes(empire.name)} settings`}>
      <header className="empire-settings__header">
        <span className="empire-settings__title">
          <PdxName raw={empire.name} />
        </span>
        <button
          type="button"
          className="empire-settings__close"
          onClick={onClose}
          aria-label="Close settings"
          title="Close"
        >
          ✕
        </button>
      </header>
      <div className="empire-settings__body">
        {empire.playerName && (
          <div className="empire-settings__player">
            Player: <PdxName raw={empire.playerName} />
          </div>
        )}
        {rows.map((r) => (
          <div key={r.label} className="empire-settings__row">
            <div className="empire-settings__label">{r.label}</div>
            <div className="empire-settings__values">
              {r.items.length > 0 ? (
                r.items.map((it) => (
                  <SettingsChip
                    key={it.text}
                    id={it.id}
                    text={it.text}
                    iconBase={iconBase}
                    iconOnly={r.iconOnly}
                  />
                ))
              ) : (
                <span className="empire-settings__none">None</span>
              )}
            </div>
          </div>
        ))}
        <div className="empire-settings__row">
          <div className="empire-settings__label">Researched</div>
          <div className="empire-settings__values">
            {empire.researchedCount} technolog{empire.researchedCount === 1 ? "y" : "ies"}
          </div>
        </div>
      </div>
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
