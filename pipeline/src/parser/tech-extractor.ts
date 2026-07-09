/**
 * Full tech extractor — widens the walking skeleton's single-file extraction
 * (Plan 01, `assemble.ts`) into the complete 33-file corpus (DATA-01/DATA-02).
 *
 * Enumerates every `*.txt` file directly under `common/technology/` (skipping
 * the `category/` and `tier/` subdirectories, which are NOT tech files), keeps
 * only top-level keys matching `^tech_` (filtering out `000_documentation.txt`
 * and any other non-tech top-level key — Assumption A2), and populates the
 * full `Tech` shape: tier/area/category, resolved numeric cost/weight
 * (defensively handling the documented-but-unobserved block form per Open
 * Question 1 / Assumption A3), structurally-preserved `weightModifierRaw`
 * (D-06 — duplicate `modifier` children stay arrays, never collapsed),
 * prerequisites, and the four flags (D-09).
 *
 * D-05 component (a): each tech's OWN raw unlock content — feature_flags,
 * prereqfor_desc title/desc loc-keys, top-level `modifier` grant(s), and
 * `gateway` — is captured into `unlockContentRaw` (a field ADDITIONAL to the
 * frozen `unlocks` schema shape, not a replacement for it) so Plan 05 can join
 * it with localisation into `unlocks.grants`. The final `unlocks` field itself
 * is left as `{ grants: [], leadsTo: [] }` here; Plan 05 fills `grants` from
 * this raw content and Task 3's graph builder fills `leadsTo`.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseClausewitzFile, normalizeToArray } from "./clausewitz.js";
import { resolveValue } from "./scripted-variables.js";
import type { Tech } from "../schema/tech-snapshot.js";

const TECHNOLOGY_SUBDIR = join("common", "technology");
const VALID_AREAS = new Set(["physics", "society", "engineering"]);
const TECH_KEY_PATTERN = /^tech_/;

/** A prereqfor_desc entry's title/desc are verbatim LOCALISATION KEYS (D-05a) — not resolved here. */
export interface PrereqforDescEntry {
  title?: string;
  desc?: string;
}

/** A single top-level `modifier` block's raw stat key/value pairs (D-05a grant, NOT weight tuning). */
export type GrantsModifier = Record<string, unknown>;

/** The tech's own raw unlock content, captured verbatim for Plan 05's localisation join (D-05 component a). */
export interface UnlockContentRaw {
  featureFlags: string[];
  prereqforDesc: PrereqforDescEntry[];
  grantsModifiers: GrantsModifier[];
  gateway: string | null;
}

/** The extractor's output shape: the frozen `Tech` schema plus extractor-only raw material for Plan 05. */
export interface ExtractedTech extends Tech {
  /** Tech's own raw unlock content (D-05a) — extractor-only, not part of the frozen snapshot schema. */
  unlockContentRaw: UnlockContentRaw;
  /** Source filename (relative to common/technology/), used by the DLC classifier and meta.sourceFiles. */
  sourceFile: string;
  /** Raw `potential` trigger block, preserved verbatim so the DLC classifier can scan for host_has_dlc (D-08). */
  potentialRaw: unknown;
  /** Raw `icon = "<name>"` override field, if present, so Plan 05's icon resolver can honor it (D-10). */
  iconOverrideRaw: string | null;
  /** Raw `technology_swap` block(s), preserved verbatim so Plan 05's icon resolver can resolve swap-variant icons (D-10). */
  technologySwapRaw: unknown;
  /**
   * Scripted variables in scope for this tech's source file: the global
   * `common/scripted_variables/` map merged with the file's own root-level
   * `@var` definitions (file-local wins). Tech files can define local @vars
   * (e.g. `@tech_gene_tailoring_POINTS` in 00_soc_tech.txt) that
   * `loadScriptedVariables` never sees — the unlocks builder needs this map
   * to resolve `@`-valued modifier grants.
   */
  fileVars: Map<string, number | string>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively resolves `@scripted_variable` references inside a preserved raw
 * block (D-06), e.g. a weight_modifier's `factor = @ap_grasp_the_void_travel_tech`.
 * Any string value starting with `@` is replaced by its value from `varMap`
 * (global scripted_variables merged with file-local @vars); unresolvable refs and
 * every non-@ value are left untouched, and the block's structure/keys are
 * preserved. Without this the UI shows raw refs (×@ap_grasp_the_void_travel_tech)
 * instead of the real multiplier (×1.5).
 */
function resolveVarsDeep(
  value: unknown,
  varMap: Map<string, number | string>,
): unknown {
  if (typeof value === "string" && value.startsWith("@")) {
    const hit = varMap.get(value);
    return hit !== undefined ? hit : value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveVarsDeep(v, varMap));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveVarsDeep(v, varMap);
    return out;
  }
  return value;
}

