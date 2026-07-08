---
phase: 01-data-pipeline
plan: 05
subsystem: data-pipeline
tags: [jomini, zod, vitest, typescript, sharp, imagemagick, clausewitz-parser]

# Dependency graph
requires:
  - phase: 01-data-pipeline
    plan: 01
    provides: "pipeline scaffold, resolveConfig, TechSnapshotSchema, walking-skeleton assemble.ts"
  - phase: 01-data-pipeline
    plan: 02
    provides: "extractAllTechs (33-file corpus + unlockContentRaw), classifyDlc, buildAndValidateGraph (leadsTo edges)"
  - phase: 01-data-pipeline
    plan: 03
    provides: "scanAllLocalisation, resolveTechText"
  - phase: 01-data-pipeline
    plan: 04
    provides: "resolveIconSource, convertDdsToWebp, writePlaceholderIcon, placeholder-icon.webp"
provides:
  - "buildUnlocks(unlockContentRaw, locMap, leadsTo) — joins a tech's own raw grant content with localisation into unlocks.grants (plain text, sorted), passes through unlocks.leadsTo"
  - "buildReport/printReport — the D-17 validation report (area/tier/DLC counts, unresolved refs, missing icon/localisation, unlocks coverage, cross-DLC sanity checks)"
  - "pipeline/SCHEMA.md — the documented tech.json contract for Phase 2"
  - "assemble.ts — full orchestrator composing all pipeline stages into the validated data/v4.5.0/tech.json + icons/*.webp snapshot"
  - "data/v4.5.0/tech.json + data/v4.5.0/icons/*.webp — the phase's shipped deliverable, 678 real techs"
  - "pipeline/test/corpus.test.ts — the D-18 full-corpus integration test (coverage + idempotency)"
affects: ["phase-02-tech-tree-visualization"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ExtractedTech carries iconOverrideRaw/technologySwapRaw (extractor-only, additive to the frozen Tech schema) alongside potentialRaw/unlockContentRaw/sourceFile — the same 'raw material captured at extraction, joined at assembly' pattern established in Plan 02"
    - "unlocks.grants built by resolve-or-verbatim: a loc-key/token resolves to display text if a localisation entry exists, else ships as the raw token itself (plain text, never HTML) with the fallback counted for the D-17 report"
    - "Full-corpus integration tests (D-18) live in a dedicated corpus.test.ts with per-test timeout overrides, kept separate from fast per-module unit-test files so unit suites stay fast and don't race on shared full-pipeline output paths (icons dir, tech.json)"

key-files:
  created:
    - "pipeline/src/unlocks.ts"
    - "pipeline/src/report.ts"
    - "pipeline/SCHEMA.md"
    - "pipeline/test/corpus.test.ts"
  modified:
    - "pipeline/src/assemble.ts"
    - "pipeline/src/parser/tech-extractor.ts"
    - "pipeline/test/skeleton.test.ts"

key-decisions:
  - "unlocks.grants sources four content types from unlockContentRaw (feature_flags tokens, prereqfor_desc title/desc pairs, top-level modifier stat key/value pairs, gateway) and resolves each independently via locMap, rather than concatenating all raw content into one blob string per tech — keeps each grant as its own list entry for cleaner Phase 2 rendering"
  - "assemble.ts's per-tech strict-fail-on-missing-name check collects ALL offending tech keys across the full corpus before throwing (not fail-fast on the first missing name) so a single pipeline run's error message reports the complete list, per Plan 03's guidance that Plan 05 owns this policy in one pass"
  - "Corpus test Test 2 (idempotency) runs the real full assembler twice in the same test file/process rather than shelling out to two separate `npm run build:data` invocations, keeping the proof self-contained in vitest and avoiding a shell-invocation dependency in the test itself"

patterns-established:
  - "Full-corpus (D-18) integration tests are isolated in their own test file with explicit long timeouts, never sharing an assemble() invocation's output-directory race window with per-module unit test files"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04, DATA-05]

