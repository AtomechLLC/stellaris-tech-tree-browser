import { describe, it, expect } from "vitest";
import { extractDesignFromCountry } from "../lib/empire/designFromSav";

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
