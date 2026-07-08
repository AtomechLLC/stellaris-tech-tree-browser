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
 * Resolves a tech key's display name and description from the global
 * localisation map. The name key is the tech key itself; the description
 * lives under `<techKey>_desc` when present.
 *
 * Returns raw localisation strings unmodified — does NOT convert §color§!
 * codes or $variable$ tokens to HTML (Security Domain: ship as plain text).
 */
export function resolveTechText(techKey: string, map: Map<string, string>): ResolvedTechText {
  const name = map.get(techKey) ?? null;
  const description = map.get(`${techKey}_desc`) ?? null;
  return { name, description };
}
