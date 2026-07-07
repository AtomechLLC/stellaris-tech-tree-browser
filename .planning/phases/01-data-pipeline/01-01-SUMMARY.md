---
phase: 01-data-pipeline
plan: 01
subsystem: data-pipeline
tags: [jomini, zod, vitest, tsx, clausewitz-parser, typescript, node-esm]

# Dependency graph
requires: []
provides:
  - "pipeline/ package scaffold (npm run build:data, npm test)"
  - "resolveConfig() — configurable Stellaris install path (CLI/env/default), fail-loud validation"
  - "parseClausewitzFile() / normalizeToArray() — verified jomini wrap+buffer parser wrapper"
  - "loadScriptedVariables() / resolveValue() — @scripted_variable resolution to concrete numbers"
  - "detectGameVersion() — auto version detection from launcher-settings.json"
  - "TechSnapshotSchema / TechSnapshot / Tech — frozen Zod schema, the pipeline/frontend contract"
  - "runAssemble() — orchestrator producing data/v{version}/tech.json end-to-end"
affects: ["01-02", "01-03", "01-04", "01-05", "phase-02-tech-tree-visualization"]

# Tech tracking
tech-stack:
  added: ["jomini@0.10.0", "zod@4.4.3", "sharp@0.35.3 (installed, unused until Plan 04)", "vitest@4.1.10", "tsx", "typescript@5.9.3"]
  patterns:
    - "jomini __root__ wrap + Buffer/latin1 decode + windows1252 parse (Pitfall 1 fix) — mandatory for every Clausewitz file read in this pipeline"
    - "normalizeToArray() applied to every jomini field that can legitimately repeat (category, prerequisites, weight_modifier.modifier)"
    - "Zod validate-before-write gate (D-16): TechSnapshotSchema.parse() runs before any writeFileSync"
    - "Config literal confinement: the install-path default lives only in config.ts; every other module receives gameRoot as a parameter"
    - "pathToFileURL(process.argv[1]) for reliable ESM main-module detection under tsx on Windows"

key-files:
  created:
    - "pipeline/package.json"
    - "pipeline/tsconfig.json"
    - "pipeline/.gitignore"
    - "pipeline/src/config.ts"
    - "pipeline/src/parser/clausewitz.ts"
    - "pipeline/src/parser/scripted-variables.ts"
    - "pipeline/src/schema/tech-snapshot.ts"
    - "pipeline/src/version/detect.ts"
    - "pipeline/src/assemble.ts"
    - "pipeline/test/skeleton.test.ts"
  modified: []

key-decisions:
  - "unlocks.grants and unlocks.leadsTo are both required (non-optional, no Zod .default()) string arrays — a fixture missing either sub-field fails validation, per D-05 and the plan's explicit acceptance criteria"
  - "cost/weight block-form (Open Question 1 / Assumption A3) is defensively preserved via costRaw/weightModifierRaw when a plain object is encountered instead of a bare number/@variable, rather than crashing or silently coercing to 0 alone"
  - "TypeScript pinned to 5.9.3 (not 6.x) resolving the version drift RESEARCH.md flagged"

patterns-established:
  - "TDD RED/GREEN commit pairs for every task with a `<behavior>` block, verified in git log"
  - "Every parsed Clausewitz field that can repeat is normalized via normalizeToArray immediately after parsing, never accessed as a bare object/array ambiguously"

requirements-completed: [DATA-01, DATA-02, DATA-05]

# Metrics
duration: 55min
completed: 2026-07-07
---

# Phase 1 Plan 1: Walking Skeleton Summary

**Single-command pipeline (`npm run build:data`) parses `00_phys_tech.txt` from the real Stellaris 4.5.0 install, resolves `@scripted_variable` cost/weight references to concrete numbers via jomini's verified wrap+buffer parser fix, validates against a frozen Zod schema, and writes `data/v4.5.0/tech.json` with 69 real tech records.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-07T22:45:06Z (session start per STATE.md)
- **Completed:** 2026-07-07T23:41:55Z
- **Tasks:** 3
- **Files modified:** 10 created (pipeline/package.json, tsconfig.json, .gitignore, src/config.ts, src/parser/clausewitz.ts, src/parser/scripted-variables.ts, src/schema/tech-snapshot.ts, src/version/detect.ts, src/assemble.ts, test/skeleton.test.ts)

