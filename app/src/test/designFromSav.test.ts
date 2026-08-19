import { describe, it, expect } from "vitest";
import { extractDesignFromCountry, readEthos } from "../lib/empire/designFromSav";

/**
 * Fixture-object coverage of designFromSav.ts's extractDesignFromCountry
 * (Task 1's behavior block), in the empire-classify.test.ts style: one
 * shared factory plus per-test overrides via object spread. Deliberately
 * does NOT load app/public/data/v4.5.0/sample.sav (gitignored local file) —
 * the test must be deterministic in a clean checkout.
 */

const COUNTRY_ID = 1;
const FOUNDER_REF = 536870913; // real saves observe large tagged species_db ids
const RULER_ID = 900;
const CAPITAL_ID = 50;
const HOME_PLANET_ID = 51;
const SYSTEM_ID = 20;
const HOME_PLANET_NONE = 4294967295;

function baseCountry(overrides: Record<string, any> = {}) {
  return {
    government: {
      authority: "auth_democratic",
      type: "gov_democratic",
      civics: ["civic_meritocracy"],
      origin: "origin_prosperous_unification",
    },
    founder_species_ref: FOUNDER_REF,
    ruler: RULER_ID,
    capital: CAPITAL_ID,
    name: { key: "Test Empire" },
    adjective: { key: "Testian" },
    ethos: { ethic: ["ethic_xenophile"] },
    ship_prefix: { key: "TST" },
    room: "test_room",
    graphical_culture: "human_01",
    city_graphical_culture: "human_01",
    ...overrides,
  };
}

function baseSpecies(overrides: Record<string, any> = {}) {
  return {
    class: "HUM",
    portrait: "hum01",
    name: { key: "SPEC_Human" },
    plural: { key: "SPEC_Human_pl" },
    adjective: { key: "SPEC_Human_adj" },
    name_list: "HUM1",
    gender: "not_set",
    traits: { trait: ["trait_intelligent", "trait_natural_physicists"] },
    home_planet: { type: "planet", reference: HOME_PLANET_ID },
    ...overrides,
  };
}

function baseLeader(overrides: Record<string, any> = {}) {
  return {
    gender: "male",
    name: { key: "HUM1_CHR_Test" },
    portrait: "hum01",
    class: "official",
    traits: ["subclass_official_economy_councilor", "leader_trait_reformer_2"],
    ...overrides,
  };
}

function basePlanetTable(overrides: Record<string, any> = {}) {
  return {
    [CAPITAL_ID]: {
      planet_class: "pc_continental",
      name: { key: "Test Capital" },
      coordinate: { origin: SYSTEM_ID },
    },
    [HOME_PLANET_ID]: { planet_class: "pc_ocean", name: { key: "Home World" } },
    ...overrides,
  };
}

function baseGalacticObject() {
  return { [SYSTEM_ID]: { name: { key: "Test System" } } };
}

function buildRoot(
  opts: {
    country?: Record<string, any>;
    species?: Record<string, any> | null;
    leader?: Record<string, any> | null;
    planetOverrides?: Record<string, any>;
  } = {},
) {
  return {
    country: { [COUNTRY_ID]: baseCountry(opts.country) },
    species_db: opts.species === null ? {} : { [FOUNDER_REF]: baseSpecies(opts.species ?? {}) },
    leaders: opts.leader === null ? {} : { [RULER_ID]: baseLeader(opts.leader ?? {}) },
    planets: { planet: basePlanetTable(opts.planetOverrides) },
    galactic_object: baseGalacticObject(),
  };
}

const OPTS = { displayName: "Test Empire", ethics: ["ethic_materialist"] };

describe("extractDesignFromCountry — happy path", () => {
  it("lifts government/authority/civics/origin from the save's nested government block", () => {
    const design = extractDesignFromCountry(buildRoot(), COUNTRY_ID, OPTS);
    expect(design).not.toBeNull();
    expect(design!.government).toBe("gov_democratic");
    expect(design!.authority).toBe("auth_democratic");
    expect(design!.civics).toEqual(["civic_meritocracy"]);
    expect(design!.origin).toBe("origin_prosperous_unification");
  });
});

