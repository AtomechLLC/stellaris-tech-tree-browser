/**
 * Error state (UI-SPEC Empty / Error States, T-02-02 mitigation). Thin
 * --color-danger left border + heading accent (calm, not a full red card).
 * "Retry" re-triggers the fetch+layout pipeline via the provided callback.
 * Copy is the exact UI-SPEC Copywriting Contract text, not paraphrased.
 */
export function ErrorOverlay({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="overlay">
      <div className="overlay__card overlay__card--danger">
        <h2 className="overlay__heading overlay__heading--danger">
          Couldn&apos;t load the tech tree
        </h2>
        <p className="overlay__body">
          The technology data failed to load. Check your connection and try
          again.
        </p>
        <button type="button" className="overlay__retry-button" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}
