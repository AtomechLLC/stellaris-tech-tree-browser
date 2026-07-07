/**
 * Orchestrator entrypoint for `npm run build:data` — the WALKING SKELETON.
 *
 * Skeleton scope (Plan 01) proves the full pipeline architecture end-to-end
 * on a minimal slice: resolve config -> detect version -> load scripted
 * variables -> parse ONE real tech file -> extract real techs (resolving
 * @scripted_variable cost/weight to concrete numbers) -> validate against
 * TechSnapshotSchema -> write data/v{version}/tech.json.
 *
 * TODO(Plan 02): widen tech-file parsing from one file to all 33 files in
 * common/technology/ (+ category/tier), add DLC classification, and build
 * the real prerequisite DAG (reverse edges for unlocks.leadsTo).
 * TODO(Plan 03): resolve real localisation for `name`/`description` (currently
 * `name` is a key placeholder and `description` is null).
 * TODO(Plan 04): resolve real per-tech icons (currently `icon` is null).
 * TODO(Plan 05): populate `unlocks.grants` from modifier/feature_flags/
 * prereqfor_desc/gateway content joined with localisation; populate
 * `unlocks.leadsTo` from the graph builder's reverse edges; full validation
 * report (D-17); idempotency/full-corpus test (D-18).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveConfig } from "./config.js";
import { detectGameVersion } from "./version/detect.js";
import { loadScriptedVariables, resolveValue } from "./parser/scripted-variables.js";
import { parseClausewitzFile, normalizeToArray } from "./parser/clausewitz.js";
import { TechSnapshotSchema, type Tech, type TechSnapshot } from "./schema/tech-snapshot.js";

const SKELETON_SOURCE_FILE = "common/technology/00_phys_tech.txt";

const VALID_AREAS = new Set(["physics", "society", "engineering"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts a Tech record from a single raw jomini tech block.
 *
 * Defensively handles both the observed bare-number/@variable cost/weight
 * shape AND the documented-but-unobserved block-form `cost = { factor = ... }`
 * (Open Question 1 / Assumption A3) by preserving the raw block in
 * `costRaw`/`weightModifierRaw` and falling back to 0 for the resolved
 * numeric field when only a block form is present.
 */
function extractTech(
  key: string,
  raw: Record<string, unknown>,
  varMap: Map<string, number | string>,
): Tech {
  const area = typeof raw.area === "string" && VALID_AREAS.has(raw.area) ? (raw.area as Tech["area"]) : "physics";
  const category = normalizeToArray(raw.category as string | string[] | undefined).flatMap((c) =>
    typeof c === "string" ? [c] : [],
  );
  const tier = typeof raw.tier === "number" ? raw.tier : 0;

  let cost = 0;
  let costRaw: unknown;
  if (isPlainObject(raw.cost)) {
    costRaw = raw.cost;
  } else if (raw.cost !== undefined) {
    cost = resolveValue(raw.cost, varMap);
  }

  let weight = 0;
  let weightModifierRaw: unknown;
  if (raw.weight_modifier !== undefined) {
    weightModifierRaw = raw.weight_modifier;
  }
  if (isPlainObject(raw.weight)) {
    weightModifierRaw = weightModifierRaw ?? raw.weight;
  } else if (raw.weight !== undefined) {
    weight = resolveValue(raw.weight, varMap);
  }

  const prerequisites = normalizeToArray(raw.prerequisites as string | string[] | undefined).flatMap((p) =>
    typeof p === "string" ? [p] : [],
  );

  const isRare = raw.is_rare === true;
  const isDangerous = raw.is_dangerous === true;
  const isRepeatable = raw.levels === -1;
  const isStarting = raw.start_tech === true;

  return {
    key,
    area,
    category,
    tier,
    cost,
    costRaw,
    weight,
    weightModifierRaw,
    prerequisites,
    // TODO(Plan 05): populate grants (from modifier/feature_flags/
    // prereqfor_desc/gateway + localisation) and leadsTo (graph builder
    // reverse edges). Both are empty but present at skeleton scope.
    unlocks: { grants: [], leadsTo: [] },
    // TODO(Plan 02): real DLC classification via filename + .dlc metadata +
    // host_has_dlc trigger scan (D-08).
    dlc: null,
    flags: { isRare, isDangerous, isRepeatable, isStarting },
    // TODO(Plan 03): resolve real localisation; skeleton uses the key as a
    // placeholder name.
    name: key,
    description: null,
    // TODO(Plan 04): resolve real per-tech icon.
    icon: null,
  };
}

/**
 * Runs the full walking-skeleton pipeline and returns the path to the
 * written tech.json snapshot.
 */
export async function runAssemble(): Promise<string> {
  const { gameRoot } = resolveConfig([]);
  const gameVersion = detectGameVersion(gameRoot);
  const varMap = await loadScriptedVariables(gameRoot);

  const filePath = join(gameRoot, SKELETON_SOURCE_FILE);
  const rawFile = await parseClausewitzFile(filePath);

  const techs: Record<string, Tech> = {};
  let unresolvedCount = 0;
  for (const [key, value] of Object.entries(rawFile)) {
    if (!key.startsWith("tech_") || !isPlainObject(value)) continue;
    try {
      techs[key] = extractTech(key, value, varMap);
    } catch (err) {
      unresolvedCount++;
      throw new Error(`runAssemble: failed to extract tech "${key}": ${(err as Error).message}`);
    }
  }

  const sortedKeys = Object.keys(techs).sort();
  const sortedTechs: Record<string, Tech> = {};
  for (const k of sortedKeys) sortedTechs[k] = techs[k];

  const areaCounts: Record<string, number> = {};
  const tierCounts: Record<string, number> = {};
  for (const tech of Object.values(sortedTechs)) {
    areaCounts[tech.area] = (areaCounts[tech.area] ?? 0) + 1;
    tierCounts[String(tech.tier)] = (tierCounts[String(tech.tier)] ?? 0) + 1;
  }

  const snapshot: TechSnapshot = {
    meta: {
      gameVersion,
      generatedAt: new Date().toISOString(),
      techCount: sortedKeys.length,
      areaCounts,
      tierCounts,
      sourceFiles: [SKELETON_SOURCE_FILE],
    },
    techs: sortedTechs,
  };

  // D-16: validate before writing — throw and do not write if invalid.
  const validated = TechSnapshotSchema.parse(snapshot);

  const outDir = join(process.cwd(), "data", gameVersion);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "tech.json");
  writeFileSync(outPath, JSON.stringify(validated, null, 2), "utf8");

  // Minimal validation report (seeds D-17; full report is Plan 05 scope).
  console.log(`[assemble] wrote ${outPath}`);
  console.log(`[assemble] techCount=${validated.meta.techCount} unresolvedVariables=${unresolvedCount}`);

  return outPath;
}

const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isMainModule) {
  runAssemble().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
