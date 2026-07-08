/**
 * unlocks builder — fully delivers D-05's two-component `unlocks` shape.
 *
 * `grants` (D-05 component a, "what the tech itself grants") is built by
 * joining each tech's own captured raw unlock content (`unlockContentRaw`
 * from Plan 02's extractor: feature_flags, prereqfor_desc title/desc
 * loc-keys, top-level modifier stat key/value pairs, and gateway) with the
 * global localisation map (Plan 03's `scanAllLocalisation`). A loc-key is
 * resolved to its display string when a real localisation entry exists;
 * otherwise the raw token/key ships VERBATIM AS PLAIN TEXT — never HTML
 * (Security Domain / T-05-03) — and is counted as an "unresolved grant
 * loc-key" so the validation report (Plan 05 Task 1's report.ts) can surface
 * the cosmetic gap (warn-not-fail per D-16).
 *
 * `leadsTo` (D-05 component b) is simply the passed-in, already-sorted
 * reverse-prerequisite edge list computed by Plan 02's `buildAndValidateGraph`
 * — this module does not recompute it, only carries it through.
 *
 * No building/component cross-referencing here (UNLK-01, deferred to v2).
 */
import type { UnlockContentRaw, PrereqforDescEntry, GrantsModifier } from "./parser/tech-extractor.js";

export interface BuildUnlocksResult {
  grants: string[];
  leadsTo: string[];
  /** Count of grant-content loc-keys that had no localisation entry and were shipped verbatim (cosmetic, D-16 warn-not-fail). */
  unresolvedGrantLocKeys: number;
  /** Count of `@scripted_variable` modifier values that could not be resolved and shipped verbatim (should be 0; feeds the D-17 unresolved-variable metric). */
  unresolvedVariableRefs: number;
}

/**
 * Resolves a single loc-key/token via the localisation map, falling back to
 * the verbatim token when no entry exists. Reports whether a fallback
 * occurred via the returned `resolved` flag so the caller can tally the
 * unresolved count.
 */
function resolveOrVerbatim(token: string, locMap: Map<string, string>): { text: string; resolved: boolean } {
  const hit = locMap.get(token);
  if (hit !== undefined) return { text: hit, resolved: true };
  return { text: token, resolved: false };
}

/** Produces a human-readable grant string for a single feature_flags token. */
function grantFromFeatureFlag(flag: string, locMap: Map<string, string>): { text: string; resolved: boolean } {
  return resolveOrVerbatim(flag, locMap);
}

/** Produces a human-readable grant string for a single prereqfor_desc {title, desc} pair. */
function grantFromPrereqforDesc(
  entry: PrereqforDescEntry,
  locMap: Map<string, string>,
): { text: string; resolved: boolean } | null {
  if (!entry.title && !entry.desc) return null;

  let resolvedAny = false;
  let unresolvedAny = false;
  const parts: string[] = [];

  if (entry.title) {
    const { text, resolved } = resolveOrVerbatim(entry.title, locMap);
    parts.push(text);
    resolvedAny = resolvedAny || resolved;
    unresolvedAny = unresolvedAny || !resolved;
  }
  if (entry.desc) {
    const { text, resolved } = resolveOrVerbatim(entry.desc, locMap);
    parts.push(text);
    resolvedAny = resolvedAny || resolved;
    unresolvedAny = unresolvedAny || !resolved;
  }

  return { text: parts.join(" — "), resolved: !unresolvedAny };
}

/** Modifier meta-keys that describe the modifier block itself — NOT stat grants. */
const MODIFIER_META_KEYS = new Set(["description", "description_parameters"]);

/**
 * Produces a human-readable "stat: value" grant string for a single top-level
 * modifier block.
 *
 * - Meta-keys (`description`, `description_parameters`) are skipped — they
 *   describe the modifier block, they are not stat grants.
 * - Object/array-valued entries are skipped — never `String()` an object
 *   (that ships "[object Object]" garbage as user-facing text).
 * - `@scripted_variable` string values are resolved through `varMap` (the
 *   global scripted-variables map merged with the tech file's local @vars);
 *   a still-unresolved `@var` ships verbatim and is counted as unresolved.
 */
function grantsFromModifier(
  modifier: GrantsModifier,
  locMap: Map<string, string>,
  varMap: Map<string, number | string>,
): Array<{ text: string; resolved: boolean; unresolvedVariable: boolean }> {
  const out: Array<{ text: string; resolved: boolean; unresolvedVariable: boolean }> = [];
  for (const [statKey, statValue] of Object.entries(modifier)) {
    if (MODIFIER_META_KEYS.has(statKey)) continue;
    if (typeof statValue !== "string" && typeof statValue !== "number" && typeof statValue !== "boolean") continue;

    const { text: label, resolved: labelResolved } = resolveOrVerbatim(statKey, locMap);

    let valueText = String(statValue);
    let valueResolved = true;
    if (typeof statValue === "string" && statValue.startsWith("@")) {
      const hit = varMap.get(statValue);
      if (hit !== undefined) {
        valueText = String(hit);
      } else {
        valueResolved = false;
      }
    }

    out.push({
      text: `${label}: ${valueText}`,
      resolved: labelResolved && valueResolved,
      unresolvedVariable: !valueResolved,
    });
  }
  return out;
}

/**
 * Builds the two-component `unlocks` for a single tech: `grants` (this
 * tech's own localised grant content) and `leadsTo` (the passed reverse
 * edges). Both are always present (may be empty). `grants` is sorted
 * deterministically (D-03).
 */
export function buildUnlocks(
  unlockContentRaw: UnlockContentRaw,
  locMap: Map<string, string>,
  leadsTo: string[],
  varMap: Map<string, number | string>,
): BuildUnlocksResult {
  const grants: string[] = [];
  let unresolvedGrantLocKeys = 0;
  let unresolvedVariableRefs = 0;

  for (const flag of unlockContentRaw.featureFlags) {
    const { text, resolved } = grantFromFeatureFlag(flag, locMap);
    grants.push(text);
    if (!resolved) unresolvedGrantLocKeys++;
  }

  for (const entry of unlockContentRaw.prereqforDesc) {
    const result = grantFromPrereqforDesc(entry, locMap);
    if (!result) continue;
    grants.push(result.text);
    if (!result.resolved) unresolvedGrantLocKeys++;
  }

  for (const modifier of unlockContentRaw.grantsModifiers) {
    for (const { text, resolved, unresolvedVariable } of grantsFromModifier(modifier, locMap, varMap)) {
      grants.push(text);
      if (!resolved) unresolvedGrantLocKeys++;
      if (unresolvedVariable) unresolvedVariableRefs++;
    }
  }

  if (unlockContentRaw.gateway) {
    grants.push(unlockContentRaw.gateway);
  }

  return {
    grants: [...grants].sort(),
    leadsTo: [...leadsTo].sort(),
    unresolvedGrantLocKeys,
    unresolvedVariableRefs,
  };
}
