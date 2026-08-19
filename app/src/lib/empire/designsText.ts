/**
 * D-08 round-trip engine for the empire designs file (and, identically, the
 * archive file — RESEARCH.md Pitfall 6). This module is the ONLY code path
 * allowed to produce designs-file output, and it produces it exclusively by
 * slicing the original decoded text. A serializer bug can never corrupt a
 * kept entry: `spliceDesignsFile` never re-serializes, never touches, and
 * never trims a kept entry's bytes.
 *
 * Lazy-loaded module shape and throw/catch contract mirror
 * `app/src/lib/empire/savLoad.ts`: a plain `Error` with a user-facing
 * message on malformed input, caught by the calling component's existing
 * try/catch/setError pattern.
 */
import { Jomini } from "jomini";
import { stripPdxCodes } from "../pdxText";

const FAIL_MESSAGE =
  "Couldn't read this file — it doesn't look like a Stellaris empire designs file. Check you picked the right file and try again.";

let parser: Jomini | null = null;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// The parser's tokenizer chokes on raw C0 control bytes inside quoted
// strings -- verified directly: 0x11 immediately followed by "!" throws
// "invalid syntax encountered: unrecognized operator", and 0x11 alone (no
// "!") parses without throwing but produces garbage (an unparsed
// "remainder" token list) instead of the expected key=value structure. The
// real designs file has 7 entry names containing raw 0x11 bytes (Paradox
// colour-escape — same byte `pdxText.ts` already documents as
// COLOR_ESCAPE, alongside 0x13 ICON_ESCAPE), so structural validation must
// survive this. Substitute both known Paradox escape bytes with Private
// Use Area placeholders ONLY for the parser call used for reconciliation;
// span names (and therefore every `DesignsEntry.rawName` and all spliced
// output) always come from the scanner's read of the ORIGINAL text, never
// from the parser, so this substitution never leaks into output.
const COLOR_ESCAPE = String.fromCharCode(0x11);
const ICON_ESCAPE = String.fromCharCode(0x13);
const COLOR_PLACEHOLDER = String.fromCharCode(0xe011);
const ICON_PLACEHOLDER = String.fromCharCode(0xe013);

function toParserSafeText(text: string): string {
  return text.split(COLOR_ESCAPE).join(COLOR_PLACEHOLDER).split(ICON_ESCAPE).join(ICON_PLACEHOLDER);
}

/** One top-level `"Name"={...}` block's byte offsets in the decoded text.
 *  `start` is the index of the opening quote of the entry name; `end` is
 *  one past the matching top-level closing brace. */
export interface EntrySpan {
  /** The literal bytes between the opening quotes, including any embedded
   *  0x11 Paradox colour-escape codes — never code-stripped. */
  name: string;
  start: number;
  end: number;
}

/**
 * Quote-aware, brace-depth top-level span scanner (RESEARCH.md Pattern 1,
 * implemented verbatim in behavior). This is the ONLY code path allowed to
 * touch kept-entry bytes, and it never does — it only LOCATES spans; the
 * actual output is built elsewhere by slicing the original string.
 *
 * There are no backslash-escaped quotes in this format (verified against
 * the real 400KB file) and no braces observed inside quoted values, so
 * quote-toggle + brace-depth tracking is sufficient.
 *
 * Throws when a block is unterminated (depth never returns to 0 before
 * end-of-text) — this is unambiguously malformed and must not silently
 * produce a truncated span. When the leading non-whitespace character at a
 * scan position is not a quote, the scanner stops (does not guess) and
 * returns whatever spans were found so far; `parseDesignsFile` detects
 * this case by checking for unconsumed trailing content.
 */
