import { describe, expect, it } from "vitest";
import { effectiveWeight, computeDrawEstimates } from "../lib/empire/draw";
import { buildEmpireState } from "../lib/empire/gates";
import type { Tech } from "../types/tech-snapshot";
import type { Bucket } from "../lib/empire/classify";

/**
 * Draw-chance estimation: effective weight (base × modifiers whose conditions
 * the empire satisfies) and pool share over the area's available techs.
 * Unknown conditions (e.g. starbase counts) skip their modifier and mark the
 * estimate approximate.
 */

function tech(key: string, weight: number, weightModifierRaw?: unknown, area = "physics"): Tech {
  return {
    key,
    area: area as Tech["area"],
    category: ["computing"],
    tier: 1,
    cost: 100,
    weight,
    prerequisites: [],
    unlocks: { grants: [], leadsTo: [] },
    dlc: null,
    flags: { isRare: false, isDangerous: false, isRepeatable: false, isStarting: false, isInsight: false },
    name: key,
    description: null,
    icon: null,
    gate: null,
    source: null,
    weightModifierRaw,
  } as Tech;
}

const state = buildEmpireState({
  authority: "auth_democratic",
  ethics: ["ethic_materialist"],
  civics: ["civic_technocracy"],
  origin: "origin_default",
  researched: ["tech_a"],
  perks: ["ap_technological_ascendancy"],
});

describe("effectiveWeight", () => {
  it("applies the unconditional top-level factor", () => {
    expect(effectiveWeight(tech("t", 100, { factor: 0.5 }), state).weight).toBe(50);
  });

  it("applies a modifier whose has_technology condition the empire meets", () => {
    const t = tech("t", 100, { modifier: { factor: 2, has_technology: "tech_a" } });
    expect(effectiveWeight(t, state)).toEqual({ weight: 200, approx: false });
  });

  it("skips a modifier whose condition the empire fails", () => {
    const t = tech("t", 100, { modifier: { factor: 2, has_technology: "tech_missing" } });
    expect(effectiveWeight(t, state)).toEqual({ weight: 100, approx: false });
  });

  it("evaluates ethics / civics / perks conditions", () => {
    const t = tech("t", 100, {
      modifier: [
        { factor: 2, has_ethic: "ethic_materialist" }, // true → ×2
        { factor: 3, has_civic: "civic_technocracy" }, // true → ×3
        { factor: 10, has_ascension_perk: "ap_missing" }, // false → skip
      ],
    });
    expect(effectiveWeight(t, state)).toEqual({ weight: 600, approx: false });
  });

  it("marks the estimate approximate when a condition is unknowable", () => {
    const t = tech("t", 100, {
      modifier: { factor: 2, count_starbase_sizes: { starbase_size: "starbase_starhold" } },
    });
    const r = effectiveWeight(t, state);
    expect(r.weight).toBe(100); // unknown modifier skipped
    expect(r.approx).toBe(true);
  });

  it("never returns a negative weight", () => {
    const t = tech("t", 10, { modifier: { add: -50 } });
    expect(effectiveWeight(t, state).weight).toBe(0);
  });
});

describe("computeDrawEstimates", () => {
  it("computes pool shares per area over available techs only", () => {
    const techs = [
      tech("t1", 100), // available
      tech("t2", 300), // available
      tech("t3", 600), // researched — not in the pool
      tech("s1", 50, undefined, "society"), // different pool
    ];
    const buckets = new Map<string, Bucket>([
      ["t1", "available"],
      ["t2", "available"],
      ["t3", "researched"],
      ["s1", "available"],
    ]);
    const est = computeDrawEstimates(techs, buckets, state);
    expect(est.get("t1")?.pct).toBeCloseTo(25);
    expect(est.get("t2")?.pct).toBeCloseTo(75);
    expect(est.get("t3")).toBeUndefined();
    expect(est.get("s1")?.pct).toBeCloseTo(100); // alone in the society pool
  });

  it("any unknown in the pool marks every share approximate", () => {
    const techs = [
      tech("t1", 100),
      tech("t2", 100, { modifier: { factor: 2, count_starbase_sizes: {} } }),
    ];
    const buckets = new Map<string, Bucket>([
      ["t1", "available"],
      ["t2", "available"],
    ]);
    const est = computeDrawEstimates(techs, buckets, state);
    expect(est.get("t1")?.approx).toBe(true);
    expect(est.get("t2")?.approx).toBe(true);
  });
});
