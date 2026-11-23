import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { resolveConfig } from "../src/config.js";
import { scanAllLocalisation, resolveTechText } from "../src/localisation/loc-scanner.js";

const { gameRoot } = resolveConfig([]);
const locDir = join(gameRoot, "localisation/english");

describe("localisation: scanAllLocalisation", () => {
  it("returns a Map with thousands of entries across all .yml files, resolving tech_space_exploration", () => {
    const map = scanAllLocalisation(locDir);
    expect(map.size).toBeGreaterThan(1000);
    expect(map.get("tech_space_exploration")).toBe("Space Exploration");
  });

  it("resolves a tech key that lives OUTSIDE technology_l_english.yml (megacorp_l_english.yml)", () => {
    const map = scanAllLocalisation(locDir);
    // tech_executive_retreat is localised in megacorp_l_english.yml, not technology_l_english.yml
    expect(map.get("tech_executive_retreat")).toBe("Executive Leisure Program");
  });

  it("resolves a tech key that lives in biogenesis_bioships_l_english.yml", () => {
    const map = scanAllLocalisation(locDir);
    expect(map.get("tech_maulers")).toBeTypeOf("string");
    expect(map.get("tech_maulers")!.length).toBeGreaterThan(0);
  });

  it("resolves a no-index-form line (key: \"value\" with no numeric index)", () => {
    const map = scanAllLocalisation(locDir);
    // tech_fe_lab_2 in fallen_empire_l_english.yml uses the no-index form
    expect(map.get("tech_fe_lab_2")).toBe("$building_fe_lab_2$");
  });
});

describe("localisation: resolveTechText", () => {
  it("resolves name and description for a real tech key", () => {
    const map = scanAllLocalisation(locDir);
    const result = resolveTechText("tech_space_exploration", map);
    expect(result.name).toBe("Space Exploration");
    expect(typeof result.description === "string" || result.description === null).toBe(true);
    expect(result.description).toContain("faster-than-light travel");
  });

  it("returns null name for a genuinely absent tech key", () => {
    const map = scanAllLocalisation(locDir);
    const result = resolveTechText("tech_this_key_does_not_exist_xyz", map);
    expect(result.name).toBeNull();
  });

  it("returns null description when no *_desc key exists", () => {
    const map = new Map<string, string>([["tech_fake_no_desc", "Fake Tech"]]);
    const result = resolveTechText("tech_fake_no_desc", map);
    expect(result.name).toBe("Fake Tech");
    expect(result.description).toBeNull();
  });
});

describe("localisation: scripted-loc [GetX] defaults", () => {
  it("resolves a bare [GetX] call to its scripted_loc default localisation", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { loadScriptedLocDefaults, resolveTechText: rtt } = await import("../src/localisation/loc-scanner.js");
    const dir = mkdtempSync(join(tmpdir(), "sloc-"));
    writeFileSync(
      join(dir, "a.txt"),
      "defined_text = {\n name = GetCulturalEnvoyNamePlural\n text = { trigger = { always = yes } localization_key = cultural_envoy_x }\n default = cultural_envoy_default_plural\n}\n",
    );
    const defaults = await loadScriptedLocDefaults(dir);
    const map = new Map([
      ["tech_cultural_envoys", "$cultural_envoy_ship_plural$"],
      ["cultural_envoy_ship_plural", "[GetCulturalEnvoyNamePlural]"],
      ["cultural_envoy_default_plural", "Cultural Envoys"],
      ["tech_scoped", "[Root.GetName]"],
      ["tech_unknown", "[GetNothing]"],
    ]);
    expect(rtt("tech_cultural_envoys", map, defaults).name).toBe("Cultural Envoys");
    expect(rtt("tech_scoped", map, defaults).name).toBe("[Root.GetName]");
    expect(rtt("tech_unknown", map, defaults).name).toBe("[GetNothing]");
  });
});
