import type { Tech } from "../../types/tech-snapshot";

/**
 * Weight-modifier humanizer (quick 260708-4y2) — turns a tech's raw
 * `weightModifierRaw` block into readable "what boosts your chance of drawing
 * this tech" lines for the tooltip. PURE (unit-tested, no DOM) and defensive:
 * any shape it doesn't understand is skipped, never thrown on.
 *
 * ACCURACY over completeness: a modifier is rendered ONLY when EVERY one of its
 * conditions can be described. If any condition is too deep/unknown to phrase,
 * the whole line is dropped rather than shown as a misleading partial (e.g. a
 * `{ is_nomadic = yes  count_starbase_sizes = … }` must not read as just "if
 * nomadic"). Logic blocks (`OR`/`AND`/`NOR`/`NOT`), a handful of known scopes
 * (`any_owned_planet`, `any_neighbor_country`), councillor traits and starbase
 * counts are understood so real drivers (e.g. Mega-Engineering's "×20 if you
 * have a megastructure") show instead of being dropped.
 *
 * Output examples:
 *   { factor: 1.25, modifier: [{ factor: 2, has_technology: "tech_thrusters_2" }] }
 *     → ["Base ×1.25", "×2 if researched Thruster Components"]
 *   { modifier: [{ factor: 20, OR: { has_any_megastructure_in_empire: true,
 *                                    has_origin: "origin_shattered_ring" } }] }
 *     → ["×20 if (you have a megastructure or Shattered Ring origin)"]
 */

/** Comparison operators Clausewitz emits as `{ OP: value }` → math symbols.
 *  Clausewitz uses both `_OR_EQUAL` and the shorter `_EQUAL` spelling. */
const OPERATORS: Record<string, string> = {
  GREATER_THAN: ">",
  LESS_THAN: "<",
  GREATER_THAN_OR_EQUAL: "≥",
  LESS_THAN_OR_EQUAL: "≤",
  GREATER_THAN_EQUAL: "≥",
  LESS_THAN_EQUAL: "≤",
  EQUAL: "=",
  NOT_EQUAL: "≠",
};

/** Condition keys that carry structural/meta info, not a real player condition. */
const SKIP_KEYS = new Set(["factor", "inline_script", "add", "always"]);

/** Boolean-logic connectives — their value is a block of sub-conditions. */
const LOGIC = new Set(["OR", "AND", "NOR", "NOT"]);

/**
 * Known "scope" conditions whose value is a block evaluated against a related
 * object (a planet you own, a neighbor empire, …). Mapped to a lead-in phrase;
 * the inner block is described and appended. Unknown scopes are NOT guessed —
 * they return null so the modifier drops rather than reading awkwardly.
 */
const SCOPES: Record<string, string> = {
  any_owned_planet: "you own a",
  any_neighbor_country: "a neighbor",
};

/** Starbase tier ids → readable labels (waystation tiers collapse to one noun). */
const STARBASE_LABELS: Record<string, string> = {
  starbase_outpost: "Outpost",
  starbase_starport: "Starport",
  starbase_starhold: "Star Hold",
  starbase_starfortress: "Star Fortress",
  starbase_citadel: "Citadel",
  starbase_waystation_2: "Waystation",
  starbase_waystation_3: "Waystation",
};

/** Boolean conditions whose humanized key would read poorly — bespoke phrasing. */
const BOOLEAN_LABELS: Record<string, string> = {
  has_any_megastructure_in_empire: "you have a megastructure",
  is_nomadic: "nomadic",
};

/**
 * Known "has_/owns_ <game-entity>" conditions whose VALUE is a raw Clausewitz id
 * token (e.g. `ethic_fanatic_militarist`, `r_pox_sample`). Each maps to a
 * readable type noun + the id prefix/suffix to strip before prettifying, so the
 * tooltip shows "Fanatic Militarist ethic" instead of the raw "ethic
 * ethic_fanatic_militarist" token. (`has_technology` is handled separately —
 * it resolves to the real tech display name via the snapshot.)
 */
const ENTITY_CONDITIONS: Record<string, { noun: string; strip?: RegExp }> = {
  has_ethic: { noun: "ethic", strip: /^ethic_/ },
  has_ascension_perk: { noun: "ascension perk", strip: /^ap_/ },
  has_relic: { noun: "relic", strip: /^r_/ },
  has_origin: { noun: "origin", strip: /^origin_/ },
  has_civic: { noun: "civic", strip: /^civic_/ },
  has_valid_civic: { noun: "civic", strip: /^civic_/ },
  has_trait: { noun: "trait", strip: /^trait_(robot_)?/ },
  has_policy_flag: { noun: "policy" },
  has_modifier: { noun: "modifier" },
  has_country_flag: { noun: "flag" },
  owns_any_bypass: { noun: "bypass", strip: /_bypass$/ },
  has_seen_any_bypass: { noun: "bypass", strip: /_bypass$/ },
};

/** Lowercase connective words inside a title-cased label (not the first word). */
const SMALL_WORDS = new Set(["of", "the", "and", "or", "a", "an", "to", "in"]);

/** Cap recursion into nested logic/scope blocks. */
const MAX_DEPTH = 4;

/**
 * Turn a raw id token into a Title Case label: strip an optional prefix/suffix,
 * split on `_`, capitalise each word (keeping small connectives lowercase).
 * "ethic_fanatic_militarist" → "Fanatic Militarist"; "ap_mastery_of_nature" →
 * "Mastery of Nature".
 */
