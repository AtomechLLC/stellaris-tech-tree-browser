/**
 * Maps a `technology_swap`'s raw `trigger` block to one of the app's 4
 * empire-archetype filter keys (mirrors `app/src/lib/empire/archetype.ts`'s
 * `ArchetypeFilters` — duplicated here deliberately rather than shared,
 * same independence rationale as the gate satisfiability evaluator: this is
 * build-time code, the app's is runtime, and they must never accidentally
 * regress each other).
 *
 * Only a single-leaf trigger matching one of these 5 known names resolves.
 * The corpus also has swaps keyed on tankbound/reanimator/eager_explorer/
 * synthetic_fertility/overtuned/shroud_forged origins and gestalt/hive/robot
 * AND-combinations — none of those have a toggle in the UI, so they
 * correctly return null here and stay untagged (the icon still gets
 * converted to disk by assemble.ts; it's just not surfaced anywhere yet).
 */
import { normalizePotential } from "../gates.js";

export type ArchetypeSwapKey = "nomadic" | "machine" | "bioShips" | "fauna";

const TRIGGER_KEY: Record<string, ArchetypeSwapKey> = {
  is_nomadic: "nomadic",
  is_machine_empire: "machine",
  country_uses_bio_ships: "bioShips",
  is_wilderness_empire: "fauna",
  is_beastmasters_empire: "fauna",
};

export interface ArchetypeSwapTag {
  key: ArchetypeSwapKey;
  value: boolean;
}

/** Resolves a swap's raw `trigger` block to an archetype tag, or null. */
export function archetypeSwapTag(rawTrigger: unknown): ArchetypeSwapTag | null {
  const gate = normalizePotential(rawTrigger);
  if (!gate || gate.op !== "leaf") return null;
  const key = TRIGGER_KEY[gate.trigger];
  if (!key) return null;
  const value = !(gate.value === false || gate.value === "no");
  return { key, value };
}
