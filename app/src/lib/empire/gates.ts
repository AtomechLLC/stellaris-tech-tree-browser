/**
 * Spike 002 — potential-gates, Phase B: normalize + evaluate.
 *
 * Two pieces:
 *  1. normalizePotential(potentialRaw) → a boolean GateNode tree. jomini parses
 *     `potential = {}` into nested objects keyed by combinators (NOT/NOR/OR/AND)
 *     with leaf triggers (has_ethic="x", is_gestalt=false, has_origin="y", …).
 *     We flatten that into an explicit AND/OR/NOT/NOR tree of leaves, tagging
 *     each leaf STATIC (immutable for the empire's life → can force "never") or
 *     DYNAMIC (mutable/situational → never means never only if statically false).
 *
 *  2. classifyGate(node, state) → { never, passesNow }.
 *     - never: satisfiability check. Fix STATIC leaves to their value for this
 *       empire; treat DYNAMIC leaves as free variables. If the tree canNOT be
 *       made true under any assignment of the free vars, the tech is permanently
 *       gated out → never. (canBeTrue/canBeFalse recursion = correct 2-valued
 *       satisfiability over the fixed/free split.)
 *     - passesNow: Kleene 3-valued eval against the empire's CURRENT state
 *       (dynamic leaves evaluated where the save tells us; unknown → optimistic).
 *       Whether the tech's `potential` currently admits it (prereqs handled
 *       separately in spike 003).
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

// ---- static vs dynamic classification -------------------------------------
// STATIC = cannot change for the empire's whole life → a static-false gate is a
// permanent "never". DYNAMIC = could differ in some reachable future state.
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
export function isStaticTrigger(trigger: string, value: unknown): boolean {
  if (STATIC_TRIGGERS.has(trigger)) return true;
  if (isDlcTrigger(trigger)) return true;
  // Gestalt-consciousness is a permanent authority-class fact, unlike other ethics.
  if (trigger === "has_ethic" && value === "ethic_gestalt_consciousness") return true;
  return false;
}

// MONOTONIC = can flip false→true over a game, but effectively never true→false
// (you gain an ascension/tech/tradition and keep it; you don't un-become an
// individual-machine empire). For "never" satisfiability this matters: a
// monotonic trigger that is CURRENTLY TRUE is pinned true (won't revert), which
// can make an enclosing NOR/NOT permanently unsatisfiable.
const MONOTONIC_TRIGGERS = new Set([
  "is_individual_machine",
  "has_ascension_perk",
  "has_psionic_ascension",
  "has_make_spiritualist_perk",
  "has_technology",
  "has_tradition",
  "country_uses_bio_ships",
]);

// ---- normalization ---------------------------------------------------------
function nodesFromObject(obj: Record<string, unknown>): GateNode[] {
  const out: GateNode[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const values = Array.isArray(v) ? v : [v];
    for (const val of values) {
      if (k in COMBINATOR) {
        const children = isObj(val) ? nodesFromObject(val) : [];
        out.push({ op: COMBINATOR[k], children });
      } else if (TRANSPARENT.has(k)) {
        if (isObj(val)) out.push({ op: "and", children: nodesFromObject(val) });
      } else {
        out.push({
          op: "leaf",
          trigger: k,
          value: val as string | number | boolean,
          static: isStaticTrigger(k, val),
        });
      }
    }
  }
  return out;
}

/** Convert a raw jomini `potential` block into a GateNode, or null if none. */
export function normalizePotential(raw: unknown): GateNode | null {
  if (!isObj(raw)) return null;
  const children = nodesFromObject(raw);
  if (children.length === 0) return null;
  return children.length === 1 ? children[0] : { op: "and", children };
}

/** Every distinct trigger appearing in a gate tree (for coverage reporting). */
export function collectLeafTriggers(node: GateNode | null, out: Set<string> = new Set()): Set<string> {
  if (!node) return out;
  if (node.op === "leaf") out.add(node.trigger);
  else node.children.forEach((c) => collectLeafTriggers(c, out));
  return out;
}

// ---- empire state ----------------------------------------------------------
export interface EmpireState {
  isGestalt: boolean;
  isHive: boolean;
  isMachine: boolean;
  isIndividualMachine: boolean;
  isMegacorp: boolean;
  ethics: Set<string>;
  civics: Set<string>;
  origin: string | null;
  researched: Set<string>;
  ownsAllDlc: boolean; // this save owns ~every DLC; per-DLC mapping is a build task
}

export interface RawEmpire {
  authority: string | null;
  ethics: string[];
  civics: string[];
  origin: string | null;
  researched: string[];
}

