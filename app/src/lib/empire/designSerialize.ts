/**
 * D-07 designs-file writer for exactly ONE new entry. This is the only code
 * in the phase that produces new designs-file text; it is never allowed to
 * run over an existing entry (`designsText.ts`'s `spliceDesignsFile` owns
 * those bytes untouched — D-08).
 *
 * Output must be textually indistinguishable in style from the game's own
 * writer: tab indentation (one tab per nesting depth), one value per line,
 * CRLF line terminators, and the exact field order/shape measured
 * byte-for-byte against the user's real `user_empire_designs_v3.4.txt`
 * (see 04-RESEARCH.md "A complete real design entry"). Do NOT reach for the
 * Clausewitz parser library's own serialization helper class here
 * (RESEARCH.md Pitfall 3 — its 2-space/single-line output is cosmetically
 * wrong) and do NOT import `designsText.ts` — the splice engine is the
 * consumer of this module's output, not a dependency of it (T-04-09).
 */
import type {
  DesignEntry,
  DesignFlag,
  DesignFlagRef,
  DesignRuler,
  DesignRulerName,
  DesignSpecies,
  LocName,
  LocVariable,
} from "./designSchema";

/** N tab characters for nesting depth N. Every emitted line's indentation
 *  goes through this — the design file uses tabs exclusively, never spaces. */
function indent(depth: number): string {
  return "\t".repeat(depth);
}

/**
 * Injection guard (T-04-08): every quoted value passes through this before
 * being wrapped in `"..."`. Design/species/ruler names originate in an
 * untrusted uploaded save file; an unescaped double-quote (or a raw CR/LF)
 * in a name could close the quoted string early and let arbitrary
 * Clausewitz structure be spliced into the user's real designs file. Only
 * `"`, CR, and LF are stripped — raw 0x11/0x13 Paradox colour-escape bytes
 * are NOT structural characters in this format and must pass through
 * untouched (they're part of the game's own name-rendering grammar).
 */
export function sanitize(value: string): string {
  return value.split('"').join("").split("\r").join("").split("\n").join("");
}

/**
 * The same guard applied to a top-level design KEY before it is used for
 * D-09 collision resolution (`useDesignsSession.ts`). Collision resolution
 * MUST run on the post-sanitization string, otherwise a save-derived name
 * like `Alarian"Consciousness` passes the uniqueness check against an
 * existing `AlarianConsciousness` entry and then serializes into a duplicate
 * top-level key — the exact outcome D-09 exists to prevent.
 */
export const sanitizeDesignKey = sanitize;

/**
 * Injection guard for UNQUOTED (bare) values (T-04-08, review CR-01). A bare
 * Clausewitz token is terminated by whitespace, so anything other than
 * identifier characters can end the token and splice arbitrary structure into
 * the user's real designs file. Verified against this project's jomini build:
 * a quoted save string may legally contain CR/LF, `{`, `}`, `=` and quotes,
 * and `species.gender` / `ruler.gender` are copied straight out of an
 * untrusted uploaded `.sav` — so a crafted save could otherwise emit
 * `gender=male\n}\ninjected=1` and add fake top-level entries.
 */
function sanitizeToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "");
}

function quotedLine(depth: number, field: string, value: string, nl: string): string {
  return `${indent(depth)}${field}="${sanitize(value)}"${nl}`;
}

/** Low-level primitive. Callers MUST pass an already-validated token — use
 *  `tokenLine` for any string that originated in a save file, `numberLine`
 *  for numerics, `boolLine` for flags. */
function bareLine(depth: number, field: string, value: string | number, nl: string): string {
  return `${indent(depth)}${field}=${value}${nl}`;
}

/** Bare enumeration-style field (only `gender` in this format). `fallback`
 *  covers a value that sanitizes away to nothing — `field=` with an empty
 *  right-hand side would itself be malformed. */
function tokenLine(depth: number, field: string, value: string, nl: string, fallback: string): string {
  const token = sanitizeToken(value);
  return bareLine(depth, field, token.length > 0 ? token : fallback, nl);
}

/** Bare numeric field. A non-finite number would emit the bare tokens `NaN`
 *  / `Infinity`, which the game's parser does not accept for these slots. */
function numberLine(depth: number, field: string, value: number, nl: string): string {
  return bareLine(depth, field, Number.isFinite(value) ? value : 0, nl);
}

function boolLine(depth: number, field: string, value: boolean, nl: string): string {
  return bareLine(depth, field, value ? "yes" : "no", nl);
}

/** `field=` alone on its own line, then `{` alone on the next line — both at
 *  `depth`. Contents of the block are the caller's responsibility, always at
 *  `depth + 1`. Paired with `blockClose`. */
