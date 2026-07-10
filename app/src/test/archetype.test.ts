import { describe, it, expect } from "vitest";
import type { GateNode } from "../lib/empire/gates";
import { isTechAccessibleUnderArchetype, hasActiveArchetypeFilter } from "../lib/empire/archetype";

/**
 * Empire-archetype filter (manual toggle bar, no save required). Gates here
 * are written as the pipeline emits them (real shapes from the corpus:
 * is_nomadic on tech_arkship_construction, country_uses_bio_ships on the
 * battleship hull line, is_wilderness_empire / is_beastmasters_empire, and
 * is_machine_empire).
 */

const G = {
  nomadOnly: { op: "leaf", trigger: "is_nomadic", value: true, static: true } as GateNode,
  landedOnly: { op: "leaf", trigger: "is_nomadic", value: false, static: true } as GateNode,
  bioshipOnly: { op: "leaf", trigger: "country_uses_bio_ships", value: true, static: true } as GateNode,
  alloyOnly: { op: "leaf", trigger: "country_uses_bio_ships", value: false, static: true } as GateNode,
  machineOnly: { op: "leaf", trigger: "is_machine_empire", value: true, static: true } as GateNode,
  wilderness: { op: "leaf", trigger: "is_wilderness_empire", value: true, static: true } as GateNode,
  beastmasters: { op: "leaf", trigger: "is_beastmasters_empire", value: true, static: true } as GateNode,
  faunaEither: {
    op: "or",
    children: [
      { op: "leaf", trigger: "is_wilderness_empire", value: true, static: true },
      { op: "leaf", trigger: "is_beastmasters_empire", value: true, static: true },
    ],
  } as GateNode,
  unrelated: { op: "leaf", trigger: "has_origin", value: "origin_shattered_ring", static: true } as GateNode,
  nomadAndBioship: {
    op: "and",
    children: [
      { op: "leaf", trigger: "is_nomadic", value: true, static: true },
      { op: "leaf", trigger: "country_uses_bio_ships", value: true, static: true },
    ],
  } as GateNode,
};

describe("hasActiveArchetypeFilter", () => {
  it("is false when no filters are set", () => {
    expect(hasActiveArchetypeFilter({})).toBe(false);
  });
  it("is true when any single filter is set (including explicit false)", () => {
    expect(hasActiveArchetypeFilter({ nomadic: false })).toBe(true);
    expect(hasActiveArchetypeFilter({ fauna: true })).toBe(true);
  });
});

describe("isTechAccessibleUnderArchetype", () => {
  it("is always accessible with no gate", () => {
    expect(isTechAccessibleUnderArchetype(null, { nomadic: false })).toBe(true);
  });

  it("is always accessible with no filters set, regardless of the gate", () => {
    expect(isTechAccessibleUnderArchetype(G.nomadOnly, {})).toBe(true);
  });

  it("greys a Nomad-only tech when Landed is selected", () => {
    expect(isTechAccessibleUnderArchetype(G.nomadOnly, { nomadic: false })).toBe(false);
  });
  it("keeps a Nomad-only tech accessible when Nomad is selected", () => {
    expect(isTechAccessibleUnderArchetype(G.nomadOnly, { nomadic: true })).toBe(true);
  });
  it("greys a Landed-only tech when Nomad is selected", () => {
    expect(isTechAccessibleUnderArchetype(G.landedOnly, { nomadic: true })).toBe(false);
  });

  it("greys an Alloy-only tech when Bioship is selected, and vice versa", () => {
    expect(isTechAccessibleUnderArchetype(G.alloyOnly, { bioShips: true })).toBe(false);
    expect(isTechAccessibleUnderArchetype(G.bioshipOnly, { bioShips: false })).toBe(false);
    expect(isTechAccessibleUnderArchetype(G.bioshipOnly, { bioShips: true })).toBe(true);
  });

  it("greys a Machine-only tech when Biological is selected", () => {
    expect(isTechAccessibleUnderArchetype(G.machineOnly, { machine: false })).toBe(false);
    expect(isTechAccessibleUnderArchetype(G.machineOnly, { machine: true })).toBe(true);
  });

  it("maps BOTH is_wilderness_empire and is_beastmasters_empire to the Fauna filter", () => {
    expect(isTechAccessibleUnderArchetype(G.wilderness, { fauna: true })).toBe(true);
    expect(isTechAccessibleUnderArchetype(G.beastmasters, { fauna: true })).toBe(true);
    expect(isTechAccessibleUnderArchetype(G.wilderness, { fauna: false })).toBe(false);
  });

  it("an OR of wilderness/beastmasters stays accessible under Fauna (either satisfies it)", () => {
    expect(isTechAccessibleUnderArchetype(G.faunaEither, { fauna: true })).toBe(true);
    expect(isTechAccessibleUnderArchetype(G.faunaEither, { fauna: false })).toBe(false);
  });

  it("leaves triggers outside the 4 known concepts as free (never greyed by this filter)", () => {
    expect(isTechAccessibleUnderArchetype(G.unrelated, { nomadic: false, machine: true, bioShips: true, fauna: true })).toBe(
      true,
    );
  });

  it("an AND of two constraints greys out only when BOTH fixed flags conflict with it", () => {
    // Requires nomadic AND bioship; selecting only Landed already makes it unsatisfiable.
    expect(isTechAccessibleUnderArchetype(G.nomadAndBioship, { nomadic: false })).toBe(false);
    // Selecting Nomad+Bioship together satisfies it.
    expect(isTechAccessibleUnderArchetype(G.nomadAndBioship, { nomadic: true, bioShips: true })).toBe(true);
    // Selecting Nomad but leaving bioShips unconstrained still leaves it satisfiable.
    expect(isTechAccessibleUnderArchetype(G.nomadAndBioship, { nomadic: true })).toBe(true);
  });

  it("a partial filter set (only one of several concepts) only constrains that axis", () => {
    // Only Bioship set; a Nomad-only tech is untouched by this filter.
    expect(isTechAccessibleUnderArchetype(G.nomadOnly, { bioShips: true })).toBe(true);
  });
});
