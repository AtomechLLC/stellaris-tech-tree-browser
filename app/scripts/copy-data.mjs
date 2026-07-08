#!/usr/bin/env node
/**
 * D-03: copies the pipeline's build-time output (tech.json + icons) into
 * app/public/data/{version}/ so Vite serves it as a static asset and the
 * app can `fetch()` it at startup. Idempotent — safe to re-run.
 */
import { cpSync, readdirSync, existsSync, statSync } from "node:fs";
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

function resolveVersion() {
  // Derived from the on-disk snapshot dir(s) — pipeline/data/ currently
  // contains a single v* directory per generated snapshot. Pick the
  // numerically-latest v* dir rather than hardcoding, so a future pipeline
  // re-run against a new game version needs no edit here.
  const entries = readdirSync(PIPELINE_DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("v"))
    .map((e) => e.name)
    .sort(compareVersions);

  if (entries.length === 0) {
    throw new Error(`No v* data directory found under ${PIPELINE_DATA_DIR}`);
  }

  return entries[entries.length - 1];
}

function main() {
  const version = resolveVersion();
  const srcDir = join(PIPELINE_DATA_DIR, version);
  const destDir = join(APP_ROOT, "public", "data", version);

  if (!existsSync(srcDir)) {
    throw new Error(`Source data dir does not exist: ${srcDir}`);
  }

  cpSync(srcDir, destDir, { recursive: true });

  const iconsDir = join(destDir, "icons");
  const iconCount = existsSync(iconsDir)
    ? readdirSync(iconsDir).filter((f) => statSync(join(iconsDir, f)).isFile()).length
    : 0;

  console.log(
    `[copy-data] Copied ${version}: tech.json + ${iconCount} icon file(s) -> ${destDir}`,
  );
}

main();