function blockOpen(depth: number, field: string, nl: string): string {
  return `${indent(depth)}${field}=${nl}${indent(depth)}{${nl}`;
}

function blockClose(depth: number, nl: string): string {
  return `${indent(depth)}}${nl}`;
}

/** Bracketed string-list block (`civics={ "a" "b" }`, `colors={ "a" ... }`) —
 *  one quoted value per line at `depth + 1`, no key. Used for `civics` and
 *  the (padded) `colors` list. NEVER used for `ethic` — see the dedicated
 *  comment at that emission site below. */
function stringListBlock(depth: number, field: string, values: readonly string[], nl: string): string {
  let out = blockOpen(depth, field, nl);
  for (const v of values) out += `${indent(depth + 1)}"${sanitize(v)}"${nl}`;
  out += blockClose(depth, nl);
  return out;
}

/**
 * `variables={...}` block using the exact game-native whitespace pattern
 * (verified byte-for-byte against the real file): after the opening `{` at
 * `depth`, one line containing only `depth + 1` tabs, then each element as
 * an object block at `depth + 1`, each followed by a line containing a
 * single space character (0x20) and nothing else (no tabs), then the
 * closing `}` at `depth`.
 */
function serializeVariablesBlock(variables: readonly LocVariable[], depth: number, nl: string): string {
  let out = blockOpen(depth, "variables", nl);
  out += `${indent(depth + 1)}${nl}`;
  for (const v of variables) {
    out += `${indent(depth + 1)}{${nl}`;
    out += quotedLine(depth + 2, "key", v.key, nl);
    out += serializeLocName(v.value, "value", depth + 2, nl);
    out += `${indent(depth + 1)}}${nl}`;
    out += ` ${nl}`;
  }
  out += blockClose(depth, nl);
  return out;
}

/**
 * Emits `<fieldName>={ key="..." [literal=yes] [variables={...}] }` at
 * `depth` — the pervasive key/literal/variable-template shape used by
 * `ship_prefix`, `name`, `adjective`, `species_name`, `species_plural`,
 * `species_adjective`, `planet_name`, `system_name`, and (nested) `full_names`
 * / variable `value`s.
 */
function serializeLocName(name: LocName, fieldName: string, depth: number, nl: string): string {
  let out = blockOpen(depth, fieldName, nl);
  out += quotedLine(depth + 1, "key", name.key, nl);
  if (name.literal) {
    out += boolLine(depth + 1, "literal", true, nl);
  }
  if (name.variables && name.variables.length > 0) {
    out += serializeVariablesBlock(name.variables, depth + 1, nl);
  }
  out += blockClose(depth, nl);
  return out;
}

/** `species={...}` / `secondary_species={...}` block, field order:
 *  class, portrait, species_name, species_plural, species_adjective,
 *  name_list, gender, trait (repeated). */
function serializeSpecies(
  species: DesignSpecies,
  fieldName: "species" | "secondary_species",
  depth: number,
  nl: string,
): string {
  const d = depth + 1;
  let out = blockOpen(depth, fieldName, nl);
  out += quotedLine(d, "class", species.class, nl);
  out += quotedLine(d, "portrait", species.portrait, nl);
  out += serializeLocName(species.species_name, "species_name", d, nl);
  out += serializeLocName(species.species_plural, "species_plural", d, nl);
  out += serializeLocName(species.species_adjective, "species_adjective", d, nl);
  out += quotedLine(d, "name_list", species.name_list, nl);
  out += tokenLine(d, "gender", species.gender, nl, "not_set");
  for (const trait of species.traits) {
    out += quotedLine(d, "trait", trait, nl);
  }
  out += blockClose(depth, nl);
  return out;
}

/** `ruler.name={...}` block: `full_names` (a LocName) then
 *  `use_full_regnal_name` (bool), both at `depth`. */
function serializeRulerName(name: DesignRulerName, depth: number, nl: string): string {
  let out = blockOpen(depth, "name", nl);
  out += serializeLocName(name.full_names, "full_names", depth + 1, nl);
  out += boolLine(depth + 1, "use_full_regnal_name", name.use_full_regnal_name, nl);
  out += blockClose(depth, nl);
  return out;
}

/** `ruler={...}` block, field order: gender, name, portrait, texture,
 *  evolution_mask, attachment, clothes, trait, leader_class. */
function serializeRuler(ruler: DesignRuler, depth: number, nl: string): string {
  const d = depth + 1;
  let out = blockOpen(depth, "ruler", nl);
  out += tokenLine(d, "gender", ruler.gender, nl, "not_set");
  out += serializeRulerName(ruler.name, d, nl);
  out += quotedLine(d, "portrait", ruler.portrait, nl);
  out += numberLine(d, "texture", ruler.texture, nl);
  out += numberLine(d, "evolution_mask", ruler.evolution_mask, nl);
  out += numberLine(d, "attachment", ruler.attachment, nl);
  out += numberLine(d, "clothes", ruler.clothes, nl);
  out += quotedLine(d, "trait", ruler.trait, nl);
  out += quotedLine(d, "leader_class", ruler.leader_class, nl);
  out += blockClose(depth, nl);
  return out;
}