## Accomplishments

- Proved the entire parse → resolve → assemble → validate → write pipeline end-to-end on a real, narrow slice (69 techs from one file), not a toy/mocked fixture
- Verified jomini's `__root__` wrap + Buffer/latin1 preprocessing fix from RESEARCH.md against the two real problem files (`00_repeatable.txt` BOM-only, `01_scripted_variables_jobs.txt` tab-adjacent `@var`) — both parse cleanly
- Froze the `TechSnapshotSchema` contract with `unlocks.{grants,leadsTo}` both present and required from the start, so Plans 02/05 can fill real data with zero breaking schema revisions
- Confirmed `@scripted_variable` resolution works on real data: `tech_basic_science_lab_2.cost` resolved from `@tier1cost3` to `1500`, `.weight` from `@tier1weight3` to `90`
- Confirmed jomini's duplicate-key auto-arraying preserves `weight_modifier.modifier` as an array without any custom multimap code (per RESEARCH.md's verified finding)

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold the pipeline package and configurable install path** - `2b417fa` (feat)
2. **Task 2: Clausewitz parser wrapper + scripted-variable resolver (TDD)** - `5c2ba0e` (test/RED), `ed1ad9c` (feat/GREEN)
3. **Task 3: Zod schema contract + version detect + walking-skeleton assembler (TDD)** - `a246928` (test/RED), `0840563` (feat/GREEN)

_No REFACTOR commits were needed — GREEN-phase code required no cleanup pass._

## Files Created/Modified

- `pipeline/package.json` - type:module package, build:data (tsx)/test (vitest) scripts, jomini/sharp/zod deps
- `pipeline/tsconfig.json` - ES2022/NodeNext, strict mode
- `pipeline/.gitignore` - excludes node_modules/, dist/, data/ (generated output)
- `pipeline/src/config.ts` - resolveConfig(): CLI `--game-root` > `STELLARIS_INSTALL_PATH` env > default; fail-loud on missing path or missing launcher-settings.json
- `pipeline/src/parser/clausewitz.ts` - parseClausewitzFile() (jomini singleton + wrap + buffer parse), normalizeToArray()
- `pipeline/src/parser/scripted-variables.ts` - loadScriptedVariables() (2691-entry @name->number map), resolveValue() (passthrough/lookup/inline-math-detect/unresolved-throw)
- `pipeline/src/schema/tech-snapshot.ts` - TechSnapshotSchema/TechSnapshot/Tech — the frozen pipeline/frontend contract
- `pipeline/src/version/detect.ts` - detectGameVersion() reads rawVersion from launcher-settings.json
- `pipeline/src/assemble.ts` - orchestrator: config -> version -> scripted vars -> parse 00_phys_tech.txt -> extract -> validate -> write
- `pipeline/test/skeleton.test.ts` - 15 tests covering parser, normalizeToArray, scripted-variables, version detect, schema unlocks shape, and full e2e assemble

## Decisions Made

- `unlocks.grants`/`unlocks.leadsTo` implemented as required (non-defaulted) Zod array fields rather than `.default([])`, so a fixture omitting either sub-field fails validation — this matches the plan's explicit acceptance criteria more strictly than an initial draft that used Zod defaults (caught during Task 3 GREEN and fixed before commit).
- Pinned TypeScript to 5.9.3 explicitly (RESEARCH.md flagged 5.x/6.x drift) rather than letting npm resolve to 6.x latest.
- `cost`/`weight` extraction defensively branches on `isPlainObject()` to preserve `costRaw`/`weightModifierRaw` for the documented-but-unobserved block form (Open Question 1), rather than only handling the observed bare-number/@variable shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tsconfig.json `rootDir: "src"` conflicted with `test/**/*.ts` include, breaking `tsc --noEmit`**
- **Found during:** Task 2 verification (after GREEN implementation, before commit)
- **Issue:** `tsconfig.json` set both `"rootDir": "src"` and `"include": ["src/**/*.ts", "test/**/*.ts"]`, which TypeScript rejects (TS6059) since test files fall outside `rootDir`.
- **Fix:** Removed the `rootDir` compiler option; `outDir` alone is sufficient for this project's needs since it isn't being distributed as a library with a strict source-root contract.
- **Files modified:** pipeline/tsconfig.json
- **Verification:** `npx tsc --noEmit` passes cleanly; re-ran full vitest suite to confirm no regression.
- **Committed in:** ed1ad9c (Task 2 GREEN commit)

