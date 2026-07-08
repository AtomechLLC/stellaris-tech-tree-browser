/**
 * Bottom-left overlay legend mapping the three area ring colors to their
 * research area names (UI-SPEC App Shell Layout). Static for Phase 2 — not
 * interactive/toggleable (later-phase refinement). Swatch colors are pure
 * CSS classes reading --area-* tokens (tokens.css) — no hardcoded hex here.
 */
const AREAS = [
  { key: "physics", label: "Physics" },
  { key: "society", label: "Society" },
  { key: "engineering", label: "Engineering" },
] as const;

export function Legend() {
  return (
    <div className="legend">
      {AREAS.map(({ key, label }) => (
        <div className="legend__row" key={key}>
          <span className={`legend__swatch legend__swatch--${key}`} />
          <span className="legend__label">{label}</span>
        </div>
      ))}
    </div>
  );
}
