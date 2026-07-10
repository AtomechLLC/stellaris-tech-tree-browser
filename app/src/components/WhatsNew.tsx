import { useEffect, useState } from "react";
import { dataUrl } from "../lib/data/paths";

/**
 * "What's new" — patch-diff panel. The pipeline's `diff-data` step writes
 * `diff.json` next to tech.json when a PRIOR version snapshot exists to
 * compare against; this fetches it and renders a header chip + overlay listing
 * added / removed / changed techs. With no diff artifact (404 / HTML fallback)
 * it renders nothing — the feature lights up automatically at the next patch.
 */

interface FieldChange {
  field: string;
  from: string | number;
  to: string | number;
}
interface SnapshotDiff {
  fromVersion: string;
  toVersion: string;
  added: Array<{ key: string; name: string; tier: number; area: string }>;
  removed: Array<{ key: string; name: string }>;
  changed: Array<{ key: string; name: string; changes: FieldChange[] }>;
}

export function WhatsNew({ version }: { version: string }) {
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(dataUrl(`${version}/diff.json`))
      .then((r) => {
        if (!r.ok || (r.headers.get("content-type") ?? "").includes("text/html")) return null;
        return r.json() as Promise<SnapshotDiff>;
      })
      .then((d) => {
        if (cancelled || !d) return;
        if (d.added.length + d.removed.length + d.changed.length > 0) setDiff(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (!diff) return null;

  return (
    <>
      <button
        type="button"
        className="whats-new__chip"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        What’s new in {diff.toVersion}
      </button>
      {open && (
        <div className="whats-new" role="dialog" aria-label="What changed in this patch">
          <header className="whats-new__header">
            <span>
              {diff.fromVersion} → {diff.toVersion}
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </header>
          <div className="whats-new__body">
            {diff.added.length > 0 && (
              <section>
                <h3>Added ({diff.added.length})</h3>
                <ul>
                  {diff.added.map((t) => (
                    <li key={t.key} data-area={t.area}>
                      {t.name} <span className="whats-new__meta">Tier {t.tier}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {diff.changed.length > 0 && (
              <section>
                <h3>Changed ({diff.changed.length})</h3>
                <ul>
                  {diff.changed.map((t) => (
                    <li key={t.key}>
                      {t.name}
                      <span className="whats-new__meta">
                        {t.changes.map((c) => `${c.field} ${c.from} → ${c.to}`).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {diff.removed.length > 0 && (
              <section>
                <h3>Removed ({diff.removed.length})</h3>
                <ul>
                  {diff.removed.map((t) => (
                    <li key={t.key}>{t.name}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  );
}
