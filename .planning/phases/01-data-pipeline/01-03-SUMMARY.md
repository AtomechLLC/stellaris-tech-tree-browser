---
phase: 01-data-pipeline
plan: 03
subsystem: data-pipeline
tags: [localisation, paradox-yml, typescript, vitest]

# Dependency graph
requires:
  - phase: 01-01
    provides: "pipeline package scaffold, resolveConfig(), TechSnapshotSchema (Tech.name/description fields)"
provides:
  - "scanAllLocalisation(locDir) — global Map<locKey,string> built from every .yml under localisation/english/"
  - "resolveTechText(techKey, map) — resolves a tech's { name, description } from the global map"
affects: ["01-05"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Localisation line regex with optional numeric index: /^\\s*([a-zA-Z0-9_.]+):(\\d*)\\s*\"((?:[^\"\\\\]|\\\\.)*)\"/ — handles both key:0 \"value\" and key: \"value\" forms"
    - "Full-directory readdirSync scan (no hardcoded filename list) for any localisation/asset directory whose file-to-content mapping is not 1:1 predictable"

key-files:
  created:
    - "pipeline/src/localisation/loc-scanner.ts"
    - "pipeline/test/localisation.test.ts"
  modified: []

key-decisions:
  - "resolveTechText returns null (not throws) for a missing name — the strict-fail policy (D-16) is deliberately left to the caller (assemble.ts, Plan 05), keeping this module a pure resolver with no fail-loud side effects of its own"
  - "Raw localisation strings (including §color§! codes and $variable$ tokens) are shipped unmodified as plain text — no HTML conversion in the pipeline, per Security Domain guidance and threat T-03-02"

patterns-established:
  - "TDD RED/GREEN commit pair for a single-task plan, verified in git log (test(01-03) then feat(01-03))"

requirements-completed: [DATA-03]

# Metrics
duration: 12min
completed: 2026-07-08
---

# Phase 1 Plan 3: Localisation Layer Summary

**Global localisation scanner (`scanAllLocalisation`) and tech text resolver (`resolveTechText`) that read every `.yml` under `localisation/english/` and resolve any tech key's English name/description, verified against the real 4.5.0 install including keys scattered outside `technology_l_english.yml` and both line-syntax forms.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-08T00:00:00Z (approx, continuing same session as 01-01/01-02)
- **Completed:** 2026-07-08T00:12:00Z
- **Tasks:** 1
- **Files modified:** 2 created (pipeline/src/localisation/loc-scanner.ts, pipeline/test/localisation.test.ts)

## Accomplishments

- Verified directly against the real install that `tech_space_exploration` resolves via `technology_l_english.yml`, `tech_executive_retreat` resolves via `megacorp_l_english.yml` (proving the full-directory scan reaches keys outside the "obvious" file), and `tech_maulers` resolves via `biogenesis_bioships_l_english.yml`
- Verified the no-index line form (`tech_fe_lab_2: "$building_fe_lab_2$"` in `fallen_empire_l_english.yml`) parses correctly with the optional-index regex
- Confirmed no hardcoded `.yml` filename list exists in the source (grep-verified per acceptance criteria) — the scanner is `readdirSync`-driven and will pick up any future DLC's localisation file automatically
- `resolveTechText` cleanly separates the strict-fail concern (missing name -> null, caller's problem) from the warn-not-fail concern (missing description -> null, expected/cosmetic)

## Task Commits

Each task was committed atomically:

1. **Task 1: Global localisation scanner (all .yml, both line forms)** - `195402b` (test/RED), `c61ca7f` (feat/GREEN)

_No REFACTOR commit was needed — the GREEN-phase implementation required no cleanup pass._

## Files Created/Modified

- `pipeline/src/localisation/loc-scanner.ts` - `scanAllLocalisation()` (full-directory .yml scan, BOM-stripping, optional-index regex) and `resolveTechText()` (name/description resolution, plain-text passthrough)
- `pipeline/test/localisation.test.ts` - 7 tests covering global map size/lookup, cross-file resolution (megacorp, biogenesis), no-index-form parsing, and resolveTechText's name/description/null-handling behavior

## Decisions Made

- Kept `resolveTechText`'s missing-name behavior as `null` rather than throwing — this module stays a pure, side-effect-free resolver; the strict-fail policy (D-16) belongs to assemble.ts (Plan 05) which has full context on all 678 techs and can report all missing names in one pass rather than failing on the first one encountered here.
- Did not attempt any §color§!/`$variable$` token processing — verified this is explicitly out of scope per RESEARCH.md's Security Domain section and the plan's threat model (T-03-02), deferred to Phase 2's rendering layer.

## Deviations from Plan

None - plan executed exactly as written. The single task's behavior, action, and acceptance criteria were implemented verbatim against the plan's verified regex and file-scan approach.

## Issues Encountered

None. All four `<behavior>` test cases passed on the first GREEN implementation attempt; the verified regex and file list from RESEARCH.md/the plan's interfaces section were accurate against the real install with no adjustments needed.

## User Setup Required

None - no external service configuration required. This task only reads local files already present in the verified Stellaris install.

## Next Phase Readiness

- `scanAllLocalisation` and `resolveTechText` are ready for Plan 05 (assemble.ts) to call once per pipeline run, joining every extracted tech's key against the global map to populate `Tech.name` and `Tech.description`.
- Plan 05 should apply D-16's strict-fail policy explicitly: iterate all 678 tech keys, collect any with `name === null`, and fail the pipeline run loudly if the list is non-empty (this plan intentionally does not enforce that policy itself, per the Decisions Made section above).
- No blockers carried forward from this plan.

---
*Phase: 01-data-pipeline*
*Completed: 2026-07-08*

## Self-Check: PASSED

All 2 created files verified present on disk (pipeline/src/localisation/loc-scanner.ts, pipeline/test/localisation.test.ts). All 3 referenced commit hashes (195402b, c61ca7f, 7b017e0) verified present in `git log --oneline --all`.
