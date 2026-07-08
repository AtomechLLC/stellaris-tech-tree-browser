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
  const res = await fetch(`/data/${version}/tech.json`);

  if (!res.ok) {
    throw new Error(`Failed to fetch tech.json: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  // Runtime validation (D-04 / RESEARCH Open Q1) — cheap, catches a
  // corrupted copy as a clean thrown error rather than a deep TypeError
  // surfacing later during graph construction.
  return TechSnapshotSchema.parse(json);
}
