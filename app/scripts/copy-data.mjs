#!/usr/bin/env node
/**
 * D-03: copies the pipeline's build-time output (tech.json + icons) into
 * app/public/data/{version}/ so Vite serves it as a static asset and the
 * app can `fetch()` it at startup. Idempotent — safe to re-run.
 *
 * Copies EVERY pipeline/data/v* snapshot (the app has a version selector) and
 * writes a `versions.json` manifest — a static host can't list directories,
 * so the app discovers available versions through this file:
 *   { latest: "v4.5.0", versions: [{ dir: "v4.5.0", label: "Cygnus v4.5.0 (aa56)" }, ...] }
 */
import { cpSync, readdirSync, existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..");
const REPO_ROOT = join(APP_ROOT, "..");
const PIPELINE_DATA_DIR = join(REPO_ROOT, "pipeline", "data");

/**
 * Compares two `v<major>.<minor>.<patch>` dir names numerically per component
 * (WR-03) so `v4.10.0` sorts after `v4.9.0` — a plain lexicographic `.sort()`
 * would pick v4.9.0 and silently ship stale data, the exact failure this tool
 * exists to prevent. Non-numeric components (e.g. a `-beta` suffix) coerce to
 * 0, degrading gracefully rather than throwing.
 */
function compareVersions(a, b) {
  const parse = (s) => s.replace(/^v/, "").split(/[.\-+]/).map((n) => Number(n) || 0);
  const na = parse(a);
  const nb = parse(b);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const diff = (na[i] || 0) - (nb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function listVersions() {
  const entries = readdirSync(PIPELINE_DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("v"))
    .map((e) => e.name)
    .sort(compareVersions);

  if (entries.length === 0) {
    throw new Error(`No v* data directory found under ${PIPELINE_DATA_DIR}`);
  }

  return entries;
}

/** Human label for the manifest — the snapshot's own versionLabel when present. */
function labelFor(version) {
  try {
    const meta = JSON.parse(readFileSync(join(PIPELINE_DATA_DIR, version, "tech.json"), "utf8")).meta;
    return meta.versionLabel ?? meta.gameVersion ?? version;
  } catch {
    return version;
  }
}

function main() {
  const versions = listVersions();

  for (const version of versions) {
    const srcDir = join(PIPELINE_DATA_DIR, version);
    const destDir = join(APP_ROOT, "public", "data", version);
    cpSync(srcDir, destDir, { recursive: true });

    const iconsDir = join(destDir, "icons");
    const iconCount = existsSync(iconsDir)
      ? readdirSync(iconsDir).filter((f) => statSync(join(iconsDir, f)).isFile()).length
      : 0;
    console.log(`[copy-data] Copied ${version}: tech.json + ${iconCount} icon file(s) -> ${destDir}`);
  }

  // Newest first — the natural order for a version dropdown.
  const manifest = {
    latest: versions[versions.length - 1],
    versions: [...versions].reverse().map((dir) => ({ dir, label: labelFor(dir) })),
  };
  const manifestPath = join(APP_ROOT, "public", "data", "versions.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`[copy-data] Wrote manifest (${versions.length} version(s)) -> ${manifestPath}`);
}

main();
