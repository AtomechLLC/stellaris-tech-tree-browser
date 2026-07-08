/**
 * Per-tech DLC classification (D-08, Pitfall 4): two-layer classification
 * combining filename convention (primary) with a `host_has_dlc` trigger scan
 * (secondary, overriding). Both layers are data-driven from the parsed DLC
 * registry (dlc-registry.ts) — no hand-typed DLC display-name table.
 *
 * Layer 1 (filename convention): normalize both the source filename's stem
 * (e.g. "00_ancient_relics_tech" -> tokens ["ancient","relics"]) and every
 * registry display name (e.g. "Ancient Relics Story Pack" -> tokens
 * ["ancient","relics","story","pack"]) to lowercase alphanumeric tokens, and
 * match when the filename's tokens are a subset of a display name's tokens
 * (order-independent). Base-game files (00_phys_tech.txt, 00_eng_tech.txt,
 * 00_repeatable.txt, etc) have no token overlap with any DLC name and yield
 * no filename tag.
 *
 * Layer 2 (host_has_dlc override): scan the tech's `potential` block (and any
 * nested OR/NOT/AND sub-blocks) for a `host_has_dlc = "..."` trigger. When
 * present, this EXACT string overrides the filename tag — this is how the
 * two known cross-DLC techs (00_eng_tech.txt -> Apocalypse/Federations) are
 * caught (RESEARCH.md Pitfall 4 / Assumption A1: 11 occurrences, 3 files, 2
 * genuine cross-DLC cases).
 */
import { normalizeToArray } from "../parser/clausewitz.js";

const FILENAME_STOPWORDS = new Set(["tech", "dlc", "story", "pack"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lowercases and splits on non-alphanumeric runs into a token set. */
function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0),
  );
}

/** Strips the leading numeric prefix (00_/000_/10_/etc.) and trailing .txt from a source filename. */
function filenameStem(sourceFilename: string): string {
  return sourceFilename.replace(/\.txt$/i, "").replace(/^\d+_?/, "");
}

/**
 * Finds the filename-convention DLC tag by matching the source filename's
 * significant tokens (with common stopwords like "tech"/"story"/"pack"
 * removed, since those appear in filenames but aren't discriminating) against
 * every registry display name's token set. Returns the first display name
 * whose tokens are a superset of the filename's significant tokens, or null
 * if the filename doesn't match any known DLC (i.e. it's base-game).
 */
function classifyByFilename(sourceFilename: string, dlcRegistry: Map<string, string>): string | null {
  const stem = filenameStem(sourceFilename);
  const fileTokens = new Set([...tokenize(stem)].filter((t) => !FILENAME_STOPWORDS.has(t)));
  if (fileTokens.size === 0) return null;

  for (const displayName of dlcRegistry.values()) {
    const nameTokens = tokenize(displayName);
    const allTokensPresent = [...fileTokens].every((t) => nameTokens.has(t));
    if (allTokensPresent) return displayName;
  }

  return null;
}

/**
 * Recursively scans a trigger block (potential/OR/AND/NOT/nested) for a
 * `host_has_dlc = "..."` key and returns its value if found.
 */
function findHostHasDlc(block: unknown): string | null {
  if (!isPlainObject(block)) return null;

  // Pitfall 5 arity: duplicate `host_has_dlc` keys (e.g. inside an OR block
  // gating on either of two DLCs) are auto-arrayed by jomini — handle both
  // the scalar and the array form; take the first string entry.
  const hhd = block.host_has_dlc;
  if (typeof hhd === "string") {
    return hhd;
  }
  if (Array.isArray(hhd)) {
    const first = hhd.find((v): v is string => typeof v === "string");
    if (first) return first;
  }

  for (const value of Object.values(block)) {
    for (const entry of normalizeToArray(value as unknown | unknown[] | undefined)) {
      if (isPlainObject(entry)) {
        const found = findHostHasDlc(entry);
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Classifies a single tech's gating DLC. Result: the `host_has_dlc` trigger
 * value if present (override), else the filename-convention tag, else null
 * (base game).
 */
export function classifyDlc(
  tech: { potentialRaw?: unknown } | Record<string, unknown>,
  sourceFilename: string,
  dlcRegistry: Map<string, string>,
): string | null {
  const potential = (tech as Record<string, unknown>).potentialRaw;
  const override = findHostHasDlc(potential);
  if (override) return override;

  return classifyByFilename(sourceFilename, dlcRegistry);
}
