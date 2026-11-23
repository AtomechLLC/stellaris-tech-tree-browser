import { describe, expect, it } from "vitest";
import { humanizeId } from "../lib/empire/labels";
import { readFactionsByCountry } from "../lib/empire/savLoad";
import { normalizeEthics } from "../lib/empire/designFromSav";
import { serializeDesignEntry } from "../lib/empire/designSerialize";
import type { DesignEntry, DesignFlag } from "../lib/empire/designSchema";

/**
 * v4.6.0 empire-side coverage: absolute ethics are ordinary ethic ids (labels,
 * Empire Manager normalize/serialize keep a lone absolute ethic unchanged) and
 * pop_factions are read per country for the Saved Empire Factions row.
 */

function fixtureDesign(ethics: string[]): DesignEntry {
  const adjective = { key: "%ADJECTIVE%", variables: [{ key: "adjective", value: { key: "SPEC_Test" } }] };
  const empireFlag: DesignFlag = {
    icon: { category: "aquatic", file: "aquatic_08.dds" },
    background: { category: "backgrounds", file: "flag_BG_29.dds" },
    colors: ["ocean_turquoise", "dark_teal", "black", "null"],
  };
  return {
    key: "Absolute Test",
    ship_prefix: { key: "ISS" },
    species: {
      class: "HUMANOID",
      portrait: "hum1",
      species_name: { key: "SPEC_Test" },
      species_plural: { key: "SPEC_Test_pl" },
      species_adjective: adjective,
      name_list: "HUM1",
      gender: "not_set",
      traits: ["trait_adaptive"],
    },
    name: { key: "%ADJECTIVE%", variables: [{ key: "adjective", value: { key: "SPEC_Test" } }] },
    adjective,
    authority: "auth_democratic",
    government: "gov_representative_democracy",
    is_nomadic: false,
    planet_name: { key: "SPEC_Test_planet" },
    planet_class: "pc_continental",
    system_name: { key: "SPEC_Test_system" },
    initializer: "init_test",
    graphical_culture: "humanoid_01",
    city_graphical_culture: "humanoid_01",
    empire_flag: empireFlag,
    ruler: {
      gender: "female",
      name: { full_names: { key: "HUM1_CHR_Test" }, use_full_regnal_name: true },
      portrait: "hum1",
      texture: 2,
      evolution_mask: 0,
      attachment: 0,
      clothes: 0,
      trait: "leader_trait_spark_of_genius",
      leader_class: "scientist",
    },
    spawn_as_fallen: false,
    ignore_portrait_duplication: false,
    room: "humanoid_room",
    spawn_enabled: true,
    ethics,
    civics: ["civic_parliamentary_system", "civic_idealistic_foundation"],
    origin: "origin_default",
  };
}

describe("humanizeId", () => {
  it("labels absolute, fanatic and prefixed ids", () => {
    expect(humanizeId("ethic_absolute_militarist")).toBe("Absolute Militarist");
    expect(humanizeId("ethic_fanatic_militarist")).toBe("Fanatic Militarist");
    expect(humanizeId("auth_democratic")).toBe("Democratic");
    expect(humanizeId("the_masquerade_xenophile")).toBe("The Masquerade Xenophile");
  });
});

describe("readFactionsByCountry", () => {
  it("groups sorted unique faction types by country id, skipping non-object entries", () => {
    const map = readFactionsByCountry({
      pop_factions: {
        "0": "none",
        "16777217": { country: 5, type: "totalitarian" },
        "16777218": { country: 5, type: "xenoist" },
        "16777219": { country: 7, type: "totalitarian" },
      },
    });
    expect(map.get(5)).toEqual(["totalitarian", "xenoist"]);
    expect(map.get(7)).toEqual(["totalitarian"]);
    expect(map.size).toBe(2);
  });

  it("returns an empty map when pop_factions is missing", () => {
    expect(readFactionsByCountry({}).size).toBe(0);
  });
});

describe("Empire Manager keeps a lone absolute ethic", () => {
  it("normalizeEthics passes a single absolute ethic through for a non-gestalt authority", () => {
    expect(normalizeEthics("auth_democratic", ["ethic_absolute_militarist"])).toEqual(["ethic_absolute_militarist"]);
  });

  it("normalizeEthics keeps the existing gestalt rule", () => {
    expect(normalizeEthics("auth_hive_mind", ["ethic_absolute_militarist"])).toEqual(["ethic_gestalt_consciousness"]);
  });

  it("serializeDesignEntry emits exactly one ethic line for a lone absolute ethic", () => {
    const text = serializeDesignEntry(fixtureDesign(["ethic_absolute_militarist"]), "\n");
    const ethicLines = text.split("\n").filter((l) => /^\s*ethic\s*=/.test(l));
    expect(ethicLines).toHaveLength(1);
    expect(ethicLines[0]).toContain('ethic="ethic_absolute_militarist"');
  });
});
