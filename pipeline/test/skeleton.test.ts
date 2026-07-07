import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseClausewitzFile, normalizeToArray } from "../src/parser/clausewitz.js";
import { loadScriptedVariables, resolveValue } from "../src/parser/scripted-variables.js";
import { resolveConfig } from "../src/config.js";
import { detectGameVersion } from "../src/version/detect.js";
import { TechSnapshotSchema } from "../src/schema/tech-snapshot.js";
import { runAssemble } from "../src/assemble.js";

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
          flags: { isRare: false, isDangerous: false, isRepeatable: false, isStarting: true },
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
          flags: { isRare: false, isDangerous: false, isRepeatable: false, isStarting: true },
          name: "tech_space_exploration",
          description: null,
          icon: null,
        },
      },
    };
    expect(() => TechSnapshotSchema.parse(fixture)).toThrow();
  });
});

describe("assemble: end-to-end walking skeleton", () => {
  it("writes data/v4.5.0/tech.json, round-trips through the schema, and resolves a real @variable cost", async () => {
    const outPath = await runAssemble();
    expect(existsSync(outPath)).toBe(true);

    const written = JSON.parse(readFileSync(outPath, "utf8"));
    const parsedSnapshot = TechSnapshotSchema.parse(written);

    expect(parsedSnapshot.meta.gameVersion).toBe("v4.5.0");
    expect(parsedSnapshot.meta.techCount).toBeGreaterThanOrEqual(1);

    const first = Object.values(parsedSnapshot.techs)[0];
    expect(typeof first.cost).toBe("number");
    expect(Array.isArray(first.unlocks.grants)).toBe(true);
    expect(Array.isArray(first.unlocks.leadsTo)).toBe(true);
  });
});
