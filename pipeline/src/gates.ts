/**
 * Tech `potential` gate normalization (DATA — surfaces gates into tech.json).
 *
 * jomini parses a tech's `potential = {}` into nested objects keyed by
 * combinators (NOT/NOR/OR/AND) with leaf triggers (has_ethic="x",
 * is_gestalt=false, has_origin="y", …). This module flattens that into an
 * explicit AND/OR/NOT/NOR tree of leaves, tagging each leaf STATIC (immutable
 * for the empire's life → can force a permanent "never") vs dynamic.
 *
 * Only the NORMALIZE half lives here (build-time). The EVALUATOR — deciding, for
 * a given empire, whether a gate is satisfiable ("never") or currently admits a
 * tech — lives app-side (`app/src/lib/empire/gates.ts`), since it needs the
 * empire state read from a save. Validated in spike 002 (.planning/spikes).
 */

export type GateNode =
  | { op: "leaf"; trigger: string; value: string | number | boolean; static: boolean }
  | { op: "and" | "or" | "nor" | "not"; children: GateNode[] };

const COMBINATOR: Record<string, "and" | "or" | "nor" | "not"> = {
  AND: "and",
  OR: "or",
  NOR: "nor",
  NOT: "not",
};
// Wrappers we descend through as a plain AND of their children.
const TRANSPARENT = new Set(["count", "hidden_trigger", "custom_tooltip", "hidden"]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// STATIC = cannot change for the empire's whole life → a static-false gate is a
// permanent "never". Everything else is dynamic (evaluated app-side).
const STATIC_TRIGGERS = new Set([
  "has_origin", // origins never change
  "is_gestalt",
  "is_hive_empire",
  "is_machine_empire",
  "is_regular_empire",
  "has_megacorp", // Megacorp DLC gate (not authority)
]);
function isDlcTrigger(trigger: string): boolean {
  return (
    /_dlc$/.test(trigger) ||
    [
      "host_has_dlc",
      "has_ancrel",
      "has_nemesis",
      "has_infernals",
      "has_paragon_dlc",
      "has_grand_archive_dlc",
    ].includes(trigger)
  );
}

/** Whether a trigger is immutable for an empire's life (→ can force "never"). */
export function isStaticTrigger(trigger: string, value: unknown): boolean {
  if (STATIC_TRIGGERS.has(trigger)) return true;
  if (isDlcTrigger(trigger)) return true;
  // Gestalt-consciousness is a permanent authority-class fact, unlike other ethics.
  if (trigger === "has_ethic" && value === "ethic_gestalt_consciousness") return true;
  return false;
}

function nodesFromObject(obj: Record<string, unknown>): GateNode[] {
  const out: GateNode[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const values = Array.isArray(v) ? v : [v];
    for (const val of values) {
      if (k in COMBINATOR) {
        const children = isObj(val) ? nodesFromObject(val) : [];
        out.push({ op: COMBINATOR[k]!, children });
      } else if (TRANSPARENT.has(k)) {
        if (isObj(val)) out.push({ op: "and", children: nodesFromObject(val) });
      } else if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        out.push({
          op: "leaf",
          trigger: k,
          value: val,
          static: isStaticTrigger(k, val),
        });
      }
      // else: a block-argument (scope) trigger like `can_form_federation_with_empire = { … }`.
      // These are always dynamic/situational — never a static "never" gate — so drop them
      // (equivalent to how the evaluator treats an unknown dynamic leaf: a free variable).
    }
  }
  return out;
}

/** Convert a raw jomini `potential` block into a GateNode tree, or null if none. */
export function normalizePotential(raw: unknown): GateNode | null {
  if (!isObj(raw)) return null;
  const children = nodesFromObject(raw);
  if (children.length === 0) return null;
  return children.length === 1 ? children[0]! : { op: "and", children };
}