function prettifyToken(token: string, strip?: RegExp): string {
  const base = strip ? token.replace(strip, "") : token;
  return base
    .split("_")
    .filter(Boolean)
    .map((w, i) =>
      i > 0 && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1),
    )
    .join(" ");
}

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
 * Describe EVERY sub-condition in a block (used for logic + scope values). ALL
 * OR NOTHING: returns null if any renderable-intended entry can't be described,
 * so a partial "or"/"and" clause never misrepresents the real requirement.
 */
function describeBlock(
  obj: Record<string, unknown>,
  techByKey: Map<string, Tech>,
  depth: number,
): string[] | null {
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key)) continue;
    const clause = describeCondition(key, value, techByKey, depth);
    if (clause == null) return null;
    out.push(clause);
  }
  return out;
}

/**
 * Describe ONE condition (`key` + its `value`) as a short readable clause.
 * Returns null when the value shape isn't renderable (so callers can skip it).
 */
function describeCondition(
  key: string,
  value: unknown,
  techByKey: Map<string, Tech>,
  depth = 0,
): string | null {
  if (depth > MAX_DEPTH) return null;

  // Boolean-logic blocks → describe each branch and join. All-or-nothing: a
  // partial OR would understate the options, so drop if any branch is unknown.
  if (LOGIC.has(key)) {
    if (!isPlainObject(value)) return null;
    const parts = describeBlock(value, techByKey, depth + 1);
    if (!parts || parts.length === 0) return null;
    if (key === "NOT" || key === "NOR") {
      return `not ${parts.length > 1 ? `(${parts.join(" or ")})` : parts[0]}`;
    }
    const joiner = key === "AND" ? " and " : " or ";
    return parts.length > 1 ? `(${parts.join(joiner)})` : parts[0];
  }

  // Tech prerequisite boost → resolve the tech's display name.
  if (key === "has_technology" && typeof value === "string") {
    const name = techByKey.get(value)?.name ?? prettifyTechKey(value);
    return `researched ${name}`;
  }

  // Tradition → the tree name, noting whether it's the adopt or finish bonus
  // ("tr_harmony_adopt" → "Harmony tradition (adopted)").
  if (key === "has_tradition" && typeof value === "string") {
    let v = value.replace(/^tr_/, "");
    let state = "";
    if (v.endsWith("_adopt")) {
      v = v.slice(0, -"_adopt".length);
      state = " (adopted)";
    } else if (v.endsWith("_finish")) {
      v = v.slice(0, -"_finish".length);
      state = " (completed)";
    }
    return `${prettifyToken(v)} tradition${state}`;
  }

  // Councillor traits: `{ TRAIT: x }` or an array of them (an OR over traits).
  if (key === "has_trait_in_council") {
    const arr = Array.isArray(value) ? value : [value];
    const traits = arr
      .map((o) =>
        isPlainObject(o) && typeof o.TRAIT === "string"
          ? prettifyToken(o.TRAIT, /^leader_trait_/)
          : null,
      )
      .filter((t): t is string => t !== null);
    return traits.length ? `a councilor is ${traits.join(" or ")}` : null;
  }

  // Starbase-count boosts → "with <Tier>s" (the specific ≥N threshold is dropped;
  // a scaling 1..N series then dedupes to a single line).
  if (key === "count_starbase_sizes" && isPlainObject(value)) {
    const size = value.starbase_size;
    if (typeof size !== "string") return null;
    const label = STARBASE_LABELS[size] ?? prettifyToken(size, /^starbase_/);
    return `with ${label}s`;
  }

  // Planet-class token as a standalone value ("pc_habitat" → "Habitat").
  if (key === "is_planet_class" && typeof value === "string") {
    return prettifyToken(value, /^pc_/);
  }

  // Known scope blocks → "<lead-in> <inner conditions>".
  if (SCOPES[key] && isPlainObject(value)) {
    const parts = describeBlock(value, techByKey, depth + 1);
    if (!parts || parts.length === 0) return null;
    return `${SCOPES[key]} ${parts.join(" and ")}`;
  }

  // Other known game-entity conditions → "<Prettified Name> <noun>".
  const entity = ENTITY_CONDITIONS[key];
  if (entity && typeof value === "string") {
    return `${prettifyToken(value, entity.strip)} ${entity.noun}`;
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
    // Deeper/unknown object shape — not renderable here.
    return null;
  }

  // Boolean flag → bespoke phrasing when known, else the humanized flag
  // ("has_federation: true" → "with federation").
  if (typeof value === "boolean") {
    const special = BOOLEAN_LABELS[key];
    if (special) return value ? special : `not ${special}`;
    return value ? `with ${humanizeKey(key)}` : `without ${humanizeKey(key)}`;
  }

  // Plain scalar → "<label> <value>".
  if (typeof value === "number" || typeof value === "string") {
    return `${humanizeKey(key)} ${formatScalar(value)}`;
  }

  return null;
}

/**
 * Turn one modifier entry into a "×{factor} if {conditions}" line, or null.
 * If ANY condition can't be described, the whole line is dropped — a partial
 * clause would misrepresent when the boost actually applies.
 */
function describeModifier(mod: unknown, techByKey: Map<string, Tech>): string | null {
  if (!isPlainObject(mod)) return null;
  const factor = mod.factor;
  const conditions: string[] = [];
  for (const [key, value] of Object.entries(mod)) {
    if (SKIP_KEYS.has(key)) continue;
    const clause = describeCondition(key, value, techByKey);
    if (clause == null) return null; // drop the whole modifier — no partial lines
    conditions.push(clause);
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

  // Dedupe identical lines, preserving order — a scaling series (e.g. the
  // starbase-count ≥1..≥6 thresholds) collapses to a single line.
  const seen = new Set<string>();
  return lines.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
}
