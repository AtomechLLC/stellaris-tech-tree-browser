import { TechSnapshotSchema, type TechSnapshot } from "../../types/tech-snapshot";

/**
 * Fetches and shape-validates the tech.json snapshot (D-03).
 *
 * Any failure (network error, non-2xx status, malformed JSON, or a Zod
 * schema mismatch) throws — never returns undefined/null — so the caller
 * (App.tsx) can surface a clean error state instead of a blank screen
 * (T-02-02 mitigation).
 */
export async function fetchSnapshot(version = "v4.5.0"): Promise<TechSnapshot> {
  // `cache: "no-cache"` forces the browser to REVALIDATE with the server on
  // every load (conditional GET → 304 when unchanged, fresh 200 when the data
  // was regenerated). Without this the browser happily serves a stale cached
  // tech.json after `npm run generate-data`, so re-runs of the pipeline (new
  // localisation, flags, etc.) silently don't show up until a hard refresh.
  const res = await fetch(`/data/${version}/tech.json`, { cache: "no-cache" });

  if (!res.ok) {
    throw new Error(`Failed to fetch tech.json: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  // Runtime validation (D-04 / RESEARCH Open Q1) — cheap, catches a
  // corrupted copy as a clean thrown error rather than a deep TypeError
  // surfacing later during graph construction.
  return TechSnapshotSchema.parse(json);
}
