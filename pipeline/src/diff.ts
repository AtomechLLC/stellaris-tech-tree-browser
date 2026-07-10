/**
 * Snapshot diff — "what changed between game versions".
 *
 * Compares two tech.json snapshots and writes `diff.json` NEXT TO the newer
 * one (data/<toVersion>/diff.json), so the app's copy-data step ships it
 * automatically and the "What's new" panel lights up. With no prior snapshot
 * on disk there is nothing to diff and the app simply never shows the panel.
 *
 * Compared fields are the GAMEPLAY-meaningful ones (tier, cost, weight, area,
 * category, prerequisites, dlc) — grant/description text is excluded as
 * cosmetic noise (loc wording shifts every patch).
 *
 * CLI:
 *   npx tsx src/diff.ts                # auto: two newest data/v* snapshots
 *   npx tsx src/diff.ts --from data/v4.4.6/tech.json --to data/v4.5.0/tech.json
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface TechLike {
  key: string;
  name: string;
  tier: number;
  cost: number;
  weight: number;
  area: string;
  category: string[];
  prerequisites: string[];
  dlc: string | null;
}

interface SnapshotLike {
  meta: { gameVersion: string };
  techs: Record<string, TechLike>;
}

export interface FieldChange {
  field: string;
  from: string | number;
  to: string | number;
}

export interface SnapshotDiff {
  fromVersion: string;
  toVersion: string;
  added: Array<{ key: string; name: string; tier: number; area: string }>;
  removed: Array<{ key: string; name: string }>;
  changed: Array<{ key: string; name: string; changes: FieldChange[] }>;
}

/** Pure snapshot comparison (exported for tests). */
export function diffSnapshots(from: SnapshotLike, to: SnapshotLike): SnapshotDiff {
  const added: SnapshotDiff["added"] = [];
  const removed: SnapshotDiff["removed"] = [];
  const changed: SnapshotDiff["changed"] = [];

  for (const [key, t] of Object.entries(to.techs)) {
    const old = from.techs[key];
    if (!old) {
      added.push({ key, name: t.name, tier: t.tier, area: t.area });
      continue;
    }
    const changes: FieldChange[] = [];
    if (old.tier !== t.tier) changes.push({ field: "tier", from: old.tier, to: t.tier });
    if (old.cost !== t.cost) changes.push({ field: "cost", from: old.cost, to: t.cost });
    if (old.weight !== t.weight) changes.push({ field: "weight", from: old.weight, to: t.weight });
    if (old.area !== t.area) changes.push({ field: "area", from: old.area, to: t.area });
    const oldCat = old.category[0] ?? "";
    const newCat = t.category[0] ?? "";
    if (oldCat !== newCat) changes.push({ field: "category", from: oldCat, to: newCat });
    if ((old.dlc ?? "") !== (t.dlc ?? "")) {
      changes.push({ field: "dlc", from: old.dlc ?? "none", to: t.dlc ?? "none" });
    }
    const oldPre = [...old.prerequisites].sort().join(",");
    const newPre = [...t.prerequisites].sort().join(",");
    if (oldPre !== newPre) {
      changes.push({
        field: "prerequisites",
        from: oldPre || "none",
        to: newPre || "none",
      });
    }
    if (changes.length > 0) changed.push({ key, name: t.name, changes });
  }

  for (const [key, t] of Object.entries(from.techs)) {
    if (!to.techs[key]) removed.push({ key, name: t.name });
  }

  return {
    fromVersion: from.meta.gameVersion,
    toVersion: to.meta.gameVersion,
    added,
    removed,
    changed,
  };
}

// ---- CLI -------------------------------------------------------------------

function compareVersions(a: string, b: string): number {
  const parse = (s: string) => s.replace(/^v/, "").split(/[.\-+]/).map((n) => Number(n) || 0);
  const na = parse(a);
  const nb = parse(b);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const diff = (na[i] || 0) - (nb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function main(): void {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  let fromPath = get("--from");
  let toPath = get("--to");

  if (!fromPath || !toPath) {
    // Auto-discover: the two numerically-newest data/v* snapshot dirs.
    const dataDir = join(process.cwd(), "data");
    const versions = readdirSync(dataDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("v"))
      .map((e) => e.name)
      .sort(compareVersions);
    if (versions.length < 2) {
      console.log(
        `[diff] only ${versions.length} snapshot(s) under data/ — nothing to diff (need a prior version).`,
      );
      return;
    }
    fromPath = join(dataDir, versions[versions.length - 2], "tech.json");
    toPath = join(dataDir, versions[versions.length - 1], "tech.json");
  }

  const from = JSON.parse(readFileSync(fromPath, "utf8")) as SnapshotLike;
  const to = JSON.parse(readFileSync(toPath, "utf8")) as SnapshotLike;
  const diff = diffSnapshots(from, to);

  const outPath = join(dirname(toPath), "diff.json");
  writeFileSync(outPath, JSON.stringify(diff, null, 2), "utf8");
  console.log(
    `[diff] ${diff.fromVersion} → ${diff.toVersion}: ` +
      `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed → ${outPath}`,
  );
}

// Run only as a CLI entrypoint (not when imported by tests).
if (existsSync(process.argv[1] ?? "") && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