/** `icon={category=... file=...}` / `background={category=... file=...}`. */
function serializeFlagRef(ref: DesignFlagRef, fieldName: "icon" | "background", depth: number, nl: string): string {
  let out = blockOpen(depth, fieldName, nl);
  out += quotedLine(depth + 1, "category", ref.category, nl);
  out += quotedLine(depth + 1, "file", ref.file, nl);
  out += blockClose(depth, nl);
  return out;
}

/** The game always writes exactly 6 colour slots, padding unused slots with
 *  the literal string `"null"`. A save's `country.flag.colors` can carry
 *  only 4 entries — this pads (or truncates an over-length list) to exactly
 *  6, which is this serializer's job, not the extractor's. */
function normalizeColors(colors: readonly string[]): string[] {
  const padded = colors.slice(0, 6);
  while (padded.length < 6) padded.push("null");
  return padded;
}

/** `empire_flag={...}` block, order: icon, background, colors (padded/
 *  truncated to 6 quoted values). */
function serializeFlag(flag: DesignFlag, depth: number, nl: string): string {
  const d = depth + 1;
  let out = blockOpen(depth, "empire_flag", nl);
  out += serializeFlagRef(flag.icon, "icon", d, nl);
  out += serializeFlagRef(flag.background, "background", d, nl);
  out += stringListBlock(d, "colors", normalizeColors(flag.colors), nl);
  out += blockClose(depth, nl);
  return out;
}

/**
 * Serialize one `DesignEntry` into game-native Clausewitz text: a top-level
 * `"<key>"=` line, `{` alone at depth 0, fields at depth 1 in the game's own
 * measured emission order, and a closing `}` at depth 0 with NO trailing
 * line terminator (the caller — `spliceDesignsFile`, 04-01 — supplies the
 * separator between this entry and its neighbours).
 */
export function serializeDesignEntry(entry: DesignEntry, newline: string = "\r\n"): string {
  const nl = newline;
  const d = 1;

  let out = `"${sanitize(entry.key)}"=${nl}{${nl}`;

  out += quotedLine(d, "key", entry.key, nl);
  out += serializeLocName(entry.ship_prefix, "ship_prefix", d, nl);
  out += serializeSpecies(entry.species, "species", d, nl);
  if (entry.secondary_species) {
    out += serializeSpecies(entry.secondary_species, "secondary_species", d, nl);
  }
  out += serializeLocName(entry.name, "name", d, nl);
  out += serializeLocName(entry.adjective, "adjective", d, nl);
  out += quotedLine(d, "authority", entry.authority, nl);
  out += quotedLine(d, "government", entry.government, nl);
  out += boolLine(d, "is_nomadic", entry.is_nomadic, nl);
  if (entry.advisor_voice_type !== undefined) {
    out += quotedLine(d, "advisor_voice_type", entry.advisor_voice_type, nl);
  }
  out += serializeLocName(entry.planet_name, "planet_name", d, nl);
  out += quotedLine(d, "planet_class", entry.planet_class, nl);
  out += serializeLocName(entry.system_name, "system_name", d, nl);
  out += quotedLine(d, "initializer", entry.initializer, nl);
  out += quotedLine(d, "graphical_culture", entry.graphical_culture, nl);
  out += quotedLine(d, "city_graphical_culture", entry.city_graphical_culture, nl);
  out += serializeFlag(entry.empire_flag, d, nl);
  out += serializeRuler(entry.ruler, d, nl);
  out += boolLine(d, "spawn_as_fallen", entry.spawn_as_fallen, nl);
  out += boolLine(d, "ignore_portrait_duplication", entry.ignore_portrait_duplication, nl);
  out += quotedLine(d, "room", entry.room, nl);
  out += boolLine(d, "spawn_enabled", entry.spawn_enabled, nl);

  // `ethic` is a REPEATED top-level scalar key, one `ethic="..."` line per
  // ethic — NOT a bracketed `ethic={...}` list block like `civics`/`colors`.
  // This is the single most-warned-about mistake for this format
  // (RESEARCH.md Pitfall 2): a bracketed `ethic={...}` form is not what the
  // game writes, even though the parser would happily accept it too.
  for (const ethic of entry.ethics) {
    out += quotedLine(d, "ethic", ethic, nl);
  }

  out += stringListBlock(d, "civics", entry.civics, nl);
  out += quotedLine(d, "origin", entry.origin, nl);

  out += `}`;
  return out;
}
