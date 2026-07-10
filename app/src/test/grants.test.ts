import { describe, expect, it } from "vitest";
import { formatGrantLine, splitGrantValue } from "../lib/graph/grants";

/**
 * Render-time grant-line formatter (wiki-style effect lines). Pins the
 * flat-vs-percent value convention, feature-flag humanization, and — critically
 * — that already-readable pipeline text passes through UNTOUCHED.
 */
describe("formatGrantLine", () => {
  it("formats _mult stats as signed percentages", () => {
    expect(formatGrantLine("army_damage_mult: 0.05")).toBe("+5% Army Damage");
    expect(formatGrantLine("planet_crime_mult: -0.15")).toBe("−15% Planet Crime");
  });

  it("formats _add stats as flat signed numbers (fractions stay flat)", () => {
    expect(formatGrantLine("country_edict_fund_add: 20")).toBe("+20 Country Edict Fund");
    expect(formatGrantLine("envoys_add: 0.5")).toBe("+0.5 Envoys");
  });

  it("treats unsuffixed fractional stats as percentages", () => {
    expect(formatGrantLine("science_ship_survey_speed: 0.25")).toBe(
      "+25% Science Ship Survey Speed",
    );
  });

  it("treats unsuffixed values ≥ 2 as flat, stripping the add_ prefix", () => {
    expect(formatGrantLine("add_base_country_intel: 10")).toBe("+10 Base Country Intel");
    expect(formatGrantLine("restored_node_bonus_skill: 2")).toBe(
      "+2 Restored Node Bonus Skill",
    );
  });

  it("cleans float noise in percentages", () => {
    expect(formatGrantLine("some_speed_mult: 0.05")).toBe("+5% Some Speed");
  });

  it("humanizes bare feature-flag tokens with an Unlocks lead-in", () => {
    expect(formatGrantLine("espionage")).toBe("Unlocks Espionage");
    expect(formatGrantLine("sustain_cosmic_storm_unlocked")).toBe(
      "Unlocks Sustain Cosmic Storm",
    );
    expect(formatGrantLine("unlock_arcane_deciphering")).toBe("Unlocks Arcane Deciphering");
  });

  it("passes already-readable pipeline text through untouched", () => {
    const readable = "Unlocks Component: Antimatter Reactor — By harnessing the energy";
    expect(formatGrantLine(readable)).toBe(readable);
    expect(formatGrantLine("Battleship Hull Points: +10%")).toBe("Battleship Hull Points: +10%");
    // A pre-formatted future pipeline line is a no-op too.
    expect(formatGrantLine("+5% Army Damage")).toBe("+5% Army Damage");
  });
});

describe("splitGrantValue", () => {
  it("splits a leading signed value from the stat name", () => {
    expect(splitGrantValue("+5% Army Damage")).toEqual({ value: "+5%", rest: "Army Damage" });
    expect(splitGrantValue("−15% Planet Crime")).toEqual({ value: "−15%", rest: "Planet Crime" });
    expect(splitGrantValue("+0.5 Envoys")).toEqual({ value: "+0.5", rest: "Envoys" });
  });

  it("returns null value for lines without a leading number", () => {
    expect(splitGrantValue("Unlocks Espionage")).toEqual({ value: null, rest: "Unlocks Espionage" });
  });
});