describe("extractDesignFromCountry — species mapping", () => {
  it("renames name/plural/adjective and unwraps traits.trait[] into traits[]", () => {
    const design = extractDesignFromCountry(buildRoot(), COUNTRY_ID, OPTS)!;
    expect(design.species.species_name).toEqual({ key: "SPEC_Human" });
    expect(design.species.species_plural).toEqual({ key: "SPEC_Human_pl" });
    expect(design.species.species_adjective).toEqual({ key: "SPEC_Human_adj" });
    expect(design.species.traits).toEqual(["trait_intelligent", "trait_natural_physicists"]);
  });

  it("a species whose traits is an empty object yields traits: []", () => {
    const root = buildRoot({ species: { traits: {} } });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.species.traits).toEqual([]);
  });
});

describe("extractDesignFromCountry — ruler resolution", () => {
  it("a leader with a design snapshot is used directly, including non-zero texture/clothes", () => {
    const root = buildRoot({
      leader: {
        design: {
          gender: "female",
          name: { full_names: { key: "HUM1_CHR_Elemani" }, use_full_regnal_name: "yes" },
          portrait: "hum02",
          texture: 3,
          evolution_mask: 1,
          attachment: 2,
          clothes: 5,
          trait: "leader_trait_spark_of_genius",
          leader_class: "scientist",
        },
      },
    });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.ruler).toEqual({
      gender: "female",
      name: { full_names: { key: "HUM1_CHR_Elemani" }, use_full_regnal_name: true },
      portrait: "hum02",
      texture: 3,
      evolution_mask: 1,
      attachment: 2,
      clothes: 5,
      trait: "leader_trait_spark_of_genius",
      leader_class: "scientist",
    });
  });

  it("a leader without a design snapshot is synthesized with zeroed sliders and the leader_trait_-prefixed trait, not the subclass_-prefixed one", () => {
    const design = extractDesignFromCountry(buildRoot(), COUNTRY_ID, OPTS)!;
    expect(design.ruler.trait).toBe("leader_trait_reformer_2");
    expect(design.ruler.trait).not.toBe("subclass_official_economy_councilor");
    expect(design.ruler.texture).toBe(0);
    expect(design.ruler.evolution_mask).toBe(0);
    expect(design.ruler.attachment).toBe(0);
    expect(design.ruler.clothes).toBe(0);
    expect(design.ruler.gender).toBe("male");
    expect(design.ruler.portrait).toBe("hum01");
    expect(design.ruler.leader_class).toBe("official");
  });

  it("a ruler id missing from leaders entirely still returns a valid, complete ruler block", () => {
    const root = buildRoot({ leader: null }); // country.ruler points at RULER_ID, but leaders is empty
    expect(() => extractDesignFromCountry(root, COUNTRY_ID, OPTS)).not.toThrow();
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.ruler.gender).toBe("not_set");
    expect(design.ruler.trait).toBe("");
    expect(design.ruler.portrait).toBe("hum01"); // falls back to the founder species' portrait
    expect(design.ruler.texture).toBe(0);
  });
});

describe("extractDesignFromCountry — planet_class guard", () => {
  it("never returns pc_b_star, even when the capital resolves to one; a habitable home_planet class is preferred", () => {
    const root = buildRoot({ planetOverrides: { [CAPITAL_ID]: { planet_class: "pc_b_star", coordinate: { origin: SYSTEM_ID } } } });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.planet_class).not.toBe("pc_b_star");
    expect(design.planet_class).toBe("pc_ocean"); // from species.home_planet, preferred over the capital
  });

  it("falls back to pc_continental when neither the home_planet nor the capital resolve to a habitable class", () => {
    const root = buildRoot({
      species: { home_planet: { type: "planet", reference: HOME_PLANET_NONE } },
      planetOverrides: { [CAPITAL_ID]: { planet_class: "pc_b_star", coordinate: { origin: SYSTEM_ID } } },
    });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.planet_class).not.toBe("pc_b_star");
    expect(design.planet_class).toBe("pc_continental");
  });
});

