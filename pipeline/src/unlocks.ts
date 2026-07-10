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
import { resolveDisplayText } from "./localisation/loc-scanner.js";

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
  // A resolved value is often a template with nested `$token$` refs + §colour
  // markup (e.g. "$TECH_UNLOCK_COMPONENT_LINE$ $tech_curator_lab$ — …"); run it
  // through the shared display resolver so grant text ships as clean plain text.
  if (hit !== undefined) return { text: resolveDisplayText(hit, locMap), resolved: true };
  return { text: token, resolved: false };
}

/**
 * Case-insensitive localisation lookup. Game loc keys are wildly case-mixed
 * (`MOD_ARMY_DAMAGE_MULT`, `mod_MACHINE_species_trait_points_add`,
 * `ESPIONAGE` vs `robotics`), so an exact `Map.get` misses most of them. The
 * lowercased index is built once per locMap and memoized.
 */
const ciIndexCache = new WeakMap<Map<string, string>, Map<string, string>>();
function locGetCI(locMap: Map<string, string>, key: string): string | undefined {
  const exact = locMap.get(key);
  if (exact !== undefined) return exact;
  let ci = ciIndexCache.get(locMap);
  if (!ci) {
    ci = new Map<string, string>();
    // First occurrence wins so canonical (usually earlier/base) entries stick.
    for (const [k, v] of locMap) {
      const lk = k.toLowerCase();
      if (!ci.has(lk)) ci.set(lk, v);
    }
    ciIndexCache.set(locMap, ci);
  }
  return ci.get(key.toLowerCase());
}

/** Title Case a raw snake_case token ("all_technology_research_speed" →
 *  "All Technology Research Speed") — the readable fallback when no loc exists. */