export function findTopLevelSpans(text: string): EntrySpan[] {
  const spans: EntrySpan[] = [];
  let i = 0;
  while (i < text.length) {
    // skip whitespace/newlines between top-level entries
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length || text[i] !== '"') break; // EOF or malformed — stop, don't guess

    const nameStart = i;
    i++; // past opening quote
    let name = "";
    while (i < text.length && text[i] !== '"') {
      name += text[i];
      i++;
    }
    i++; // past closing quote
    while (i < text.length && text[i] !== "{") i++; // skip `=` and whitespace to `{`

    let depth = 0;
    let inQuotes = false;
    let closed = false;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') inQuotes = !inQuotes; // no backslash-escape handling — none observed
      else if (!inQuotes && ch === "{") depth++;
      else if (!inQuotes && ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          closed = true;
          break;
        }
      }
    }
    if (!closed) {
      throw new Error(FAIL_MESSAGE);
    }
    spans.push({ name, start: nameStart, end: i });
  }
  return spans;
}

/**
 * Decode raw bytes as UTF-8 (the designs file's actual encoding — NOT
 * windows-1252 like the .sav gamestate, RESEARCH.md Pitfall 1). Falls back
 * to windows-1252 on a decode failure.
 *
 * IMPORTANT: output is always re-encoded as UTF-8 via `encodeDesignsText`,
 * so on the windows-1252 fallback path a save is NOT guaranteed
 * byte-identical for kept entries containing non-ASCII bytes — byte
 * identity (D-08) is formally guaranteed on the UTF-8 path only. The
 * fallback warning reflects this.
 */
export function decodeDesignsBytes(bytes: Uint8Array): {
  text: string;
  encoding: "utf-8" | "windows-1252";
  warning: string | null;
} {
  try {
    let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return { text, encoding: "utf-8", warning: null };
  } catch {
    let text = new TextDecoder("windows-1252").decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return {
      text,
      encoding: "windows-1252",
      warning:
        "This file wasn't valid UTF-8, so it was read as windows-1252 instead. Saving from this state may alter non-ASCII characters in existing entries.",
    };
  }
}

/** Encode text back to bytes. Output is always UTF-8 regardless of the
 *  source encoding (see `decodeDesignsBytes` warning). */
export function encodeDesignsText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** One parsed top-level entry, with span offsets for splicing and a small
 *  amount of defensively-read metadata for the UI list. */
export interface DesignsEntry {
  /** The exact bytes between the quotes — the D-09 collision identity. */
  rawName: string;
  /** `stripPdxCodes(rawName)` — display only, never used for identity. */
  displayName: string;
  start: number;
  end: number;
  authority: string | null;
  speciesClass: string | null;
}

export interface DesignsFile {
  filename: string;
  text: string;
  separator: string;
  encoding: "utf-8" | "windows-1252";
  entries: DesignsEntry[];
  warning: string | null;
}

/**
 * Decode, scan, and structurally validate a designs (or archive) file.
 * Validation runs a lazily-initialized parser for reconciliation only —
 * never for output (see `spliceDesignsFile`).
 *
 * Reconciliation rule (load-bearing): the span count MUST equal the sum,
 * over the parsed object's own keys, of (value array length when the value
 * is an array, else 1). The real file has 183 spans but only 182 parsed
 * keys because the name "Cyrrician Core" appears twice and duplicate
 * top-level keys collapse into an array — a naive
 * `Object.keys(parsed).length === spans.length` check would reject the
 * user's own file.
 *
 * On any mismatch, on an unterminated block, or on a non-quote leading
 * character (detected here as unconsumed trailing content after the scan),
 * throws a plain `Error` with the UI-SPEC's user-facing copy. Nothing
 * partial is ever returned.
 */
