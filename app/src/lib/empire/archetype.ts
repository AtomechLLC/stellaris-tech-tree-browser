import type { GateNode } from "./gates";

/**
 * Empire-archetype filter — a manual, no-save-required version of the
 * Saved-Empire "never reachable" check (gates.ts::sat). The user toggles a
 * handful of high-level archetype flags (Nomad vs Landed, Machine vs
 * Biological, Bioship vs Alloy Ship, Fauna) and every tech's `potential` gate
 * is checked for satisfiability against ONLY those fixed flags — every other
 * trigger in the gate (has_origin, has_ascension_perk, DLC checks, …) is left
 * as a free variable, since we aren't modeling a full empire, just these 4
 * concepts. A tech greys out only when the fixed flags make its gate
 * unsatisfiable no matter what.
 *
 * Deliberately independent of gates.ts's EmpireState/sat — that machinery is
 * calibrated for a REAL loaded save (static/dynamic/monotonic classification
 * matters there); this is a much narrower, purely-hypothetical toggle set, and
 * keeping it separate means neither can regress the other.
 */
export interface ArchetypeFilters {
  /** true = Nomad only, false = Landed only, undefined = unconstrained. */
  nomadic?: boolean;
  /** true = Machine only, false = Biological only, undefined = unconstrained. */
  machine?: boolean;
  /** true = Bioship only, false = Alloy Ship only, undefined = unconstrained. */
  bioShips?: boolean;
  /** true = Fauna archetype (Wilderness origin or Beastmasters civic). */
  fauna?: boolean;
}

/** True if any filter is actually set (cheap early-out — an all-free tree is
 *  always satisfiable, so skipping the walk entirely is a correct fast path). */
export function hasActiveArchetypeFilter(f: ArchetypeFilters): boolean {
  return f.nomadic !== undefined || f.machine !== undefined || f.bioShips !== undefined || f.fauna !== undefined;
}

interface SatState {
  canBeTrue: boolean;
  canBeFalse: boolean;
}
const FREE: SatState = { canBeTrue: true, canBeFalse: true };

/** Clausewitz boolean-leaf convention: value is `true`/`"yes"` (want=true) or
 *  `false`/`"no"` (want=false); a non-boolean value (has_origin="x", etc.) has
 *  no bearing here since only our 4 known boolean triggers reach this path. */
function wantedBool(value: string | number | boolean): boolean {
  return !(value === false || value === "no");
}

/** Resolve ONE leaf against the fixed archetype flags — free unless the leaf's
 *  trigger is one of our 4 known concepts AND that filter is actually set. */
function leafState(node: Extract<GateNode, { op: "leaf" }>, f: ArchetypeFilters): SatState {
  let fixed: boolean | undefined;
  switch (node.trigger) {
    case "is_nomadic":
      fixed = f.nomadic;
      break;
    case "is_machine_empire":
      fixed = f.machine;
      break;
    case "country_uses_bio_ships":
      fixed = f.bioShips;
      break;
    case "is_wilderness_empire":
    case "is_beastmasters_empire":
      fixed = f.fauna;
      break;
    default:
      return FREE;
  }
  if (fixed === undefined) return FREE;
  const satisfied = fixed === wantedBool(node.value);
  return { canBeTrue: satisfied, canBeFalse: !satisfied };
}

/** Same AND/OR/NOT/NOR satisfiability recursion as gates.ts::sat, parameterized
 *  by the archetype-specific leaf resolver above instead of EmpireState. */
function walk(node: GateNode, f: ArchetypeFilters): SatState {
  if (node.op === "leaf") return leafState(node, f);
  const kids = node.children.map((c) => walk(c, f));
  switch (node.op) {
    case "and":
      return {
        canBeTrue: kids.every((k) => k.canBeTrue),
        canBeFalse: kids.some((k) => k.canBeFalse),
      };
    case "or":
      return {
        canBeTrue: kids.some((k) => k.canBeTrue),
        canBeFalse: kids.every((k) => k.canBeFalse),
      };
    case "not":
      return { canBeTrue: kids[0]?.canBeFalse ?? true, canBeFalse: kids[0]?.canBeTrue ?? true };
    case "nor":
      return {
        canBeTrue: kids.every((k) => k.canBeFalse),
        canBeFalse: kids.some((k) => k.canBeTrue),
      };
  }
}

/**
 * True unless the tech's gate can NEVER be satisfied under the fixed archetype
 * flags (everything else in the gate stays a free variable). A tech with no
 * gate, or a gate untouched by any of the 4 known triggers, is always true.
 */
export function isTechAccessibleUnderArchetype(gate: GateNode | null, filters: ArchetypeFilters): boolean {
  if (!gate || !hasActiveArchetypeFilter(filters)) return true;
  return walk(gate, filters).canBeTrue;
}
