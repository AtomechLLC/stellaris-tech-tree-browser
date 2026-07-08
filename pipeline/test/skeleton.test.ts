import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { parseClausewitzFile, normalizeToArray } from "../src/parser/clausewitz.js";
import { loadScriptedVariables, resolveValue } from "../src/parser/scripted-variables.js";
import { resolveConfig } from "../src/config.js";
import { detectGameVersion } from "../src/version/detect.js";
import { TechSnapshotSchema } from "../src/schema/tech-snapshot.js";

const { gameRoot } = resolveConfig([]);

describe("parser: parseClausewitzFile", () => {
  it("parses a BOM-only file (00_repeatable.txt) without throwing", async () => {
    const filePath = join(gameRoot, "common/technology/00_repeatable.txt");
    const result = await parseClausewitzFile(filePath);
    expect(result).toBeTypeOf("object");
  });

  it("parses a scripted_variables file with tab-adjacent bare @var lines without throwing", async () => {
    const filePath = join(gameRoot, "common/scripted_variables/01_scripted_variables_jobs.txt");
    const result = await parseClausewitzFile(filePath);
    expect(result).toBeTypeOf("object");
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });
});

describe("parser: normalizeToArray", () => {
  it("returns [] for undefined", () => {
    expect(normalizeToArray(undefined)).toEqual([]);
  });

  it("returns [value] for a scalar", () => {
    expect(normalizeToArray("x")).toEqual(["x"]);
  });

  it("returns the array unchanged if already an array", () => {
    expect(normalizeToArray(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("parser: loadScriptedVariables", () => {
  it("loads 2000+ entries from the real scripted_variables folder with concrete numbers", async () => {
    const map = await loadScriptedVariables(gameRoot);
    expect(map.size).toBeGreaterThan(2000);
    expect(map.get("@tier1weight3")).toBe(90);
  });
});

describe("parser: resolveValue", () => {
  it("returns bare numbers as passthrough", async () => {
    const map = await loadScriptedVariables(gameRoot);
    expect(resolveValue(0, map)).toBe(0);
  });

  it("resolves a @variable reference to a concrete number", async () => {
    const map = await loadScriptedVariables(gameRoot);
    expect(resolveValue("@tier1weight3", map)).toBe(90);
  });

  it("throws on inline @[] math with a message containing 'inline'", async () => {
    const map = await loadScriptedVariables(gameRoot);
    expect(() => resolveValue("@[x+1]", map)).toThrow(/inline/i);
  });

  it("throws on an unresolvable @variable reference", async () => {
    const map = await loadScriptedVariables(gameRoot);
    expect(() => resolveValue("@missing", map)).toThrow();
  });
});

describe("version: detectGameVersion", () => {
  it("returns v4.5.0 from the real install's launcher-settings.json", () => {
    expect(detectGameVersion(gameRoot)).toBe("v4.5.0");
  });

  it("throws when rawVersion is absent", () => {
    expect(() => detectGameVersion("/nonexistent-path-xyz")).toThrow();
  });
});

describe("schema: TechSnapshotSchema unlocks shape", () => {
  it("parses a fixture tech with both grants and leadsTo populated", () => {
    const fixture = {
      meta: {
        gameVersion: "v4.5.0",
        generatedAt: new Date().toISOString(),
        techCount: 1,
        areaCounts: { physics: 1 },
        tierCounts: { "0": 1 },
        sourceFiles: ["00_phys_tech.txt"],
      },
      techs: {
        tech_space_exploration: {
          key: "tech_space_exploration",
          area: "physics",
          category: ["computing"],
          tier: 0,
          cost: 0,
          weight: 0,
          prerequisites: [],
          unlocks: { grants: ["Unlocks Science Ship"], leadsTo: ["tech_x"] },
          dlc: null,
          flags: { isRare: false, isDangerous: false, isRepeatable: false, isStarting: true, isInsight: false },
          name: "tech_space_exploration",
          description: null,
          icon: null,
        },
      },
    };
    expect(() => TechSnapshotSchema.parse(fixture)).not.toThrow();
  });

  it("fails validation when unlocks is missing the leadsTo sub-field", () => {
    const fixture = {
      meta: {
        gameVersion: "v4.5.0",
        generatedAt: new Date().toISOString(),
        techCount: 1,
        areaCounts: { physics: 1 },
        tierCounts: { "0": 1 },
        sourceFiles: ["00_phys_tech.txt"],
      },
      techs: {
        tech_space_exploration: {
          key: "tech_space_exploration",
          area: "physics",
          category: ["computing"],
          tier: 0,
          cost: 0,
          weight: 0,
          prerequisites: [],
          unlocks: { grants: ["Unlocks Science Ship"] },
          dlc: null,
          flags: { isRare: false, isDangerous: false, isRepeatable: false, isStarting: true, isInsight: false },
          name: "tech_space_exploration",
          description: null,
          icon: null,
        },
      },
    };
    expect(() => TechSnapshotSchema.parse(fixture)).toThrow();
  });
});

// NOTE: the original walking-skeleton end-to-end assemble test (Plan 01) ran
// runAssemble() against a single fast file. Plan 05 Task 2 rewrote
// assemble.ts into the FULL pipeline (all 33 files + icon conversion for the
// full corpus), which takes well over a minute -- incompatible with this
// suite's fast per-file unit-test scope, and running it here in parallel
// with the dedicated full-corpus suite raced on shared icon temp files.
// The equivalent (and stronger) end-to-end assertion now lives in
// test/corpus.test.ts (D-18 full-corpus suite), which is the single place
// that invokes the real full-pipeline runAssemble().