describe("extractDesignFromCountry — field defaults", () => {
  it("room absent yields default_room; ship_prefix absent yields {key: ISS}; is_nomadic absent yields false", () => {
    const root = buildRoot({ country: { room: undefined, ship_prefix: undefined, is_nomadic: undefined } });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.room).toBe("default_room");
    expect(design.ship_prefix).toEqual({ key: "ISS" });
    expect(design.is_nomadic).toBe(false);
  });

  it('is_nomadic: "yes" yields true', () => {
    const root = buildRoot({ country: { is_nomadic: "yes" } });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.is_nomadic).toBe(true);
  });

  it("advisor_voice_type is omitted from the object entirely when absent from the save", () => {
    const design = extractDesignFromCountry(buildRoot(), COUNTRY_ID, OPTS)!;
    expect("advisor_voice_type" in design).toBe(false);
  });

  it("advisor_voice_type is copied through when present", () => {
    const root = buildRoot({ country: { advisor_voice_type: "voice_male_1" } });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.advisor_voice_type).toBe("voice_male_1");
  });

  it("initializer is always empty and the spawn flags use save-less safe defaults", () => {
    const design = extractDesignFromCountry(buildRoot(), COUNTRY_ID, OPTS)!;
    expect(design.initializer).toBe("");
    expect(design.spawn_as_fallen).toBe(false);
    expect(design.ignore_portrait_duplication).toBe(false);
    expect(design.spawn_enabled).toBe(true);
  });
});

describe("extractDesignFromCountry — ethics fallback", () => {
  it("uses country.ethos.ethic when present", () => {
    const design = extractDesignFromCountry(buildRoot(), COUNTRY_ID, OPTS)!;
    expect(design.ethics).toEqual(["ethic_xenophile"]);
  });

  it("falls back to the caller-supplied ethics list when ethos is absent", () => {
    const root = buildRoot({ country: { ethos: undefined } });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.ethics).toEqual(["ethic_materialist"]);
  });
});

/**
 * Ethos shape varies by save version (measured, see readEthos' doc): older
 * saves write `ethos={ ethic="x" }` (singular, repeated), current saves write
 * `ethos={ ethics={ "x" } }` (plural list). Reading only the singular key
 * emptied ethics on EVERY current save.
 */
describe("extractDesignFromCountry — ethos key shape (singular vs plural)", () => {
  it("reads the PLURAL ethos.ethics list shape used by current saves", () => {
    const root = buildRoot({
      country: { ethos: { ethics: ["ethic_fanatic_militarist", "ethic_authoritarian"] } },
    });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.ethics).toEqual(["ethic_fanatic_militarist", "ethic_authoritarian"]);
  });

  it("reads a plural single-value ethos (parser collapses a 1-element list to a scalar)", () => {
    const root = buildRoot({ country: { ethos: { ethics: "ethic_pacifist" } } });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.ethics).toEqual(["ethic_pacifist"]);
  });

  it("merges and de-duplicates when a save carries BOTH keys", () => {
    const root = buildRoot({
      country: { ethos: { ethic: "ethic_xenophile", ethics: ["ethic_xenophile", "ethic_egalitarian"] } },
    });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.ethics).toEqual(["ethic_xenophile", "ethic_egalitarian"]);
  });

  it("readEthos returns [] for a missing/degenerate ethos block", () => {
    expect(readEthos(undefined)).toEqual([]);
    expect(readEthos({})).toEqual([]);
    expect(readEthos({ ethic: 7 })).toEqual([]);
  });
});

