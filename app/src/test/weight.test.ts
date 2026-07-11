import { describe, expect, it } from "vitest";
import type { Tech } from "../types/tech-snapshot";
import { describeWeightModifiers } from "../lib/graph/weight";

/**
 * Unit coverage for the pure weight-modifier humanizer (quick 260708-4y2).
 * Exercises the real `weightModifierRaw` shapes seen in tech.json — base
 * factor, has_technology boosts (name-resolved via techByKey), num_owned_planets
 * comparisons, single-object vs array `modifier`, boolean flags — plus the
 * defensive fall-throughs (empty/undefined/unknown shapes → no lines, no throw).
 */

/** Minimal Tech factory — only `key`/`name` matter for name resolution. */
function tech(key: string, name: string): Tech {
  return {
    key,
    area: "engineering",
    category: ["propulsion"],
    tier: 0,
    cost: 0,
    weight: 0,
    prerequisites: [],
    unlocks: { grants: [], leadsTo: [] },
    dlc: null,
    flags: { isRare: false, isDangerous: false, isRepeatable: false, isStarting: false, isInsight: false },
    name,
    description: null,
    icon: null,
    gate: null,
    source: null,
    archetypeIcons: [],
  };
}

function mapOf(...techs: Tech[]): Map<string, Tech> {
  return new Map(techs.map((t) => [t.key, t]));
}

