/**
 * Empty state (UI-SPEC Empty / Error States) — neutral card, no retry
 * (retrying won't fix a genuinely empty snapshot). Copy is the exact
 * UI-SPEC Copywriting Contract text, not paraphrased.
 */
export function EmptyOverlay() {
  return (
    <div className="overlay">
      <div className="overlay__card">
        <h2 className="overlay__heading">No technologies found</h2>
        <p className="overlay__body">
          The loaded data snapshot doesn&apos;t contain any technologies. This
          shouldn&apos;t happen — please report it.
        </p>
      </div>
    </div>
  );
}
