---
phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a
plan: 01

subsystem: empire-manager
tags: [jomini, clausewitz, text-parsing, round-trip, typescript]

# Dependency graph
requires: []
provides:
  - "designSchema.ts: shared DesignEntry/LocName type contract for the serializer (04-03) and save extractor (04-04)"
  - "designsText.ts: UTF-8 decode with windows-1252 fallback, quote-aware top-level span scanner, parser-based reconciliation, byte-preserving splice"
  - "uniqueDesignName: D-09 raw-string collision disambiguation"
affects: ["04-03 (design serializer)", "04-04 (save extractor)", "04-05 (upload/parse UI)", "04-06 (remove/archive)", "04-07 (add-to-designs)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Quote-aware brace-depth span scanner locates top-level entry boundaries without semantic parsing (jomini stays validation-only, never output)"
    - "Splice-from-original-bytes: output is built exclusively via text.slice() of kept spans plus new entry text -- a serializer bug can never touch an entry the user didn't remove"
    - "Parser-safe control-byte substitution: swap 0x11/0x13 Paradox escape bytes for Private Use Area placeholders before handing text to jomini for structural validation only; span names and all output always come from the original text"

key-files:
  created:
    - app/src/lib/empire/designSchema.ts
    - app/src/lib/empire/designsText.ts
    - app/src/test/designsText.test.ts
  modified: []

key-decisions:
  - "jomini's tokenizer cannot parse quoted strings containing raw 0x11/0x13 control bytes (throws or silently mis-parses) -- fixed by substituting both bytes with Private Use Area placeholders for the reconciliation parse call only, never for scanned span names or spliced output"
  - "Malformed-input detection combines three signals into the same UI-SPEC error: findTopLevelSpans throws directly on an unterminated block; parseDesignsFile checks for unconsumed trailing content after the scan (catches a non-quote leading character); and span-count vs. parser-key-count mismatch after a successful parse"

patterns-established:
  - "Pattern 1: Quote-aware top-level span scanner (RESEARCH.md Pattern 1, implemented per spec)"
  - "Pattern 2: LocName key/literal/variable-template normalization (parseLocName) shared across serializer and extractor"

requirements-completed: [D-03, D-08, D-09]

# Metrics
duration: 12min
completed: 2026-08-18
---

# Phase 4 Plan 1: Design Round-Trip Engine Summary

**Byte-preserving span-scanner splice engine for the empire designs file (D-08), with a shared `DesignEntry`/`LocName` type contract that both the future serializer and save extractor implement against.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-18T20:24:00-07:00 (approx)
- **Completed:** 2026-08-18T20:36:00-07:00
- **Tasks:** 2 completed
- **Files created:** 3

## Accomplishments
- `designSchema.ts` exports the full `DesignEntry` payload contract (species, ruler, empire_flag, ethics/civics field-order gotchas documented in-line) with a `parseLocName` normalizer handling literal-flag and numeric-variable-key forms
- `designsText.ts` implements the D-08 round-trip engine: quote-aware brace-depth span scanner, UTF-8/windows-1252 decode with fallback warning, jomini-based reconciliation (array-aware, handles the real file's duplicate-name-collapses-to-array case), and a splice function that never re-serializes a kept entry
- Discovered and fixed a real parser limitation (jomini cannot tokenize raw 0x11/0x13 control bytes inside quoted strings) that would have broken every real-file upload, since the user's actual file has 7 entry names containing these bytes

## Task Commits

Each task was committed atomically:

1. **Task 1: Design payload type contract (designSchema.ts)** - `dd54681` (feat)
2. **Task 2: Span scanner, reconciliation and byte-preserving splice (designsText.ts)** - `011b602` (test, RED) → `fd50528` (feat, GREEN)

**Plan metadata:** (this commit) `docs(04-01): complete design round-trip engine plan`

## Files Created/Modified
- `app/src/lib/empire/designSchema.ts` - `LocName`/`LocVariable`/`DesignSpecies`/`DesignRuler`/`DesignFlag`/`DesignEntry` types + `parseLocName` normalizer
- `app/src/lib/empire/designsText.ts` - `findTopLevelSpans`, `decodeDesignsBytes`, `encodeDesignsText`, `parseDesignsFile`, `spliceDesignsFile`, `uniqueDesignName`
- `app/src/test/designsText.test.ts` - 20 tests covering round-trip identity (CRLF+LF), removal, add, duplicate names, colour-escape survival, fail-closed malformed input, per-entry metadata extraction, and D-09 disambiguation

## Decisions Made
- **jomini control-byte limitation (found via direct testing, not assumed):** confirmed with a standalone script that `parser.parseText` throws `"invalid syntax encountered: unrecognized operator"` when a quoted string contains `0x11` immediately followed by `!`, and silently produces an unparsed `"remainder"` token list (no throw, but wrong structure) for `0x11` alone. Since 7 of the real file's 182 entries have colour-escaped names, the naive "always jomini-validate the raw decoded text" design in the plan would fail reconciliation for the user's actual file on every upload. Fixed by substituting `0x11`/`0x13` with Private Use Area characters (`0xE011`/`0xE013`) ONLY in the string passed to `parser.parseText` for reconciliation; `EntrySpan.name`/`DesignsEntry.rawName` and everything `spliceDesignsFile` emits always come from the scanner's read of the untouched original text, so the substitution never reaches output.
- **Trailing-content check for "not a quote" malformed input:** rather than having `findTopLevelSpans` throw when it stops early on a non-quote character (which RESEARCH.md's own scanner code deliberately does NOT do — it just breaks), `parseDesignsFile` detects this case by checking whether any non-whitespace text remains after the last located span's end offset. This also catches trailing garbage after otherwise-valid entries, not just a fully-malformed leading character.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] jomini cannot parse quoted strings containing raw 0x11/0x13 Paradox escape bytes**
- **Found during:** Task 2, running the colour-escape survival test against the real implementation
- **Issue:** `parser.parseText` either throws (`0x11` + `!` combination) or silently mis-parses (`0x11` alone, producing a `"remainder"` array instead of the expected key=value object) any quoted string containing these control bytes. The real designs file has 7 entry names with embedded `0x11` bytes, so the plan's reconciliation design (validate the raw decoded text directly against jomini) would reject the user's own file on every upload.
- **Fix:** Added `toParserSafeText()` which substitutes `0x11`→`0xE011` and `0x13`→`0xE013` (Private Use Area) before the text is handed to `parser.parseText` for structural validation. The same substitution is applied to a span's `name` when looking up its corresponding parsed value, since the parser's own object keys went through the identical substitution. Nothing else in the module — spans, `rawName`, `displayName`, spliced output — ever sees the substituted text; it exists solely inside the reconciliation parse call.
- **Files modified:** `app/src/lib/empire/designsText.ts`
- **Verification:** Added a dedicated test ("survives a raw 0x11 colour-escape byte embedded in the name" for the scanner, plus "displayName strips Paradox colour codes; rawName keeps them" exercising the full `parseDesignsFile` path) — both pass; full `npx vitest run` (112 tests) and `npx tsc --noEmit` are clean.
- **Committed in:** `fd50528` (Task 2 commit)

**2. [Rule 3 - Blocking] Installed missing dependencies via `npm install` in this worktree**
- **Found during:** Task 1 verification (`npx tsc --noEmit` failed with "This is not the tsc command you are looking for" — `app/node_modules` did not exist in this fresh worktree)
- **Issue:** `node_modules` is gitignored and this worktree had never run `npm install`; no new packages were added to `package.json`, this was environment bootstrapping from the existing lockfile.
- **Fix:** Ran `npm install` inside `app/` — no `package.json`/`package-lock.json` changes resulted (verified via `git status`), confirming this only populated `node_modules` from the existing lockfile rather than installing a new/different dependency.
- **Files modified:** none (node_modules is gitignored)
- **Verification:** `git status --short` showed no lockfile drift after install; `npx tsc --noEmit` then ran successfully.
- **Committed in:** N/A (no files to commit)

**3. [Rule 3 - Blocking] Generated missing pipeline data snapshot for the full test suite**
- **Found during:** Post-Task-2 full-suite verification (`npx vitest run` failed 19/112 tests with `ENOENT ... public/data/v4.5.0/tech.json`)
- **Issue:** `app/public/data/` (a gitignored build artifact produced by `npm run copy-data`) was missing in this fresh worktree; the failures were entirely in pre-existing, unrelated test files (`layout.test.ts`, `exploreLayout.test.ts`, `smoke.test.ts`) that load this generated snapshot — not caused by this plan's changes.
- **Fix:** Ran `node scripts/copy-data.mjs` (the same script `npm run build`'s `prebuild` hook runs automatically), copying the already-present `pipeline/data/v4.5.0` snapshot into `app/public/data/`.
- **Files modified:** none (output directory is gitignored)
- **Verification:** `npx vitest run` went from 93/112 to 112/112 passing; `npm run build` (which runs this same copy step via `prebuild`) succeeds end-to-end.
- **Committed in:** N/A (no files to commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking/environment)
**Impact on plan:** The jomini control-byte fix (Rule 1) is a genuine correctness fix directly in scope of this plan's core property (D-08 round-trip on the real file) — without it, the round-trip engine would fail on the user's actual designs file. The two environment-bootstrap fixes (Rule 3) were prerequisites for running the plan's own verification commands in a fresh worktree and touched no tracked files.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `designSchema.ts` and `designsText.ts` are ready for 04-03 (serializer) and 04-04 (save extractor) to build against; both modules have zero UI/component dependencies and are not yet wired into any component (verified: no import cycle, `npm run build` succeeds with `designsText.ts` unreferenced by the app bundle).
- The `toParserSafeText` control-byte substitution is a `designsText.ts`-internal implementation detail (not exported) — 04-03/04-04 do not need to know about it, since they consume `DesignsFile`/`DesignsEntry`/`EntrySpan` (all sourced from original, unsubstituted text).
- No blockers for downstream plans in this phase.

---
*Phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a*
*Completed: 2026-08-18*

## Self-Check: PASSED

- FOUND: app/src/lib/empire/designSchema.ts
- FOUND: app/src/lib/empire/designsText.ts
- FOUND: app/src/test/designsText.test.ts
- FOUND: .planning/phases/04-empire-manager-upload-user-empire-designs-add-empires-from-a/04-01-SUMMARY.md
- FOUND commit: dd54681 (feat: designSchema.ts)
- FOUND commit: 011b602 (test: designsText.test.ts, RED)
- FOUND commit: fd50528 (feat: designsText.ts, GREEN)
- FOUND commit: 6502dcd (docs: plan metadata)