export function buildEmpireState(e: RawEmpire): EmpireState {
  const ethics = new Set(e.ethics);
  const civics = new Set(e.civics);
  const isMachine = e.authority === "auth_machine_intelligence";
  const isHive = e.authority === "auth_hive_mind";
  const isGestalt = isMachine || isHive || ethics.has("ethic_gestalt_consciousness");
  // Cybernetic "individual machine" path (regular empire whose pops are machines).
  const isIndividualMachine = [...civics].some((c) => c.includes("individual_machine")) || isMachine;
  return {
    isGestalt,
    isHive,
    isMachine,
    isIndividualMachine,
    isMegacorp: e.authority === "auth_corporate",
    ethics,
    civics,
    origin: e.origin,
    researched: new Set(e.researched),
    ownsAllDlc: true,
  };
}

// ---- leaf evaluation (3-valued: true | false | null=unknown) ----------------
type Tri = boolean | null;

function evalLeaf(node: Extract<GateNode, { op: "leaf" }>, s: EmpireState): Tri {
  const { trigger, value } = node;
  const asBool = value === true || value === "yes";
  const want = value === false || value === "no" ? false : asBool ? true : value; // boolean triggers
  const boolResult = (actual: boolean): Tri => actual === (want === false ? false : true);

  switch (trigger) {
    case "is_gestalt":
      return boolResult(s.isGestalt);
    case "is_regular_empire":
      return boolResult(!s.isGestalt);
    case "is_hive_empire":
      return boolResult(s.isHive);
    case "is_machine_empire":
      return boolResult(s.isMachine);
    case "is_individual_machine":
      return boolResult(s.isIndividualMachine);
    case "is_megacorp":
      return boolResult(s.isMegacorp);
    case "has_ethic":
      if (value === "ethic_gestalt_consciousness") return s.isGestalt;
      return s.ethics.has(String(value));
    case "has_civic":
    case "has_valid_civic":
      return s.civics.has(String(value));
    case "has_origin":
      return s.origin === value;
    case "has_technology":
      return s.researched.has(String(value));
    default:
      if (isDlcTrigger(trigger)) return s.ownsAllDlc ? true : null;
      return null; // dynamic / unsupported → unknown
  }
}

// ---- "never": satisfiability with STATIC fixed, DYNAMIC free ----------------
interface SatState {
  canBeTrue: boolean;
  canBeFalse: boolean;
}
function sat(node: GateNode, s: EmpireState): SatState {
  if (node.op === "leaf") {
    if (node.static) {
      const v = evalLeaf(node, s);
      if (v === null) return { canBeTrue: true, canBeFalse: true }; // static-but-unknown → lenient
      return { canBeTrue: v === true, canBeFalse: v === false };
    }
    // Monotonic trigger currently TRUE → pinned true (won't revert).
    if (MONOTONIC_TRIGGERS.has(node.trigger) && evalLeaf(node, s) === true) {
      return { canBeTrue: true, canBeFalse: false };
    }
    return { canBeTrue: true, canBeFalse: true }; // free variable
  }
  const kids = node.children.map((c) => sat(c, s));
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
    case "nor": {
      // nor = not(or): true when all children false; false when any child true
      return {
        canBeTrue: kids.every((k) => k.canBeFalse),
        canBeFalse: kids.some((k) => k.canBeTrue),
      };
    }
  }
}

// ---- "passesNow": Kleene eval against current state, unknown = optimistic ---
function kleene(node: GateNode, s: EmpireState): Tri {
  if (node.op === "leaf") return evalLeaf(node, s);
  const kids = node.children.map((c) => kleene(c, s));
  const anyTrue = kids.some((k) => k === true);
  const anyFalse = kids.some((k) => k === false);
  const anyUnknown = kids.some((k) => k === null);
  switch (node.op) {
    case "and":
      return anyFalse ? false : anyUnknown ? null : true;
    case "or":
      return anyTrue ? true : anyUnknown ? null : false;
    case "not":
      return kids[0] === null ? null : !kids[0];
    case "nor":
      return anyTrue ? false : anyUnknown ? null : true;
  }
}

export interface GateVerdict {
  never: boolean; // permanently gated out (static-unsatisfiable)
  passesNow: boolean; // potential currently admits it (unknown treated optimistically)
}
export function classifyGate(node: GateNode | null, s: EmpireState): GateVerdict {
  if (!node) return { never: false, passesNow: true }; // no gate = open to all
  const satisfiable = sat(node, s).canBeTrue;
  const now = kleene(node, s);
  return { never: !satisfiable, passesNow: now !== false };
}
