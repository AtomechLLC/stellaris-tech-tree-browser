/**
 * Tests for scripted DLC trigger resolution (parseDlcTriggerDefs / loadDlcTriggerMap)
 * and the third, fallback-only classifyDlc layer.
 */
import { describe, it, expect } from "vitest";
import { resolveConfig } from "../src/config.js";
import { loadScriptedVariables } from "../src/parser/scripted-variables.js";
import { extractAllTechs } from "../src/parser/tech-extractor.js";
import { loadDlcRegistry } from "../src/dlc/dlc-registry.js";
import { classifyDlc } from "../src/dlc/dlc-classifier.js";
import { parseDlcTriggerDefs, loadDlcTriggerMap } from "../src/dlc/dlc-triggers.js";

const registry = new Map<string, string>([
  ["dlc041_willpower", "Willpower"],
  ["dlc_machine_age", "The Machine Age"],
  ["dlc_shroud", "Shadows of the Shroud"],
]);
const triggers = new Map<string, string>([
  ["has_force_of_will_dlc", "Willpower"],
  ["has_shroud_dlc", "Shadows of the Shroud"],
  ["has_paragon_dlc", "Galactic Paragons"],
]);

describe("parseDlcTriggerDefs", () => {
  it("maps the interleaved-array form with the optimize_memory marker", () => {
    const map = parseDlcTriggerDefs({
      has_force_of_will_dlc: ["optimize_memory", null, "host_has_dlc", null, "Willpower"],
    });
    expect(map.get("has_force_of_will_dlc")).toBe("Willpower");
  });

  it("maps the plain-object form", () => {
    const map = parseDlcTriggerDefs({ has_x_dlc: { host_has_dlc: "X" } });
    expect(map.get("has_x_dlc")).toBe("X");
  });

  it("rejects OR, NOT and trigger-referencing bodies", () => {
    const map = parseDlcTriggerDefs({
      has_space_monster_dlc: { OR: { host_has_dlc: ["A", "B"] } },
      has_not_machine_age_dlc: ["optimize_memory", null, "NOT", null, { host_has_dlc: "Y" }],
      has_not_megacorp_dlc: { has_megacorp_dlc: false },
    });
    expect(map.size).toBe(0);
  });
});

describe("classifyDlc third layer", () => {
  it("resolves a top-level positive scripted trigger", () => {
    const potential = { has_force_of_will_dlc: true, OR: { exists: "ideology" } };
    expect(classifyDlc({ potentialRaw: potential }, "00_forceofwill_tech.txt", registry, triggers)).toBe("Willpower");
  });

  it("accepts the 'yes' string and AND/hidden_trigger wrappers", () => {
    expect(classifyDlc({ potentialRaw: { has_paragon_dlc: "yes" } }, "00_x.txt", registry, triggers)).toBe("Galactic Paragons");
    expect(classifyDlc({ potentialRaw: { AND: { has_paragon_dlc: true } } }, "00_x.txt", registry, triggers)).toBe("Galactic Paragons");
    expect(classifyDlc({ potentialRaw: { hidden_trigger: { has_paragon_dlc: true } } }, "00_x.txt", registry, triggers)).toBe("Galactic Paragons");
  });

  it("returns null for a negative value, or when only under OR/NOT/NOR", () => {
    expect(classifyDlc({ potentialRaw: { has_paragon_dlc: false } }, "00_x.txt", registry, triggers)).toBeNull();
    expect(classifyDlc({ potentialRaw: { has_paragon_dlc: "no" } }, "00_x.txt", registry, triggers)).toBeNull();
    expect(classifyDlc({ potentialRaw: { OR: { has_paragon_dlc: true } } }, "00_x.txt", registry, triggers)).toBeNull();
    expect(classifyDlc({ potentialRaw: { NOT: { has_paragon_dlc: true } } }, "00_x.txt", registry, triggers)).toBeNull();
    expect(classifyDlc({ potentialRaw: { NOR: { has_paragon_dlc: true } } }, "00_x.txt", registry, triggers)).toBeNull();
  });

  it("is fallback-only: filename beats trigger, host_has_dlc beats both", () => {
    expect(
      classifyDlc({ potentialRaw: { has_shroud_dlc: true } }, "00_machine_age_tech.txt", registry, triggers),
    ).toBe("The Machine Age");
    expect(
      classifyDlc({ potentialRaw: { host_has_dlc: "Zed", has_shroud_dlc: true } }, "00_machine_age_tech.txt", registry, triggers),
    ).toBe("Zed");
  });

  it("3-arg call behaves as before", () => {
    expect(classifyDlc({ potentialRaw: { has_shroud_dlc: true } }, "00_phys_tech.txt", registry)).toBeNull();
  });
});

describe("real install guard", () => {
  it("trigger map is non-empty and its DLC names exist in the registry", async () => {
    const { gameRoot } = resolveConfig([]);
    const { map } = await loadDlcTriggerMap(gameRoot);
    expect(map.size).toBeGreaterThan(0);
    const names = new Set((await loadDlcRegistry(gameRoot)).values());
    const techs = await extractAllTechs(gameRoot, await loadScriptedVariables(gameRoot));
    for (const t of techs) {
      const p = t.potentialRaw;
      if (typeof p !== "object" || p === null || Array.isArray(p)) continue;
      for (const k of Object.keys(p)) {
        const dlc = map.get(k);
        if (dlc) expect(names.has(dlc), `${k} -> ${dlc}`).toBe(true);
      }
    }
  }, 120000);
});