**2. [Rule 1 - Bug] TechSnapshotSchema's `unlocks.grants`/`unlocks.leadsTo` used `.default([])`, which silently passed validation when a sub-field was omitted**
- **Found during:** Task 3 GREEN — a test asserting "fails validation when unlocks is missing the leadsTo sub-field" failed because Zod's `.default()` fills in a missing key rather than rejecting it.
- **Issue:** Contradicted the plan's explicit acceptance criteria: "a fixture missing either sub-field fails Zod validation."
- **Fix:** Removed `.default([])` from both fields in `UnlocksSchema`, making them strictly required.
- **Files modified:** pipeline/src/schema/tech-snapshot.ts
- **Verification:** Re-ran vitest — the previously-failing test now passes; all 15 tests green.
- **Committed in:** 0840563 (Task 3 GREEN commit)

**3. [Rule 1 - Bug] `isMainModule` CLI-entrypoint detection never matched under tsx on Windows, so `npm run build:data` silently did nothing**
- **Found during:** Task 3 — running the plan's exact `npm run build:data && test -f data/v4.5.0/tech.json` verification command produced no file (the script exited 0 having done nothing, because `runAssemble()` was only invoked in tests, not via the CLI entrypoint).
- **Issue:** The initial entrypoint guard compared `import.meta.url` (which uses `file:///C:/...`, three slashes plus forward slashes) against a hand-built string from `process.argv[1]` (`C:\Projects\...`, backslashes) via a naive `.replace(/\\/g, "/")` — the resulting string never matched Node's actual `file://` URL format (missing the third slash for the drive-letter path), so the guard was always false.
- **Fix:** Replaced the manual string-munging with `pathToFileURL(process.argv[1]).href`, which Node's own `node:url` module produces correctly for any platform.
- **Files modified:** pipeline/src/assemble.ts
- **Verification:** `rm -rf data && npm run build:data` now prints the two expected console lines and writes `data/v4.5.0/tech.json`; the plan's exact e2e verification command (`npm run build:data && test -f ... && node -e "..."`) returns `SKELETON_E2E_OK`.
- **Committed in:** 0840563 (Task 3 GREEN commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - bugs found and fixed during verification, before the task commit)
**Impact on plan:** All three fixes were necessary for the plan's own stated verification commands and acceptance criteria to pass. No scope creep — no new files, no architectural changes.

## Issues Encountered

- jomini's actual installed API (`parseText(data, options?: Partial<ParseOptions>)`) takes an options object (`{ encoding: "windows1252" }`), not the bare string `'windows1252'` shown in RESEARCH.md's code example. Confirmed by reading `node_modules/jomini/dist/types/jomini.d.ts` directly and adjusted the wrapper accordingly — functionally identical result, just a different call signature from the research doc's snippet (likely written against a slightly different jomini minor version's TS overload).

## User Setup Required

None - no external service configuration required. `npm install` inside `pipeline/` completed cleanly with 0 vulnerabilities; ImageMagick (needed only from Plan 04 onward) is already confirmed installed per RESEARCH.md.

## Next Phase Readiness

- The `TechSnapshotSchema` contract is frozen and ready for Plan 02 (full 33-file extraction, DLC classification, prerequisite DAG / real `leadsTo` edges) to build against without any breaking schema changes.
- `parseClausewitzFile`, `normalizeToArray`, `loadScriptedVariables`, and `resolveValue` are all directly reusable by Plan 02's wider extraction without modification.
- No blockers. The one open item carried forward per RESEARCH.md Open Question 1 (block-form `cost`/`weight`) is defensively handled (`costRaw`/`weightModifierRaw` preserved) but not yet observed in the single file parsed this plan — Plan 02's full 33-file pass should confirm whether any real tech actually uses the block form.

---
*Phase: 01-data-pipeline*
*Completed: 2026-07-07*

## Self-Check: PASSED

All 10 created files verified present on disk. All 6 referenced commit hashes (2b417fa, 5c2ba0e, ed1ad9c, a246928, 0840563, 32d65ce) verified present in `git log --oneline --all`.
