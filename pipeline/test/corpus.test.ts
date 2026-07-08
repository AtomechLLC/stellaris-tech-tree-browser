/**
 * Full-corpus integration test (D-18): validates the real 33-file install,
 * not a sample or fixture set. Proves DATA-01 through DATA-05 end-to-end:
 *
 *   Test 1 (full-corpus coverage, D-18): 650+ techs, 0 unresolved
 *     @scripted_variable references, 0 dangling prerequisites.
 *   Test 2 (idempotency, DATA-05/D-03): running the build twice produces
 *     byte-identical tech.json after normalizing the volatile
 *     meta.generatedAt field.
 *   Test 3 (localisation coverage, DATA-03): every tech has a non-empty name.
 *   Test 4 (icon coverage, DATA-04): every tech has a non-null icon
 *     reference and the referenced .webp exists on disk.
 *   Test 5 (unlocks coverage, D-05): every tech's unlocks has both grants
 *     and leadsTo arrays; at least one known tech has non-empty grants
 *     (tech's-own-grants component present, not reduced to reverse edges),
 *     and at least one tech with a known dependent has non-empty leadsTo.
 *
 * This suite runs the real assembler against the real Stellaris install
 * (no mocking/sampling, per D-18) and is slower than the unit suites —
 * expect real icon conversion work for ~678 techs on Test 2's second build.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runAssemble } from "../src/assemble.js";
import { TechSnapshotSchema, type TechSnapshot } from "../src/schema/tech-snapshot.js";

const OUT_PATH = join(process.cwd(), "data", "v4.5.0", "tech.json");
const ICONS_DIR = join(process.cwd(), "data", "v4.5.0", "icons");

/** Strips the volatile meta.generatedAt field so two runs can be compared byte-for-byte. */
function normalizeGeneratedAt(snapshot: TechSnapshot): TechSnapshot {
  return {
    ...snapshot,
    meta: { ...snapshot.meta, generatedAt: "NORMALIZED" },
  };
}

describe("corpus: full-corpus build + coverage (D-18)", () => {
  let firstRun: TechSnapshot;

  beforeAll(async () => {
    await runAssemble();
    const written = JSON.parse(readFileSync(OUT_PATH, "utf8"));
    firstRun = TechSnapshotSchema.parse(written);
  }, 300_000);

  it("Test 1: full-corpus coverage — 650+ techs, 0 unresolved variables, 0 dangling prerequisites", () => {
    expect(firstRun.meta.techCount).toBeGreaterThanOrEqual(650);
    expect(Object.keys(firstRun.techs).length).toBeGreaterThanOrEqual(650);

    // 0 dangling prerequisites: every prerequisite key must resolve to a real tech in the snapshot.
    const keySet = new Set(Object.keys(firstRun.techs));
    let danglingCount = 0;
    for (const tech of Object.values(firstRun.techs)) {
      for (const prereq of tech.prerequisites) {
        if (!keySet.has(prereq)) danglingCount++;
      }
    }
    expect(danglingCount).toBe(0);

    // 0 unresolved @scripted_variable references: cost/weight are always
    // resolved concrete numbers by the time they reach the snapshot (the
    // extractor/resolveValue throws during assembly otherwise, so a
    // completed run already proves this — assert the numeric invariant).
    let unresolvedVariableCount = 0;
    for (const tech of Object.values(firstRun.techs)) {
      if (typeof tech.cost !== "number" || Number.isNaN(tech.cost)) unresolvedVariableCount++;
      if (typeof tech.weight !== "number" || Number.isNaN(tech.weight)) unresolvedVariableCount++;
    }
    expect(unresolvedVariableCount).toBe(0);
  });

  it("Test 2: idempotency — two builds produce byte-identical tech.json (meta.generatedAt normalized)", async () => {
    await runAssemble();
    const secondWritten = JSON.parse(readFileSync(OUT_PATH, "utf8"));
    const secondRun = TechSnapshotSchema.parse(secondWritten);

    const firstNormalized = JSON.stringify(normalizeGeneratedAt(firstRun), null, 2);
    const secondNormalized = JSON.stringify(normalizeGeneratedAt(secondRun), null, 2);

    expect(secondNormalized).toBe(firstNormalized);
  }, 300_000);

  it("Test 3: localisation coverage (DATA-03) — every tech has a non-empty name", () => {
    const missingNames = Object.values(firstRun.techs).filter((t) => !t.name || t.name.length === 0);
    expect(missingNames).toEqual([]);
  });

  it("Test 4: icon coverage (DATA-04) — every tech has a non-null icon reference whose .webp exists on disk", () => {
    const missingIconRef = Object.values(firstRun.techs).filter((t) => !t.icon);
    expect(missingIconRef).toEqual([]);

    const missingOnDisk: string[] = [];
    for (const tech of Object.values(firstRun.techs)) {
      // SCHEMA.md contract: EVERY icon ref (including the placeholder) is an
      // emitted .webp under data/v{version}/icons/ — no special cases.
      const iconPath = join(ICONS_DIR, tech.icon!);
      if (!existsSync(iconPath)) missingOnDisk.push(tech.key);
    }
    expect(missingOnDisk).toEqual([]);
  });

  it("Test 5: unlocks coverage (D-05) — both grants and leadsTo arrays present; both components populated somewhere", () => {
    const malformed = Object.values(firstRun.techs).filter(
      (t) => !t.unlocks || !Array.isArray(t.unlocks.grants) || !Array.isArray(t.unlocks.leadsTo),
    );
    expect(malformed).toEqual([]);

    // tech_space_exploration is a verified real-corpus case with non-empty
    // grants (feature_flags + prereqfor_desc content) — proves the
    // tech's-own-grants component is delivered, not reduced to reverse edges.
    const spaceExploration = firstRun.techs["tech_space_exploration"];
    expect(spaceExploration).toBeDefined();
    expect(spaceExploration.unlocks.grants.length).toBeGreaterThan(0);

    // At least one tech overall has non-empty leadsTo (a tech with a known dependent).
    const anyWithLeadsTo = Object.values(firstRun.techs).some((t) => t.unlocks.leadsTo.length > 0);
    expect(anyWithLeadsTo).toBe(true);
  });
});
