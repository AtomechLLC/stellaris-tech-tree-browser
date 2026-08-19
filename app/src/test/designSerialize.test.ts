import { beforeAll, describe, expect, it } from "vitest";
import { Jomini } from "jomini";
import { serializeDesignEntry } from "../lib/empire/designSerialize";
import { findTopLevelSpans } from "../lib/empire/designsText";
import type { DesignEntry, DesignFlag } from "../lib/empire/designSchema";

/**
 * Serializer verification (D-07/D-08 correctness):
 * - Golden text: exact byte-for-byte output for a fixture modelled on the
 *   real "Alarian Consciousness" entry (04-RESEARCH.md Code Examples).
 * - jomini round-trip: the serialized text parses back to the expected
 *   shapes (repeated-key ethic array, species.trait array, ruler.texture
 *   number, a truthy `literal` field).
 * - Span-scanner compatibility: `findTopLevelSpans` sees exactly one entry,
 *   including for an adversarial (double-quote) entry name.
 * - Colour padding/truncation and 0x11 colour-escape byte preservation.
 *
 * All fixtures are inline literals (matches `empire-classify.test.ts`
 * convention) — the user's real 400KB designs file is never read here.
 */

let parser: Jomini;

beforeAll(async () => {
  parser = await Jomini.initialize();
});

// ── shared fixture factory ─────────────────────────────────────────────────
// Modelled on the real "Alarian Consciousness" entry (04-RESEARCH.md Code
// Examples, lines 587-698): AQUATIC species with six traits, a
// `%ADJECTIVE%` variable-template adjective/name, hive-mind authority and
// government, a full ruler block, and a flag with four colours (real entries
// sometimes carry fewer than six, which the serializer pads). A second ethic
// is added (the real entry only has one) specifically to exercise the
// repeated-key `ethic=` shape.
function baseDesign(): DesignEntry {
  const adjective = {
    key: "%ADJECTIVE%",
    variables: [{ key: "adjective", value: { key: "SPEC_Alari" } }],
  };
  const empireFlag: DesignFlag = {
    icon: { category: "aquatic", file: "aquatic_08.dds" },
    background: { category: "backgrounds", file: "flag_BG_29.dds" },
    colors: ["ocean_turquoise", "dark_teal", "black", "null"],
  };
  return {
    key: "Alarian Consciousness",
    ship_prefix: { key: "ISS" },
    species: {
      class: "AQUATIC",
      portrait: "aqu12",
      species_name: { key: "SPEC_Alari" },
      species_plural: { key: "SPEC_Alari_pl" },
      species_adjective: adjective,
      name_list: "HUM1",
      gender: "not_set",
      traits: [
        "trait_hive_mind",
        "trait_aquatic",
        "trait_rapid_breeders",
        "trait_quarrelsome",
        "trait_weak",
        "trait_organic",
      ],
    },
    name: {
      key: "%ADJECTIVE%",
      variables: [
        { key: "adjective", value: { key: "SPEC_Alari" } },
        { key: "1", value: { key: "Consciousness" } },
      ],
    },
    adjective,
    authority: "auth_hive_mind",
    government: "gov_hive_mind",
    is_nomadic: false,
    planet_name: { key: "SPEC_Hesukar_planet" },
    planet_class: "pc_continental",
    system_name: { key: "SPEC_Hesukar_system" },
    initializer: "ocean_paradise_start",
    graphical_culture: "aquatic_01",
    city_graphical_culture: "aquatic_01",
    empire_flag: empireFlag,
    ruler: {
      gender: "female",
      name: {
        full_names: { key: "HUM1_CHR_Elemani" },
        use_full_regnal_name: true,
      },
      portrait: "aqu12",
      texture: 2,
      evolution_mask: 0,
      attachment: 0,
      clothes: 0,
      trait: "leader_trait_spark_of_genius",
      leader_class: "scientist",
    },
    spawn_as_fallen: false,
    ignore_portrait_duplication: false,
    room: "necroids_room",
    spawn_enabled: true,
    ethics: ["ethic_gestalt_consciousness", "ethic_xenophile"],
    civics: ["civic_hive_empath", "civic_hive_natural_neural_network"],
    origin: "origin_ocean_paradise",
  };
}

