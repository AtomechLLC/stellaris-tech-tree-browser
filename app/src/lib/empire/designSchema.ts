/**
 * Shared type contract for a custom empire design payload (D-08/D-07).
 *
 * This module is the shared contract between the designs-file serializer
 * (`designSerialize.ts`, plan 04-03 — writer) and the save extractor
 * (`designFromSav.ts`, plan 04-04 — reader). Field names deliberately mirror
 * the game's own `user_empire_designs_v3.4.txt` field names exactly, so the
 * serializer's job is a mechanical field-by-field walk rather than a
 * translation layer.
 *
 * No serialization and no Clausewitz-parser import lives in this file —
 * types plus one normalizing reader (`parseLocName`) only.
 */

/** One `{ key=... value={...} }` slot inside a variable-template LocName,
 *  e.g. `{ key="adjective" value={ key="SPEC_Alari" } }`. A save's leader
 *  design snapshot can carry a NUMERIC variable key (`key=1`); the design
 *  file always writes it as a quoted string (`key="1"`) — `parseLocName`
 *  normalizes every variable key to a string. */
export interface LocVariable {
  key: string;
  value: LocName;
}

/** The pervasive key/literal/variable-template shape used by nearly every
 *  string-ish field in both the design file and the save (`name`,
 *  `adjective`, `species_name`, `species_plural`, `species_adjective`,
 *  `planet_name`, `system_name`, `ship_prefix`, ...):
 *  - `{ key: "SomeLocKeyOrLiteralText" }` — localisation-key form
 *  - `{ key: "SomeLiteralText", literal: true }` — literal (game-editor-typed) form
 *  - `{ key: "%ADJECTIVE%" | "%LEADER_2%" | ..., variables: [...] }` — variable-template form
 */
export interface LocName {
  key: string;
  literal?: boolean;
  variables?: LocVariable[];
}

/** `ruler.name` wraps a LocName in one extra level. */
export interface DesignRulerName {
  full_names: LocName;
  use_full_regnal_name: boolean;
}

/** `species={...}` block. NOTE: `traits` is the TS-side array name for
 *  convenience, but the design file writes it as repeated `trait="..."`
 *  scalar keys directly under `species={}` — never a bracketed list, and
 *  never wrapped in a `traits={}` object (unlike the save's `species_db`
 *  shape, which DOES wrap them — see designFromSav.ts / RESEARCH.md
 *  Pattern 3, "Unwrap required"). */
export interface DesignSpecies {
  class: string;
  portrait: string;
  species_name: LocName;
  species_plural: LocName;
  species_adjective: LocName;
  name_list: string;
  gender: string;
  /** Emitted as repeated `trait="..."` scalar keys, NOT a bracketed list. */
  traits: string[];
}

/** `ruler={...}` block. */
export interface DesignRuler {
  gender: string;
  name: DesignRulerName;
  portrait: string;
  texture: number;
  evolution_mask: number;
  attachment: number;
  clothes: number;
  trait: string;
  leader_class: string;
}

/** One `icon={category=... file=...}` / `background={category=... file=...}` slot. */
export interface DesignFlagRef {
  category: string;
  file: string;
}

/** `empire_flag={...}` block. The game always writes exactly 6 colour
 *  slots, padding unused slots with the literal string `"null"`. */
export interface DesignFlag {
  icon: DesignFlagRef;
  background: DesignFlagRef;
  colors: string[];
}

/**
 * A complete design entry — the payload inside a top-level
 * `"Design Name"={...}` block. Fields are listed in the game's own emission
 * order (verified against the real file — see 04-RESEARCH.md Code Examples),
 * since the serializer (04-03) walks this contract in this exact order.
 */
export interface DesignEntry {
  key: string;
  ship_prefix: LocName;
  species: DesignSpecies;
  /** Present in ~8% of real entries (servitor/gestalt-with-biological-pop
   *  empires). No verified save-side source field was located during
   *  research (RESEARCH.md Open Question 1) — kept optional so a future
   *  extractor can populate it without a schema change. */
  secondary_species?: DesignSpecies;
  name: LocName;
  adjective: LocName;
  authority: string;
  government: string;
  is_nomadic: boolean;
  /** Present on ~46% of real entries; omitted entirely when absent (never
   *  emitted as an empty string). */
  advisor_voice_type?: string;
  planet_name: LocName;
  planet_class: string;
  system_name: LocName;
  initializer: string;
  graphical_culture: string;
  city_graphical_culture: string;
  empire_flag: DesignFlag;
  ruler: DesignRuler;
  spawn_as_fallen: boolean;
  ignore_portrait_duplication: boolean;
  room: string;
  spawn_enabled: boolean;
  /** `ethics` is emitted as repeated `ethic="..."` scalar keys, NOT a
   *  bracketed list (unlike `civics`) — the single most-warned-about
   *  gotcha in 04-RESEARCH.md (Pitfall 2): a naive implementer who assumes
   *  `ethic` is list-shaped like `civics`/`colors` will silently emit
   *  output the design-file format doesn't use. */
  ethics: string[];
  /** Emitted as a bracketed list (`civics={ "a" "b" }`), unlike `ethics`. */
  civics: string[];
  origin: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function toArr<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/**
 * Normalize an unknown (parser-produced) value into a `LocName`, or `null`
 * when the value has no `key` field (not a LocName — callers decide the
 * fallback).
 *
 * Handles:
 * - The parser's JS boolean `true` for `literal=yes` AND the raw string
 *   `"yes"` (a save's leader design snapshot can carry either shape
 *   depending on parse path) — both normalize to `literal: true`.
 * - Numeric variable keys (`{ key: 1, value: {...} }`, seen in a save's
 *   leader design snapshot) — normalized to the string `"1"`, matching the
 *   design file's own `key="1"` quoted-string convention.
 * - Recursion into `value` so nested LocNames (inside `variables`) are
 *   typed all the way down.
 */
export function parseLocName(v: unknown): LocName | null {
  if (!isObj(v)) return null;
  const rawKey = v.key;
  if (typeof rawKey !== "string" && typeof rawKey !== "number") return null;
  const key = String(rawKey);

  const result: LocName = { key };

  if (v.literal === true || v.literal === "yes") {
    result.literal = true;
  }

  if (v.variables !== undefined) {
    // `variables={ {key=".." value={..}} {key=".." value={..}} }` is a
    // bracketed block of anonymous objects — the parser collapses a
    // single-occurrence block to a bare object rather than a 1-element
    // array (same collapsing behavior as top-level duplicate entries), so
    // normalize via `toArr` either way.
    const variableList = toArr(v.variables as unknown);
    const parsed: LocVariable[] = [];
    for (const entry of variableList) {
      if (!isObj(entry)) continue;
      const vKeyRaw = entry.key;
      if (typeof vKeyRaw !== "string" && typeof vKeyRaw !== "number") continue;
      const nested = parseLocName(entry.value);
      if (!nested) continue;
      parsed.push({ key: String(vKeyRaw), value: nested });
    }
    if (parsed.length > 0) result.variables = parsed;
  }

  return result;
}
