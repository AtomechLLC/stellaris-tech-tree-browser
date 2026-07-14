import { TechSnapshotSchema, type TechSnapshot } from "../../types/tech-snapshot";
import { dataUrl } from "./paths";

/** localStorage key for the user's chosen data version (version selector). */
export const VERSION_PREF_KEY = "stellaris-tech:data-version";

export interface VersionEntry {
  /** Data directory name, e.g. "v4.5.0". */
  dir: string;
  /** Display label, e.g. "Cygnus v4.5.0 (aa56)". */
  label: string;
}

export interface VersionsManifest {
  latest: string;
  versions: VersionEntry[];
}

/**
 * Fetches the versions manifest written by copy-data. Returns null on ANY
 * failure (older deploys have no manifest) — the caller falls back to the
 * hardcoded default version, exactly the pre-selector behavior.
 */
export async function fetchVersionManifest(): Promise<VersionsManifest | null> {
  try {
    const res = await fetch(dataUrl("versions.json"), { cache: "no-cache" });
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return null;
    const json = (await res.json()) as VersionsManifest;
    if (typeof json?.latest !== "string" || !Array.isArray(json?.versions)) return null;
    return json;
  } catch {
    return null;
  }
}

/**
 * The data version to load, in precedence order:
 *   1. URL `?ver=` (shared links / direct picks — accepts "v4.4.6" or "4.4.6")
 *   2. localStorage preference (set by the version selector — returning users
 *      keep the version they last chose)
 *   3. the manifest's latest (first-time visitors always get the newest data)
 * Each candidate must still be an available version.
 */
export function resolveDataVersion(manifest: VersionsManifest | null): string {
  const isAvailable = (dir: string) => manifest?.versions.some((v) => v.dir === dir) ?? false;

  const raw = new URLSearchParams(window.location.search).get("ver");
  if (raw) {
    const urlVer = raw.startsWith("v") ? raw : `v${raw}`;
    if (isAvailable(urlVer)) return urlVer;
  }
  try {
    const pref = localStorage.getItem(VERSION_PREF_KEY);
    if (pref && isAvailable(pref)) return pref;
  } catch {
    /* storage unavailable — fall through to latest */
  }
  return manifest?.latest ?? "v4.5.0";
}

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
  const res = await fetch(dataUrl(`${version}/tech.json`), { cache: "no-cache" });

  if (!res.ok) {
    throw new Error(`Failed to fetch tech.json: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  // Runtime validation (D-04 / RESEARCH Open Q1) — cheap, catches a
  // corrupted copy as a clean thrown error rather than a deep TypeError
  // surfacing later during graph construction.
  return TechSnapshotSchema.parse(json);
}
