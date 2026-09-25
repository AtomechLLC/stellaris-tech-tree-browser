---
phase: quick-260924-vbv
plan: 01
subsystem: data-pipeline
tags: [jomini, clausewitz, imagemagick, sharp, icons, vitest]

# Dependency graph
requires:
  - phase: quick-260924-qfo
    provides: v4.5.1 tech-tree data snapshot (tech.json + partial icons dir)
provides:
  - resolveGovIconSources(gameRoot) — pure resolver for civic/origin/authority icon source paths
  - Complete, byte-parity v4.5.1 icons/ snapshot (1373 files, matching v4.5.0)
  - Unconditional placeholder-icon.webp emission every build
affects: [empire-manager, saved-empire, data-pipeline-future-version-bumps]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gov icon resolution split into its own pure module (gov-icons.ts) returning Map<id, absPath>, keeping assemble.ts as a thin orchestrator that only converts"
    - "Existence-driven icon resolution for swap ids (no need to special-case inherit_icon since a conventional file either exists or doesn't)"

key-files:
  created:
    - pipeline/src/icons/gov-icons.ts
    - pipeline/test/gov-icons.test.ts
  modified:
    - pipeline/src/assemble.ts
    - pipeline/data/v4.5.1/icons/ (104 files added)

key-decisions:
  - "Corrected 260924-qfo's SUMMARY wording: the 104 missing files break down as 71 auth-swap + 20 civic + 12 origin + 1 placeholder, not '104 authority swaps'"
  - "Placeholder icon now copied unconditionally at build start (not lazily on first fallback) so every snapshot's icons dir has the same shape and future icon-count diffs between versions stay meaningful"
  - "Gov icon resolution kept existence-driven rather than consulting inherit_icon, matching the game's own swap-icon lookup comment"

patterns-established:
  - "Pure resolver + orchestrator split for future icon-source extensions: resolveXIconSources(gameRoot) -> Map<id, absPath>, assemble.ts only loops and converts"

requirements-completed: [DATA-04, DATA-05]

# Metrics
duration: 20min
completed: 2026-09-25
---

# Quick Task 260924-vbv: Restore Missing Gov/Authority Icons in v4.5.1 Summary