describe("describeWeightModifiers", () => {
  it("resolves a has_technology boost to the tech's display name (thrusters example)", () => {
    const techByKey = mapOf(tech("tech_thrusters_2", "Ion Thrusters"));
    const raw = {
      factor: 1.25,
      modifier: [
        { factor: 2, has_technology: "tech_thrusters_2" },
        { factor: 2, has_technology: "tech_thrusters_3" },
      ],
    };
    const lines = describeWeightModifiers(raw, techByKey);

    expect(lines[0]).toBe("Base ×1.25");
    expect(lines).toContain("×2 if researched Ion Thrusters");
    // Unknown tech key falls back to a prettified key, still never throws.
    expect(lines).toContain("×2 if researched Thrusters 3");
  });

  it("maps a num_owned_planets GREATER_THAN comparison to '> 2'", () => {
    const raw = {
      modifier: [{ factor: 1.5, num_owned_planets: { GREATER_THAN: 2 } }],
    };
    const lines = describeWeightModifiers(raw, mapOf());

    expect(lines).toEqual(["×1.5 if owned planets > 2"]);
  });

  it("maps LESS_THAN to '<'", () => {
    const raw = { modifier: { factor: 0.5, num_owned_planets: { LESS_THAN: 2 } } };
    const lines = describeWeightModifiers(raw, mapOf());

    expect(lines).toEqual(["×0.5 if owned planets < 2"]);
  });

  it("normalises a single-object modifier the same as a one-element array", () => {
    const single = describeWeightModifiers(
      { modifier: { factor: 1.5, is_specialist_subject_type: { TYPE: "scholarium" } } },
      mapOf(),
    );
    // is_specialist_subject_type carries a non-operator object → that condition
    // is skipped, so the modifier has no renderable clause and is dropped.
    expect(single).toEqual([]);
  });

  it("omits a base factor of exactly 1 (no boost to report)", () => {
    expect(describeWeightModifiers({ factor: 1 }, mapOf())).toEqual([]);
  });

  it("renders a base-only factor ≠ 1 as a 'Base ×N' line", () => {
    expect(describeWeightModifiers({ factor: 1.5 }, mapOf())).toEqual(["Base ×1.5"]);
    expect(describeWeightModifiers({ factor: 2 }, mapOf())).toEqual(["Base ×2"]);
  });

  it("renders a boolean flag condition ('with federation')", () => {
    const raw = { modifier: { factor: 3, has_federation: true } };
    expect(describeWeightModifiers(raw, mapOf())).toEqual(["×3 if with federation"]);
  });

  it("joins multiple conditions in one modifier with ' and '", () => {
    const raw = {
      modifier: {
        factor: 2,
        has_technology: "tech_x",
        num_owned_planets: { GREATER_THAN: 4 },
      },
    };
    const lines = describeWeightModifiers(raw, mapOf(tech("tech_x", "Tech X")));
    expect(lines).toEqual(["×2 if researched Tech X and owned planets > 4"]);
  });

  it("preserves an unresolved @variable factor rather than dropping the line", () => {
    const raw = { modifier: { factor: "@federation_perk_factor", has_federation: true } };
    const lines = describeWeightModifiers(raw, mapOf());
    expect(lines).toEqual(["×@federation_perk_factor if with federation"]);
  });

  it("humanizes game-entity conditions instead of dumping raw id tokens", () => {
    // The real Genetic Healthcare modifiers (was showing raw tr_/r_/flag tokens).
    const raw = {
      factor: 2,
      modifier: [
        { factor: 1.25, has_tradition: "tr_harmony_adopt" },
        { factor: 2, has_relic: "r_pox_sample" },
        { factor: 2, has_country_flag: "payback_researching_gene_clinics" },
      ],
    };
    const lines = describeWeightModifiers(raw, mapOf());
    expect(lines).toEqual([
      "Base ×2",
      "×1.25 if Harmony tradition (adopted)",
      "×2 if Pox Sample relic",
      "×2 if Payback Researching Gene Clinics flag",
    ]);
  });

  it("resolves ethics, ascension perks, origins, civics and traits to readable names", () => {
    expect(
      describeWeightModifiers(
        { modifier: { factor: 2, has_ethic: "ethic_fanatic_militarist" } },
        mapOf(),
      ),
    ).toEqual(["×2 if Fanatic Militarist ethic"]);
    expect(
      describeWeightModifiers(
        { modifier: { factor: 2, has_ascension_perk: "ap_mastery_of_nature" } },
        mapOf(),
      ),
    ).toEqual(["×2 if Mastery of Nature ascension perk"]);
    expect(
      describeWeightModifiers(
        { modifier: { factor: 2, has_origin: "origin_necrophage" } },
        mapOf(),
      ),
    ).toEqual(["×2 if Necrophage origin"]);
    expect(
      describeWeightModifiers(
        { modifier: { factor: 2, has_trait: "trait_aquatic" } },
        mapOf(),
      ),
    ).toEqual(["×2 if Aquatic trait"]);
  });

  it("marks a completed (finish) tradition distinctly from an adopted one", () => {
    expect(
      describeWeightModifiers(
        { modifier: { factor: 2, has_tradition: "tr_expansion_finish" } },
        mapOf(),
      ),
    ).toEqual(["×2 if Expansion tradition (completed)"]);
  });

  it("describes an OR logic block by joining its branches with ' or '", () => {
    const raw = {
      modifier: {
        factor: 2,
        OR: { has_origin: "origin_storm_chasers", has_storm_attraction_civic: true },
      },
    };
    expect(describeWeightModifiers(raw, mapOf())).toEqual([
      "×2 if (Storm Chasers origin or with storm attraction civic)",
    ]);
  });

  it("drops a logic block if ANY branch is unrenderable (no misleading partial)", () => {
    const raw = {
      modifier: {
        factor: 2,
        OR: { has_origin: "origin_x", some_deep_unknown: { nested: { a: 1 } } },
      },
    };
    expect(describeWeightModifiers(raw, mapOf())).toEqual([]);
  });

  it("drops a multi-condition modifier when one condition can't be described", () => {
    // Real Mega-Engineering shape: nomadic + a deeply-nested starbase scope. The
    // scope is unrenderable, so the line must NOT render as just 'if nomadic'.
    const raw = {
      modifier: {
        factor: 20,
        is_nomadic: true,
        any_owned_nonprimary_starbase: { solar_system: { space_owner: { has_technology: "tech_x" } } },
      },
    };
    expect(describeWeightModifiers(raw, mapOf())).toEqual([]);
  });

  it("humanizes Mega-Engineering's real drivers and collapses the starbase scaling", () => {
    const techByKey = mapOf(tech("tech_mega_engineering", "Mega-Engineering"));
    const raw = {
      factor: 0.25,
      modifier: [
        { factor: 1.5, OR: { has_trait_in_council: [{ TRAIT: "leader_trait_curator" }, { TRAIT: "leader_trait_maniacal" }] } },
        { factor: 1.5, count_starbase_sizes: { starbase_size: "starbase_starhold", count: { GREATER_THAN_EQUAL: 1 } } },
        { factor: 1.5, count_starbase_sizes: { starbase_size: "starbase_starhold", count: { GREATER_THAN_EQUAL: 2 } } },
        { factor: 2, any_owned_planet: { is_planet_class: "pc_habitat" } },
        { factor: 1.5, any_neighbor_country: { has_technology: "tech_mega_engineering" } },
        { factor: 20, OR: { has_any_megastructure_in_empire: true, has_origin: "origin_shattered_ring" } },
      ],
    };
    expect(describeWeightModifiers(raw, techByKey)).toEqual([
      "Base ×0.25",
      "×1.5 if a councilor is Curator or Maniacal",
      "×1.5 if with Star Holds",
      "×2 if you own a Habitat",
      "×1.5 if a neighbor researched Mega-Engineering",
      "×20 if (you have a megastructure or Shattered Ring origin)",
    ]);
  });

  it("returns [] for empty / undefined / non-object input (defensive)", () => {
    expect(describeWeightModifiers(undefined, mapOf())).toEqual([]);
    expect(describeWeightModifiers(null, mapOf())).toEqual([]);
    expect(describeWeightModifiers({}, mapOf())).toEqual([]);
    expect(describeWeightModifiers("nonsense", mapOf())).toEqual([]);
    expect(describeWeightModifiers(42, mapOf())).toEqual([]);
    expect(describeWeightModifiers([], mapOf())).toEqual([]);
  });
});