function prettifyToken(token: string): string {
  return token
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Produces a human-readable grant string for a single feature_flags token —
 * wiki-style "Unlocks <Feature>". The loc name is looked up case-insensitively
 * (`espionage` → `ESPIONAGE:0 "Espionage"`); tokens with no loc entry are
 * prettified from their key with unlock markers stripped
 * ("sustain_cosmic_storm_unlocked" → "Unlocks Sustain Cosmic Storm").
 */
function grantFromFeatureFlag(flag: string, locMap: Map<string, string>): { text: string; resolved: boolean } {
  const hit = locGetCI(locMap, flag);
  if (hit !== undefined) {
    const text = resolveDisplayText(hit, locMap);
    // A clean short NAME gets the "Unlocks" lead-in; loc that resolved into a
    // sentence/template (rare) ships as-is.
    if (text && !text.includes("$") && text.length <= 48 && !/^unlocks/i.test(text)) {
      return { text: `Unlocks ${text}`, resolved: true };
    }
    if (text && !text.includes("$")) return { text, resolved: true };
  }
  const stripped = flag.replace(/^(unlock|allow)_/, "").replace(/_unlocked$/, "");
  return { text: `Unlocks ${prettifyToken(stripped)}`, resolved: false };
}

/**
 * Formats one numeric stat modifier as a wiki-style effect line:
 * "+5% Research Speed" / "−15% Crime" / "+2 Encryption". The stat NAME comes
 * from the game's own `mod_<key>` localisation (case-insensitive); a key with
 * no loc entry falls back to its prettified token. VALUE formatting follows
 * the game's convention: `_add`-style modifiers are flat numbers, everything
 * else is a percentage — with "flat when |v| ≥ 2" as the tiebreak for the few
 * unsuffixed flat stats (e.g. add_base_country_intel = 10,
 * restored_node_bonus_skill = 2).
 */
export function formatStatGrant(
  statKey: string,
  value: number,
  locMap: Map<string, string>,
): { text: string; resolved: boolean } {
  const raw = locGetCI(locMap, `mod_${statKey}`);
  let name: string | null = null;
  if (raw !== undefined) {
    const resolvedName = resolveDisplayText(raw, locMap).trim();
    // Reject templates that still carry $VALUE$-style holes — not a clean name.
    if (resolvedName && !resolvedName.includes("$")) name = resolvedName;
  }
  const resolved = name !== null;
  if (name === null) name = prettifyToken(statKey.replace(/_(add|mult)$/, "").replace(/^add_/, ""));

  const flat = /_add$/.test(statKey) || /^add_/.test(statKey) || Math.abs(value) >= 2;
  // Clean float noise (0.05 * 100 → 5.000000000000001).
  const num = flat ? value : Math.round(value * 10000) / 100;
  const magnitude = Math.abs(num);
  const sign = num < 0 ? "−" : "+";
  return { text: `${sign}${magnitude}${flat ? "" : "%"} ${name}`, resolved };
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

/**
 * Modifier keys that describe how the modifier block is DISPLAYED — not stat
 * grants. `show_only_custom_tooltip` is a boolean engine directive; the human
 * text it points at lives in the sibling `custom_tooltip` key, which is
 * resolved separately below.
 */
const MODIFIER_META_KEYS = new Set([
  "description",
  "description_parameters",
  "show_only_custom_tooltip",
]);

/**
 * Normalizes a modifier value to a list of scalar (string/number/boolean)
 * values: a stat key jomini auto-arrayed (the same key declared twice in one
 * block) expands to one entry per value, and any object/nested element is
 * dropped so it is never `String()`-ed into "[object Object]" garbage.
 */
function asScalarArray(value: unknown): Array<string | number | boolean> {
  const items = Array.isArray(value) ? value : [value];
  return items.filter(
    (v): v is string | number | boolean =>
      typeof v === "string" || typeof v === "number" || typeof v === "boolean",
  );
}

/**
 * Produces human-readable "stat: value" grant strings for a single top-level
 * modifier block.
 *
 * - Meta/display keys (`description`, `description_parameters`,
 *   `show_only_custom_tooltip`) are skipped — they describe the modifier
 *   block's presentation, they are not stat grants.
 * - `custom_tooltip` carries a localisation KEY whose display string IS the
 *   real human-readable effect text — it is resolved through `locMap` and
 *   shipped as that text (never the raw key or a `custom_tooltip:` prefix).
 *   An empty / `BLANK_STRING` / unresolvable tooltip emits nothing.
 * - Object-valued entries are dropped — never `String()` an object (that
 *   ships "[object Object]" garbage as user-facing text).
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

    // custom_tooltip's value is a loc-key whose resolved string is the effect
    // text — ship that, not the raw key. Empty/BLANK_STRING/unresolved → skip.
    if (statKey === "custom_tooltip") {
      for (const raw of asScalarArray(statValue)) {
        if (typeof raw !== "string" || raw.length === 0 || raw === "BLANK_STRING") continue;
        const { text, resolved } = resolveOrVerbatim(raw, locMap);
        if (text.length === 0) continue;
        out.push({ text, resolved, unresolvedVariable: false });
      }
      continue;
    }

    for (const scalar of asScalarArray(statValue)) {
      // Resolve `@scripted_variable` values first so they can be formatted
      // like any other number below.
      let value: string | number | boolean = scalar;
      let valueResolved = true;
      if (typeof scalar === "string" && scalar.startsWith("@")) {
        const hit = varMap.get(scalar);
        if (hit !== undefined) value = hit;
        else valueResolved = false;
      }
      const numeric =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : NaN; // booleans / empty strings take the legacy path

      if (valueResolved && Number.isFinite(numeric)) {
        // Wiki-style effect line: "+5% Research Speed" / "+2 Encryption".
        const { text, resolved } = formatStatGrant(statKey, numeric, locMap);
        out.push({ text, resolved, unresolvedVariable: false });
      } else {
        // Non-numeric / unresolved-@var value — legacy "label: value" form.
        const { text: label, resolved: labelResolved } = resolveOrVerbatim(statKey, locMap);
        out.push({
          text: `${label}: ${String(value)}`,
          resolved: labelResolved && valueResolved,
          unresolvedVariable: !valueResolved,
        });
      }
    }
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
