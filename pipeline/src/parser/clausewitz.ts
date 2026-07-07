/**
 * Clausewitz/Paradox script parser wrapper around jomini.
 *
 * Implements the VERIFIED preprocessing fix from RESEARCH.md (Pitfall 1):
 * jomini's `parseText` throws "unexpected end of file" for two real cases in
 * the 4.5.0 corpus when given a pre-decoded string at the file root:
 *   1. BOM-only files (e.g. common/technology/00_repeatable.txt, 3 bytes).
 *   2. Tab-adjacent bare `@var\t=\tvalue` assignments at root level with no
 *      enclosing block (e.g. common/scripted_variables/01_scripted_variables_jobs.txt).
 *
 * Fix: wrap the raw file content in a synthetic `__root__ = { ... }` block
 * before parsing, and read results back from `result.__root__`. This wrap is
 * REQUIRED, not optional — root-level parsing has a stricter grammar than the
 * same construct nested inside any block.
 *
 * Verified in RESEARCH.md to parse all 33 tech files + category + tier + all
 * 22 scripted_variables files with zero errors.
 */
import { readFileSync } from "node:fs";
import { Jomini } from "jomini";

let parserInstance: Jomini | null = null;

async function getParser(): Promise<Jomini> {
  if (!parserInstance) {
    parserInstance = await Jomini.initialize();
  }
  return parserInstance;
}

/**
 * Parses a single Clausewitz script file and returns its top-level object,
 * unwrapped from the synthetic `__root__` block used internally to work
 * around jomini's root-level parsing quirks.
 */
export async function parseClausewitzFile(filePath: string): Promise<Record<string, unknown>> {
  const parser = await getParser();
  const buf = readFileSync(filePath);
  const text = buf.toString("latin1");
  const wrapped = `__root__ = {\n${text}\n}`;
  const result = parser.parseText(wrapped, { encoding: "windows1252" }) as Record<string, Record<string, unknown>>;
  return result.__root__ ?? {};
}

/**
 * Normalizes a jomini duplicate-key field to an array.
 *
 * jomini auto-arrays duplicate keys (a single occurrence stays a scalar/
 * object; 2+ occurrences become an array) — this helper makes that behavior
 * uniform for downstream code that always wants an array, regardless of how
 * many times the key appeared in the source file (Pitfall 5: `technology_swap`,
 * `category`, repeated `modifier` fields, etc).
 */
export function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
