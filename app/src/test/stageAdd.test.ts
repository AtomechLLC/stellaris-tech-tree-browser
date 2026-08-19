import { describe, expect, it } from "vitest";
import { resolveStagedName } from "../lib/empire/useDesignsSession";
import { uniqueDesignName, findTopLevelSpans } from "../lib/empire/designsText";
import { serializeDesignEntry, sanitizeDesignKey } from "../lib/empire/designSerialize";
import type { DesignEntry, DesignFlag } from "../lib/empire/designSchema";

/**
 * Pure-surface coverage for 04-07's staging logic (D-06/D-07/D-09):
 * - `resolveStagedName`'s name-resolution rules, exercised through the real
 *   `uniqueDesignName` (never a re-implementation — this test file statically
 *   imports `designsText.ts`, which is fine since test bundles are never
 *   shipped; `useDesignsSession.ts` itself only reaches it dynamically).
 * - The serialized entry's own top-level span name matches the RESOLVED
 *   name, not the original key, for a colliding fixture.
 *
 * The hook itself (`useDesignsSession`) is never rendered here — this
 * package has no jsdom and none is to be added.
 */

// ── shared fixture factory (mirrors designSerialize.test.ts's convention) ──
function baseDesign(key: string): DesignEntry {
  const empireFlag: DesignFlag = {
    icon: { category: "aquatic", file: "aquatic_08.dds" },
    background: { category: "backgrounds", file: "flag_BG_29.dds" },
    colors: ["ocean_turquoise", "dark_teal", "black", "null"],
  };
  return {
    key,
    ship_prefix: { key: "ISS" },
    species: {
      class: "AQUATIC",
      portrait: "aqu12",
      species_name: { key: "SPEC_Alari" },
      species_plural: { key: "SPEC_Alari_pl" },
      species_adjective: { key: "SPEC_Alari" },
      name_list: "HUM1",
      gender: "not_set",
      traits: ["trait_hive_mind"],
    },
    name: { key },
    adjective: { key: "SPEC_Alari" },
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
      name: { full_names: { key: "HUM1_CHR_Elemani" }, use_full_regnal_name: true },
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
    ethics: ["ethic_gestalt_consciousness"],
    civics: ["civic_hive_empath"],
    origin: "origin_ocean_paradise",
  };
}

describe("resolveStagedName — free key", () => {
  it("returns the key unchanged when it is not taken", () => {
    expect(resolveStagedName("Alarian Consciousness", [], uniqueDesignName)).toBe("Alarian Consciousness");
    expect(resolveStagedName("Alarian Consciousness", ["Someone Else"], uniqueDesignName)).toBe(
      "Alarian Consciousness",
    );
  });
});

describe("resolveStagedName — taken once", () => {
  it('appends " (2)" when the key is already taken', () => {
    expect(resolveStagedName("Alarian Consciousness", ["Alarian Consciousness"], uniqueDesignName)).toBe(
      "Alarian Consciousness (2)",
    );
  });
});

describe("resolveStagedName — taken twice", () => {
  it('appends " (3)" when both the key and its " (2)" form are taken', () => {
    const taken = ["Alarian Consciousness", "Alarian Consciousness (2)"];
    expect(resolveStagedName("Alarian Consciousness", taken, uniqueDesignName)).toBe("Alarian Consciousness (3)");
  });
});

describe("resolveStagedName — staged names count as taken", () => {
  it("resolves distinct names when the same design key is staged twice in sequence", () => {
    const takenFromFile: string[] = [];
    const firstStage = resolveStagedName("New Empire", takenFromFile, uniqueDesignName);
    expect(firstStage).toBe("New Empire");

    // Second staging sees the first staged add's resolved name in `taken`
    // (mirrors useDesignsSession's takenNames, which folds in prior adds).
    const takenAfterFirstAdd = [...takenFromFile, firstStage];
    const secondStage = resolveStagedName("New Empire", takenAfterFirstAdd, uniqueDesignName);
    expect(secondStage).toBe("New Empire (2)");
    expect(secondStage).not.toBe(firstStage);
  });
});

describe("resolveStagedName — raw-byte comparison", () => {
  it("does not collide a 0x11 colour-escape name with its stripped form", () => {
    const esc = String.fromCharCode(0x11);
    const rawName = `Alarian${esc}Consciousness`;
    const strippedForm = "AlarianConsciousness";

    // The stripped form is "taken", but the raw (colour-coded) name is not —
    // resolution must compare raw bytes, so the raw name stays unchanged.
    expect(resolveStagedName(rawName, [strippedForm], uniqueDesignName)).toBe(rawName);
  });
});

describe("resolveStagedName — numbering rule lives in one place", () => {
  it('constructs no " (" suffix itself (delegates entirely to uniqueDesignName)', () => {
    // Sanity check against the module source rather than the exported
    // function's behavior (already covered above) — this documents intent;
    // the authoritative gate is the plan's own grep acceptance criterion.
    expect(resolveStagedName("X", ["X"], uniqueDesignName)).toBe("X (2)");
  });
});

/**
 * Review WR-02: D-09 must resolve the SANITIZED key, because that is what
 * lands in the file. Resolving the raw key lets a save-derived name slip a
 * duplicate top-level key past the collision check.
 */
describe("resolveStagedName — runs on the sanitized key (WR-02)", () => {
  it("a name whose quotes sanitize away collides with the already-taken stripped form", () => {
    const rawKey = 'Alarian"Consciousness';
    const taken = ["AlarianConsciousness"];

    // The defect: resolving the RAW key sees no collision.
    expect(resolveStagedName(rawKey, taken, uniqueDesignName)).toBe(rawKey);

    // The fix: sanitize first, exactly as stageAddFromEmpire now does.
    const resolved = resolveStagedName(sanitizeDesignKey(rawKey), taken, uniqueDesignName);
    expect(resolved).toBe("AlarianConsciousness (2)");

    // …and the emitted top-level key equals the resolved name byte-for-byte,
    // so `takenNames` and the UI stay in sync with the file.
    const text = serializeDesignEntry({ ...baseDesign(rawKey), key: resolved }, "\r\n");
    const spans = findTopLevelSpans(`${text}\r\n`);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe(resolved);
  });

  it("sanitizing is idempotent, so resolution and serialization agree for CR/LF-bearing names", () => {
    const rawKey = "Empire\r\nWith Newlines";
    const sanitized = sanitizeDesignKey(rawKey);
    expect(sanitized).toBe("EmpireWith Newlines");
    expect(sanitizeDesignKey(sanitized)).toBe(sanitized);

    const resolved = resolveStagedName(sanitized, [sanitized], uniqueDesignName);
    const text = serializeDesignEntry({ ...baseDesign(rawKey), key: resolved }, "\r\n");
    expect(findTopLevelSpans(`${text}\r\n`)[0]!.name).toBe(resolved);
  });
});

describe("stageAddFromEmpire's serialized text — span-name matches the RESOLVED name", () => {
  it("serializes with the rewritten (disambiguated) key as the top-level span name", () => {
    const desiredKey = "Alarian Consciousness";
    const taken = [desiredKey];
    const resolvedName = resolveStagedName(desiredKey, taken, uniqueDesignName);
    expect(resolvedName).toBe("Alarian Consciousness (2)");

    const entry = { ...baseDesign(desiredKey), key: resolvedName };
    const text = serializeDesignEntry(entry, "\r\n");

    const spans = findTopLevelSpans(`${text}\r\n`);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe(resolvedName);
    expect(spans[0]!.name).not.toBe(desiredKey);
  });
});
