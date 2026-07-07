import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { parseClausewitzFile, normalizeToArray } from "../src/parser/clausewitz.js";
import { loadScriptedVariables, resolveValue } from "../src/parser/scripted-variables.js";
import { resolveConfig } from "../src/config.js";

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