describe("serializeDesignEntry — golden text", () => {
  it("serializes the fixture to the exact tab-indented, CRLF, game-native text", () => {
    const entry = baseDesign();
    const serialized = serializeDesignEntry(entry);

    // Explicit \t / \r\n escapes throughout (never invisible literal tabs)
    // so a diff of a failing assertion is legible.
    const expected = [
      `"Alarian Consciousness"=`,
      `{`,
      `\tkey="Alarian Consciousness"`,
      `\tship_prefix=`,
      `\t{`,
      `\t\tkey="ISS"`,
      `\t}`,
      `\tspecies=`,
      `\t{`,
      `\t\tclass="AQUATIC"`,
      `\t\tportrait="aqu12"`,
      `\t\tspecies_name=`,
      `\t\t{`,
      `\t\t\tkey="SPEC_Alari"`,
      `\t\t}`,
      `\t\tspecies_plural=`,
      `\t\t{`,
      `\t\t\tkey="SPEC_Alari_pl"`,
      `\t\t}`,
      `\t\tspecies_adjective=`,
      `\t\t{`,
      `\t\t\tkey="%ADJECTIVE%"`,
      `\t\t\tvariables=`,
      `\t\t\t{`,
      `\t\t\t\t`,
      `\t\t\t\t{`,
      `\t\t\t\t\tkey="adjective"`,
      `\t\t\t\t\tvalue=`,
      `\t\t\t\t\t{`,
      `\t\t\t\t\t\tkey="SPEC_Alari"`,
      `\t\t\t\t\t}`,
      `\t\t\t\t}`,
      ` `,
      `\t\t\t}`,
      `\t\t}`,
      `\t\tname_list="HUM1"`,
      `\t\tgender=not_set`,
      `\t\ttrait="trait_hive_mind"`,
      `\t\ttrait="trait_aquatic"`,
      `\t\ttrait="trait_rapid_breeders"`,
      `\t\ttrait="trait_quarrelsome"`,
      `\t\ttrait="trait_weak"`,
      `\t\ttrait="trait_organic"`,
      `\t}`,
      `\tname=`,
      `\t{`,
      `\t\tkey="%ADJECTIVE%"`,
      `\t\tvariables=`,
      `\t\t{`,
      `\t\t\t`,
      `\t\t\t{`,
      `\t\t\t\tkey="adjective"`,
      `\t\t\t\tvalue=`,
      `\t\t\t\t{`,
      `\t\t\t\t\tkey="SPEC_Alari"`,
      `\t\t\t\t}`,
      `\t\t\t}`,
      ` `,
      `\t\t\t{`,
      `\t\t\t\tkey="1"`,
      `\t\t\t\tvalue=`,
      `\t\t\t\t{`,
      `\t\t\t\t\tkey="Consciousness"`,
      `\t\t\t\t}`,
      `\t\t\t}`,
      ` `,
      `\t\t}`,
      `\t}`,
      `\tadjective=`,
      `\t{`,
      `\t\tkey="%ADJECTIVE%"`,
      `\t\tvariables=`,
      `\t\t{`,
      `\t\t\t`,
      `\t\t\t{`,
      `\t\t\t\tkey="adjective"`,
      `\t\t\t\tvalue=`,
      `\t\t\t\t{`,
      `\t\t\t\t\tkey="SPEC_Alari"`,
      `\t\t\t\t}`,
      `\t\t\t}`,
      ` `,
      `\t\t}`,
      `\t}`,
      `\tauthority="auth_hive_mind"`,
      `\tgovernment="gov_hive_mind"`,
      `\tis_nomadic=no`,
      `\tplanet_name=`,
      `\t{`,
      `\t\tkey="SPEC_Hesukar_planet"`,
      `\t}`,
      `\tplanet_class="pc_continental"`,
      `\tsystem_name=`,
      `\t{`,
      `\t\tkey="SPEC_Hesukar_system"`,
      `\t}`,
      `\tinitializer="ocean_paradise_start"`,
      `\tgraphical_culture="aquatic_01"`,
      `\tcity_graphical_culture="aquatic_01"`,
      `\tempire_flag=`,
      `\t{`,
      `\t\ticon=`,
      `\t\t{`,
      `\t\t\tcategory="aquatic"`,
      `\t\t\tfile="aquatic_08.dds"`,
      `\t\t}`,
      `\t\tbackground=`,
      `\t\t{`,
      `\t\t\tcategory="backgrounds"`,
      `\t\t\tfile="flag_BG_29.dds"`,
      `\t\t}`,
      `\t\tcolors=`,
      `\t\t{`,
      `\t\t\t"ocean_turquoise"`,
      `\t\t\t"dark_teal"`,
      `\t\t\t"black"`,
      `\t\t\t"null"`,
      `\t\t\t"null"`,
      `\t\t\t"null"`,
      `\t\t}`,
      `\t}`,
      `\truler=`,
      `\t{`,
      `\t\tgender=female`,
      `\t\tname=`,
      `\t\t{`,
      `\t\t\tfull_names=`,
      `\t\t\t{`,
      `\t\t\t\tkey="HUM1_CHR_Elemani"`,
      `\t\t\t}`,
      `\t\t\tuse_full_regnal_name=yes`,
      `\t\t}`,
      `\t\tportrait="aqu12"`,
      `\t\ttexture=2`,
      `\t\tevolution_mask=0`,
      `\t\tattachment=0`,
      `\t\tclothes=0`,
      `\t\ttrait="leader_trait_spark_of_genius"`,
      `\t\tleader_class="scientist"`,
      `\t}`,
      `\tspawn_as_fallen=no`,
      `\tignore_portrait_duplication=no`,
      `\troom="necroids_room"`,
      `\tspawn_enabled=yes`,
      `\tethic="ethic_gestalt_consciousness"`,
      `\tethic="ethic_xenophile"`,
      `\tcivics=`,
      `\t{`,
      `\t\t"civic_hive_empath"`,
      `\t\t"civic_hive_natural_neural_network"`,
      `\t}`,
      `\torigin="origin_ocean_paradise"`,
      `}`,
    ].join("\r\n");

    expect(serialized).toBe(expected);
  });
});

