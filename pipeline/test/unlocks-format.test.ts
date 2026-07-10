import { describe, it, expect } from "vitest";
import { formatStatGrant } from "../src/unlocks.js";

/**
 * Wiki-style stat-grant formatting (sign+number+unit, then the stat name from
 * the game's own `mod_<key>` localisation — case-insensitive, since game loc
 * keys are case-mixed). Pins the flat-vs-percent convention and the loc
 * fallback prettifier.
 */
describe("formatStatGrant", () => {
  const loc = new Map<string, string>([
    ["MOD_ARMY_DAMAGE_MULT", "Army Damage"],
    ["MOD_COUNTRY_EDICT_FUND_ADD", "Edict Fund"],
    // Nested-ref loc value (real shape: crime _mult resolves via the _add name).
    ["MOD_PLANET_CRIME_MULT", "$MOD_PLANET_CRIME_ADD$"],
    ["MOD_PLANET_CRIME_ADD", "Crime"],
    ["mod_MACHINE_species_trait_points_add", "Machine Modification Points"],
  ]);

  it("formats _mult modifiers as signed percentages with the loc name", () => {
    expect(formatStatGrant("army_damage_mult", 0.05, loc)).toEqual({
      text: "+5% Army Damage",
      resolved: true,
    });
  });

  it("formats negative percentages with a proper minus sign", () => {
    expect(formatStatGrant("planet_crime_mult", -0.15, loc).text).toBe("−15% Crime");
  });

  it("formats _add modifiers as flat signed numbers", () => {
    expect(formatStatGrant("country_edict_fund_add", 20, loc).text).toBe("+20 Edict Fund");
  });

  it("keeps fractional _add values flat (envoys stack in halves)", () => {
    const r = formatStatGrant("envoys_add", 0.5, loc);
    expect(r.text).toBe("+0.5 Envoys");
    expect(r.resolved).toBe(false); // no loc entry → prettified fallback
  });

  it("treats unsuffixed fractional stats as percentages", () => {
    expect(formatStatGrant("science_ship_survey_speed", 0.25, loc).text).toBe(
      "+25% Science Ship Survey Speed",
    );
  });

  it("treats unsuffixed values ≥ 2 as flat (intel / node skill)", () => {
    expect(formatStatGrant("add_base_country_intel", 10, loc).text).toBe(
      "+10 Base Country Intel",
    );
    expect(formatStatGrant("restored_node_bonus_skill", 2, loc).text).toBe(
      "+2 Restored Node Bonus Skill",
    );
  });

  it("resolves loc case-insensitively (mixed-case game keys)", () => {
    expect(formatStatGrant("MACHINE_species_trait_points_add", 3, loc).text).toBe(
      "+3 Machine Modification Points",
    );
  });

  it("cleans float noise in percentages (0.05 × 100 ≠ 5.000000000000001)", () => {
    expect(formatStatGrant("some_speed_mult", 0.05, new Map()).text).toBe("+5% Some Speed");
  });
});