/**
 * Resolves jomini's duplicate-key auto-arraying for scalar (non-block)
 * fields like a tech's own top-level `cost`/`weight` — e.g. a tech that
 * genuinely repeats `weight = 0` then `weight = @tier2weight3` in the source
 * (verified real corpus case: tech_orbital_arc_furnace, tech_dyson_swarm,
 * tech_dyson_gun) parses to `["0", "@tier2weight3"]` under jomini's default
 * object-mode output. Clausewitz/Paradox scripting semantics take the LAST
 * duplicate top-level assignment as authoritative (later keys override
 * earlier ones read top-to-bottom), so this returns the last scalar entry
 * rather than the first. Does NOT apply to block-form entries (objects) —
 * those are handled separately via costRaw/weightModifierRaw preservation.
 */
function lastScalarIfDuplicated(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const scalars = value.filter((v) => !isPlainObject(v));
  return scalars.length > 0 ? scalars[scalars.length - 1] : value[value.length - 1];
}

/**
 * Recursively flattens a tech's raw `prerequisites` value into a flat list
 * of tech-key strings, regardless of shape. Verified real-corpus shapes:
 *   - Plain array of quoted keys: `["tech_x", "tech_y"]` (the common case).
 *   - A single OR-alternative block: `{ OR: ["tech_x", "tech_y"] }` (e.g.
 *     tech_titans — "any one of these" satisfies the prerequisite).
 *   - A MIXED block of bare keys plus a named `OR = { ... }` sub-block
 *     produces jomini's positional-interleaved array artifact (a duplicate-
 *     key-across-types quirk): e.g. tech_growth_chamber_1's prerequisites
 *     parses to `["tech_stingers", null, "OR", null, ["tech_mauler_growth_1",
 *     ...]]` — bare scalar keys appear as direct string elements; the "OR"
 *     name and its array value appear as separate elements with `null`
 *     spacers, rather than as `{OR: [...]}`. A `remainder` key can appear
 *     alongside OR (e.g. tech_arkship_tier_2) for an additional AND-required
 *     prerequisite alongside the OR alternatives.
 * This function treats an OR's alternatives as real prerequisite edges (any
 * one satisfies the tech, but each is still a genuine prerequisite
 * relationship for DAG/leadsTo purposes) rather than inventing new schema
 * shape beyond the frozen `prerequisites: string[]`.
 */
function flattenPrerequisites(value: unknown): string[] {
  const out: string[] = [];

  function visit(node: unknown): void {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      // Skip bare structural markers ("OR"/"remainder") that appear as
      // stray string elements in jomini's positional-interleaved artifact.
      if (node !== "OR" && node !== "remainder") out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (isPlainObject(node)) {
      for (const value of Object.values(node)) visit(value);
      return;
    }
  }

  visit(value);
  return [...new Set(out)];
}

/**
 * Enumerates the tech files directly under `common/technology/` — excludes
 * the `category/` and `tier/` subdirectories and their contents (those are
 * NOT tech files, per RESEARCH.md's corpus verification).
 */
export function listTechFiles(gameRoot: string): string[] {
  const dir = join(gameRoot, TECHNOLOGY_SUBDIR);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt") && statSync(join(dir, f)).isFile())
    .sort();
}

/**
 * Captures a tech's OWN raw unlock content (D-05 component a): feature_flags,
 * prereqfor_desc loc-key pairs, top-level `modifier` grant(s), and `gateway`.
 * Explicitly does NOT include weight_modifier/ai_weight modifiers — those are
 * weight tuning (already preserved in weightModifierRaw), not grants.
 */