describe("serializeDesignEntry — parser round-trip", () => {
  it("round-trips to the expected repeated-key ethic array, trait array, ruler.texture number, and a truthy literal field", () => {
    const entry: DesignEntry = { ...baseDesign(), planet_name: { key: "Custom Planet", literal: true } };
    const serialized = serializeDesignEntry(entry);

    const parsed = parser.parseText(serialized, { encoding: "utf8" }) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([entry.key]);

    const val = parsed[entry.key] as Record<string, unknown>;
    expect(Array.isArray(val.ethic)).toBe(true);
    expect(val.ethic).toHaveLength(2);
    expect(Array.isArray(val.civics)).toBe(true);
    const species = val.species as Record<string, unknown>;
    expect(Array.isArray(species.trait)).toBe(true);
    expect(species.trait).toHaveLength(6);
    const ruler = val.ruler as Record<string, unknown>;
    expect(ruler.texture).toBe(2);
    const planetName = val.planet_name as Record<string, unknown>;
    expect(planetName.literal).toBeTruthy();
  });
});

describe("serializeDesignEntry — span-scanner compatibility", () => {
  it("produces exactly one span, with the correct name and end offset", () => {
    const entry = baseDesign();
    const serialized = serializeDesignEntry(entry);

    const spans = findTopLevelSpans(`${serialized}\r\n`);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe(entry.key);
    expect(spans[0]!.end).toBe(serialized.length);
  });
});

