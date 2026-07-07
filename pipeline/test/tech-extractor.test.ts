import { describe, it, expect } from "vitest";
import { resolveConfig } from "../src/config.js";
import { loadScriptedVariables } from "../src/parser/scripted-variables.js";
import { extractAllTechs } from "../src/parser/tech-extractor.js";
import { loadDlcRegistry } from "../src/dlc/dlc-registry.js";
import { classifyDlc } from "../src/dlc/dlc-classifier.js";
import { buildAndValidateGraph } from "../src/graph/build-dag.js";
import type { ExtractedTech } from "../src/parser/tech-extractor.js";

const { gameRoot } = resolveConfig([]);

// Loaded once per test file — real corpus, real scripted variables (per D-18:
// validate against the FULL 33-file corpus, not a sample/mock).
let cachedTechs: ExtractedTech[] | null = null;
async function getTechs(): Promise<ExtractedTech[]> {
  if (!cachedTechs) {
    const varMap = await loadScriptedVariables(gameRoot);
    cachedTechs = await extractAllTechs(gameRoot, varMap);
  }
  return cachedTechs;
}

describe("extractor: extractAllTechs (full 33-file corpus)", () => {
  it("Test 1: returns 670+ techs, all keys start with tech_", async () => {
    const techs = await getTechs();
    expect(techs.length).toBeGreaterThanOrEqual(670);
    for (const t of techs) {
      expect(t.key.startsWith("tech_")).toBe(true);
    }
  });

  it("Test 2: tech_space_exploration has correct area/tier/category/flags/cost", async () => {
    const techs = await getTechs();
    const tech = techs.find((t) => t.key === "tech_space_exploration");
    expect(tech).toBeDefined();
    expect(tech!.area).toBe("physics");
    expect(tech!.tier).toBe(0);
    expect(tech!.category).toContain("computing");
    expect(tech!.flags.isStarting).toBe(true);
    expect(tech!.cost).toBe(0);
  });

  it("Test 3: an @variable weight resolves to a concrete number (tech_basic_science_lab_2)", async () => {
    const techs = await getTechs();
    const tech = techs.find((t) => t.key === "tech_basic_science_lab_2");
    expect(tech).toBeDefined();
    expect(typeof tech!.weight).toBe("number");
    expect(tech!.weight).toBe(90);
  });

  it("Test 4: a multi-modifier weight_modifier block preserves duplicate modifiers as an array (tech_basic_science_lab_2)", async () => {
    const techs = await getTechs();
    const tech = techs.find((t) => t.key === "tech_basic_science_lab_2");
    expect(tech).toBeDefined();
    const raw = tech!.weightModifierRaw as { modifier: unknown[] };
    expect(Array.isArray(raw.modifier)).toBe(true);
    expect(raw.modifier.length).toBeGreaterThanOrEqual(2);
  });

  it("Test 5: a three-swap tech (tech_basic_science_lab_3) does not crash", async () => {
    const techs = await getTechs();
    const tech = techs.find((t) => t.key === "tech_basic_science_lab_3");
    expect(tech).toBeDefined();
    expect(tech!.prerequisites).toContain("tech_basic_science_lab_2");
  });

  it("Test 6: 000_documentation.txt contributes zero techs, no non-tech_* keys leak", async () => {
    const techs = await getTechs();
    for (const t of techs) {
      expect(t.key.startsWith("tech_")).toBe(true);
    }
    const fromDocs = techs.filter((t) => t.sourceFile === "000_documentation.txt");
    expect(fromDocs.length).toBe(0);
  });

  it("Test 7: each tech captures its OWN raw unlock content (D-05 component a)", async () => {
    const techs = await getTechs();

    const spaceExploration = techs.find((t) => t.key === "tech_space_exploration");
    expect(spaceExploration).toBeDefined();
    expect(spaceExploration!.unlockContentRaw.featureFlags).toContain("tech_automated_exploration");
    expect(
      spaceExploration!.unlockContentRaw.prereqforDesc.some(
        (p) => p.title === "TECH_UNLOCK_SCIENCE_SHIP_CONSTRUCTION_TITLE",
      ),
    ).toBe(true);

    const ecoSimulation = techs.find((t) => t.key === "tech_eco_simulation");
    expect(ecoSimulation).toBeDefined();
    expect(ecoSimulation!.unlockContentRaw.gateway).toBe("zone");
    expect(
      ecoSimulation!.unlockContentRaw.grantsModifiers.some((m) => "planet_farmers_food_produces_mult" in m),
    ).toBe(true);
    // weight_modifier/ai_weight modifiers must NOT leak into grantsModifiers.
    expect(
      ecoSimulation!.unlockContentRaw.grantsModifiers.some((m) => "factor" in m || "OR" in m),
    ).toBe(false);
  });
});

