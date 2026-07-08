import type { Tech } from "../../types/tech-snapshot";

/**
 * Weight-modifier humanizer (quick 260708-4y2) — turns a tech's raw
 * `weightModifierRaw` block into readable "what boosts your chance of drawing
 * this tech" lines for the tooltip. PURE (unit-tested, no DOM) and defensive:
 * any shape it doesn't understand is skipped, never thrown on.
 *
 * `weightModifierRaw` shape (from the pipeline, D-06 preserves it structurally):
 *   {
 *     factor?: number,                     // base multiplier applied always
 *     modifier?: Mod | Mod[],              // conditional multipliers
 *   }
 * where each Mod is `{ factor: number, <condition>: value, ... }` — one or more
 * CONDITION keys alongside the factor. Duplicate `modifier` entries are kept as
 * an array (never collapsed), so we normalise single-object → one-element array.
 *
 * Output examples:
 *   { factor: 1.25, modifier: [{ factor: 2, has_technology: "tech_thrusters_2" }] }
 *     → ["Base ×1.25", "×2 if researched Thruster Components"]
 *   { modifier: [{ factor: 1.5, num_owned_planets: { GREATER_THAN: 2 } }] }
 *     → ["×1.5 if owned planets > 2"]
 */

/** Comparison operators Clausewitz emits as `{ OP: value }` → math symbols. */
const OPERATORS: Record<string, string> = {
  GREATER_THAN: ">",
  LESS_THAN: "<",
  GREATER_THAN_OR_EQUAL: "≥",
  LESS_THAN_OR_EQUAL: "≤",
  EQUAL: "=",
  NOT_EQUAL: "≠",
};

/** Condition keys that carry structural/meta info, not a real player condition. */
const SKIP_KEYS = new Set(["factor", "inline_script", "add", "always"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** snake_case / SCREAMING_CASE → space-separated lower words ("num_owned_planets" → "owned planets"). */
function humanizeKey(key: string): string {
  const words = key
    .replace(/^(has|is|any|num|count|had)_/, "") // drop leading quantifier verb
    .split("_")
    .filter(Boolean);
  return words.join(" ").toLowerCase();
}

/** Trim a leading "tech_" (Clausewitz tech keys) so a fallback label reads better. */
function prettifyTechKey(key: string): string {
  return key
    .replace(/^tech_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Format a scalar (number/string/bool) as its readable value. `@vars` stay literal. */
function formatScalar(v: unknown): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return String(v);
  return String(v);
}

/**
 * Describe ONE condition (`key` + its `value`) as a short readable clause.
 * Returns null when the value shape isn't renderable (so callers can skip it).
 */
function describeCondition(
  key: string,
  value: unknown,
  techByKey: Map<string, Tech>,
): string | null {
  // Tech prerequisite boost → resolve the tech's display name.
  if (key === "has_technology" && typeof value === "string") {
    const name = techByKey.get(value)?.name ?? prettifyTechKey(value);
    return `researched ${name}`;
  }

  // { OP: n } comparison → "<label> > n".
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 1) {
      const [op, operand] = entries[0];
      const sym = OPERATORS[op];
      if (sym && (typeof operand === "number" || typeof operand === "string")) {
        return `${humanizeKey(key)} ${sym} ${formatScalar(operand)}`;
      }
    }
    // Nested logic blocks (OR/NOR/NOT/AND, federation {...}) are too deep to
    // render cleanly — skip rather than dump raw structure.
    return null;
  }

  // Boolean flag → just the humanized flag ("has_federation: true" → "with federation").
  if (typeof value === "boolean") {
    return value ? `with ${humanizeKey(key)}` : `without ${humanizeKey(key)}`;
  }

  // Plain scalar → "<label> <value>".
  if (typeof value === "number" || typeof value === "string") {
    return `${humanizeKey(key)} ${formatScalar(value)}`;
  }

  return null;
}

/** Turn one modifier entry into a "×{factor} if {conditions}" line, or null. */
function describeModifier(mod: unknown, techByKey: Map<string, Tech>): string | null {
  if (!isPlainObject(mod)) return null;
  const factor = mod.factor;
  const conditions: string[] = [];
  for (const [key, value] of Object.entries(mod)) {
    if (SKIP_KEYS.has(key)) continue;
    const clause = describeCondition(key, value, techByKey);
    if (clause) conditions.push(clause);
  }
  if (conditions.length === 0) return null; // nothing renderable → drop the line

  const mult =
    typeof factor === "number"
      ? `×${factor}`
      : typeof factor === "string"
        ? `×${factor}` // preserves an unresolved @variable literal rather than dropping it
        : "×?";
  return `${mult} if ${conditions.join(" and ")}`;
}

/**
 * Produce readable weight-modifier lines for `raw` (a tech's `weightModifierRaw`).
 * Never throws — malformed / unknown shapes yield fewer (or zero) lines.
 */
export function describeWeightModifiers(
  raw: unknown,
  techByKey: Map<string, Tech>,
): string[] {
  if (!isPlainObject(raw)) return [];
  const lines: string[] = [];

  // Top-level base factor (applied unconditionally) — only worth showing if ≠ 1.
  if (typeof raw.factor === "number" && raw.factor !== 1) {
    lines.push(`Base ×${raw.factor}`);
  }

  // Conditional modifiers — a single object OR an array (kept structurally).
  let mods = raw.modifier;
  if (mods != null) {
    if (!Array.isArray(mods)) mods = [mods];
    for (const mod of mods as unknown[]) {
      const line = describeModifier(mod, techByKey);
      if (line) lines.push(line);
    }
  }

  return lines;
}