export async function parseDesignsFile(bytes: Uint8Array, filename: string): Promise<DesignsFile> {
  const { text, encoding, warning } = decodeDesignsBytes(bytes);

  // findTopLevelSpans throws directly for an unterminated block.
  const spans = findTopLevelSpans(text);

  // A non-quote leading character mid-scan makes the scanner stop early
  // without throwing (RESEARCH.md Pattern 1: "stop, don't guess") — detect
  // that here as unconsumed non-whitespace trailing content.
  const lastEnd = spans.length > 0 ? spans[spans.length - 1]!.end : 0;
  if (text.slice(lastEnd).trim().length > 0) {
    throw new Error(FAIL_MESSAGE);
  }

  if (!parser) parser = await Jomini.initialize();
  let parsed: Record<string, unknown>;
  try {
    // No `__root__` wrapper needed — every top-level construct in this file
    // is already a valid key=value pair (unlike the raw .sav gamestate).
    // Parse the control-byte-substituted text (see `toParserSafeText`) —
    // this is validation/reconciliation input only, never output.
    parsed = parser.parseText(toParserSafeText(text), { encoding: "utf8" }) as Record<string, unknown>;
  } catch {
    throw new Error(FAIL_MESSAGE);
  }

  const expectedCount = Object.values(parsed).reduce(
    (sum: number, v: unknown) => sum + (Array.isArray(v) ? v.length : 1),
    0,
  );
  if (expectedCount !== spans.length) {
    throw new Error(FAIL_MESSAGE);
  }

  // Detect the separator: the exact text between the end of span N and the
  // start of span N+1 (verified to be a single "\r\n" throughout the real
  // file). Never hardcode "\n" — a naive join would silently rewrite every
  // line ending in a CRLF file.
  let separator: string;
  if (spans.length >= 2) {
    separator = text.slice(spans[0]!.end, spans[1]!.start);
  } else {
    separator = text.includes("\r\n") ? "\r\n" : "\n";
  }

  // Match each span to its parsed value by name, taking the array element
  // at the duplicate-occurrence index when the parsed value is an array.
  // Parsed keys went through the same control-byte substitution as the
  // parser input, so look them up via `toParserSafeText` too.
  const occurrenceCount = new Map<string, number>();
  const entries: DesignsEntry[] = spans.map((span) => {
    const occurrence = occurrenceCount.get(span.name) ?? 0;
    occurrenceCount.set(span.name, occurrence + 1);

    const rawVal = parsed[toParserSafeText(span.name)];
    const val = Array.isArray(rawVal) ? rawVal[occurrence] : rawVal;

    const authority = isObj(val) && typeof val.authority === "string" ? val.authority : null;
    const speciesClass =
      isObj(val) && isObj(val.species) && typeof val.species.class === "string"
        ? (val.species.class as string)
        : null;

    return {
      rawName: span.name,
      displayName: stripPdxCodes(span.name),
      start: span.start,
      end: span.end,
      authority,
      speciesClass,
    };
  });

  return { filename, text, separator, encoding, entries, warning };
}

/**
 * Build the output text as: for each entry not in `removedIndices`, the
 * exact original bytes (`file.text.slice(entry.start, entry.end)`); then
 * each string in `addedTexts` in order; joined with `file.separator`, with
 * a terminating `file.separator` appended. Never re-serializes a kept
 * entry, never touches its bytes, never trims it.
 */
export function spliceDesignsFile(
  file: DesignsFile,
  removedIndices: ReadonlySet<number>,
  addedTexts: readonly string[],
): string {
  const pieces: string[] = [];
  file.entries.forEach((entry, i) => {
    if (!removedIndices.has(i)) pieces.push(file.text.slice(entry.start, entry.end));
  });
  for (const added of addedTexts) pieces.push(added);
  return pieces.join(file.separator) + file.separator;
}

/**
 * D-09: if `desired` is not in `taken`, return it unchanged; otherwise
 * append " (2)", " (3)", ... until free. Comparison is on RAW strings only
 * (never `stripPdxCodes`-normalized) — the game keys designs by the literal
 * bytes including any 0x11 colour escapes; `stripPdxCodes` is display-only.
 */
export function uniqueDesignName(desired: string, taken: Iterable<string>): string {
  const takenSet = new Set(taken);
  if (!takenSet.has(desired)) return desired;
  let n = 2;
  while (takenSet.has(`${desired} (${n})`)) n++;
  return `${desired} (${n})`;
}
