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

function resolveVersion() {
  // Derived from the snapshot's meta.gameVersion — pipeline/data/ currently
  // contains a single v* directory per generated snapshot. Pick the only
  // (or lexicographically latest) v* dir rather than hardcoding, so a future
  // pipeline re-run against a new game version needs no edit here.
  const entries = readdirSync(PIPELINE_DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("v"))
    .map((e) => e.name)
    .sort();

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
