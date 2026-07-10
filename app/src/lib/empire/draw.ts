import type { Tech } from "../../types/tech-snapshot";
import { evalConditionBlock, type EmpireState } from "./gates";
import type { Bucket } from "./classify";

/**
 * Draw-chance estimation for a loaded empire. Stellaris offers research
 * alternatives drawn weighted from the currently-AVAILABLE pool of each area,
 * so a tech's practical draw chance ≈ its effective weight (base × applicable
 * weight modifiers) over the sum of effective weights of every available tech
 * in its area.
 *
 * Each weight-modifier entry's conditions are evaluated 3-valued against the
 * empire state (same trigger vocabulary + machinery as the potential gates):
 * true → apply the factor; false → skip; UNKNOWN (a condition the save can't
 * answer, e.g. starbase counts) → skip and mark the estimate approximate.
 */

export interface DrawEstimate {
  /** Effective weight after applicable modifiers. */
  weight: number;
  /** Share of the area's available pool, 0..100. */
  pct: number;
  /** True when any skipped-as-unknown modifier makes this an approximation. */
  approx: boolean;
  /** The area whose pool the share is over (physics/society/engineering). */
  area: string;
}

/** Effective weight of one tech for this empire (pure; exported for tests). */
export function effectiveWeight(
  tech: Pick<Tech, "weight" | "weightModifierRaw">,
  s: EmpireState,
): { weight: number; approx: boolean } {
  let w = tech.weight;
  let approx = false;
  const raw = tech.weightModifierRaw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if (typeof r.factor === "number") w *= r.factor;
    const mods = r.modifier == null ? [] : Array.isArray(r.modifier) ? r.modifier : [r.modifier];
    for (const mod of mods as unknown[]) {
      if (!mod || typeof mod !== "object" || Array.isArray(mod)) continue;
      const { factor, add, ...conds } = mod as Record<string, unknown>;
      const verdict =
        Object.keys(conds).length === 0 ? true : evalConditionBlock(conds, s);
      if (verdict === true) {
        if (typeof factor === "number") w *= factor;
        if (typeof add === "number") w += add;
      } else if (verdict === null) {
        approx = true; // unknowable condition — modifier skipped
      }
    }
  }
  return { weight: Math.max(0, w), approx };
}

/**
 * Draw estimates for every AVAILABLE tech (per the bucket classification),
 * keyed by tech key. Techs in other buckets aren't in the draw pool and get no
 * entry. A weight-0 available tech (event-granted) shows 0%.
 */
export function computeDrawEstimates(
  techs: Tech[],
  buckets: Map<string, Bucket>,
  s: EmpireState,
): Map<string, DrawEstimate> {
  const pool = techs.filter((t) => buckets.get(t.key) === "available");
  const perTech = new Map<string, { weight: number; approx: boolean; area: string }>();
  const areaTotals = new Map<string, number>();
  let poolApprox = false;
  for (const t of pool) {
    const { weight, approx } = effectiveWeight(t, s);
    perTech.set(t.key, { weight, approx, area: t.area });
    areaTotals.set(t.area, (areaTotals.get(t.area) ?? 0) + weight);
    if (approx) poolApprox = true;
  }
  const out = new Map<string, DrawEstimate>();
  for (const [key, { weight, approx, area }] of perTech) {
    const total = areaTotals.get(area) ?? 0;
    out.set(key, {
      weight,
      pct: total > 0 ? (weight / total) * 100 : 0,
      // The share depends on every pool member's weight, so ANY unknown in the
      // pool makes every share approximate.
      approx: approx || poolApprox,
      area,
    });
  }
  return out;
}