function extractUnlockContentRaw(raw: Record<string, unknown>): UnlockContentRaw {
  const featureFlags = normalizeToArray(raw.feature_flags as string | string[] | undefined).flatMap((f) =>
    typeof f === "string" ? [f] : [],
  );

  // Pitfall 5 arity: a tech may declare `prereqfor_desc` more than once
  // (verified real corpus case: tech_gene_expressions has two blocks) — jomini
  // auto-arrays the duplicate key, so normalize to an array of blocks first
  // rather than guarding on a single plain object (which silently dropped ALL
  // prereqfor_desc content for such techs).
  const prereqforDesc: PrereqforDescEntry[] = [];
  for (const block of normalizeToArray(
    raw.prereqfor_desc as Record<string, unknown> | Record<string, unknown>[] | undefined,
  )) {
    if (!isPlainObject(block)) continue;
    for (const kindValue of Object.values(block)) {
      const entries = normalizeToArray(kindValue as Record<string, unknown> | Record<string, unknown>[] | undefined);
      for (const entry of entries) {
        if (!isPlainObject(entry)) continue;
        prereqforDesc.push({
          title: typeof entry.title === "string" ? entry.title : undefined,
          desc: typeof entry.desc === "string" ? entry.desc : undefined,
        });
      }
    }
  }

  // Top-level `modifier` ONLY — NOT weight_modifier.modifier / ai_weight (weight tuning, not a grant).
  const grantsModifiers = normalizeToArray(
    raw.modifier as Record<string, unknown> | Record<string, unknown>[] | undefined,
  ).filter(isPlainObject);

  const gateway = typeof raw.gateway === "string" ? raw.gateway : null;

  return { featureFlags, prereqforDesc, grantsModifiers, gateway };
}

/**
 * Extracts a single Tech record (plus extractor-only raw material) from one
 * raw jomini tech block. Mirrors the walking skeleton's `extractTech` (Plan
 * 01 `assemble.ts`) but adds category/prerequisites array-safety, full flag
 * parsing (D-09), and D-05a raw unlock content capture.
 */