**Restored all 104 missing civic/origin/authority icons in the v4.5.1 data snapshot by adapting extraction to v4.5.1's nested `advanced_authority_swap` sub-blocks and adding a legacy conventional-art scan for defs v4.5.1 deleted outright — v4.5.1/icons/ is now byte-identical to v4.5.0/icons/ (1373/1373 files).**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-25
- **Tasks:** 3/3 completed
- **Files modified:** 106 (2 source/test files created, 1 source file modified, 104 data files added, tech.json's `generatedAt` was regenerated then restored to HEAD both times)

## Accomplishments
- Built `resolveGovIconSources(gameRoot)`, a pure resolver covering the v4.5.1 def pass (declared `icon=` wins, else conventional `<id>.dds`), nested swap sub-blocks (`advanced_authority_swap` array/single-object forms, `swap_type`), and a legacy conventional-art scan for defs v4.5.1 deleted (civics, authorities, and the plural `origins_` -> singular `origin_` remap)
- Rewired `assemble.ts` to consume the resolver and made placeholder-icon emission unconditional every build
- Regenerated `pipeline/data/v4.5.1/icons/` from scratch and proved byte-for-byte parity with `v4.5.0/icons/`: 1373 files each, 0 missing, 0 extra, 0 byte differences
- Full pipeline suite (72 tests, 9 files) and app suite (199 passed / 7 skipped, baseline) both green; app tsc clean

## Task Commits

Each task was committed atomically (TDD for Task 1):

1. **Task 1: Build resolveGovIconSources with fixture tests**
   - `db87332` - `test(pipeline): add failing gov-icon resolver tests for v4.5.1 swap/legacy ids` (RED)
   - `00227f9` - `feat(pipeline): resolve gov icons from authority swap sub-blocks and legacy conventional art` (GREEN)
2. **Task 2: Wire resolver into assemble.ts, regenerate icons, prove parity**
   - `71a2109` - `fix(pipeline): extract v4.5.1 authority-swap and legacy civic/origin icons; always emit placeholder`
3. **Task 3: Full suites + commit restored icons**
   - `ec6a797` - `chore(pipeline): restore 104 missing gov/authority icons in v4.5.1 snapshot (1373 files, byte-parity with v4.5.0)`

**Plan metadata:** committed separately by the orchestrator (not by this executor, per plan instructions).

## Files Created/Modified
- `pipeline/src/icons/gov-icons.ts` - New pure resolver: def pass (civics/authorities dirs, declared-icon-wins, conventional fallback) + nested swap sub-block pass (`advanced_authority_swap`, `swap_type`) + legacy conventional-art scan (civics/authorities/origins), all SAFE_NAME-guarded and size-variant (`_NxN`) excluded
- `pipeline/test/gov-icons.test.ts` - Fixture-tree tests (exact 13-entry map, exclusions, declared-icon precedence) plus a version-agnostic real-install regression guard over `advanced_authority_swap`
- `pipeline/src/assemble.ts` - Gov-icon def pass replaced with a loop over `resolveGovIconSources(gameRoot)`; placeholder copy moved earlier and made unconditional; removed now-unused `existsSync`/`parseClausewitzFile` imports and the `isPlain`/`govDefSources`/`govDone` helpers (moved into gov-icons.ts)
- `pipeline/data/v4.5.1/icons/` - 104 new files: 71 `_auth_*`, 20 `_civic_*`, 12 `_origin_*`, `placeholder-icon.webp`

## Decisions Made
- Placeholder icon emission changed from lazy (copied on first tech-icon fallback) to unconditional (copied once at build start, before any conversion). Every build's icons dir now has the same baseline shape regardless of whether any tech falls back to the placeholder, keeping future icon-count diffs between snapshot versions meaningful measurements rather than an artifact of whether a fallback happened to fire.
- Resolution for authority swaps stays existence-driven (a swap name resolves iff its conventional `<name>.dds` file exists) rather than branching on `inherit_icon`, matching the game's own header comment on `advanced_authority_swap.name`. This naturally and correctly excludes `inherit_icon = yes` swaps, which have no art of their own, without a separate check.
- Corrected the data-breakdown language carried over from 260924-qfo's SUMMARY ("104 authority swaps") to the accurate breakdown of 71 auth-swap + 20 civic + 12 origin + 1 placeholder = 104.

## Deviations from Plan

None - plan executed exactly as written. All STOP-policy conditions (test failure, parity mismatch, tech.json drift beyond `generatedAt`, `[assemble]` warnings, modification to v4.5.0/v4.4.6) were checked at each gate and none tripped.

## Issues Encountered

None. One pre-existing tsc error set unrelated to this plan's files was observed and left untouched per the plan's instruction and the scope-boundary rule:
- `src/parser/tech-extractor.ts(317,3)`: `ExtractedTech` missing `gate`/`source`/`archetypeIcons` properties in one object literal
- `test/event-grants.test.ts` (6 call sites): `RawGrant.mech` typed as `string` vs. the narrower `GrantMechanism` union

Neither error mentions `gov-icons.ts`, `gov-icons.test.ts`, or `assemble.ts` (confirmed via the plan's grep-count verification, which returned 0), and both predate this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `pipeline/data/v4.5.1/icons/` now ships the complete 1373-file set the app's Saved Empire and Empire Manager views expect; no more blank civic/origin/authority icons for v4.5.1 users
- `resolveGovIconSources` is version-agnostic (driven by whatever defs/art the installed game ships) and covered by a real-install regression guard, so it should continue to resolve correctly across future Stellaris patches without further changes
- No blockers for subsequent Phase 4 (Empire Manager) work

---
*Quick task: 260924-vbv*
*Completed: 2026-09-25*

## Self-Check: PASSED

- FOUND: pipeline/src/icons/gov-icons.ts
- FOUND: pipeline/test/gov-icons.test.ts
- FOUND: pipeline/data/v4.5.1/icons/_auth_bio_corporate_cloning.webp
- FOUND: pipeline/data/v4.5.1/icons/_origin_clones.webp
- FOUND: pipeline/data/v4.5.1/icons/placeholder-icon.webp
- FOUND: db87332 (RED test commit)
- FOUND: 00227f9 (GREEN resolver commit)
- FOUND: 71a2109 (assemble.ts fix commit)
- FOUND: ec6a797 (restored icons commit)