describe("dlc: loadDlcRegistry + classifyDlc", () => {
  it("Test 1: loadDlcRegistry yields the authoritative display-name strings", async () => {
    const registry = await loadDlcRegistry(gameRoot);
    const values = Array.from(registry.values());
    expect(values).toContain("Ancient Relics Story Pack");
    expect(values).toContain("Apocalypse");
    expect(values).toContain("Federations");
    expect(values).toContain("Distant Stars Story Pack");
  });

  it("Test 2: a tech from 00_ancient_relics_tech.txt classifies via filename convention", async () => {
    const registry = await loadDlcRegistry(gameRoot);
    const techs = await getTechs();
    const tech = techs.find((t) => t.sourceFile === "00_ancient_relics_tech.txt");
    expect(tech).toBeDefined();
    const dlc = classifyDlc(tech!, tech!.sourceFile, registry);
    expect(dlc).toBe("Ancient Relics Story Pack");
  });

  it("Test 3: the Apocalypse-gated titan tech in 00_eng_tech.txt overrides filename via host_has_dlc", async () => {
    const registry = await loadDlcRegistry(gameRoot);
    const varMap = await loadScriptedVariables(gameRoot);
    const { parseClausewitzFile } = await import("../src/parser/clausewitz.js");
    const { join } = await import("node:path");
    const rawFile = await parseClausewitzFile(join(gameRoot, "common/technology/00_eng_tech.txt"));

    let titanTechKey: string | null = null;
    for (const [key, value] of Object.entries(rawFile)) {
      if (!key.startsWith("tech_") || typeof value !== "object" || value === null) continue;
      const potential = (value as Record<string, unknown>).potential;
      if (
        potential &&
        typeof potential === "object" &&
        (potential as Record<string, unknown>).host_has_dlc === "Apocalypse"
      ) {
        titanTechKey = key;
        break;
      }
    }
    expect(titanTechKey).not.toBeNull();

    const { extractTech } = await import("../src/parser/tech-extractor.js");
    const tech = extractTech(titanTechKey!, rawFile[titanTechKey!] as Record<string, unknown>, varMap, "00_eng_tech.txt");
    const dlc = classifyDlc(tech, "00_eng_tech.txt", registry);
    expect(dlc).toBe("Apocalypse");
  });

  it("Test 4: a plain base-game tech (no DLC filename, no host_has_dlc) classifies as null", async () => {
    const registry = await loadDlcRegistry(gameRoot);
    const techs = await getTechs();
    const tech = techs.find((t) => t.key === "tech_space_exploration");
    expect(tech).toBeDefined();
    const dlc = classifyDlc(tech!, tech!.sourceFile, registry);
    expect(dlc).toBeNull();
  });
});

describe("graph: buildAndValidateGraph", () => {
  it("Test 1: the real extracted corpus builds without throwing (no dangling refs, no cycles)", async () => {
    const techs = await getTechs();
    expect(() => buildAndValidateGraph(techs)).not.toThrow();
  });

  it("Test 2: a synthetic dangling prerequisite throws naming the tech and missing key", () => {
    const synthetic = [
      { key: "tech_a", prerequisites: ["tech_missing"] } as unknown as ExtractedTech,
    ];
    expect(() => buildAndValidateGraph(synthetic)).toThrow(/tech_a/);
    expect(() => buildAndValidateGraph(synthetic)).toThrow(/tech_missing/);
  });

  it("Test 3: a synthetic prerequisite cycle (A->B->A) throws a cycle error", () => {
    const synthetic = [
      { key: "tech_a", prerequisites: ["tech_b"] } as unknown as ExtractedTech,
      { key: "tech_b", prerequisites: ["tech_a"] } as unknown as ExtractedTech,
    ];
    expect(() => buildAndValidateGraph(synthetic)).toThrow(/cycle/i);
  });

  it("Test 4: reverse edges (leadsTo) are computed and sorted", async () => {
    const techs = await getTechs();
    const graph = buildAndValidateGraph(techs);
    const lab1 = graph.get("tech_basic_science_lab_1");
    expect(lab1).toBeDefined();
    expect(lab1!.leadsTo).toContain("tech_basic_science_lab_2");
    const sorted = [...lab1!.leadsTo].sort();
    expect(lab1!.leadsTo).toEqual(sorted);
  });
});
