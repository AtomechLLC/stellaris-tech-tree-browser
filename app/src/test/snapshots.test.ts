import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { TechSnapshotSchema } from "../types/tech-snapshot";

/**
 * Manifest-driven schema validation: reads app/public/data/versions.json and
 * schema-validates EVERY shipped snapshot (not just the current default)
 * against the app's own TechSnapshotSchema. This is the durable guard against
 * future version bumps shipping data the app can't actually parse — smoke,
 * layout and exploreLayout intentionally stay pinned to v4.5.0 as a fixed
 * layout benchmark and are NOT a substitute for this check.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(__dirname, "..", "..", "public", "data");

interface VersionsManifest {
  latest: string;
  versions: Array<{ dir: string; label: string }>;
}

function loadManifest(): VersionsManifest {
  const raw = readFileSync(join(DATA_ROOT, "versions.json"), "utf8");
  return JSON.parse(raw) as VersionsManifest;
}

describe("snapshots: versions.json manifest", () => {
  it("latest is a string and equals versions[0].dir", () => {
    const manifest = loadManifest();
    expect(typeof manifest.latest).toBe("string");
    expect(manifest.versions.length).toBeGreaterThan(0);
    expect(manifest.latest).toBe(manifest.versions[0].dir);
  });

  it("has at least one version, with unique dir names", () => {
    const manifest = loadManifest();
    expect(manifest.versions.length).toBeGreaterThan(0);
    const dirs = manifest.versions.map((v) => v.dir);
    expect(new Set(dirs).size).toBe(dirs.length);
  });
});

describe("snapshots: every shipped snapshot validates against the app schema", () => {
  const manifest = loadManifest();
  const allDirs = new Set(manifest.versions.map((v) => v.dir));

  for (const entry of manifest.versions) {
    it(`${entry.dir}: tech.json parses with TechSnapshotSchema and matches its manifest entry`, () => {
      const versionDir = join(DATA_ROOT, entry.dir);
      const techJsonPath = join(versionDir, "tech.json");
      const raw = JSON.parse(readFileSync(techJsonPath, "utf8"));
      const parsed = TechSnapshotSchema.parse(raw);

      expect(parsed.meta.gameVersion).toBe(entry.dir);
      expect(entry.label).toBe(parsed.meta.versionLabel ?? parsed.meta.gameVersion);
      expect(parsed.meta.techCount).toBe(Object.keys(parsed.techs).length);

      const missingIconFiles: string[] = [];
      for (const tech of Object.values(parsed.techs)) {
        if (!tech.icon) continue;
        const iconPath = join(versionDir, "icons", tech.icon);
        if (!existsSync(iconPath)) missingIconFiles.push(tech.key);
      }
      expect(missingIconFiles).toEqual([]);

      const diffPath = join(versionDir, "diff.json");
      if (existsSync(diffPath)) {
        const diff = JSON.parse(readFileSync(diffPath, "utf8"));
        expect(diff.toVersion).toBe(entry.dir);
        expect(allDirs.has(diff.fromVersion)).toBe(true);
      }
    });
  }
});
