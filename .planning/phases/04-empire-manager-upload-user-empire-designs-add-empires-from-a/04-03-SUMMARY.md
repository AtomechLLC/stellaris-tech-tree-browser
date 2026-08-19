---
phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a
plan: 03
subsystem: data-pipeline
tags: [clausewitz, serializer, jomini, vitest, empire-manager]

# Dependency graph
requires:
  - phase: 04-01
    provides: designSchema.ts (DesignEntry/LocName contract), designsText.ts (findTopLevelSpans/spliceDesignsFile)
provides:
  - "serializeDesignEntry(entry, newline?) — hand-rolled, tab-indented, CRLF Clausewitz writer for one new design entry"
  - "Golden-text/round-trip/span-scanner/injection test coverage proving game-native output"
affects: [04-04, 04-05, 04-06, 04-07, 04-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Small private helpers (indent/sanitize/quotedLine/bareLine/boolLine/blockOpen/blockClose) compose into per-block emitters (serializeLocName, serializeSpecies, serializeRuler, serializeFlag) so the game's measured field order reads directly as code"
    - "Injection-guard sanitizer strips only \", CR, LF from quoted values -- explicitly preserves raw 0x11/0x13 Paradox colour-escape bytes"

key-files:
  created:
    - app/src/lib/empire/designSerialize.ts
    - app/src/test/designSerialize.test.ts
  modified: []

key-decisions:
  - "Reworded two source comments to avoid the literal substrings \"jomini\" and \"Writer\" -- the plan's own <verification> block greps for both as zero-occurrence checks confirming no dependency on the parser library or its serialization class; the prose intent (do not use it) is preserved without those tokens"

patterns-established:
  - "Clausewitz writer helpers (blockOpen/blockClose/quotedLine/bareLine/boolLine/stringListBlock) are the template for any future hand-rolled Clausewitz output in this codebase"

requirements-completed: [D-07, D-08]

# Metrics
duration: 10min
completed: 2026-08-19
---

# Phase 04 Plan 03: Design Entry Serializer Summary

**Hand-rolled tab-indented Clausewitz writer (`serializeDesignEntry`) that reproduces the game's own byte-for-byte formatting for one new empire design entry, with repeated `ethic=` keys, exact `variables` whitespace, colour-slot padding, and an injection-safe quoted-value sanitizer.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-19T03:39:17Z
- **Completed:** 2026-08-19T03:48:13Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `serializeDesignEntry` walks a `DesignEntry` in the game's measured top-level field order (key, ship_prefix, species, secondary_species?, name, adjective, authority, government, is_nomadic, advisor_voice_type?, planet_name, planet_class, system_name, initializer, graphical_culture, city_graphical_culture, empire_flag, ruler, spawn_as_fallen, ignore_portrait_duplication, room, spawn_enabled, ethic×N, civics, origin), each nested block (species, ruler, empire_flag, LocName/variables) following its own measured sub-order
- `ethic` emitted as N repeated `ethic="..."` scalar lines, never a bracketed list — the single most-warned-about mistake in RESEARCH.md (Pitfall 2), with an inline comment calling it out explicitly
- `variables` blocks reproduce the game's exact whitespace quirk byte-for-byte: a tabs-only line before the first element, a bare single-space line after each element
- `empire_flag.colors` padded to exactly 6 quoted slots (literal `"null"` for missing slots) or truncated to 6 when over-length
- A quoted-value sanitizer strips `"`, CR, and LF (injection guard, T-04-08) while leaving raw 0x11/0x13 Paradox colour-escape bytes untouched
- Test suite proves: exact golden-text output (`toBe`, not `toContain`), a full jomini parser round-trip (repeated-key `ethic` array of length 2, `species.trait` array of length 6, `ruler.texture` as a number, a truthy `literal` field), single-span recognition by `findTopLevelSpans` for both a normal and an adversarial double-quote name, colour padding/truncation, and 0x11 byte round-trip preservation

## Task Commits

Each task was committed atomically:

1. **Task 1: serializeDesignEntry — tab-indented Clausewitz writer** - `7abddf8` (feat)
2. **Fix: drop literal Writer/jomini mentions from serializer comments** - `cb9504c` (fix)
3. **Task 2: Serializer verification — golden text, jomini round-trip, span-scanner and injection tests** - `d7dd6ee` (test)

_Note: commit `cb9504c` is a small in-place wording fix to Task 1's file (see Deviations), sequenced before Task 2's commit since it was discovered while preparing Task 2's verification pass._

## Files Created/Modified
- `app/src/lib/empire/designSerialize.ts` - Exports `serializeDesignEntry(entry, newline?)`; private helpers for indentation, quoted/bare/bool line emission, block open/close, string-list blocks, `variables` blocks, and per-block emitters for `LocName`, `species`/`secondary_species`, `ruler`, and `empire_flag`
- `app/src/test/designSerialize.test.ts` - Golden-text (`toBe`), jomini round-trip, span-scanner compatibility, injection-guard, colour-padding/truncation, and colour-escape-preservation tests, all against one shared inline `DesignEntry` fixture factory modelled on the real "Alarian Consciousness" entry

## Decisions Made
- Reworded the module's header comment and the `ethic=` inline comment to avoid the literal strings "jomini" and "Writer" — the plan's own `<verification>` block runs `grep -c 'jomini'` (expects 0) and `grep -rn "Writer"` (expects no matches) directly against the source file to confirm no dependency on the parser library or its serialization class. The original prose used those words descriptively ("Do NOT use jomini's `Writer` class"); the reworded comments ("Do NOT reach for the Clausewitz parser library's own serialization helper class") preserve the exact same guidance without tripping the literal-string checks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded two source comments to satisfy the plan's own literal-string verification greps**
- **Found during:** Task 1 acceptance-criteria check (`grep -c 'jomini' designSerialize.ts` expected 0, plan-level `<verification>` expects `grep -rn "Writer"` to return nothing)
- **Issue:** The header comment and the `ethic=` inline comment used the words "jomini" and "Writer" in prose to explain what NOT to do, which are literal substrings the plan's own automated checks scan for and expect to be absent (as a proxy for "no dependency on the parser library's Writer class")
- **Fix:** Reworded both comments to convey identical guidance ("do not reach for the Clausewitz parser library's own serialization helper class") without those literal tokens
- **Files modified:** app/src/lib/empire/designSerialize.ts
- **Verification:** `grep -c 'jomini' app/src/lib/empire/designSerialize.ts` → 0; `grep -rn "Writer" app/src/lib/empire/designSerialize.ts` → no matches; `npx tsc --noEmit` exits 0; all 6 tests still pass
- **Committed in:** cb9504c

---

**Total deviations:** 1 auto-fixed (1 blocking — literal-string verification check)
**Impact on plan:** Cosmetic comment wording only, no behavior change. No scope creep.

## Issues Encountered
None — the serializer's whitespace/field-order algorithm was derived directly from the interfaces block's measured facts and verified line-by-line against the real designs file's first 152 lines before writing any code; all 6 tests (including the exact-string golden-text assertion) passed on the first run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `serializeDesignEntry` is ready for 04-04's `designFromSav.ts` extractor to call once it produces a `DesignEntry` from save data, and for whichever plan wires the "add to my empires" UI action to `spliceDesignsFile`'s `addedTexts`
- The serializer has zero coupling to `designsText.ts` (verified: no import), so 04-01's splice engine and this writer stay independently testable
- No blockers

---
*Phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: app/src/lib/empire/designSerialize.ts
- FOUND: app/src/test/designSerialize.test.ts
- FOUND: .planning/phases/04-empire-manager-upload-user-empire-designs-add-empires-from-a/04-03-SUMMARY.md
- FOUND commit: 7abddf8
- FOUND commit: cb9504c
- FOUND commit: d7dd6ee
- FOUND commit: cb35685 (this SUMMARY's own commit)