describe("extractDesignFromCountry — gestalt ethic guarantee", () => {
  for (const authority of ["auth_hive_mind", "auth_machine_intelligence"]) {
    it(`${authority} with an EMPTY ethos still emits ethic_gestalt_consciousness`, () => {
      const root = buildRoot({
        country: { government: { authority, type: "gov_hive_mind", civics: [], origin: "origin_default" }, ethos: {} },
      });
      const design = extractDesignFromCountry(root, COUNTRY_ID, { displayName: "Hive", ethics: [] })!;
      expect(design.ethics).toEqual(["ethic_gestalt_consciousness"]);
    });
  }

  it("a gestalt country never emits stray non-gestalt ethics leaked in by the pop-group fallback", () => {
    const root = buildRoot({
      country: {
        government: { authority: "auth_hive_mind", type: "gov_hive_mind", civics: [], origin: "origin_default" },
        ethos: undefined,
      },
    });
    const design = extractDesignFromCountry(root, COUNTRY_ID, {
      displayName: "Hive",
      ethics: ["ethic_fanatic_authoritarian", "ethic_militarist"],
    })!;
    expect(design.ethics).toEqual(["ethic_gestalt_consciousness"]);
  });

  it("a NON-gestalt authority never emits ethic_gestalt_consciousness", () => {
    const root = buildRoot({ country: { ethos: { ethics: ["ethic_gestalt_consciousness", "ethic_militarist"] } } });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.ethics).toEqual(["ethic_militarist"]);
  });
});

/**
 * `origin=""` and runtime-only origins (01_origins_non_playable.txt) are the
 * exact values the empire editor rejects as an invalid design.
 */
describe("extractDesignFromCountry — origin safety", () => {
  const gov = (origin: unknown, extra: Record<string, any> = {}) => ({
    government: { authority: "auth_hive_mind", type: "gov_hive_mind", civics: [], origin, ...extra },
  });

  it("passes a playable origin through untouched", () => {
    const design = extractDesignFromCountry(buildRoot(), COUNTRY_ID, OPTS)!;
    expect(design.origin).toBe("origin_prosperous_unification");
  });

  it("maps the runtime-only origin_default_pre_ftl to origin_default", () => {
    const root = buildRoot({ country: gov("origin_default_pre_ftl") });
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.origin).toBe("origin_default");
  });

  it("maps other non-playable origins to their playable analogue", () => {
    const cases: Array<[string, string]> = [
      ["origin_fallen_empire", "origin_default"],
      ["origin_fallen_empire_hive", "origin_default"],
      ["origin_enlightened", "origin_default"],
      ["origin_separatists", "origin_default"],
      ["origin_life_seeded_ai_only", "origin_life_seeded"],
      ["origin_common_ground_npc", "origin_common_ground"],
      ["origin_hegemon_npc", "origin_hegemon"],
      ["origin_imperial_vassal_overlord", "origin_imperial_vassal"],
    ];
    for (const [runtime, expected] of cases) {
      const design = extractDesignFromCountry(buildRoot({ country: gov(runtime) }), COUNTRY_ID, OPTS)!;
      expect(design.origin).toBe(expected);
    }
  });

  it("never emits an empty origin when the save's government block has none", () => {
    const design = extractDesignFromCountry(buildRoot({ country: gov(undefined) }), COUNTRY_ID, OPTS)!;
    expect(design.origin).not.toBe("");
    expect(design.origin).toBe("origin_default");
  });

  it("infers origin_wilderness from gov_wilderness when the country carries no usable origin", () => {
    const root = buildRoot({ country: gov(undefined, { type: "gov_wilderness" }) });
    expect(extractDesignFromCountry(root, COUNTRY_ID, OPTS)!.origin).toBe("origin_wilderness");
  });

  it("infers origin_wilderness from the species' trait_wilderness", () => {
    const root = buildRoot({
      country: gov(""),
      species: { traits: { trait: ["trait_organic", "trait_wilderness", "trait_rooted"] } },
    });
    expect(extractDesignFromCountry(root, COUNTRY_ID, OPTS)!.origin).toBe("origin_wilderness");
  });

  it("infers origin_wilderness from the wilderness_room country field", () => {
    const root = buildRoot({ country: { ...gov(undefined), room: "wilderness_room" } });
    expect(extractDesignFromCountry(root, COUNTRY_ID, OPTS)!.origin).toBe("origin_wilderness");
  });
});

/**
 * `root.galaxy.design` holds the ORIGINAL designer-authored empire designs
 * (64 blocks measured in sample.sav; absent from the user's current saves).
 * When one matches the country confidently it is used verbatim — it carries
 * the designer-selected origin/ethics rather than the mutated runtime values.
 */