describe("serializeDesignEntry — injection guard", () => {
  it("sanitizes a double-quote in the entry key so exactly one span and one parsed key result", () => {
    const entry: DesignEntry = { ...baseDesign(), key: 'Injected"} "Fake Entry"={ key=' };
    const serialized = serializeDesignEntry(entry);

    const spans = findTopLevelSpans(`${serialized}\r\n`);
    expect(spans).toHaveLength(1);

    const parsed = parser.parseText(serialized, { encoding: "utf8" }) as Record<string, unknown>;
    expect(Object.keys(parsed)).toHaveLength(1);
  });

  /**
   * Review CR-01: `gender` is emitted UNQUOTED, and both values are copied
   * verbatim out of an untrusted uploaded `.sav` (a quoted save string may
   * legally contain CR/LF, braces and `=`). Without a bare-token guard a
   * crafted save splices whole fake top-level entries into the user's real
   * designs file.
   */
  const GENDER_PAYLOAD = 'male\r\n}\r\n"Fake Entry"=\r\n{\r\n\tkey="pwned"\r\n}\r\n"x"={\ty=';

  it("sanitizes an injected species.gender so exactly one span and one parsed key result", () => {
    const entry: DesignEntry = { ...baseDesign(), species: { ...baseDesign().species, gender: GENDER_PAYLOAD } };
    const serialized = serializeDesignEntry(entry);

    // Everything structural is stripped; only identifier characters survive,
    // collapsed into a single harmless bare token on one line.
    expect(serialized).toContain("\t\tgender=maleFakeEntrykeypwnedxy\r\n");
    expect(serialized).not.toContain('"Fake Entry"');
    expect(findTopLevelSpans(`${serialized}\r\n`)).toHaveLength(1);
    expect(Object.keys(parser.parseText(serialized, { encoding: "utf8" }) as Record<string, unknown>)).toHaveLength(1);
  });

  it("sanitizes an injected ruler.gender so exactly one span and one parsed key result", () => {
    const entry: DesignEntry = { ...baseDesign(), ruler: { ...baseDesign().ruler, gender: GENDER_PAYLOAD } };
    const serialized = serializeDesignEntry(entry);

    expect(serialized).not.toContain('"Fake Entry"');
    expect(findTopLevelSpans(`${serialized}\r\n`)).toHaveLength(1);
    expect(Object.keys(parser.parseText(serialized, { encoding: "utf8" }) as Record<string, unknown>)).toHaveLength(1);
  });

  it("a gender that sanitizes away entirely falls back to not_set rather than emitting `gender=`", () => {
    const entry: DesignEntry = { ...baseDesign(), species: { ...baseDesign().species, gender: '"" {}=' } };
    const serialized = serializeDesignEntry(entry);
    expect(serialized).toContain("\t\tgender=not_set\r\n");
    expect(Object.keys(parser.parseText(serialized, { encoding: "utf8" }) as Record<string, unknown>)).toHaveLength(1);
  });

  it("keeps a legitimate (including mod-added) identifier gender intact", () => {
    const entry: DesignEntry = { ...baseDesign(), species: { ...baseDesign().species, gender: "indeterminable" } };
    expect(serializeDesignEntry(entry)).toContain("\t\tgender=indeterminable\r\n");
  });

  it("never emits a non-finite bare numeric for the ruler's sliders", () => {
    const entry: DesignEntry = {
      ...baseDesign(),
      ruler: { ...baseDesign().ruler, texture: NaN, clothes: Infinity, attachment: -Infinity },
    };
    const serialized = serializeDesignEntry(entry);
    expect(serialized).not.toMatch(/NaN|Infinity/);
    expect(serialized).toContain("\t\ttexture=0\r\n");
    expect(Object.keys(parser.parseText(serialized, { encoding: "utf8" }) as Record<string, unknown>)).toHaveLength(1);
  });
});

describe("serializeDesignEntry — colour padding and truncation", () => {
  it("pads a 4-colour flag to six quoted values (last two literal null) and truncates an 8-colour flag to six", () => {
    const fourColors = serializeDesignEntry({
      ...baseDesign(),
      empire_flag: { ...baseDesign().empire_flag, colors: ["a", "b", "c", "d"] },
    });
    expect(fourColors).toContain(
      '\t\t\t"a"\r\n\t\t\t"b"\r\n\t\t\t"c"\r\n\t\t\t"d"\r\n\t\t\t"null"\r\n\t\t\t"null"\r\n\t\t}',
    );

    const eightColors = serializeDesignEntry({
      ...baseDesign(),
      empire_flag: { ...baseDesign().empire_flag, colors: ["a", "b", "c", "d", "e", "f", "g", "h"] },
    });
    expect(eightColors).toContain(
      '\t\t\t"a"\r\n\t\t\t"b"\r\n\t\t\t"c"\r\n\t\t\t"d"\r\n\t\t\t"e"\r\n\t\t\t"f"\r\n\t\t}',
    );
    expect(eightColors).not.toContain('"g"');
    expect(eightColors).not.toContain('"h"');
  });
});

describe("serializeDesignEntry — colour-escape preservation", () => {
  it("preserves a raw 0x11 Paradox colour-escape byte in the entry key through serialization", () => {
    const esc = String.fromCharCode(0x11);
    const entry: DesignEntry = { ...baseDesign(), key: `Alarian${esc}Consciousness` };
    const serialized = serializeDesignEntry(entry);

    expect(serialized).toContain(`"Alarian${esc}Consciousness"`);
  });
});
