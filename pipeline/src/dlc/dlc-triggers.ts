/**
 * Scripted DLC trigger resolution (data-driven, Phase 1 D-08).
 *
 * common/scripted_triggers defines helpers such as
 *   has_force_of_will_dlc = { optimize_memory host_has_dlc = "Willpower" }
 * which techs use in their `potential` instead of a bare host_has_dlc. This
 * module reads those definitions from the game files so no alias table is
 * hand-typed. Only the simple "single positive host_has_dlc" bodies are
 * accepted; OR/NOT bodies and trigger-referencing bodies are rejected.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseClausewitzFile } from "../parser/clausewitz.js";

const SCRIPTED_TRIGGERS_SUBDIR = join("common", "scripted_triggers");
const MARKER = "optimize_memory";

type Pair = [string, unknown];

/** Normalizes a def body into key/value pairs, or null when unsupported. */
function bodyToPairs(body: unknown): Pair[] | null {
  if (Array.isArray(body)) {
    // jomini positional-interleaved form: key, null, value, ... plus lone markers.
    const pairs: Pair[] = [];
    let i = 0;
    while (i < body.length) {
      const k = body[i];
      if (typeof k !== "string") return null;
      if (k === MARKER) {
        // Bare marker; jomini may emit a null placeholder right after it.
        i += body[i + 1] === null ? 2 : 1;
      } else if (body[i + 1] === null && i + 2 < body.length) {
        pairs.push([k, body[i + 2]]);
        i += 3;
      } else {
        return null; // lone non-marker string: unsupported shape
      }
    }
    return pairs;
  }
  if (typeof body === "object" && body !== null) {
    return Object.entries(body as Record<string, unknown>);
  }
  return null;
}

/** scripted trigger name -> DLC display name, for simple positive host_has_dlc defs. */
export function parseDlcTriggerDefs(parsed: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, body] of Object.entries(parsed)) {
    const pairs = bodyToPairs(body);
    if (!pairs) continue;
    const real = pairs.filter(([k, v]) => !(k === MARKER && v === undefined));
    if (real.length !== 1) continue;
    const [k, v] = real[0]!;
    if (k === "host_has_dlc" && typeof v === "string") out.set(name, v);
  }
  return out;
}

/** Reads every .txt under common/scripted_triggers (load order); a failing file is reported, not fatal. */
export async function loadDlcTriggerMap(
  gameRoot: string,
): Promise<{ map: Map<string, string>; unparsedFiles: string[] }> {
  const dir = join(gameRoot, SCRIPTED_TRIGGERS_SUBDIR);
  const map = new Map<string, string>();
  const unparsedFiles: string[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".txt"))
      .sort();
  } catch {
    return { map, unparsedFiles };
  }
  for (const file of files) {
    try {
      const parsed = await parseClausewitzFile(join(dir, file));
      for (const [k, v] of parseDlcTriggerDefs(parsed)) map.set(k, v);
    } catch {
      unparsedFiles.push(file);
    }
  }
  return { map, unparsedFiles };
}
