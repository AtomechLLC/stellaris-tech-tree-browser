---
phase: 01-data-pipeline
plan: 02
subsystem: data-pipeline
tags: [jomini, clausewitz-parser, typescript, vitest, dag, dlc-classification]

# Dependency graph
requires:
  - phase: 01-data-pipeline
    plan: 01
    provides: "parseClausewitzFile/normalizeToArray, loadScriptedVariables/resolveValue, TechSnapshotSchema/Tech contract, resolveConfig"
provides:
  - "extractAllTechs(gameRoot, varMap) — full 33-file corpus extraction yielding 678 real tech_* records"
  - "Each Tech's own raw unlock content (unlockContentRaw: featureFlags/prereqforDesc/grantsModifiers/gateway) captured for Plan 05's localisation join (D-05 component a)"
  - "loadDlcRegistry(gameRoot) / classifyDlc(tech, sourceFilename, registry) — authoritative DLC gating classification (D-08)"
  - "buildAndValidateGraph(techs) — prerequisite DAG validation (dangling-ref + cycle fail-loud) and computed reverse edges (unlocks.leadsTo, D-05 component b)"
affects: ["01-03", "01-04", "01-05"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lastScalarIfDuplicated() — resolves jomini's duplicate-top-level-scalar-key array artifact (e.g. a tech that genuinely repeats `weight = 0` then `weight = @var`) by taking the LAST value, matching Clausewitz override-on-redeclaration semantics"
    - "flattenPrerequisites() — recursively flattens prerequisites regardless of jomini's shape (plain array, {OR:[...]} object, or the positional-interleaved array artifact produced when bare scalar keys mix with a named OR sub-block at the same level) rather than assuming a single fixed shape"
    - "Normalized-token filename<->DLC-display-name matching (dlc-classifier.ts) instead of a hand-typed lookup table — filenames and registry names are tokenized (lowercase, alphanumeric-split, stopwords removed) and matched by subset containment"
    - "Extractor-only fields (unlockContentRaw, sourceFile, potentialRaw) live on an ExtractedTech interface that extends the frozen Tech schema type, keeping the Zod contract itself unmodified while carrying raw material forward to Plan 05"

key-files:
  created:
    - "pipeline/src/parser/tech-extractor.ts"
    - "pipeline/src/dlc/dlc-registry.ts"
    - "pipeline/src/dlc/dlc-classifier.ts"
    - "pipeline/src/graph/build-dag.ts"
    - "pipeline/test/tech-extractor.test.ts"
  modified: []

key-decisions:
  - "cost/weight defensive block-form handling derives the numeric fallback from `factor` when present, else 0 (Open Question 1) — confirmed in this plan that the block form is NOT observed for cost/weight themselves in the real 678-tech corpus (all bare number/@variable), so this remains defensive-only code, not exercised by real data"
  - "DLC filename-to-display-name matching uses normalized-token subset containment (not a 1:1 hand-typed table) — verified across the full 31-entry DLC registry and all 33 tech files with a sensible per-DLC breakdown and zero false positives on manual spot-check"
  - "OR-block prerequisite alternatives (verified real cases: tech_titans, tech_juggernaut, tech_growth_chamber_1/2, tech_mega_engineering, tech_arkship_tier_2/3) are flattened into the prerequisites list as real graph edges rather than modeling AND/OR semantics in the schema — matches the frozen `prerequisites: string[]` shape and is sufficient for D-16 dangling-ref/cycle validation and D-05 leadsTo reverse-edge computation"

patterns-established:
  - "Real-corpus verification before locking in extraction logic — every field-shape assumption (weight duplication, prerequisites OR-blocks, DLC filename conventions) was checked against the actual 33-file install via throwaway debug scripts before writing the final extractor, not assumed from the plan's interface notes alone"

requirements-completed: [DATA-01, DATA-02]

# Metrics
duration: 45min
completed: 2026-07-07
---

# Phase 1 Plan 2: Full Extraction, DLC Classification, Prerequisite Graph Summary

**Widens the walking skeleton to the full 678-tech corpus across all 33 files, capturing each tech's own raw unlock content for the D-05 grants join, classifying every tech's gating DLC from authoritative `.dlc` metadata plus `host_has_dlc` overrides, and validating the prerequisite graph as an acyclic DAG with computed reverse edges.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-07-07 (session continuation from Plan 01)
- **Completed:** 2026-07-07T23:55:52Z
- **Tasks:** 3
- **Files modified:** 5 created (tech-extractor.ts, dlc-registry.ts, dlc-classifier.ts, build-dag.ts, tech-extractor.test.ts)

## Accomplishments

- `extractAllTechs` parses all 33 real `common/technology/*.txt` files into exactly 678 `tech_*` records (matching RESEARCH.md's direct corpus count precisely), with `000_documentation.txt` correctly contributing zero
- Discovered and fixed two real-corpus jomini quirks NOT flagged in RESEARCH.md's Pitfalls list: (1) genuine duplicate top-level `weight` keys (`tech_orbital_arc_furnace`, `tech_dyson_swarm`, `tech_dyson_gun`) parse to a positional array under jomini's auto-arraying, requiring last-value-wins resolution; (2) `prerequisites` blocks mixing bare scalar keys with a named `OR = {...}` sub-block (`tech_growth_chamber_1/2`, `tech_titans`, `tech_juggernaut`, `tech_mega_engineering`, `tech_arkship_tier_2/3`, and 12 more) produce a positional-interleaved array artifact, not a clean object or array — both required a recursive/defensive flattening approach verified against the actual corpus, not just the plan's interface notes
- Each tech's own raw unlock content (feature_flags, prereqfor_desc loc-keys, top-level modifier grants, gateway) is captured into `unlockContentRaw`, verified against `tech_space_exploration` (featureFlags + prereqfor_desc title) and `tech_eco_simulation` (gateway="zone" + grantsModifiers, with weight_modifier's nested modifiers correctly excluded)
- DLC classification via `loadDlcRegistry` (31 `.dlc` files parsed) + normalized-token filename matching + `host_has_dlc` override produces a full, sensible breakdown across all 678 techs (455 base-game, 17 distinct DLC tags) with both known cross-DLC cases (`tech_titans` -> Apocalypse, `tech_juggernaut` -> Federations) classifying correctly
- `buildAndValidateGraph` validates the real 678-tech prerequisite graph as acyclic with zero dangling references, and computes sorted reverse edges (`unlocks.leadsTo`) for all 678 techs

## Task Commits

Each task was committed atomically:

1. **Task 1: Full tech extractor across all 33 files (fields + raw unlock content)** - `0a21b58` (feat)
2. **Task 2: DLC registry + per-tech DLC classification** - `fa3e0db` (feat)
3. **Task 3: Prerequisite DAG validation + reverse edges (unlocks.leadsTo)** - `663da1b` (feat)

_Tests and implementation were written together per task and verified against the real corpus before each commit (all 15 new tests passing at each task boundary), rather than separate RED/GREEN commits — see TDD Gate Compliance below._

## Files Created/Modified

- `pipeline/src/parser/tech-extractor.ts` - `extractAllTechs`/`extractTech`/`listTechFiles`; full-corpus extraction with resolved cost/weight, preserved weightModifierRaw, flattened prerequisites, all four flags, and D-05a raw unlock content capture
- `pipeline/src/dlc/dlc-registry.ts` - `loadDlcRegistry`; parses all 31 `dlc/dlc0XX_*/dlc0XX.dlc` files into an authoritative folder->display-name map
- `pipeline/src/dlc/dlc-classifier.ts` - `classifyDlc`; normalized-token filename matching + recursive `host_has_dlc` trigger scan with override semantics
- `pipeline/src/graph/build-dag.ts` - `buildAndValidateGraph`; dangling-ref + cycle validation (DFS), computes sorted reverse edges
- `pipeline/test/tech-extractor.test.ts` - 15 tests covering all three tasks' behaviors against the real 678-tech corpus (per D-18: no sampling/mocking)

## Decisions Made

- Resolved jomini's duplicate-scalar-key array artifact (`weight` repeated at top level) by taking the LAST value, matching Clausewitz/Paradox's real "later assignment overrides earlier" scripting semantics — not documented in RESEARCH.md's Pitfalls, discovered via direct corpus verification during Task 1.
- Flattened OR-block prerequisite alternatives into the prerequisites list as real graph edges (any-one-satisfies is a genuine prerequisite relationship for DAG/dangling-ref/leadsTo purposes) rather than introducing new schema shape — keeps `prerequisites: string[]` frozen-schema-compatible while still correctly resolving all real dependency edges.
- DLC filename-to-display-name matching uses normalized-token subset containment instead of a hand-typed table, satisfying both D-08's "authoritative, maintained mapping" intent and the acceptance criterion "no hand-typed DLC display-name table exists in the source" (confirmed via grep — no display-name strings appear outside comments).
- `ExtractedTech` (extractor-only type) extends the frozen `Tech` Zod schema type with `unlockContentRaw`, `sourceFile`, and `potentialRaw` — these are consumed downstream (Plan 05 assembly, DLC classification) without touching the frozen snapshot contract itself.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] jomini's duplicate top-level `weight` key produces an unhandled array shape for 3 real techs**
- **Found during:** Task 1 verification (running tests against the real corpus)
- **Issue:** `resolveValue` threw `"unresolvable value [0,\"@tier2weight3\"]"` for `tech_orbital_arc_furnace`, `tech_dyson_swarm`, and `tech_dyson_gun` — each genuinely repeats `weight = 0` then later `weight = @tier2weight3` in the source file, which jomini auto-arrays like any duplicate key, but the walking skeleton's cost/weight extraction only handled bare-scalar or block-object shapes, not a duplicate-scalar array.
- **Fix:** Added `lastScalarIfDuplicated()`, applied before the existing object/scalar branching for both `cost` and `weight`, returning the last non-object array entry (matching Clausewitz's later-assignment-wins semantics) rather than throwing.
- **Files modified:** pipeline/src/parser/tech-extractor.ts
- **Verification:** Re-ran the full test suite — all previously-failing tests passed; confirmed via a corpus-wide sanity script that zero techs have unresolved (non-numeric) cost/weight across all 678 records.
- **Committed in:** 0a21b58 (Task 1 commit)

**2. [Rule 1 - Bug] jomini's mixed bare-key/named-OR-block `prerequisites` shape crashed graph validation with false "dangling prerequisite" errors**
- **Found during:** Task 3 verification (running `buildAndValidateGraph` against the real corpus)
- **Issue:** The plan's interface notes described `prerequisites` as a simple array of quoted keys, normalized via `normalizeToArray`. Against the real corpus, `tech_growth_chamber_1`'s `prerequisites` block mixes a bare scalar key (`tech_stingers`) with a named `OR = { ... }` sub-block, which jomini parses into a positional-interleaved array (`["tech_stingers", null, "OR", null, [...]]`) rather than a clean array or object — the naive `normalizeToArray` + string-filter approach silently produced `"OR"` as a bogus "prerequisite key," which then failed dangling-ref validation (no tech is literally named `"OR"`).
- **Fix:** Replaced the flat-array assumption with `flattenPrerequisites()`, a recursive walker that handles all three observed real-corpus shapes (plain array, `{OR: [...]}` object, and the positional-interleaved artifact) and treats OR-alternative keys as real prerequisite edges while filtering out the structural `"OR"`/`"remainder"` marker strings.
- **Files modified:** pipeline/src/parser/tech-extractor.ts
- **Verification:** `buildAndValidateGraph` now completes over the full real corpus without throwing; spot-checked `tech_titans` (`{OR:[...]}` object form) and `tech_growth_chamber_1` (positional-interleaved form) both resolve to their correct prerequisite tech keys with no `"OR"` leakage.
- **Committed in:** 663da1b (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs found via real-corpus verification, before each task's commit)
**Impact on plan:** Both fixes were necessary for the plan's own explicit acceptance criteria (670+ techs with all resolved, DAG validates without throwing) to pass against the FULL real corpus per D-18. No scope creep — no new files beyond the plan's own file list, no architectural changes.

## Issues Encountered

- RESEARCH.md's Pitfalls documented jomini's duplicate-key auto-arraying for block fields (`weight_modifier.modifier`, `technology_swap`) but did not flag that the SAME behavior also applies to a tech's own top-level scalar fields when genuinely duplicated in source (`weight` appearing twice) — resolved via direct corpus verification (see Deviation 1).
- RESEARCH.md's interface notes described `prerequisites` as a simple quoted-key array but did not document the `OR`-alternative block pattern found in 19 real techs across the corpus — resolved via direct corpus verification (see Deviation 2). This pattern is more widespread than the two Pitfall-4-style "known enumerable" cases (host_has_dlc) — it appears in base-game ship-hull-upgrade techs (titans, juggernaut) and biogenesis growth-chamber techs, not just DLC-gated content.

## User Setup Required

None - no external service configuration required. All work operates against the already-configured local Stellaris install; no new dependencies were added in this plan (RESEARCH.md confirmed all needed packages were already installed in Plan 01).

## TDD Gate Compliance

This plan's tasks are marked `tdd="true"`, but execution combined test-writing and implementation before the first commit for each task (rather than a strict separate RED-then-GREEN commit pair) — all tests were written against the intended behavior first, verified failing against an incomplete/naive implementation during real-corpus testing (see Deviations above, which were caught exactly this way), then fixed and verified passing before each task's single `feat` commit. No separate `test(...)` RED commits exist in git log for this plan's three tasks; each task has one `feat(01-02)` commit containing both the test file additions and the implementation. This satisfies the plan's behavioral acceptance criteria (verified via the exact `-t extractor`/`-t dlc`/`-t graph` grep commands specified in each task's `<verify>` block, all passing) but does not follow the strict git-log RED/GREEN gate sequence described in the TDD workflow reference.

## Next Phase Readiness

- `extractAllTechs`, `loadDlcRegistry`, `classifyDlc`, and `buildAndValidateGraph` are all directly importable and ready for Plan 05's `assemble.ts` to compose into the full snapshot (replacing the walking skeleton's single-file, DLC-null, empty-unlocks placeholder logic).
- Each tech's `unlockContentRaw` (feature_flags, prereqfor_desc loc-keys, grantsModifiers, gateway) is ready for Plan 05 to join with Plan 03's localisation map into `unlocks.grants`; the graph builder's per-tech `leadsTo` list is ready to fill `unlocks.leadsTo` directly.
- No blockers. One open item for Plan 05's attention: this plan's DLC classifier and graph builder are standalone modules not yet wired into `assemble.ts`'s orchestration — Plan 05 (or a later integration pass) must call `extractAllTechs`/`classifyDlc`/`buildAndValidateGraph` from the orchestrator to replace the walking skeleton's single-file placeholder logic, per the TODOs already left in `assemble.ts` from Plan 01.

---
*Phase: 01-data-pipeline*
*Completed: 2026-07-07*

## Self-Check: PASSED

All 5 created source/test files verified present on disk. All 4 referenced commit hashes (0a21b58, fa3e0db, 663da1b, 28036d9) verified present in `git log --oneline --all`.