export function extractTech(
  key: string,
  raw: Record<string, unknown>,
  varMap: Map<string, number | string>,
  sourceFile: string,
): ExtractedTech {
  // D-16 fail-loud: silently defaulting a missing/invalid area to "physics"
  // or tier to 0 is silent data corruption (misclassified techs with no
  // signal). Throw instead — the same policy as unparseable files, unresolved
  // variables, and missing names.
  if (typeof raw.area !== "string" || !VALID_AREAS.has(raw.area)) {
    throw new Error(`extractTech: tech "${key}" has missing/invalid area ${JSON.stringify(raw.area)}`);
  }
  const area = raw.area as Tech["area"];
  const category = normalizeToArray(raw.category as string | string[] | undefined).flatMap((c) =>
    typeof c === "string" ? [c] : [],
  );
  // Tier may legitimately be an @scripted_variable reference (real corpus
  // case: tech_weaver_bio_healing_6 has `tier = @fallentechtier`, which the
  // old default-to-0 path silently corrupted). resolveValue returns numbers
  // as-is, resolves @refs, and throws on anything else — wrap to name the tech.
  const rawTier = lastScalarIfDuplicated(raw.tier);
  let tier: number;
  try {
    tier = resolveValue(rawTier, varMap);
  } catch (err) {
    throw new Error(
      `extractTech: tech "${key}" has missing/invalid tier ${JSON.stringify(rawTier)} (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }

  const rawCost = lastScalarIfDuplicated(raw.cost);
  let cost = 0;
  let costRaw: unknown;
  if (isPlainObject(rawCost)) {
    costRaw = rawCost;
    const factor = (rawCost as Record<string, unknown>).factor;
    cost = typeof factor === "number" ? factor : 0;
  } else if (rawCost !== undefined) {
    cost = resolveValue(rawCost, varMap);
  }

  const rawWeight = lastScalarIfDuplicated(raw.weight);
  let weight = 0;
  let weightModifierRaw: unknown;
  if (raw.weight_modifier !== undefined) {
    weightModifierRaw = raw.weight_modifier;
  }
  if (isPlainObject(rawWeight)) {
    weightModifierRaw = weightModifierRaw ?? rawWeight;
    // Resolve an @scripted_variable base factor to its number (else 0).
    const factor = resolveVarsDeep((rawWeight as Record<string, unknown>).factor, varMap);
    weight = typeof factor === "number" ? factor : 0;
  } else if (rawWeight !== undefined) {
    weight = resolveValue(rawWeight, varMap);
  }
  // Resolve @scripted_variable factors inside the preserved modifier block so the
  // UI shows real multipliers (×1.5) instead of raw refs (D-06 structure kept).
  if (weightModifierRaw !== undefined) {
    weightModifierRaw = resolveVarsDeep(weightModifierRaw, varMap);
  }

  const prerequisites = flattenPrerequisites(raw.prerequisites);

  // Boolean flags via `lastScalarIfDuplicated`: some techs write the SAME flag
  // twice (e.g. tech_lasers_1 has `start_tech = yes` on two lines), which jomini
  // parses into an ARRAY — a bare `=== true` on the array is false and silently
  // drops the flag. The helper collapses a duplicate-key array to its last scalar
  // (and passes a single value through), so both forms flag correctly.
  const isRare = lastScalarIfDuplicated(raw.is_rare) === true;
  const isDangerous = lastScalarIfDuplicated(raw.is_dangerous) === true;
  // A repeatable UPGRADE tech (endless weapon/armor/shield/economy upgrades).
  // `levels` alone is insufficient — crisis techs (e.g. tech_cosmogenesis_thesis)
  // also use `levels = -1` for their multi-stage mechanic. The game's reliable
  // convention is the `tech_repeatable_` key prefix, so require BOTH: a levels
  // field AND that prefix. Guards against mis-flagging non-repeatable multi-level
  // techs (D-09).
  const isRepeatable = raw.levels !== undefined && key.startsWith("tech_repeatable_");
  const isStarting = lastScalarIfDuplicated(raw.start_tech) === true;
  // Pre-FTL "insight" techs (First Contact / observation-post research). Groups
  // the [Insight] explore bucket; flagged in the game files as `is_insight = yes`.
  const isInsight = lastScalarIfDuplicated(raw.is_insight) === true;

  const unlockContentRaw = extractUnlockContentRaw(raw);

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
    // Plan 05 joins unlockContentRaw + localisation into grants; Task 3's
    // graph builder computes leadsTo. Both empty here (extractor scope only).
    unlocks: { grants: [], leadsTo: [] },
    // Plan 02 Task 2 (dlc-classifier) fills this in downstream composition
    // (assemble.ts / Plan 05); left null at pure-extraction scope.
    dlc: null,
    flags: { isRare, isDangerous, isRepeatable, isStarting, isInsight },
    // Plan 03 resolves real localisation; extractor uses the key as a placeholder name.
    name: key,
    description: null,
    // Plan 04 resolves the real per-tech icon.
    icon: null,
    unlockContentRaw,
    sourceFile,
    potentialRaw: raw.potential,
    iconOverrideRaw: typeof raw.icon === "string" ? raw.icon : null,
    technologySwapRaw: raw.technology_swap,
    // The caller (extractAllTechs) passes the per-file merged map; direct
    // callers passing only the global map still get a valid (if smaller) scope.
    fileVars: varMap,
  };
}

/** Result of `extractAllTechsWithStats`: extracted records plus pre-filter counters for the D-17 report. */
export interface ExtractAllTechsResult {
  techs: ExtractedTech[];
  /**
   * Total top-level `tech_*` keys seen across all source files BEFORE the
   * isPlainObject extraction filter — the D-17 count-match input. Measured
   * here (not derived from the filtered output) so the report's
   * parsed-vs-found comparison can actually detect extraction drift.
   */
  totalTechKeysFound: number;
}

/**
 * Parses all 33 tech files under `common/technology/` and returns the full
 * set of extracted `tech_*` records (678+ expected per RESEARCH.md's direct
 * corpus count; `000_documentation.txt` and any non-tech top-level key are
 * filtered out) plus the pre-filter `tech_*` key count for the D-17 report.
 */
export async function extractAllTechsWithStats(
  gameRoot: string,
  varMap: Map<string, number | string>,
): Promise<ExtractAllTechsResult> {
  const files = listTechFiles(gameRoot);
  const techs: ExtractedTech[] = [];
  let totalTechKeysFound = 0;

  for (const file of files) {
    const filePath = join(gameRoot, TECHNOLOGY_SUBDIR, file);
    const rawFile = await parseClausewitzFile(filePath);

    // Merge this file's own root-level @var definitions (jomini keeps the `@`
    // prefix on root keys) over the global scripted_variables map — tech files
    // can define file-local @vars (e.g. `@tech_gene_tailoring_POINTS` in
    // 00_soc_tech.txt) that common/scripted_variables/ never sees.
    const fileVars = new Map(varMap);
    for (const [k, v] of Object.entries(rawFile)) {
      if (k.startsWith("@") && (typeof v === "number" || typeof v === "string")) {
        fileVars.set(k, v);
      }
    }

    for (const [key, value] of Object.entries(rawFile)) {
      if (!TECH_KEY_PATTERN.test(key)) continue;
      totalTechKeysFound++;
      if (!isPlainObject(value)) continue;
      techs.push(extractTech(key, value, fileVars, file));
    }
  }

  return { techs, totalTechKeysFound };
}

/**
 * Convenience wrapper returning only the extracted records — kept for callers
 * (and tests) that do not need the D-17 counters.
 */
export async function extractAllTechs(
  gameRoot: string,
  varMap: Map<string, number | string>,
): Promise<ExtractedTech[]> {
  return (await extractAllTechsWithStats(gameRoot, varMap)).techs;
}
