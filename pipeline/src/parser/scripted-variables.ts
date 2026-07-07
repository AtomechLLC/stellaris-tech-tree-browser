/**
 * Loads and resolves Stellaris `@scripted_variables` (D-07, DATA-02).
 *
 * jomini output retains the `@` prefix on scripted-variable keys (e.g.
 * `@tier1weight3`), so the lookup map is keyed exactly as it appears in the
 * source files and can be used directly without stripping/re-adding `@`.
 *
 * RESEARCH.md confirms zero occurrences of inline `@[ ]` math anywhere in
 * common/technology/ or common/scripted_variables/ in this corpus — so the
 * inline-math branch below is defensive detect-and-fail-loudly (D-07), not
 * active resolution logic.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseClausewitzFile } from "./clausewitz.js";

const INLINE_MATH_PATTERN = /^@\[.*\]$/;

/**
 * Reads every `*.txt` file under `common/scripted_variables/` and collects
 * each `@name = value` pair into a Map keyed by the `@`-prefixed name.
 */
export async function loadScriptedVariables(gameRoot: string): Promise<Map<string, number | string>> {
  const dir = join(gameRoot, "common", "scripted_variables");
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt"));

  const map = new Map<string, number | string>();
  for (const file of files) {
    const parsed = await parseClausewitzFile(join(dir, file));
    for (const [key, value] of Object.entries(parsed)) {
      if (!key.startsWith("@")) continue;
      map.set(key, value as number | string);
    }
  }
  return map;
}

/**
 * Resolves a raw cost/weight value to a concrete number.
 *
 * - A number is returned as-is (bare-number passthrough).
 * - A string matching inline `@[ ... ]` math throws (D-07: detect-and-fail-
 *   loudly; not supported in this corpus, verified zero occurrences).
 * - A plain `@name` string is looked up in varMap and its concrete number
 *   returned.
 * - Any unresolvable reference throws (D-16: strict-fail on unresolved
 *   variable in a required field).
 */
export function resolveValue(raw: unknown, varMap: Map<string, number | string>): number {
  if (typeof raw === "number") {
    return raw;
  }

  if (typeof raw === "string") {
    if (INLINE_MATH_PATTERN.test(raw)) {
      throw new Error(
        `resolveValue: inline @[] math detected ("${raw}") — not supported in v1 corpus (D-07)`,
      );
    }

    if (raw.startsWith("@")) {
      const resolved = varMap.get(raw);
      if (resolved === undefined) {
        throw new Error(`resolveValue: unresolved scripted variable "${raw}"`);
      }
      if (typeof resolved === "number") {
        return resolved;
      }
      // The looked-up value might itself be a numeric string or another
      // reference; try one more numeric coercion before failing.
      const asNumber = Number(resolved);
      if (!Number.isNaN(asNumber)) {
        return asNumber;
      }
      throw new Error(
        `resolveValue: scripted variable "${raw}" resolved to a non-numeric value "${String(resolved)}"`,
      );
    }
  }

  throw new Error(`resolveValue: unresolvable value ${JSON.stringify(raw)}`);
}