# Metrics
duration: 17min
completed: 2026-07-08
---

# Phase 1 Plan 5: Full Assembler, Unlocks, Validation Report, Schema Summary

**Single `npm run build:data` command now produces the complete, schema-validated `data/v4.5.0/tech.json` (678 real techs) plus 803 per-tech/swap WebP icons, with both `unlocks.grants` (tech's own localised grant text) and `unlocks.leadsTo` (reverse prerequisite edges) fully populated, a D-17 validation report, and a documented `SCHEMA.md` contract for Phase 2.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-08T00:21:08Z
- **Completed:** 2026-07-08T00:38:13Z
- **Tasks:** 3
- **Files modified:** 4 created (unlocks.ts, report.ts, SCHEMA.md, corpus.test.ts), 3 modified (assemble.ts, tech-extractor.ts, skeleton.test.ts)

## Accomplishments

- `buildUnlocks` fully delivers D-05's tech's-own-grants component: verified on the real corpus that `tech_space_exploration` resolves `unlocks.grants` to 3 human-readable strings (an unlocks_auto_research feature flag, a resolved prereqfor_desc title, and a fully-resolved Science Ship description) joined against real localisation, not just empty placeholders
- Full pipeline (`npm run build:data`) runs end-to-end against the real 4.5.0 install: 678/678 tech_* keys extracted and parsed (zero swap-leakage), 0 dangling prerequisites, 0 unresolved `@scripted_variable` references, 0 missing names, 0 missing descriptions, 0 missing icon references
- 360 of 678 techs have non-empty `unlocks.grants` and 315 have non-empty `unlocks.leadsTo`; both known cross-DLC `host_has_dlc` cases (`tech_titans` -> Apocalypse, `tech_juggernaut` -> Federations) verified correct in the printed report
- Idempotency proven for real: `corpus.test.ts` Test 2 runs the full assembler twice back-to-back and asserts byte-identical `tech.json` (after normalizing the volatile `meta.generatedAt` timestamp) — the direct countermeasure to the reference tool's manual-pipeline failure mode (D-14/DATA-05)
- Discovered and fixed a real Rule 1 bug during Task 2 verification: the extractor never captured a tech's own `icon =` override or `technology_swap` block, so 5 real techs (including `tech_archeology_lab_ancrel`, which RESEARCH.md specifically documented as the override test case) silently fell back to the placeholder icon instead of resolving their real one — fixed and re-verified against the full corpus (0 placeholder fallbacks remaining, down from 5)

## Task Commits

Each task was committed atomically:

1. **Task 1: Unlocks builder + validation report module + schema documentation** - `babdec9` (feat)
2. **Task 2: Full assembler — compose all stages into the validated snapshot** - `bf170af` (feat)
3. **Task 3: Full-corpus idempotency + coverage verification** - `577aa1e` (test)

_No separate RED/GREEN commit pairs — these tasks are `type="auto"` (not `tdd="true"`), matching the plan's own task typing._

## Files Created/Modified

- `pipeline/src/unlocks.ts` - `buildUnlocks(unlockContentRaw, locMap, leadsTo)`: joins feature_flags/prereqfor_desc/modifier/gateway content with localisation into sorted `grants`, passes through sorted `leadsTo`, tallies unresolved grant loc-keys
- `pipeline/src/report.ts` - `buildReport`/`printReport`: the D-17 console validation report (tech-key-count match, unresolved-variable/dangling-prerequisite counts, missing name/description/icon counts, area/tier/DLC breakdowns, cross-DLC sanity checks, unlocks coverage)
- `pipeline/SCHEMA.md` - documents the full `tech.json` contract: `meta` block, every `Tech` field, the two-component `unlocks{grants,leadsTo}` shape, plain-text string contract, strict-fail vs warn-and-report policy, and the D-17 report contents
- `pipeline/src/assemble.ts` - rewritten from Plan 01's single-file skeleton into the full orchestrator: config -> version -> scripted vars -> DLC registry -> localisation scan -> extractAllTechs (33 files) -> buildAndValidateGraph -> per-tech classifyDlc/resolveTechText/buildUnlocks/icon resolve+convert -> sort -> full meta block -> schema validate -> write -> report
- `pipeline/src/parser/tech-extractor.ts` - added `iconOverrideRaw`/`technologySwapRaw` fields to `ExtractedTech` (Rule 1 fix, see Deviations)
- `pipeline/test/corpus.test.ts` - the D-18 full-corpus test: 5 behaviors (coverage, idempotency, localisation coverage, icon coverage, unlocks coverage) run against the real install
- `pipeline/test/skeleton.test.ts` - removed the now-stale walking-skeleton e2e `runAssemble()` test (Rule 1 fix, see Deviations); its 14 other fast unit tests (parser/scripted-variables/version/schema) are untouched and still pass

## Decisions Made

- `buildUnlocks` treats each of the four raw-content types (feature_flags, prereqfor_desc, modifier, gateway) as independent grant-string sources rather than merging them into one blob per tech, so Phase 2 can render `unlocks.grants` as a clean list of distinct statements.
- The strict-fail-on-missing-name check in `assemble.ts` collects every offending tech key across the whole corpus before throwing (rather than throwing on the first miss), giving one complete error report per failed run — consistent with Plan 03's summary explicitly deferring this exact policy decision to Plan 05.
- Icon swap-variant conversion (for `technology_swap` entries with their own `.dds`) runs in the main per-tech loop alongside the base icon, writing `<swap_name>.webp` files into the same `icons/` output directory — matching D-10's "export base icon per tech, and swap-variant icons alongside where present."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tech-extractor.ts never captured a tech's raw `icon=` override or `technology_swap` block, so 5 real techs silently used the placeholder icon instead of their real one**
- **Found during:** Task 2 verification — first full build run logged `[assemble] no icon source resolved for "tech_archeology_lab_ancrel"` (and 4 others), even though RESEARCH.md and Plan 04's own icons.test.ts document `tech_archeology_lab_ancrel` as the verified real-corpus fixture for the `icon =` override resolution path.
- **Issue:** `resolveIconSource` (Plan 04) needs a tech's raw `icon` and `technology_swap` fields to resolve overrides/swaps, but `extractTech` (Plan 02) only ever set the frozen schema's `icon: null` placeholder and never captured these two raw fields onto `ExtractedTech` — so `assemble.ts` had no way to pass them through, and every tech's icon resolution silently fell back to key-convention-only lookup.
- **Fix:** Added `iconOverrideRaw: string | null` and `technologySwapRaw: unknown` to the `ExtractedTech` interface (mirroring the existing `potentialRaw` pattern), populated them in `extractTech` from `raw.icon`/`raw.technology_swap`, and wired both through `assemble.ts`'s `resolveIconSource` call.
- **Files modified:** pipeline/src/parser/tech-extractor.ts, pipeline/src/assemble.ts
- **Verification:** Re-ran the full corpus build — the 5 "no icon source resolved" warnings dropped to 0; spot-checked `tech_archeology_lab_ancrel`'s emitted `tech_archeology_lab_ancrel.webp` exists and the report shows `Missing icon: 0` across all 678 techs. `npx tsc --noEmit` and the full `npx vitest run` suite (51 tests) both pass.
- **Committed in:** bf170af (Task 2 commit)

**2. [Rule 1 - Bug] skeleton.test.ts's leftover walking-skeleton e2e test called the now-full-pipeline `runAssemble()` and timed out / raced with corpus.test.ts**
- **Found during:** Task 3 verification — running the full `npx vitest run` suite after adding `corpus.test.ts` surfaced `skeleton.test.ts`'s original "assemble: end-to-end walking skeleton" test either racing on a shared icon temp-file path with `corpus.test.ts`'s own full build (both processes writing `icons/tech_colossus.tmp.png` concurrently) or, in isolation, timing out at vitest's default 5000ms because Task 2 rewrote `assemble.ts` from a single-fast-file skeleton into the full ~100-second, 678-tech, full-icon-conversion pipeline.
- **Issue:** The test's own premise (a fast single-file walking-skeleton run) no longer matches what `runAssemble()` does after this plan's Task 2 — it wasn't testing a smaller slice anymore, it was redundantly re-running the exact same full pipeline `corpus.test.ts` already exercises, just without an appropriate timeout or output-path isolation.
- **Fix:** Removed the stale test block and its now-unused imports (`existsSync`, `readFileSync`, `runAssemble`) from `skeleton.test.ts`, leaving a comment pointing to `corpus.test.ts` as the equivalent (and stronger) full-pipeline e2e coverage. The other 14 tests in `skeleton.test.ts` (parser/scripted-variables/version/schema unit tests, none of which call `runAssemble`) are unaffected.
- **Files modified:** pipeline/test/skeleton.test.ts
- **Verification:** `npx vitest run test/skeleton.test.ts` now passes all 14 remaining tests in under 1 second; full `npx vitest run` (all 5 files, 51 tests) passes cleanly with no timeouts or races.
- **Committed in:** 577aa1e (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs found during this plan's own verification steps, before each task's commit)
**Impact on plan:** Both fixes were necessary for the plan's own stated acceptance criteria (icon coverage/D-04, and a clean full test suite) to hold. No scope creep — no new files beyond the plan's own file list (deviation 1 only added two fields to an existing interface; deviation 2 only removed a now-redundant/broken test block), no architectural changes.

## Issues Encountered

- None beyond the two deviations above — both were caught and fixed during this plan's own verification steps before their respective task commits, per the deviation-rule protocol.

## User Setup Required

None - no external service configuration required. The full pipeline runs entirely against the already-configured local Stellaris install and already-installed tooling (jomini, sharp, ImageMagick 7.1.1) from Plans 01-04.

## Next Phase Readiness

- Phase 1 (Data Pipeline) is complete: all five DATA-01 through DATA-05 requirements are satisfied end-to-end against the real 4.5.0 install, verified by `pipeline/test/corpus.test.ts`'s full-corpus D-18 suite (5/5 passing) and a clean full `npx vitest run` (51/51 passing across all 5 test files).
- `data/v4.5.0/tech.json` (678 techs, schema-validated) and `data/v4.5.0/icons/*.webp` (803 files) are the shipped deliverable, ready for Phase 2's frontend to consume directly.
- `pipeline/SCHEMA.md` documents the full contract (including the two-component `unlocks{grants,leadsTo}` shape) so Phase 2 can build fixture data against it independently of running the pipeline.
- No blockers carried forward. One open note for Phase 2's attention: `unlocks.grants` strings may contain raw Paradox markup (`§color§!` codes, literal `\n` escape sequences, `$variable$` tokens) exactly as extracted — Phase 2 must handle safe plain-text rendering/line-break display itself, per the plain-text contract documented in SCHEMA.md and the phase's threat model (T-05-03).

---
*Phase: 01-data-pipeline*
*Completed: 2026-07-08*

## Self-Check: PASSED

All 8 created/modified files verified present on disk (pipeline/src/unlocks.ts, pipeline/src/report.ts, pipeline/SCHEMA.md, pipeline/test/corpus.test.ts, pipeline/src/assemble.ts, pipeline/src/parser/tech-extractor.ts, pipeline/test/skeleton.test.ts, .planning/phases/01-data-pipeline/01-05-SUMMARY.md). All 4 referenced commit hashes (babdec9, bf170af, 577aa1e, 683f94d) verified present in `git log --oneline --all`.
