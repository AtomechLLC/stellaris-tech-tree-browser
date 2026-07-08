/**
 * Loading state (UI-SPEC Loading State / D-08). CSS-only spinner (no
 * external library) — a single rotating border-arc div. Copy is the exact
 * UI-SPEC Copywriting Contract text, not paraphrased.
 */
export function LoadingOverlay() {
  return (
    <div className="overlay">
      <div className="overlay__card">
        <div className="overlay__spinner" aria-hidden="true" />
        <h2 className="overlay__heading">Loading the tech tree</h2>
        <p className="overlay__body">
          Laying out 678 technologies — this takes a few seconds.
        </p>
      </div>
    </div>
  );
}
