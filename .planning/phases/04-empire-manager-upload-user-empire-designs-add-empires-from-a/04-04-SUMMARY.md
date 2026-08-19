---
phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a
plan: 04
subsystem: data
tags: [stellaris-save-parsing, jomini, design-extraction, empire-manager, vitest]

# Dependency graph
requires:
  - phase: 04-01 (Wave 1)
    provides: designSchema.ts (DesignEntry/LocName contract, parseLocName normalizer)
provides:
  - "extractDesignFromCountry(root, countryId, opts) — maps a parsed save's country/species_db/leaders/planets/galactic_object tables to a complete DesignEntry"
  - "SavedEmpire.design: DesignEntry | null, populated for every empire loadEmpiresFromSav already emits"
  - "designFromSav.test.ts — 17 fixture-driven tests covering both ruler paths, the planet_class guard, and every documented field default"
affects: [04-06 (designs-file writer/serializer consumes SavedEmpire.design), 04-07 (add-to-my-empires UI action)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling-extractor module pattern: designFromSav.ts re-declares toArr/isObj locally instead of importing savLoad.ts, avoiding an import cycle since savLoad.ts imports designFromSav.ts"
    - "Two-branch resolver-with-fallback: every save-tree field read goes through an isObj/typeof guard with an explicit safe default, never a bare `as` cast"

key-files:
  created:
    - app/src/lib/empire/designFromSav.ts
    - app/src/test/designFromSav.test.ts
  modified:
    - app/src/lib/empire/savLoad.ts

key-decisions:
  - "planet_class candidate order is founder species' home_planet first, country.capital second — matches the plan's explicit preference order and the measured pc_b_star capital case"
  - "Ruler resolution never returns null: a missing leaders[id] entry yields a full default ruler block (gender not_set, portrait from the founder species, empty trait) rather than throwing or returning a partial object"
  - "secondary_species left unpopulated with an in-source comment (RESEARCH.md Open Question 1 / 04-CONTEXT.md Deferred Ideas) — designSchema.ts already keeps the field optional so no schema change is needed later"

patterns-established:
  - "designFromSav.ts's private resolvers (resolveSpecies/resolveRuler/resolvePlanetClass/resolveCapitalNames/resolveFlag) are the template for any future save-field extractor: isObj/toArr guard, explicit fallback, single exported entry point"

requirements-completed: [D-06, D-07]

# Metrics
duration: ~30min
completed: 2026-08-19
---

# Phase 4 Plan 04: Save-to-Design Extraction Summary

**`extractDesignFromCountry` maps a parsed .sav's country/species_db/leaders/planets tables to a complete, game-loadable `DesignEntry`, wired into `SavedEmpire.design` for every empire the existing loader emits, with 17 fixture-driven tests covering both ruler paths and the planet-class star-capital guard.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-08-19 (worktree base corrected to 520719b before execution)
- **Completed:** 2026-08-19T03:48:23Z
- **Tasks:** 2/2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `designFromSav.ts` maps every D-07 field: government/authority/civics/origin (lifted from the save's nested `government` block), species (renamed `name`/`plural`/`adjective` → `species_name`/`species_plural`/`species_adjective`, `traits.trait[]` unwrapped to `traits[]`), ruler (design-snapshot-verbatim vs. synthesized-from-leader-fields branches), `planet_class` (habitable allowlist guarding the measured `pc_b_star` capital case), `empire_flag`, `planet_name`/`system_name` (resolved via the capital's system), and every documented safe default (`room`, `ship_prefix`, `is_nomadic`, `initializer`, spawn flags).
- `SavedEmpire` gains `design: DesignEntry | null`, populated inside the existing country loop in `savLoad.ts` without restructuring the loop or altering `SavLoadResult`.
- 17 tests in `designFromSav.test.ts` exercise every behavior bullet from the plan, including the `subclass_*`-vs-`leader_trait_*` ruler-trait selection, the missing-leader-entirely case (never throws), both planet_class branches (habitable home_planet preferred / `pc_continental` fallback), and the `("advisor_voice_type" in design) === false` key-absence assertion.
- Confirmed no import cycle: `npm run build` succeeds and `savLoad.ts` (which now pulls in `designFromSav.ts` + `designSchema.ts`) still bundles as its own lazy-loaded chunk (`savLoad-*.js`, 247.90 kB), separate from the main bundle.

## Task Commits

Each task was committed atomically:

1. **Task 1: extractDesignFromCountry — save tables to DesignEntry** - `47aaf5a` (feat)
2. **Task 2: Attach design payloads to SavedEmpire and cover the mapping with fixtures** - `e754ee4` (feat)

_Note: see TDD Gate Compliance below — this plan's task split (implementation in Task 1, wiring + tests in Task 2) does not produce a standalone `test(...)` commit preceding the `feat(...)` commit._

## Files Created/Modified
- `app/src/lib/empire/designFromSav.ts` - `extractDesignFromCountry` and its private resolvers (species/ruler/planet_class/capital-names/flag); re-declares `toArr`/`isObj` locally to avoid an import cycle with `savLoad.ts`
- `app/src/lib/empire/savLoad.ts` - `SavedEmpire.design: DesignEntry | null` added to the interface; the country loop now calls `extractDesignFromCountry` before pushing each empire
- `app/src/test/designFromSav.test.ts` - 17 fixture-object tests (one shared factory + per-test overrides, matching `empire-classify.test.ts`'s style)

## Decisions Made
- `planet_class` candidate order: founder species' `home_planet` first, `country.capital` second — this is what the plan's behavior block requires ("a habitable class from the founder species' home_planet is preferred") and what the tests assert.
- Ruler resolution is designed to never throw and never return a partial object across all three cases (design snapshot present / leader present without design / leader id not found in `leaders` at all) — verified by an explicit `expect(() => ...).not.toThrow()` assertion in the missing-leader test.
- `secondary_species` is intentionally left unpopulated, matching the plan's explicit instruction and the phase's already-accepted v1 limitation (04-CONTEXT.md Deferred Ideas) — `designSchema.ts`'s optional field means this can be filled in later without a schema change.

## Deviations from Plan

None — plan executed exactly as written. One environment-setup step not itself part of either task was required to get the full test suite green: `app/node_modules` was absent in the fresh worktree (per the environment note, `npm install` was run first), and `app/public/data/v4.5.0/tech.json` was absent until `node scripts/copy-data.mjs` was run — both are pre-existing environment-bootstrap requirements called out in the orchestrator's `<environment_note>`, not code changes, and neither touches anything under `C:\Users\alexy\Documents`.

## TDD Gate Compliance

Both tasks are marked `tdd="true"`, but the plan's own task split does not produce a strict RED-then-GREEN commit pair: Task 1's `<action>` is implementation-only (no test-writing step, `<verify>` is `tsc --noEmit` only) and Task 2's `<action>` bundles the `SavedEmpire.design` wiring together with the full fixture-test file in one logical change. Both task commits are typed `feat`, not `test` → `feat`. This follows the plan's explicit task boundaries as written (not a deviation from PLAN.md), but is recorded here per the generic TDD gate-sequence check since no standalone `test(...)` commit precedes either `feat(...)` commit in `git log`.

## Issues Encountered
None beyond the environment-bootstrap steps noted above (both anticipated by the orchestrator's environment note).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `SavedEmpire.design` is now populated for every empire a loaded `.sav` produces (player or AI), satisfying D-06/D-07 — ready for 04-06's designs-file serializer to consume and for 04-07's "add to my empires" UI action to stage.
- No blockers. `secondary_species` remains unpopulated by design (documented, optional field) — a future plan can add it without touching this module's public signature.

## Self-Check: PASSED

- FOUND: app/src/lib/empire/designFromSav.ts
- FOUND: app/src/test/designFromSav.test.ts
- FOUND: app/src/lib/empire/savLoad.ts
- FOUND: 47aaf5a (Task 1 commit)
- FOUND: e754ee4 (Task 2 commit)

---
*Phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a*
*Completed: 2026-08-19*