describe("extractDesignFromCountry — galaxy.design preference", () => {
  /** A stored design block for the fixture's founder species, in the exact
   *  shape the save writes (species_name/species_plural/species_adjective +
   *  repeated `trait`, repeated `ethic`, tri-state spawn_enabled). */
  function storedDesign(overrides: Record<string, any> = {}) {
    return {
      key: "Test Empire",
      ship_prefix: { key: "" },
      species: {
        class: "HUM",
        portrait: "hum01",
        species_name: { key: "SPEC_Human" },
        species_plural: { key: "SPEC_Human_pl" },
        species_adjective: { key: "SPEC_Human_adj" },
        name_list: "HUM1",
        gender: "not_set",
        trait: ["trait_intelligent", "trait_thrifty"],
      },
      name: { key: "Original Name", literal: "yes" },
      adjective: { key: "Originalian", literal: "yes" },
      authority: "auth_democratic",
      government: "gov_democratic",
      is_nomadic: false,
      planet_name: { key: "Homeworld", literal: "yes" },
      planet_class: "pc_tropical",
      system_name: { key: "Home System", literal: "yes" },
      initializer: "",
      graphical_culture: "human_01",
      city_graphical_culture: "human_01",
      empire_flag: {
        icon: { category: "human", file: "flag_human_1.dds" },
        background: { category: "backgrounds", file: "circle.dds" },
        colors: ["blue", "white", "null", "null"],
      },
      ruler: {
        gender: "female",
        name: { full_names: { key: "HUM1_CHR_Origin" }, use_full_regnal_name: "yes" },
        portrait: "hum01",
        texture: 2,
        evolution_mask: 0,
        attachment: 0,
        clothes: 1,
        trait: "trait_ruler_charismatic",
        leader_class: "official",
      },
      spawn_as_fallen: false,
      ignore_portrait_duplication: false,
      room: "default_room",
      spawn_enabled: "always",
      ethic: ["ethic_fanatic_egalitarian", "ethic_xenophile"],
      civics: ["civic_beacon_of_liberty", "civic_idealistic_foundation"],
      origin: "origin_shattered_ring",
      ...overrides,
    };
  }

  function rootWithDesigns(designs: any, countryOverrides: Record<string, any> = {}) {
    return { ...buildRoot({ country: countryOverrides }), galaxy: { design: designs } };
  }

  it("uses the stored design verbatim when key AND species fingerprint agree", () => {
    const root = rootWithDesigns([storedDesign()]);
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    // Every one of these differs from what synthesis would have produced.
    expect(design.origin).toBe("origin_shattered_ring"); // runtime says origin_prosperous_unification
    expect(design.ethics).toEqual(["ethic_fanatic_egalitarian", "ethic_xenophile"]);
    expect(design.civics).toEqual(["civic_beacon_of_liberty", "civic_idealistic_foundation"]);
    expect(design.name).toEqual({ key: "Original Name", literal: true });
    expect(design.planet_class).toBe("pc_tropical");
    expect(design.planet_name).toEqual({ key: "Homeworld", literal: true });
    expect(design.ship_prefix).toEqual({ key: "" });
    expect(design.species.traits).toEqual(["trait_intelligent", "trait_thrifty"]);
    expect(design.ruler.texture).toBe(2);
    expect(design.ruler.name.use_full_regnal_name).toBe(true);
    expect(design.spawn_enabled).toBe(true); // "always" is not "no"
  });

  it("matches on a UNIQUE species fingerprint even when the country name is a %ADJECTIVE% template", () => {
    const root = rootWithDesigns([storedDesign({ key: "Prescripted Empire" })], { name: { key: "%ADJECTIVE%" } });
    const design = extractDesignFromCountry(root, COUNTRY_ID, { displayName: "%ADJECTIVE%", ethics: [] })!;
    expect(design.key).toBe("Prescripted Empire");
    expect(design.origin).toBe("origin_shattered_ring");
  });

  it("refuses an AMBIGUOUS match (two designs share the species fingerprint, neither key matches) and synthesizes instead", () => {
    const root = rootWithDesigns([storedDesign({ key: "Alpha" }), storedDesign({ key: "Beta" })], {
      name: { key: "%ADJECTIVE%" },
    });
    const design = extractDesignFromCountry(root, COUNTRY_ID, { displayName: "%ADJECTIVE%", ethics: [] })!;
    expect(design.key).toBe("%ADJECTIVE%");
    expect(design.origin).toBe("origin_prosperous_unification"); // synthesized from the runtime government
  });

  it("disambiguates two same-species designs by exact key match", () => {
    const root = rootWithDesigns([storedDesign({ key: "Other Empire", origin: "origin_remnants" }), storedDesign()]);
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.key).toBe("Test Empire");
    expect(design.origin).toBe("origin_shattered_ring");
  });

  it("refuses to match a design whose species disagrees, even on an exact key match", () => {
    const root = rootWithDesigns([storedDesign({ species: { ...storedDesign().species, portrait: "hum09" } })]);
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.origin).toBe("origin_prosperous_unification"); // synthesized
  });

  it("falls back to synthesis when the save carries no galaxy.design at all (current saves)", () => {
    const design = extractDesignFromCountry({ ...buildRoot(), galaxy: { template: "default" } }, COUNTRY_ID, OPTS)!;
    expect(design.origin).toBe("origin_prosperous_unification");
  });

  it("collapses a single stored design (parser gives a bare object, not a 1-element array)", () => {
    const design = extractDesignFromCountry(rootWithDesigns(storedDesign()), COUNTRY_ID, OPTS)!;
    expect(design.origin).toBe("origin_shattered_ring");
  });

  it("carries secondary_species through, which synthesis has no source for", () => {
    const root = rootWithDesigns([
      storedDesign({
        secondary_species: {
          class: "MAM",
          portrait: "mam01",
          species_name: { key: "SPEC_Servitor" },
          species_plural: { key: "SPEC_Servitor_pl" },
          species_adjective: { key: "SPEC_Servitor_adj" },
          name_list: "MAM1",
          gender: "not_set",
          trait: ["trait_docile"],
        },
      }),
    ]);
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.secondary_species?.class).toBe("MAM");
    expect(design.secondary_species?.traits).toEqual(["trait_docile"]);
  });

  it("still normalizes a stored gestalt design's ethics", () => {
    const root = rootWithDesigns([storedDesign({ authority: "auth_hive_mind", ethic: [] })]);
    const design = extractDesignFromCountry(root, COUNTRY_ID, OPTS)!;
    expect(design.ethics).toEqual(["ethic_gestalt_consciousness"]);
  });

  it("reads a stored design's ethics under either the ethic or ethics key", () => {
    const root = rootWithDesigns([storedDesign({ ethic: undefined, ethics: ["ethic_militarist"] })]);
    expect(extractDesignFromCountry(root, COUNTRY_ID, OPTS)!.ethics).toEqual(["ethic_militarist"]);
  });

  it("spawn_enabled=no is the only value mapping to false", () => {
    expect(
      extractDesignFromCountry(rootWithDesigns([storedDesign({ spawn_enabled: "no" })]), COUNTRY_ID, OPTS)!
        .spawn_enabled,
    ).toBe(false);
    expect(
      extractDesignFromCountry(rootWithDesigns([storedDesign({ spawn_enabled: "yes" })]), COUNTRY_ID, OPTS)!
        .spawn_enabled,
    ).toBe(true);
  });
});

describe("extractDesignFromCountry — degenerate input", () => {
  it("returns null rather than a half-built entry when the country has no government block", () => {
    const root = buildRoot({ country: { government: undefined } });
    expect(extractDesignFromCountry(root, COUNTRY_ID, OPTS)).toBeNull();
  });

  it("returns null when the founder species cannot be resolved", () => {
    const root = buildRoot({ species: null });
    expect(extractDesignFromCountry(root, COUNTRY_ID, OPTS)).toBeNull();
  });
});
