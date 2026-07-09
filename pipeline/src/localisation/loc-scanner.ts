/**
 * Global localisation scanner (DATA-03).
 *
 * RESEARCH.md Pitfall 2: tech localisation is scattered across 16+ .yml files
 * under localisation/english/ — only 328 of 678 tech keys live in
 * technology_l_english.yml, the rest are spread across DLC-named files
 * (megacorp_l_english.yml, ancient_relics_l_english.yml,
 * first_contact_dlc_tech_l_english.yml, biogenesis_bioships_l_english.yml,
 * etc). This module scans EVERY .yml file — never a hardcoded subset — and
 * builds one global key->string map.
 *
 * RESEARCH.md Pitfall 3: two line syntaxes coexist —
 *   key:0 "value"   (numeric revision index)
 *   key: "value"    (no index at all, e.g. tech_fe_lab_2 in
 *                     fallen_empire_l_english.yml)
 * The verified regex makes the index optional so both forms parse.
 *
 * D-16: a tech's NAME is a strict-fail concern (assemble.ts, Plan 05, fails
 * loud if any tech name is missing) — this module returns `null` for a
 * genuinely-absent key and lets the caller decide the fail policy. A tech's
 * DESCRIPTION is a cosmetic warn-not-fail concern — `null` is an expected,
 * acceptable outcome here, not an error.
 *
 * Security Domain: raw Paradox localisation strings may contain §color§!
 * codes and $variable$ tokens. This module ships them as PLAIN TEXT — it
 * does NOT convert markup to HTML. Phase 2 owns safe rendering.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Optional numeric index: matches BOTH `key:0 "value"` and `key: "value"`
// forms. Requiring the digit falsely reports ~215 keys missing (verified in
// RESEARCH.md).
const LOC_LINE = /^\s*([a-zA-Z0-9_.]+):(\d*)\s*"((?:[^"\\]|\\.)*)"/;

/**
 * Scans every .yml file under `locDir` (localisation/english/) and builds a
 * single global key->string map. Deliberately does NOT filter to a known
 * subset of files — scanning files with zero tech keys is harmless, and a
 * hardcoded file list silently breaks on future DLC (Pitfall 2).
 */
export function scanAllLocalisation(locDir: string): Map<string, string> {
  const map = new Map<string, string>();

  const files = readdirSync(locDir).filter((f) => f.endsWith(".yml"));
  for (const file of files) {
    let text = readFileSync(join(locDir, file), "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

    for (const line of text.split(/\r?\n/)) {
      const m = line.match(LOC_LINE);
      if (m) map.set(m[1], m[3]);
    }
  }

  return map;
}

export interface ResolvedTechText {
  /** Null only when the tech key itself is genuinely absent from the map (D-16: strict-fail concern for the caller). */
  name: string | null;
  /** Null when no `<techKey>_desc` key exists (D-16: cosmetic gap, warn-not-fail). */
  description: string | null;
}

/**
 * Recursively resolves `$token$` references in a localisation value against the
 * global map. Many tech names/descriptions are stored NOT as literal text but
 * as a reference to another game object's loc key — e.g. `tech_bio_reactor`'s
 * value is `"$building_bio_reactor$"`, and `building_bio_reactor` resolves to
 * "Bio-Reactor". A resolved value can itself contain more `$...$`, so this
 * recurses (depth-guarded against cyclic references). A `$key|format$`
 * specifier keeps only the `key` part for lookup. A token absent from the map is
 * left verbatim (best-effort — never throws).
 */
export function resolveLocTokens(
  value: string,
  map: Map<string, string>,
  depth = 0,
): string {
  if (depth > 12) return value; // cycle / runaway guard
  return value.replace(/\$([^$]*)\$/g, (whole, inner: string) => {
    if (inner === "") return whole; // literal `$$` etc.
    const key = inner.split("|")[0]; // drop a `$key|fmt$` formatting spec
    const hit = map.get(key);
    return hit === undefined ? whole : resolveLocTokens(hit, map, depth + 1);
  });
}

/**
 * Strips Clausewitz display markup that only makes sense in-game: `§Y…§!`
 * colour codes and `£energy£`-style inline icon tokens. Applied to resolved
 * NAMES/DESCRIPTIONS so they read as clean plain text (Security Domain: we ship
 * plain text, and these codes would otherwise render as literal noise).
 */
function stripLocMarkup(value: string): string {
  return value
    .replace(/§[A-Za-z!]/g, "") // §Y colour open / §! reset
    .replace(/£\w+(?:\|\w+)?£?/g, "") // £icon£ tokens (optionally £icon|frame£)
    .trim();
}

/**
 * Fully resolve a raw loc value into clean display text: recursively expand
 * `$token$` references, then strip in-game §colour / £icon markup. Shared by
 * tech names/descriptions AND unlock (grant) text so both render as plain text
 * with no residual raw tokens.
 */
export function resolveDisplayText(raw: string, map: Map<string, string>): string {
  return stripLocMarkup(resolveLocTokens(raw, map));
}

/**
 * Resolves a tech key's display name and description from the global
 * localisation map. The name key is the tech key itself; the description
 * lives under `<techKey>_desc` when present.
 *
 * Resolves `$token$` references recursively (a tech's name is often a reference
 * to the building/module/megastructure it unlocks) and strips in-game §colour /
 * £icon markup, so the output is clean display plain text — never HTML.
 */
export function resolveTechText(techKey: string, map: Map<string, string>): ResolvedTechText {
  const rawName = map.get(techKey);
  const rawDesc = map.get(`${techKey}_desc`);
  return {
    name: rawName === undefined ? null : resolveDisplayText(rawName, map),
    description: rawDesc === undefined ? null : resolveDisplayText(rawDesc, map),
  };
}
